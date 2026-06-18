// (A) 검증: 겹치는 감정이 별이엔진을 실제로 망치는가?
// 실제 DB 장면 18개를, 별이엔진 방식(17축 코사인, 안 뭉갬) vs 지형 방식(VAD 2D 투영, 뭉갬)으로
// "같은 감정군 vs 다른 감정군" 구별력을 비교한다.
'use strict';

// VAD_FULL (지형 방식 투영용)
const VAD = {
  fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8}, guilt:{v:-0.8,a:0.2},
  shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5}, numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2},
  resentment:{v:-0.5,a:0.6}, resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
  relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5}, peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
};

// 실제 DB 장면 emotion_vector (verbatim, _terrain_distinct_fixes.js DATA)
const DATA = [
  {mem:'7a700000:s6', cl:'fear_anger', e:{fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5}},
  {mem:'d9fd25f0:s4', cl:'fear_anger', e:{fear:0.7,numbness:0.35,isolation:0.5}},
  {mem:'1dde3a8a:s0', cl:'fear_anger', e:{fear:0.7,sadness:0.2,isolation:0.4}},
  {mem:'82d6a613:s4', cl:'fear_anger', e:{fear:0.05,anger:0.4,guilt:0.05,longing:0.15,sadness:0.45}},
  {mem:'d9fd25f0:s0', cl:'fear_anger', e:{fear:0.55,anger:0.3,numbness:0.42,isolation:0.65}},
  {mem:'82d6a613:s3', cl:'fear_anger', e:{fear:0.038,anger:0.307,guilt:0.038,longing:0.115,sadness:0.345}},
  {mem:'7a700000:s0', cl:'sad_numb', e:{fear:0.15,anger:0.05,guilt:0.05,shame:0.1,longing:0.15,sadness:0.3,numbness:0.7,isolation:0.5}},
  {mem:'c4888189:s5', cl:'sad_numb', e:{fear:0.15,numbness:0.65,isolation:0.4}},
  {mem:'d9fd25f0:s6', cl:'sad_numb', e:{longing:0.2,sadness:0.4,numbness:0.65,isolation:0.5}},
  {mem:'d9fd25f0:s1', cl:'sad_numb', e:{guilt:0.45,longing:0.35,sadness:0.6,numbness:0.28}},
  {mem:'1dde3a8a:s2', cl:'sad_numb', e:{sadness:0.6,longing:0.5,isolation:0.4}},
  {mem:'c4888189:s0', cl:'sad_numb', e:{fear:0.15,sadness:0.25,numbness:0.58,isolation:0.48}},
  {mem:'d9fd25f0:s2', cl:'guilt_shame', e:{anger:0.58,guilt:0.4,shame:0.72,isolation:0.35}},
  {mem:'7a700000:s5', cl:'guilt_shame', e:{fear:0.3,anger:0.15,guilt:0.55,shame:0.65,longing:0.15,sadness:0.35,numbness:0.45,isolation:0.5}},
  {mem:'c291e1aa:s1', cl:'guilt_shame', e:{fear:0.2,love:0.1,guilt:0.4,shame:0.15,sadness:0.15}},
  {mem:'7a700000:s4', cl:'guilt_shame', e:{fear:0.2,anger:0.25,guilt:0.4,shame:0.55,longing:0.35,sadness:0.45,numbness:0.4,isolation:0.4}},
  {mem:'c291e1aa:s0', cl:'guilt_shame', e:{shame:0.35,longing:0.2,sadness:0.15,confusion:0.05,isolation:0.25}},
  {mem:'7a700000:s1', cl:'guilt_shame', e:{fear:0.5,anger:0.05,guilt:0.15,shame:0.45,longing:0.1,sadness:0.3,numbness:0.4,isolation:0.5}},
];

// 별이엔진 방식: 17축 코사인 (안 뭉갬)
function cosine17(a, b){
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot=0, ma=0, mb=0;
  for(const k of keys){ const x=a[k]||0, y=b[k]||0; dot+=x*y; ma+=x*x; mb+=y*y; }
  if(ma===0||mb===0) return 0;
  return dot/(Math.sqrt(ma)*Math.sqrt(mb));
}
// 지형 방식: VAD 2D 투영 후 유사도 (뭉갬)
function toVAD(e){
  let V=0,A=0,w=0;
  for(const k in e){ const m=VAD[k]; if(!m)continue; V+=e[k]*m.v; A+=e[k]*m.a; w+=e[k]; }
  if(w<=0) return {v:0,a:0};
  return {v:V/w, a:A/w};
}
function vadSim(p, q){ // 2D 거리 → 유사도 (가까울수록 1)
  const d = Math.hypot(p.v-q.v, p.a-q.a);
  return Math.exp(-1.5 * d); // 단조 감쇠
}

const vads = DATA.map(d=>toVAD(d.e));

// 같은 군 vs 다른 군 비교
let cosSame=[], cosDiff=[], vadSame=[], vadDiff=[];
for(let i=0;i<DATA.length;i++)for(let j=i+1;j<DATA.length;j++){
  const c = cosine17(DATA[i].e, DATA[j].e);
  const v = vadSim(vads[i], vads[j]);
  if(DATA[i].cl===DATA[j].cl){ cosSame.push(c); vadSame.push(v); }
  else { cosDiff.push(c); vadDiff.push(v); }
}
const mean = a=>a.reduce((x,y)=>x+y,0)/a.length;

const cs=mean(cosSame), cd=mean(cosDiff), vs=mean(vadSame), vd=mean(vadDiff);
console.log('=== (A) 겹침이 별이엔진을 망치나? 실제 장면 18개 ===');
console.log('구별력 = (같은군 유사도) - (다른군 유사도). 클수록 잘 구별. 0이면 구별 못함.\n');

console.log('【별이엔진 방식 — 17축 코사인 (안 뭉갬)】');
console.log('  같은 감정군 평균 유사도: %s', cs.toFixed(3));
console.log('  다른 감정군 평균 유사도: %s', cd.toFixed(3));
console.log('  구별력(차이):           %s', (cs-cd).toFixed(3));

console.log('\n【지형 방식 — VAD 2D 투영 (뭉갬)】');
console.log('  같은 감정군 평균 유사도: %s', vs.toFixed(3));
console.log('  다른 감정군 평균 유사도: %s', vd.toFixed(3));
console.log('  구별력(차이):           %s', (vs-vd).toFixed(3));

console.log('\n=== 결론 지표 ===');
console.log('별이엔진 구별력 / 지형 구별력 = %s / %s', (cs-cd).toFixed(3), (vs-vd).toFixed(3));
const ratio = (cs-cd)/(vs-vd);
console.log('별이엔진이 지형보다 %s배 잘 구별', ratio.toFixed(2));
