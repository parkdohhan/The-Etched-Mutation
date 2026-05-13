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

interface RequestBody {
  memoryId: string;
  sessionEmotionVec: Record<string, number>;
  alpha?: number;
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

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Validation ───────────────────────────────────────────
  if (!body.memoryId || typeof body.memoryId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: "memoryId required" }), {
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
