/**
 * 통로 T1 — 회랑 기하 규칙 (실험 전용, 본 코드 미반영) (2026-09-23)
 *
 * 목적: 전이 패턴 6종 + 출발·도착 장면의 감정 델타 + 정렬도 + 오염 3축을 받아
 *       "안개 모듈(js/ui/lumen_spatial_fog.js)이 깎을 회랑의 점 배열"을 결정론으로 만든다.
 *       같은 입력 = 같은 회랑. 난수 없음.
 * 선례: docs/씬은_사건이다_결정-260727.md (패턴 = 중심 이동, contradiction = 지도 반사),
 *       docs/생성형_지형모델_v2-260619.md §9 (라벨만 쓰면 궤적이 뭉개진다),
 *       CLAUDE.md §6.5 #1 (패턴은 반경이 아니라 기하를 바꾼다).
 * 소비자: test/corridor-t1-test.html. 본 코드(js 폴더)에서는 부르지 않는다.
 *
 * ── 규칙 요약 (문서로 옮길 때 이 블록을 그대로) ─────────────────────────
 *  입력  A, B(핀 xz) · from/to(장면 17축 벡터) · pattern · alignment a(0..1)
 *        · bucket(HIGH/MID/LOW/FIXATED) · cont {d 발산, c 수렴, h 이질}
 *  델타  Δ = to − from (17축).  dom = |Δ| 최대 축.  side = sign(Δ[dom]) (0 이면 +1)
 *        m = |Δ|₂,  mN = clamp(m / 1.4, 0, 1)   … 곡률·마디 수의 원료
 *        val = dom 축의 결(양성 +1 / 음성 −1)   … 되돌아가는 깊이·S자 비대칭의 원료
 *        sec = |Δ| 두 번째 축, r2 = Δ[sec] / |Δ[dom]| (−1..1) … 봉우리 치우침·고리 찌그러짐의 원료
 *        (동률은 앞 축 우선 — 결정론)
 *  길이  L = |B−A|.  L* = L × min(1.6, 1 + 0.75·(1−a))   (정렬도 0.2 에서 상한 1.6 도달)
 *        ⚠ 이 식이 실측과 정확히 맞는 것은 echo_follow 뿐이다 (0.9 ×1.075 / 0.5 ×1.375 / 0.2 ×1.6).
 *        bridge 는 S자 최소 진폭(0.12 + 0.12·mN) 때문에 a ≥ 약 0.52 에서는 길이가 정렬도에 반응하지
 *        않고 ×1.36 부근에 머문다 (a < 0.52 에서만 정렬도가 길이를 정한다).
 *        contradiction 은 "되돌림 바닥(seedR + w + 1)" 때문에 형태상 최소 길이가 있다 — 실측(0→2, seedR 6):
 *        MID 는 a ≥ 0.5 에서 ×1.55 고정, a=0.2 에서 ×1.60 (정렬도는 a < 약 0.45 에서만 길이를 정한다).
 *        HIGH(w 7) 는 최소 형태가 ×1.62 로 상한 1.6 을 넘는다 (되돌림 14 + 돌아옴 = 길이 바닥).
 *        그때는 s 최소값 형태를 그대로 두고 배율을 상태줄에 정직히 보고한다.
 *        displacement·fixation·avoidance 는 이 식을 쓰지 않는다 (제자리·옆길·띠).
 *  폭    w₀ = {HIGH 7, MID 5, LOW 3.5, FIXATED 2.5} (반폭, 모듈 기본 5 = 현행 무대)
 *        w = max(1.8, w₀ × (1 − 0.3·c))            … 수렴이 좁힌다
 *        w_i = w × k_i × (1 + 0.45·h·sin(2.399·i + domIdx)) … 이질이 마디마다 폭을 얼룩지게
 *        (k_i 는 패턴이 주는 마디별 배수 — displacement 의 목 마디만 0.55, 나머지 1)
 *  결    (페이지 셰이더 uniform) edgeAmp = (1 + 2.5·d)(1 − 0.8·c), edgeFreq = 1 + 1.2·d,
 *        grain = 0.16 + 0.5·d, heteroBlotch = h
 *  패턴  (u = A→B 단위, p = u 의 왼쪽 수직, off(t) 는 L 배율, seedR = 출발 자리 걷힘 반경(페이지가 줌, 기본 6))
 *    echo_follow    한 번 휘는 활: off = amp·sin(π·t^γ)·side, γ = log0.5 / log(0.5 + 0.1·r2)
 *                   (봉우리가 r2 쪽으로 살짝 치우침, 0.4..0.6 — V자로 읽히지 않게 클램프).
 *                   마디 6 + round(4·mN) (최소 6 → 곡선으로 읽힘).
 *                   amp 는 길이가 L* 가 되도록 이분 탐색(최소 0.04·mN). 정렬 높으면 거의 직선.
 *    bridge         S자: off = amp·sin(2πt)·(1 + (0.25·val + 0.25·r2)·cos(πt))·side.
 *                   마디 4 + round(6·mN). amp 최소 0.12 + 0.12·mN, 길이 L* 로 이분 탐색.
 *    contradiction  A 에서 B 반대 방향으로 dBack = max(seedR + w + 1, s·L·0.45·(val<0 ? 1 : 0.7))
 *                   (음성 축으로 뒤집히면 더 멀리 되돌아간다. 바닥값 덕에 갈고리가 출발 걷힘 원 밖으로
 *                   최소 w + 1 만큼 나온다(Catmull-Rom 이 P1 을 지나며 조금 더 벗어남 — MID 실측 14.6) —
 *                   260923 검토: 원에 삼켜져 "혹 달린 직선" 으로 읽히던 결함)
 *                   만큼 뚫린 뒤 side 쪽으로 bend = s·(0.25 + 0.35·mN)·L 꺾이고, 중간점이
 *                   bend·(0.35 + 0.3·r2) 만큼 더 벌어져 B 로 돌아온다. s 는 길이가 L* 가 되도록 이분 탐색
 *                   (0.15..1 — 정렬도는 오직 L* 를 통해서만 s 에 들어간다. 0.15 에서도 L* 를 넘으면 그대로
 *                   두고 배율을 보고한다). 격자 ±M 클램프. Catmull-Rom, 마디 5 + round(5·mN).
 *    displacement   평행이동: 출발점 A 에서 옆으로 shift = side·(6 + 10·mN + 8·(1−a)) 만큼 떨어진 A2 로
 *                   "목"(반폭 w×0.55 의 좁은 마디) 이 먼저 나고, A2 에서 B 옆(shift/2)까지 평행,
 *                   마지막 한 마디(길이 4 + 4·(1+r2))로 B 에 든다. 마디 3 (목 + 평행 + 진입).
 *                   (260923 검토: 목이 없으면 1인칭에서 걷힘 원과 회랑 사이 벽에 막혀 못 들어갔다 —
 *                    "옆으로 밀린 길이되 발이 닿는 길". 1인칭 실측(헤드리스, 0→2 MID a=0.7): A→A2→B2→B 를
 *                    0.5 단위 156 걸음으로 이동 벽에 한 번도 안 막히고 B 도달.)
 *    avoidance      회랑 없음. 벽만 얇아지는 "띠" — 직선 A→B 가 아니라 A → K → B 두 마디.
 *                   K = (A+B)/2 + p·(−side)·L·(0.08 + 0.2·mN + 0.12·(1−a)) : 델타가 가리키는 쪽의
 *                   반대(무감·void 쪽, CLAUDE.md §6.5 #1 "avoidance: void/neutral 영역")로 비켜 난다.
 *                   띠 반폭 r = w×1.2, thinAmt = min(0.95, (0.55 + 0.45·(1−a))·(0.8 + 0.3·mN)).
 *                   → 같은 라벨이라도 쌍이 다르면 비켜 나는 쪽·깊이·얇아짐이 갈린다 (라벨 단독 아님).
 *                   이동은 여전히 막힘 — "소리만 있는 통로". 도착 유령은 thinAmt 에 비례해서만 비친다.
 *    fixation       A 를 지나는 고리. 반지름 r = clamp(L* ÷ 2π, 5, 14), 중심 = A + p·side·r,
 *                   접선 축이 r·(1 + 0.3·r2) 로 찌그러진 타원. 마디 8 + round(6·mN).
 *                   끝 = A(제자리). 도착 개화 없음.
 */

