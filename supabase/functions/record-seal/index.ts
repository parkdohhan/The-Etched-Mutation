// record-seal — RECORD v4 §5-3 저장 + 유령 씨앗 (2026-09-09)
//
// 클라이언트(js/app/recordPlay.js)가 절단까지 마친 결과를 보내면, 한 번에 심는다:
//   memories (status='Fetus' 씨앗, meta.record_v4)  →  scenes (original_emotion = 17축 원시 평균,
//   meta.record.utterances = 관객 원문 그대로)  →  ghost_variants 씨앗 (is_seed=true, 어미만 굴린 판)
// 왜 서버 함수인가: ghost_variants INSERT 는 RLS 상 admin 전용 (insert-ghost-variant 는 is_seed=false 강제).
//   기록자는 그 기억의 작가이므로 그 발화는 씨앗이 맞다 — service_role 로 심는다 (설계 §5-3 택일 = 신규 함수).
// 새 테이블 0, 새 컬럼 0.
//
// 사물·모티프 태그: Haiku 한 번 호출로 씬별 motif/object 추출 (실패하면 빈 배열 — 저장은 계속).
//   본문은 절대 다듬지 않는다 (설계 §3-3, §7-3). 태그는 본문이 아니라 지형 사물 주문의 재료일 뿐.
//
// 요청 body:
//   { lang, sealWord, turns:[{text,isVoid,vector|null}], scenes:[{turnIndices,utterances,vector,voidCount}],
//     cut:{rule,method,boundaries,deltas,thresholds,measuredCount}, dialog:[{role,content}], client:{startedAt,endedAt} }
// 응답: { ok:true, memoryId, code, sceneIds, seeds } | { ok:false, error }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const RECORD_VERSION = "record_v4_2026_09_09";
const SEED_CAP = 30;                 // dialog-turn 이 읽는 drift 풀 상한(limit 30)과 정합
const MAX_SCENES = 7;

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

// 로그인 사용자면 curator_id 로 귀속 (anon key JWT 면 null) — _shared/auth.ts verifyAuth 와 동일 논리
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

