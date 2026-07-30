// Object Model Generator — 사물 앵커 3D 모델 자동 생성 (2026-07-30)
//
// docs/사물모티프_지형조형_설계-260712.md §6 / §8
//
// 왜 두 몫으로 쪼갰나:
//   모델 하나에 60~120초. 함수 하나가 8개를 다 기다리면 실행 시간 제한에 걸린다.
//   그래서 "주문만 넣고 나오기(enqueue)" 와 "완성된 것만 거둬오기(collect)" 를 분리.
//   양쪽 다 여러 번 불러도 안전(idempotent) — 이미 있는 모델·이미 넣은 주문은 건너뛴다.
//
// 모드:
//   enqueue : 이 기억의 사물 단어 중 모델 없는 것에 Tripo 작업 생성 → task_id 를 meta 에 적어둠
//   collect : 적어둔 task 를 1회씩 조회 → 완성분만 내려받아 Storage 저장 → meta.object_models 기록
//   sync    : collect → enqueue 순서로 한 번에 (클라이언트가 한 번만 부르면 되게)
//
// 상태 보관 (새 테이블 없이):
//   memories.meta.object_models      = { 단어: { path, source, created_at } }   ← 완성품
//   memories.meta.object_model_jobs  = { 단어: { task_id, prompt, created_at } } ← 진행 중
//
// 비용 가드: 기억당 단어 상한(MAX_WORDS_PER_MEMORY), 이미 모델/주문 있으면 스킵.
//   → 같은 기억에 몇 번을 호출해도 추가 크레딧이 나가지 않는다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRIPO_API = "https://openapi.tripo3d.ai/v3";
const TRIPO_MODEL = "P1-20260311";        // 로우폴리 전용 — 수백 KB, 지형 톤과 맞음 (설계 §6)
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_WORDS_PER_MEMORY = 14;          // 비용 상한 (기억 하나 ≈ $4)
// 260730 실측: 주문을 연달아 쏘면 6번째부터 Tripo 가 429(속도 제한)로 막는다.
//   → 한 번 호출에서 넣는 주문 수를 끊고, 사이에 간격을 둔다. 남은 단어는 다음 호출에서.
const ENQUEUE_BATCH = 5;                  // 한 번에 넣을 주문 상한
const ENQUEUE_GAP_MS = 1500;              // 주문 사이 간격
const RATE_RETRY_MS = 4000;               // 429 만나면 이만큼 쉬고 1회 재시도
const MAX_PER_SCENE = 2;                  // 공용 규칙과 동일 (tem_object_anchors.js)
const BUCKET = "object_models";
const JOB_STALE_MS = 30 * 60 * 1000;      // 30분 넘게 안 끝난 주문은 버린다 (재주문 가능)