export const AXES = Object.freeze([
  'fear', 'sadness', 'anger', 'guilt', 'shame', 'isolation', 'numbness',
  'moral_pain', 'helplessness', 'despair',
  'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort',
]);
// 판단 17축(docs/감정축_통일_제안_v1-260714.md 표 A). 앞 10 = 음성, 뒤 7 = 양성.
export const AXIS_VALENCE = Object.freeze(AXES.map((_, i) => (i < 10 ? -1 : 1)));
export const AXIS_KO = Object.freeze({
  fear: '두려움', sadness: '슬픔', anger: '분노', guilt: '죄책감', shame: '수치', isolation: '고립',
  numbness: '무감각', moral_pain: '도덕적 고통', helplessness: '무력', despair: '절망',
  joy: '기쁨', hope: '희망', relief: '안도', gratitude: '고마움', love: '사랑', peace: '평온', comfort: '편안함',
});

// 장면 프리셋 5 — 이름 + 17축 분포(빠진 축 = 0). 발췌 절제 규칙(30~100자)은 여기선 이름만.
export const SCENES = Object.freeze([
  { id: 'window', name: '빈 방의 창', vec: { sadness: 0.55, isolation: 0.5, numbness: 0.3, comfort: 0.1 } },
  { id: 'lie',    name: '들킨 거짓말', vec: { shame: 0.6, guilt: 0.5, fear: 0.35, anger: 0.15 } },
  { id: 'snow',   name: '첫눈의 마당', vec: { joy: 0.6, comfort: 0.5, love: 0.3, hope: 0.3 } },
  { id: 'ward',   name: '병실 복도',   vec: { fear: 0.5, helplessness: 0.5, despair: 0.35, sadness: 0.3 } },
  { id: 'call',   name: '다시 걸려온 전화', vec: { relief: 0.4, hope: 0.35, gratitude: 0.25, fear: 0.15, sadness: 0.15 } },
]);

