// generate-scene-thing — one line sculpture (a drawing recipe) for one scene, in the one-walk grammar (2026-11-23)
//
// Decision: docs/우주무대_기억만들기_결정-261123.md (U1 stays: no 3D asset — the thing is drawn in code from a recipe).
// The space stage (js/spaceplay/things.js fromRecipe) reads scenes.meta.space.thing = this recipe. The ten things of
// UNDW-001 stay hand-drawn in that file; this function is for memories made in record-space.html.
//
// Request: { sceneText, b?: string|string[], words?: string[], deep?: string[], lang?: 'ko'|'en', avoid?: string }
//   avoid = the note of the recipe the author just rejected (so the next one is drawn differently).
// Response: { ok: true, recipe } | { ok: false, error }
//
// Recipe v1 (every number is clamped here AND again in the stage — a broken recipe never breaks the stage):
//   { v: 1, h, note, parts: [ {k:'box', size:[w,h,d], at, rot?, m?} | {k:'cyl', r:[top,bottom], h, n?, at, rot?, m?}
//     | {k:'ico', r, detail?, scale?, at, rot?, m?} | {k:'cone', r, h, n?, at, rot?, m?} | {k:'stroke', pts:[[x,y,z]…], closed?, m?}
//     | {k:'oval', r:[rx,rz], n?, at, rot?, m?} | {k:'glow', c?, size, o?, at} | {k:'profile', s, mirror?, at, m?} | {k:'garment', y, m?} ],
//     motion: [ {i, k:'spin'|'bob'|'sway'|'ring'|'pulse'|'drift', v?, amp?, axis?, lo?, hi?} ] }
//   m (material) = line (bright edge) | dim (receding) | amber (what the walker brings) | blue | rust.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MODEL = "claude-sonnet-5";
const VERSION = "scene_thing_v1_2026_11_23";
const MAX_PARTS = 28, MAX_PTS = 64, MAX_MOTION = 12;

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

