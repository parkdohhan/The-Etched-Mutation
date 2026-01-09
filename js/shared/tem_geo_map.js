// TEM v1.0 Geological Map (World Constant)
// 이 값은 절대 변경하지 않는다

export const TEM_ANCHOR_VAD = {
  // 부정/고통 (10개)
  fear:         { v: -0.9, a:  0.9, d: -0.8 },
  sadness:      { v: -0.8, a: -0.4, d: -0.7 },
  anger:        { v: -0.7, a:  0.8, d:  0.3 },
  guilt:        { v: -0.8, a:  0.2, d: -0.6 },
  shame:        { v: -0.9, a: -0.2, d: -0.9 },
  isolation:    { v: -0.7, a: -0.5, d: -0.6 },
  numbness:     { v: -0.6, a: -0.8, d: -0.4 },
  moral_pain:   { v: -0.8, a:  0.3, d: -0.7 },
  helplessness: { v: -0.9, a: -0.4, d: -1.0 },
  despair:      { v: -1.0, a: -0.6, d: -0.9 },
  
  // 긍정/회복 (7개)
  joy:          { v:  0.9, a:  0.6, d:  0.5 },
  hope:         { v:  0.7, a:  0.4, d:  0.6 },
  relief:       { v:  0.6, a: -0.3, d:  0.4 },
  gratitude:    { v:  0.8, a: -0.2, d:  0.7 },
  love:         { v:  1.0, a:  0.5, d:  0.6 },
  peace:        { v:  0.8, a: -0.6, d:  0.7 },
  comfort:      { v:  0.7, a: -0.4, d:  0.6 },
};

// 확장 오버레이 (선택)
export const TEM_ANCHOR_VAD_EXTENDED = {
  longing:      { v: -0.3, a:  0.2, d: -0.2 },
  nostalgia:    { v:  0.1, a: -0.3, d: -0.1 },
  acceptance:   { v:  0.4, a: -0.4, d:  0.5 },
  confusion:    { v: -0.4, a:  0.3, d: -0.5 },
};

// 안전장치: VAD는 시각화 전용
export const TEM_VAD_IS_VISUAL_ONLY = true;

// 콘솔 로그
console.log('=== TEM Geo Map Loaded ===');
console.log('Anchors:', Object.keys(TEM_ANCHOR_VAD).length);
console.log('Extended Anchors:', Object.keys(TEM_ANCHOR_VAD_EXTENDED).length);
console.log('VAD is visual only:', TEM_VAD_IS_VISUAL_ONLY);

