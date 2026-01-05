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
    const { conversation, systemPrompt } = body;

    if (!conversation || !Array.isArray(conversation)) {
      return new Response(JSON.stringify({ error: "대화 기록이 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const messages = conversation.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    const analysisPrompt = `대화를 분석하여 장면 정보를 추출해주세요.

다음 정보가 모두 수집되었는지 확인:
1. 장면 텍스트 (무슨 일이 있었는지)
2. 선택지 (최소 2개)
3. 감정 (주요 감정)
4. 이유 (왜 그렇게 느꼈는지)

모든 정보가 충분하면 [SCENE_COMPLETE] 태그를 응답 끝에 추가하고, JSON 형식으로 정보를 정리해주세요.

JSON 형식:
{
  "text": "장면 설명",
  "choices": ["선택지1", "선택지2"],
  "emotion": "주요 감정 (예: 무서움, 슬픔, 분노 등)",
  "reason": "이유 설명"
}

정보가 부족하면 추가 질문을 하세요.`;

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
        system: systemPrompt || "당신은 사용자의 기억을 수집하는 AI입니다.",
        messages: [
          ...messages,
          { role: "user", content: analysisPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API 오류:', errorData);
      return new Response(JSON.stringify({ 
        error: errorData.error?.message || "Claude API 호출 실패",
        reply: "죄송해요, 잠시 문제가 생겼어요. 다시 말해줄 수 있어?"
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const replyText = data.content[0]?.text || "";
    
    const sceneComplete = replyText.includes('[SCENE_COMPLETE]');
    let extractedScene = null;

    if (sceneComplete) {
      try {
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedScene = JSON.parse(jsonMatch[0]);
        } else {
          extractedScene = {
            text: "",
            choices: [],
            emotion: "",
            reason: ""
          };
        }
      } catch (e) {
        console.error('JSON 파싱 오류:', e);
        extractedScene = {
          text: "",
          choices: [],
          emotion: "",
          reason: ""
        };
      }
    }

    const cleanReply = replyText.replace(/\[SCENE_COMPLETE\][\s\S]*/, '').trim();

    console.log('=== collect-memory 응답 ===');
    console.log('장면 완성:', sceneComplete);
    console.log('추출된 장면:', extractedScene);

    return new Response(JSON.stringify({
      reply: cleanReply,
      sceneComplete: sceneComplete,
      extractedScene: extractedScene
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('collect-memory 함수 오류:', error);
    return new Response(JSON.stringify({ 
      error: error.message || "알 수 없는 오류 발생",
      reply: "죄송해요, 잠시 문제가 생겼어요. 다시 말해줄 수 있어?"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

