// draft-memory-from-story — a short story in, the first draft of a memory out (2026-11-28)
//
// Author: "when a memory is made, two ways — put a short story in and have a first pass made by itself, or type it by hand."
// The making screen (record-space.html) sends the story; this returns scene cards for the author to correct: for each scene
// its first part, its second part, the words set afloat and the lines buried — every one of them copied out of the story.
// Nothing is written here by the model as if it were the author's: whatever is not found in the story, letter for letter,
// is taken out before the answer goes back (the stage's rule: no sentence that is not in the manuscript).
// The excerpt rule is the author's (260915: "do not carry the novel over — hold back"): 2–4 sentences, 30–100 letters.
//
// Request:  { story: string (400 … 60000 letters), lang?: 'ko'|'en', max?: number (scenes, ≤ 12) }
// Response: { ok: true, title, line, scenes: [{ text, b: [..], words: [..], deep: [..] }], taken_out: { scenes, lines } }
//           | { ok: false, error }
// It reads and writes nothing in the database. The story is not kept here (the making screen keeps it, privately, with the memory).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const VERSION = "draft_from_story_v1_2026_11_28";
const MIN_STORY = 400, MAX_STORY = 60000, MAX_SCENES = 12;

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

const SYSTEM = `You are given a short story. From it you set out the first draft of a "memory": a handful of scenes a visitor will walk through one at a time. The author will correct your draft by hand, so choose well and add nothing.

The one rule above all: every sentence, phrase and word you return must be COPIED OUT OF THE STORY, letter for letter. You may lift a sentence out of its paragraph. You may not write a sentence, join two, shorten one, correct one, or translate one.

What a scene is: a moment, not a summary. Something seen, done or said at one place and time. Take the moments the story turns on, in the story's own order. Hold back: a scene is a glimpse — do not carry the story over.

Return between 6 and {MAX} scenes (fewer if the story is very short). For each scene:
- "text": the scene's first part — 2 to 4 sentences of that moment, as they stand in the story (they need not be next to each other, but must be in the story's order), 30 to 100 letters in all.
- "b": the second part — 3 to 5 more short sentences or fragments from the same moment (what else is seen, or said, there). Each one copied exactly.
- "words": 1 to 3 short words or phrases from that moment (12 letters at most each) that could hang in the air by it. Copied exactly. No commas inside.
- "deep": 0 to 2 short sentences that lie under the moment — what is thought and not said. Copied exactly. No commas inside (leave a sentence out if it has one).

Do not put the same sentence in two places. Do not put the story's last turn into an early scene.

Also:
- "title": the story's own title if the text gives one (a first line standing alone), else an empty string.
- "line": one sentence copied from the story that could stand alone as its introduction (60 letters at most), or an empty string.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    line: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          b: { type: "array", items: { type: "string" } },
          words: { type: "array", items: { type: "string" } },
          deep: { type: "array", items: { type: "string" } },
        },
        required: ["text", "b", "words", "deep"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "line", "scenes"],
  additionalProperties: false,
};

// what counts as "in the story": the same letters, whatever the spacing and the style of the quotation marks
const norm = (s: string) => String(s || "").replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/\s+/g, " ").trim();
const bare = (s: string) => norm(s).replace(/^["'\s]+|["'\s.!?…]+$/g, "");
const sentencesOf = (text: string): string[] => {              // = js/roomplay/room.js sentences
  const t = String(text || "").trim(); if (!t) return [];
  const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g);
  return (m || [t]).map((x) => x.trim()).filter(Boolean);
};

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(cors, 400, { ok: false, error: "Invalid JSON body" }); }
  const story = String(body?.story || "").trim();
  if (story.length < MIN_STORY) return json(cors, 400, { ok: false, error: "story too short" });
  if (story.length > MAX_STORY) return json(cors, 400, { ok: false, error: "story too long" });   // not cut short behind the author's back: said, so they can cut it themselves
  const max = Math.max(3, Math.min(MAX_SCENES, Math.round(Number(body?.max)) || MAX_SCENES));

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) return json(cors, 500, { ok: false, error: "ANTHROPIC_API_KEY missing" });
  const client = new Anthropic({ apiKey, timeout: 140_000, maxRetries: 1 });

  try {
    // Thinking is always on for this model; depth is set by effort. Choosing the moments of a story is worth more than the least of it: medium.
    // A request the safety classifiers decline is re-run by the API on its default fallback model inside the same call.
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM.replace("{MAX}", String(max)),
      messages: [{ role: "user", content: `The story:\n"""\n${story}\n"""` }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    } as any);
    if (response.stop_reason === "refusal") return json(cors, 200, { ok: false, error: "refused" });
    let text = "";
    for (const block of response.content) if (block.type === "text") text += block.text;
    let parsed: any;
    try { parsed = JSON.parse(text); } catch (_e) { return json(cors, 502, { ok: false, error: "reply is not JSON" }); }

    // whatever is not in the story is taken out
    const hay = norm(story);
    const inStory = (frag: string) => { const b = bare(frag); return b.length >= 2 && hay.includes(b); };
    let outScenes = 0, outLines = 0;
    const used = new Set<string>();
    const fresh = (frag: string) => { const k = bare(frag); if (used.has(k)) return false; used.add(k); return true; };
    const scenes: any[] = [];
    for (const sc of (Array.isArray(parsed?.scenes) ? parsed.scenes : []).slice(0, max)) {
      const sents = sentencesOf(String(sc?.text || "")), kept = sents.filter((x) => inStory(x) && fresh(x));
      outLines += sents.length - kept.length;
      if (!kept.length) { outScenes++; continue; }
      const list = (x: unknown, cap: number, noComma: boolean) => {
        const all = (Array.isArray(x) ? x : []).map((y: unknown) => String(y || "").trim()).filter(Boolean);
        const ok = all.filter((y: string) => inStory(y) && (!noComma || !/[,，、]/.test(y)) && fresh(y));
        outLines += all.length - ok.length;
        return ok.slice(0, cap);
      };
      scenes.push({ text: kept.join(" "), b: list(sc?.b, 5, false), words: list(sc?.words, 3, true), deep: list(sc?.deep, 2, true) });
    }
    if (!scenes.length) return json(cors, 502, { ok: false, error: "nothing from the story came back" });
    const title = String(parsed?.title || "").trim(), line = String(parsed?.line || "").trim();
    console.log("[draft-memory-from-story] story=" + story.length + " scenes=" + scenes.length + " taken_out=" + outScenes + "/" + outLines);
    return json(cors, 200, { ok: true, title: inStory(title) ? title.slice(0, 60) : "", line: inStory(line) ? line.slice(0, 120) : "", scenes, taken_out: { scenes: outScenes, lines: outLines }, version: VERSION });
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError) { console.error("[draft-memory-from-story] bad request", error.message); return json(cors, 502, { ok: false, error: "bad request to model", detail: String(error.message).slice(0, 300) }); }
    if (error instanceof Anthropic.AuthenticationError) return json(cors, 500, { ok: false, error: "model key rejected" });
    if (error instanceof Anthropic.RateLimitError) return json(cors, 429, { ok: false, error: "rate limited" });
    if (error instanceof Anthropic.APIError) { console.error("[draft-memory-from-story] api", error.status, error.message); return json(cors, 502, { ok: false, error: "model error " + error.status }); }
    console.error("[draft-memory-from-story] failed", (error as any)?.message || error);
    return json(cors, 500, { ok: false, error: (error as any)?.message || String(error) });
  }
});
