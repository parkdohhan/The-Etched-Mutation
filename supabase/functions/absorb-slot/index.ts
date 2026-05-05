// absorb-slot — V2.1.2 슬롯 흡수 LLM 자리 (2026-05-05 결정 번복)
//
// 배경:
//   V2.1.2 슬롯 흡수 자리 = 휴리스틱 NER (정규식). false positive 끝없음
//   ("엄마 손" → "그 사람" / "그랬던거같" → 명사 매치 등). 사용자 결정 (5-05) 으로
//   Haiku 4.5 호출하여 *문맥 파악 흡수* 박음. 차용 §6.2 "LLM 호출 X" 결정 번복.
//
// 호출 경로:
//   lumen_dialog_phase1.js turn 응답 자리에서
//     SlotAbsorber.tryAbsorbAsync({ playerInput, sceneContext, ghostTone, resonance })
//   → 본 edge function → Haiku 호출 → 흡수 응답 또는 null.
//
// 안전:
//   - safety.js safetyForAbsorb 통과 후만 호출 (트롤링/위기/인젝션 거부)
//   - temperature 0 (결정론)
//   - max_tokens 80 (짧은 응답)
//   - timeout 5초 (응답 지연 시 fallback)
//   - 빈 응답 / 너무 김 → null 리턴 (휴리스틱 fallback 자리)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

interface AbsorbRequest {
  playerInput: string;
  ghostTone?: string;       // "~었어" 체 같은 톤 가이드
  sceneContext?: string;    // 씬 본문 (참고용, 짧게)
  resonance?: 'resonance' | 'vague' | 'dissonance';
  memoryTitle?: string;     // 발자국 등
  motifs?: string[];        // 발자국 / 슬리퍼 / 마을 등
}

const TONE_BY_RESONANCE: Record<string, string> = {
  resonance: '동조 톤. "...그래.", "...맞아.", "...그치." 같은 동조 어휘로 시작. 플레이어 입력 핵심을 자기 회상으로 받아침.',
  vague: '흔들림 톤. "...그랬을지도", "...잘 기억 안 나" 같은 자리. 입력 핵심을 흡수하되 확신 X.',
  dissonance: '거부 톤. "...아니야. 내 기억은 달라.", "...그건 너의 자리지." 같은 자리. 입력 흡수는 약하게, 자기 결로 회귀.',
};

function buildSystemPrompt(req: AbsorbRequest): string {
  const tone = TONE_BY_RESONANCE[req.resonance || 'vague'] || TONE_BY_RESONANCE.vague;
  const ghostTone = req.ghostTone || '"~었어" 체. 자기 회상. 짧게.';
  const motifs = (req.motifs && req.motifs.length) ? req.motifs.join(', ') : '';
  const memTitle = req.memoryTitle || '';
  const sceneCtx = req.sceneContext || '';

  return `당신은 ${memTitle ? '"' + memTitle + '" 메모리의 ' : ''}유령. 화법: ${ghostTone}

규칙:
1. 한 응답 = 1~2문장, 50~80자.
2. 플레이어 입력의 *핵심 명사/감정*을 자연스럽게 흡수.
3. 자기 회상 톤. 분석/조언/평가 X.
4. ${tone}
5. ${motifs ? '메모리 모티프 (' + motifs + ') 자연스럽게 박을 수 있음.' : ''}
6. 결과는 응답 본문만 출력 (인용부호/태그 X).

${sceneCtx ? '씬 컨텍스트:\n' + sceneCtx + '\n' : ''}
예시:
플레이어: "엄마를 기다렸어"
응답: ...그래. 엄마. 그 자리에서 기다렸지. 발자국이 잘 남던 흙 위에서.

플레이어: "노란 우산이었어"
응답: ...노란 우산. 그건 너의 우산이지. 내 발자국 옆에 떨어지던 자리.

플레이어: "엄마 손이 그랬던 것 같아"
응답: ...그래. 엄마 손. 따뜻했던. 그 손이 어디로 갔지.`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: AbsorbRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const playerInput = String(body.playerInput || '').trim();
  if (!playerInput || playerInput.length > 200) {
    return new Response(JSON.stringify({ error: "playerInput required (1~200 chars)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    console.error("[absorb-slot] ANTHROPIC_API_KEY missing");
    return new Response(JSON.stringify({ error: "API key missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = buildSystemPrompt(body);

  // Haiku 4.5 호출 (빠름 + 저렴)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `플레이어: "${playerInput}"\n응답:` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error("[absorb-slot] Anthropic API error:", errData);
      return new Response(JSON.stringify({ error: "API error", details: errData }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = (data?.content?.[0]?.text || '').trim();

    if (!reply || reply.length < 5 || reply.length > 200) {
      console.warn("[absorb-slot] invalid reply length:", reply.length);
      return new Response(JSON.stringify({ ok: false, reason: "invalid_reply_length" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[absorb-slot] absorbed:", reply.slice(0, 60));
    return new Response(JSON.stringify({
      ok: true,
      reply,
      model: data?.model || 'claude-haiku-4-5-20251001',
      usage: data?.usage || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn("[absorb-slot] timeout 5s");
      return new Response(JSON.stringify({ ok: false, reason: "timeout" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[absorb-slot] exception:", err);
    return new Response(JSON.stringify({ ok: false, reason: "exception", message: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
