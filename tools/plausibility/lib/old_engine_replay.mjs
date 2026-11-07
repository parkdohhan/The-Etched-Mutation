// tools/plausibility/lib/old_engine_replay.mjs — 옛 엔진(play-test 0.5단계, 2026-07-27~) 접근 집합 재생
// 사전 등록 v1 §6. 목적: 각 걸음에서 "어떤 문이 열려 있었나"(제시 집합 O_i) 복원 + 영모형 N4 중심.
// 규칙은 play-test.html 의 byeoriCalculateStep → handleEmotionResult → updateAccess 를 그대로 옮겼다.
// 판단 수학(코사인·shape·bucket)은 js/shared/math.js 를 직접 import 해 재정의하지 않는다.

import {
  cosineSimilarity, calculateShapeSimilarity, calculateLevelSimilarity,
  calculateTrajectoryAlignment, getBucket, DEFAULT_EMOTION_ANCHORS,
} from '../../../js/shared/math.js';
import { parseEmotion } from './vec.mjs';

export const ENGINE_VERSION_CUTOFF = '2026-08-10T17:11:08+09:00'; // 커밋 33cb120: fixation 특례 제거

// ── play-test.html 상수 사본 (변경 시 양쪽 동기화) ──
const TRANSITION_RULES = {
  echo_follow: { radius: 0.42 }, bridge: { radius: 0.62 }, contradiction: { radius: 0.36 },
  displacement: { radius: 0.48 }, avoidance: { radius: 0.24 }, fixation: { radius: 0.09 },
};
const PATTERN_CENTER = {
  echo_follow: { wOrig: 0.7, wUser: 0.3 }, bridge: { wOrig: 0.5, wUser: 0.5 },
  contradiction: { mode: 'negate_user' }, displacement: { wOrig: 0.3, wUser: 0.7 },
  avoidance: { mode: 'void' }, fixation: { mode: 'current_scene' },
};
const PATTERN_AXES = [...DEFAULT_EMOTION_ANCHORS];
const AF_AXIS_X = { self_blame: -1, other_blame: 0, fate_blame: 1 };
const AF_AXIS_Z = { abandonment: -1, rejection: -0.33, powerlessness: 0.33, loss: 1 };
const E2A_AF = {
  fear: { s: 0.2, o: 0.1, f: 0.7 }, sadness: { s: 0.3, o: 0.1, f: 0.6 }, anger: { s: 0.1, o: 0.7, f: 0.2 },
  guilt: { s: 0.8, o: 0.05, f: 0.15 }, shame: { s: 0.75, o: 0.15, f: 0.1 }, joy: { s: 0.3, o: 0.3, f: 0.4 },
  numbness: { s: 0.15, o: 0.05, f: 0.8 }, isolation: { s: 0.3, o: 0.3, f: 0.4 }, longing: { s: 0.2, o: 0.2, f: 0.6 },
  resentment: { s: 0.1, o: 0.8, f: 0.1 }, resignation: { s: 0.1, o: 0.05, f: 0.85 }, hope: { s: 0.2, o: 0.2, f: 0.6 },
  relief: { s: 0.2, o: 0.1, f: 0.7 }, love: { s: 0.15, o: 0.3, f: 0.55 }, gratitude: { s: 0.15, o: 0.35, f: 0.5 },
  peace: { s: 0.15, o: 0.15, f: 0.7 }, confusion: { s: 0.3, o: 0.2, f: 0.5 },
};
const E2F_AF = {
  fear: { a: 0.15, r: 0.1, p: 0.55, l: 0.2 }, sadness: { a: 0.3, r: 0.1, p: 0.1, l: 0.5 },
  anger: { a: 0.1, r: 0.3, p: 0.5, l: 0.1 }, guilt: { a: 0.2, r: 0.25, p: 0.15, l: 0.4 },
  shame: { a: 0.15, r: 0.6, p: 0.1, l: 0.15 }, joy: { a: 0.15, r: 0.15, p: 0.15, l: 0.55 },
  numbness: { a: 0.3, r: 0.1, p: 0.4, l: 0.2 }, isolation: { a: 0.6, r: 0.25, p: 0.1, l: 0.05 },
  longing: { a: 0.55, r: 0.15, p: 0.05, l: 0.25 }, resentment: { a: 0.15, r: 0.35, p: 0.4, l: 0.1 },
  resignation: { a: 0.2, r: 0.05, p: 0.6, l: 0.15 }, hope: { a: 0.2, r: 0.15, p: 0.15, l: 0.5 },
  relief: { a: 0.1, r: 0.1, p: 0.3, l: 0.5 }, love: { a: 0.4, r: 0.2, p: 0.1, l: 0.3 },
  gratitude: { a: 0.2, r: 0.15, p: 0.1, l: 0.55 }, peace: { a: 0.15, r: 0.1, p: 0.15, l: 0.6 },
  confusion: { a: 0.2, r: 0.2, p: 0.4, l: 0.2 },
};