// ── the sanitizer (the same rules as js/spaceplay/things.js sanitizeRecipe) ─────────────────────────
const MATS = new Set(["line", "dim", "amber", "blue", "rust"]);
const GLOWS = new Set(["amber", "blue", "line", "rust", "white", "dim"]);
const num = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const vec3 = (x: unknown, lo: number, hi: number, yLo?: number) => {
  const a = Array.isArray(x) ? x : [];
  return [num(a[0], lo, hi, 0), num(a[1], yLo === undefined ? lo : yLo, hi, 0), num(a[2], lo, hi, 0)];
};
const mat = (x: unknown, d = "line") => (typeof x === "string" && MATS.has(x) ? x : d);
export function sanitizeRecipe(r: any): any | null {
  if (!r || typeof r !== "object" || !Array.isArray(r.parts)) return null;
  const parts: any[] = [];
  for (const p of r.parts.slice(0, MAX_PARTS)) {
    if (!p || typeof p !== "object" || typeof p.k !== "string") continue;
    const at = vec3(p.at, -5, 5, -0.5), rot = vec3(p.rot, -7, 7), m = mat(p.m);
    switch (p.k) {
      case "box": { const s = Array.isArray(p.size) ? p.size : []; parts.push({ k: "box", size: [num(s[0], 0.03, 4.5, 0.5), num(s[1], 0.03, 4.5, 0.5), num(s[2], 0.03, 4.5, 0.5)], at, rot, m }); break; }
      case "cyl": { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: "cyl", r: [num(rr[0], 0, 2.5, 0.2), num(rr[1], 0, 2.5, 0.3)], h: num(p.h, 0.05, 4.5, 1), n: Math.round(num(p.n, 3, 24, 8)), at, rot, m }); break; }
      case "ico": { const sc = Array.isArray(p.scale) ? p.scale : [1, 1, 1]; parts.push({ k: "ico", r: num(p.r, 0.03, 2.5, 0.3), detail: num(p.detail, 0, 1, 0) >= 0.5 ? 1 : 0, scale: [num(sc[0], 0.05, 4, 1), num(sc[1], 0.05, 4, 1), num(sc[2], 0.05, 4, 1)], at, rot, m }); break; }
      case "cone": parts.push({ k: "cone", r: num(p.r, 0.03, 2.5, 0.2), h: num(p.h, 0.05, 4.5, 0.5), n: Math.round(num(p.n, 3, 24, 6)), at, rot, m }); break;
      case "stroke": {
        const pts = (Array.isArray(p.pts) ? p.pts : []).slice(0, MAX_PTS).map((q: unknown) => vec3(q, -5, 5, -0.5));
        if (pts.length >= 2) parts.push({ k: "stroke", pts, closed: !!p.closed, m });
        break;
      }
      case "oval": { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: "oval", r: [num(rr[0], 0.03, 3, 0.5), num(rr[1], 0.03, 3, 0.5)], n: Math.round(num(p.n, 8, 80, 40)), at, rot, m }); break; }
      case "glow": parts.push({ k: "glow", c: typeof p.c === "string" && GLOWS.has(p.c) ? p.c : "amber", size: num(p.size, 0.2, 3.5, 1.2), o: num(p.o, 0.05, 0.9, 0.5), at }); break;
      case "profile": parts.push({ k: "profile", s: num(p.s, 0.5, 3.5, 2), mirror: !!p.mirror, at, m }); break;
      case "garment": parts.push({ k: "garment", y: num(p.y, -0.5, 4, 1), m }); break;
      default: break;
    }
  }
  if (!parts.length) return null;
  const motion: any[] = [];
  for (const mo of (Array.isArray(r.motion) ? r.motion : []).slice(0, MAX_MOTION)) {
    if (!mo || typeof mo !== "object") continue;
    const i = Math.round(num(mo.i, 0, parts.length - 1, -1));
    if (i < 0 || i >= parts.length) continue;
    const k = ["spin", "bob", "sway", "ring", "pulse", "drift"].includes(mo.k) ? mo.k : null;
    if (!k) continue;
    motion.push({ i, k, v: num(mo.v, 0.01, 3, 0.4), amp: num(mo.amp, 0.005, 0.6, 0.08), axis: ["x", "y", "z"].includes(mo.axis) ? mo.axis : "y", lo: num(mo.lo, 0, 1, 0.25), hi: num(mo.hi, 0, 1, 0.6) });
  }
  // how tall it stands: given, or read off the parts
  let top = 0;
  for (const p of parts) {
    if (p.k === "stroke") for (const q of p.pts) top = Math.max(top, q[1]);
    else if (p.k === "box") top = Math.max(top, p.at[1] + p.size[1] / 2);
    else if (p.k === "cyl" || p.k === "cone") top = Math.max(top, p.at[1] + p.h / 2);
    else if (p.k === "ico") top = Math.max(top, p.at[1] + p.r * p.scale[1]);
    else if (p.k === "profile") top = Math.max(top, p.at[1] + 1.3 * p.s);
    else if (p.k === "garment") top = Math.max(top, p.y + 0.6);
    else if (p.k === "oval" || p.k === "glow") top = Math.max(top, p.at[1]);
  }
  const h = num(r.h, 0.5, 4.5, Math.max(0.6, Math.min(4.5, top || 2.2)));
  const note = String(r.note || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return { v: 1, h, note, parts, motion, version: VERSION };
}

