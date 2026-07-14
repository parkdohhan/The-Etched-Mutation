// record-contamination — R6-1 (2026-07-14): 회차 봉인 시 memories.cont_* 영속화.
//
// 배경 (docs/점검/R2_수리보고-260714.md R2-3b):
//   봉인 시 ContaminationTracker 가 계산한 오염 상태는 브라우저 변수(game.contState)에만
//   있다가 창을 닫으면 사라졌다. play-test 가 anon 키로 memories 를 직접 UPDATE 하려 했으나
//   RLS 가 401 로 막았다(실측). 명세 contamination_mvp_spec_v3 §14-7 이 4개월째 비워둔 자리.
//
//   memories RLS = admin/curator 만 UPDATE. 익명 관객은 영원히 못 쓴다. 그러므로 유일한 길은
//   service_role 로 쓰는 Edge Function 경유다 (record-drift-cumulative 와 같은 패턴).
//
// 방어 (R3-2 판례 그대로 — verify_jwt=false 는 익명 관객 경로라 켤 수 없다. 실질 방어는 본문 검증):
//   ① 요청 본문 크기 상한
//   ② memoryId UUID 형식
//   ③ 그 기억에 최근 180분 내 plays 행 존재 (플레이 없이 오염만 밀어넣는 호출 차단)
//   ④ 허용 컬럼 화이트리스트만 통과 — 본문의 다른 키는 무시(거부 아님). 값 범위·어휘 검증
//   ⑤ cont_depth 단조 증가 — 저장값보다 낮은 depth 는 기록하되 **낮추지 않는다**(max 보존)
//
// ─── ⑤ 에 대한 설계 정정 (핸드아웃 전제 ≠ 실측) ────────────────────────────────
// 핸드아웃 R6-1 은 "요청 depth < 기존 depth 면 403" 을 지시했다. 그대로 넣으면
// **상영작 3편 중 2편의 오염이 영구히 저장 불가**가 된다. 실측:
//
//   | 기억         | memories.cont_depth | play-test 가 보내는 depth |
//   |--------------|---------------------|---------------------------|
//   | 당신에게      | 30                  | 4  (관객 판 3건 + 이번 1)  |
//   | 엘리베이터에서 | 8                   | 1  (관객 판 0건 + 이번 1)  |
//   | 발자국        | 0                   | 9                         |
//
// 두 수가 다른 이유는 버그가 아니라 결정이다. play-test.html 은 상영작의 깊이를
// "전시장에서 실제로 지나간 관객"(persona_id 없음 + DEMO_EPOCH 이후)만으로 센다
// (2026-07-09 결정, play-test.html:4617-4632 · 4789-4803). DB 의 30/8 은 AI 페르소나
// 193판이 섞인 값이고, 그걸 "앞사람의 흔적"으로 내보이면 작품이 주장하는 변형이
// 실재가 아니라 연출이 된다 — 그래서 세지 않기로 했다.
//
// 즉 두 값은 **서로 다른 좌표계**다. 403 으로 거부하면 정상 관객이 막히고, 클라이언트 값을
// 그대로 쓰면 레거시 30 이 4 로 깎인다(파괴적 · 되돌릴 수 없음).
//
// 그래서 거부도 덮어쓰기도 아닌 **max(기존, 요청)**: depth 는 절대 내려가지 않으므로
// 핸드아웃이 막으려던 "오염 리셋 공격"은 그대로 차단되고, 정상 관객도 막히지 않으며,
// 레거시 값도 파괴되지 않는다. 인플레이션은 별도로 막는다(요청 depth ≤ 전체 plays 수 + 1).
//
// 배포: supabase functions deploy record-contamination --no-verify-jwt
//   (MCP 배포가 verify_jwt 를 true 로 켜면 CLI 로 복원할 것 — R3-2 판례)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

// ─── 방어 상수 ────────────────────────────────────────────────────
const MAX_BODY_BYTES = 8192;          // cont_* 26개 + uuid → 실사용 1KB 미만. 넉넉히 8KB.
const RECENT_PLAY_WINDOW_MIN = 180;   // record-drift-cumulative 와 동일 창
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 누적 합계 상한 — lifetime_* 와 Welford M2 는 depth 만큼 누적된다(신호 ≤ 1.0/회).
// depth 는 plays 수로 이미 묶여 있으므로 이 상한은 쓰레기 페이로드 차단용 안전망이다.
const MAX_LIFETIME = 100000;