// ── AF 2D 투영 (play-test projectEmotionToAFContour / emotionToMapCoords) ──
function emotionToAttrAF(e) {
  const out = { self_blame: 0, other_blame: 0, fate_blame: 0 }; let total = 0;
  for (const k in e) { const w = Number(e[k] || 0); const m = E2A_AF[k]; if (!w || !m) continue; out.self_blame += w * m.s; out.other_blame += w * m.o; out.fate_blame += w * m.f; total += w; }
  if (total <= 0) return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
  out.self_blame /= total; out.other_blame /= total; out.fate_blame /= total; return out;
}
function emotionToFearAF(e) {
  const out = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 }; let total = 0;
  for (const k in e) { const w = Number(e[k] || 0); const m = E2F_AF[k]; if (!w || !m) continue; out.abandonment += w * m.a; out.rejection += w * m.r; out.powerlessness += w * m.p; out.loss += w * m.l; total += w; }
  if (total <= 0) return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
  out.abandonment /= total; out.rejection /= total; out.powerlessness /= total; out.loss /= total; return out;
}
function afProject(obj, axis) { let x = 0, w = 0; for (const k in obj) { const v = Number(obj[k] || 0); if (!v || axis[k] === undefined) continue; x += v * axis[k]; w += v; } return w > 0 ? Math.max(-1, Math.min(1, x / w)) : 0; }
export function emotionToMapCoords(emotion) {
  const e = parseEmotion(emotion || {});
  const x = afProject(emotionToAttrAF(e), AF_AXIS_X), z = afProject(emotionToFearAF(e), AF_AXIS_Z);
  // (af.x * HALF) / SIZE + 0.5, HALF = SIZE/2 → af.x * 0.5 + 0.5
  return { x: Math.max(0, Math.min(1, x * 0.5 + 0.5)), y: Math.max(0, Math.min(1, z * 0.5 + 0.5)) };
}
export function mapCoordsSpread(baseX, baseY, idx, sceneId) {
  const s = String(sceneId != null ? sceneId : idx); let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const ang = (Math.abs(h) % 628) / 100; const mag = 0.012 + (Math.abs(h) % 23) / 2300;
  let nx = baseX + Math.cos(ang) * mag, ny = baseY + Math.sin(ang * 1.07) * mag;
  nx = Math.max(0.03, Math.min(0.97, nx)); ny = Math.max(0.03, Math.min(0.97, ny));
  return { x: nx, y: ny };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** play-test buildPins 의 core/bridge/voidPin 부분 (echo 핀은 접근 집합과 무관) */
export function buildPins(scenesIn) {
  const scenes = scenesIn.slice().sort((a, b) => Number(a.scene_order) - Number(b.scene_order));
  const pins = scenes.map((scene, idx) => {
    const base = emotionToMapCoords(parseEmotion(scene.original_emotion));
    const sp = mapCoordsSpread(base.x, base.y, idx, scene.id);
    const type = scene.scene_role === 'residual' ? 'bridge' : 'core';
    return { id: type + '-' + scene.id, type, sceneId: scene.id, mapX: sp.x, mapY: sp.y, sceneOrder: Number(scene.scene_order) };
  });
  const voidScene = scenes.find((s) => s.void_info && s.void_info.sceneVoid);
  if (voidScene) pins.push({ id: 'void-' + voidScene.id, type: 'voidPin', sceneId: voidScene.id, mapX: 0.88, mapY: 0.78 });
  return pins;
}

// ── 엔진 스텝 (byeoriCalculateStep → ByeoriEngine.calculateStep, 대화 경로 입력 그대로) ──
export function parseAnchors(scene) {
  let a = scene.anchor_emotions;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = null; } }
  return Array.isArray(a) && a.length ? a.map(String) : null;
}
export function originalVectorFromScene(scene) {
  const vi = scene.void_info || {};
  return {
    base: parseEmotion(scene.original_emotion),
    reason_analysis: { attribution: scene.original_reason || null, target: vi.target || null, core_fear: vi.coreFear || vi.core_fear || null, is_void: !!vi.sceneVoid },
  };
}
export function initialState() { return { sceneScores: [], userTraj: [], origTraj: [], emotionHistory: [], previousBucket: null }; }

