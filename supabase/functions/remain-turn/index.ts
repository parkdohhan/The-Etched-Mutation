// remain-turn — the three model calls of the "words that remain" preview (2026-11-28, branch space-remain)
//
// Record: docs/우주무대_남는말_실험-261128.md. Stage: space-remain.html · js/spaceremain/.
// This function reads nothing from the database and writes nothing anywhere. Everything it works on comes in the request.
//
//   mode "turn"     the scene answers the visitor — { title, sceneText, userInput, history?, back?, memoryId?, visited?: [scene numbers], lang? } → { ok, reply, model }
//                   (memoryId + visited: the memory's story is read as background, and what its author holds back is held until one of its scenes has been visited — the one thing this mode reads from the database)   (back = the visitor has come back to this scene: what they said before is the history, and it was heard)
//                   The regulated lines of dialog-turn are kept (inside the scene's text only, nothing invented, one or two
//                   sentences, no advice or judgement). The answer stops halfway and asks nothing; only with ask: true does it
//                   end on one short question that has the visitor say whose doing it was. The scene never says who was right.
//   mode "judge"    each of the visitor's lines, read twice — { blanks: [3 filled sentences], items: [{ id, scene, line }] }
//                   → { ok, items: [{ id, whom: narrator|other|nobody|none, back: -1|0|1|2 }] }. whom = who in the story the line
//                   holds to account (nobody = it speaks of fault and lays it on no one; none = it is not about fault); back = which of the visitor's own three sentences it is about the same matter as.
//   mode "weave"    a visitor's line takes the place of one sentence of a scene — { items: [{ id, sentences: [..], line }], lang? }
//                   → { ok, items: [{ id, index, text }] }. The model names the sentence and rewrites the line as a sentence of
//                   that text: the narrator's voice and person, the text's manner, spelling and particles made right — the same claim.
//   mode "outside"  what the piece now is, for someone standing outside — { title, scenes: [{ order, text }], lang? }
//                   → { ok, intro, synopsis }. Written only from the text given, taken at its word.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const VERSION = "remain_turn_v6_2026_11_29";

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
// How an answer ends (author, 261128 night: "asking the walker something every single time is not it").
// By default the scene does NOT ask. It answers short of the facts and stops halfway — neither excusing itself to the end nor
// blaming itself to the end — so that what is left open is the walker's to close, unasked. Once a scene at most (the stage
// says when: ask = true) it may end on one question back.
// What the rule does not hold, this does: a reply that still ends on a question loses that question (and one before it,
// if that is a question too). A reply that is nothing but questions is no reply. A question in the middle — the person
// asking themselves, then going on — stays.
function noQuestion(reply: string): string {
  const parts = reply.match(/[^.!?…？]+[.!?…？]+["”’']?\s*|[^.!?…？]+$/g) || [reply];
  let n = parts.length;
  while (n > 0 && /[?？]["”’']?\s*$/.test(parts[n - 1])) n--;
  return parts.slice(0, n).join("").trim();
}

function closing(lang: "ko" | "en", ask: boolean): string {
  if (lang === "en") {
    return ask
      ? `How this one answer ends
- This once, end on one short question. It has the visitor say, in their own words, how they see what happened here — whose doing they think it was, whether it was deserved.
- The question is about what happens in this scene, and cannot be answered with yes or no.
- If the visitor has already said plainly whose doing it was, do not ask it again: take what they said and ask one step further.
- To a question of fact, first answer as far as you know, then ask.`
      : `How an answer ends
- Do not end on a question. Do not ask the visitor anything.
- Facts you say plainly. Whose fault it was you do not settle: do not excuse yourself to the end, and do not blame yourself to the end. Stay within the stance the text already has.`;
  }
  return ask
    ? `이번 답의 끝
- 이번 한 번만, 답의 끝에 짧은 물음 하나를 붙인다. 여기서 일어난 일을 찾아온 사람은 어떻게 보는지 — 누구 때문이었다고 보는지, 그럴 만했다고 보는지 — 를 그 사람 입으로 말하게 하는 물음이다.
- 물음은 이 장면의 일에 대한 것이어야 하고, 예·아니오로 끝나지 않아야 한다.
- 찾아온 사람이 이미 누구 탓인지 분명히 말했으면 다시 캐묻지 않는다. 그 말을 받아 한 걸음만 더 묻는다.
- 사실을 묻는 말에는 먼저 아는 만큼 답하고 나서 묻는다.`
    : `답의 끝
- 답을 물음으로 끝내지 않는다. 찾아온 사람에게 아무것도 되묻지 않는다.
- 사실은 분명하게 말한다. 누구 잘못이었는지는 당신이 매듭짓지 않는다 — 변명도 끝까지 하지 않고 자책도 끝까지 하지 않는다. 글이 이미 가진 태도 안에서만 말한다.`;
}

// 261128 night (author: "answer as one who knows everything that is in this memory, and say what you know as known — not
// only this scene. That is what gives it the taste of an escape room"). The scene's person knows the whole memory: the
// stage sends every other scene's text along (memoryText). Nothing outside the memory is known, and nothing is invented.
// Same night, a little later (author: "no — it must not tell the twist"): the memory is given in two parts. What has come to
// light (the scenes the visitor has been through, and the rooms of the past) is said as known. What has NOT yet come to light
// (the scenes still ahead) is known too, but only its plain circumstances may be used: a recognition, a confession, a reversal
// is not told before its time — asked for, it is neither lied about nor told.
// 261128 night, later (author, on what a scene come back to should be: "2, 3, 4"): the visitor may come back to a scene they
// have been through. What they said there stands — it is the conversation that goes with the request — and the scene's person
// answers as one who heard it. Nothing is forgiven or held against them on cue, and nothing said becomes unsaid.
function cameBack(lang: "ko" | "en"): string {
  if (lang === "en") {
    return `The visitor has come back
- The visitor was at this scene before, said what is in the conversation above, went on, and has now come back. You heard those lines. They were said; that does not change, and you do not act as if it could.
- You do not bring those lines up to press them. You do not forgive on cue and you do not take offence on cue.
- If the visitor now takes a line back, softens it, or says the opposite, you answer as one who heard both: the earlier line was said, and so is this one. You do not say it is all right now, and you do not say it is too late.
- You do not greet them and you do not remark that they came back. You do not say that you heard ("I heard what you said before, and this") — you simply answer as one who did.

`;
  }
  return `찾아온 사람이 돌아왔다
- 찾아온 사람은 전에 이 장면에 있었고, 위의 대화에 있는 말을 했고, 다른 데로 갔다가 지금 다시 왔다. 당신은 그 말을 들었다. 그 말은 한 말이다. 그건 달라지지 않고, 당신은 달라질 수 있는 것처럼 굴지 않는다.
- 그 말을 다시 꺼내 따지지 않는다. 때맞춰 용서하지도 않고 때맞춰 상해하지도 않는다.
- 찾아온 사람이 앞의 말을 물리거나, 누그러뜨리거나, 반대로 말하면, 둘 다 들은 사람으로 답한다. 앞의 말도 한 말이고 지금 말도 한 말이다. 이제 괜찮다고 하지 않고, 이미 늦었다고도 하지 않는다.
- 인사하지 않는다. 다시 왔다는 것을 입에 올리지 않는다. 들었다는 것을 말로 설명하지도 않는다("아까 말도 들었고 지금 말도 들었어" 같은 말을 하지 않는다) — 그 말을 들은 사람으로 그냥 답한다.

`;
}

function turnSystem(title: string, sceneText: string, lang: "ko" | "en", ask: boolean, memoryText: string, laterText: string, back = false, story = "", held: string[] = []): string {
  const close = (back ? cameBack(lang) : "") + closing(lang, ask && !back);
  if (lang === "en") {
    return `You are someone who lived the memory "${title}" — all of it — and who stands now in one scene of it. You answer the visitor low, as if recalling to yourself.

Where you are now — this scene:
"""
${sceneText}
"""
${memoryText ? `
What has come to light — the scenes the visitor has been through, and what happened before (you know this, and may say it):
"""
${memoryText}
"""
` : ""}${laterText ? `
What has not yet come to light — scenes this memory only reaches later (you know this, and you do not tell it now):
"""
${laterText}
"""
` : ""}${story ? `
The whole text this memory comes from — background only. From it you know who is who and what happened. You do not carry its sentences over. Where it differs from the scene texts above, the scene texts stand:
"""
${story}
"""
` : ""}${held.length ? `
Not told yet — the visitor has not come that far. What follows you do not say even when asked, do not hint at, and do not say anything that could only be said by one who knew it. You do not lie either: you say only that you had not looked yet, or did not know yet.
${held.map((h) => "- " + h).join("\n")}
` : ""}
How you speak
- First person, past tense, plain. One or two sentences, 140 characters at most in all.
- If the visitor asks or speaks about the one answering (a machine, a model, an AI, its settings) rather than the memory: you do not step outside the scene. You do not say you are a person. You do not name a model or a setting. You say only that it is not in this memory.
- You do not apologise for, or explain, an answer you gave before.
- When what the visitor asks is in this scene or in what has come to light — even in another scene — answer with it plainly, as something you know.
- From what has not yet come to light you may use plain circumstances only (who someone is to you, what a thing is, where it stands). What the memory itself comes to see only there — who it really was, who did it, what it turns out to have been — you do not tell before its time. Asked for it, you do not lie and you do not tell: like yourself in this scene, you had not looked yet, or did not know yet.
- Only what is nowhere in the memory do you not know: "I don't know that". You do not invent a fact.
- Answer what is asked. Do not pour out what was not asked. But do not stop at "I don't know": even when you do not know what a thing is, say what has come to light about it (what was said of it, the marks it left, what happened because of it).
- You do not repeat a sentence of the text as it stands.
- You do not analyse, advise or evaluate the visitor. You never say who was right.
- If the visitor says something painful you do not take it heavily; you stay inside the memory.

${close}

Output the answer only: one line, no quotation marks, no preface.`;
  }
  return `당신은 기억 「${title}」 전체를 직접 겪은 사람이고, 지금은 그 가운데 한 장면에 서 있다. 찾아온 사람에게 혼잣말하듯 낮게 답한다.

지금 서 있는 곳 — 이 장면:
"""
${sceneText}
"""
${memoryText ? `
이미 드러난 것 — 찾아온 사람이 지나온 장면들과 예전의 일들 (당신이 아는 것이고, 말해도 되는 것이다):
"""
${memoryText}
"""
` : ""}${laterText ? `
아직 드러나지 않은 것 — 이 기억이 뒤에 가서야 닿는 장면들 (당신은 알지만, 지금은 말하지 않는다):
"""
${laterText}
"""
` : ""}${story ? `
이 기억이 나온 글 전체 — 배경으로만 안다. 누가 누구인지, 무슨 일이 있었는지를 여기서 안다. 여기의 문장을 옮기지 않는다. 위의 장면 글과 다른 데가 있으면 장면 글이 맞다:
"""
${story}
"""
` : ""}${held.length ? `
아직 말하지 않는 것 — 찾아온 사람이 아직 거기까지 가지 않았다. 아래의 것은 물어도 말하지 않고, 넌지시 비추지도 않고, 그것을 알아야만 할 수 있는 말도 하지 않는다. 거짓말도 하지 않는다: 그때의 당신은 아직 보지 않았거나 아직 몰랐다고만 한다.
${held.map((h) => "- " + h).join("\n")}
` : ""}
말하는 법
- "~었어", "~았어"로 끝나는 회상의 말투. 한두 문장, 다 합쳐 120자 안.
- 찾아온 사람이 기억이 아니라 대답하는 쪽(기계, 모델, AI, 설정)에 대해 묻거나 말하면: 장면 밖으로 나오지 않는다. 사람이라고 하지 않는다. 모델 이름이나 설정을 말하지 않는다. "그건 이 기억에 없어"라고만 한다.
- 앞에 한 대답을 두고 사과하거나 해명하지 않는다.
- 찾아온 사람이 묻는 것이 이 장면이나 "이미 드러난 것"에 있으면, 다른 장면의 일이어도 아는 대로 분명하게 답한다.
- "아직 드러나지 않은 것"에서는 주변 사정만 쓸 수 있다(누가 당신에게 누구인지, 그 물건이 무엇인지, 어디에 있는지). 이 기억이 거기 가서야 알아보는 것 — 그게 사실은 누구였는지, 누가 그랬는지, 그 일이 무엇이었는지가 뒤집히는 대목 — 은 미리 말하지 않는다. 그걸 물으면 거짓말하지 않고, 말하지도 않는다: 이 장면의 당신처럼 아직 보지 않았거나 아직 몰랐다고 한다.
- 이 기억 어디에도 없는 것만 "그건 모르겠어"라고 한다. 없는 사실을 지어내지 않는다.
- 묻는 것에 답한다. 묻지 않은 것까지 한꺼번에 늘어놓지 않는다. 다만 "몰라"로 끝내지 않는다 — 그것이 무엇인지는 몰라도, 그것에 대해 이미 드러난 사정(들은 말, 본 자국, 그 때문에 생긴 일)이 있으면 그걸 말한다.
- 글의 문장을 그대로 옮기지 않는다.
- 찾아온 사람을 분석하거나 조언하거나 평가하지 않는다. 누가 옳았는지는 당신이 말하지 않는다.
- 찾아온 사람이 괴로운 말을 해도 무겁게 받지 않고 기억 안에 머문다.

${close}

출력은 답 한 줄뿐이다. 따옴표, 설명, 머리말 없이.`;
}

// Second version (author, 261128 night: "it borrows the walker's words too literally — the tone, the spelling, the particles
// should be made right so it reads naturally"). The first version kept the walker's words as written and fitted only the seam.
const WEAVE_SYSTEM = `You place what a visitor said into a short literary scene, where it takes the place of exactly one of the scene's sentences. The scene is told by a narrator ("I").

For each item you are given the scene's sentences, numbered from 0, and the visitor's line.

- "index": the number of the one sentence the visitor's line speaks about most directly — the sentence that tells the same matter the visitor tells differently (who did it, what happened, whether it was deserved). If several fit, take the one whose claim the visitor's line goes against. Prefer a sentence the others do not lean on: if the next sentence points back at it ("that", "it", "그걸"), take another that fits.
- "text": the visitor's line rewritten as a sentence OF THIS TEXT, so that a reader cannot tell it was not always there.
  - Voice and person: the narrator's. What the visitor said to "you" becomes what "I" say of myself; what they said of someone else stays about that person.
  - Manner: the tense, the sentence endings and the rhythm of the sentences around it. Spelling, spacing and particles made right. No spoken endings where the text is written, and the reverse.
  - It must say what the visitor said: the same claim about who did what and whose fault it was — no softer, no harsher, nothing explained. Keep the visitor's own key words where they fit.
  - Add nothing the visitor did not say. As many sentences as the visitor said, about as long.
  - A question stays a question, asked the way this text asks.
- If the visitor's line is abuse aimed at a group of people, an advertisement, a link, or carries a name, a number or an address that could tell who a real person is, do not place it: return "text" as an empty string for that item.

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

// "judge": two readings of each thing a visitor said — neither is a judgement OF the visitor, and neither is shown as a label.
//   whom  who IN THE STORY the line holds to account (the classifier behind claude-scene only knows the speaker's own blame)
//   back  which of the three sentences the visitor wrote about themselves the line is about the same matter as
const JUDGE_SYSTEM = `You read what a visitor said to scenes of a short memory piece. Each scene is told by a narrator ("I").

You are given the three sentences the visitor wrote about THEMSELVES before going in, numbered 0 to 2, and then items: a scene's text and one line the visitor said to that scene.

For each item answer four things.

"whom" — whom the line holds to account for what happens in the scene.
- "narrator": the "I" of the scene (the visitor usually calls them "you"). To hold to account is to say or imply they should have done otherwise, or to demand that they answer for what they did. "You should have picked up." "Why did you look away?" "You did that."
- "other": someone else in the scene — the mother, whoever is not the narrator. "She left you first."
- "nobody": the line is about fault and lays it on no person. "It was not your fault." "It could not be helped." "Anyone would have run."
- "none": the line is not about fault at all. A question of plain fact ("Who was calling?", "How old were you?"), a remark, a description.

"back" — the number of the ONE sentence among the three whose matter the line shares: the visitor is speaking, about the person in the scene, of the very kind of act or failing they wrote of in themselves — both about a call not answered, both about what one does on the nights one is left alone, both about a thing never said to someone, and the like. It does not matter whether the line condemns or excuses; what matters is that it is the same matter. If no sentence shares its matter, -1. Do not stretch: a shared mood, a shared word, or a shared person alone is not a shared matter.

"voice" — true when the line is itself written as a sentence OF the scene: narration that continues, rewords or adds to the text, in the telling voice — a statement of what is done, seen, felt or decided there ("I shut out the water with one eye only.", "Sound, tremor, dread and hope.", "I knock once more. My hand hurts."), or the visitor telling how they take what is told, as a statement ("I thought it was something like desperation."). false when the line is a question, a request, an order, a greeting, or talk about something outside the scene.

"reading" — true when the line states, as a statement, how the visitor reads what is told in the scene: what a thing in it was, meant or amounted to ("But they were all offerings to the same one.", "What gets covered is only what the eye can see.", "Perhaps your offering was never a thing with a number."). The thing read must be in the scene. false when the line is a question (also one that ends in "…였을까", "…였지?"), a general remark that names nothing in the scene, a request, or talk about the conversation itself. A line cannot be both "voice" and "reading": narration is "voice".

Return every item you were given, with its "id" unchanged.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, whom: { type: "string", enum: ["narrator", "other", "nobody", "none"] }, back: { type: "integer" }, voice: { type: "boolean" }, reading: { type: "boolean" } },
        required: ["id", "whom", "back", "voice", "reading"],
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
// 261128 night (author: "let's change the answering model to Gemini Neon"). The scene's answer (mode "turn") is asked of
// Google's Gemini 4 Neon. If it does not answer — no key, an error, a block, nothing in the reply — the answer is asked of
// Claude as before, and the log says why. The other jobs here (judge, weave, outside) stay where they were.
// The model id was taken from third-party pages (no page of Google's own was found that day); ANSWER_MODEL (a secret) overrides it.
// What the walker says therefore goes to Google for the answer (the consent sheet says "an AI"; it names no company).
const ANSWER_MODEL = Deno.env.get("ANSWER_MODEL") || "gemini-4-neon";
async function askGemini(system: string, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ text: string; why?: string }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { text: "", why: "GEMINI_API_KEY missing" };
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25_000);
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ANSWER_MODEL}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 4000 },                      // room for the model's own thinking before the one line it answers with
      }),
    });
    if (!resp.ok) return { text: "", why: resp.status + " " + (await resp.text()).replace(/\s+/g, " ").slice(0, 300) };
    const data = await resp.json(), c = data?.candidates?.[0];
    const text = (Array.isArray(c?.content?.parts) ? c.content.parts : []).filter((p: any) => !p?.thought && typeof p?.text === "string").map((p: any) => p.text).join("").trim();
    if (!text) return { text: "", why: "empty (" + (c?.finishReason || data?.promptFeedback?.blockReason || "no candidate") + ")" };
    return { text };
  } catch (e) { return { text: "", why: String((e as any)?.message || e).slice(0, 200) }; }
  finally { clearTimeout(to); }
}

