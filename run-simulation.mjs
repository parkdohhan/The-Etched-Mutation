// TEM Play Simulation — direct REST API, no dependencies
import { readFileSync } from 'fs';
const _env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB_URL = _env.VITE_SUPABASE_URL;
const SB_KEY = _env.VITE_SUPABASE_ANON_KEY;
const MEM_ID = '758aaae3-3a37-4a45-ba01-ef783f3f957b';

async function sbPost(table, rows) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }
}

async function sbPatch(table, filter, data) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`PATCH ${res.status}: ${t}`); }
}

async function sbCount(table, filter) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}&select=id`, {
    method: 'HEAD',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Prefer': 'count=exact' }
  });
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
}

const SCENES = [
  { id:'0d2347f4-87cc-42f3-b57c-03cb0bb310e4', emo:{numbness:0.72,sadness:0.41,shame:0.18}, tl:200, rv:{attribution:'self_blame',core_fear:'abandonment',target:'self',is_void:false} },
  { id:'04c01202-3840-41a4-a6d8-7dd3fba2d9b2', emo:{anger:0.81,sadness:0.55,moral_pain:0.3}, tl:180, rv:{attribution:'other_blame',core_fear:'loss',target:'parent',is_void:false} },
  { id:'f06a2e4e-74f9-454a-87cc-1b0e4c8b98db', emo:{isolation:0.78,sadness:0.63,helplessness:0.42}, tl:220, rv:{attribution:'fate_blame',core_fear:'helplessness',target:'self',is_void:false} },
];

const E = ['fear','sadness','anger','guilt','shame','isolation','numbness','moral_pain','helplessness','despair','joy','hope','relief','gratitude','love','peace','comfort'];
const A = ['self_blame','other_blame','fate_blame','self_doubt','betrayal','circumstance'];
const F = ['abandonment','loss','rejection','failure','death','helplessness','punishment','none'];
const T = ['self','parent','partner','friend','stranger','society','god','none'];
const REASONS = [
  "I felt this because I couldn't protect what mattered.",
  "Something in me already knew it would end this way.",
  "There was nothing I could do. That's what hurts most.",
  "I remember the silence more than anything.",
  "The weight of it came later, not in the moment.",
  "I chose wrong, and I've carried that ever since.",
  "I was there, but I wasn't really there.",
  "Part of me wanted to look away.",
  "The anger wasn't at anyone specific. It was everywhere.",
  "I felt relieved, and then I felt guilty for being relieved.",
  "I keep going back to that moment, rewriting it.",
  "I was numb. Not sad, not angry. Just... nothing.",
  "The worst part is that I understand why they did it.",
  "I don't have words for it. I just... feel it.",
  "I wonder if they knew how much it mattered.",
  "It wasn't supposed to happen to someone like them.",
  "I kept telling myself it wasn't my fault, but...",
  "It changed how I see everything, permanently.",
  "I think I stayed because leaving would mean admitting it.",
  "I don't know if I forgave them or just forgot."
];

const rr=(a,b)=>a+Math.random()*(b-a), pick=a=>a[Math.floor(Math.random()*a.length)], cl=v=>Math.max(0,Math.min(1,v));

function cosSim(v1,v2){let d=0,m1=0,m2=0;for(const k of E){const a=v1[k]||0,b=v2[k]||0;d+=a*b;m1+=a*a;m2+=b*b;}m1=Math.sqrt(m1);m2=Math.sqrt(m2);return(m1===0||m2===0)?0:d/(m1*m2);}
function attrDir(a){if(!a)return null;if(['self_blame','self_doubt'].includes(a))return'i';if(['other_blame','betrayal'].includes(a))return'e';return's';}

function calcAlign(uE,oE,uR,oR){
  const eS=Math.max(0,cosSim(uE,oE));
  let rS=eS*0.3;
  if(uR&&oR&&!uR.is_void&&!oR.is_void){rS=0;if(uR.attribution&&oR.attribution){rS+=uR.attribution===oR.attribution?0.45:(attrDir(uR.attribution)===attrDir(oR.attribution)?0.20:0);}if(uR.core_fear&&oR.core_fear&&uR.core_fear===oR.core_fear)rS+=0.35;if(uR.target&&oR.target&&uR.target===oR.target)rS+=0.20;rS=Math.min(1,rS);}
  let aS=0.7;if(uR?.is_void&&oR?.is_void)aS=0.8;else if(uR?.is_void)aS=0.2;else if(oR?.is_void)aS=0.6;
  return cl(eS*0.4+rS*0.4+aS*0.2);
}

function getMM(uE,oE,uR,oR){
  if(!!uR?.is_void!==!!oR?.is_void)return'void_mismatch';
  if(uR?.attribution&&oR?.attribution&&uR.attribution!==oR.attribution)return'attribution_mismatch';
  if(uR?.target&&oR?.target&&uR.target!==oR.target&&cosSim(uE,oE)>=0.5)return'target_displacement';
  if(cosSim(uE,oE)<0.5)return'emotion_mismatch';
  return null;
}

const PERSONAS=[
  {n:'empathizer',w:.20,noise:.12,rm:.85,vp:.02},
  {n:'resonator',w:.25,noise:.30,rm:.50,vp:.05},
  {n:'displaced',w:.20,noise:.22,rm:.15,vp:.04},
  {n:'avoidant',w:.15,noise:.50,rm:.10,vp:.35},
  {n:'contrarian',w:.10,noise:.65,rm:.05,vp:.08},
  {n:'analytical',w:.10,noise:.35,rm:.40,vp:.10},
];
function pickP(){let v=Math.random(),a=0;for(const p of PERSONAS){a+=p.w;if(v<a)return p;}return PERSONAS[0];}

function genEmo(orig,p){
  const vec={};const oK=Object.keys(orig).filter(k=>orig[k]>0);
  for(const e of E){const o=orig[e]||0;if(o>0)vec[e]=cl(o+rr(-p.noise,p.noise*0.6));else if(Math.random()<p.noise*0.25)vec[e]=cl(rr(0.05,p.noise*0.4));else vec[e]=0;}
  if(p.n==='contrarian'&&oK.length>0){for(const k of oK)vec[k]*=0.15;const ot=E.filter(e=>!oK.includes(e));if(ot.length)vec[pick(ot)]=cl(rr(0.4,0.85));}
  const sum=Object.values(vec).reduce((a,b)=>a+b,0);if(sum<0.01)vec[pick(E)]=rr(0.2,0.6);
  return vec;
}

function genR(orig,p){
  if(Math.random()<p.vp)return{attribution:null,core_fear:null,target:null,is_void:true};
  if(orig&&Math.random()<p.rm)return{attribution:orig.attribution||pick(A),core_fear:orig.core_fear||pick(F),target:orig.target||pick(T),is_void:false};
  return{attribution:pick(A),core_fear:pick(F),target:pick(T),is_void:false};
}

function makeWave(emo,tLen){
  const total=Object.values(emo).reduce((s,v)=>s+(v||0),0);
  const int=cl(total/6);const pts=[];const w=Math.max(60,Math.min(300,tLen*5));
  for(let i=0;i<w;i++){const x=i/w;pts.push({x,y:0.5+Math.sin(x*62.8*(0.02+int*0.01))*0.25});}
  const dom=Object.entries(emo).sort((a,b)=>b[1]-a[1])[0]?.[0]||'fear';
  return{wavePoints:pts,color:'rgba(196,168,130,0.8)',intensity:int,voidLevel:'low'};
}

// ── MAIN ──
const COUNT = 100;
const st = {HIGH:0,MID:0,LOW:0,total:0,err:0};
const mm = {}, pm = {};
const rows = [];

console.log(`\n=== Generating ${COUNT} plays x ${SCENES.length} scenes ===\n`);

for (let i=0; i<COUNT; i++) {
  const p = pickP();
  pm[p.n] = (pm[p.n]||0)+1;
  const daysAgo = Math.random()*180;
  const base = Date.now() - daysAgo*86400000;

  for (let si=0; si<SCENES.length; si++) {
    const sc = SCENES[si];
    const uE = genEmo(sc.emo, p);
    const uR = genR(sc.rv, p);
    const al = parseFloat(calcAlign(uE,sc.emo,uR,sc.rv).toFixed(4));
    const mis = getMM(uE,sc.emo,uR,sc.rv);
    const bk = al>=0.55?'HIGH':al<0.35?'LOW':'MID';
    st[bk]++; st.total++;
    if(mis) mm[mis]=(mm[mis]||0)+1;

    rows.push({
      memory_id:MEM_ID, scene_id:sc.id,
      user_emotion:uE, user_reason:pick(REASONS),
      wave_data:makeWave(uE,sc.tl), layer_id:0,
      alignment:al, reason_vector:uR,
      mismatch_type:mis, user_id:null,
      created_at:new Date(base+si*60000).toISOString()
    });
  }
}

console.log(`Generated ${rows.length} rows. Inserting...`);

const BATCH = 50;
for (let i=0; i<rows.length; i+=BATCH) {
  const batch = rows.slice(i, i+BATCH);
  try {
    await sbPost('plays', batch);
    process.stdout.write(`  ${Math.min(i+BATCH,rows.length)}/${rows.length} inserted\r`);
  } catch(e) {
    st.err += batch.length;
    console.error(`\nBatch error at ${i}: ${e.message}`);
  }
}

const playCount = await sbCount('plays', `memory_id=eq.${MEM_ID}`);
const dilution = Math.round(100/(1+(playCount)*0.1));
await sbPatch('memories', `id=eq.${MEM_ID}`, {layers:playCount, dilution});

console.log(`\n\n=== COMPLETE ===`);
console.log(`Plays saved: ${st.total} | Errors: ${st.err}`);
console.log(`HIGH: ${st.HIGH} (${(st.HIGH/st.total*100).toFixed(1)}%) | MID: ${st.MID} (${(st.MID/st.total*100).toFixed(1)}%) | LOW: ${st.LOW} (${(st.LOW/st.total*100).toFixed(1)}%)`);
console.log(`Mismatch:`, mm);
console.log(`Personas:`, pm);
console.log(`DB: layers=${playCount}, dilution=${dilution}%`);
console.log(`\n=> Strata 3D terrain now has ${playCount} events across 180-day span.`);
