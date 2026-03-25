// js/shared/tem_af_map.js
// Attribution × Core Fear 투영 (시각화 전용 — 정렬도/분기에 사용 금지)

export const ATTRIBUTION_ANCHORS = {
  self_blame: { x: -1.0 },
  other_blame: { x: 0.0 },
  fate_blame: { x: 1.0 },
};

export const CORE_FEAR_ANCHORS = {
  abandonment: { z: -1.0 },
  rejection: { z: -0.33 },
  powerlessness: { z: 0.33 },
  loss: { z: 1.0 },
};

export const EMOTION_TO_ATTRIBUTION_WEIGHTS = {
  fear: { self_blame: 0.2, other_blame: 0.1, fate_blame: 0.7 },
  sadness: { self_blame: 0.3, other_blame: 0.1, fate_blame: 0.6 },
  anger: { self_blame: 0.1, other_blame: 0.7, fate_blame: 0.2 },
  guilt: { self_blame: 0.8, other_blame: 0.05, fate_blame: 0.15 },
  shame: { self_blame: 0.75, other_blame: 0.15, fate_blame: 0.1 },
  joy: { self_blame: 0.3, other_blame: 0.3, fate_blame: 0.4 },
  numbness: { self_blame: 0.15, other_blame: 0.05, fate_blame: 0.8 },
  isolation: { self_blame: 0.3, other_blame: 0.3, fate_blame: 0.4 },
  longing: { self_blame: 0.2, other_blame: 0.2, fate_blame: 0.6 },
  resentment: { self_blame: 0.1, other_blame: 0.8, fate_blame: 0.1 },
  resignation: { self_blame: 0.1, other_blame: 0.05, fate_blame: 0.85 },
  contempt: { self_blame: 0.05, other_blame: 0.85, fate_blame: 0.1 },
  anxiety: { self_blame: 0.4, other_blame: 0.15, fate_blame: 0.45 },
  disgust: { self_blame: 0.15, other_blame: 0.65, fate_blame: 0.2 },
  surprise: { self_blame: 0.2, other_blame: 0.2, fate_blame: 0.6 },
  trust: { self_blame: 0.2, other_blame: 0.4, fate_blame: 0.4 },
  anticipation: { self_blame: 0.3, other_blame: 0.2, fate_blame: 0.5 },
};

export const EMOTION_TO_FEAR_WEIGHTS = {
  fear: { abandonment: 0.15, rejection: 0.1, powerlessness: 0.55, loss: 0.2 },
  sadness: { abandonment: 0.3, rejection: 0.1, powerlessness: 0.1, loss: 0.5 },
  anger: { abandonment: 0.1, rejection: 0.3, powerlessness: 0.5, loss: 0.1 },
  guilt: { abandonment: 0.2, rejection: 0.25, powerlessness: 0.15, loss: 0.4 },
  shame: { abandonment: 0.15, rejection: 0.6, powerlessness: 0.1, loss: 0.15 },
  joy: { abandonment: 0.15, rejection: 0.15, powerlessness: 0.15, loss: 0.55 },
  numbness: { abandonment: 0.3, rejection: 0.1, powerlessness: 0.4, loss: 0.2 },
  isolation: { abandonment: 0.6, rejection: 0.25, powerlessness: 0.1, loss: 0.05 },
  longing: { abandonment: 0.55, rejection: 0.15, powerlessness: 0.05, loss: 0.25 },
  resentment: { abandonment: 0.15, rejection: 0.35, powerlessness: 0.4, loss: 0.1 },
  resignation: { abandonment: 0.2, rejection: 0.05, powerlessness: 0.6, loss: 0.15 },
  contempt: { abandonment: 0.05, rejection: 0.5, powerlessness: 0.35, loss: 0.1 },
  anxiety: { abandonment: 0.25, rejection: 0.2, powerlessness: 0.35, loss: 0.2 },
  disgust: { abandonment: 0.1, rejection: 0.55, powerlessness: 0.2, loss: 0.15 },
  surprise: { abandonment: 0.2, rejection: 0.2, powerlessness: 0.3, loss: 0.3 },
  trust: { abandonment: 0.4, rejection: 0.3, powerlessness: 0.1, loss: 0.2 },
  anticipation: { abandonment: 0.15, rejection: 0.15, powerlessness: 0.2, loss: 0.5 },
};

