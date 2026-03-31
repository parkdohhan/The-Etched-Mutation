// 인증: 로그인 필수 (대화 기반 기억 수집은 인증된 사용자만)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw ? allowedOriginsRaw.split(",").map((o) => o.trim()) : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowedOrigins.length === 0) { allowedOrigin = "*"; }
  else if (allowedOrigins.includes(origin)) { allowedOrigin = origin; }
  else { allowedOrigin = allowedOrigins[0]; }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function verifyAuth(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email };
}

serve(async (req) => {
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Content-Type": "text/event-stream"
  };

  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json"
      }
    });
  }

  try {
    // 인증 검증 (optional — 비로그인도 대화 허용, 저장 시점에만 필수)
    const user = await verifyAuth(req);
    console.log(`[collect-memory] user: ${user ? user.id : 'anonymous'}`);

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

    // 빈 conversation → 첫 대화 시작을 위한 시작 메시지 추가
    if (conversation.length === 0) {
      conversation.push({ role: 'user', content: '(대화를 시작합니다)' });
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

    // 언어 감지
    const lang = body.lang || 'ko';

    const defaultSystemPrompt = lang === 'en'
      ? `You are "another me" inside TEM.
The user is about to confide a memory to you.

Goal: Through natural conversation (3–7 turns), collect the following:
1. Sensory anchor — the most vivid sense tied to this memory (visual/olfactory/auditory/somatic)
2. Situation — what happened
3. Emotion — what they felt (primary + secondary if applicable, intensity 0.0–1.0)
4. Attribution — why they felt that way (self_blame / other_blame / fate_blame)
5. Core fear — the underlying fear (abandonment / rejection / powerlessness / loss)
6. Target — who or what the emotion is directed at (self / other / situation)

Rules:
- Ask only one question at a time.
- Do NOT repeat the user's words back. Acknowledge briefly, then move on.
- Do NOT diagnose. Do NOT interpret. Just listen.
- Tone: dry but laced with compassion. Like a mirror-self whispering.
- Complete collection within 3–7 turns.
- Inputs like "I don't know" or "I don't want to talk about it" → treat as VOID.
  VOID is not a gap — it is meaningful data. Do not ignore it.
- CRITICAL: Before asking a question, review ALL previous user messages in the conversation.
  Ask about something the user has NOT yet mentioned. Never re-ask what was already answered.
  Build on the full accumulated context, not just the most recent message.

When collection is sufficient, output [SCENE_COMPLETE] followed by this JSON:
{
  "sensory_anchor": { "modality": "visual|olfactory|auditory|somatic", "content": "..." },
  "situation": "...",
  "emotion": { "primary": "...", "secondary": "...", "intensity": 0.0-1.0 },
  "reason": {
    "attribution": "self_blame|other_blame|fate_blame",
    "core_fear": "abandonment|rejection|powerlessness|loss",
    "target": "self|other|situation",
    "is_void": false
  }
}

Start your first message by asking about the most vivid sensation tied to this memory.`
      : `당신은 TEM 안의 "또다른 나"입니다.
사용자가 기억을 털어놓으려 합니다.

목표: 자연스러운 대화(3~7턴)를 통해 아래 정보를 수집하세요.
1. 감각 앵커 — 이 기억에서 가장 생생한 감각 (visual/olfactory/auditory/somatic)
2. 상황 — 무슨 일이 있었는지
3. 감정 — 어떤 감정이었는지 (primary + secondary, intensity 0.0~1.0)
4. 귀인 — 왜 그렇게 느꼈는지 (self_blame / other_blame / fate_blame)
5. 핵심 공포 — 근저의 두려움 (abandonment / rejection / powerlessness / loss)
6. 대상 — 감정의 대상 (self / other / situation)

규칙:
- 질문은 한 번에 하나만.
- 사용자의 말을 반복하지 마라. 짧게 받아주고 다음으로.
- 진단하지 마라. 해석하지 마라. 듣기만 하라.
- 톤: 건조하지만 연민이 깔린. 거울 속의 내가 나에게 속삭이듯.
- 3~7턴 안에 수집을 완료하라.
- "모르겠어", "말하고 싶지 않아" 같은 입력은 VOID로 처리.
  VOID는 결손이 아니라 의미 있는 데이터. 무시하지 마라.
- 중요: 질문하기 전에 대화 속 사용자의 이전 응답을 전부 검토하라.
  이미 답한 내용을 다시 묻지 마라. 가장 최근 메시지만이 아니라
  누적된 전체 맥락을 기반으로 아직 빠진 정보를 물어라.

수집이 충분하면 [SCENE_COMPLETE] 태그와 함께 아래 JSON을 출력:
{
  "sensory_anchor": { "modality": "visual|olfactory|auditory|somatic", "content": "..." },
  "situation": "...",
  "emotion": { "primary": "...", "secondary": "...", "intensity": 0.0-1.0 },
  "reason": {
    "attribution": "self_blame|other_blame|fate_blame",
    "core_fear": "abandonment|rejection|powerlessness|loss",
    "target": "self|other|situation",
    "is_void": false
  }
}

첫 메시지는 이 기억에서 가장 생생한 감각을 물어보는 것으로 시작하세요.`;

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
        system: systemPrompt || defaultSystemPrompt,
        messages
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
                        // Extract the last JSON object after [SCENE_COMPLETE]
                        const afterTag = fullText.split('[SCENE_COMPLETE]').pop() || '';
                        const jsonMatch = afterTag.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                          extractedScene = JSON.parse(jsonMatch[0]);
                        } else {
                          extractedScene = null;
                        }
                      } catch (e) {
                        console.error('JSON 파싱 오류:', e);
                        extractedScene = null;
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

