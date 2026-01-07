import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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
        stream: true,
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
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 스트리밍 응답 생성
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

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
                  
                  // 모든 이벤트 타입 로깅 (디버깅용)
                  if (json.type) {
                    console.log('Edge Function: 이벤트 타입:', json.type);
                  }
                  
                  if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                    const text = json.delta.text;
                    if (text) {
                      fullText += text;
                      console.log('Edge Function: 텍스트 청크 수신, 길이:', text.length, '전체 길이:', fullText.length);
                      
                      // SSE 형식으로 텍스트 청크 전송
                      controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`)
                      );
                    } else {
                      console.warn('Edge Function: text_delta가 비어있음');
                    }
                  }

                  // message_stop 또는 message_delta 등 다른 이벤트도 확인
                  if (json.type === 'message_stop' || json.type === 'message_delta') {
                    // 최종 텍스트 전송
                    console.log('=== Edge Function: message 종료 이벤트 수신, 타입:', json.type, 'fullText 길이:', fullText.length);
                    console.log('Edge Function: fullText 내용:', fullText.substring(0, 100));
                    
                    // fullText가 비어있으면 에러 전송
                    if (!fullText.trim()) {
                      console.error('Edge Function: fullText가 비어있습니다!');
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ 
                            type: 'error', 
                            error: '텍스트를 생성하지 못했습니다'
                          })}\n\n`
                        )
                      );
                    } else {
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ 
                            type: 'done', 
                            sceneText: fullText.trim()
                          })}\n\n`
                        )
                      );
                    }
                    controller.close();
                    return;
                  }
                } catch (e) {
                  // JSON 파싱 오류 무시 (일부 라인은 JSON이 아닐 수 있음)
                  console.warn('Edge Function JSON 파싱 오류:', e.message, 'data:', data.substring(0, 100));
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
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (error) {
    console.error('generate-scene-from-ritual 함수 오류:', error);
    return new Response(JSON.stringify({ 
      error: error.message || "알 수 없는 오류 발생"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