const ATTR_KEYS = ['self_blame', 'other_blame', 'fate_blame'];
const FEAR_KEYS = ['abandonment', 'rejection', 'powerlessness', 'loss'];

function oneHotAttribution(str) {
  if (!str || typeof str !== 'string') return null;
  const k = str.replace(/-/g, '_');
  const o = { self_blame: 0, other_blame: 0, fate_blame: 0 };
  if (k === 'self_blame' || k === 'internal') o.self_blame = 1;
  else if (k === 'other_blame' || k === 'external' || k === 'external_threat' || k === 'betrayal') o.other_blame = 1;
  else if (k === 'fate_blame' || k === 'helpless_situation' || k === 'circumstance' || k === 'fate' || k === 'helpless' || k === 'unknown') o.fate_blame = 1;
  else return null;
  return o;
}

const CORE_FEAR_ALIASES = {
  abandonment: 'abandonment',
  loss: 'loss',
  separation: 'abandonment',
  death_of_loved: 'loss',
  inadequacy: 'rejection',
  failure: 'rejection',
  shame_cf: 'rejection',
  not_enough: 'rejection',
  helplessness: 'powerlessness',
  loss_of_control: 'powerlessness',
  entrapment: 'powerlessness',
  vulnerability: 'powerlessness',
  punishment: 'rejection',
  judgment: 'rejection',
  exposure: 'rejection',
};

function oneHotCoreFear(str) {
  if (!str || typeof str !== 'string') return null;
  const k = CORE_FEAR_ALIASES[str.replace(/-/g, '_')] || str.replace(/-/g, '_');
  const o = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 };
  if (FEAR_KEYS.includes(k)) {
    o[k] = 1;
    return o;
  }
  return null;
}

function normalizeAttributionInput(val) {
  if (!val) return null;
  if (typeof val === 'object' && ATTR_KEYS.some((key) => typeof val[key] === 'number')) return val;
  return oneHotAttribution(val);
}

function normalizeCoreFearInput(val) {
  if (!val) return null;
  if (typeof val === 'object' && FEAR_KEYS.some((key) => typeof val[key] === 'number')) return val;
  return oneHotCoreFear(val);
}

export function projectAttributionToX(attrDist) {
  if (!attrDist || typeof attrDist !== 'object') return 0;
  let x = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(attrDist)) {
    const anchor = ATTRIBUTION_ANCHORS[key];
    if (anchor && typeof weight === 'number' && !Number.isNaN(weight) && weight > 0) {
      x += weight * anchor.x;
      totalWeight += weight;
    }
  }
  if (totalWeight <= 0) return 0;
  return Math.max(-1, Math.min(1, x / totalWeight));
}

export function projectCoreFearToZ(fearDist) {
  if (!fearDist || typeof fearDist !== 'object') return 0;
  let z = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(fearDist)) {
    const anchor = CORE_FEAR_ANCHORS[key];
    if (anchor && typeof weight === 'number' && !Number.isNaN(weight) && weight > 0) {
      z += weight * anchor.z;
      totalWeight += weight;
    }
  }
  if (totalWeight <= 0) return 0;
  return Math.max(-1, Math.min(1, z / totalWeight));
}

export function projectToAF(attrDist, fearDist) {
  return {
    x: projectAttributionToX(attrDist),
    z: projectCoreFearToZ(fearDist),
  };
}

export function afToTerrainXZ(af, mapScale = 50) {
  return {
    x: af.x * mapScale,
    z: af.z * mapScale,
  };
}

export function estimateAttributionFromEmotion(emotionVector) {
  if (!emotionVector || typeof emotionVector !== 'object') {
    return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
  }
  const result = { self_blame: 0, other_blame: 0, fate_blame: 0 };
  let totalWeight = 0;
  for (const [emotion, intensity] of Object.entries(emotionVector)) {
    const mapping = EMOTION_TO_ATTRIBUTION_WEIGHTS[emotion];
    if (!mapping || typeof intensity !== 'number' || intensity <= 0) continue;
    result.self_blame += intensity * mapping.self_blame;
    result.other_blame += intensity * mapping.other_blame;
    result.fate_blame += intensity * mapping.fate_blame;
    totalWeight += intensity;
  }
  if (totalWeight <= 0) {
    return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
  }
  result.self_blame /= totalWeight;
  result.other_blame /= totalWeight;
  result.fate_blame /= totalWeight;
  return result;
}

