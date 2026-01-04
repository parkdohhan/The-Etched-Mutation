// --- CORS + Claude API + Emotion Analysis 버전 --- //

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // API 키 확인
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- 감정 분석 타입 처리 ----
    if (body.type === 'emotion_analysis') {
      const emotionText = body.emotion || '';
      const reasonText = body.reason || '';
      
      console.log('감정 분석 요청:', { emotionText, reasonText });

      const prompt = `다음 감정 표현을 분석하고 변환해줘.

입력된 감정: "${emotionText}"
입력된 이유: "${reasonText}"

**중요: 한국어 감정 표현을 직관적으로 매핑해줘. 명시적 감정 단어가 있으면 그 단어에 우선순위를 둬.**

**분석 대상:**
- 감정 필드("${emotionText}")와 이유 필드("${reasonText}") **모두를 분석**해줘.
- 어느 필드에 감정 표현이 있든 상관없이, 명시적 감정 단어가 있으면 그 감정에 높은 수치(0.7 이상)를 부여해줘.
- **특히 이유 필드에 감정 표현이 있으면 반드시 인식해줘.** 예: 이유가 "너무 무서웠어"이면 fear를 0.7 이상으로 설정.
- "무서웠어", "무섭다", "두려웠어", "겁났어" 등의 단어가 **어느 필드에 있든** fear를 높게 설정해줘.

감정 매핑 규칙:
- fear (공포/두려움): "무서웠어", "너무 무서웠어", "공포스러웠어", "두려웠어", "겁났어", "무섭다", "두렵다", "공포", "두려움", "겁", "무서움" 등 → fear 높게 (0.7 이상)
  * 예시: 이유 필드에 "너무 무서웠어"가 있으면 → fear: 0.7 이상 (절대 0이 아님!)
- sadness (슬픔): "슬펐어", "울었어", "비통했어", "서러웠어", "슬프다", "우울하다", "비통하다", "서럽다", "슬픔", "비애" 등 → sadness 높게 (0.7 이상)
- longing (그리움): "그리웠어", "보고싶었어", "그립다", "보고싶다", "그리움", "향수", "사모함" 등 → longing 높게 (0.7 이상)
- anger (분노): "화났어", "분노했어", "열받았어", "짜증났어", "화나다", "분노하다", "열받다", "짜증나다", "분노", "화" 등 → anger 높게 (0.7 이상)
- guilt (죄책감): "죄책감 들었어", "미안했어", "후회했어", "죄송했어", "죄책감", "미안", "후회", "죄송", "자책" 등 → guilt 높게 (0.7 이상)

**분석 원칙 (절대 규칙):**
1. **감정 필드("${emotionText}")와 이유 필드("${reasonText}") 모두를 분석해줘.** 어느 필드에 감정 표현이 있든 상관없이, 명시적 감정 단어가 있으면 그 감정에 높은 수치(0.7 이상)를 부여해.
2. **"무서웠어", "좀 무서웠어", "너무 무서웠어" 등의 단어가 있으면 → fear를 0.7 이상으로 설정 (절대 0이 아님!)**
3. 맥락보다 직접적 표현을 우선해. 예: "무서웠어", "좀 무서웠어", "너무 무서웠어"가 있으면 fear를 높게 설정.
4. 여러 감정이 섞여 있으면 각각 적절히 반영하되, 가장 강한 감정이 0.7 이상이 되도록 해.
5. 감정 단어가 없으면 맥락을 분석하되, 명시적 단어보다는 낮은 수치(0.3-0.5)로 설정.
6. **특히 주의:** 이유 필드("${reasonText}")에 "무서웠어", "좀 무서웠어", "너무 무서웠어" 등의 단어가 있으면 → fear를 0.7 이상으로 설정 (절대 0이 아님!)

두 가지를 해줘:
1. 이 감정을 2-3문장의 서정적이고 감각적인 문장으로 변환해줘. 원문을 그대로 반복하지 말고, 체험자가 느낄 수 있는 감각적 표현으로 바꿔줘.
2. 감정을 수치로 분석해줘. 위의 매핑 규칙을 엄격히 따르고, 명시적 감정 단어가 있으면 반드시 해당 감정을 0.7 이상으로 설정해.

반드시 아래 JSON 형식으로만 응답해 (다른 텍스트 없이 순수 JSON만):
{
  "generatedEmotion": "변환된 감정 표현 (원문과 달라야 함)",
  "analysis": {
    "base": {
      "fear": 0.0,
      "sadness": 0.0,
      "anger": 0.0,
      "joy": 0.0,
      "longing": 0.0,
      "guilt": 0.0
    },
    "detailed": ["세부감정1", "세부감정2"],
    "intensity": 0.5,
    "confidence": 0.8
  }
}

각 감정 수치는 0부터 1 사이의 소수점 숫자로. 명시적 감정 단어가 있으면 해당 감정은 최소 0.7 이상이어야 해.`;

      const systemPrompt = `너는 한국어 감정 분석 전문가야. 사용자가 입력한 텍스트에서 명시적 감정 단어를 찾아서 해당 감정에 높은 수치를 부여하는 것이 가장 중요해.

**절대 규칙:**
- "무서웠어", "무섭다", "두려웠어", "겁났어" 등의 단어가 **어느 필드에 있든** (감정 필드든 이유 필드든) → fear를 0.7 이상으로 설정
- "슬펐어", "울었어", "비통했어" 등의 단어가 있으면 → sadness를 0.7 이상으로 설정
- "화났어", "분노했어", "열받았어" 등의 단어가 있으면 → anger를 0.7 이상으로 설정
- "그리웠어", "보고싶었어" 등의 단어가 있으면 → longing을 0.7 이상으로 설정
- "죄책감", "미안했어", "후회했어" 등의 단어가 있으면 → guilt를 0.7 이상으로 설정

**중요:** 명시적 감정 단어가 있으면 반드시 해당 감정을 0.7 이상으로 설정해야 해. 0으로 설정하면 안 돼!`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Claude API 에러 (emotion):', errorData);
        return new Response(JSON.stringify({
          generatedEmotion: `그 순간, ${emotionText || '알 수 없는'} 감정이 밀려왔다.`,
          analysis: {
            base: { fear: 0, sadness: 0.3, anger: 0, joy: 0, longing: 0.2, guilt: 0 },
            detailed: [],
            intensity: 0.5,
            confidence: 0.3
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await response.json();
      let text = data.content[0].text;
      
      console.log('Claude 감정 응답 원본:', text);

      // JSON 파싱 시도
      try {
        // ```json 제거
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // JSON 객체만 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          text = jsonMatch[0];
        }
        
        const parsed = JSON.parse(text);
        console.log('파싱된 감정 결과:', JSON.stringify(parsed));
        
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        console.error('JSON parse error:', e, 'text:', text);
        
        // 파싱 실패 시 기본값
        return new Response(JSON.stringify({
          generatedEmotion: `그 순간, ${emotionText || '알 수 없는'} 감정이 밀려왔다.`,
          analysis: {
            base: { fear: 0, sadness: 0.3, anger: 0, joy: 0, longing: 0.2, guilt: 0 },
            detailed: [],
            intensity: 0.5,
            confidence: 0.3
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ---- 기존 장면 생성 로직 ----
    const { text } = body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: '텍스트 입력이 필요합니다.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `너는 '기억 변환 장치'이다. 화자가 입력한 문장을 바탕으로, 체험자에게 보여줄 장면을 생성한다.

규칙:
1) 출력은 반드시 2~3문장
2) 감각 묘사를 1개 이상 포함
3) 과도한 서사 금지
4) 심리 해석 금지
5) 2인칭 시점
6) 원문을 단순 반복하지 말고 감각적으로 변환`,
        messages: [
          {
            role: "user",
            content: `화자가 떠올린 기억: "${text.trim()}"\n이 장면을 체험자가 몰입할 수 있는 즉각적인 경험으로 변환해라.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API 에러 (scene):', errorData);
      return new Response(JSON.stringify({ 
        error: 'Claude API 호출 실패',
        details: errorData.error?.message || '알 수 없는 오류'
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const scene = data.content[0].text;

    return new Response(JSON.stringify({ scene }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error('Edge Function 에러:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