export function engineStep({ u, isVoid, scene, memoryAxesList, state }) {
  const orig = originalVectorFromScene(scene);
  const anchors = parseAnchors(scene);
  const frameKeys = anchors && anchors.length ? anchors : (memoryAxesList && memoryAxesList.length ? memoryAxesList : null);
  const cur = Math.max(0, cosineSimilarity(u, orig.base, frameKeys));
  const allScores = [...state.sceneScores, cur];
  const level = calculateLevelSimilarity(allScores);
  const userTraj = [...state.userTraj, u]; const origTraj = [...state.origTraj, orig.base];
  const shape = calculateShapeSimilarity(userTraj, origTraj, frameKeys);
  const voidMod = (!!isVoid && !orig.reason_analysis.is_void) ? 0.7 : 1.0;
  const alignment = calculateTrajectoryAlignment(level, shape.clamped, voidMod);
  const bucket = getBucket(alignment, state.previousBucket, state.emotionHistory);
  let mismatch = null;
  if (!!isVoid !== !!orig.reason_analysis.is_void) mismatch = 'void_mismatch';
  else if (cosineSimilarity(u, orig.base, frameKeys) < 0.5) mismatch = 'emotion_mismatch';
  // attribution / target: 대화 경로는 관객 쪽 null → 판정 불가(원본 코드와 동일)
  let pattern;
  if (bucket === 'FIXATED') pattern = 'fixation';
  else if (level >= 0.5 && shape.clamped < 0.3 && userTraj.length >= 3 && origTraj.length >= 3) pattern = 'displacement';
  else if (bucket === 'HIGH') pattern = 'echo_follow';
  else if (bucket === 'MID') pattern = 'bridge';
  else if (mismatch === 'void_mismatch') pattern = 'avoidance';
  else if (mismatch === 'emotion_mismatch') pattern = 'contradiction';
  else pattern = 'bridge';
  return {
    cur, level, shape: shape.clamped, alignment, bucket, mismatch, pattern,
    next: { sceneScores: allScores, userTraj, origTraj, emotionHistory: [...state.emotionHistory, u], previousBucket: bucket },
  };
}

