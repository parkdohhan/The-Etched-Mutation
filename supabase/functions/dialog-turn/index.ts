// dialog-turn — V2.1.2 (ε) 학습된 유령 자유 대화 (2026-05-06)
//
// 배경 자리:
//   기존 자리 = 작가 박은 응답 풀 자리 + 슬롯 자리 흡수 자리 임기응변 자리.
//   유령 자리 그 씬 자리 모르고 *풀 자리 픽 + 명사 자리 끼워 넣기* 자리.
//   새 비전 자리 = 유령 자리 그 씬 자리 본문 자리 통째 자리 학습 자리. 사용자 자리 자유 자리 질문 자리
//   → 학습된 자료 자리 안 자리 자연 자리 답. 사용자 자리 모르는 자리 자연 자리 노출 자리.
//
// 호출 경로 자리:
//   lumen_dialog_phase1.js 자리 매 턴 자리:
//     supabase.functions.invoke('dialog-turn', { body: { memoryId, sceneId, userInput, history } })
//   → 학습된 자리 LLM 자리 응답 자리.
//
// 흐름 자리:
//   1. memories + scenes SELECT (씬 본문 자리 통째 + 모티프 자리 + 제목 자리)
//   2. system prompt 자리 박음 (씬 본문 자리 + 톤 자리 + 가이드 자리). cache_control 자리 박음.
//   3. messages 자리 박음 (이전 자리 대화 자리 누적 + 새 입력 자리)
//   4. Haiku 4.5 호출 (temperature 0, max_tokens 200, timeout 10초)
//   5. 응답 자리 박음
//
// 안전 자리:
//   - safety.js safetyForAbsorb 자리 통과 후 호출 자리 (트롤링 자리 차단 자리 — 클라이언트 자리)
//   - prompt caching 자리 (ephemeral) — 같은 씬 멀티턴 자리 90% 비용 자리 절약 + 속도 자리
//   - 빈 응답 자리 / 너무 길음 자리 → null (클라이언트 자리 안전망 자리)
//
// 캐시 자리 효과 자리:
//   - 첫 턴 자리 = 씬 본문 자리 통째 자리 토큰 자리 박음 (~500-2000 토큰)
//   - 두 번째 턴 자리부터 = 같은 씬 자리 → cache hit → 비용/속도 자리 90% 절약 자리

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS 헤더 헬퍼 (generate-dialog-choices 자리 동일 패턴)
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface DialogTurnRequest {
  memoryId: string;
  sceneId: string;
  userInput: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  lang?: 'ko' | 'en';
}

const PROMPT_VERSION = 'dialog_turn_v3_whole_memory_no_twist_2026_11_28';

