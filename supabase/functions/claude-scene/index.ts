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

두 가지를 해줘:
1. 이 감정을 2-3문장의 서정적이고 감각적인 문장으로 변환해줘. 원문을 그대로 반복하지 말고, 체험자가 느낄 수 있는 감각적 표현으로 바꿔줘.
2. 감정을 수치로 분석해줘.

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

각 감정 수치는 0부터 1 사이의 소수점 숫자로.`;

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
