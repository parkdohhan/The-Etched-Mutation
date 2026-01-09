// --- 텍스트 오염 변형 Edge Function --- //

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const directionPrompts: Record<string, Record<number, (text: string) => string>> = {
  emotion_mismatch: {
    1: (text: string) => `다음 텍스트를 "객체화" 단계로 변형하되, 감정 단어를 변형하세요.
- "무서웠다"→"불안했다", "슬펐다"→"공허했다" 등 감정 단어를 다른 감정 단어로 변형
- 문장 구조는 유지
- 감정의 강도는 유지하되 표현 방식만 변경

원본 텍스트: ${text}
변형:`,
    2: (text: string) => `다음 텍스트를 "추상화" 단계로 변형하되, 감정 표현을 모호하게 하세요.
- "무서웠다"→"뭔가 느꼈다", "슬펐다"→"마음이 이상했다" 등 감정을 구체적이지 않게
- 감정의 강도는 유지하되 표현을 흐리게

원본 텍스트: ${text}
변형:`,
    3: (text: string) => `다음 텍스트를 "소거" 단계로 변형하되, 감정 단어를 소거하세요.
- 감정 단어를 [...] 또는 ██로 대체
- 감정이 소거된 느낌
- 전체 길이의 30-50%만 남기기

원본 텍스트: ${text}
변형:`
  },
  target_displacement: {
    1: (text: string) => `다음 텍스트를 "객체화" 단계로 변형하세요.
- 1인칭을 3인칭으로. "나"→"그녀", "내가"→"그녀가"
- 문장 구조는 유지
- 감정 표현은 유지

원본 텍스트: ${text}
변형:`,
    2: (text: string) => `다음 텍스트를 "추상화" 단계로 변형하되, 대상을 모호하게 하세요.
- "엄마"→"누군가", "친구"→"어떤 사람" 등 구체적 대상을 모호하게
- 감정의 강도는 유지하되 대상을 흐리게

원본 텍스트: ${text}
변형:`,
    3: (text: string) => `다음 텍스트를 "소거" 단계로 변형하되, 대상을 완전히 소거하세요.
- "누군가가 [...] 했다" 형태로 대상 소거
- 전체 길이의 30-50%만 남기기

원본 텍스트: ${text}
변형:`
  },
  attribution_mismatch: {
    1: (text: string) => `다음 텍스트를 "객체화" 단계로 변형하되, 원인 표현을 변형하세요.
- "내 탓"→"그의 탓", "운명"→"선택" 등 원인 표현 변형
- 문장 구조는 유지

원본 텍스트: ${text}
변형:`,
    2: (text: string) => `다음 텍스트를 "추상화" 단계로 변형하되, 원인을 모호하게 하세요.
- "때문에"→"어쩌다", "왜냐하면"→"그냥" 등 인과관계 표현을 모호하게
- 감정의 강도는 유지

원본 텍스트: ${text}
변형:`,
    3: (text: string) => `다음 텍스트를 "소거" 단계로 변형하되, 원인 부분을 소거하세요.
- 인과관계 불명확하게
- 전체 길이의 30-50%만 남기기

원본 텍스트: ${text}
변형:`
  },
  void_mismatch: {
    1: (text: string) => `다음 텍스트를 "객체화" 단계로 변형하되, 구체적 내용을 줄이고 여백을 늘리세요.
- 문장 사이에 공백 추가
- 감정 표현은 유지하되 내용을 간소화

원본 텍스트: ${text}
변형:`,
    2: (text: string) => `다음 텍스트를 "추상화" 단계로 변형하되, 문장 사이에 "..." 추가하세요.
- 기억이 끊기는 느낌
- 감정의 흔적만 남기기

원본 텍스트: ${text}
변형:`,
    3: (text: string) => `다음 텍스트를 "소거" 단계로 변형하되, 30% 이상 소거하세요.
- 대부분 [...] 또는 빈 공간
- 기억이 거의 사라진 느낌

원본 텍스트: ${text}
변형:`
  },
  default: {
    1: (text: string) => `다음 텍스트를 "객체화" 단계로 변형해주세요.
- 1인칭("나", "내가", "나는")을 3인칭("그녀", "그", "그는")으로 변경
- 감정 표현은 유지하되 주체를 객관화
- 문장 구조는 유지

원본 텍스트: ${text}
변형:`,
    2: (text: string) => `다음 텍스트를 "추상화" 단계로 변형해주세요.
- 구체적인 대상, 장소, 시간을 모호하게 변경
- 예: "엄마"→"누군가", "집"→"어딘가", "그때"→"언젠가"
- 감정의 강도는 유지하되 대상을 흐리게

원본 텍스트: ${text}
변형:`,
    3: (text: string) => `다음 텍스트를 "소거" 단계로 변형해주세요.
- 핵심 단어들을 [...] 또는 ██로 대체
- 문장 일부를 "..."으로 생략
- 기억이 거의 사라진 느낌
- 전체 길이의 30-50%만 남기기

원본 텍스트: ${text}
변형:`
  }
};

serve(async (req) => {
  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any = null;
  try {
    body = await req.json();
    const { text, stage, direction = 'default' } = body;

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: '텍스트가 필요합니다.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!stage || (stage !== 1 && stage !== 2 && stage !== 3)) {
      return new Response(JSON.stringify({ error: '유효한 stage(1, 2, 3)가 필요합니다.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // API 키 확인
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 방향별 프롬프트 선택
    const directionKey = direction && directionPrompts[direction] ? direction : 'default';
    const stagePromptsForDirection = directionPrompts[directionKey];
    const promptGenerator = stagePromptsForDirection[stage as keyof typeof stagePromptsForDirection];
    
    if (!promptGenerator) {
      return new Response(JSON.stringify({ error: '유효하지 않은 오염 방향 또는 단계입니다.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const prompt = promptGenerator(text);

    const systemPrompt = `너는 기억이 시간에 따라 변형되는 과정을 시뮬레이션하는 AI야. 주어진 규칙에 따라 텍스트를 정확하게 변형해야 해. 원본의 감정과 의미는 최대한 유지하면서 요청된 단계에 맞게 변형해줘.`;

    console.log('텍스트 오염 변형 요청:', { stage, direction: directionKey, textLength: text.length });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API 오류:', errorText);
      return new Response(JSON.stringify({ 
        error: '텍스트 변형 실패',
        claude_error: errorText,
        contaminatedText: text // 실패 시 원본 반환
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const contaminatedText = data.content?.[0]?.text?.trim() || text;

    console.log('텍스트 오염 변형 완료:', { stage, originalLength: text.length, contaminatedLength: contaminatedText.length });

    return new Response(JSON.stringify({ 
      contaminatedText: contaminatedText 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('contaminate-text 함수 오류:', error);
    return new Response(JSON.stringify({ 
      error: error.message || '서버 오류',
      contaminatedText: body?.text || ''
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

