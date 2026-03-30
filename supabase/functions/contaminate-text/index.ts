// contaminate-text/index.ts — Gemini Flash로 Stage 1/2/3 오염 텍스트 생성 (Admin 재생성용)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim())
    : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowedOrigins.length === 0) {
    allowedOrigin = "*";
  } else if (allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else {
    allowedOrigin = allowedOrigins[0];
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type MismatchType = "default" | "emotion_mismatch" | "target_displacement" | "attribution_mismatch" | "void_mismatch";
type FixationBand = "weak" | "medium" | "strong";

function getFixationBand(fixation: number): FixationBand {
  if (fixation >= 0.67) return "strong";
  if (fixation >= 0.34) return "medium";
  return "weak";
}

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

// Stage 3: hypercompletion — 기억이 스스로 답을 확정하고, 과선명해지는 방향.
// 손상/흐림이 아니라 과잉 확정/과잉 선명화. fixation 강도에 따라 확정 압력 조절.
const STAGE3_PROMPTS: Record<MismatchType, Record<FixationBand, string>> = {
  default: {
    weak: "다음 한국어 문장에서 애매한 표현 1~2개를 확정적 표현으로 바꾸세요. 문장 길이는 유지하고, 변형된 문장만 한 줄로 출력하세요.",
    medium: "다음 한국어 문장을 '과선명화' 방향으로 변형하세요: 애매한 표현을 확정 표현으로 바꾸고, 빠진 연결어를 채워 넣으세요. 문장이 지나치게 깔끔하고 확실해 보이도록 하세요. 변형된 문장만 한 줄로 출력하세요.",
    strong: "다음 한국어 문장을 '과잉 완결' 수준으로 변형하세요: 모든 표현을 단정적으로 바꾸고, 가능성·추측 표현을 완전히 제거하세요. 기억이 스스로 사실을 확정하는 것처럼 과도하게 선명하게 만드세요. 변형된 문장만 한 줄로 출력하세요.",
  },
  emotion_mismatch: {
    weak: "다음 한국어 문장의 감정 표현 중 애매한 것 1~2개를 더 강하고 확정적인 감정 단어로 바꾸세요. 변형된 문장만 한 줄로 출력하세요.",
    medium: "다음 한국어 문장의 감정을 과잉 확정 방향으로 변형하세요: 감정을 더 강렬하고 단정적으로 표현하세요. '조금', '약간', '것 같다' 같은 완화 표현을 제거하세요. 변형된 문장만 한 줄로 출력하세요.",
    strong: "다음 한국어 문장의 감정을 '과잉 강렬화' 수준으로 변형하세요: 감정이 사실로 굳어버린 것처럼, 모든 감정 표현을 극단적으로 단정짓는 방식으로 바꾸세요. 변형된 문장만 한 줄로 출력하세요.",
  },
  target_displacement: {
    weak: "다음 한국어 문장에서 대상이 모호한 부분을 구체적인 인물/사물로 확정해 넣으세요. 변형된 문장만 한 줄로 출력하세요.",
    medium: "다음 한국어 문장에서 대상을 과도하게 특정하세요: 누구에 관한 것인지, 무엇에 관한 것인지를 과잉 확정적으로 서술하세요. 변형된 문장만 한 줄로 출력하세요.",
    strong: "다음 한국어 문장의 대상을 '과잉 특정' 수준으로 고착시키세요: 모든 인물과 사물을 단정지어 확정하고, 어떤 모호함도 남기지 마세요. 변형된 문장만 한 줄로 출력하세요.",
  },
  attribution_mismatch: {
    weak: "다음 한국어 문장에서 원인이 불분명한 부분을 확정적 인과 표현으로 바꾸세요. 변형된 문장만 한 줄로 출력하세요.",
    medium: "다음 한국어 문장의 원인·귀속을 과잉 확정 방향으로 변형하세요: '때문에', '그래서', '결국' 같은 단정적 인과 표현을 삽입하거나 강화하세요. 변형된 문장만 한 줄로 출력하세요.",
    strong: "다음 한국어 문장의 인과관계를 '과잉 단정' 수준으로 고착시키세요: 원인과 결과를 필연적인 것처럼 강하게 확정하고, 우연이나 가능성 표현을 완전히 제거하세요. 변형된 문장만 한 줄로 출력하세요.",
  },
  void_mismatch: {
    weak: "다음 한국어 문장에서 비어있거나 생략된 자리에 내용을 1~2개 채워 넣으세요. 변형된 문장만 한 줄로 출력하세요.",
    medium: "다음 한국어 문장의 빈자리와 여백을 채워 넣으세요: 생략된 감정, 대상, 이유를 과잉 보충해 문장이 지나치게 가득 찬 것처럼 만드세요. 변형된 문장만 한 줄로 출력하세요.",
    strong: "다음 한국어 문장의 모든 여백과 공백을 과잉 채움 수준으로 메우세요: 원래 비어있어야 할 자리까지 확정적 표현으로 가득 채워, 기억이 스스로 빈자리를 메워버린 것처럼 만드세요. 변형된 문장만 한 줄로 출력하세요.",
  },
};

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

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

  let body: { text?: string; stage?: number; direction?: string; fixation?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const stage = body.stage === 1 || body.stage === 2 || body.stage === 3 ? body.stage : 1;
  const direction: MismatchType =
    body.direction && STAGE1_PROMPTS[body.direction as MismatchType]
      ? (body.direction as MismatchType)
      : "default";
  const fixation = typeof body.fixation === "number" ? Math.max(0, Math.min(1, body.fixation)) : 0.5;

  if (!text) {
    return new Response(
      JSON.stringify({ error: "text is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let prompt: string;
  if (stage === 1) {
    prompt = STAGE1_PROMPTS[direction];
  } else if (stage === 2) {
    prompt = STAGE2_PROMPTS[direction];
  } else {
    prompt = STAGE3_PROMPTS[direction][getFixationBand(fixation)];
  }

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
          temperature: stage === 3 ? 0.3 : 0.4, // hypercompletion은 더 결정론적으로
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

    const responseKey = stage === 1 ? "text_stage_1" : stage === 2 ? "text_stage_2" : "text_stage_3";
    return new Response(
      JSON.stringify({ [responseKey]: contaminated }),
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