// ─── 컬럼 화이트리스트 (js/core/ContaminationTracker.js createEmptyState 와 1:1) ───
// DB 실측(information_schema)으로 26개 컬럼 전부 존재함을 확인했다.
// 본문에 이 목록 밖의 키가 오면 **무시**한다(거부 아님 — R3-2 판례: 거부는 정상 회차를 깬다).

// [0,1] 유한수
const UNIT_KEYS = [
  'cont_drift', 'cont_fixation',
  'cont_divergence', 'cont_convergence', 'cont_heterogeneity',
  'cont_stage_1', 'cont_stage_2', 'cont_stage_3',
  'cont_last_alignment', 'cont_last_level', 'cont_last_shape',
  '_cont_align_mean',   // Welford 온라인 평균 — alignment 의 평균이므로 [0,1]
] as const;

// [-1,1] 유한수 (VAD 방향)
const SIGNED_UNIT_KEYS = ['drift_dir_v', 'drift_dir_a', 'drift_dir_d'] as const;

// [0, MAX_LIFETIME] 유한수 (단조 누적)
const NONNEG_SUM_KEYS = [
  'lifetime_drift_sum', 'lifetime_fix_sum',
  '_cont_align_m2',     // Welford M2 = 편차 제곱합 — 음수 불가, 1 을 넘을 수 있다
] as const;

// [-MAX_LIFETIME, MAX_LIFETIME] 유한수 (부호 있는 누적)
const SIGNED_SUM_KEYS = [
  'lifetime_dir_v_sum', 'lifetime_dir_a_sum', 'lifetime_dir_d_sum',
] as const;

// 어휘 화이트리스트
const ALLOWED_STAGES = ['stable', 'biased_inclination', 'inclination', 'hypercompletion'];
const ALLOWED_PATTERNS = [
  'echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation',
];
const ALLOWED_MISMATCHES = [
  'emotion_mismatch', 'attribution_mismatch', 'target_displacement',
  'void_mismatch', 'vague', 'none',
];

interface RequestBody {
  memoryId: string;
  contState: Record<string, unknown>;
}

/**
 * 화이트리스트 컬럼만 골라 UPDATE 행을 조립한다.
 * 값이 규칙을 어기면 **그 컬럼을 버린다**(전체 거부 아님) — 단, 결정적으로 위험한
 * cont_depth 만 별도로 다룬다(호출부 참조).
 *
 * @returns { row, rejected } — row 는 저장할 컬럼, rejected 는 버린 컬럼(로그용)
 */
