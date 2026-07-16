// record-erosion — 이본 지층 W2-2 (2026-07-16): 봉인 시 변형층 저장 + 스냅샷 로깅.
//
// 배경 (docs/이본지층/이본지층_설계_v1-260716.md 결정 7):
//   회차 봉인 시 그 관객 몫의 침식(누적 변형층 = 높이 델타 + 발길 지도)을 굽고 저장한다.
//   plays 로그가 진실, terrain_layers 는 재구성 가능한 캐시(W1 rebuildFromPlays).
//   memories/terrain_layers RLS = 익명 관객 직접 쓰기 불가 → service_role Edge 경유가 유일한 길
//   (record-contamination · record-drift-cumulative 와 같은 패턴).
//
// 방어 (record-contamination R6 판례 + 지형 특화):
//   ① 본문 크기 상한 (스냅샷 포함분)
//   ② memoryId UUID + 그 기억에 최근 180분 plays 행 존재 (무플레이 밀어넣기 차단)
//   ③ generation = 서버 보관값+1 만 허용 (역행·점프 거부 → 동시 봉인 경합은 한쪽 409.
//      클라이언트는 조용히 포기 + 콘솔 로그. plays 장부로 재구성 가능하므로 유실 아님)
//   ④ 델타 값 범위: |height_delta 잎| ≤ HEIGHT_SCALE, foot_map 잎 ∈ [0,1].
//      변화 예산: 직전 저장분과의 Σ|Δ| ≤ 격자 셀 수 × PER_CELL_STEP.
//   ⑤ 모르는 최상위 키는 무시 (거부 아님 — R3-2 판례).
//
//   height_delta/foot_map 의 내부 구조는 W1 serializeLayer 계약이 정한다 —
//   본 함수는 구조에 무지하고, jsonb 를 재귀 순회해 숫자 잎만 범위 검증한다(어떤 격자 형태든 안전).
//
// ─── W1 실측 부재 메모 (2026-07-16) ───────────────────────────────
//   핸드아웃 W2-2 는 본문 상한·변화 예산을 "W1 시뮬 실측치"에서 정하라 지시했으나,
//   집필 시점 W1(tem_variant_strata.js)이 아직 없음. 그래서:
//     - MAX_BODY_BYTES = 512KB : W1 스냅샷 목표 <150KB 의 ~3.4배 여유(설계 §4 목표치 기반)
//     - PER_CELL_STEP = 10 : HEIGHT_SCALE(20)의 절반. 정상 봉인은 관객 1명이 지난 경로만
//       얕게 바꾸므로 Σ|Δ| ≪ 셀 수. 이 상한은 "전 격자 대량 조작" 공격만 차단하는 넉넉한 값.
//   두 값 모두 W1 시뮬 실측 완료 후 "실측치×3"으로 재보정 대상(보고서 "못 한 것").
//
// 배포: supabase functions deploy record-erosion --no-verify-jwt
//   (익명 관객이 봉인 시 호출 → verify_jwt=false. MCP 가 true 로 켜면 CLI 로 복원 — R3-2 판례)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

// ─── 방어 상수 ────────────────────────────────────────────────────
const MAX_BODY_BYTES = 512 * 1024;    // 스냅샷 포함분 (W1 실측 후 재보정)
const RECENT_PLAY_WINDOW_MIN = 180;   // record-contamination 과 동일 창
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEIGHT_SCALE = 20;              // 설계 §3 바닥 높이 스케일. |height_delta 잎| ≤ 이 값
const PER_CELL_STEP = 10;             // 셀당 봉인 1회 변화 예산 근사 (W1 실측 대체 — 재보정 대기)
const MAX_LEAVES = 200000;            // 격자 셀 수 상한 (쓰레기 페이로드 안전망)
const MAX_SNAPSHOT_BYTES = 400 * 1024; // 스냅샷 단독 상한 (본문 상한 안에서)

interface RequestBody {
  memoryId: string;
  height_delta: unknown;
  foot_map: unknown;
  generation: number;
  snapshot?: unknown;
}

/**
 * jsonb 를 재귀 순회해 숫자 잎을 out 에 모은다. 구조(2D 배열·flat·객체)에 무지.
 * 잎 수가 MAX_LEAVES 를 넘으면 false 반환(중단). 비숫자 잎(문자열 등)은 무시.
 */
