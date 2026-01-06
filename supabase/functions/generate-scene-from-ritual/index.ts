import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const body = await req.json();
    const { ritualData } = body;

    if (!ritualData) {
      return new Response(JSON.stringify({ error: "의식 데이터가 필요합니다." }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: corsHeaders
      });
    }

    // 프롬프트 구성
    const sensoryText = [];
    if (ritualData.sensory?.smell) {
      const smellChip = ritualData.sensory.smell;
      sensoryText.push(`냄새: ${smellChip}`);
    }
    if (ritualData.sensory?.sound) {
      const soundChip = ritualData.sensory.sound;
      sensoryText.push(`소리: ${soundChip}`);
    }
    if (ritualData.sensory?.temperature) {
      sensoryText.push(`온도: ${ritualData.sensory.temperature}`);
    }

    const prompt = `다음 감각 정보를 바탕으로 1인칭 시점의 짧은 장면(3~5문장)을 작성하세요.
건조하고 담담한 문체로, 감정을 직접 언급하지 말고 상황만 묘사하세요.

${sensoryText.length > 0 ? `감각: ${sensoryText.join(', ')}` : ''}
${ritualData.anchorObject ? `핵심 사물: ${ritualData.anchorObject}` : ''}
${ritualData.action ? `행동: 나는 손을 뻗어 ${ritualData.action}` : ''}
${ritualData.conflict ? `사건: ${ritualData.conflict}` : ''}
${ritualData.emotionWord ? `핵심 감정: ${ritualData.emotionWord}` : ''}

장면 텍스트만 출력하세요. 다른 설명이나 태그 없이 순수한 텍스트만:`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Claude API 오류:', errorData);
      return new Response(JSON.stringify({ 
        error: errorData.error?.message || "Claude API 호출 실패"
      }), {
        status: response.status,
        headers: corsHeaders
      });
    }

    const data = await response.json();
    const sceneText = data.content[0]?.text || "";

    console.log('=== 장면 생성 완료 ===');
    console.log('생성된 텍스트:', sceneText.substring(0, 100) + '...');

    return new Response(JSON.stringify({
      sceneText: sceneText.trim()
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('generate-scene-from-ritual 함수 오류:', error);
    return new Response(JSON.stringify({ 
      error: error.message || "알 수 없는 오류 발생"
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});

