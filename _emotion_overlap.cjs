// 정전 감정 목록(tem_geo_map.js: TEM_ANCHOR_VAD + EXTENDED, 21개)이
// VAD 공간에서 서로 얼마나 겹치는지(축 독립성) 측정.
// 별이엔진의 calculateVADSimilarity와 동일하게 3D 유클리드 거리 사용.
'use strict';

const A = {
  fear:        [-0.9, 0.9, -0.8],
  sadness:     [-0.8, -0.4, -0.7],
  anger:       [-0.7, 0.8, 0.3],
  guilt:       [-0.8, 0.2, -0.6],
  shame:       [-0.9, -0.2, -0.9],
  isolation:   [-0.7, -0.5, -0.6],
  numbness:    [-0.6, -0.8, -0.4],
  moral_pain:  [-0.8, 0.3, -0.7],
  helplessness:[-0.9, -0.4, -1.0],
  despair:     [-1.0, -0.6, -0.9],
  joy:         [0.9, 0.6, 0.5],
  hope:        [0.7, 0.4, 0.6],
  relief:      [0.6, -0.3, 0.4],
  gratitude:   [0.8, -0.2, 0.7],
  love:        [1.0, 0.5, 0.6],
  peace:       [0.8, -0.6, 0.7],
  comfort:     [0.7, -0.4, 0.6],
  longing:     [-0.3, 0.2, -0.2],
  nostalgia:   [0.1, -0.3, -0.1],
  acceptance:  [0.4, -0.4, 0.5],
  confusion:   [-0.4, 0.3, -0.5],
};
const KO = {
  fear:'공포', sadness:'슬픔', anger:'분노', guilt:'죄책감', shame:'수치심',
  isolation:'고립', numbness:'무감각', moral_pain:'도덕적고통', helplessness:'무력감', despair:'절망',
  joy:'기쁨', hope:'희망', relief:'안도', gratitude:'감사', love:'사랑', peace:'평화', comfort:'위로',
  longing:'그리움', nostalgia:'향수', acceptance:'수용', confusion:'혼란',
};
const EXT = new Set(['longing','nostalgia','acceptance','confusion']); // 확장(선택) 표시용

const names = Object.keys(A);
const MAX = Math.sqrt(12); // 별이엔진 maxDist
function dist(p, q){ const dv=p[0]-q[0], da=p[1]-q[1], dd=p[2]-q[2]; return Math.sqrt(dv*dv+da*da+dd*dd); }
function sim(d){ // 별이엔진 calculateVADSimilarity 근사(지수감쇠 k=3)
  const n = Math.min(1, d/MAX); return Math.exp(-3*n);
}
function lbl(k){ return KO[k] + (EXT.has(k)?'*':''); }

// 모든 쌍
const pairs = [];
for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  const d = dist(A[names[i]], A[names[j]]);
  pairs.push({a:names[i], b:names[j], d});
}
pairs.sort((x,y)=>x.d-y.d);

// 각 감정의 최근접 이웃
const nn = {};
for(const n of names){
  let best=null, bd=Infinity;
  for(const m of names){ if(m===n)continue; const d=dist(A[n],A[m]); if(d<bd){bd=d;best=m;} }
  nn[n]={m:best, d:bd};
}

console.log('=== 정전 감정 21개 VAD 겹침 분석 (거리 작을수록 축이 겹침) ===');
console.log('maxDist=sqrt(12)=%s, (*)=확장 감정\n', MAX.toFixed(3));

console.log('--- 가장 겹치는 쌍 TOP 15 (거리 / 별이엔진 유사도) ---');
pairs.slice(0,15).forEach((p,i)=>{
  console.log('%s%s ↔ %s   dist=%s   sim=%s%',
    String(i+1).padStart(2), '. '+lbl(p.a).padEnd(7), lbl(p.b).padEnd(7),
    p.d.toFixed(3), (sim(p.d)*100).toFixed(0));
});

console.log('\n--- 각 감정의 "가장 가까운 이웃" (이 거리가 작으면 그 감정은 독립축이 약함) ---');
const nnSorted = names.slice().sort((x,y)=>nn[x].d-nn[y].d);
nnSorted.forEach(n=>{
  console.log('  %s → %s   (dist=%s, sim=%s%)',
    lbl(n).padEnd(8), lbl(nn[n].m).padEnd(8), nn[n].d.toFixed(3), (sim(nn[n].d)*100).toFixed(0));
});

// 통계
const nnDists = names.map(n=>nn[n].d);
const mean = nnDists.reduce((a,b)=>a+b,0)/nnDists.length;
const overlapHi = pairs.filter(p=>p.d<0.5).length;  // 거의 같은 축
const overlapMid = pairs.filter(p=>p.d>=0.5&&p.d<0.8).length;
console.log('\n--- 통계 ---');
console.log('평균 최근접 거리: %s', mean.toFixed(3));
console.log('거리<0.5 (거의 같은 축, 심각 겹침) 쌍 수: %s', overlapHi);
console.log('거리 0.5~0.8 (가까움) 쌍 수: %s', overlapMid);
console.log('전체 쌍 수: %s', pairs.length);
