// bake-room-layers — the ledger of a memory made in record-space.html, turned into the next layers of its scenes' texts (2026-11-23)
//
// The rule is tools/room-sim/bake_stage.mjs's, run on the server after each finished walk (space-play / space-blank finish()):
//   layer 2 of a scene (juxtaposition) = its text with two walkers' lines set inside it, before its last sentence — the line that
//     went most with the scene and the line that went most against it (highest / lowest alignment among that scene's rows;
//     different runs; a scene with one usable line gets one). The scene keeps its own first and last sentences.
//   layer 3 (hypercompletion) = layer 2 passed once through contaminate-text in its hypercompletion mode with the memory's
//     replayed contamination state, which the caller sends (replayed from the same ledger with ContaminationTracker).
//   depth = number of distinct runs in the room ledger (the author's first thread counts as one) → memories.cont_depth.
// Writes: scenes.meta.room_text {"2","3"} + scenes.meta.stage_bake (provenance), memories.cont_depth. Only memories with
// meta.space_record — the hand-authored memories keep their own baked layers and their tool.
// Request: { memoryId, contState?: { cont_drift, cont_fixation, drift_dir_v, drift_dir_a, drift_dir_d, band, stage }, layer3?: boolean }
// Response: { ok, runs, depth, scenes: [{ order, lines, layer2, layer3 }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STAGE_TAG = "room_v1", TEST_PERSONA = "room-test";
const MAX_LINE = 60;                                  // one line's length (the tool's)
// the crisis words the tool refuses (js/safety.js SAFETY_KEYWORDS block_high + block_mid, and the Korean pattern of the tool)
const CRISIS_KO = /자살|자해|죽고 ?싶|죽이고|목을 매/;
const CRISIS_EN = ["suicide", "killmyself", "wanttodie", "wannadie", "endmylife", "enditall", "jumpoff", "slitmywrist", "cutmywrist", "self-harm", "selfharm", "overdose", "hanging", "hangmyself",
  "murder", "killsomeone", "stab", "arson", "bomb", "rape", "sexualassault", "incest", "spycam", "sexualexploitation", "gonnakill", "killthem", "beattodeath", "bloodgushing", "schoolviolence", "bullying", "ostracize"];

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

