// (A 마무리) 궤적(변화 방향)이 한 점의 감정보다 변별적인가?
// 변화 방향(delta)들이 점들보다 서로 덜 비슷하면(평균 코사인 낮음) = 궤적이 더 많은 정보를 담는다.
'use strict';

// 기억별 장면 순서 (scene_order)
const MEM = {
  '7a700000': [
    {o:0, e:{fear:0.15,anger:0.05,guilt:0.05,shame:0.1,longing:0.15,sadness:0.3,numbness:0.7,isolation:0.5}},
    {o:1, e:{fear:0.5,anger:0.05,guilt:0.15,shame:0.45,longing:0.1,sadness:0.3,numbness:0.4,isolation:0.5}},
    {o:4, e:{fear:0.2,anger:0.25,guilt:0.4,shame:0.55,longing:0.35,sadness:0.45,numbness:0.4,isolation:0.4}},
    {o:5, e:{fear:0.3,anger:0.15,guilt:0.55,shame:0.65,longing:0.15,sadness:0.35,numbness:0.45,isolation:0.5}},
    {o:6, e:{fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5}},
  ],
  'd9fd25f0': [
    {o:0, e:{fear:0.55,anger:0.3,numbness:0.42,isolation:0.65}},
    {o:1, e:{guilt:0.45,longing:0.35,sadness:0.6,numbness:0.28}},
    {o:2, e:{anger:0.58,guilt:0.4,shame:0.72,isolation:0.35}},
    {o:4, e:{fear:0.7,numbness:0.35,isolation:0.5}},
    {o:6, e:{longing:0.2,sadness:0.4,numbness:0.65,isolation:0.5}},
  ],
};

const ALL_KEYS = ['fear','anger','guilt','shame','longing','sadness','numbness','isolation','love','confusion'];
function vec(e){ return ALL_KEYS.map(k=>e[k]||0); }
function cos(a,b){
  let dot=0,ma=0,mb=0;
  for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; ma+=a[i]*a[i]; mb+=b[i]*b[i]; }
  if(ma===0||mb===0) return 0;
  return dot/(Math.sqrt(ma)*Math.sqrt(mb));
}
function sub(a,b){ return a.map((x,i)=>x-b[i]); }

// 모든 장면 점(point)
const points = [];
for(const m in MEM) for(const s of MEM[m]) points.push(vec(s.e));

// 모든 연속 변화(delta): 같은 기억 내 인접 장면 차
const deltas = [];
for(const m in MEM){
  const seq = MEM[m].map(s=>vec(s.e));
  for(let i=1;i<seq.length;i++) deltas.push(sub(seq[i], seq[i-1]));
}

// 평균 쌍 코사인 (낮을수록 서로 다양 = 변별력 큼)
function meanPairCos(arr){
  let s=0,n=0;
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){ s+=cos(arr[i],arr[j]); n++; }
  return s/n;
}

const pc = meanPairCos(points);
const dc = meanPairCos(deltas);

console.log('=== (A) 궤적(변화 방향)이 점보다 변별적인가? ===');
console.log('평균 쌍 유사도 — 낮을수록 서로 다양 = 정보 더 많음\n');
console.log('한 점의 감정(point) 평균 유사도:    %s', pc.toFixed(3));
console.log('변화 방향(delta)  평균 유사도:      %s', dc.toFixed(3));
console.log('\n점 개수=%s, 변화방향 개수=%s', points.length, deltas.length);
console.log('\n=== 해석 ===');
if(dc < pc){
  console.log('변화 방향이 점보다 %s 더 다양 → 궤적이 점보다 변별력 큼 ✓', (pc-dc).toFixed(3));
  console.log('= 점이 겹쳐도 궤적(shape)이 구별을 떠받친다. 별이엔진 설계가 옳음.');
} else {
  console.log('점이 변화방향보다 다양 → 이 데이터에선 궤적 우위 안 보임');
}
