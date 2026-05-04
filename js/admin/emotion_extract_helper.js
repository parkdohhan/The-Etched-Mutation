/**
 * V2.1 W2S3: admin 변주 풀 도구의 자동 추출 + 메타데이터 가산점 룰
 *
 * 작가 결정 (2026-05-04):
 *   - 작가는 12축 좌표 직접 입력 X. 발화 텍스트 + 메타데이터만 박음.
 *   - 시스템이 emotion_extract 호출 → 12축 받음 → 메타데이터 가산점 룰 적용.
 *   - 결과는 읽기 전용 (작가가 막대그래프로 검수만 함).
 *   - 결과 마음에 안 들면 → utterance 또는 메타데이터 손대고 재추출.
 *
 * 메타데이터 가산점 룰 (default — V2-12 튜닝 자리):
 *   - attribution=self_blame   → guilt +0.3, shame +0.2
 *   - attribution=other_blame  → anger +0.3, isolation +0.2
 *   - attribution=fate_blame   → numbness +0.3, emptiness +0.2
 *   - core_fear=abandonment    → fear +0.4, isolation +0.4
 *   - core_fear=death          → fear +0.4, sadness +0.3
 *   - core_fear=rejection      → shame +0.3, sadness +0.3
 *   - core_fear=failure        → guilt +0.3, shame +0.3
 *   - 가산 후 [0, 1] clamp
 *
 * 결정론 자리:
 *   - emotion_extract 자체가 temperature: 0 (claude-scene/index.ts:552)
 *   - 메타데이터 가산점 = 결정론 룰 (LLM 호출 X)
 *   - extractor_version 컬럼에 prompt_version 박아서 일관성 추적
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';

const EMOTION_KEYS = [
  'fear', 'sadness', 'anger', 'joy', 'longing', 'guilt',
  'shame', 'numbness', 'isolation', 'relief', 'confusion', 'emptiness',
];

// ─────────────────────────────────
// 메타데이터 가산점 룰
// ─────────────────────────────────

const ATTRIBUTION_BOOST = {
  self_blame:  { guilt: 0.3, shame: 0.2 },
  other_blame: { anger: 0.3, isolation: 0.2 },
  fate_blame:  { numbness: 0.3, emptiness: 0.2 },
};

const CORE_FEAR_BOOST = {
  abandonment: { fear: 0.4, isolation: 0.4 },
  death:       { fear: 0.4, sadness: 0.3 },
  rejection:   { shame: 0.3, sadness: 0.3 },
  failure:     { guilt: 0.3, shame: 0.3 },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * 추출된 12축 vec 에 메타데이터 가산점 적용. 입력 mutate 안 함.
 * @param {Object} vec - 추출 결과 12축 (각 0~1)
 * @param {Object} metadata - { attribution, core_fear }
 * @returns {Object} 보정된 12축 (clamp 0~1)
 */
export function applyMetadataBoost(vec, metadata) {
  const result = {};
  for (const k of EMOTION_KEYS) {
    result[k] = Number(vec[k]) || 0;
  }

  const attBoost = (metadata && ATTRIBUTION_BOOST[metadata.attribution]) || {};
  for (const [k, boost] of Object.entries(attBoost)) {
    result[k] = clamp01(result[k] + boost);
  }

  const fearBoost = (metadata && CORE_FEAR_BOOST[metadata.core_fear]) || {};
  for (const [k, boost] of Object.entries(fearBoost)) {
    result[k] = clamp01(result[k] + boost);
  }

  return result;
}

// ─────────────────────────────────
// emotion_extract 호출 + 보정
// ─────────────────────────────────

/**
 * utterance + 메타데이터 → 12축 emotion_vec + extractor_version.
 *
 * @param {string} utterance - 변주 발화 본문
 * @param {Object} metadata - { attribution, core_fear } (가산점용)
 * @returns {Promise<{ emotion_vec: Object, extractor_version: string, raw_extracted: Object }>}
 */
export async function extractEmotionVec(utterance, metadata) {
  if (!utterance || !utterance.trim()) {
    throw new Error('utterance 가 비어있습니다.');
  }

  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error('Supabase client unavailable.');
  }

  const { data, error } = await sb.functions.invoke('claude-scene', {
    body: {
      type: 'emotion_extract',
      user_text: utterance,
      scene_text: '',
    },
  });
  if (error) throw error;

  const raw_extracted = (data && data.base) || {};
  const emotion_vec = applyMetadataBoost(raw_extracted, metadata || {});
  const extractor_version = (data && data.prompt_version) || '(unknown)';

  return { emotion_vec, extractor_version, raw_extracted };
}

// 디버깅·테스트용 export
export { EMOTION_KEYS, ATTRIBUTION_BOOST, CORE_FEAR_BOOST };