export function estimateCoreFearFromEmotion(emotionVector) {
  if (!emotionVector || typeof emotionVector !== 'object') {
    return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
  }
  const result = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 };
  let totalWeight = 0;
  for (const [emotion, intensity] of Object.entries(emotionVector)) {
    const mapping = EMOTION_TO_FEAR_WEIGHTS[emotion];
    if (!mapping || typeof intensity !== 'number' || intensity <= 0) continue;
    result.abandonment += intensity * mapping.abandonment;
    result.rejection += intensity * mapping.rejection;
    result.powerlessness += intensity * mapping.powerlessness;
    result.loss += intensity * mapping.loss;
    totalWeight += intensity;
  }
  if (totalWeight <= 0) {
    return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
  }
  result.abandonment /= totalWeight;
  result.rejection /= totalWeight;
  result.powerlessness /= totalWeight;
  result.loss /= totalWeight;
  return result;
}

export function estimateAFFromEmotion(emotionVector) {
  const attrDist = estimateAttributionFromEmotion(emotionVector);
  const fearDist = estimateCoreFearFromEmotion(emotionVector);
  const af = projectToAF(attrDist, fearDist);
  return {
    x: af.x,
    z: af.z,
    estimated: true,
    attribution: attrDist,
    core_fear: fearDist,
  };
}

/**
 * @param {Object} userVector - { base?: object, reason_analysis?: object }
 * @param {number} mapScale
 */
export function projectToAFCoordinate(userVector, mapScale = 50) {
  const reasonAnalysis = userVector?.reason_analysis;
  const emotionVector = userVector?.base;

  const attrFromReason = normalizeAttributionInput(reasonAnalysis?.attribution);
  const fearFromReason = normalizeCoreFearInput(reasonAnalysis?.core_fear);

  let attrDist = attrFromReason;
  let fearDist = fearFromReason;
  if (emotionVector) {
    if (!attrDist) attrDist = estimateAttributionFromEmotion(emotionVector);
    if (!fearDist) fearDist = estimateCoreFearFromEmotion(emotionVector);
  }
  if (!attrDist) attrDist = { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
  if (!fearDist) fearDist = { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };

  const estimated = !(attrFromReason && fearFromReason);

  const af = projectToAF(attrDist, fearDist);
  const terrainPos = afToTerrainXZ(af, mapScale);

  return {
    x: af.x,
    z: af.z,
    terrain_pos: terrainPos,
    estimated,
    attribution: attrDist,
    core_fear: fearDist,
  };
}

export const EMOTION_COLORS = {
  fear: { r: 0.4, g: 0.28, b: 0.7 },
  sadness: { r: 0.25, g: 0.38, b: 0.65 },
  anger: { r: 0.8, g: 0.25, b: 0.22 },
  guilt: { r: 0.6, g: 0.48, b: 0.35 },
  shame: { r: 0.58, g: 0.35, b: 0.48 },
  joy: { r: 0.82, g: 0.72, b: 0.38 },
  numbness: { r: 0.32, g: 0.32, b: 0.38 },
  isolation: { r: 0.14, g: 0.14, b: 0.24 },
  longing: { r: 0.28, g: 0.62, b: 0.65 },
  resentment: { r: 0.6, g: 0.2, b: 0.15 },
  resignation: { r: 0.4, g: 0.38, b: 0.35 },
  contempt: { r: 0.5, g: 0.3, b: 0.2 },
  anxiety: { r: 0.55, g: 0.4, b: 0.55 },
  disgust: { r: 0.35, g: 0.45, b: 0.25 },
  surprise: { r: 0.7, g: 0.65, b: 0.5 },
  trust: { r: 0.45, g: 0.58, b: 0.52 },
  anticipation: { r: 0.65, g: 0.55, b: 0.35 },
};
