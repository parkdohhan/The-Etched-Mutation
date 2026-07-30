// record-contact — 이본 지층 W2-3 (2026-07-16): 유령과 겹친 드문 순간을 접촉 사건으로 기록.
//
// 배경 (docs/이본지층/이본지층_설계_v1-260716.md 결정 3·4):
//   기존 이름-드러남(턴 코사인 ≥0.85)을 "접촉 사건"으로 승격. 회차당 최대 1회.
//   "해냈다"가 아니라 "일어났다"의 언어. trajectory_bridges 를 접촉 기록으로 전용(轉用) —
//   접촉 순간의 발화·씬을 status='contact' 행에 저장(admin 의 'live' 필터와 충돌 없음). 정본화 없음.
//   trajectory_bridges RLS = 익명 관객 직접 쓰기 불가 → service_role Edge 경유.
//
// 방어:
//   ① 본문 크기 상한
//   ② memoryId·sceneId UUID 2종 + scene 이 그 memory 소속 + 그 기억 최근 180분 plays 존재
//   ③ utterance 500자 상한
//   ④ 회차 중복 차단: 같은 memoryId 로 30분 내 기존 contact 행 있으면 409
//      (회차당 1회 게이트의 서버측 보강 — 클라이언트가 두 번 눌러도 한 번만 기록)
//
// 스키마 실측 (2026-07-16 information_schema):
//   trajectory_bridges NOT NULL & default 없음 = memory_id, entry_emotion.
//   entry_emotion 은 접촉엔 감정 라벨이 없으므로 'contact' 로 채운다(합리적 기본값 — 정본화 아님을 표식).
//   key_passed_scenes default '{}', status default 'live' → status='contact' 명시.
//
// 배포: supabase functions deploy record-contact --no-verify-jwt
//   (익명 관객이 접촉 순간에 호출 → verify_jwt=false. MCP 가 true 로 켜면 CLI 로 복원 — R3-2 판례)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

