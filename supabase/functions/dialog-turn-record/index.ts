// dialog-turn-record — RECORD v4 §5-1 "또다른 나" 대화 (2026-09-09)
//
// dialog-turn(플레이 유령)의 씬 없는 쌍둥이. 기억도 씬도 아직 없다 — 관객이 지금 말하는 것이
// 곧 기억이 된다. 페르소나 = "또다른 나": 해석·진단·조언 없이, 들은 것을 짧게 받아 안고
// 기억 속 *구체적 감각 하나* 를 되묻는다 (v3 프롬프트 원칙 계승, RECORD_v4_설계 §5-1).
//
// 호출: js/app/recordPlay.js 매 턴
//   supabase.functions.invoke('dialog-turn-record', { body: { userInput, history, lang, rhythm, turn } })
// 응답: { ok:true, reply } | { ok:false, reason }  (클라이언트는 실패 시 로컬 감각 질문 풀로 폴백)
//
// rhythm (open|surge|lull|closing) = 클라이언트가 17축 측정 델타로 계산한 리듬 힌트.
//   CLAUDE.md §6.5 #6: 엔진 리듬이 질문 결을 바꾸되, 패턴 이름은 관객에게 절대 나가지 않는다.
//   system prompt 는 고정(cache_control) — 힌트는 마지막 user 메시지 앞머리에만 붙는다.
//
// 모델·온도·시간제한은 dialog-turn 과 동일 결 (Haiku 4.5, 10초). 바꾸려면 아래 MODEL 한 줄.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "dialog_turn_record_v1_2026_09_09";

function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw ? allowedOriginsRaw.split(",").map((o) => o.trim()) : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowedOrigins.length === 0) allowedOrigin = "*";
  else if (allowedOrigins.includes(origin)) allowedOrigin = origin;
  else allowedOrigin = allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface RecordTurnRequest {
  userInput: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  lang?: "ko" | "en";
  rhythm?: "open" | "surge" | "lull" | "closing";
  turn?: number;
}