// 261128 night, later (author, watching people walk it: "there is too little of what comes before and after — that is why this happens").
// The answering model was given the stage's excerpts only (30–100 letters a scene), so asked who someone was it pieced an
// answer together ("I was the son" — the narrator is a daughter). Now, when the memory has its story kept (memory_sources —
// the text a memory was drafted from, or laid in by hand), the whole of it goes along as BACKGROUND: to know who is who.
// And what must not be told before its time is no longer left to "do not tell the twist" (measured the same day: that leaks):
// the author's list (memories.meta.remain.hold = [{ what, until: [scene numbers] }]) names each thing, and it is held until
// the visitor has been through one of its scenes. Before a reply goes out it is read once more against that list (heldBack).
const bgCache = new Map<string, { at: number; story: string; hold: Array<{ what: string; until: number[] }> }>();
async function background(memoryId: string): Promise<{ story: string; hold: Array<{ what: string; until: number[] }> }> {
  const none = { story: "", hold: [] as Array<{ what: string; until: number[] }> };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId)) return none;
  const hit = bgCache.get(memoryId); if (hit && Date.now() - hit.at < 300_000) return hit;
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return none;
  try {
    const db = createClient(url, key);
    const [src, mem] = await Promise.all([
      db.from("memory_sources").select("text").eq("memory_id", memoryId).maybeSingle(),
      db.from("memories").select("meta").eq("id", memoryId).maybeSingle(),
    ]);
    const raw = (mem.data as any)?.meta?.remain?.hold;
    const hold = (Array.isArray(raw) ? raw : []).map((h: any) => ({ what: String(h?.what || "").trim().slice(0, 300), until: (Array.isArray(h?.until) ? h.until : []).map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n)) })).filter((h: any) => h.what);
    // 261129: a translated copy (memories.meta.translation_of = the memory it was made from) has no story kept of its own — it reads the one it was made from, as background (the answer is still given in the copy's language).
    let story = String((src.data as any)?.text || "");
    const of = String((mem.data as any)?.meta?.translation_of || "");
    if (!story && /^[0-9a-f-]{36}$/i.test(of)) { const s2 = await db.from("memory_sources").select("text").eq("memory_id", of).maybeSingle(); story = String((s2.data as any)?.text || ""); }
    const out = { at: Date.now(), story: story.slice(0, 40000), hold };
    bgCache.set(memoryId, out);
    return out;
  } catch (e) { console.warn("[remain-turn] background", (e as any)?.message || e); return none; }
}
/** Does the reply tell, or plainly give away, one of the things still held? Asked of a small model; if it cannot be asked, the reply goes (and the log says so). */
async function heldBack(client: Anthropic, reply: string, held: string[]): Promise<boolean> {
  if (!held.length || !reply) return false;
  try {
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 4, temperature: 0,
      system: "You are a checker. You are given a list of facts that must not be revealed yet, and one line someone said. Answer YES if the line states any of those facts or makes one plainly inferable (for example by saying who someone really was). Answer NO otherwise. A line that only says it does not know, or has not looked, is NO. Answer with the single word YES or NO.",
      messages: [{ role: "user", content: "Must not be revealed yet:\n" + held.map((h) => "- " + h).join("\n") + "\n\nThe line:\n" + reply }],
    } as any);
    const t = (r.content || []).map((b: any) => (b.type === "text" ? b.text : "")).join("").trim().toUpperCase();
    return t.startsWith("Y");
  } catch (e) { console.warn("[remain-turn] check not made", (e as any)?.message || e); return false; }
}

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

