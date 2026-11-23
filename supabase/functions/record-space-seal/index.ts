// record-space-seal — a memory made in record-space.html goes in whole (2026-11-23)
//
// Decision: docs/우주무대_기억만들기_결정-261123.md. The twin of record-seal (RECORD v4) for the space stage:
//   memories (status 'nascent', is_public true, meta.space_record)
//   → scenes (text = first part, original_emotion = the author's vector, meta.space = { b, words, deep, thing }, meta.sound_url)
//   → plays: the author's own order as the FIRST THREAD of the ledger (one run, persona 'room-author', stage 'room_v1',
//     place 'space_v1', one row per scene a second apart). The accumulated model of the space stage reads it like any
//     walk; the author was told so ("니 순서대로 플레이 안 됨 ㅋ 첫 번째 실일 뿐임").
// Why a server function: plays/scenes inserts with a thread persona and a set created_at need the service role; the
// memory must be whole or absent (rollback on any failure after the memory row).
// New tables 0, new columns 0.
//
// Request body:
//   { lang: 'ko'|'en', title, description?, scenes: [ { text, b?: string[]|string, words?: string[], deep?: string[],
//       emotion: { axis: 0..1 }, thing?: recipe|null, sound_url?: string|null, sound_volume?: 0..1,
//       dialog?: [{role, content}], measured?: [vec] } ],
//     consent: { public: true, walks: true, order: true, thread: true, at }, client?: { startedAt } }
// Response: { ok: true, memoryId, code, sceneIds, thread: runId|null } | { ok: false, error }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";          // tags only (motifs/objects), as record-seal
const RECORD_VERSION = "space_record_v1_2026_11_23";
const MAX_SCENES = 12, MAX_TEXT = 600, MAX_B_LINES = 8, MAX_WORDS = 12, MAX_DEEP = 8;
const STAGE_TAG = "room_v1", PLACE_TAG = "space_v1", AUTHOR_PERSONA = "room-author";

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

async function optionalUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader || !supabaseUrl || !anonKey) return null;
  try {
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    return { id: user.id };
  } catch { return null; }
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}
function cleanVec(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x);
    if (typeof k === "string" && /^[a-z_]{2,40}$/.test(k) && Number.isFinite(n) && n > 0) out[k] = Math.max(0, Math.min(1, n));
  }
  return out;
}
function meanVec(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  const vs = list.filter((v) => v && Object.keys(v).length);
  if (!vs.length) return out;
  const keys = new Set<string>();
  vs.forEach((v) => Object.keys(v).forEach((k) => keys.add(k)));
  keys.forEach((k) => { let s = 0; vs.forEach((v) => { s += v[k] || 0; }); out[k] = s / vs.length; });
  return out;
}
const str = (x: unknown, max: number) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, max);
const strList = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x : []).map((s) => str(s, max)).filter(Boolean).slice(0, n);

