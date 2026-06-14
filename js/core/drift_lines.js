// js/core/drift_lines.js
//
// 전이(轉移) 브레인 — 물든 유령의 "바뀐 대사"를 고른다 (순수 로직).
// docs/통합빌드계획_전이+지형quilt_병렬세션-260614.md §1-1·1-4 / §S1·T1.
//
// 두 결정을 한 손으로 처리한다:
//   A (구멍 1) = "그 사람 입력을 닮게". 강도만 보지 않고, 실제 사람이 한 말(drift.input)에서
//                 짧은 한 조각을 떼어 메아리/말줄임으로 감싼다.
//   나 (구멍 2) = "재대화마다 더 오래된 층". layerIndex 가 커질수록 layers(나이순 내림차순)의
//                 더 뒤쪽(=더 오래된) utterance 를 고른다.
//
// 이 모듈은 *판단/렌더/DB/네트워크/LLM 을 하지 않는다.* layers 의 fetch·정렬은 호출자(T3/W) 책임.
// T1 은 받은 재료에서 *선택만* 한다. "사람 말로 빚기" 도 단순·결정론 (입력 다듬어 핵심 조각 +
// 메아리/말줄임). 톤은 DRIFT_LINE_TONE 한 군데로 모아 나중 튜닝 가능하게 둔다.
//
// 계약 (docs §1-4):
//   pickDriftedLine({ scene, drift, layers, mode, layerIndex }) -> string | null
//     mode 'murmur'   : drift.input 으로 빚은 짧은 한 조각 (항상 층 0 = 현재 사람). input 비면 null.
//     mode 'redialog' : layerIndex 0 = drift.input 빚은 줄 (현재 사람 = 최신 층)
//                       layerIndex k>=1 = layers[k-1].utterance (k 커질수록 더 오래된 층)
//                       k-1 이 layers 길이 이상이면 null (원본 복귀).

// ─── 톤 (한 군데로 모음 — 나중 튜닝 자리) ────────────────────────────
// 혼잣말/빚은 줄의 길이·감싸기를 여기서만 조절한다. 본문 로직은 안 건드리고 톤만 바꾼다.
export const DRIFT_LINE_TONE = Object.freeze({
  MURMUR_MAX_CHARS: 12,     // 혼잣말 조각의 핵심 글자 수 상한 (말줄임 제외)
  REDIALOG_MAX_CHARS: 18,   // 재대화 첫 줄(현재 사람 층)의 핵심 글자 수 상한
  ELLIPSIS: '…',            // 말줄임 기호
  MURMUR_PREFIX: '',        // 혼잣말 앞 감쌈 (지금은 없음 — 조각 + 말줄임만)
  MURMUR_SUFFIX: '…',       // 혼잣말 뒤 메아리 꼬리
});

// ─── 헬퍼 ────────────────────────────────────────────────────────

/** 문자열인가 + 공백 제거 후 비지 않았나. */
function _hasText(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * 사람 말에서 핵심 조각을 단순·결정론으로 뽑는다 (LLM·네트워크 X).
 *   1) 양끝 공백 제거 + 안쪽 공백 1칸으로 정규화
 *   2) 끝의 문장부호/말줄임 제거 (우리가 다시 붙임)
 *   3) maxChars 넘으면 글자 단위로 자른다 (한국어는 어절 경계가 불규칙 → 글자 컷이 안전)
 *
 * @returns {string} 다듬어진 핵심 조각 (빈 입력이면 '')
 */
function _coreFragment(input, maxChars) {
  if (!_hasText(input)) return '';
  let s = input.trim().replace(/\s+/g, ' ');
  // 끝의 마침/물음/느낌/말줄임/점 제거 — 톤 꼬리를 우리가 붙이므로 중복 방지.
  s = s.replace(/[.。!?！？……]+$/u, '').trim();
  if (s.length === 0) return '';
  const max = (typeof maxChars === 'number' && maxChars > 0) ? maxChars : DRIFT_LINE_TONE.MURMUR_MAX_CHARS;
  if (s.length > max) {
    s = s.slice(0, max).trim();
  }
  return s;
}