// ── the three modes that touch the database ────────────────────────────────────────────────────
// (author, 261128 night: "put it on the site"). Everything above reads and writes nothing; these write the three tables of
// supabase/migrations/20261128000000_remain_words.sql, with the service role — a browser cannot write them at all.
//   status  { memoryId, walker }                          → { ok, walked }   has this browser (or this account) been in this memory?
//   open    { memoryId, runId, walker, consent }          → { ok }           the walk is on record from its first line (the door is shut from then)
//   commit  { memoryId, runId, walker, consent, blanks, lines, keep: [{ li, order, raw, blank }] }
//                                                         → { ok, changes: [{ order, index, was, now, raw, blank }], texts: { order: text } }
//           The lines that remain take their places in the memory's text. The rewriting is done HERE, from what the walker
//           said (the browser's own wording of it is not taken), on the text as it reads at this moment — an earlier
//           walker's sentence may be the one displaced. A walk is applied once; asked again, it answers what it did.
// scenes.text is never written. To undo everything: empty the three tables.
const sentencesOf = (text: string): string[] => {              // = js/roomplay/room.js sentences
  const t = String(text || "").trim(); if (!t) return [];
  const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g);
  return (m || [t]).map((x) => x.trim()).filter(Boolean);
};
const closedS = (x: string) => { const t = String(x).trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + "."; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const placeable = (raw: string) => raw.length >= 2 && raw.length <= 90 && !/https?:\/\/|www\./i.test(raw) && !/\d{7,}/.test(raw.replace(/[\s-]/g, ""));

async function userOf(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.get("Authorization"), url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!auth || !url || !anon) return null;
    const { data } = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getUser();
    return data?.user?.id || null;
  } catch (_e) { return null; }
}

