// contaminate-text/index.ts — Claude API로 오염 텍스트 생성
// 오염 상태(stage + band + drift 방향)에 따라 원본 텍스트를 변형
//
// 두 가지 호출 모드:
//   Legacy (admin): { text, stage: 1|2|3, direction, fixation }
//   V2 (play):      { text, contamination: { cont_stage, cont_drift, cont_fixation, drift_dir_v/a/d, band } }
//
// ─── R6-2 (2026-07-14): 선택적 서버 저장 persist ────────────────────────────
// play-test 의 백그라운드 생성기는 익명 관객 세션에서 돈다. scenes RLS 는 admin/curator 만
// UPDATE 를 허용하므로 익명 클라이언트가 결과를 저장할 수 없다 — 실측: 익명 PATCH 는
// **HTTP 200 인데 0행**(에러조차 없는 조용한 차단. R3-N1 이 지적한 침묵 실패와 같은 패턴).
// 그래서 body.persist = { sceneId, memoryId } 가 오면 생성 직후 서버가 service_role 로 직접 쓴다.
//
// 저장 방어 4겹:
//   ① sceneId·memoryId UUID 형식
//   ② scene 이 실제로 그 memory 소속인지 (남의 씬에 쓰기 차단)
//   ③ 그 기억에 최근 180분 내 plays 행 존재 (플레이 없이 텍스트만 밀어넣는 호출 차단)
//   ④ **이미 값이 있으면 덮어쓰기 금지** — 작가가 집필한 판본을 AI 생성물이 덮는 것을 막는다
// juxtaposition 모드는 persist 를 거부한다 (아래 KNOWN BUG 주석 참조).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

// ─── Language detection ──────────────────────────────────────────

function detectLang(text: string): "ko" | "en" {
  return /[가-힣]/.test(text) ? "ko" : "en";
}

// ─── VAD direction → qualitative description ─────────────────────

function describeVADDirection(v: number, a: number, d: number, lang: "ko" | "en"): string {
  // Dominant axis
  const absV = Math.abs(v), absA = Math.abs(a), absD = Math.abs(d);

  if (lang === "ko") {
    const parts: string[] = [];
    if (absV > 0.2) parts.push(v < 0 ? "부정적이고 어두운" : "긍정적이고 밝은");
    if (absA > 0.2) parts.push(a > 0 ? "긴장되고 고조된" : "가라앉고 무기력한");
    if (absD > 0.2) parts.push(d < 0 ? "무력하고 압도당하는" : "통제적이고 단정적인");
    return parts.length ? parts.join(", ") + " 방향" : "중립적인 방향";
  } else {
    const parts: string[] = [];
    if (absV > 0.2) parts.push(v < 0 ? "darker, more negative" : "brighter, more positive");
    if (absA > 0.2) parts.push(a > 0 ? "tenser, more agitated" : "flatter, more withdrawn");
    if (absD > 0.2) parts.push(d < 0 ? "more helpless, overwhelmed" : "more controlling, certain");
    return parts.length ? parts.join(", ") : "neutral";
  }
}

// ─── System prompt ───────────────────────────────────────────────

function buildSystemPrompt(lang: "ko" | "en"): string {
  if (lang === "ko") {
    return `너는 기억의 오염 과정이다. 텍스트를 다시 쓰는 것이 아니라, 기억이 반복 회상되면서 자연스럽게 변질되는 과정 그 자체다.

규칙:
- 원문의 문장 구조가 반드시 알아볼 수 있어야 한다
- 전체 내용의 20~40%만 변형하라. 그 이상은 절대 안 된다
- 설명, 메타코멘터리, 따옴표를 추가하지 마라
- 결과물은 하나의 자연스러운 (비록 왜곡된) 기억 문장이어야 한다
- 변형된 텍스트만 출력하라. 다른 것은 아무것도 출력하지 마라`;
  }
  return `You are a memory contamination process. You are NOT rewriting text — you are the distortion that happens when a memory is replayed too many times.

Rules:
- The original sentence structure MUST remain recognizable
- Transform 20-40% of the content, never more
- Never add explanations, metacommentary, or quotes around changes
- The result must read as a single coherent (if distorted) memory, not as "AI output"
- Output ONLY the transformed text, nothing else`;
}

// ─── R3-2 입력 상한 (2026-07-14) ──────────────────────────────────
// verify_jwt=false 공개 엔드포인트 → 호출 1건 = Anthropic 크레딧. 익명 관객 플로우는
// 살려야 하므로 차단 대신 입력을 좁힌다. 실사용 씬 텍스트는 길어야 수백 자.
const MAX_BODY_BYTES = 8192;
const MAX_TEXT_CHARS = 2000;
// 이 함수가 프롬프트 분기를 가진 stage 만 허용. 'inclination' 은 레거시 표기(f2bce54 normalizeStage 대상),
// 'stable' 은 무해 통과(호출부가 보내지 않지만 막으면 깨질 여지).
const ALLOWED_STAGES = ["biased_inclination", "inclination", "hypercompletion", "juxtaposition", "stable"];
const ALLOWED_BANDS = ["weak", "medium", "strong"];

