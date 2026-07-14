// record-drift-cumulative — V2-6 drift 픽 §6 (핸드아웃 H3): 회차 끝마다 memories.cumulative_emotion_vec EMA 갱신.
//
// 배경:
//   memories 테이블 RLS = admin only UPDATE. anon 플레이어 회차 끝에는 cumulative_emotion_vec 를 직접 못 건드림.
//   본 Edge function 이 service_role key 로 우회 (insert-ghost-variant 와 같은 패턴).
//   클라이언트 직접 UPDATE 금지 — 보안 + "두 번 손 안 감" (V2-6 핸드아웃 결정 6).
//
// 호출 경로 (H4 / H5 가 wiring):
//   - lumen 흐름: play-test.html 회차 끝 (sealBtn / exit-door) →
//                 _temSupabase.functions.invoke('record-drift-cumulative', { body: { memoryId, sessionEmotionVec } })
//   - archive 흐름: opening.js _handleOpeningSubmit 회차 끝 → 동일 invoke
//   drift / speciation 무관 — 회차 끝이면 항상 호출.
//
// 처리:
//   1. SELECT memories.cumulative_emotion_vec WHERE id = memoryId  (service_role)
//   2. next = updateCumulativeEmotionVec(prev, sessionEmotionVec, alpha)   // EMA: α·session + (1-α)·prev, >0.001 만 남김
//   3. UPDATE memories SET cumulative_emotion_vec = next WHERE id = memoryId
//   4. return { ok: true, cumulative: next }   (실패 시 { ok: false, error })
//
// EMA 로직 = js/core/ContaminationTracker.js updateCumulativeEmotionVec 의 TS 인라인 복제 (Edge 는 그 JS 못 import).
// 12축 키 = js/core/SeekerFingerprint.js EMOTION_KEYS 와 정합 유지 필수.
//
// 배포 (도한 님 손): supabase functions deploy record-drift-cumulative --no-verify-jwt
//   verify_jwt=false (anon 플레이어가 호출 — insert-ghost-variant 와 동일). LLM 없음 → temperature 무관, timeout 5s 이내.
//
// ─── 2026-07-14 R3-2 방어 (L3-01 🔴) ───────────────────────────────
// 문제: verify_jwt=false + 코드 내 검증 0 → anon key 만 있으면 아무나 아무 기억의
//       cumulative_emotion_vec 을 임의 값으로 오염 가능. 이 벡터는 pickDriftUtterance 의
//       글로벌 좁힘 입력이라, 오염되면 그 기억의 유령 발화 선택이 통째로 왜곡된다.
// 제약: 익명 관객이 회차 끝에 호출한다(play-test.html:5024) → verify_jwt 는 켤 수 없다.
// 대신 함수 내부 방어 4겹:
//   ① 요청 본문 크기 상한 (MAX_BODY_BYTES)
//   ② memoryId UUID 형식 + 그 기억에 최근 plays 행 존재 확인 (진짜 플레이한 회차만 통과)
//   ③ 감정 키 화이트리스트 = EMOTION_KEYS 12축. 그 외 키 거부. 값 [0,1] 범위 + 유한수
//   ④ 벡터 L2 norm 상한 (한 회차가 12축을 전부 1.0 으로 채워 밀어붙이는 것 차단)
// 위반 시 400. 정상 관객 플로우는 그대로 통과한다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

// js/core/SeekerFingerprint.js EMOTION_KEYS 와 정합 (12축 frozen 라벨)
const EMOTION_KEYS = [
  'fear', 'sadness', 'anger', 'joy', 'longing', 'guilt',
  'shame', 'numbness', 'isolation', 'relief', 'confusion', 'emptiness',
] as const;

// CONTAMINATION.EMA_ALPHA 와 동일 — 회차 끝 단위 누적 (cont_drift / cont_fixation 과 같은 척도)
const DEFAULT_EMA_ALPHA = 0.10;

// ─── R3-2 방어 상수 ───────────────────────────────────────────────
const MAX_BODY_BYTES = 4096;          // 12축 벡터 + uuid → 실사용 300B 미만. 넉넉히 4KB.
const MAX_VECTOR_KEYS = 40;           // 17축·22축 변형까지 통과. 그 이상은 쓰레기 페이로드.
const MAX_VECTOR_NORM = 3.0;          // 12축 전부 1.0 이면 norm=3.46. 정상 회차는 1.0 안팎.
// 그 기억에 최근 이 시간 안에 plays 행이 있어야 회차로 인정 (봉인 도장은 회차 끝 즉시 일어남)
const RECENT_PLAY_WINDOW_MIN = 180;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
  memoryId: string;
  sessionEmotionVec: Record<string, number>;
  alpha?: number;
}

/**
 * R3-2 ③④: 감정 벡터 검증.
 *
 * 화이트리스트는 EMOTION_KEYS(12축)다. 단 **12축 밖의 키는 거부가 아니라 무시**한다.
 * 이유: 씬의 감정 축 구성이 6/8/12/17축으로 갈려 있어(C1) 대화 경로 분석기가
 * 씬의 original_emotion 키를 그대로 되돌려준다 — moral_pain·grief 같은 키가 섞여 올 수 있다.
 * 거부하면 정상 회차가 깨진다. 그리고 아래 updateCumulativeEmotionVec 이 EMOTION_KEYS 만
 * 순회하므로 **DB 쓰기 표면은 이미 12축으로 닫혀 있다** — 모르는 키는 애초에 저장되지 않는다.
 *
 * 따라서 진짜 공격면은 "아는 12축에 말도 안 되는 값을 밀어넣는 것"이고, 그걸 막는다:
 *   - 값이 수(finite)가 아니면 거부
 *   - [0,1] 범위 밖이면 거부   ← 음수/거대값으로 누적 벡터를 밀어붙이는 것 차단
 *   - 12축 부분벡터의 L2 norm 상한 초과 시 거부
 *
 * @returns 거부 사유 문자열, 정상이면 null
 */