function buildContRow(src: Record<string, unknown>): {
  row: Record<string, unknown>;
  rejected: string[];
} {
  const row: Record<string, unknown> = {};
  const rejected: string[] = [];

  const num = (k: string): number | null => {
    const v = src[k];
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return v;
  };

  for (const k of UNIT_KEYS) {
    if (!(k in src)) continue;
    const v = num(k);
    if (v === null || v < 0 || v > 1) { rejected.push(k); continue; }
    row[k] = v;
  }

  for (const k of SIGNED_UNIT_KEYS) {
    if (!(k in src)) continue;
    const v = num(k);
    if (v === null || v < -1 || v > 1) { rejected.push(k); continue; }
    row[k] = v;
  }

  for (const k of NONNEG_SUM_KEYS) {
    if (!(k in src)) continue;
    const v = num(k);
    if (v === null || v < 0 || v > MAX_LIFETIME) { rejected.push(k); continue; }
    row[k] = v;
  }

  for (const k of SIGNED_SUM_KEYS) {
    if (!(k in src)) continue;
    const v = num(k);
    if (v === null || Math.abs(v) > MAX_LIFETIME) { rejected.push(k); continue; }
    row[k] = v;
  }

  if ('cont_stage' in src) {
    const v = String(src.cont_stage);
    if (ALLOWED_STAGES.includes(v)) row.cont_stage = v;
    else rejected.push('cont_stage');
  }
  if ('cont_last_pattern' in src) {
    const v = String(src.cont_last_pattern);
    if (ALLOWED_PATTERNS.includes(v)) row.cont_last_pattern = v;
    else rejected.push('cont_last_pattern');
  }
  if ('cont_last_mismatch' in src) {
    const v = String(src.cont_last_mismatch);
    if (ALLOWED_MISMATCHES.includes(v)) row.cont_last_mismatch = v;
    else rejected.push('cont_last_mismatch');
  }

  // cont_last_updated 는 클라이언트 값을 쓰지 않는다 — 브라우저 시계는 신뢰 대상이 아니고,
  // "언제 오염됐는가"는 서버가 아는 사실이다.
  row.cont_last_updated = new Date().toISOString();

  return { row, rejected };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── ①: 본문 크기 상한 ────────────────────────────────────
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: "body too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── ②: memoryId UUID ─────────────────────────────────────
  if (!body.memoryId || typeof body.memoryId !== 'string' || !UUID_RX.test(body.memoryId)) {
    return new Response(JSON.stringify({ ok: false, error: "memoryId must be a uuid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.contState || typeof body.contState !== 'object' || Array.isArray(body.contState)) {
    return new Response(JSON.stringify({ ok: false, error: "contState must be an object" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Service-role client (RLS 우회) ───────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[record-contamination] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ ok: false, error: "service config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ─── 기존 행 (depth 단조 가드의 기준) ─────────────────────
  const { data: memRow, error: selErr } = await sb
    .from('memories')
    .select('id, cont_depth')
    .eq('id', body.memoryId)
    .maybeSingle();

  if (selErr) {
    console.error("[record-contamination] select failed:", selErr);
    return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!memRow) {
    return new Response(JSON.stringify({ ok: false, error: "memory not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── ③: 그 기억을 실제로 플레이한 회차인가 ────────────────
  const since = new Date(Date.now() - RECENT_PLAY_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: recentPlays, error: playErr } = await sb
    .from('plays')
    .select('id', { count: 'exact', head: true })
    .eq('memory_id', body.memoryId)
    .gte('created_at', since);

  if (playErr) {
    console.error("[record-contamination] play check failed:", playErr);
    return new Response(JSON.stringify({ ok: false, error: playErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!recentPlays || recentPlays === 0) {
    console.warn(`[record-contamination] no recent play for memory ${body.memoryId} — rejected`);
    return new Response(JSON.stringify({ ok: false, error: "no recent play for this memory" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── ④: 화이트리스트 컬럼만 조립 ──────────────────────────
  const { row, rejected } = buildContRow(body.contState as Record<string, unknown>);

  // ─── ⑤: cont_depth — 인플레이션 차단 + 단조 증가 ──────────
  // 인플레이션: depth 는 "이 기억을 통과한 판의 수"이므로 plays 행 수를 넘을 수 없다.
  //             (+1 은 이번 회차 — 봉인이 plays INSERT 보다 먼저 도달할 수 있다.)
  const { count: totalPlays } = await sb
    .from('plays')
    .select('id', { count: 'exact', head: true })
    .eq('memory_id', body.memoryId);

  const storedDepth = Number(memRow.cont_depth) || 0;
  const rawDepth = (body.contState as Record<string, unknown>).cont_depth;
  let depthNote = 'absent';

  if (rawDepth !== undefined) {
    const d = Number(rawDepth);
    if (!Number.isInteger(d) || d < 0) {
      return new Response(JSON.stringify({ ok: false, error: "cont_depth must be a non-negative integer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ceiling = (totalPlays || 0) + 1;
    if (d > ceiling) {
      console.warn(`[record-contamination] depth inflation: ${d} > plays ${ceiling}`);
      return new Response(JSON.stringify({ ok: false, error: `cont_depth ${d} exceeds play count ${ceiling}` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // 단조: 절대 내려가지 않는다. 좌표계가 달라 낮은 값이 정상적으로 올 수 있으므로(헤더 주석)
    // 403 이 아니라 max 로 보존한다 — 리셋 공격은 여기서 무력화된다.
    const nextDepth = Math.max(storedDepth, d);
    row.cont_depth = nextDepth;
    depthNote = (d < storedDepth)
      ? `kept ${storedDepth} (request ${d} lower — visitor-count coordinate)`
      : `${storedDepth} → ${nextDepth}`;
  }

  if (Object.keys(row).length <= 1) {  // cont_last_updated 만 남은 경우
    return new Response(JSON.stringify({ ok: false, error: "no valid contamination columns", rejected }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── UPDATE (화이트리스트 컬럼만) ─────────────────────────
  const { error: updErr } = await sb
    .from('memories')
    .update(row)
    .eq('id', body.memoryId);

  if (updErr) {
    console.error("[record-contamination] update failed:", updErr);
    return new Response(JSON.stringify({ ok: false, error: updErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (rejected.length) {
    console.warn(`[record-contamination] dropped out-of-range columns:`, rejected);
  }
  console.log(`[record-contamination] memory ${body.memoryId} updated — depth ${depthNote}, `
    + `${Object.keys(row).length} columns, stage=${row.cont_stage ?? '(unchanged)'}`);

  return new Response(JSON.stringify({
    ok: true,
    written: Object.keys(row).length,
    cont_depth: row.cont_depth ?? storedDepth,
    rejected,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
