import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "text/event-stream"
};

serve(async (req) => {
  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  try {
    const body = await req.json();
    const { conversation, systemPrompt } = body;

    if (!conversation || !Array.isArray(conversation)) {
      return new Response(JSON.stringify({ error: "대화 기록이 필요합니다." }), {
        status: 400,
        headers: { 
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json" 
        }
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { 
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json" 
        }
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
        stream: true,
        system: systemPrompt || "당신은 사용자의 기억을 수집하는 AI입니다.",
        messages: [
          ...messages,
          { role: "user", content: analysisPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Claude API 오류:', errorData);
      return new Response(JSON.stringify({ 
        error: errorData.error?.message || "Claude API 호출 실패",
        reply: "죄송해요, 잠시 문제가 생겼어요. 다시 말해줄 수 있어?"
      }), {
        status: response.status,
        headers: { 
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json" 
        }
      });
    }

    // 스트리밍 응답 생성
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const json = JSON.parse(data);
                  
                  if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                    const text = json.delta.text;
                    fullText += text;
                    
                    // SSE 형식으로 텍스트 청크 전송
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`)
                    );
                  }

                  if (json.type === 'message_stop') {
                    // 최종 응답 처리
                    const sceneComplete = fullText.includes('[SCENE_COMPLETE]');
                    let extractedScene = null;

                    if (sceneComplete) {
                      try {
                        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
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

                    const cleanReply = fullText.replace(/\[SCENE_COMPLETE\][\s\S]*/, '').trim();

                    // 최종 메타데이터 전송
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: 'done', 
                          reply: cleanReply,
                          sceneComplete: sceneComplete,
                          extractedScene: extractedScene
                        })}\n\n`
                      )
                    );
                  }
                } catch (e) {
                  // JSON 파싱 오류 무시 (일부 라인은 JSON이 아닐 수 있음)
                }
              }
            }
          }
        } catch (error) {
          console.error('스트리밍 오류:', error);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ 
                type: 'error', 
                error: error.message || "스트리밍 오류 발생"
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('collect-memory 함수 오류:', error);
    return new Response(JSON.stringify({ 
      error: error.message || "알 수 없는 오류 발생",
      reply: "죄송해요, 잠시 문제가 생겼어요. 다시 말해줄 수 있어?"
    }), {
      status: 500,
      headers: { 
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json" 
      }
    });
  }
});

