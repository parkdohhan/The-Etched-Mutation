// contaminate-text/index.ts — Gemini Flash로 Stage 1/2 오염 텍스트 생성 (Admin 재생성용)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

const corsHeaders = getCorsHeaders(new Request("http://localhost"));

type MismatchType = "default" | "emotion_mismatch" | "target_displacement" | "attribution_mismatch" | "void_mismatch";

const STAGE1_PROMPTS: Record<MismatchType, string> = {
  default: "다음 한국어 문장을 '객체화' 수준(0.3~0.6)으로 변형해주세요: 1인칭을 3인칭으로 바꾸고, 감각적 디테일은 흐리게 하되 문장 구조는 유지하세요. 변형된 문장만 한 줄로 출력하세요.",
  emotion_mismatch: "다음 한국어 문장의 감정 표현을 '객체화' 수준(0.3~0.6)으로 변형해주세요: 감정 단어를 더 거리감 있는 표현으로 바꾸세요. 변형된 문장만 한 줄로 출력하세요.",
  target_displacement: "다음 한국어 문장에서 대상/인물을 '객체화' 수준(0.3~0.6)으로 모호하게 만드세요. 구체적 인칭·이름을 흐리게 하세요. 변형된 문장만 한 줄로 출력하세요.",
  attribution_mismatch: "다음 한국어 문장에서 원인·귀속을 '객체화' 수준(0.3~0.6)으로 변형해주세요. 누가/무엇이 원인인지 덜 분명하게 하세요. 변형된 문장만 한 줄로 출력하세요.",
  void_mismatch: "다음 한국어 문장을 '객체화' 수준(0.3~0.6)으로 변형해주세요: 여백을 늘리고 불필요한 디테일을 줄여 간소화하세요. 변형된 문장만 한 줄로 출력하세요.",
};

const STAGE2_PROMPTS: Record<MismatchType, string> = {
  default: "다음 한국어 문장을 '추상화' 수준(0.6~0.9)으로 변형해주세요: 문장을 끊기게 하고, 구체적 대상은 소거하세요. 변형된 문장만 한 줄로 출력하세요.",
  emotion_mismatch: "다음 한국어 문장의 감정을 '추상화' 수준(0.6~0.9)으로 모호하게 만드세요. 감정 표현을 거의 알아볼 수 없게 하세요. 변형된 문장만 한 줄로 출력하세요.",
  target_displacement: "다음 한국어 문장에서 대상/인물을 '추상화' 수준(0.6~0.9)으로 완전히 소거하세요. 누구/무엇에 대한 언급을 없애세요. 변형된 문장만 한 줄로 출력하세요.",
  attribution_mismatch: "다음 한국어 문장의 인과관계를 '추상화' 수준(0.6~0.9)으로 모호하게 만드세요. 원인과 결과가 불분명해지게 하세요. 변형된 문장만 한 줄로 출력하세요.",
  void_mismatch: "다음 한국어 문장을 '추상화' 수준(0.6~0.9)으로 변형해주세요: 거의 끊긴 단어 나열 수준으로 줄이세요. 변형된 문장만 한 줄로 출력하세요.",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[contaminate-text] GEMINI_API_KEY not set");
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: { text?: string; stage?: number; direction?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const stage = body.stage === 1 || body.stage === 2 ? body.stage : 1;
  const direction: MismatchType =
    body.direction && STAGE1_PROMPTS[body.direction as MismatchType]
      ? (body.direction as MismatchType)
      : "default";

  if (!text) {
    return new Response(
      JSON.stringify({ error: "text is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const prompt = stage === 1 ? STAGE1_PROMPTS[direction] : STAGE2_PROMPTS[direction];
  const fullPrompt = `${prompt}\n\n원문:\n${text}`;

  try {
    // 무료 티어: gemini-1.5-flash (AI Studio 기본). gemini-2.0-flash는 지역/결제 제한 있을 수 있음
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[contaminate-text] Gemini API error:", res.status, errText);
      let errMessage = errText;
      try {
        const errJson = JSON.parse(errText);
        errMessage = errJson?.error?.message || errJson?.error?.status || errJson?.message || errText;
      } catch (_e) {
        // keep errMessage as errText
      }
      return new Response(
        JSON.stringify({
          error: `Gemini ${res.status}: ${errMessage}`,
          details: errText,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const contaminated = part?.text?.trim() || "";

    if (stage === 1) {
      return new Response(
        JSON.stringify({ text_stage_1: contaminated }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ text_stage_2: contaminated }),
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