// ── 접근 집합 (updateAccess) ──
function matchRule(c, u, flags) {
  if (!c || typeof c !== 'object') return false;
  if (c.type === 'emotion_threshold') return Number((u || {})[c.emotion] || 0) >= Number(c.min != null ? c.min : 0.6);
  if (c.type === 'emotion_below') return Number((u || {})[c.emotion] || 0) < Number(c.max != null ? c.max : 0.5);
  flags.unsupportedExclusion.push(String(c.type)); return false;
}
function lockedByExclusions(scene, u, visited, flags) {
  const ex = scene && scene.exclusions;
  if (!Array.isArray(ex) || !ex.length) return false;
  if (visited.has(scene.id)) return false;
  return ex.some((r) => matchRule(r && r.condition, u, flags));
}
function computeAccessCenter(pattern, user, orig, fallbackPos, pins) {
  const cfg = PATTERN_CENTER[pattern] || PATTERN_CENTER.bridge;
  if (cfg.mode === 'current_scene') return Object.keys(orig).length ? emotionToMapCoords(orig) : fallbackPos;
  if (cfg.mode === 'negate_user') {
    const cs = pins.filter((p) => (p.type === 'core' || p.type === 'bridge') && p.mapX != null);
    if (cs.length && fallbackPos) {
      let cx = 0, cy = 0; cs.forEach((p) => { cx += p.mapX; cy += p.mapY; }); cx /= cs.length; cy /= cs.length;
      return { x: Math.max(0.03, Math.min(0.97, 2 * cx - fallbackPos.x)), y: Math.max(0.03, Math.min(0.97, 2 * cy - fallbackPos.y)) };
    }
    const neg = {}; for (const k of PATTERN_AXES) neg[k] = 1 - Number(user[k] || 0); return emotionToMapCoords(neg);
  }
  if (cfg.mode === 'void') { const vp = pins.find((p) => p.type === 'voidPin'); return vp ? { x: vp.mapX, y: vp.mapY } : fallbackPos; }
  if (!Object.keys(user).length && !Object.keys(orig).length) return fallbackPos;
  const blend = {}; const keys = new Set(PATTERN_AXES.concat(Object.keys(user), Object.keys(orig)));
  keys.forEach((k) => { blend[k] = Number(orig[k] || 0) * cfg.wOrig + Number(user[k] || 0) * cfg.wUser; });
  return emotionToMapCoords(blend);
}

export function replayAccess({ pattern, uRaw, scene, byId, pins, visited, version, flags }) {
  const cores = pins.filter((p) => (p.type === 'core' || p.type === 'bridge') && !lockedByExclusions(byId.get(p.sceneId), uRaw, visited, flags));
  const fallbackPos = emotionToMapCoords(uRaw);
  const center = computeAccessCenter(pattern, uRaw, parseEmotion(scene.original_emotion), fallbackPos, pins);
  let spread = 0;
  for (let i = 0; i < cores.length; i++) for (let j = i + 1; j < cores.length; j++) { const d = dist({ x: cores[i].mapX, y: cores[i].mapY }, { x: cores[j].mapX, y: cores[j].mapY }); if (d > spread) spread = d; }
  spread = Math.max(0.08, Math.min(1, spread));
  const rule = TRANSITION_RULES[pattern] || TRANSITION_RULES.bridge;
  const radius = rule.radius * spread;
  const pool = cores.filter((p) => !visited.has(p.sceneId));
  const withDist = pool.map((p) => ({ pin: p, d: dist(center, { x: p.mapX, y: p.mapY }) }));
  let selected;
  const originPin = cores.find((p) => p.sceneId === scene.id) || null;
  if (version === 'pre0810' && pattern === 'fixation' && originPin) {
    selected = [originPin]; flags.pre0810Fixation++;
  } else {
    selected = withDist.filter((o) => o.d <= radius).map((o) => o.pin);
    if (!selected.length) selected = withDist.filter((o) => o.d <= radius * 1.85).map((o) => o.pin);
    if (!selected.length) { const ranked = withDist.slice().sort((a, b) => a.d - b.d); selected = ranked.length ? [ranked[0].pin] : cores.slice(); if (ranked.length) flags.fallbackB++; }
  }
  if (selected.length > 2) {
    const keep = new Set(selected.map((p) => p.id));
    selected = withDist.filter((o) => keep.has(o.pin.id)).sort((a, b) => a.d - b.d).slice(0, 2).map((o) => o.pin);
  }
  const vp = pins.find((p) => p.type === 'voidPin');
  if (vp && (pattern === 'avoidance' || pattern === 'contradiction') && !selected.includes(vp)) selected.push(vp);
  const offered = new Set(selected.map((p) => p.sceneId));
  const offeredUnvisited = new Set([...offered].filter((id) => !visited.has(id)));
  const pinPos = new Map(cores.map((p) => [p.sceneId, { x: p.mapX, y: p.mapY }]));
  return { center, radius, spread, offered, offeredUnvisited, pinPos, nCores: cores.length };
}