// ── the grammar, said to the model ─────────────────────────────────────────────────────────────
const SYSTEM = `You design ONE small line sculpture for ONE scene of a personal memory, in a fixed drawing grammar, and answer with a JSON recipe only (no prose, no code fence).

The grammar (from a stage where every scene stands as one thing in a black place):
- Solids are drawn as black bodies with bright edges; lines are thin and single. Nothing is textured or realistic.
- Materials: "line" = bright edge (default), "dim" = what recedes or is secondary, "amber" = the ONE charged detail the walker will carry — use amber for at most one or two small parts (a short stroke, one small glow, one sheet), "blue"/"rust" = rare accents.
- It stands on the ground y=0, centred near x=0,z=0, is 1.2 to 3.5 tall and fits inside a 4.5 by 4.5 by 4.5 box.
- Depict a concrete thing the scene literally holds — an object, a piece of furniture, a place, an animal, a garment, a vessel. Choose the thing the scene turns on, not a symbol of its mood. Never letters or words. No detailed faces (the "profile" part is the only face allowed: a face in profile as one line). A standing person = a tapered "cyl" body with an "ico" head (see example 2). Keep it spare: 6 to 20 parts.
- Optional slow motion, one or two at most: "spin" (turns slowly), "bob" (rises and falls a little), "sway" (rocks), "ring" (shivers during a repeating beat, for a thing that rings or buzzes), "pulse" (a glow or screen that brightens and dims), "drift" (circles slowly round the middle — for things set loose around the main thing).
- "note": one short line, in the scene's own language, saying what is drawn (for the author). Do not copy any sentence of the scene.

Parts (every number is a plain number; "at" = [x,y,z] position of the part's centre, "rot" = [rx,ry,rz] radians, optional):
  {"k":"box","size":[w,h,d],"at":[x,y,z],"rot":[rx,ry,rz],"m":"line"}
  {"k":"cyl","r":[topRadius,bottomRadius],"h":height,"n":sides,"at":[..],"rot":[..],"m":"line"}
  {"k":"ico","r":radius,"detail":0,"scale":[sx,sy,sz],"at":[..],"rot":[..],"m":"line"}     (a faceted ball; scaled, a lying body or a folded cloth)
  {"k":"cone","r":radius,"h":height,"n":sides,"at":[..],"rot":[..],"m":"line"}
  {"k":"stroke","pts":[[x,y,z],[x,y,z],...],"closed":false,"m":"dim"}                           (a polyline; up to 64 points; closed joins the ends)
  {"k":"oval","r":[rx,rz],"n":40,"at":[..],"rot":[..],"m":"dim"}                               (a flat ring lying in the x–z plane; rotate it to stand)
  {"k":"glow","c":"amber","size":1.2,"o":0.5,"at":[..]}                                         (a soft light spot; c = amber|blue|line|rust|white)
  {"k":"profile","s":2.3,"mirror":false,"at":[x,0,z],"m":"line"}                               (a face in profile, standing, s = its scale)
  {"k":"garment","y":1.4,"m":"line"}                                                           (one hanging garment outline, centred at x=0, at height y)
Motion: {"i":partIndex,"k":"spin","axis":"y","v":0.05} | {"i":..,"k":"bob","amp":0.12,"v":0.5} | {"i":..,"k":"sway","axis":"z","amp":0.04,"v":0.9} | {"i":..,"k":"ring","amp":0.035} | {"i":..,"k":"pulse","lo":0.25,"hi":0.6} | {"i":..,"k":"drift","v":0.12}

Example 1 — a scene in a bathroom, a mother in the tub:
{"v":1,"h":1.15,"note":"욕조 하나, 물 위에 흔들리는 두 개의 희미한 타원","parts":[
 {"k":"box","size":[3.3,1.1,1.6],"at":[0,0.55,0],"m":"line"},
 {"k":"stroke","pts":[[-1.5,1.1,-0.65],[1.5,1.1,-0.65],[1.5,1.1,0.65],[-1.5,1.1,0.65]],"closed":true,"m":"dim"},
 {"k":"oval","r":[0.5,0.36],"n":44,"at":[0.55,1.115,0],"m":"dim"},
 {"k":"oval","r":[0.5,0.36],"n":44,"at":[0.55,1.12,0],"m":"dim"},
 {"k":"glow","c":"blue","size":1.5,"o":0.16,"at":[0.55,1.15,0]}],
 "motion":[{"i":2,"k":"sway","axis":"y","amp":0.05,"v":0.9},{"i":3,"k":"bob","amp":0.01,"v":0.37}]}

Example 2 — two people standing, a telephone ringing on a stand, papers adrift:
{"v":1,"h":1.9,"note":"받침대 위의 전화기와 그 둘레를 떠다니는 종이들","parts":[
 {"k":"box","size":[1.1,0.8,0.8],"at":[0,0.4,0],"m":"line"},
 {"k":"box","size":[0.55,0.2,0.42],"at":[0,0.9,0],"m":"line"},
 {"k":"box","size":[0.78,0.1,0.14],"at":[0,1.07,0],"m":"line"},
 {"k":"oval","r":[0.13,0.13],"n":16,"at":[0,1.005,0],"m":"dim"},
 {"k":"stroke","pts":[[0.4,1.02,0.2],[0.55,0.8,0.24],[0.7,0.55,0.18],[0.85,0.3,0.22],[0.9,0.02,0.2]],"m":"dim"},
 {"k":"stroke","pts":[[-0.3,1.3,-0.4],[0.3,1.3,-0.4],[0.3,1.3,0.4],[-0.3,1.3,0.4]],"closed":true,"m":"amber"},
 {"k":"cyl","r":[0.2,0.52],"h":2.5,"n":6,"at":[2.2,1.25,-0.6],"m":"dim"},
 {"k":"ico","r":0.24,"detail":0,"at":[2.2,2.78,-0.6],"m":"dim"}],
 "motion":[{"i":1,"k":"ring","amp":0.035},{"i":2,"k":"ring","amp":0.035},{"i":5,"k":"drift","v":0.12},{"i":5,"k":"bob","amp":0.12,"v":0.5}]}

Answer with the JSON recipe only.`;

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(cors, 400, { ok: false, error: "Invalid JSON body" }); }
  const sceneText = String(body?.sceneText || "").trim().slice(0, 1200);
  if (!sceneText) return json(cors, 400, { ok: false, error: "sceneText required" });
  const lang: "ko" | "en" = body?.lang === "en" ? "en" : "ko";
  const bRaw = body?.b;
  const b = (Array.isArray(bRaw) ? bRaw.map((x: unknown) => String(x || "")).join(" ") : String(bRaw || "")).trim().slice(0, 800);
  const strs = (x: unknown) => (Array.isArray(x) ? x : []).map((s: unknown) => String(s || "").trim()).filter(Boolean).slice(0, 12).join(", ").slice(0, 300);
  const words = strs(body?.words), deep = strs(body?.deep);
  const avoid = String(body?.avoid || "").trim().slice(0, 160);
  // 261128 (the editing tool, memory-edit.html — author: "let me write the prompt I want when a thing is made"): what the author asks for, in their own words
  const want = String(body?.want || "").trim().slice(0, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) return json(cors, 500, { ok: false, error: "ANTHROPIC_API_KEY missing" });

  const user = [
    `Scene language: ${lang === "en" ? "English" : "Korean"} (write "note" in that language).`,
    `Scene text:\n"""${sceneText}"""`,
    b ? `Second part of the scene (the author's own, read after the first):\n"""${b}"""` : "",
    words ? `Words set afloat round the scene: ${words}` : "",
    deep ? `Words buried in the scene: ${deep}` : "",
    avoid ? `The author rejected a recipe described as: "${avoid}". Draw a different thing of the scene, or the same thing in a clearly different way.` : "",
    want ? `What the author asks to be drawn, above everything else: "${want}". Draw THAT, in this grammar. The scene's text only tells where it belongs.` : "",
    "Return the recipe JSON now.",
  ].filter(Boolean).join("\n\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      // no temperature: this model refuses the field ("temperature is deprecated for this model", 261123)
      body: JSON.stringify({ model: MODEL, thinking: { type: "disabled" }, max_tokens: 2600, system: SYSTEM, messages: [{ role: "user", content: user }] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[generate-scene-thing] model error", resp.status, t.slice(0, 300));
      return json(cors, 502, { ok: false, error: "model error " + resp.status });
    }
    const data = await resp.json();
    const text = String(data?.content?.[0]?.text || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json(cors, 502, { ok: false, error: "no recipe in reply" });
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch (_e) { return json(cors, 502, { ok: false, error: "recipe is not valid JSON" }); }
    const recipe = sanitizeRecipe(parsed);
    if (!recipe) return json(cors, 502, { ok: false, error: "recipe has no usable part" });
    console.log("[generate-scene-thing] parts=" + recipe.parts.length + " motion=" + recipe.motion.length + " h=" + recipe.h.toFixed(2) + " note=" + recipe.note.slice(0, 40));
    return json(cors, 200, { ok: true, recipe });
  } catch (e: any) {
    clearTimeout(timeoutId);
    console.error("[generate-scene-thing] failed:", e?.message || e);
    return json(cors, 500, { ok: false, error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)) });
  }
});