// ── the recipe sanitizer (the same rules as generate-scene-thing and js/spaceplay/things.js) ────────
const MATS = new Set(["line", "dim", "amber", "blue", "rust"]);
const GLOWS = new Set(["amber", "blue", "line", "rust", "white", "dim"]);
const num = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const vec3 = (x: unknown, lo: number, hi: number, yLo?: number) => { const a = Array.isArray(x) ? x : []; return [num(a[0], lo, hi, 0), num(a[1], yLo === undefined ? lo : yLo, hi, 0), num(a[2], lo, hi, 0)]; };
const mat = (x: unknown) => (typeof x === "string" && MATS.has(x) ? x : "line");
function sanitizeRecipe(r: any): any | null {
  if (!r || typeof r !== "object" || !Array.isArray(r.parts)) return null;
  const parts: any[] = [];
  for (const p of r.parts.slice(0, 28)) {
    if (!p || typeof p !== "object" || typeof p.k !== "string") continue;
    const at = vec3(p.at, -5, 5, -0.5), rot = vec3(p.rot, -7, 7), m = mat(p.m);
    switch (p.k) {
      case "box": { const s = Array.isArray(p.size) ? p.size : []; parts.push({ k: "box", size: [num(s[0], 0.03, 4.5, 0.5), num(s[1], 0.03, 4.5, 0.5), num(s[2], 0.03, 4.5, 0.5)], at, rot, m }); break; }
      case "cyl": { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: "cyl", r: [num(rr[0], 0, 2.5, 0.2), num(rr[1], 0, 2.5, 0.3)], h: num(p.h, 0.05, 4.5, 1), n: Math.round(num(p.n, 3, 24, 8)), at, rot, m }); break; }
      case "ico": { const sc = Array.isArray(p.scale) ? p.scale : [1, 1, 1]; parts.push({ k: "ico", r: num(p.r, 0.03, 2.5, 0.3), detail: num(p.detail, 0, 1, 0) >= 0.5 ? 1 : 0, scale: [num(sc[0], 0.05, 4, 1), num(sc[1], 0.05, 4, 1), num(sc[2], 0.05, 4, 1)], at, rot, m }); break; }
      case "cone": parts.push({ k: "cone", r: num(p.r, 0.03, 2.5, 0.2), h: num(p.h, 0.05, 4.5, 0.5), n: Math.round(num(p.n, 3, 24, 6)), at, rot, m }); break;
      case "stroke": { const pts = (Array.isArray(p.pts) ? p.pts : []).slice(0, 64).map((q: unknown) => vec3(q, -5, 5, -0.5)); if (pts.length >= 2) parts.push({ k: "stroke", pts, closed: !!p.closed, m }); break; }
      case "oval": { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: "oval", r: [num(rr[0], 0.03, 3, 0.5), num(rr[1], 0.03, 3, 0.5)], n: Math.round(num(p.n, 8, 80, 40)), at, rot, m }); break; }
      case "glow": parts.push({ k: "glow", c: typeof p.c === "string" && GLOWS.has(p.c) ? p.c : "amber", size: num(p.size, 0.2, 3.5, 1.2), o: num(p.o, 0.05, 0.9, 0.5), at }); break;
      case "profile": parts.push({ k: "profile", s: num(p.s, 0.5, 3.5, 2), mirror: !!p.mirror, at, m }); break;
      case "garment": parts.push({ k: "garment", y: num(p.y, -0.5, 4, 1), m }); break;
      default: break;
    }
  }
  if (!parts.length) return null;
  const motion: any[] = [];
  for (const mo of (Array.isArray(r.motion) ? r.motion : []).slice(0, 12)) {
    if (!mo || typeof mo !== "object") continue;
    const i = Math.round(num(mo.i, 0, parts.length - 1, -1));
    if (i < 0 || i >= parts.length || !["spin", "bob", "sway", "ring", "pulse", "drift"].includes(mo.k)) continue;
    motion.push({ i, k: mo.k, v: num(mo.v, 0.01, 3, 0.4), amp: num(mo.amp, 0.005, 0.6, 0.08), axis: ["x", "y", "z"].includes(mo.axis) ? mo.axis : "y", lo: num(mo.lo, 0, 1, 0.25), hi: num(mo.hi, 0, 1, 0.6) });
  }
  return { v: 1, h: num(r.h, 0.5, 4.5, 2.2), note: str(r.note, 120), parts, motion, version: typeof r.version === "string" ? r.version.slice(0, 40) : undefined };
}