// 오염 기준선(depth=1) — 클라이언트가 ContaminationTracker 로 계산해 보낸다. NetworkService.updateMemoryContamination 과 같은 컬럼만 허용.
const CONT_KEYS = [
  "cont_drift", "cont_fixation", "cont_stage", "cont_depth",
  "lifetime_drift_sum", "lifetime_fix_sum", "drift_dir_v", "drift_dir_a", "drift_dir_d",
  "lifetime_dir_v_sum", "lifetime_dir_a_sum", "lifetime_dir_d_sum",
  "cont_last_alignment", "cont_last_level", "cont_last_shape", "cont_last_pattern", "cont_last_mismatch", "cont_last_updated",
  "cont_divergence", "cont_convergence", "cont_heterogeneity", "_cont_align_mean", "_cont_align_m2",
  "cont_stage_1", "cont_stage_2", "cont_stage_3",
];
function contPatch(c: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!c || typeof c !== "object" || Array.isArray(c)) return out;
  for (const k of CONT_KEYS) {
    const v = (c as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function json(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    if (typeof k === "string" && k.length <= 40 && Number.isFinite(n)) out[k] = Math.max(0, Math.min(1, n));
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

// 유령 씨앗 = 최소 변환: 원문 그대로 + 회상 실패자 어미 한 마디. (설계 §3-3, §6-②)
function seedUtterance(text: string, lang: "ko" | "en"): string {
  const t = text.trim().replace(/\s+/g, " ");
  return lang === "en" ? `${t} ...I think that's how it was.` : `${t} …… 그랬던 것 같아.`;
}

// 씬 본문 = 관객 발화 이어붙이기 (접속 최소). 침묵은 '……'.
function sceneText(utterances: string[], lang: "ko" | "en"): string {
  const parts = utterances.map((u) => {
    const t = String(u || "").trim();
    if (!t || t === "[VOID]") return "……";
    return t;
  });
  return parts.join(lang === "en" ? " " : " ").replace(/\s+/g, " ").trim();
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
    console.warn("[record-seal] tag extraction skipped:", (e as any)?.message || e);
    return empty;
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, 405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(corsHeaders, 400, { error: "Invalid JSON body" }); }

  const lang: "ko" | "en" = body?.lang === "en" ? "en" : "ko";
  const sealWord = String(body?.sealWord || "").trim().slice(0, 80);
  const turns: any[] = Array.isArray(body?.turns) ? body.turns.slice(0, 60) : [];
  const scenesIn: any[] = Array.isArray(body?.scenes) ? body.scenes.slice(0, MAX_SCENES) : [];
  if (!scenesIn.length) return json(corsHeaders, 400, { error: "scenes required" });
  const cut = body?.cut && typeof body.cut === "object" ? body.cut : {};
  const dialog: any[] = Array.isArray(body?.dialog) ? body.dialog.slice(0, 120) : [];

  // 씬 정규화 — 본문·감정·원문
  const scenes = scenesIn.map((s, i) => {
    const utterances = (Array.isArray(s?.utterances) ? s.utterances : []).map((u: unknown) => String(u || "").slice(0, 600)).slice(0, 30);
    const vector = cleanVec(s?.vector);
    const turnIndices = (Array.isArray(s?.turnIndices) ? s.turnIndices : []).map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n));
    return { order: i + 1, utterances, vector, turnIndices, voidCount: Number(s?.voidCount) || 0, text: sceneText(utterances, lang) };
  }).filter((s) => s.text.length > 0);
  if (!scenes.length) return json(corsHeaders, 400, { error: "scenes empty after normalization" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[record-seal] SUPABASE_URL or SERVICE_ROLE_KEY missing");
    return json(corsHeaders, 500, { error: "Server config missing" });
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const user = await optionalUser(req);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY") || "";

  // 태그 추출 (실패해도 진행)
  const tags = apiKey ? await extractTags(apiKey, scenes.map((s) => s.text), lang) : scenes.map(() => ({ motifs: [], objects: [] }));
  const allMotifs = Array.from(new Set(tags.flatMap((t) => t.motifs)));

  const measuredTurnVecs = turns.map((t) => cleanVec(t?.vector)).filter((v) => Object.keys(v).length);
  const memoryVector = measuredTurnVecs.length ? meanVec(measuredTurnVecs) : meanVec(scenes.map((s) => s.vector));
  const title = sealWord || (lang === "en" ? "Untitled Memory" : "제목 없는 기억");
  const now = new Date().toISOString();

  // 1. memories — code 충돌 시 재시도 3회
  let memory: { id: string; code: string } | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3 && !memory; attempt++) {
    const code = genCode();
    const { data, error } = await admin.from("memories").insert({
      code,
      title,
      completed_sentence: sealWord || null,
      status: "Fetus",
      is_public: false,
      curator_id: user?.id || null,
      original_vector: memoryVector,
      original_reason_vector: null,
      lang,
      ...contPatch(body?.contamination),   // 기록 = 첫 플레이 (depth 1, alignment 1.0) 기준선
      meta: {
        motif_tags: allMotifs,
        record_v4: {
          version: RECORD_VERSION,
          cut_rule: String(cut?.rule || "era-lull-v1"),
          cut_method: String(cut?.method || ""),
          boundaries: Array.isArray(cut?.boundaries) ? cut.boundaries : [],
          deltas: Array.isArray(cut?.deltas) ? cut.deltas : [],
          thresholds: cut?.thresholds || null,
          measured_turns: Number(cut?.measuredCount) || measuredTurnVecs.length,
          turn_count: turns.length,
          void_count: turns.filter((t) => t?.isVoid).length,
          seal_word: sealWord,
          started_at: body?.client?.startedAt || null,
          sealed_at: now,
          dialog, // 증거 보존 (설계 §3-5) — 관객 발화 + 또다른 나
        },
      },
    }).select("id, code").single();
    if (!error && data) memory = data as any;
    else lastErr = error;
  }
  if (!memory) {
    console.error("[record-seal] memory insert failed:", lastErr);
    return json(corsHeaders, 500, { ok: false, error: "memory insert failed", detail: lastErr?.message || String(lastErr) });
  }

  try {
    // 2. scenes
    const totalTurns = scenes.reduce((s, x) => s + x.turnIndices.length, 0) || 1;
    const sceneRows = scenes.map((s, i) => ({
      memory_id: memory!.id,
      scene_order: s.order,
      scene_type: "normal",
      text: s.text,
      original_emotion: s.vector,
      original_reason_vector: null,
      vector_weight: s.turnIndices.length / totalTurns,
      meta: {
        motif_tags: tags[i]?.motifs || [],
        object_tags: tags[i]?.objects || [],
        record: {
          turn_indices: s.turnIndices,
          utterances: s.utterances,         // 관객 원문 그대로 (설계 §3-3 원문 병행 저장)
          void_count: s.voidCount,
        },
      },
    }));
    const { data: sceneData, error: sceneErr } = await admin.from("scenes").insert(sceneRows).select("id, scene_order");
    if (sceneErr) throw new Error("scene insert failed: " + sceneErr.message);
    const sceneIds = (sceneData || []).sort((a: any, b: any) => a.scene_order - b.scene_order).map((r: any) => r.id);

    // 3. ghost_variants 씨앗 — 관객 발화 원문 + 어미 한 마디. 최대 30.
    const seedRows: any[] = [];
    scenes.forEach((s, i) => {
      s.turnIndices.forEach((ti: number, k: number) => {
        if (seedRows.length >= SEED_CAP) return;
        const t = turns[ti];
        const raw = String((t && t.text) || s.utterances[k] || "").trim();
        if (!raw || raw === "[VOID]" || (t && t.isVoid)) return;
        if (raw.length < 5 || raw.length > 900) return;
        const turnVec = cleanVec(t?.vector);
        seedRows.push({
          memory_id: memory!.id,
          kind: "drift",
          is_seed: true,
          parent_variant_id: null,
          utterance: seedUtterance(raw, lang),
          emotion_vec: Object.keys(turnVec).length ? turnVec : s.vector,
          extractor_version: "record_v4_min",
          motif_tags: tags[i]?.motifs || [],
          created_by: user?.id || null,
        });
      });
    });
    let seeds = 0;
    if (seedRows.length) {
      const { error: seedErr } = await admin.from("ghost_variants").insert(seedRows);
      if (seedErr) console.warn("[record-seal] seed insert failed (non-fatal):", seedErr.message);
      else seeds = seedRows.length;
    }

    console.log("[record-seal] memory=" + memory.id.slice(0, 8) + " code=" + memory.code + " scenes=" + sceneIds.length + " seeds=" + seeds + " user=" + (user?.id ? user.id.slice(0, 8) : "anon"));
    return json(corsHeaders, 200, { ok: true, memoryId: memory.id, code: memory.code, sceneIds, seeds, tags });
  } catch (e: any) {
    // 반쪽 저장 방지 — 기억 삭제(CASCADE 로 씬·씨앗 정리)
    console.error("[record-seal] failed after memory insert, rolling back:", e?.message || e);
    try { await admin.from("memories").delete().eq("id", memory.id); } catch (_) { /* ignore */ }
    return json(corsHeaders, 500, { ok: false, error: e?.message || String(e) });
  }
});