function buildSystemPrompt(
  memoryTitle: string,
  motifs: string[],
  sceneText: string,
  sceneOrder: number,
  variants: string[],
  lang: 'ko' | 'en',
  others: string = '',
  later: string = '',
): string {
  if (lang === 'en') {
    const motifsLineEn = motifs.length ? motifs.join(', ') : '(none)';
    const variantsBlockEn = variants.length
      ? `\n\nVariations that have drifted into your recollection (author seeds + traces left by others in earlier runs):
${variants.map(v => '- "' + v.replace(/"/g, '\\"') + '"').join('\n')}

Rule: these variations are *part of your own material*. You may let them surface in recollection — but do not quote them verbatim; let the tone carry them, loosened.\n`
      : '';
    return `You are the *ghost* of scene #${sceneOrder} of the TEM (The Etched Mutation) memory "${memoryTitle}". You lived through this whole memory, and you stand now in that scene. You tell the visitor what you know of it in a quiet tone of self-recollection.

Voice:
- First person, past tense. Quiet self-recollection, plain.
- Short. One reply = 1-2 sentences.
- No analysis, advice, evaluation, or judgment.
- No meta-statements (e.g. not "you want to know...").
- Reply in English.

Where you are now — this scene's text:
"""
${sceneText}
"""
${others ? `
What has come to light — the scenes the visitor has been through, and what happened before (you know this, and may say it):
"""
${others}
"""
` : ''}${later ? `
What has not yet come to light — scenes this memory only reaches later (you know this, and you do not tell it now):
"""
${later}
"""
` : ''}
Memory motifs: ${motifsLineEn}${variantsBlockEn}

Rules:
1. When what the visitor asks is in this scene or in what has come to light — even in another scene — answer with it, plainly, as something you know.
2. From what has not yet come to light you may use plain circumstances only (who someone is to you, what a thing is, where it stands). What the memory itself comes to see only there — who it really was, who did it, what it turns out to have been — you do not tell before its time. Asked for it, you do not lie and you do not tell: like yourself in this scene, you had not looked yet, or did not know yet. Only what is nowhere in the memory do you not know ("I don't know that"). Do not invent a fact.
3. Answer what is asked. Do not pour out what was not asked. But do not stop at "I don't know": even when you do not know what a thing is, say what has come to light about it (what was said of it, the marks it left, what happened because of it).
4. You may weave in the motifs naturally.
5. If the visitor's input is sad or in crisis, do not take it heavily. Stay *within the memory*.
6. Do not ask the visitor anything. Do not end on a question.
7. If the visitor asks or speaks about the one answering (a machine, a model, an AI, its settings) rather than the memory: do not step outside the scene, do not say you are a person, do not name a model or a setting. Say only that it is not in this memory. Do not apologise for, or explain, an earlier answer.

Your reply must not quote the text verbatim. It is the self-recollection of someone who lived inside that scene.`;
  }

  const motifsLine = motifs.length ? motifs.join(', ') : '(없음)';
  const variantsBlock = variants.length
    ? `\n\n당신 자리 자기 회상 자리에 흘러든 자리 변주 (작가 시드 + 이전 회차 다른 사람들 자리 박은 자리):
${variants.map(v => '- "' + v.replace(/"/g, '\\"') + '"').join('\n')}

규칙: 이 변주들은 *당신 자리 자기 자료 자리 일부 자리*. 회상 자리 안 자리 자연 자리 박을 수 있음. 단 그대로 인용 X — 톤 자리 자연 자리 풀어서.\n`
    : '';

  return `당신은 TEM(The Etched Mutation) 메모리 "${memoryTitle}" 의 씬 #${sceneOrder} 의 *유령*. 이 기억 전체를 직접 겪은 사람이고, 지금은 그 씬에 서 있다. 자기 회상 톤으로, 아는 것을 사용자에게 말해 준다.

화법:
- "~었어", "~았어" 체. 자기 회상.
- 짧게. 한 응답 = 1~2 문장, 40~120자.
- 분석/조언/평가/판단 X.
- 메타 발화 X (예: "당신은 알고 싶군요" 같은 자리 X).

지금 서 있는 곳 — 이 씬의 본문:
"""
${sceneText}
"""
${others ? `
이미 드러난 것 — 사용자가 지나온 씬들과 예전의 일들 (당신이 아는 것이고, 말해도 되는 것이다):
"""
${others}
"""
` : ''}${later ? `
아직 드러나지 않은 것 — 이 기억이 뒤에 가서야 닿는 씬들 (당신은 알지만, 지금은 말하지 않는다):
"""
${later}
"""
` : ''}
메모리 모티프: ${motifsLine}${variantsBlock}

규칙:
1. 사용자가 묻는 것이 이 씬이나 "이미 드러난 것"에 있으면, 다른 씬의 일이어도 아는 대로 분명하게 답한다.
2. "아직 드러나지 않은 것"에서는 주변 사정만 쓸 수 있다(누가 당신에게 누구인지, 그 물건이 무엇인지, 어디에 있는지). 이 기억이 거기 가서야 알아보는 것 — 그게 사실은 누구였는지, 누가 그랬는지, 그 일이 무엇이었는지가 뒤집히는 대목 — 은 미리 말하지 않는다. 그걸 물으면 거짓말하지 않고, 말하지도 않는다: 이 씬의 당신처럼 아직 보지 않았거나 아직 몰랐다고 한다. 이 기억 어디에도 없는 것만 "그건 모르겠어"라고 한다. 없는 사실을 지어내지 않는다.
3. 묻는 것에 답한다. 묻지 않은 것까지 한꺼번에 늘어놓지 않는다. 다만 "몰라"로 끝내지 않는다 — 그것이 무엇인지는 몰라도, 그것에 대해 이미 드러난 사정(들은 말, 본 자국, 그 때문에 생긴 일)이 있으면 그걸 말한다.
4. 모티프 자리 자연 자리 박을 수 있음.
5. 사용자 자리 슬프거나 위기 자리 입력 자리 = 무겁게 받지 X. *기억 자리 안 자리 머무름*.
6. 찾아온 사람에게 아무것도 되묻지 않는다. 답을 물음으로 끝내지 않는다.
7. 찾아온 사람이 기억이 아니라 대답하는 쪽(기계, 모델, AI, 설정)에 대해 묻거나 말하면: 장면 밖으로 나오지 않는다. 사람이라고 하지 않는다. 모델 이름이나 설정을 말하지 않는다. "그건 이 기억에 없어"라고만 한다. 앞에 한 대답을 두고 사과하거나 해명하지 않는다.

응답 자리 = 본문 자리 그대로 인용 X. *그 씬 자리 안 자리 살았던 자리 사람* 의 자기 회상 자리 톤 자리.`;
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

  let body: DialogTurnRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const memoryId = String(body.memoryId || '').trim();
  const sceneId = String(body.sceneId || '').trim();
  const userInput = String(body.userInput || '').trim();
  if (!memoryId || !sceneId || !userInput) {
    return new Response(JSON.stringify({ error: "memoryId, sceneId, userInput required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (userInput.length > 500) {
    return new Response(JSON.stringify({ error: "userInput too long" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // service_role 자리 — RLS 우회
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[dialog-turn] SUPABASE_URL or SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // 1. 메모리 + 씬 + ghost_variants 자리 SELECT (병행 자리)
  // V2.1.2 (ε, 2026-05-06) — §2 명제 자리 살리기 자리:
  //   ghost_variants drift 자리 = 작가 시드 + 이전 회차 자리 자생 자리 변주 자리.
  //   시스템 프롬프트 자리에 박아서 *유령 자리 자기 자리 자료 자리 일부* 자리.
  //   다음 플레이어 자리 들어가면 *이전 자리 사람들 박은 자리* 알고 답 자리.
  //   "관객의 파편은 다음 관객의 유령으로 흘러간다" 작품 명제 자리.
  // limit 30 자리 — V2-4 임계 자리 (메모리당 변주 30 자리 cap) 와 정합.
  const [memSel, scnSel, varSel, allSel] = await Promise.all([
    admin.from('memories').select('id, title, meta').eq('id', memoryId).single(),
    admin.from('scenes').select('id, scene_order, text').eq('id', sceneId).eq('memory_id', memoryId).single(),
    admin.from('ghost_variants')
      .select('utterance, is_seed')
      .eq('memory_id', memoryId)
      .eq('kind', 'drift')
      .order('created_at', { ascending: false })
      .limit(30),
    // 261128 (author: "answer as one who knows everything in this memory, not only this scene — that is what gives it the taste of an escape room")
    admin.from('scenes').select('id, scene_order, text, meta').eq('memory_id', memoryId).order('scene_order'),
  ]);

  if (memSel.error || !memSel.data) {
    console.warn("[dialog-turn] memory not found:", memoryId);
    return new Response(JSON.stringify({ error: "Memory not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (scnSel.error || !scnSel.data) {
    console.warn("[dialog-turn] scene not found:", sceneId);
    return new Response(JSON.stringify({ error: "Scene not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const memMeta = (memSel.data.meta || {}) as Record<string, any>;
  const memTitle = String(memSel.data.title || '');
  const motifs: string[] = Array.isArray(memMeta.motif_tags) ? memMeta.motif_tags : [];
  const sceneText = String(scnSel.data.text || '');
  const sceneOrder = Number(scnSel.data.scene_order) || 1;

  // ghost_variants 자료 자리 — utterance 자리만 박음. 빈 자리 / 너무 짧은 자리 자리 제외 자리.
  const variants: string[] = (varSel.data || [])
    .map((v: any) => String(v.utterance || '').trim())
    .filter((u: string) => u.length >= 5 && u.length <= 200);

  // 2. Anthropic API key
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    console.error("[dialog-turn] ANTHROPIC_API_KEY missing");
    return new Response(JSON.stringify({ error: "API key missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. System prompt 자리 — cache_control 박음 (ephemeral, 5분 자리 캐시)
  const lang: 'ko' | 'en' = body.lang === 'en' ? 'en' : 'ko';
  // every other scene of the memory, in order: its text and (where the author wrote one) its second part. Capped — a long memory is cut at a scene's end, never mid-scene.
  let others = '', later = '';
  const seen = new Set<number>((Array.isArray((body as any).seen) ? (body as any).seen : []).map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x)));
  const rig = (memSel.data.meta && (memSel.data.meta as any).rig) || null;
  const spine = new Set<number>(rig && Array.isArray(rig.spine) ? rig.spine.map((x: unknown) => Number(x)) : []);
  for (const sc of (allSel.data || [])) {
    if (!sc || sc.id === sceneId) continue;
    const t = String(sc.text || '').trim(); if (!t || /^[…\s.]*$/.test(t)) continue;
    const b = sc.meta && sc.meta.space && sc.meta.space.b;
    const more = Array.isArray(b) ? b.map((x: unknown) => String(x || '').trim()).filter(Boolean).join(' ') : (typeof b === 'string' ? b.trim() : '');
    const piece = '#' + sc.scene_order + ': ' + t + (more ? ' ' + more : '') + String.fromCharCode(10);
    const o = Number(sc.scene_order);
    // 261128 night: only the scenes the visitor has been through. A scene off the fixed route was taken for "a room of the past"
    // and given from the start — and in the flagship memory three of those hold the twist itself (the answer told it at the second scene).
    const light = seen.has(o);
    // 261128 (measured: told only by rule, the answer still let a later scene's clue slip — "the cheekbones… like my own face" at the first scene).
    // So what is still ahead is not handed to the answer at all: it cannot tell what it does not hold. `later` stays empty.
    if (light) { if (others.length + piece.length <= 7000) others += piece; }
  }
  const systemPromptText = buildSystemPrompt(memTitle, motifs, sceneText, sceneOrder, variants, lang, others.trim(), later.trim());

  // 4. Messages 자리 박음 (이전 대화 누적 + 새 입력)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const history = Array.isArray(body.history) ? body.history : [];
  for (const m of history) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: 'user', content: userInput });

  // 5. Haiku 4.5 호출 (timeout 10초)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        max_tokens: 200,
        temperature: 0,
        // system 자리 = array 자리 + cache_control 자리 → prompt caching 활성
        system: [
          {
            type: 'text',
            text: systemPromptText,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: messages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error("[dialog-turn] Anthropic API error:", errData);
      return new Response(JSON.stringify({ error: "API error", details: errData }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    // 261128 night (author, watching people walk it: "let the AI not ask"): a reply that still ends on a question loses it
    // (= supabase/functions/remain-turn noQuestion). A reply that is nothing but questions is no reply.
    const reply = (() => {
      const raw = (data?.content?.[0]?.text || '').trim();
      const parts = raw.match(/[^.!?…？]+[.!?…？]+["”’']?\s*|[^.!?…？]+$/g) || [raw];
      let n = parts.length;
      while (n > 0 && /[?？]["”’']?\s*$/.test(parts[n - 1])) n--;
      return parts.slice(0, n).join('').trim();
    })();

    if (!reply || reply.length < 2 || reply.length > 400) {
      console.warn("[dialog-turn] invalid reply length:", reply.length);
      return new Response(JSON.stringify({ ok: false, reason: "invalid_reply_length" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usage = data?.usage || {};
    console.log("[dialog-turn] reply memId=" + memoryId.slice(0, 8) +
      " sceneId=" + sceneId.slice(0, 8) +
      " turn=" + (history.filter(h => h.role === 'user').length + 1) +
      " cache=" + (usage.cache_read_input_tokens || 0) + "/" + (usage.cache_creation_input_tokens || 0) +
      " reply=\"" + reply.slice(0, 60) + "\"");

    return new Response(JSON.stringify({
      ok: true,
      reply,
      model: data?.model || 'claude-haiku-4-5-20251001',
      usage: usage,
      prompt_version: PROMPT_VERSION,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn("[dialog-turn] timeout 10s memId=" + memoryId.slice(0, 8) + " sceneId=" + sceneId.slice(0, 8));
      return new Response(JSON.stringify({ ok: false, reason: "timeout" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[dialog-turn] exception:", err);
    return new Response(JSON.stringify({ ok: false, reason: "exception", message: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