async function extractTags(apiKey: string, scenes: string[], lang: "ko" | "en"): Promise<Array<{ motifs: string[]; objects: string[] }>> {
  const empty = scenes.map(() => ({ motifs: [], objects: [] }));
  if (!scenes.length) return empty;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const numbered = scenes.map((s, i) => `#${i + 1}: ${s.slice(0, 700)}`).join("\n");
    const prompt = lang === "en"
      ? `Below are ${scenes.length} scene texts from one personal memory. For EACH scene, list (a) motifs: 1-3 abstract recurring themes (single words), (b) objects: 1-4 concrete physical things or places literally mentioned in that scene (nouns as written, no inventions). Reply with JSON only: {"scenes":[{"motifs":[],"objects":[]}, ...]} in the same order.\n\n${numbered}`
      : `아래는 한 사람의 기억에서 잘라낸 씬 ${scenes.length}개다. 각 씬마다 (a) motifs: 되풀이되는 추상 주제 1~3개(한 단어), (b) objects: 그 씬 본문에 실제로 등장한 구체 사물·장소 1~4개(본문에 쓰인 명사 그대로, 지어내지 말 것). JSON 만 답한다: {"scenes":[{"motifs":[],"objects":[]}, ...]} 같은 순서.\n\n${numbered}`;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return empty;
    const data = await resp.json();
    const text = String(data?.content?.[0]?.text || "");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return empty;
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    return scenes.map((_, i) => {
      const s = arr[i] || {};
      const norm = (xs: unknown) => (Array.isArray(xs) ? xs : []).map((x) => String(x || "").trim()).filter((x) => x && x.length <= 30).slice(0, 4);
      return { motifs: norm(s.motifs).slice(0, 3), objects: norm(s.objects) };
    });
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn("[record-space-seal] tag extraction skipped:", (e as any)?.message || e);
    return empty;
  }
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(cors, 400, { ok: false, error: "Invalid JSON body" }); }

  const lang: "ko" | "en" = body?.lang === "en" ? "en" : "ko";
  const title = str(body?.title, 60);
  const description = str(body?.description, 300);
  if (!title) return json(cors, 400, { ok: false, error: "title required" });
  const consent = body?.consent && typeof body.consent === "object" ? body.consent : {};
  if (!(consent.public === true && consent.walks === true && consent.order === true && consent.thread === true)) {
    return json(cors, 400, { ok: false, error: "consent incomplete" });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(cors, 500, { ok: false, error: "Server config missing" });
  const soundPrefix = supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/scene_sounds/";

  const scenesIn: any[] = Array.isArray(body?.scenes) ? body.scenes.slice(0, MAX_SCENES) : [];
  const scenes = scenesIn.map((s, i) => {
    const text = str(s?.text, MAX_TEXT);
    const bRaw = s?.b;
    const b = Array.isArray(bRaw) ? strList(bRaw, MAX_B_LINES, 300) : (str(bRaw, 900) ? [str(bRaw, 900)] : []);
    const words = strList(s?.words, MAX_WORDS, 40);
    const deep = strList(s?.deep, MAX_DEEP, 80);
    const emotion = cleanVec(s?.emotion);
    const thing = sanitizeRecipe(s?.thing);
    const soundUrl = typeof s?.sound_url === "string" && s.sound_url.startsWith(soundPrefix) && s.sound_url.length < 400 ? s.sound_url : null;
    const soundVolume = num(s?.sound_volume, 0, 1, 0.5);
    const dialog = (Array.isArray(s?.dialog) ? s.dialog : []).slice(0, 40).map((d: any) => ({ role: d?.role === "assistant" ? "assistant" : "user", content: str(d?.content, 600) })).filter((d: any) => d.content);
    const measured = (Array.isArray(s?.measured) ? s.measured : []).slice(0, 12).map(cleanVec).filter((v: any) => Object.keys(v).length);
    return { order: i + 1, text, b, words, deep, emotion, thing, soundUrl, soundVolume, dialog, measured };
  }).filter((s) => s.text.length > 0);
  if (!scenes.length) return json(cors, 400, { ok: false, error: "scenes required" });
  const noEmotion = scenes.filter((s) => !Object.keys(s.emotion).length).map((s) => s.order);
  if (noEmotion.length) return json(cors, 400, { ok: false, error: "every scene needs an emotion", scenes: noEmotion });

  const admin = createClient(supabaseUrl, serviceKey);
  const user = await optionalUser(req);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY") || "";
  const tags = apiKey ? await extractTags(apiKey, scenes.map((s) => s.text), lang) : scenes.map(() => ({ motifs: [], objects: [] }));
  const allMotifs = Array.from(new Set(tags.flatMap((t) => t.motifs)));
  const memoryVector = meanVec(scenes.map((s) => s.emotion));
  const now = new Date();

  // 1. memories — code collision: three tries
  let memory: { id: string; code: string } | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3 && !memory; attempt++) {
    const { data, error } = await admin.from("memories").insert({
      code: genCode(),
      title,
      description: description || null,
      completed_sentence: null,
      status: "nascent",
      is_public: true,
      curator_id: user?.id || null,
      original_vector: memoryVector,
      original_reason_vector: null,
      lang,
      cont_depth: 0,
      meta: {
        motif_tags: allMotifs,
        space_record: {
          version: RECORD_VERSION,
          consent: { public: true, walks: true, order: true, thread: true, at: str(consent.at, 40) || now.toISOString() },
          author_order: scenes.map((s) => s.order),
          scene_count: scenes.length,
          started_at: str(body?.client?.startedAt, 40) || null,
          sealed_at: now.toISOString(),
          by: user?.id ? "user" : "anon",
        },
      },
    }).select("id, code").single();
    if (!error && data) memory = data as any; else lastErr = error;
  }
  if (!memory) {
    console.error("[record-space-seal] memory insert failed:", lastErr);
    return json(cors, 500, { ok: false, error: "memory insert failed", detail: lastErr?.message || String(lastErr) });
  }

  try {
    // 2. scenes
    const sceneRows = scenes.map((s, i) => ({
      memory_id: memory!.id,
      scene_order: s.order,
      scene_type: "normal",
      text: s.text,
      original_emotion: s.emotion,
      original_reason_vector: null,
      vector_weight: 1 / scenes.length,
      meta: {
        motif_tags: tags[i]?.motifs || [],
        object_tags: tags[i]?.objects || [],
        space: { b: s.b, words: s.words, deep: s.deep, thing: s.thing },
        ...(s.soundUrl ? { sound_url: s.soundUrl, sound_volume: s.soundVolume } : {}),
        record_space: { version: RECORD_VERSION, dialog: s.dialog, measured: s.measured },
      },
    }));
    const { data: sceneData, error: sceneErr } = await admin.from("scenes").insert(sceneRows).select("id, scene_order");
    if (sceneErr) throw new Error("scene insert failed: " + sceneErr.message);
    const ordered = (sceneData || []).slice().sort((a: any, b: any) => a.scene_order - b.scene_order);
    const sceneIds = ordered.map((r: any) => r.id);

    // 3. the author's order = the first thread of the ledger (one run, a second between rows so the order is its own)
    let thread: string | null = crypto.randomUUID();
    const byOrder = new Map<number, string>(ordered.map((r: any) => [Number(r.scene_order), r.id]));
    const playRows = scenes.map((s, i) => ({
      memory_id: memory!.id,
      scene_id: byOrder.get(s.order),
      run_id: thread,
      user_id: user?.id || null,
      persona_id: AUTHOR_PERSONA,
      alignment: 1,
      mismatch_type: null,
      user_emotion: s.emotion,
      user_reason: "",
      wave_data: null,
      layer_id: 0,
      visit: 1,
      ghost_variant_id: null,
      dialog_turns: [{ stage: STAGE_TAG, place: PLACE_TAG, form: "author_thread_v1", input_form: "record_space_v1", visit: 1, order: s.order, at: new Date(now.getTime() + i * 1000).toISOString() }],
      created_at: new Date(now.getTime() + i * 1000).toISOString(),
    }));
    const { error: playErr } = await admin.from("plays").insert(playRows);
    if (playErr) { console.warn("[record-space-seal] thread insert failed (non-fatal):", playErr.message); thread = null; }

    console.log("[record-space-seal] memory=" + memory.id.slice(0, 8) + " code=" + memory.code + " scenes=" + sceneIds.length + " thread=" + (thread ? "yes" : "no") + " user=" + (user?.id ? user.id.slice(0, 8) : "anon"));
    return json(cors, 200, { ok: true, memoryId: memory.id, code: memory.code, sceneIds, thread, tags });
  } catch (e: any) {
    console.error("[record-space-seal] failed after memory insert, rolling back:", e?.message || e);
    try { await admin.from("plays").delete().eq("memory_id", memory.id); } catch (_) { /* ignore */ }
    try { await admin.from("scenes").delete().eq("memory_id", memory.id); } catch (_) { /* ignore */ }
    try { await admin.from("memories").delete().eq("id", memory.id); } catch (_) { /* ignore */ }
    return json(cors, 500, { ok: false, error: e?.message || String(e) });
  }
});