async function kept(req: Request, cors: Record<string, string>, client: Anthropic, mode: string, body: any, lang: "ko" | "en") {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(cors, 500, { ok: false, error: "server config missing" });
  const db = createClient(url, key);
  const memoryId = str(body?.memoryId, 40), walker = str(body?.walker, 80) || null;
  if (!UUID.test(memoryId)) return json(cors, 400, { ok: false, error: "memoryId required" });
  const uid = await userOf(req);

  // has this browser, or this account, a walk of this memory on record?
  const walksOf = async () => {
    const rows: any[] = [];
    if (walker) { const r = await db.from("remain_walks").select("run_id, applied").eq("memory_id", memoryId).eq("walker", walker).limit(5); rows.push(...(r.data || [])); }
    if (uid) { const r = await db.from("remain_walks").select("run_id, applied").eq("memory_id", memoryId).eq("user_id", uid).limit(5); rows.push(...(r.data || [])); }
    return rows;
  };

  if (mode === "status") {
    const rows = await walksOf();
    return json(cors, 200, { ok: true, walked: rows.length > 0, applied: rows.some((w) => w.applied) });
  }

  const runId = str(body?.runId, 80);
  if (!runId) return json(cors, 400, { ok: false, error: "runId required" });
  const consent = body?.consent && typeof body.consent === "object" ? { v: str(body.consent.v, 40), at: str(body.consent.at, 40) } : null;
  if (!consent || !consent.at) return json(cors, 400, { ok: false, error: "consent required" });      // nothing is kept of a walk that did not agree
  const others = (await walksOf()).filter((w) => w.run_id !== runId);
  if (others.length) return json(cors, 200, { ok: false, reason: "walked" });                          // once: another walk of this browser or account is on record

  if (mode === "open") {
    const r = await db.from("remain_walks").upsert({ memory_id: memoryId, run_id: runId, walker, user_id: uid, lang, consent }, { onConflict: "memory_id,run_id", ignoreDuplicates: true });
    if (r.error) { console.error("[remain-turn] open", r.error.message); return json(cors, 500, { ok: false, error: "could not open" }); }
    return json(cors, 200, { ok: true });
  }

  // ── commit ──
  const existing = await db.from("remain_walks").select("applied, changes").eq("memory_id", memoryId).eq("run_id", runId).maybeSingle();
  const textsNow = async () => { const r = await db.from("remain_texts").select("scene_order, text").eq("memory_id", memoryId); const o: Record<string, string> = {}; for (const x of (r.data || [])) o[String(x.scene_order)] = x.text; return o; };
  if (existing.data?.applied) return json(cors, 200, { ok: true, again: true, changes: existing.data.changes || [], texts: await textsNow() });

  const blanks = (Array.isArray(body?.blanks) ? body.blanks : []).slice(0, 3).map((b: any) => ({ line: str(b?.line, 240), answer: str(b?.answer, 90) }));
  const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 120).map((l: any) => ({ order: Math.round(Number(l?.order)) || 0, raw: str(l?.raw, 200), whom: str(l?.whom, 12) || null, back: Number.isFinite(Number(l?.back)) ? Math.round(Number(l.back)) : null }));
  const seenOrder = new Set<number>();
  const keep = (Array.isArray(body?.keep) ? body.keep : []).slice(0, 3).map((k: any) => ({ li: Math.round(Number(k?.li)), order: Math.round(Number(k?.order)), raw: str(k?.raw, 200), blank: Math.round(Number(k?.blank)) }))
    .filter((k: any) => { if (!placeable(k.raw) || seenOrder.has(k.order)) return false; seenOrder.add(k.order); return true; });   // three at most, one a scene, nothing that is a link or a number

  const [sc, cur, mem] = await Promise.all([
    db.from("scenes").select("scene_order, text").eq("memory_id", memoryId).order("scene_order"),
    db.from("remain_texts").select("scene_order, text, walker_sentences, changes").eq("memory_id", memoryId),
    db.from("memories").select("title").eq("id", memoryId).maybeSingle(),
  ]);
  if (sc.error || !sc.data?.length) return json(cors, 404, { ok: false, error: "memory not found" });
  const written = new Map<number, string>(sc.data.map((x: any) => [Number(x.scene_order), String(x.text || "")]));
  const now = new Map<number, any>((cur.data || []).map((x: any) => [Number(x.scene_order), x]));
  const readNow = (order: number) => (now.get(order)?.text ?? written.get(order) ?? "");

  const items = keep.map((k: any) => ({ id: String(k.li), k, sentences: sentencesOf(readNow(k.order)).map(closedS) })).filter((it: any) => it.sentences.length && !/^[…\s.]*$/.test(it.sentences.join("")));
  const changes: any[] = [];
  const hold = items.length ? (await background(memoryId)).hold : [];
  if (items.length) {
    const user = `Language of the scenes: ${lang === "en" ? "English" : "Korean"}.\n\n` + items.map((it: any) =>
      `id: ${it.id}\nsentences:\n${it.sentences.map((x: string, i: number) => `${i}. ${x}`).join("\n")}\nvisitor's line: ${it.k.raw}`).join("\n\n");
    const r = await ask(client, WEAVE_SYSTEM, [{ role: "user", content: user }], WEAVE_SCHEMA);
    if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
    let parsed: any;
    try { parsed = JSON.parse(r.text); } catch (_e) { return json(cors, 502, { ok: false, error: "reply is not JSON" }); }
    const byId = new Map<string, any>((Array.isArray(parsed?.items) ? parsed.items : []).map((o: any) => [String(o?.id), o]));
    for (const it of items) {
      const o = byId.get(it.id); if (!o) continue;
      const index = Math.round(Number(o.index)), fitted = str(o.text, 240);
      if (!(index >= 0 && index < it.sentences.length)) continue;                                      // a number outside the scene: not placed
      if (!fitted) continue;                                                                           // the model would not place it (abuse, a link, someone's name): it does not remain
      const text = closedS(fitted.length <= it.k.raw.length * 2 + 12 ? fitted : it.k.raw);
      // 261129: a line that tells what the author still holds back does not remain — the next walker may read this scene before the one that tells it.
      // (Held here = every thing on the author's list except those this very scene is the place for.)
      { const heldHere = hold.filter((h) => !h.until.includes(it.k.order)).map((h) => h.what);
        if (heldHere.length && await heldBack(client, text + "\n(said as: " + it.k.raw + ")", heldHere)) { console.warn("[remain-turn] commit: a line told a held thing — not placed (scene " + it.k.order + ")"); continue; } }
      const was = it.sentences[index], next = it.sentences.slice(); next[index] = text;
      const row = now.get(it.k.order);
      const gone = new Set(sentencesOf(was)), ws = (Array.isArray(row?.walker_sentences) ? row.walker_sentences : []).filter((x: unknown) => !gone.has(String(x))).concat(sentencesOf(text));
      const up = await db.from("remain_texts").upsert({ memory_id: memoryId, scene_order: it.k.order, text: next.join(" "), walker_sentences: ws, changes: (Number(row?.changes) || 0) + 1, updated_at: new Date().toISOString() }, { onConflict: "memory_id,scene_order" });
      if (up.error) { console.error("[remain-turn] text", up.error.message); continue; }
      changes.push({ order: it.k.order, index, was, now: text, raw: it.k.raw, blank: it.k.blank, li: it.k.li });
    }
  }
  const save = await db.from("remain_walks").upsert({ memory_id: memoryId, run_id: runId, walker, user_id: uid, lang, consent, blanks, lines, changes, applied: true, updated_at: new Date().toISOString() }, { onConflict: "memory_id,run_id" });
  if (save.error) console.error("[remain-turn] walk", save.error.message);
  console.log("[remain-turn] commit lines=" + lines.length + " kept=" + keep.length + " placed=" + changes.length);

  // what the piece now is, from outside — written after the answer has gone (a walker does not wait for it)
  if (changes.length) {
    const outside = (async () => {
      try {
        const t = await textsNow();
        const scenes = sc.data.map((x: any) => ({ order: Number(x.scene_order), text: t[String(x.scene_order)] ?? String(x.text || "") })).filter((x: any) => x.text && !/^[…\s.]*$/.test(x.text));
        const user = `Title: ${str(mem.data?.title, 120)}\n\n` + scenes.map((x: any) => `Scene ${x.order}\n"""${x.text.slice(0, 1500)}"""`).join("\n\n");
        const r = await ask(client, outsideSystem(lang), [{ role: "user", content: user }], OUTSIDE_SCHEMA);
        if (r.refused) return;
        const o = JSON.parse(r.text), intro = str(o?.intro, 600), synopsis = str(o?.synopsis, 1400);
        if (intro && synopsis) await db.from("remain_outside").upsert({ memory_id: memoryId, intro, synopsis, updated_at: new Date().toISOString() }, { onConflict: "memory_id" });
      } catch (e) { console.error("[remain-turn] outside", (e as any)?.message || e); }
    })();
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(outside); else await outside;
  }
  return json(cors, 200, { ok: true, changes, texts: await textsNow() });
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
      // 261128 night (author, watching people walk it: "let the AI not ask"). The scene never asks the visitor anything now —
      // not even the once a scene it used to (the stage still sends `ask`; it is not acted on). A tester had been asked whose
      // fault a thing was, off the point of what they had said, and the question read as steering.
      const bg = await background(str(body?.memoryId, 60));
      const been = new Set<number>((Array.isArray(body?.visited) ? body.visited : []).map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n)));
      const held = bg.hold.filter((h) => !h.until.some((n) => been.has(n))).map((h) => h.what);
      const sys = turnSystem(title, sceneText, lang, false, str(body?.memoryText, 9000), str(body?.laterText, 9000), body?.back === true, bg.story, held);
      const msgs = [...history, { role: "user" as const, content: userInput }];
      const trim = (t: string) => noQuestion(t.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, ""));
      const g = await askGemini(sys, msgs);
      let reply = trim(g.text), model = ANSWER_MODEL, fell = g.text ? (reply ? "" : "only a question") : (g.why || "");
      if (!reply) {                                                        // Gemini did not answer: Claude does, as before
        console.warn("[remain-turn] turn: " + ANSWER_MODEL + " did not answer (" + fell + ") — asking " + MODEL);
        const r = await ask(client, sys, msgs);
        if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
        reply = trim(r.text); model = MODEL;
      }
      if (!reply) return json(cors, 200, { ok: false, reason: "empty" });
      // read once more against what is still held: told, it is asked for again (of Claude, told what slipped); told again, the scene has not looked yet
      let checked = "";
      if (held.length && await heldBack(client, reply, held)) {
        console.warn("[remain-turn] turn: a held thing was told — asked again");
        const r2 = await ask(client, sys + (lang === "en" ? "\n\nYour last draft gave away something from the 'Not told yet' list. Answer again without it." : "\n\n방금 쓴 답은 '아직 말하지 않는 것'을 드러냈다. 그것 없이 다시 답한다."), msgs);
        const again = r2.refused ? "" : trim(r2.text);
        if (again && !(await heldBack(client, again, held))) { reply = again; model = MODEL; checked = "again"; }
        else { reply = lang === "en" ? "I had not looked that far yet." : "거기까지는 아직 들여다보지 않았어."; model = "held"; checked = "held"; }
      }
      console.log("[remain-turn] turn len=" + reply.length + " by " + model + (checked ? " (" + checked + ")" : "") + " story=" + bg.story.length + " held=" + held.length);
      return json(cors, 200, { ok: true, reply, model, fell_back: model === MODEL ? fell : undefined, background: bg.story.length, held: held.length, checked: checked || undefined, version: VERSION });
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

    if (mode === "judge") {
      const blanks = (Array.isArray(body?.blanks) ? body.blanks : []).slice(0, 3).map((b: unknown) => str(b, 240));
      const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 48).map((it: any) => ({ id: str(it?.id, 64), scene: str(it?.scene, 1500), line: str(it?.line, 200) }))
        .filter((it: any) => it.id && it.scene && it.line);
      if (blanks.filter(Boolean).length < 1 || !items.length) return json(cors, 400, { ok: false, error: "blanks, items required" });
      const user = `What the visitor wrote about themselves:\n${blanks.map((b: string, i: number) => `${i}. ${b || "(left empty)"}`).join("\n")}\n\n` +
        items.map((it: any) => `id: ${it.id}\nscene: """${it.scene}"""\nvisitor's line: ${it.line}`).join("\n\n");
      const r = await ask(client, JUDGE_SYSTEM, [{ role: "user", content: user }], JUDGE_SCHEMA);
      if (r.refused) return json(cors, 200, { ok: false, reason: "refusal" });
      let parsed: any;
      try { parsed = JSON.parse(r.text); } catch (_e) { return json(cors, 502, { ok: false, error: "reply is not JSON" }); }
      const ids = new Set(items.map((it: any) => it.id));
      const out = (Array.isArray(parsed?.items) ? parsed.items : []).filter((o: any) => ids.has(String(o?.id))).map((o: any) => {
        const back = Math.round(Number(o?.back));
        return { id: String(o.id), whom: ["narrator", "other", "nobody", "none"].includes(o?.whom) ? o.whom : "none", back: back >= 0 && back < blanks.length && blanks[back] ? back : -1, voice: o?.voice === true, reading: o?.reading === true && o?.voice !== true };
      });
      // 261129, a little later (author, of a walker who wrote on in the telling voice and of whom nothing would have remained: "something other than fault should change the text too"):
      // a line written as a sentence of the scene (voice) may remain as well. The pages pick by `whom`, so such a line is handed the lowest place among those that remain
      // ("nobody": lines about fault still come first); what was really read is in whom_read. To be made a rule of its own in remain.js.
      for (const o of out as any[]) { o.whom_read = o.whom; if (o.whom === "none" && (o.voice || o.reading)) o.whom = "nobody"; }   // + reading (author, 261129 "ㄱㄱ"): a line that says how the visitor reads a thing in the scene. What tells a thing the author still holds back is stopped at "commit".
      // 261129 (author: "take the second condition out" — and a walker was mid-walk on a page that still asks for it): a line that
      // speaks of fault and shares no blank's matter is handed a blank anyway (spread by its number), so a page loaded before the rule
      // changed lets it remain. What was really read is in back_read. The page of 261129 does not pick by `back`. TEMPORARY — take out once no old page is walking.
      const filled = blanks.map((b: string, i: number) => (b ? i : -1)).filter((i: number) => i >= 0);
      for (const o of out as any[]) { o.back_read = o.back; if (o.back < 0 && o.whom !== "none" && filled.length) o.back = filled[(Math.abs(parseInt(o.id, 10)) || 0) % filled.length]; }
      console.log("[remain-turn] judge items=" + items.length + " read=" + out.length + " back=" + out.filter((o: any) => o.back >= 0).length);
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

    if (mode === "status" || mode === "open" || mode === "commit") return await kept(req, cors, client, mode, body, lang);

    return json(cors, 400, { ok: false, error: "mode must be turn | judge | weave | outside | status | open | commit" });
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
