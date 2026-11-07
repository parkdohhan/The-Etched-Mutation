// tools/plausibility/lib/models.mjs — 후보 식 M1·M2·M3 + 영모형 N1~N4·N6 (사전 등록 v1 §4·§5)
// 순수 함수. 입력 = 걸음(step)·후보 id 배열·기억 맥락(ctx). 출력 = Map(후보 id → 점수, 클수록 개연성 높음).
//
// step = { i, j, u (단위벡터, 기억 축), uRaw, isVoid, Uprev (이전 행들의 단위벡터 배열), replay? }
// ctx  = buildContext(scenes, { rho })

import { parseEmotion, memoryAxes, toArray, unit, cos, add, sub, scale, isZero } from './vec.mjs';

export const VOID_AXES = ['emptiness', 'numbness'];

export function buildContext(scenesIn, { rho = 0.6 } = {}) {
  const scenes = scenesIn.slice().sort((a, b) => Number(a.scene_order) - Number(b.scene_order));
  const axes = memoryAxes(scenes);
  const O = new Map(), Oraw = new Map(), order = new Map(), byId = new Map();
  for (const s of scenes) {
    const raw = toArray(parseEmotion(s.original_emotion), axes);
    Oraw.set(s.id, raw); O.set(s.id, unit(raw)); order.set(s.id, Number(s.scene_order)); byId.set(s.id, s);
  }
  let sum = new Array(axes.length).fill(0);
  for (const v of O.values()) sum = add(sum, v);
  const obar = unit(sum);
  const voidScene = scenes.find((s) => s.void_info && (s.void_info.sceneVoid || s.void_info.scene_void)) || null;
  const vAxes = VOID_AXES.filter((a) => axes.includes(a));
  let voidVec;
  if (vAxes.length) voidVec = unit(axes.map((a) => (vAxes.includes(a) ? 1 : 0)));
  else if (voidScene) voidVec = O.get(voidScene.id);
  else voidVec = unit(axes.map(() => 1));
  return {
    scenes, axes, O, Oraw, obar, order, byId,
    voidSceneId: voidScene ? voidScene.id : null, voidVec,
    rho, E: buildEncodingContexts(scenes, O, rho),
  };
}

/** M3: 작가 순서(scene_order)로 점마다 "첫 실 저장 맥락" e_k */
export function buildEncodingContexts(scenes, O, rho) {
  const E = new Map(); const w = Math.sqrt(1 - rho * rho); let prev = null;
  for (const s of scenes) {
    const o = O.get(s.id);
    const e = prev ? unit(add(scale(prev, rho), scale(o, w))) : o;
    E.set(s.id, e); prev = e;
  }
  return E;
}

/** M3: 회차 맥락 m_t (영벡터는 건너뜀) */
export function contextVector(Uprev, u, rho) {
  const w = Math.sqrt(1 - rho * rho); let m = null;
  for (const x of [...Uprev, u]) {
    if (isZero(x)) continue;
    m = m ? unit(add(scale(m, rho), scale(x, w))) : x;
  }
  return m;
}

export function scoreM1(step, cands, ctx) {
  const oi = ctx.O.get(step.i); const u = step.u;
  let c;
  if (isZero(u)) c = oi;
  else {
    const alpha = Math.max(0, cos(u, oi));
    c = step.isVoid ? ctx.voidVec : add(scale(oi, alpha), scale(u, 1 - alpha));
  }
  return new Map(cands.map((k) => [k, cos(c, ctx.O.get(k))]));
}

export function scoreM2(step, cands, ctx) {
  const oi = ctx.O.get(step.i), ob = ctx.obar, u = step.u;
  const flat = () => new Map(cands.map((k) => [k, 0.5]));
  if (isZero(u)) return flat();
  const du0 = sub(u, ob), di0 = sub(oi, ob);
  const a = (isZero(du0, 1e-9) || isZero(di0, 1e-9)) ? 0.5 : (1 + cos(du0, di0)) / 2;
  const r = add(scale(oi, 1 - a), scale(ob, a));
  const du = sub(u, r);
  if (isZero(du, 1e-9)) return flat();
  return new Map(cands.map((k) => {
    const dk = sub(ctx.O.get(k), r);
    return [k, isZero(dk, 1e-9) ? 0.5 : (1 + cos(du, dk)) / 2];
  }));
}

export function scoreM3(step, cands, ctx, rho = ctx.rho) {
  const E = rho === ctx.rho ? ctx.E : buildEncodingContexts(ctx.scenes, ctx.O, rho);
  const ei = E.get(step.i);
  const m = contextVector(step.Uprev || [], step.u, rho);
  if (!m || isZero(m)) return new Map(cands.map((k) => [k, cos(ei, E.get(k))]));
  const alpha = Math.max(0, cos(m, ei));
  const c = unit(add(scale(ei, alpha), scale(m, 1 - alpha)));
  return new Map(cands.map((k) => [k, cos(c, E.get(k))]));
}

export function scoreN1(step, cands) { return new Map(cands.map((k) => [k, 0])); }
export function scoreN2(step, cands, ctx) {
  const oi = ctx.order.get(step.i);
  return new Map(cands.map((k) => { const d = Math.abs(ctx.order.get(k) - oi); return [k, d > 0 ? 1 / d : 1]; }));
}
export function scoreN3(step, cands, ctx) { const oi = ctx.O.get(step.i); return new Map(cands.map((k) => [k, cos(oi, ctx.O.get(k))])); }
export function scoreN4(step, cands) {
  const r = step.replay;
  if (!r || !r.center || !r.pinPos) return scoreN1(step, cands);
  return new Map(cands.map((k) => { const p = r.pinPos.get(k); return [k, p ? -Math.hypot(p.x - r.center.x, p.y - r.center.y) : -9]; }));
}
export function scoreN6(step, cands, ctx) {
  const u = step.u; if (isZero(u)) return scoreN3(step, cands, ctx);
  return new Map(cands.map((k) => [k, cos(u, ctx.O.get(k))]));
}

export const MODELS = {
  M1: scoreM1,
  M2: scoreM2,
  M3: (s, c, ctx) => scoreM3(s, c, ctx, ctx.rho),
  N1: scoreN1, N2: scoreN2, N3: scoreN3, N4: scoreN4, N6: scoreN6,
};
export const CANDIDATE_MODELS = ['M1', 'M2', 'M3'];
export const NULL_MODELS = ['N1', 'N2', 'N3', 'N4', 'N6'];
