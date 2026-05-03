/**
 * SeekerMatchEngine — 멀티턴 fingerprint 카드(SeekerCard) 와
 *  메모리/유령 변주 카드(TargetCard) 를 결정론적 점수로 매칭.
 *
 * V2.1 SCOPE 정합:
 *  - LLM 호출 X (점수 산술만). LLM 은 멀티턴 turn 마다 fingerprint 추출에만 사용 (claude-scene).
 *  - SCOPE §15-2 (b) 결정론적 분기 룰셋. ByeoriEngine + ContaminationTracker 와 공존.
 *  - V2-3 (멀티턴 + emotion 분석) + V2-4 (drift/speciation 임계) 가 본 엔진을 공통 의존.
 *
 * 점수 공식:
 *   score = α·cosine(emotion_vec) + β·match(attribution) + γ·match(core_fear)
 *         + δ·motifOverlap + ε·match(modality)
 *
 * 점수 거리 (1등 - 2등) = runnerUpDelta. V2-4 drift/speciation 임계 판정 입력.
 *
 * @typedef {Object} SeekerCard  멀티턴 누적 fingerprint
 * @property {Object<string, number>} emotion_vec  감정 12축 0~1 점수
 * @property {?string} attribution                  self_blame|other_blame|fate_blame|unknown|null
 * @property {?string} core_fear                    abandonment|death|rejection|failure|none|null
 * @property {?string} modality                     visual|olfactory|auditory|somatic|narrative|null
 * @property {?string} role                         actor|observer|victim|null
 * @property {string[]} motif_words                 자유텍스트 키워드 (소문자 토큰)
 *
 * @typedef {Object} TargetCard  메모리/유령 변주 카드
 * @property {Object<string, number>} emotion_vec
 * @property {?string} attribution
 * @property {?string} core_fear
 * @property {?string} modality
 * @property {?string} role
 * @property {string[]} motif_tags                  admin 작성 키워드
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  alpha: 2.0,    // 감정 cosine 비중 — 작품에서 감정 정합이 가장 중요
  beta: 0.5,     // 귀인 일치
  gamma: 0.5,    // 핵심 두려움 일치
  delta: 1.0,    // 모티프 겹침
  epsilon: 0.3,  // 감각 양식 일치
});

/**
 * 두 감정 벡터 cosine. 키 합집합 기반.
 * @param {Object<string, number>} a
 * @param {Object<string, number>} b
 * @returns {number} 0~1
 */
