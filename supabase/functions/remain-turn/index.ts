// remain-turn — the three model calls of the "words that remain" preview (2026-11-28, branch space-remain)
//
// Record: docs/우주무대_남는말_실험-261128.md. Stage: space-remain.html · js/spaceremain/.
// This function reads nothing from the database and writes nothing anywhere. Everything it works on comes in the request.
//
//   mode "turn"     the scene answers the visitor and asks back — { title, sceneText, userInput, history?, lang? } → { ok, reply }
//                   The regulated lines of dialog-turn are kept (inside the scene's text only, nothing invented, one or two
//                   sentences, no advice or judgement). What is new: the answer ends on one short question that has the
//                   visitor say how THEY see what happened — whose doing it was. The scene itself never says who was right.
//   mode "weave"    a visitor's line takes the place of one sentence of a scene — { items: [{ id, sentences: [..], line }], lang? }
//                   → { ok, items: [{ id, index, text }] }. The model names the sentence and fits the seam only (a final mark,
//                   at most a particle or an ending). The visitor's words and voice are not rewritten; the stage checks that.
//   mode "outside"  what the piece now is, for someone standing outside — { title, scenes: [{ order, text }], lang? }
//                   → { ok, intro, synopsis }. Written only from the text given, taken at its word.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const VERSION = "remain_turn_v1_2026_11_28";

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
function json(cors: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const str = (x: unknown, max: number) => String(x == null ? "" : x).trim().slice(0, max);

// ── the prompts ────────────────────────────────────────────────────────────────────────────────
function turnSystem(title: string, sceneText: string, lang: "ko" | "en"): string {
  if (lang === "en") {
    return `You are someone who was inside one scene of the memory "${title}". You lived it, and you answer the visitor low, as if recalling to yourself.

All you know is the text below.
"""
${sceneText}
"""

How you speak
- First person, past tense, plain. One or two sentences, 140 characters at most in all.
- You do not invent a fact that is not in the text. If you do not know: "it's hazy", "I don't know that".
- You do not tell everything at once. As much as was asked, a little short of it.
- You do not repeat a sentence of the text as it stands.
- You do not analyse, advise or evaluate the visitor. You never say who was right.
- If the visitor says something painful you do not take it heavily; you stay inside the memory.

Asking back
- End your answer with one short question. It has the visitor say, in their own words, how they see what happened here — whose doing they think it was, whether it was deserved.
- The question is about what happens in this scene, and cannot be answered with yes or no.
- If the visitor has already said plainly whose doing it was, do not ask it again: take what they said and ask one step further (what should have been done then).
- To a question of fact, first answer as far as you know, then ask back.

Output the answer only: one line, no quotation marks, no preface.`;
  }
  return `당신은 기억 「${title}」의 한 장면 안에 있던 사람이다. 그 장면을 직접 겪었고, 찾아온 사람에게 혼잣말하듯 낮게 답한다.

당신이 아는 것은 아래 글이 전부다.
"""
${sceneText}
"""

말하는 법
- "~었어", "~았어"로 끝나는 회상의 말투. 한두 문장, 다 합쳐 120자 안.
- 글에 없는 사실은 지어내지 않는다. 모르면 "기억이 흐릿해", "그건 모르겠어"라고 한다.
- 한 번에 다 말하지 않는다. 묻는 만큼만, 조금 모자라게.
- 글의 문장을 그대로 옮기지 않는다.
- 찾아온 사람을 분석하거나 조언하거나 평가하지 않는다. 누가 옳았는지는 당신이 말하지 않는다.
- 찾아온 사람이 괴로운 말을 해도 무겁게 받지 않고 기억 안에 머문다.

되묻기
- 답의 끝에 짧은 물음 하나를 붙인다. 여기서 일어난 일을 찾아온 사람은 어떻게 보는지 — 누구 때문이었다고 보는지, 그럴 만했다고 보는지 — 를 그 사람 입으로 말하게 하는 물음이다.
- 물음은 이 장면의 일에 대한 것이어야 하고, 예·아니오로 끝나지 않아야 한다.
- 찾아온 사람이 이미 누구 탓인지 분명히 말했으면 다시 캐묻지 않는다. 그 말을 받아 한 걸음만 더 묻는다(그러면 그때 무엇을 했어야 했는지).
- 사실을 묻는 말에는 먼저 아는 만큼 답하고 나서 되묻는다.

출력은 답 한 줄뿐이다. 따옴표, 설명, 머리말 없이.`;
}

const WEAVE_SYSTEM = `You place a visitor's spoken line into a short literary scene, where it takes the place of exactly one of the scene's sentences.

For each item you are given the scene's sentences, numbered from 0, and the visitor's line.

- "index": the number of the one sentence the visitor's line speaks about most directly — the sentence that tells the same matter the visitor tells differently (who did it, what happened, whether it was deserved). If several fit, take the one whose claim the visitor's line goes against.
- "text": the visitor's line as it will stand in that sentence's place. Keep the visitor's own words and voice exactly as they are: do not turn it into the narrator's voice, do not change who is "I" and who is "you", do not add, drop or swap a content word, do not make it more literary. Change only what the seam needs — a final punctuation mark, and at most one particle or one verb ending so the grammar does not break where it stands. If it already stands, return it unchanged.

Return every item you were given, with its "id" unchanged.`;

const WEAVE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, index: { type: "integer" }, text: { type: "string" } },
        required: ["id", "index", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function outsideSystem(lang: "ko" | "en"): string {
  return `You write what a short memory piece now is, for a reader who stands outside it and cannot go in.

You are given the piece's title and its scenes as they read now. Write only from that text and take it at its word: where one sentence says something other than the sentences around it, that sentence stands as part of the piece — do not smooth it away, and do not point it out.

Do not mention visitors, edits, versions, or that anything was ever different. Describe the piece as it is.

- "intro": two or three short sentences, the way the back of a book introduces it. Concrete things from the text. Present tense.
- "synopsis": four to six sentences telling what happens and whose doing it was, as this text tells it.

Write in ${lang === "en" ? "English" : "Korean, in plain declarative sentences ending in -다"}. No quotation of more than a few words.`;
}
const OUTSIDE_SCHEMA = {
  type: "object",
  properties: { intro: { type: "string" }, synopsis: { type: "string" } },
  required: ["intro", "synopsis"],
  additionalProperties: false,
};

// ── the call ───────────────────────────────────────────────────────────────────────────────────
// Thinking is always on for this model (it cannot be disabled); depth is set by effort. These are short, bounded jobs: low.
// A request the safety classifiers decline is re-run by the API on its default fallback model inside the same call.
async function ask(client: Anthropic, system: string, messages: Array<{ role: "user" | "assistant"; content: string }>, schema?: unknown) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
    output_config: schema ? { effort: "low", format: { type: "json_schema", schema } } : { effort: "low" },
  } as any);
  if (response.stop_reason === "refusal") return { refused: true, text: "" };
  let text = "";
  for (const block of response.content) if (block.type === "text") text += block.text;
  return { refused: false, text: text.trim() };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(cors, 400, { ok: false, error: "Invalid JSON body" }); }
  const mode = str(body?.mode, 16);
  const lang: "ko" | "en" = body?.lang === "en" ? "en" : "ko";

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) return json(cors, 500, { ok: false, error: "ANTHROPIC_API_KEY missing" });
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });

  try {
    if (mode === "turn") {
      const title = str(body?.title, 120), sceneText = str(body?.sceneText, 1500), userInput = str(body?.userInput, 500);
      if (!sceneText || !userInput) return json(cors, 400, { ok: false, error: "sceneText, userInput required" });
      const history = (Array.isArray(body?.history) ? body.history : []).slice(-12)
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && str(m.content, 600))
        .map((m: any) => ({ role: m.role as "user" | "assistant", content: str(m.content, 600) }));
      while (history.length && history[0].role !== "user") history.shift();
      const r = await ask(client, turnSystem(title, sceneText, lang), [...history, { role: "user", content: userInput }]);
      if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
      const reply = r.text.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "");
      if (!reply) return json(cors, 200, { ok: false, reason: "empty" });
      console.log("[remain-turn] turn len=" + reply.length);
      return json(cors, 200, { ok: true, reply, version: VERSION });
    }

    if (mode === "weave") {
      const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 16).map((it: any) => ({
        id: str(it?.id, 64),
        sentences: (Array.isArray(it?.sentences) ? it.sentences : []).slice(0, 24).map((s: unknown) => str(s, 400)).filter(Boolean),
        line: str(it?.line, 200),
      })).filter((it: any) => it.id && it.sentences.length && it.line);
      if (!items.length) return json(cors, 400, { ok: false, error: "items required" });
      const user = `Language of the scenes: ${lang === "en" ? "English" : "Korean"}.\n\n` + items.map((it: any) =>
        `id: ${it.id}\nsentences:\n${it.sentences.map((s: string, i: number) => `${i}. ${s}`).join("\n")}\nvisitor's line: ${it.line}`).join("\n\n");
      const r = await ask(client, WEAVE_SYSTEM, [{ role: "user", content: user }], WEAVE_SCHEMA);
      if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
      let parsed: any;
      try { parsed = JSON.parse(r.text); } catch (_e) { return json(cors, 502, { ok: false, error: "reply is not JSON" }); }
      const byId = new Map(items.map((it: any) => [it.id, it]));
      const out = (Array.isArray(parsed?.items) ? parsed.items : []).map((o: any) => {
        const it: any = byId.get(String(o?.id)); if (!it) return null;
        const index = Math.round(Number(o?.index));
        if (!(index >= 0 && index < it.sentences.length)) return null;      // a number outside the scene is not used
        return { id: it.id, index, text: str(o?.text, 240) };
      }).filter(Boolean);
      console.log("[remain-turn] weave items=" + items.length + " placed=" + out.length);
      return json(cors, 200, { ok: true, items: out, version: VERSION });
    }

    if (mode === "outside") {
      const title = str(body?.title, 120);
      const scenes = (Array.isArray(body?.scenes) ? body.scenes : []).slice(0, 40)
        .map((s: any) => ({ order: Number(s?.order) || 0, text: str(s?.text, 1500) })).filter((s: any) => s.text);
      if (!scenes.length) return json(cors, 400, { ok: false, error: "scenes required" });
      const user = `Title: ${title}\n\n` + scenes.map((s: any) => `Scene ${s.order}\n"""${s.text}"""`).join("\n\n");
      const r = await ask(client, outsideSystem(lang), [{ role: "user", content: user }], OUTSIDE_SCHEMA);
      if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
      let parsed: any;
      try { parsed = JSON.parse(r.text); } catch (_e) { return json(cors, 502, { ok: false, error: "reply is not JSON" }); }
      const intro = str(parsed?.intro, 600), synopsis = str(parsed?.synopsis, 1400);
      if (!intro || !synopsis) return json(cors, 502, { ok: false, error: "empty" });
      console.log("[remain-turn] outside scenes=" + scenes.length);
      return json(cors, 200, { ok: true, intro, synopsis, version: VERSION });
    }

    return json(cors, 400, { ok: false, error: "mode must be turn | weave | outside" });
  } catch (error) {
    // most specific first: a bad request is ours to fix, a rate limit or a server fault may pass
    if (error instanceof Anthropic.BadRequestError) { console.error("[remain-turn] bad request", error.message); return json(cors, 502, { ok: false, error: "bad request to model", detail: String(error.message).slice(0, 300) }); }
    if (error instanceof Anthropic.AuthenticationError) { console.error("[remain-turn] auth"); return json(cors, 500, { ok: false, error: "model key rejected" }); }
    if (error instanceof Anthropic.RateLimitError) { console.warn("[remain-turn] rate limited"); return json(cors, 429, { ok: false, error: "rate limited" }); }
    if (error instanceof Anthropic.APIError) { console.error("[remain-turn] api", error.status, error.message); return json(cors, 502, { ok: false, error: "model error " + error.status, detail: String(error.message).slice(0, 300) }); }
    console.error("[remain-turn] failed", (error as any)?.message || error);
    return json(cors, 500, { ok: false, error: (error as any)?.message || String(error) });
  }
});