function collectNums(node: unknown, out: number[]): boolean {
  if (out.length > MAX_LEAVES) return false;
  const t = typeof node;
  if (t === "number") { out.push(node as number); return true; }
  if (Array.isArray(node)) {
    for (const x of node) { if (!collectNums(x, out)) return false; }
    return true;
  }
  if (node && t === "object") {
    for (const k of Object.keys(node as Record<string, unknown>)) {
      if (!collectNums((node as Record<string, unknown>)[k], out)) return false;
    }
    return true;
  }
  return true;
}

function jsonError(msg: string, status: number, cors: Record<string, string>, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: false, error: msg, ...(extra || {}) }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405, corsHeaders);

  // ─── ①: 본문 크기 상한 ───────────────────────────────────
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return jsonError("body too large", 413, corsHeaders);

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON body", 400, corsHeaders);
  }

  // ─── ②a: memoryId UUID ───────────────────────────────────
  if (!body.memoryId || typeof body.memoryId !== "string" || !UUID_RX.test(body.memoryId)) {
    return jsonError("memoryId must be a uuid", 400, corsHeaders);
  }

  // ─── generation: 정수 ────────────────────────────────────
  const reqGen = body.generation;
  if (!Number.isInteger(reqGen) || (reqGen as number) < 0) {
    return jsonError("generation must be a non-negative integer", 400, corsHeaders);
  }

  // ─── ④a: height_delta / foot_map 존재 + 잎 범위 ──────────
  if (body.height_delta === undefined || body.height_delta === null
      || typeof body.height_delta !== "object") {
    return jsonError("height_delta must be an object/array", 400, corsHeaders);
  }
  if (body.foot_map === undefined || body.foot_map === null
      || typeof body.foot_map !== "object") {
    return jsonError("foot_map must be an object/array", 400, corsHeaders);
  }

  const curLeaves: number[] = [];
  if (!collectNums(body.height_delta, curLeaves)) {
    return jsonError("height_delta too large (grid over limit)", 413, corsHeaders);
  }
  for (const v of curLeaves) {
    if (!isFinite(v) || Math.abs(v) > HEIGHT_SCALE) {
      return jsonError(`height_delta value out of range (|v| <= ${HEIGHT_SCALE})`, 400, corsHeaders);
    }
  }

  const footLeaves: number[] = [];
  if (!collectNums(body.foot_map, footLeaves)) {
    return jsonError("foot_map too large (grid over limit)", 413, corsHeaders);
  }
  for (const v of footLeaves) {
    if (!isFinite(v) || v < 0 || v > 1) {
      return jsonError("foot_map value out of range [0,1]", 400, corsHeaders);
    }
  }

  // ─── 스냅샷 단독 상한 (선택) ──────────────────────────────
  let snapshotStr: string | null = null;
  if (body.snapshot !== undefined && body.snapshot !== null) {
    snapshotStr = typeof body.snapshot === "string"
      ? body.snapshot
      : JSON.stringify(body.snapshot);
    if (snapshotStr.length > MAX_SNAPSHOT_BYTES) {
      return jsonError("snapshot too large", 413, corsHeaders);
    }
  }

  // ─── Service-role client (RLS 우회) ──────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[record-erosion] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return jsonError("service config missing", 500, corsHeaders);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ─── 기억 존재 확인 ──────────────────────────────────────
  const { data: memRow, error: memErr } = await sb
    .from("memories").select("id").eq("id", body.memoryId).maybeSingle();
  if (memErr) {
    console.error("[record-erosion] memory select failed:", memErr);
    return jsonError(memErr.message, 500, corsHeaders);
  }
  if (!memRow) return jsonError("memory not found", 404, corsHeaders);

  // ─── ②b: 최근 plays 존재 (진짜 플레이한 회차만) ──────────
  const since = new Date(Date.now() - RECENT_PLAY_WINDOW_MIN * 60 * 1000).toISOString();
  const { count: recentPlays, error: playErr } = await sb
    .from("plays").select("id", { count: "exact", head: true })
    .eq("memory_id", body.memoryId).gte("created_at", since);
  if (playErr) {
    console.error("[record-erosion] play check failed:", playErr);
    return jsonError(playErr.message, 500, corsHeaders);
  }
  if (!recentPlays || recentPlays === 0) {
    console.warn(`[record-erosion] no recent play for memory ${body.memoryId} — rejected`);
    return jsonError("no recent play for this memory", 403, corsHeaders);
  }

  // ─── 기존 변형층 (generation 가드 + 예산 기준) ───────────
  const { data: layerRow, error: layerErr } = await sb
    .from("terrain_layers")
    .select("generation, height_delta")
    .eq("memory_id", body.memoryId).maybeSingle();
  if (layerErr) {
    console.error("[record-erosion] layer select failed:", layerErr);
    return jsonError(layerErr.message, 500, corsHeaders);
  }

  // ─── ③: generation = 서버 보관값+1 만 허용 ──────────────
  const storedGen = layerRow ? Number(layerRow.generation) : 0;
  const expectedGen = storedGen + 1;
  if (reqGen !== expectedGen) {
    console.warn(`[record-erosion] generation mismatch: got ${reqGen}, expected ${expectedGen}`);
    return jsonError(
      `generation must be ${expectedGen} (server has ${storedGen})`,
      409, corsHeaders, { expected: expectedGen, stored: storedGen },
    );
  }

  // ─── ④b: 변화 예산 Σ|Δ| ≤ 격자 셀 수 × PER_CELL_STEP ────
  const prevLeaves: number[] = [];
  collectNums(layerRow?.height_delta ?? {}, prevLeaves);
  let sumDiff = 0;
  if (curLeaves.length === prevLeaves.length) {
    for (let i = 0; i < curLeaves.length; i++) sumDiff += Math.abs(curLeaves[i] - prevLeaves[i]);
  } else {
    // 구조가 바뀜(격자 재정의) → 전량 새 값으로 보수적 계산
    for (const v of curLeaves) sumDiff += Math.abs(v);
  }
  const budget = Math.max(1, curLeaves.length) * PER_CELL_STEP;
  if (sumDiff > budget) {
    console.warn(`[record-erosion] change budget exceeded: ${sumDiff.toFixed(1)} > ${budget}`);
    return jsonError(
      `change budget exceeded (sum|delta| ${sumDiff.toFixed(1)} > ${budget})`,
      400, corsHeaders,
    );
  }

  // ─── 쓰기: terrain_layers upsert ─────────────────────────
  const { error: upErr } = await sb.from("terrain_layers").upsert({
    memory_id: body.memoryId,
    height_delta: body.height_delta,
    foot_map: body.foot_map,
    generation: reqGen,
    updated_at: new Date().toISOString(),
  }, { onConflict: "memory_id" });
  if (upErr) {
    console.error("[record-erosion] upsert failed:", upErr);
    return jsonError(upErr.message, 500, corsHeaders);
  }

  // ─── 스냅샷 Storage 업로드 (실패는 삼키되 응답에 표기 — 봉인을 막지 않음) ─
  let snapshotSaved = false;
  let snapshotNote = snapshotStr === null ? "not provided" : "";
  if (snapshotStr !== null) {
    try {
      const path = `${body.memoryId}/${reqGen}.json`;
      const { error: stErr } = await sb.storage
        .from("terrain_snapshots")
        .upload(path, new Blob([snapshotStr], { type: "application/json" }), {
          contentType: "application/json",
          upsert: true,
        });
      if (stErr) { snapshotNote = `upload failed: ${stErr.message}`; console.warn("[record-erosion] snapshot upload failed:", stErr); }
      else { snapshotSaved = true; snapshotNote = "saved"; }
    } catch (e) {
      snapshotNote = `upload threw: ${(e as Error).message}`;
      console.warn("[record-erosion] snapshot upload threw:", e);
    }
  }

  console.log(`[record-erosion] memory ${body.memoryId} generation ${storedGen}→${reqGen}, `
    + `${curLeaves.length} cells, sum|delta|=${sumDiff.toFixed(1)}/${budget}, snapshot=${snapshotNote}`);

  return new Response(JSON.stringify({
    ok: true,
    generation: reqGen,
    cells: curLeaves.length,
    change: Number(sumDiff.toFixed(2)),
    budget,
    snapshot_saved: snapshotSaved,
    snapshot_note: snapshotNote,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