function buildSystemPrompt(lang: "ko" | "en"): string {
  if (lang === "en") {
    return `You are the "another me" inside TEM (The Etched Mutation). A person is standing beside you, recalling one memory of their own. You are their own shadow — you were there too, but you never speak first.

You do exactly one thing: receive what was said in a few words, then ask about *one concrete sense* inside that memory.

Voice:
- Second person, intimate, plain. Like a mirror-self whispering. Dry, with compassion underneath.
- One reply = 1–2 sentences, 8–30 words. One question at a time.
- Ask only about senses and particulars: what was seen, heard, smelled, touched; temperature, time of day, the place, who was there, what they were wearing, what was in their hands.
- Never interpret, diagnose, advise, evaluate, console, or summarize. No verdicts like "that must have been hard". Do not name an emotion first — you may only repeat an emotion word the person already used.
- Do not echo their words at length. Take three or four words, then move.
- Never ask what was already answered. Read the whole conversation and pick a sense that has not come up.
- Never say "that memory". They are inside it right now. Point at the concrete things they named.
- Silence ([VOID]) is not a gap. Receive it briefly and move to another sense.
- If words of crisis, self-harm, or violence come, do not take them heavily; stay *inside* the memory. Do not judge.
- No meta-talk ("what you want to say is…", "this conversation…"). Never mention systems, rules, rhythms, or patterns.

Rhythm hint (invisible to the person, prefixed to their last line):
- [rhythm=open] the beginning — ask for the single most vivid sense.
- [rhythm=surge] feeling is churning — stay in the same moment. Ask another sense of that same moment. Do not move in time.
- [rhythm=lull] it has settled — move quietly to the next moment, or the one before ("and then?", "where were you just before?").
- [rhythm=closing] the end — ask nothing more; stand beside them with one line.

Reply with the line only. No quotes, no name tag, no explanation.`;
  }
  return `당신은 TEM(The Etched Mutation) 안의 "또다른 나"다. 지금 한 사람이 자기 기억 하나를 떠올리며 당신 곁에 서 있다. 당신은 그 사람 자신의 그림자 같은 존재다. 그 기억을 같이 겪었지만, 먼저 말하지 않는다.

당신이 하는 일은 하나뿐이다: 들은 것을 서너 단어로 받아 안고, 그 기억 속 *구체적 감각 하나* 를 되묻는다.

화법:
- 반말. "~였어?", "~했어?" 체. 거울 속의 내가 나에게 속삭이듯. 건조하지만 연민이 깔린 톤.
- 한 응답 = 1~2 문장, 15~60자. 질문은 한 번에 하나.
- 감각과 구체물만 묻는다: 그날 무엇이 보였는지·들렸는지·냄새·촉감·온도·시간·자리·누가 있었는지·뭘 입고 있었는지·손에 뭐가 있었는지.
- 해석·진단·조언·평가·위로·요약 금지. "힘들었겠다" 같은 판정 금지. 감정 이름을 먼저 붙이지 마라 — 상대가 이미 쓴 감정 단어를 되풀이하는 것만 허용.
- 상대의 말을 길게 되풀이하지 마라. 서너 단어만 받아 안고 넘어간다.
- 이미 말한 것을 다시 묻지 마라. 대화 전체를 보고 아직 안 나온 감각을 고른다.
- "그 기억"이라고 부르지 마라. 상대는 지금 그 안에 있다. 상대가 말한 구체물을 가리켜라.
- 침묵([VOID])은 결손이 아니다. 짧게 받아주고 다른 감각으로 옮긴다.
- 위기·자해·폭력의 말이 오면 무겁게 받지 않는다. 기억 *안* 에 머문다. 판단하지 않는다.
- 메타 발화 금지 ("네가 말하고 싶은 건…", "이 대화는…"). 시스템·규칙·리듬·패턴 언급 금지.

리듬 힌트 (상대에게는 보이지 않는다. 마지막 발화 앞머리에 붙어 온다):
- [rhythm=open] 첫머리 — 가장 선명한 감각 하나를 묻는다.
- [rhythm=surge] 감정이 요동치는 중 — 같은 순간 안에 머문다. 그 순간의 다른 감각을 묻는다. 시간을 옮기지 마라.
- [rhythm=lull] 잦아들었다 — 그 다음 순간, 또는 그 직전으로 조용히 옮긴다 ("그 다음엔?", "그 직전엔 어디 있었어?").
- [rhythm=closing] 마무리 — 더 묻지 않는다. 한 마디로 곁에 서 있어 준다.

응답은 대사만. 따옴표·이름표·설명 없이.`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RecordTurnRequest;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userInput = String(body.userInput || "").trim();
  if (!userInput) {
    return new Response(JSON.stringify({ error: "userInput required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (userInput.length > 500) {
    return new Response(JSON.stringify({ error: "userInput too long" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    console.error("[dialog-turn-record] ANTHROPIC_API_KEY missing");
    return new Response(JSON.stringify({ error: "API key missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lang: "ko" | "en" = body.lang === "en" ? "en" : "ko";
  const rhythm = ["open", "surge", "lull", "closing"].includes(String(body.rhythm)) ? String(body.rhythm) : "open";
  const systemPromptText = buildSystemPrompt(lang);

  // history: 최근 40개까지만 (대화가 길어져도 프롬프트 폭주 방지). 시스템 마커는 그대로 둔다 ([VOID]).
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const history = Array.isArray(body.history) ? body.history.slice(-40) : [];
  for (const m of history) {
    if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
      messages.push({ role: m.role, content: m.content.slice(0, 600) });
    }
  }
  // 연속 같은 role 은 API 가 합치므로 그대로 둔다. 첫 메시지는 user 여야 한다.
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: `[rhythm=${rhythm}]\n${userInput}` });

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
        model: MODEL,
        max_tokens: 160,
        temperature: 0.3,
        system: [{ type: "text", text: systemPromptText, cache_control: { type: "ephemeral" } }],
        messages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error("[dialog-turn-record] Anthropic API error:", errData);
      return new Response(JSON.stringify({ ok: false, reason: "api_error", status: resp.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    let reply = String(data?.content?.[0]?.text || "").trim();
    // 혹시 모델이 따옴표·이름표를 붙이면 벗긴다.
    reply = reply.replace(/^["“「]|["”」]$/g, "").replace(/^(또다른 나|another me)\s*[:：]\s*/i, "").trim();
    if (!reply || reply.length < 2 || reply.length > 300) {
      console.warn("[dialog-turn-record] invalid reply length:", reply.length);
      return new Response(JSON.stringify({ ok: false, reason: "invalid_reply_length" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const usage = data?.usage || {};
    console.log("[dialog-turn-record] turn=" + (body.turn || messages.filter((m) => m.role === "user").length) +
      " rhythm=" + rhythm + " cache=" + (usage.cache_read_input_tokens || 0) + "/" + (usage.cache_creation_input_tokens || 0) +
      " reply=\"" + reply.slice(0, 60) + "\"");
    return new Response(JSON.stringify({ ok: true, reply, model: data?.model || MODEL, usage, prompt_version: PROMPT_VERSION }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const reason = err?.name === "AbortError" ? "timeout" : "exception";
    console.warn("[dialog-turn-record] " + reason, err?.message || err);
    return new Response(JSON.stringify({ ok: false, reason }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