/**
 * 회차 하나 재생. rows = 시간순 plays 행 [{scene_id, created_at, user_emotion, is_void?}], journal = run_traces|null
 * 반환 { steps: [...], flags }
 */
export function replayRun({ runId, rows, scenes, pins, memoryAxesList, toUnit, journal = null, cutoffIso = ENGINE_VERSION_CUTOFF }) {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const cutoff = new Date(cutoffIso).getTime();
  const flags = { unsupportedExclusion: [], pre0810Fixation: 0, fallbackB: 0, unknownScene: 0 };
  const visited = new Set();
  // 회차 일지 visit_order 가 있으면 첫 plays 행 앞의 방문(프롤로그 등)을 보탠다
  const jOrder = journal && Array.isArray(journal.visit_order) ? journal.visit_order.map((v) => String(v).replace(/^(core|bridge|void)-/, '')) : null;
  if (jOrder && rows.length) { const firstIdx = jOrder.indexOf(rows[0].scene_id); if (firstIdx > 0) for (let q = 0; q < firstIdx; q++) if (byId.has(jOrder[q])) visited.add(jOrder[q]); }
  const jPattern = new Map();
  if (journal && Array.isArray(journal.scenes)) for (const t of journal.scenes) if (t && t.scene_id && !jPattern.has(t.scene_id)) jPattern.set(t.scene_id, t.pattern || null);

  let state = initialState();
  const Uprev = [];
  const steps = [];
  for (let t = 0; t < rows.length; t++) {
    const row = rows[t]; const scene = byId.get(row.scene_id);
    if (!scene) { flags.unknownScene++; continue; }
    const uRaw = parseEmotion(row.user_emotion); const isVoid = !!row.is_void;
    const eng = engineStep({ u: uRaw, isVoid, scene, memoryAxesList, state });
    visited.add(scene.id); // visitedCore 는 씬 진입 시 세팅 → updateAccess 전에 포함
    const version = new Date(row.created_at).getTime() < cutoff ? 'pre0810' : 'post0810';
    const acc = replayAccess({ pattern: eng.pattern, uRaw, scene, byId, pins, visited, version, flags });
    const next = rows[t + 1] || null;
    if (next && next.scene_id !== scene.id && byId.has(next.scene_id)) {
      const omega = scenes.map((s) => s.id).filter((id) => !visited.has(id));
      steps.push({
        runId, t, i: scene.id, j: next.scene_id, time: row.created_at, userId: row.user_id || null,
        uRaw, u: toUnit(uRaw), isVoid, Uprev: Uprev.slice(),
        visited: new Set(visited), omega,
        replay: { version, pattern: eng.pattern, bucket: eng.bucket, alignment: eng.alignment, center: acc.center, radius: acc.radius, offered: acc.offered, offeredUnvisited: acc.offeredUnvisited, pinPos: acc.pinPos },
        journalPattern: jPattern.has(scene.id) ? jPattern.get(scene.id) : undefined,
      });
    }
    Uprev.push(toUnit(uRaw));
    state = eng.next;
  }
  return { steps, flags };
}