export const PATTERNS = Object.freeze(['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation']);
export const PATTERN_KO = Object.freeze({
  echo_follow: '곧장 따라감', bridge: '건너감', contradiction: '뒤집힘',
  displacement: '옆으로 밀림', avoidance: '피해감', fixation: '맴돎',
});
export const BUCKETS = Object.freeze(['HIGH', 'MID', 'LOW', 'FIXATED']);
export const BUCKET_HALF_WIDTH = Object.freeze({ HIGH: 7, MID: 5, LOW: 3.5, FIXATED: 2.5 });

export const K_LENGTH = 0.75;   // 길이 = 직선 × (1 + K·(1−a)), 상한 1.6
export const MAX_RATIO = 1.6;

export function toVec(obj) { return AXES.map((k) => (obj && obj[k]) || 0); }

/** 델타 요약 — 지배 축, 부호, 크기(0..1), 결 */
export function deltaInfo(fromVec, toVec_) {
  const f = toVec(fromVec), t = toVec(toVec_);
  let dom = 0, best = -1, sq = 0;
  const d = new Array(AXES.length);
  for (let i = 0; i < AXES.length; i++) {
    d[i] = t[i] - f[i];
    sq += d[i] * d[i];
    if (Math.abs(d[i]) > best) { best = Math.abs(d[i]); dom = i; }   // 동률 = 앞 축 우선 (결정론)
  }
  let sec = -1, best2 = -1;
  for (let i = 0; i < AXES.length; i++) if (i !== dom && Math.abs(d[i]) > best2) { best2 = Math.abs(d[i]); sec = i; }
  const m = Math.sqrt(sq);
  const mN = Math.max(0, Math.min(1, m / 1.4));
  const side = d[dom] < 0 ? -1 : 1;
  const r2 = (sec >= 0 && best > 1e-6) ? Math.max(-1, Math.min(1, d[sec] / best)) : 0;
  return { delta: d, dom, domKey: AXES[dom], sec, secKey: sec >= 0 ? AXES[sec] : null, side, m, mN, val: AXIS_VALENCE[dom], r2 };
}

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}
function clampPt(p, M) { return { x: Math.max(-M, Math.min(M, p.x)), z: Math.max(-M, Math.min(M, p.z)) }; }