const MAX_BODY_BYTES = 4096;          // uuid 2 + utterance 500 + turn → 실사용 <1KB. 넉넉히 4KB.
const RECENT_PLAY_WINDOW_MIN = 180;
const CONTACT_DEDUP_MIN = 30;         // 30분 내 같은 기억 접촉 1회 (회차당 1회 서버 보강)
const MAX_UTTERANCE_CHARS = 500;
const MAX_TURN = 10000;               // 대화 턴 번호 상한 (쓰레기 값 차단)
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
  memoryId: string;
  sceneId: string;
  utterance: string;
  turn: number;
  runId?: string | null;   // 260728: 회차 식별자 (선택 — 없으면 시간창 폴백)
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405, corsHeaders);

  // ─── ①: 본문 크기 상한 ───────────────────────────────────
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return jsonError("body too large", 413, corsHeaders);

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON body", 400, corsHeaders);
  }

  // ─── ②a: UUID 2종 ────────────────────────────────────────
  if (!body.memoryId || typeof body.memoryId !== "string" || !UUID_RX.test(body.memoryId)) {
    return jsonError("memoryId must be a uuid", 400, corsHeaders);
  }
  if (!body.sceneId || typeof body.sceneId !== "string" || !UUID_RX.test(body.sceneId)) {
    return jsonError("sceneId must be a uuid", 400, corsHeaders);
  }

  // ─── ③: utterance ────────────────────────────────────────
  if (typeof body.utterance !== "string" || body.utterance.trim().length === 0) {
    return jsonError("utterance must be a non-empty string", 400, corsHeaders);
  }
  const utterance = body.utterance.slice(0, MAX_UTTERANCE_CHARS);

  // ─── turn: 정수 ──────────────────────────────────────────
  let turn: number | null = null;
  if (body.turn !== undefined && body.turn !== null) {
    if (!Number.isInteger(body.turn) || body.turn < 0 || body.turn > MAX_TURN) {
      return jsonError("turn must be an integer in [0, 10000]", 400, corsHeaders);
    }
    turn = body.turn;
  }

  // ─── runId: 회차 식별자 (260728 신설, 선택) ───────────────
  // plays.run_id 와 같은 원천. 있으면 ④ 중복 판정을 **회차 단위**로 하고
  // trajectory_bridges.source_run_id 를 채운다 (접촉을 회차에 귀속 — 7-17 run_id 신설 목적).
  // 없으면 기존 memory_id 30분 창 폴백 (구형 클라이언트 하위호환).
  let runId: string | null = null;
  if (body.runId !== undefined && body.runId !== null) {
    if (typeof body.runId !== "string" || !UUID_RX.test(body.runId)) {
      return jsonError("runId must be a uuid when provided", 400, corsHeaders);
    }
    runId = body.runId;
  }

  // ─── Service-role client (RLS 우회) ──────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[record-contact] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return jsonError("service config missing", 500, corsHeaders);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ─── ②b: scene 이 그 memory 소속인가 ─────────────────────
  const { data: sceneRow, error: sceneErr } = await sb
    .from("scenes").select("id, memory_id").eq("id", body.sceneId).maybeSingle();
  if (sceneErr) {
    console.error("[record-contact] scene select failed:", sceneErr);
    return jsonError(sceneErr.message, 500, corsHeaders);
  }
  if (!sceneRow) return jsonError("scene not found", 404, corsHeaders);
  if (sceneRow.memory_id !== body.memoryId) {
    console.warn(`[record-contact] scene ${body.sceneId} not in memory ${body.memoryId}`);
    return jsonError("scene does not belong to this memory", 403, corsHeaders);
  }

  // ─── ②c: 그 기억 최근 plays 존재 ─────────────────────────
  const since = new Date(Date.now() - RECENT_PLAY_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: recentPlays, error: playErr } = await sb
    .from("plays").select("id", { count: "exact", head: true })
    .eq("memory_id", body.memoryId).gte("created_at", since);
  if (playErr) {
    console.error("[record-contact] play check failed:", playErr);
    return jsonError(playErr.message, 500, corsHeaders);
  }
  if (!recentPlays || recentPlays === 0) {
    console.warn(`[record-contact] no recent play for memory ${body.memoryId} — rejected`);
    return jsonError("no recent play for this memory", 403, corsHeaders);
  }

  // ─── ④: 회차당 접촉 1회 ──────────────────────────────────
  // 260728 수리: runId 가 오면 **그 회차**에 이미 접촉이 있는지만 본다.
  //   이전엔 runId 없이 memory_id + 30분 창으로만 판정해서, 같은 기억을 30분 안에
  //   두 사람이 플레이하면 뒷사람 접촉이 409 로 버려졌다 (주석은 "회차당 1회"였지만
  //   구현은 회차를 구분하지 않았다 — 알파 3명 연속 플레이에서 직접 유실되는 결함).
  //   runId 없으면 옛 시간창 폴백 유지.
  let dupQ = sb.from("trajectory_bridges").select("id", { count: "exact", head: true })
    .eq("memory_id", body.memoryId).eq("status", "contact");
  if (runId) {
    dupQ = dupQ.eq("source_run_id", runId);
  } else {
    dupQ = dupQ.gte("created_at", new Date(Date.now() - CONTACT_DEDUP_MIN * 60 * 1000).toISOString());
  }
  const { count: recentContacts, error: dupErr } = await dupQ;
  if (dupErr) {
    console.error("[record-contact] dedup check failed:", dupErr);
    return jsonError(dupErr.message, 500, corsHeaders);
  }
  if (recentContacts && recentContacts > 0) {
    console.warn(`[record-contact] duplicate contact — ${runId ? `run ${runId}` : `memory ${body.memoryId} within ${CONTACT_DEDUP_MIN}min`}`);
    return jsonError("contact already recorded for this run", 409, corsHeaders);
  }

  // ─── 쓰기: trajectory_bridges INSERT (status='contact') ──
  const { data: inserted, error: insErr } = await sb
    .from("trajectory_bridges").insert({
      memory_id: body.memoryId,
      scene_id: body.sceneId,
      entry_emotion: "contact",   // NOT NULL·default 없음 → 접촉 표식 기본값(정본화 아님)
      status: "contact",
      contact_utterance: utterance,
      contact_turn: turn,
      source_run_id: runId,       // 260728: 접촉을 회차에 귀속 (없으면 null — 구동작)
    }).select("id").maybeSingle();
  if (insErr) {
    console.error("[record-contact] insert failed:", insErr);
    return jsonError(insErr.message, 500, corsHeaders);
  }

  console.log(`[record-contact] contact recorded for memory ${body.memoryId} scene ${body.sceneId} turn ${turn}`);

  return new Response(JSON.stringify({ ok: true, id: inserted?.id ?? null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
