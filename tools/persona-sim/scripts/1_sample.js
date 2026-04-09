// Stratified sampling from automoto/big-five-data (N=307,313)
// Produces 15 personas spanning theoretically motivated Big Five combinations
// relevant to the "당신에게" memory (grief, attachment, dissociation, reincarnation).
//
// Output: data/sampled_scores.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'big-five-data', 'big_five_scores.csv');
const OUT_PATH = path.join(__dirname, '..', 'data', 'sampled_scores.json');

// ─── Load CSV ───────────────────────────────────────────────
console.log('[1/sample] Loading CSV...');
const csv = fs.readFileSync(CSV_PATH, 'utf8');
const lines = csv.trim().split('\n');
const header = lines[0].split(',');
const idx = {
  case_id: header.indexOf('case_id'),
  country: header.indexOf('country'),
  age: header.indexOf('age'),
  sex: header.indexOf('sex'),
  A: header.indexOf('agreeable_score'),
  E: header.indexOf('extraversion_score'),
  O: header.indexOf('openness_score'),
  C: header.indexOf('conscientiousness_score'),
  N: header.indexOf('neuroticism_score'),
};

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(',');
  const age = parseInt(c[idx.age], 10);
  if (isNaN(age) || age < 16 || age > 75) continue;
  const sex = parseInt(c[idx.sex], 10);
  const A = parseFloat(c[idx.A]);
  const E = parseFloat(c[idx.E]);
  const O = parseFloat(c[idx.O]);
  const C = parseFloat(c[idx.C]);
  const N = parseFloat(c[idx.N]);
  if ([A,E,O,C,N].some(v => isNaN(v))) continue;
  rows.push({
    case_id: c[idx.case_id],
    country: c[idx.country],
    age, sex, A, E, O, C, N,
  });
}
console.log(`[1/sample] Loaded ${rows.length} valid rows.`);

// ─── Percentile helpers ────────────────────────────────────
function pct(arr, trait, lo, hi) {
  return arr.filter(r => {
    const v = r[trait];
    return v >= lo && v <= hi;
  });
}
const P = {
  top20: [0.80, 1.01],
  bot20: [-0.01, 0.20],
  top30: [0.70, 1.01],
  bot30: [-0.01, 0.30],
  mid40: [0.30, 0.70],
};

// ─── Stratification plan ───────────────────────────────────
// Each stratum targets a psychologically distinct reader profile
// for the "당신에게" memory (grief, attachment, identity, dissociation).
const STRATA = [
  {
    label: 'high_N_low_A',
    desc: '분노 투사 — 타인/운명 원망이 강함',
    filter: r => r.N >= 0.80 && r.A <= 0.30,
  },
  {
    label: 'high_N_high_A',
    desc: '죄책감 과잉 — 모든 책임을 자기에게로',
    filter: r => r.N >= 0.75 && r.A >= 0.75,
  },
  {
    label: 'low_N_low_E',
    desc: '정서 안정+내향 — 해리/거리두기 경향',
    filter: r => r.N <= 0.35 && r.E <= 0.35,
  },
  {
    label: 'high_O_high_N',
    desc: '개방성+신경증 — 상징/영적 해석 경향',
    filter: r => r.O >= 0.80 && r.N >= 0.70,
  },
  {
    label: 'low_O_high_C',
    desc: '개방성↓ 성실성↑ — 분석적 관찰자',
    filter: r => r.O <= 0.30 && r.C >= 0.75,
  },
  {
    label: 'high_E_high_A',
    desc: '외향+친화 — 공감적 경청자',
    filter: r => r.E >= 0.75 && r.A >= 0.75,
  },
  {
    label: 'high_O_high_A_high_N',
    desc: '개방+친화+신경증 — 공감 과부하형',
    filter: r => r.O >= 0.75 && r.A >= 0.75 && r.N >= 0.70,
  },
  {
    label: 'low_A_low_C',
    desc: '친화성↓ 성실성↓ — 냉소적 해체자',
    filter: r => r.A <= 0.25 && r.C <= 0.30,
  },
  {
    label: 'high_C_high_N',
    desc: '성실성+신경증 — 통제 욕구 과잉',
    filter: r => r.C >= 0.80 && r.N >= 0.70,
  },
  {
    label: 'high_O_low_N',
    desc: '개방+안정 — 수용적 탐구자',
    filter: r => r.O >= 0.80 && r.N <= 0.30,
  },
  {
    label: 'low_E_high_O',
    desc: '내향+개방 — 내면 몽상가',
    filter: r => r.E <= 0.30 && r.O >= 0.75,
  },
  {
    label: 'high_N_low_C',
    desc: '신경증↑ 성실성↓ — 혼란 속 표류형',
    filter: r => r.N >= 0.75 && r.C <= 0.30,
  },
  {
    label: 'mid_all',
    desc: '평균 프로필 — 대조군 1',
    filter: r => r.N >= 0.40 && r.N <= 0.60 && r.A >= 0.40 && r.A <= 0.60 && r.O >= 0.40 && r.O <= 0.60,
  },
  {
    label: 'mid_all_2',
    desc: '평균 프로필 — 대조군 2 (다른 연령/성별)',
    filter: r => r.N >= 0.40 && r.N <= 0.60 && r.E >= 0.40 && r.E <= 0.60 && r.C >= 0.40 && r.C <= 0.60,
  },
  {
    label: 'extreme_low_N_high_E_A',
    desc: '매우 낙관적 — 그늘 이해 못 하는 경우',
    filter: r => r.N <= 0.20 && r.E >= 0.75 && r.A >= 0.70,
  },
];

// ─── Sample ────────────────────────────────────────────────
const SEED = 42;
let rng = SEED;
function rand() { rng = (rng * 16807) % 2147483647; return rng / 2147483647; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

const sampled = [];
STRATA.forEach((s, i) => {
  const pool = rows.filter(s.filter);
  if (pool.length === 0) {
    console.warn(`[1/sample] ⚠ Stratum "${s.label}" has 0 rows — skipping`);
    return;
  }
  const picked = pick(pool);
  sampled.push({
    persona_id: `p${String(i + 1).padStart(2, '0')}`,
    strata_label: s.label,
    strata_desc: s.desc,
    source: {
      case_id: picked.case_id,
      country: picked.country,
      age: picked.age,
      sex: picked.sex === 1 ? 'male' : 'female',
    },
    scores: {
      N: +(picked.N * 100).toFixed(1),
      E: +(picked.E * 100).toFixed(1),
      O: +(picked.O * 100).toFixed(1),
      A: +(picked.A * 100).toFixed(1),
      C: +(picked.C * 100).toFixed(1),
    },
  });
  console.log(`[1/sample] ${s.label.padEnd(28)} pool=${String(pool.length).padStart(6)} → case_id=${picked.case_id} (${picked.country}, ${picked.age}${picked.sex === 1 ? 'M' : 'F'})`);
});

fs.writeFileSync(OUT_PATH, JSON.stringify(sampled, null, 2));
console.log(`\n[1/sample] ✓ Wrote ${sampled.length} personas → ${OUT_PATH}`);