/** off(t) 함수로 곡선을 n 마디로 샘플 */
function sampleCurve(A, u, p, L, n, offFn) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = offFn(t) * L;
    pts.push({ x: A.x + u.x * L * t + p.x * o, z: A.z + u.z * L * t + p.z * o });
  }
  return pts;
}
/** amp 를 이분 탐색해 길이가 target 이 되게 (amp ≥ ampMin) */
function solveAmp(build, ampMin, target) {
  if (polyLength(build(ampMin)) >= target) return ampMin;
  let lo = ampMin, hi = 2.0;
  if (polyLength(build(hi)) < target) return hi;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (polyLength(build(mid)) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Catmull-Rom (끝점 복제) — 제어점을 n 마디로 */
function catmullRom(ctrl, n) {
  const P = [ctrl[0]].concat(ctrl, [ctrl[ctrl.length - 1]]);
  const segs = ctrl.length - 1;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * segs;
    const k = Math.min(segs - 1, Math.floor(s)), t = s - k;
    const p0 = P[k], p1 = P[k + 1], p2 = P[k + 2], p3 = P[k + 3];
    const t2 = t * t, t3 = t2 * t;
    const c = (a, b, cc, d) => 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
    out.push({ x: c(p0.x, p1.x, p2.x, p3.x), z: c(p0.z, p1.z, p2.z, p3.z) });
  }
  return out;
}

/**
 * 회랑 만들기.
 * @returns {{ points, segments, halfWidths, halfWidth, direct, length, ratio, bloomAtB, thin, info }}
 *   points     회랑 꼭짓점 배열 (마디 = points.length−1)
 *   halfWidths 마디별 반폭 (이질 얼룩 반영)
 *   thin       avoidance 전용 { a, k, b, r, amt, bend } — 벽만 얇아지는 띠 (A→K→B 두 마디)
 */
export function buildPath(opts) {
  const { A, B, pattern, from, to } = opts;
  const a = Math.max(0, Math.min(1, opts.alignment == null ? 0.7 : opts.alignment));
  const bucket = BUCKETS.includes(opts.bucket) ? opts.bucket : 'MID';
  const cont = Object.assign({ d: 0, c: 0, h: 0 }, opts.cont || {});
  const M = opts.gridMargin == null ? 56 : opts.gridMargin;
  const seedR = opts.seedR == null ? 6 : opts.seedR;     // 출발 자리 걷힘 반경 (contradiction 되돌림 바닥의 원료)
  const info = deltaInfo(from, to);
  const { side, mN, val, dom, r2 } = info;

  const dx = B.x - A.x, dz = B.z - A.z;
  const L = Math.hypot(dx, dz) || 1;
  const u = { x: dx / L, z: dz / L };
  const p = { x: -u.z, z: u.x };                 // 왼쪽 수직
  const ratioTarget = Math.min(MAX_RATIO, 1 + K_LENGTH * (1 - a));
  const Lt = L * ratioTarget;

  const w = Math.max(1.8, BUCKET_HALF_WIDTH[bucket] * (1 - 0.3 * cont.c));

  let points = [], bloomAtB = true, thin = null, amp = 0, n = 0, segScale = null;
  switch (pattern) {
    case 'echo_follow': {
      n = 6 + Math.round(4 * mN);                        // 최소 6 마디 — 활로 읽힌다 (V자 방지)
      const peak = 0.5 + 0.1 * r2;                       // 봉우리 자리 (0.4..0.6)
      const gamma = Math.log(0.5) / Math.log(peak);      // t^γ 가 peak 에서 0.5 가 되게
      const build = (am) => sampleCurve(A, u, p, L, n, (t) => am * Math.sin(Math.PI * Math.pow(t, gamma)) * side);
      amp = solveAmp(build, 0.04 * mN, Lt);
      points = build(amp);
      break;
    }
    case 'bridge': {
      n = 4 + Math.round(6 * mN);
      const asym = 0.25 * val + 0.25 * r2;
      const build = (am) => sampleCurve(A, u, p, L, n, (t) => am * Math.sin(2 * Math.PI * t) * (1 + asym * Math.cos(Math.PI * t)) * side);
      amp = solveAmp(build, 0.12 + 0.12 * mN, Lt);
      points = build(amp);
      break;
    }
    case 'contradiction': {
      n = 5 + Math.round(5 * mN);
      // 정렬도는 L* 를 통해서만 s 에 들어간다 (예전엔 backK 에도 (1−a) 가 곱해져 상한 1.6 을 넘겼다)
      const backK = 0.45 * (val < 0 ? 1 : 0.7);
      const bendK = (0.25 + 0.35 * mN) * side;
      const backFloor = seedR + w + 1;                   // 갈고리가 출발 걷힘 원 밖으로 w+1 이상 나온다 (형태상 최소 길이 ≈ ×1.5)
      const build = (s) => {
        const dBack = Math.max(backFloor, s * L * backK);
        const bend = s * bendK * L;
        const P1 = clampPt({ x: A.x - u.x * dBack, z: A.z - u.z * dBack }, M);
        const P2 = clampPt({ x: P1.x + p.x * bend, z: P1.z + p.z * bend }, M);
        const mk = 0.35 + 0.3 * r2;
        const mid = clampPt({ x: (P2.x + B.x) / 2 + p.x * bend * mk, z: (P2.z + B.z) / 2 + p.z * bend * mk }, M);
        return catmullRom([A, P1, P2, mid, B], n).map((q) => clampPt(q, M));
      };
      // 길이가 L* 가 되는 s 를 찾는다 (0.15..1). 최소 s 에서도 넘치면 그대로 두고 배율을 보고.
      let lo = 0.15, hi = 1;
      if (polyLength(build(lo)) >= Lt) amp = lo;
      else if (polyLength(build(hi)) <= Lt) amp = hi;
      else { for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (polyLength(build(mid)) < Lt) lo = mid; else hi = mid; } amp = (lo + hi) / 2; }
      points = build(amp);
      break;
    }
    case 'displacement': {
      n = 3;
      const shift = side * (6 + 10 * mN + 8 * (1 - a));
      const hook = 4 + 4 * (1 + r2);
      const A2 = clampPt({ x: A.x + p.x * shift + u.x * 3, z: A.z + p.z * shift + u.z * 3 }, M);
      const B2 = clampPt({ x: B.x + p.x * shift * 0.5 - u.x * hook, z: B.z + p.z * shift * 0.5 - u.z * hook }, M);
      // 목: A → A2 좁은 마디 (반폭 w×0.55) — 옆구리로 비집고 드는 입구. 없으면 1인칭에서 못 들어간다.
      points = [{ x: A.x, z: A.z }, A2, B2, { x: B.x, z: B.z }];
      segScale = [0.55, 1, 1];
      amp = shift / L;
      break;
    }
    case 'avoidance': {
      n = 2;
      // 띠는 델타의 반대쪽(무감 쪽)으로 비켜 난다 — 깊이는 mN 과 (1−a) 가 정한다
      const bend = -side * L * (0.08 + 0.2 * mN + 0.12 * (1 - a));
      const K = clampPt({ x: (A.x + B.x) / 2 + p.x * bend, z: (A.z + B.z) / 2 + p.z * bend }, M);
      points = [{ x: A.x, z: A.z }, K, { x: B.x, z: B.z }];
      thin = {
        a: { x: A.x, z: A.z }, k: K, b: { x: B.x, z: B.z },
        r: w * 1.2,
        amt: Math.min(0.95, (0.55 + 0.45 * (1 - a)) * (0.8 + 0.3 * mN)),
        bend: +bend.toFixed(2),
      };
      bloomAtB = false;
      amp = bend / L;
      break;
    }
    case 'fixation': {
      n = 8 + Math.round(6 * mN);
      const r = Math.max(5, Math.min(14, Lt / (2 * Math.PI)));
      const C = { x: A.x + p.x * side * r, z: A.z + p.z * side * r };
      const ax = A.x - C.x, az = A.z - C.z;                    // A−C
      const rt = r * (1 + 0.3 * r2);                           // 접선 축 — r2 로 찌그러진 타원
      const bx = u.x * side * rt, bz = u.z * side * rt;        // 접선 방향
      points = [];
      for (let i = 0; i <= n; i++) {
        const th = 2 * Math.PI * i / n;
        points.push(clampPt({ x: C.x + ax * Math.cos(th) + bx * Math.sin(th), z: C.z + az * Math.cos(th) + bz * Math.sin(th) }, M));
      }
      points[n] = { x: A.x, z: A.z };                          // 끝 = 제자리 (누적 오차 제거)
      bloomAtB = false;
      amp = r / L;
      break;
    }
    default:
      throw new Error('unknown pattern ' + pattern);
  }

  const segments = Math.max(0, points.length - 1);
  const halfWidths = [];
  for (let i = 0; i < segments; i++) {
    const k = segScale && segScale[i] != null ? segScale[i] : 1;
    halfWidths.push(Math.max(1.5, w * k * (1 + 0.45 * cont.h * Math.sin(2.399 * i + dom))));
  }
  const length = polyLength(points);   // avoidance 는 띠(A→K→B)의 길이

  return {
    pattern, points, segments, halfWidths, halfWidth: w, direct: L, length,
    ratio: length / L, ratioTarget, bloomAtB, thin, amp, nodes: n,
    texture: {
      edgeAmp: Math.max(0.05, (1 + 2.5 * cont.d) * (1 - 0.8 * cont.c)),
      edgeFreq: 1 + 1.2 * cont.d,
      grain: 0.16 + 0.5 * cont.d,
      hetero: cont.h,
    },
    info: { dom: info.domKey, domIdx: dom, sec: info.secKey, r2: +r2.toFixed(3), side, mN: +mN.toFixed(3), m: +info.m.toFixed(3), val, alignment: a, bucket, cont },
  };
}