// ─── R6-2 저장 상수 ───────────────────────────────────────────────
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_PLAY_WINDOW_MIN = 180;   // record-drift-cumulative / record-contamination 과 동일 창
const PERSISTABLE_KEYS = ["text_stage_1", "text_stage_2", "text_stage_3"];

/**
 * 생성된 판본을 scenes 에 저장한다 (service_role — RLS 우회).
 * 실패해도 생성 결과는 반환한다 (저장은 다음 관객용 연료지 이번 회차 화면이 아니다).
 *
 * @returns 저장 결과 요약 — 호출부가 응답에 실어 보낸다 (조용한 실패 금지)
 */
async function persistStageText(
  persist: { sceneId?: unknown; memoryId?: unknown },
  key: string,
  value: string,
): Promise<{ ok: boolean; reason?: string; key?: string }> {
  const sceneId = String(persist.sceneId ?? "");
  const memoryId = String(persist.memoryId ?? "");

  // ①
  if (!UUID_RX.test(sceneId)) return { ok: false, reason: "persist.sceneId must be a uuid" };
  if (!UUID_RX.test(memoryId)) return { ok: false, reason: "persist.memoryId must be a uuid" };
  if (!PERSISTABLE_KEYS.includes(key)) return { ok: false, reason: `not persistable: ${key}` };
  if (!value) return { ok: false, reason: "empty generation" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[contaminate-text] persist: service config missing");
    return { ok: false, reason: "service config missing" };
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ② scene 이 그 memory 소속인가 + ④ 이미 값이 있는가
  const { data: scene, error: selErr } = await sb
    .from("scenes")
    .select(`id, memory_id, ${key}`)
    .eq("id", sceneId)
    .maybeSingle();

  if (selErr) return { ok: false, reason: selErr.message };
  if (!scene) return { ok: false, reason: "scene not found" };
  if (scene.memory_id !== memoryId) {
    console.warn(`[contaminate-text] persist rejected: scene ${sceneId} not in memory ${memoryId}`);
    return { ok: false, reason: "scene does not belong to memory" };
  }
  // ④ 덮어쓰기 금지 — 작가 판본이 AI 생성물에 지워지는 일은 없어야 한다.
  if ((scene as Record<string, unknown>)[key]) {
    return { ok: false, reason: `${key} already exists — not overwritten` };
  }

  // ③ 진짜 플레이한 기억인가
  const since = new Date(Date.now() - RECENT_PLAY_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: recentPlays, error: playErr } = await sb
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("memory_id", memoryId)
    .gte("created_at", since);

  if (playErr) return { ok: false, reason: playErr.message };
  if (!recentPlays || recentPlays === 0) {
    console.warn(`[contaminate-text] persist rejected: no recent play for memory ${memoryId}`);
    return { ok: false, reason: "no recent play for this memory" };
  }

  const { error: updErr } = await sb
    .from("scenes")
    .update({ [key]: value })
    .eq("id", sceneId);

  if (updErr) {
    console.error("[contaminate-text] persist update failed:", updErr);
    return { ok: false, reason: updErr.message };
  }

  console.log(`[contaminate-text] persisted ${key} for scene ${sceneId} (memory ${memoryId})`);
  return { ok: true, key };
}

// ─── Stage-specific prompts ──────────────────────────────────────

interface ContaminationState {
  cont_stage: string;
  cont_drift: number;
  cont_fixation: number;
  drift_dir_v: number;
  drift_dir_a: number;
  drift_dir_d: number;
  band: string;
  mismatch_type?: string;
}

function buildBiasedPrompt(text: string, state: ContaminationState, lang: "ko" | "en"): string {
  const direction = describeVADDirection(state.drift_dir_v, state.drift_dir_a, state.drift_dir_d, lang);

  if (lang === "ko") {
    const intensity = state.band === "strong"
      ? "감정 표현 대부분을 기울여라. 문장 끝의 어미도 바꿔라."
      : state.band === "medium"
        ? "핵심 감정 단어와 확신/불확신 표현을 바꿔라."
        : "1~2개 단어만 미세하게 변형하라. 독자가 거의 눈치채지 못할 정도로.";

    return `이 기억이 ${direction}으로 기울어지고 있다.

변형 지침:
- 확신 표현을 불확실하게, 또는 불확실한 표현을 확신으로 기울여라 (방향에 맞게)
- ${intensity}
- 한국어 어미 변형 예시: "-았다" → "-았던 것 같다", "-했다" → "-했을지도", "분명히" 추가/제거

원문:
${text}`;
  }

  const intensity = state.band === "strong"
    ? "Shift most emotion-bearing phrases. Change sentence endings and register."
    : state.band === "medium"
      ? "Change key emotion words and certainty markers. The tilt should be felt."
      : "Change only 1-2 words. The reader should barely notice.";

  return `This memory is tilting toward: ${direction}.

Transformation instructions:
- Shift certainty markers and emotional tone in the drift direction
- ${intensity}

Original text:
${text}`;
}

function buildHyperPrompt(text: string, state: ContaminationState, lang: "ko" | "en"): string {
  if (lang === "ko") {
    const intensity = state.band === "strong"
      ? "모든 추측/가능성 표현을 제거하고, 없었던 감각 세부를 추가하라. 기억이 '너무 완벽하게' 기억되는 상태로 만들어라."
      : state.band === "medium"
        ? "애매한 표현을 확정적으로 바꾸고, 빠진 연결어를 채워라. 문장이 지나치게 깔끔해 보이도록."
        : "애매한 표현 1~2개만 확정적 표현으로 바꿔라.";

    return `이 기억이 과잉 수선되고 있다. 흐려지는 것이 아니라 너무 선명해지고 있다.

변형 지침:
- "것 같다", "아마", "어쩌면" 같은 완화 표현을 단정적 표현으로 교체
- ${intensity}
- 인과관계를 원문보다 명확하게 만들어라 ("그래서", "때문에" 삽입)
- 결과물은 기이하게 완벽한 기억이어야 한다 — "이렇게까지 잘 기억날 리가 없는데"

원문:
${text}`;
  }

  const intensity = state.band === "strong"
    ? "Remove ALL hedging. Add sensory details that weren't there. Make it uncannily perfect."
    : state.band === "medium"
      ? "Replace hedging with certainty. Fill in missing connectors. Make it too clean."
      : "Replace 1-2 hedging expressions with definitive statements.";

  return `This memory is being over-consolidated. It is becoming too vivid, too certain.

Transformation instructions:
- Replace hedging language ("maybe", "I think", "seemed like") with definitive statements
- ${intensity}
- Make causal connections explicit where the original was ambiguous
- The result should feel uncannily perfect — a memory that is "too good"

Original text:
${text}`;
}

function buildJuxtapositionPrompt(text: string, state: ContaminationState, lang: "ko" | "en"): string {
  const direction = describeVADDirection(state.drift_dir_v, state.drift_dir_a, state.drift_dir_d, lang);

  if (lang === "ko") {
    return `이 기억에 여러 해석이 동시에 존재한다. 두 가지 변이본을 생성하라.

변이 1 (편향): 기억이 ${direction}으로 기울어진 버전. 핵심 감정 단어 2~3개만 변형.
변이 2 (과잉완결): 기억이 과도하게 선명해진 버전. 불확실한 표현을 확정으로 교체.

반드시 아래 JSON 형식으로만 출력하라:
{"variant_biased": "변이1 텍스트", "variant_hyper": "변이2 텍스트"}

원문:
${text}`;
  }

  return `Multiple interpretations exist for this memory simultaneously. Generate two variants.

Variant 1 (biased): The memory tilted toward ${direction}. Change 2-3 key emotion words.
Variant 2 (hypercompletion): The memory over-solidified. Replace uncertainty with certainty.

Output ONLY this JSON format:
{"variant_biased": "variant 1 text", "variant_hyper": "variant 2 text"}

Original text:
${text}`;
}

// ─── Legacy format bridge ────────────────────────────────────────

function legacyToV2(body: { text: string; stage: number; direction?: string; fixation?: number }): ContaminationState {
  const fixation = typeof body.fixation === "number" ? Math.max(0, Math.min(1, body.fixation)) : 0.5;
  return {
    cont_stage: body.stage === 3 ? "hypercompletion" : body.stage === 2 ? "juxtaposition" : "biased_inclination",
    cont_drift: body.stage === 3 ? 0.3 : 0.5,
    cont_fixation: body.stage === 3 ? fixation : 0.3,
    drift_dir_v: 0,
    drift_dir_a: 0,
    drift_dir_d: 0,
    band: body.stage === 3
      ? (fixation >= 0.67 ? "strong" : fixation >= 0.34 ? "medium" : "weak")
      : "medium",
    mismatch_type: body.direction || "default",
  };
}

// ─── Main handler ────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─── R3-2 (L3-01 🔴): 무인증 크레딧 소모 방어 ───────────────────
  // verify_jwt=false + 검사 0 이라 완전 공개 엔드포인트였다 → 호출 1건 = Anthropic 크레딧.
  // 완전 차단은 익명 관객 플로우(archive.js / contaminationPresenter 백그라운드 생성)를
  // 죽이므로 금지. 대신 입력 크기·형식을 좁혀 대량 호출의 단가와 표면을 줄인다.
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: "body too large" }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return new Response(
      JSON.stringify({ error: "text is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return new Response(
      JSON.stringify({ error: `text too long (max ${MAX_TEXT_CHARS} chars)` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // stage 화이트리스트 — 사전에 없는 stage 는 프롬프트 분기를 못 타므로 거부
  const reqStage = body.contamination?.cont_stage;
  if (reqStage !== undefined && !ALLOWED_STAGES.includes(String(reqStage))) {
    return new Response(
      JSON.stringify({ error: `unknown cont_stage: ${reqStage}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const reqBand = body.contamination?.band;
  if (reqBand !== undefined && !ALLOWED_BANDS.includes(String(reqBand))) {
    return new Response(
      JSON.stringify({ error: `unknown band: ${reqBand}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Detect format: legacy (admin) vs v2 (play)
  const state: ContaminationState = body.contamination
    ? {
        cont_stage: body.contamination.cont_stage || "biased_inclination",
        cont_drift: body.contamination.cont_drift || 0,
        cont_fixation: body.contamination.cont_fixation || 0,
        drift_dir_v: body.contamination.drift_dir_v || 0,
        drift_dir_a: body.contamination.drift_dir_a || 0,
        drift_dir_d: body.contamination.drift_dir_d || 0,
        band: body.contamination.band || "medium",
        mismatch_type: body.contamination.mismatch_type,
      }
    : legacyToV2({ text, stage: body.stage || 1, direction: body.direction, fixation: body.fixation });

  const lang = body.lang || detectLang(text);
  const systemPrompt = buildSystemPrompt(lang);

  let userPrompt: string;
  let isJuxtaposition = false;

  if (state.cont_stage === "hypercompletion") {
    userPrompt = buildHyperPrompt(text, state, lang);
  } else if (state.cont_stage === "juxtaposition") {
    userPrompt = buildJuxtapositionPrompt(text, state, lang);
    isJuxtaposition = true;
  } else {
    // biased_inclination or any other
    userPrompt = buildBiasedPrompt(text, state, lang);
  }

  // Stage별 temperature 차등(과완결=저변주)은 설계 의도 — sonnet-5는 temperature를 거부(400)하므로
  // 이 함수만 temperature를 지원하는 sonnet-4-6 사용 (2026-07-13, sonnet-4 은퇴 대응).
  const temperature = state.cont_stage === "hypercompletion" ? 0.2
    : isJuxtaposition ? 0.35
    : 0.4;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[contaminate-text] Claude API error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: `Claude ${res.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const raw = data?.content?.[0]?.text?.trim() || "";

    if (isJuxtaposition) {
      // KNOWN BUG (R6 발견, 이번 라운드 범위 밖 — 보고서에 기록):
      //   아래 text_stage_2 에는 파싱된 변이본이 아니라 **모델의 원 출력(raw)** 이 들어간다.
      //   juxtaposition 프롬프트는 {"variant_biased": …, "variant_hyper": …} JSON 을 요구하므로
      //   text_stage_2 = JSON 문자열 통째 = 독자 화면에 중괄호가 그대로 찍힌다.
      //   admin 레거시 호출(stage: 2 → legacyToV2 → juxtaposition)만 이 경로를 탄다.
      //   그래서 persist 는 이 경로에서 **거부**한다 — 서버가 DB 에 JSON 쓰레기를 굽지 않도록.
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : null;
        return new Response(
          JSON.stringify({
            text_stage_1: parsed?.variant_biased || raw,
            text_stage_2: raw,
            text_stage_3: parsed?.variant_hyper || raw,
            ...(body.persist ? { persisted: { ok: false, reason: "juxtaposition mode is not persistable" } } : {}),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // JSON parse failed — return raw as stage 2
        return new Response(
          JSON.stringify({ text_stage_2: raw }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Single stage response
    const responseKey = state.cont_stage === "hypercompletion" ? "text_stage_3" : "text_stage_1";

    // R6-2: 익명 클라이언트는 scenes 를 못 쓴다(RLS 0행). 요청이 있으면 서버가 대신 쓴다.
    let persisted: { ok: boolean; reason?: string; key?: string } | undefined;
    if (body.persist && typeof body.persist === "object") {
      persisted = await persistStageText(body.persist, responseKey, raw);
      if (!persisted.ok) {
        console.warn("[contaminate-text] persist skipped:", persisted.reason);
      }
    }

    return new Response(
      JSON.stringify({ [responseKey]: raw, ...(persisted ? { persisted } : {}) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[contaminate-text]", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