function getCorsHeaders(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowed = raw ? raw.split(",").map((o) => o.trim()) : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowed.length === 0) allowedOrigin = "*";
  else if (allowed.includes(origin)) allowedOrigin = origin;
  else allowedOrigin = allowed[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function json(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// 이 씬에 세울 사물 단어 — tem_object_anchors.wordsFor 와 같은 규칙.
//   object_tags 키가 있으면 그것만 (빈 배열 = 사물 없음), 없으면 motif_tags 폴백.
function wordsForScene(meta: Record<string, unknown> | null): string[] {
  const m = meta || {};
  let words: unknown = [];
  if (Array.isArray((m as any).object_tags)) words = (m as any).object_tags;
  else if (Array.isArray((m as any).motif_tags)) words = (m as any).motif_tags;
  return (words as unknown[]).slice(0, MAX_PER_SCENE)
    .map((w) => String(w || "").trim()).filter(Boolean);
}

// 씬 본문에서 그 단어가 든 문장 — 프롬프트에 뜻을 실어주는 재료.
// "눈" 이 snow 인지 eye 인지는 문장만이 안다 (설계 §6 원칙).
function pickSentence(word: string, text: string): string | null {
  if (!text) return null;
  const parts = text.split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && s.includes(word));
  return parts.length ? parts[0] : null;
}

// 단어 + 문맥 → Tripo 용 영어 프롬프트. Claude 실패 시 규칙 기반 폴백.
async function buildPrompt(word: string, sentence: string | null, anthropicKey: string | null): Promise<string> {
  const fallback = `a single ${word}, clean simple low-poly 3D model, single object, muted colors, neutral pose`;
  if (!anthropicKey) return fallback;
  const ctx = sentence ? `\n\n이 단어가 나오는 원문 문장: "${sentence}"` : "";
  const instruction = `당신은 한국어 기억 서사에 등장하는 사물 하나를 3D 생성기용 영어 프롬프트로 옮기는 사람입니다.

사물 단어: "${word}"${ctx}

규칙:
1. 원문 문장으로 뜻을 확정하라. 동음이의어 주의 — "눈"은 snow 일 수도 eye 일 수도 있다. 문장이 없으면 가장 흔한 물체 뜻을 골라라.
2. **만질 수 있는 단일 물체**로만 옮겨라. 추상어(약속, 거절, 포옹)나 소리(벨소리)라면 그것을 담고 있던 물건으로 치환하라 (벨소리 → an old telephone).
3. 사람·인체 전신 금지 (유령이 그 역할을 맡는다). 신체 부위는 조각·석고상 파편처럼 사물화하라.
4. 로우폴리 게임 에셋 문구를 포함: "clean simple low-poly 3D model, single object, muted colors".
5. 영어 한 줄, 25단어 이내. 설명·따옴표 없이 프롬프트 본문만 출력.

프롬프트:`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 150,
        messages: [{ role: "user", content: instruction }],
      }),
    });
    if (!resp.ok) {
      console.error("[object-model] Claude 실패:", (await resp.text()).slice(0, 300));
      return fallback;
    }
    const data = await resp.json();
    const out = (data?.content?.[0]?.text || "").trim().replace(/^["']|["']$/g, "");
    return out || fallback;
  } catch (e) {
    console.error("[object-model] Claude 예외:", (e as Error).message);
    return fallback;
  }
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST만 허용됨" }, 405, cors);

  try {
    const body = await req.json().catch(() => ({}));
    const memoryId = String(body.memoryId || "").trim();
    const mode = String(body.mode || "sync");
    if (!memoryId) return json({ error: "memoryId 필수" }, 400, cors);
    if (!["enqueue", "collect", "sync"].includes(mode)) {
      return json({ error: "mode 는 enqueue | collect | sync" }, 400, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const tripoKey = Deno.env.get("TRIPO_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Supabase 환경변수 누락" }, 500, cors);
    if (!tripoKey) {
      return json({
        error: "TRIPO_API_KEY 미설정",
        hint: "Supabase 대시보드 → Edge Functions → Secrets 에 TRIPO_API_KEY 추가",
      }, 500, cors);
    }
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY") || null;
    const tripoHeaders = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tripoKey,
    };

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── 기억 + 씬 읽기 ─────────────────────────────────────────
    const [memRes, scnRes] = await Promise.all([
      supabase.from("memories").select("id, meta").eq("id", memoryId).maybeSingle(),
      supabase.from("scenes").select("id, scene_order, text, meta")
        .eq("memory_id", memoryId).order("scene_order", { ascending: true }),
    ]);
    if (memRes.error || !memRes.data) return json({ error: "기억을 찾을 수 없음" }, 404, cors);
    const meta: Record<string, any> = memRes.data.meta || {};
    const models: Record<string, any> = (meta.object_models && typeof meta.object_models === "object")
      ? { ...meta.object_models } : {};
    const jobs: Record<string, any> = (meta.object_model_jobs && typeof meta.object_model_jobs === "object")
      ? { ...meta.object_model_jobs } : {};
    const scenes = scnRes.data || [];

    const result: Record<string, unknown> = { memoryId, mode };
    let metaDirty = false;

    // ── collect: 진행 중 주문 거둬오기 ─────────────────────────
    if (mode === "collect" || mode === "sync") {
      const finished: string[] = [];
      const failed: string[] = [];
      const stillRunning: string[] = [];
      for (const word of Object.keys(jobs)) {
        const job = jobs[word];
        if (!job || !job.task_id) { delete jobs[word]; metaDirty = true; continue; }
        // 너무 오래된 주문은 버린다 (다음 호출에서 재주문 가능). 시각이 없으면 0 = 안 버림.
        const startedAt = Date.parse(job.created_at || "");
        const age = Number.isFinite(startedAt) ? (Date.now() - startedAt) : 0;
        let d: any = null;
        try {
          const r = await fetch(`${TRIPO_API}/tasks/${job.task_id}`, { headers: tripoHeaders });
          d = (await r.json())?.data || null;
        } catch (e) {
          console.error("[object-model] 조회 실패", word, (e as Error).message);
        }
        const status = d?.status;
        if (status === "success") {
          const url = d?.output?.model || d?.output?.model_url || d?.output?.pbr_model || null;
          if (!url) { stillRunning.push(word); continue; }
          try {
            const bin = await fetch(url);
            if (!bin.ok) throw new Error("HTTP " + bin.status);
            const bytes = new Uint8Array(await bin.arrayBuffer());
            // 파일명에 한글 단어를 넣지 않는다 — 공개 주소를 만들 때 이중 인코딩될 위험.
            // 어느 단어인지는 meta.object_models 의 키가 이미 알려준다.
            const fileName = `${memoryId}/${job.task_id}.glb`;
            const up = await supabase.storage.from(BUCKET)
              .upload(fileName, bytes, { contentType: "model/gltf-binary", upsert: true });
            if (up.error) throw new Error(up.error.message);
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
            models[word] = {
              path: pub.publicUrl,
              source: "tripo:" + TRIPO_MODEL,
              prompt: job.prompt || null,
              bytes: bytes.length,
              created_at: new Date().toISOString(),
            };
            delete jobs[word];
            metaDirty = true;
            finished.push(word);
          } catch (e) {
            console.error("[object-model] 저장 실패", word, (e as Error).message);
            stillRunning.push(word);
          }
        } else if (status === "failed" || status === "banned" || status === "cancelled" || status === "expired") {
          delete jobs[word];
          metaDirty = true;
          failed.push(word);
        } else if (age > JOB_STALE_MS) {
          delete jobs[word];
          metaDirty = true;
          failed.push(word + "(시간초과)");
        } else {
          stillRunning.push(word);
        }
      }
      result.collected = finished;
      result.failed = failed;
      result.running = stillRunning;
    }

    // ── enqueue: 모델 없는 단어에 주문 넣기 ────────────────────
    if (mode === "enqueue" || mode === "sync") {
      // 씬 순서대로 단어 수집 (중복 제거, 상한 적용)
      const wanted: Array<{ word: string; sentence: string | null }> = [];
      const seen = new Set<string>();
      for (const sc of scenes) {
        for (const w of wordsForScene(sc.meta)) {
          if (seen.has(w)) continue;
          seen.add(w);
          if (models[w] || jobs[w]) continue;                  // 이미 있거나 주문 중
          if (wanted.length >= MAX_WORDS_PER_MEMORY) break;
          wanted.push({ word: w, sentence: pickSentence(w, sc.text || "") });
        }
        if (wanted.length >= MAX_WORDS_PER_MEMORY) break;
      }
      // 속도 제한 회피 — 이번 호출에서는 앞쪽 몇 개만. 나머지는 다음 호출이 잇는다.
      const batch = wanted.slice(0, ENQUEUE_BATCH);
      const deferred = wanted.slice(ENQUEUE_BATCH).map((x) => x.word);

      const queued: string[] = [];
      const rejected: string[] = [];
      for (let bi = 0; bi < batch.length; bi++) {
        const item = batch[bi];
        if (bi > 0) await sleep(ENQUEUE_GAP_MS);
        const prompt = await buildPrompt(item.word, item.sentence, anthropicKey);
        try {
          let r = await fetch(`${TRIPO_API}/generation/text-to-model`, {
            method: "POST",
            headers: tripoHeaders,
            body: JSON.stringify({ prompt, model: TRIPO_MODEL }),
          });
          if (r.status === 429) {           // 속도 제한 — 한 번만 쉬고 재시도
            await sleep(RATE_RETRY_MS);
            r = await fetch(`${TRIPO_API}/generation/text-to-model`, {
              method: "POST",
              headers: tripoHeaders,
              body: JSON.stringify({ prompt, model: TRIPO_MODEL }),
            });
          }
          const d = await r.json().catch(() => ({}));
          const taskId = d?.data?.task_id;
          if (!r.ok || !taskId) {
            console.error("[object-model] 주문 실패", item.word, r.status, JSON.stringify(d).slice(0, 200));
            rejected.push(item.word + (r.status === 429 ? "(속도제한)" : "(" + r.status + ")"));
            continue;
          }
          jobs[item.word] = {
            task_id: taskId,
            prompt,
            created_at: new Date().toISOString(),
          };
          metaDirty = true;
          queued.push(item.word);
        } catch (e) {
          console.error("[object-model] 주문 예외", item.word, (e as Error).message);
          rejected.push(item.word);
        }
      }
      result.queued = queued;
      result.rejected = rejected;
      result.deferred = deferred;          // 다음 호출에서 주문될 단어들
      result.skipped_existing = Array.from(seen).filter((w) => models[w]).length;
    }

    // ── meta 기록 ──────────────────────────────────────────────
    if (metaDirty) {
      const newMeta = { ...meta };
      if (Object.keys(models).length) newMeta.object_models = models;
      else delete newMeta.object_models;
      if (Object.keys(jobs).length) newMeta.object_model_jobs = jobs;
      else delete newMeta.object_model_jobs;
      const upd = await supabase.from("memories").update({ meta: newMeta }).eq("id", memoryId);
      if (upd.error) {
        console.error("[object-model] meta 저장 실패:", upd.error.message);
        return json({ ...result, error: "meta 저장 실패", detail: upd.error.message }, 502, cors);
      }
    }

    result.models_total = Object.keys(models).length;
    result.jobs_pending = Object.keys(jobs).length;
    return json(result, 200, cors);
  } catch (e) {
    console.error("[object-model] 내부 오류:", e);
    return json({ error: "서버 내부 오류", detail: (e as Error).message }, 500, cors);
  }
});
