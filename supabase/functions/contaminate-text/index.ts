// contaminate-text/index.ts — Claude API로 오염 텍스트 생성
// 오염 상태(stage + band + drift 방향)에 따라 원본 텍스트를 변형
//
// 두 가지 호출 모드:
//   Legacy (admin): { text, stage: 1|2|3, direction, fixation }
//   V2 (play):      { text, contamination: { cont_stage, cont_drift, cont_fixation, drift_dir_v/a/d, band } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

  let body: any;
  try {
    body = await req.json();
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
      // Parse JSON response for two variants
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : null;
        return new Response(
          JSON.stringify({
            text_stage_1: parsed?.variant_biased || raw,
            text_stage_2: raw,
            text_stage_3: parsed?.variant_hyper || raw,
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
    return new Response(
      JSON.stringify({ [responseKey]: raw }),
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