function validateEmotionVec(vec: Record<string, unknown>): string | null {
  const keys = Object.keys(vec);
  if (keys.length === 0) return "sessionEmotionVec is empty";
  if (keys.length > MAX_VECTOR_KEYS) return "too many keys";

  let known = 0;
  let sumSq = 0;
  for (const k of EMOTION_KEYS) {
    if (!(k in vec)) continue;
    known++;
    const v = vec[k];
    if (typeof v !== 'number' || !isFinite(v)) return `non-numeric value for ${k}`;
    if (v < 0 || v > 1) return `value out of range [0,1] for ${k}`;
    sumSq += v * v;
  }
  if (known === 0) return "no known emotion axis in sessionEmotionVec";
  if (Math.sqrt(sumSq) > MAX_VECTOR_NORM) return "vector norm too large";
  return null;
}

/**
 * 회차 끝 fingerprint emotion_vec 를 메모리의 lifetime 누적 벡터에 EMA 로 합친다.
 * (js/core/ContaminationTracker.js updateCumulativeEmotionVec 의 TS 인라인 복제 — 입력 mutate 안 함.)
 */
function updateCumulativeEmotionVec(
  cumulative: Record<string, number> | null | undefined,
  sessionEmotionVec: Record<string, number> | null | undefined,
  alpha: number,
): Record<string, number> {
  const a = (typeof alpha === 'number' && isFinite(alpha)) ? alpha : DEFAULT_EMA_ALPHA;
  const next: Record<string, number> = { ...(cumulative || {}) };
  const src = sessionEmotionVec || {};
  for (const k of EMOTION_KEYS) {
    const prev = Number(next[k]) || 0;
    const curr = Number(src[k]) || 0;
    const merged = a * curr + (1 - a) * prev;
    if (merged > 0.001) next[k] = Number(merged.toFixed(4));
    else delete next[k];
  }
  return next;
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

  // ─── R3-2 ①: 요청 본문 크기 상한 ─────────────────────────
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

  // ─── Validation ───────────────────────────────────────────
  if (!body.memoryId || typeof body.memoryId !== 'string' || !UUID_RX.test(body.memoryId)) {
    return new Response(JSON.stringify({ ok: false, error: "memoryId must be a uuid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.sessionEmotionVec || typeof body.sessionEmotionVec !== 'object' || Array.isArray(body.sessionEmotionVec)) {
    return new Response(JSON.stringify({ ok: false, error: "sessionEmotionVec must be an object" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── R3-2 ③④: 감정 벡터 화이트리스트 + 범위 + norm ──────
  const vecErr = validateEmotionVec(body.sessionEmotionVec as Record<string, unknown>);
  if (vecErr) {
    console.warn("[record-drift-cumulative] rejected vector:", vecErr);
    return new Response(JSON.stringify({ ok: false, error: `invalid sessionEmotionVec: ${vecErr}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const alpha = (typeof body.alpha === 'number' && isFinite(body.alpha) && body.alpha > 0 && body.alpha <= 1)
    ? body.alpha
    : DEFAULT_EMA_ALPHA;

  // ─── Service-role client (RLS 우회) ───────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[record-drift-cumulative] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ ok: false, error: "service config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ─── 1. SELECT prior cumulative ───────────────────────────
  const { data: memRow, error: selErr } = await sb
    .from('memories')
    .select('id, cumulative_emotion_vec')
    .eq('id', body.memoryId)
    .maybeSingle();

  if (selErr) {
    console.error("[record-drift-cumulative] select failed:", selErr);
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

  // ─── R3-2 ②: 그 기억을 실제로 플레이한 회차인가 ──────────
  // 회차 끝 도장은 plays INSERT 직후에 일어난다. 최근 창 안에 그 기억의 plays 행이
  // 하나도 없으면 = 플레이 없이 벡터만 밀어넣는 호출 → 거부.
  const since = new Date(Date.now() - RECENT_PLAY_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: recentPlays, error: playErr } = await sb
    .from('plays')
    .select('id', { count: 'exact', head: true })
    .eq('memory_id', body.memoryId)
    .gte('created_at', since);

  if (playErr) {
    console.error("[record-drift-cumulative] play check failed:", playErr);
    return new Response(JSON.stringify({ ok: false, error: playErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!recentPlays || recentPlays === 0) {
    console.warn(`[record-drift-cumulative] no recent play for memory ${body.memoryId} — rejected`);
    return new Response(JSON.stringify({ ok: false, error: "no recent play for this memory" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prev = (memRow.cumulative_emotion_vec && typeof memRow.cumulative_emotion_vec === 'object')
    ? memRow.cumulative_emotion_vec as Record<string, number>
    : {};

  // ─── 2. EMA merge ─────────────────────────────────────────
  const next = updateCumulativeEmotionVec(prev, body.sessionEmotionVec, alpha);

  // ─── 3. UPDATE (cumulative_emotion_vec 만) ────────────────
  const { error: updErr } = await sb
    .from('memories')
    .update({ cumulative_emotion_vec: next })
    .eq('id', body.memoryId);

  if (updErr) {
    console.error("[record-drift-cumulative] update failed:", updErr);
    return new Response(JSON.stringify({ ok: false, error: updErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[record-drift-cumulative] memory ${body.memoryId} cumulative updated (α=${alpha}):`, next);

  return new Response(JSON.stringify({ ok: true, cumulative: next }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
