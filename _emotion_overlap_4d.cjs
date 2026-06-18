// 3차원(VAD) vs 4차원(VAD + novelty) 겹침 비교.
// novelty(새로움/갑작스러움) 값은 appraisal theory 기반 추정값 (측정 데이터 아님).
// 질문: 4번째 축을 더하면 3D에서 겹쳤던 감정 쌍이 갈라지는가?
'use strict';

// [v, a, d, novelty]  — v,a,d는 tem_geo_map 실측 정의, novelty는 이론 기반 추정
const A = {
  fear:        [-0.9, 0.9, -0.8, 0.85],
  sadness:     [-0.8, -0.4, -0.7, 0.15],
  anger:       [-0.7, 0.8, 0.3, 0.50],
  guilt:       [-0.8, 0.2, -0.6, 0.30],
  shame:       [-0.9, -0.2, -0.9, 0.35],
  isolation:   [-0.7, -0.5, -0.6, 0.20],
  numbness:    [-0.6, -0.8, -0.4, 0.10],
  moral_pain:  [-0.8, 0.3, -0.7, 0.30],
  helplessness:[-0.9, -0.4, -1.0, 0.25],
  despair:     [-1.0, -0.6, -0.9, 0.20],
  joy:         [0.9, 0.6, 0.5, 0.50],
  hope:        [0.7, 0.4, 0.6, 0.45],
  relief:      [0.6, -0.3, 0.4, 0.65],
  gratitude:   [0.8, -0.2, 0.7, 0.30],
  love:        [1.0, 0.5, 0.6, 0.20],
  peace:       [0.8, -0.6, 0.7, 0.10],
  comfort:     [0.7, -0.4, 0.6, 0.25],
  longing:     [-0.3, 0.2, -0.2, 0.30],
  nostalgia:   [0.1, -0.3, -0.1, 0.20],
  acceptance:  [0.4, -0.4, 0.5, 0.15],
  confusion:   [-0.4, 0.3, -0.5, 0.75],
};
const KO = {
  fear:'공포', sadness:'슬픔', anger:'분노', guilt:'죄책감', shame:'수치심',
  isolation:'고립', numbness:'무감각', moral_pain:'도덕적고통', helplessness:'무력감', despair:'절망',
  joy:'기쁨', hope:'희망', relief:'안도', gratitude:'감사', love:'사랑', peace:'평화', comfort:'위로',
  longing:'그리움', nostalgia:'향수', acceptance:'수용', confusion:'혼란',
};
const names = Object.keys(A);

function dist3(p,q){ const a=p[0]-q[0],b=p[1]-q[1],c=p[2]-q[2]; return Math.sqrt(a*a+b*b+c*c); }
function dist4(p,q){ const a=p[0]-q[0],b=p[1]-q[1],c=p[2]-q[2],d=p[3]-q[3]; return Math.sqrt(a*a+b*b+c*c+d*d); }
const MAX3 = Math.sqrt(12), MAX4 = Math.sqrt(16);

// 정규화 거리(차원 수 보정해서 공정 비교): 0~1
function n3(p,q){ return dist3(p,q)/MAX3; }
function n4(p,q){ return dist4(p,q)/MAX4; }

// 모든 쌍, 정규화 거리
const pairs = [];
for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  pairs.push({a:names[i], b:names[j], d3:n3(A[names[i]],A[names[j]]), d4:n4(A[names[i]],A[names[j]])});
}

// 3D에서 가장 겹친 쌍 top 12 → 4D에서 어떻게 변했나
const by3 = pairs.slice().sort((x,y)=>x.d3-y.d3);
console.log('=== 3D에서 가장 겹친 쌍이 4D(+새로움)에서 얼마나 갈라지나 ===');
console.log('(정규화 거리 0~1, 클수록 멀다. 화살표=변화)\n');
by3.slice(0,12).forEach((p,i)=>{
  const dlt = p.d4 - p.d3;
  const mark = dlt > 0.03 ? '↑갈라짐' : (dlt < -0.01 ? '↓더붙음' : '─그대로');
  console.log('%s. %s ↔ %s   3D=%s → 4D=%s  %s',
    String(i+1).padStart(2), KO[p.a].padEnd(7), KO[p.b].padEnd(7),
    p.d3.toFixed(3), p.d4.toFixed(3), mark);
});

// 겹침 임계: 3D 정규화 0.144 (원래 거리 0.5에 해당)
const TH = 0.5/MAX3;
const overlap3 = pairs.filter(p=>p.d3 < TH).length;
const overlap4 = pairs.filter(p=>p.d4 < TH).length;

// 각 감정의 최근접 이웃 정규화 거리 평균
function meanNN(key){
  let s=0;
  for(const n of names){
    let bd=Infinity;
    for(const m of names){ if(m===n)continue; const d = key==='d3'?n3(A[n],A[m]):n4(A[n],A[m]); if(d<bd)bd=d; }
    s+=bd;
  }
  return s/names.length;
}

console.log('\n=== 통계 (정규화 기준, 임계=%s) ===', TH.toFixed(3));
console.log('거의 같은 자리 쌍 수:   3D = %s쌍  →  4D = %s쌍', overlap3, overlap4);
console.log('평균 최근접 거리:        3D = %s   →  4D = %s', meanNN('d3').toFixed(3), meanNN('d4').toFixed(3));
console.log('\n(겹침 쌍이 확 줄고 평균거리가 커지면 = 4차원이 겹침을 푼다)');