export function emotionCosine(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, normA = 0, normB = 0;
  for (const k of keys) {
    const va = Number(a[k]) || 0;
    const vb = Number(b[k]) || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 모티프 단어 vs 모티프 태그 substring 매칭. agglutinative 한국어 정합.
 * archive.js 의 _motifBonus 와 동일 substring 룰.
 * @returns {number} 0~1 (hit / |tags|)
 */
export function motifOverlap(seekerWords, targetTags) {
  if (!Array.isArray(seekerWords) || seekerWords.length === 0) return 0;
  if (!Array.isArray(targetTags) || targetTags.length === 0) return 0;
  const wordsLower = seekerWords.map(w => String(w).toLowerCase());
  let hits = 0;
  for (const tag of targetTags) {
    const tagLower = String(tag).toLowerCase();
    if (!tagLower) continue;
    const hit = wordsLower.some(w => w && (w.includes(tagLower) || tagLower.includes(w)));
    if (hit) hits++;
  }
  return hits / targetTags.length;
}

/**
 * 카테고리 슬롯 일치 보너스. unknown / none / null 은 정보 없음 → 0.
 */
function categoricalMatch(a, b) {
  if (!a || !b) return 0;
  if (a === 'unknown' || b === 'unknown') return 0;
  if (a === 'none' || b === 'none') return 0;
  return a === b ? 1 : 0;
}

/**
 * SeekerCard vs TargetCard 점수.
 * @param {SeekerCard} seeker
 * @param {TargetCard} target
 * @param {typeof DEFAULT_WEIGHTS} [weights]
 * @returns {{ score: number, breakdown: { emotion: number, attribution: number, coreFear: number, motif: number, modality: number } }}
 */
export function scoreCard(seeker, target, weights = DEFAULT_WEIGHTS) {
  if (!seeker || !target) {
    return { score: 0, breakdown: { emotion: 0, attribution: 0, coreFear: 0, motif: 0, modality: 0 } };
  }
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const emotion = emotionCosine(seeker.emotion_vec, target.emotion_vec);
  const attribution = categoricalMatch(seeker.attribution, target.attribution);
  const coreFear = categoricalMatch(seeker.core_fear, target.core_fear);
  const motif = motifOverlap(seeker.motif_words, target.motif_tags);
  const modality = categoricalMatch(seeker.modality, target.modality);
  const score =
    w.alpha * emotion +
    w.beta * attribution +
    w.gamma * coreFear +
    w.delta * motif +
    w.epsilon * modality;
  return { score, breakdown: { emotion, attribution, coreFear, motif, modality } };
}

function _rankBy(items, toCard, seeker, weights) {
  const scored = items.map(item => ({
    item,
    ...scoreCard(seeker, toCard(item), weights),
  })).sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score === 0) return null;
  const runnerUp = scored[1] ? scored[1].score : 0;
  return { top, runnerUpDelta: top.score - runnerUp, all: scored };
}

/**
 * 메모리 풀에서 1등 + 1등/2등 점수 차.
 * runnerUpDelta = V2-4 drift/speciation 임계 판정 입력.
 */
export function pickTopMemory(seeker, memories, weights = DEFAULT_WEIGHTS) {
  if (!Array.isArray(memories) || memories.length === 0) return null;
  const r = _rankBy(memories, memoryToCard, seeker, weights);
  if (!r) return null;
  return {
    memory: r.top.item,
    score: r.top.score,
    breakdown: r.top.breakdown,
    runnerUpDelta: r.runnerUpDelta,
  };
}

/**
 * 유령 변주 풀에서 1등 + runnerUpDelta.
 * V2.1 §15-1: 변주 1등 = 그 회차의 유령 발화/자세 시드.
 * runnerUpDelta 가 작으면 drift (애매한 매칭, 같은 유령), 크면 speciation 후보.
 */
export function pickGhostVariant(seeker, ghostVariants, weights = DEFAULT_WEIGHTS) {
  if (!Array.isArray(ghostVariants) || ghostVariants.length === 0) return null;
  const r = _rankBy(ghostVariants, ghostVariantToCard, seeker, weights);
  if (!r) return null;
  return {
    variant: r.top.item,
    score: r.top.score,
    breakdown: r.top.breakdown,
    runnerUpDelta: r.runnerUpDelta,
  };
}

/**
 * 기존 memory row → TargetCard 어댑터.
 * 점진 도입: attribution / core_fear / modality / role 슬롯 없으면 null.
 */
export function memoryToCard(memory) {
  if (!memory) return { emotion_vec: {}, motif_tags: [], attribution: null, core_fear: null, modality: null, role: null };
  const emotion_vec =
    (memory.original_vector && typeof memory.original_vector === 'object' && memory.original_vector)
    || (memory.emotion_vec && typeof memory.emotion_vec === 'object' && memory.emotion_vec)
    || _avgFromScenes(memory.scenes)
    || {};
  return {
    emotion_vec,
    attribution: memory.attribution || null,
    core_fear: memory.core_fear || null,
    modality: memory.modality || null,
    role: memory.role || null,
    motif_tags: _collectMotifTags(memory),
  };
}

/**
 * ghost_variants row → TargetCard 어댑터.
 * V2-1 신설 테이블 컬럼 가정: emotion_vec, attribution, core_fear, modality, role, motif_tags.
 */
export function ghostVariantToCard(variant) {
  if (!variant) return { emotion_vec: {}, motif_tags: [], attribution: null, core_fear: null, modality: null, role: null };
  return {
    emotion_vec: (variant.emotion_vec && typeof variant.emotion_vec === 'object') ? variant.emotion_vec : {},
    attribution: variant.attribution || null,
    core_fear: variant.core_fear || null,
    modality: variant.modality || null,
    role: variant.role || null,
    motif_tags: Array.isArray(variant.motif_tags) ? variant.motif_tags : [],
  };
}

function _avgFromScenes(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  const avg = {};
  let count = 0;
  for (const s of scenes) {
    let emo = s.original_emotion || s.originalVector;
    if (!emo) continue;
    if (typeof emo === 'string') {
      try { emo = JSON.parse(emo); } catch (_) { continue; }
    }
    if (typeof emo !== 'object') continue;
    count++;
    for (const [k, v] of Object.entries(emo)) {
      avg[k] = (avg[k] || 0) + (Number(v) || 0);
    }
  }
  if (count === 0) return null;
  for (const k in avg) avg[k] /= count;
  return avg;
}

function _collectMotifTags(memory) {
  const tags = new Set();
  const memMotifs = memory.motif_tags || (memory.meta && memory.meta.motif_tags);
  if (Array.isArray(memMotifs)) memMotifs.forEach(t => tags.add(String(t).toLowerCase()));
  if (Array.isArray(memory.scenes)) {
    for (const s of memory.scenes) {
      const sm = (s.meta && s.meta.motif_tags) || s.motif_tags;
      if (Array.isArray(sm)) sm.forEach(t => tags.add(String(t).toLowerCase()));
    }
  }
  return Array.from(tags);
}

// 브라우저 콘솔 / 페이지에서 직접 접근용 self-attach.
if (typeof window !== 'undefined') {
  window.SeekerMatchEngine = {
    DEFAULT_WEIGHTS,
    emotionCosine,
    motifOverlap,
    scoreCard,
    pickTopMemory,
    pickGhostVariant,
    memoryToCard,
    ghostVariantToCard,
  };
}
