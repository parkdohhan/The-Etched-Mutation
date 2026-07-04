// _trajectory_check 재검증: 대조군(셔플·난수) 추가.
// 질문: "궤적이 점보다 변별적(dc<pc)"이 진짜 궤적 때문인가,
//        아니면 차이벡터가 원래 음수 섞여 흩어지는 기계적 산물인가?
'use strict';

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
const KEYS = ['fear','anger','guilt','shame','longing','sadness','numbness','isolation','love','confusion'];
const vec = e => KEYS.map(k => e[k] || 0);
function cos(a,b){ let d=0,ma=0,mb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i];} return (ma===0||mb===0)?0:d/(Math.sqrt(ma)*Math.sqrt(mb)); }
const sub = (a,b) => a.map((x,i)=>x-b[i]);
function meanPairCos(arr){ let s=0,n=0; for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){s+=cos(arr[i],arr[j]);n++;} return n?s/n:0; }
function deltasOf(seqs){ const d=[]; for(const seq of seqs) for(let i=1;i<seq.length;i++) d.push(sub(seq[i],seq[i-1])); return d; }

// ── 실제 데이터 ──
const realSeqs = Object.values(MEM).map(m => m.map(s => vec(s.e)));
const points = realSeqs.flat();
const sizes = realSeqs.map(s => s.length);  // [5,5]
const pc_real = meanPairCos(points);
const dc_real = meanPairCos(deltasOf(realSeqs));

// ── 유틸 ──
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function splitBySizes(arr, sizes){ const out=[]; let idx=0; for(const s of sizes){ out.push(arr.slice(idx,idx+s)); idx+=s; } return out; }
function pct(arr,p){ const s=arr.slice().sort((x,y)=>x-y); return s[Math.floor(p/100*(s.length-1))]; }
function stats(arr){ const m=arr.reduce((a,b)=>a+b,0)/arr.length; return {mean:m, p5:pct(arr,5), p95:pct(arr,95), min:Math.min(...arr), max:Math.max(...arr)}; }

const N = 2000;

// ── 셔플 대조군: 같은 점들, 무작위 순서 → 가짜 궤적 ──
const dc_shuffle = [];
for(let k=0;k<N;k++){ const sh = splitBySizes(shuffle(points), sizes); dc_shuffle.push(meanPairCos(deltasOf(sh))); }
const ss = stats(dc_shuffle);

// ── 난수 대조군: 실제 희소도(점당 비영 개수) 모방한 난수 점 ──
const nonzeroCounts = points.map(p => p.filter(x=>x>0).length);
function randPoint(){
  const v = new Array(KEYS.length).fill(0);
  const k = nonzeroCounts[Math.floor(Math.random()*nonzeroCounts.length)];
  const idx = shuffle(KEYS.map((_,i)=>i)).slice(0,k);
  for(const i of idx) v[i] = Math.random();  // 다듬지 않은 raw 난수
  return v;
}
const pc_rand=[], dc_rand=[];
for(let k=0;k<N;k++){
  const rp = points.map(()=>randPoint());
  pc_rand.push(meanPairCos(rp));
  dc_rand.push(meanPairCos(deltasOf(splitBySizes(rp, sizes))));
}
const prS = stats(pc_rand), drS = stats(dc_rand);

// ── 결과 ──
console.log('=== _trajectory_check 재검증 (대조군 N=%d) ===\n', N);
console.log('[실제 데이터]');
console.log('  점 평균유사도 pc = %s', pc_real.toFixed(3));
console.log('  변화방향 dc      = %s', dc_real.toFixed(3));
console.log('  격차 pc-dc       = %s', (pc_real-dc_real).toFixed(3));

console.log('\n[셔플 대조군] (같은 점, 순서만 무작위 → "가짜 궤적")');
console.log('  dc 분포: mean=%s  5%%=%s  95%%=%s  (min=%s max=%s)',
  ss.mean.toFixed(3), ss.p5.toFixed(3), ss.p95.toFixed(3), ss.min.toFixed(3), ss.max.toFixed(3));

console.log('\n[난수 대조군] (raw 난수 점, 실제 희소도 모방)');
console.log('  pc 분포: mean=%s', prS.mean.toFixed(3));
console.log('  dc 분포: mean=%s  5%%=%s  95%%=%s', drS.mean.toFixed(3), drS.p5.toFixed(3), drS.p95.toFixed(3));
console.log('  격차 pc-dc(난수): mean=%s', (prS.mean-drS.mean).toFixed(3));

console.log('\n=== 판정 ===');
// 1) dc<pc가 난수에서도 나오나? (그 세션 핵심 지적)
console.log('① 난수도 dc<pc 인가? : 난수 pc(%s) > 난수 dc(%s) → %s',
  prS.mean.toFixed(3), drS.mean.toFixed(3), prS.mean>drS.mean ? 'YES (dc<pc는 난수로도 나옴 = 그 자체론 무의미)' : 'NO');
// 2) 실제 궤적이 셔플(가짜 궤적)보다 변별적인가? = dc_real이 셔플분포보다 유의하게 낮은가
const below = dc_shuffle.filter(x => x <= dc_real).length / N;
console.log('② 실제 dc(%s)가 셔플 dc분포에서 차지하는 위치: 하위 %s%% (이만큼이 실제보다 더 낮거나 같음)',
  dc_real.toFixed(3), (below*100).toFixed(1));
console.log('   → 실제 순서가 의미 있으려면 이 값이 작아야(예: <5%%) 한다.');
if(below < 0.05) console.log('   판정: 실제 궤적이 가짜 궤적보다 유의하게 변별적 ✓ (순서가 의미 있음)');
else if(below < 0.2) console.log('   판정: 약한 신호 (유의하다 말하기 어려움)');
else console.log('   판정: 실제 궤적이 셔플과 구별 안 됨 ✗ (순서=궤적은 변별에 기여 안 함)');
console.log('\n※ 한계: 기억 2개(표본 극소). 이건 통계 검증이 아니라 방향 점검이다.');