const sentences = (text: string) => { const t = String(text || "").trim(); if (!t) return [] as string[]; const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g); return (m || [t]).map((s) => s.trim()).filter(Boolean); };
const closed = (s: string) => { const t = String(s).trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + "."; };
/** A person's line may enter a scene's text only if it is not a crisis line and not a half-typed one. */
function cleared(text: string): string | null {
  if (CRISIS_KO.test(text)) return null;
  const flat = text.toLowerCase().replace(/\s/g, "");
  for (const k of CRISIS_EN) if (flat.includes(k)) return null;
  if (/[ㄱ-ㅎㅏ-ㅣ]/.test(text)) return null;
  return text.replace(/^(그런데|하지만|그리고|그럼에도 불구하고|그래서|그러다가|그러자|그 순간)\s+\1\s+/, "$1 ");
}
const num = (x: unknown, d = 0) => { const n = Number(x); return Number.isFinite(n) ? n : d; };

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Method not allowed" });
  let body: any;
  try { body = await req.json(); } catch { return json(cors, 400, { ok: false, error: "Invalid JSON body" }); }
  const memoryId = String(body?.memoryId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId)) return json(cors, 400, { ok: false, error: "memoryId required" });
  const cs = body?.contState && typeof body.contState === "object" ? body.contState : null;
  const wantLayer3 = body?.layer3 !== false && !!cs;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(cors, 500, { ok: false, error: "Server config missing" });
  const admin = createClient(supabaseUrl, serviceKey);

  const mem = await admin.from("memories").select("id, code, cont_depth, meta").eq("id", memoryId).maybeSingle();
  if (mem.error || !mem.data) return json(cors, 404, { ok: false, error: "memory not found" });
  if (!mem.data.meta || !mem.data.meta.space_record) return json(cors, 403, { ok: false, error: "not a record-space memory" });

  const sc = await admin.from("scenes").select("id, scene_order, text, text_stage_1, void_info, meta").eq("memory_id", memoryId).order("scene_order");
  if (sc.error) return json(cors, 500, { ok: false, error: "scenes: " + sc.error.message });
  const scenes = sc.data || [];

  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await admin.from("plays").select("run_id, scene_id, created_at, persona_id, alignment, dialog_turns").eq("memory_id", memoryId).not("run_id", "is", null).order("created_at").range(from, from + 999);
    if (r.error) return json(cors, 500, { ok: false, error: "plays: " + r.error.message });
    rows.push(...(r.data || []));
    if (!r.data || r.data.length < 1000 || rows.length >= 5000) break;
  }
  const room = rows.filter((p) => p.persona_id !== TEST_PERSONA && Array.isArray(p.dialog_turns) && p.dialog_turns[0] && p.dialog_turns[0].stage === STAGE_TAG);
  const runs = new Set(room.map((r) => r.run_id)).size;

  const report: any[] = [];
  let written = 0;
  for (const s of scenes) {
    if ((s.void_info && s.void_info.sceneVoid) || /^[…\s.]*$/.test(s.text || "")) continue;
    const lines: Array<{ run: string; text: string; a: number; who: string }> = [];
    for (const r of room.filter((x) => x.scene_id === s.id)) {
      for (const t of r.dialog_turns) {
        const text0 = String(t?.raw_text || "").trim().replace(/\s+/g, " ");
        if (!text0 || text0.length > MAX_LINE) continue;
        const text = cleared(text0);
        if (!text) continue;
        lines.push({ run: r.run_id, text, a: num(t.alignment != null ? t.alignment : r.alignment), who: r.persona_id || "audience" });
      }
    }
    if (!lines.length) { report.push({ order: s.scene_order, lines: 0, layer2: false, layer3: false }); continue; }
    lines.sort((x, y) => y.a - x.a);
    const hi = lines[0];
    const lo = lines.slice().reverse().find((l) => l.run !== hi.run && l.text !== hi.text && l.a < hi.a) || null;
    const base = sentences(s.text_stage_1 || s.text), picked = [hi].concat(lo ? [lo] : []);
    const tail = base.length > 1 && base[base.length - 1].replace(/[\s.!?…]/g, "").length < 4 ? 2 : 1;
    const layer2 = base.slice(0, -tail).concat(picked.map((l) => closed(l.text)), base.slice(-tail)).join(" ");
    let layer3: string | null = null;
    if (wantLayer3) {
      try {
        const band = ["weak", "medium", "strong"].includes(cs.band) ? (cs.band === "weak" ? "medium" : cs.band) : "medium";
        const r = await fetch(supabaseUrl.replace(/\/$/, "") + "/functions/v1/contaminate-text", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          body: JSON.stringify({ text: layer2, contamination: { cont_stage: "hypercompletion", cont_drift: num(cs.cont_drift), cont_fixation: num(cs.cont_fixation), drift_dir_v: num(cs.drift_dir_v), drift_dir_a: num(cs.drift_dir_a), drift_dir_d: num(cs.drift_dir_d), band } }),
        });
        const j = await r.json().catch(() => null);
        layer3 = r.ok && j && typeof j.text_stage_3 === "string" && j.text_stage_3.trim() ? j.text_stage_3.trim() : null;
        if (!layer3) console.warn("[bake-room-layers] layer 3 failed for scene", s.scene_order, r.status, JSON.stringify(j).slice(0, 160));
      } catch (e) { console.warn("[bake-room-layers] layer 3 error", (e as any)?.message || e); }
    }
    const prov = { at: new Date().toISOString(), source: "room", to: "meta", rule: "juxtaposition_v1: highest + lowest alignment line of the scene, before its last sentence", runs, lines: picked.map((l) => ({ run_id: l.run, alignment: +l.a.toFixed(4), who: l.who })), layer3: layer3 ? "contaminate-text hypercompletion" : null, by: "bake-room-layers" };
    const meta = Object.assign({}, s.meta || {});
    meta.room_text = Object.assign({}, meta.room_text || {}, { 2: layer2 }, layer3 ? { 3: layer3 } : {});
    meta.stage_bake = prov;
    const u = await admin.from("scenes").update({ meta }).eq("id", s.id).select("id");
    if (u.error || !u.data || !u.data.length) console.warn("[bake-room-layers] write failed #" + s.scene_order, u.error ? u.error.message : "0 rows"); else written++;
    report.push({ order: s.scene_order, lines: lines.length, layer2: true, layer3: !!layer3 });
  }

  const depth = Math.max(num(mem.data.cont_depth), runs);
  if (depth !== num(mem.data.cont_depth)) {
    const u = await admin.from("memories").update({ cont_depth: depth }).eq("id", memoryId);
    if (u.error) console.warn("[bake-room-layers] depth write failed", u.error.message);
  }
  console.log("[bake-room-layers] " + mem.data.code + " runs=" + runs + " depth=" + depth + " scenes written=" + written + "/" + scenes.length);
  return json(cors, 200, { ok: true, runs, depth, written, scenes: report });
});