/**
 * 혼잣말(murmur) — 사람 말 조각을 메아리/말줄임으로 감싼다.
 * 결정 A: 강도가 아니라 *그 사람이 한 말* 을 닮게.
 */
function _shapeMurmur(input) {
  const core = _coreFragment(input, DRIFT_LINE_TONE.MURMUR_MAX_CHARS);
  if (!core) return null;
  return DRIFT_LINE_TONE.MURMUR_PREFIX + core + DRIFT_LINE_TONE.MURMUR_SUFFIX;
}

/**
 * 재대화 첫 줄 중 "현재 사람 층(layerIndex 0)" — 사람 말 조각 + 말줄임.
 * murmur 보다 살짝 길게(REDIALOG_MAX_CHARS) 둬서 "변형된 대사"임이 읽히게.
 */
function _shapeRedialogSelf(input) {
  const core = _coreFragment(input, DRIFT_LINE_TONE.REDIALOG_MAX_CHARS);
  if (!core) return null;
  return core + DRIFT_LINE_TONE.ELLIPSIS;
}

// ─── 메인 ────────────────────────────────────────────────────────

/**
 * 물든 유령의 바뀐 대사 한 줄을 고른다.
 *
 * @param {Object} opts
 * @param {Object}  [opts.scene]       - 그 장면(현재 미사용 — 향후 톤 분기 자리. 받기만 함).
 * @param {Object}  opts.drift         - QuiltDemoState.getGhostDrift(sceneId) 결과 { strength, input, firedAt }.
 * @param {Array}   [opts.layers]      - 그 유령 ghost_variants 를 created_at 내림차순(최신→오래된) 정렬한 배열.
 *                                        각 원소는 { utterance, created_at, ... }. fetch·정렬은 호출자 책임.
 * @param {String}  opts.mode          - 'murmur' | 'redialog'.
 * @param {Number}  [opts.layerIndex]  - redialog 전용. 유령별 재대화 횟수(retalkCount). 기본 0.
 * @returns {String|null} 박을 한 줄, 또는 null(원본 복귀/빚을 재료 없음).
 */
export function pickDriftedLine(opts) {
  const o = opts || {};
  const drift = (o.drift && typeof o.drift === 'object') ? o.drift : null;
  const mode = o.mode;

  // murmur — 항상 층 0(현재 사람). 사람 말로 빚은 짧은 조각.
  if (mode === 'murmur') {
    if (!drift) return null;
    return _shapeMurmur(drift.input);
  }

  // redialog — layerIndex 로 층 선택.
  if (mode === 'redialog') {
    const k = Number.isFinite(o.layerIndex) ? Math.max(0, Math.floor(o.layerIndex)) : 0;

    // 층 0 = 현재 사람 = 최신 층. drift.input 으로 빚은 줄.
    if (k === 0) {
      if (!drift) return null;
      return _shapeRedialogSelf(drift.input);
    }

    // 층 k>=1 = layers[k-1].utterance. layers 는 나이순 내림차순이라 k 커질수록 더 오래된 층.
    const layers = Array.isArray(o.layers) ? o.layers : [];
    const idx = k - 1;
    if (idx >= layers.length) return null;   // 범위 초과 → 원본 복귀
    const row = layers[idx];
    const utter = row && typeof row.utterance === 'string' ? row.utterance.trim() : '';
    return _hasText(utter) ? utter : null;
  }

  // 알 수 없는 mode → 안전하게 null.
  return null;
}

// ─── export (브라우저 전역 + 테스트 ES module 양쪽) ──────────────────
// 테스트(이 레포 방식)는 `import { pickDriftedLine } from '.../drift_lines.js'`.
// 브라우저/wiring 코드는 window.DriftLines 로 직접 접근.
if (typeof window !== 'undefined') {
  window.DriftLines = { pickDriftedLine, DRIFT_LINE_TONE };
}
