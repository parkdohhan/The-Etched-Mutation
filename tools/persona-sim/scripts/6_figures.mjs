// Generate paper figures (static SVG, light mode) from committed snapshot data.
// Fig 1: per-persona strip plot of objectively computed alignment
// Fig 2: histogram of LLM self-reported alignment values (quantization)
//
// Output: docs/paper/figures/fig{1,2}_*-260705.svg

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', '..', '..', 'docs', 'paper', 'data');
const OUT = path.join(__dirname, '..', '..', '..', 'docs', 'paper', 'figures');
fs.mkdirSync(OUT, { recursive: true });

const plays = JSON.parse(fs.readFileSync(path.join(DATA, 'MM23L_plays.json'), 'utf8'));
const analysis = JSON.parse(fs.readFileSync(path.join(DATA, 'persona_sim_analysis-260705.json'), 'utf8'));
const scores = JSON.parse(fs.readFileSync(path.join(DATA, 'sampled_scores.json'), 'utf8'));

// palette (dataviz reference, light mode)
const C = {
  surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781',
  grid: '#e1e0d9', baseline: '#c3c2b7', series: '#2a78d6', band: '#f0efec',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// objective per play (recompute, same as 5_analyze)
function cosine(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) { const x = a?.[k] || 0, y = b?.[k] || 0; dot += x*y; na += x*x; nb += y*y; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
// original emotions come from analysis? Not stored per play — read from plays snapshot needs scenes.
// The analysis JSON stores persona means; for dots we need per-play objective.
// scenes' original_emotion is not in the snapshot, so keep a tiny local map built from Supabase once:
// → to stay offline/reproducible, we approximate nothing: fetch is avoided by storing per-play objective
//   into the snapshot the first time this script runs with --with-obj (requires .env), else expects it.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
if (plays.some(p => p.objective == null)) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: scenes } = await supabase.from('scenes')
    .select('id, original_emotion').eq('memory_id', process.env.TARGET_MEMORY_ID);
  const orig = {};
  for (const s of scenes) orig[s.id] = typeof s.original_emotion === 'string' ? JSON.parse(s.original_emotion) : s.original_emotion;
  for (const p of plays) p.objective = cosine(p.user_emotion, orig[p.scene_id]);
  fs.writeFileSync(path.join(DATA, 'MM23L_plays.json'), JSON.stringify(plays, null, 2));
  console.log('[6/fig] objective values stored into snapshot');
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── Fig 1: strip plot ─────────────────────────────────────────
{
  const W = 760, H = 520, ML = 208, MR = 24, MT = 64, MB = 46;
  const px = v => ML + v * (W - ML - MR);
  const order = analysis.ranking_by_obj.map(r => r.persona_id);
  const rowH = (H - MT - MB) / order.length;
  const py = i => MT + rowH * (i + 0.5);
  const strataKo = {
    high_N_low_A: '분노 투사', high_N_high_A: '죄책감 과잉', low_N_low_E: '해리·거리두기',
    high_O_high_N: '상징·영적 해석', low_O_high_C: '분석적 관찰자', high_E_high_A: '공감적 경청자',
    high_O_high_A_high_N: '공감 과부하', low_A_low_C: '냉소적 해체자', high_C_high_N: '통제 욕구',
    high_O_low_N: '수용적 탐구자', low_E_high_O: '내면 몽상가', high_N_low_C: '혼란 표류',
    mid_all: '대조군 1', mid_all_2: '대조군 2', extreme_low_N_high_E_A: '극단 낙관',
  };
  let s = '';
  // target band 0.45–0.65
  s += `<rect x="${px(0.45)}" y="${MT - 8}" width="${px(0.65) - px(0.45)}" height="${H - MT - MB + 16}" fill="${C.band}"/>`;
  s += `<text x="${(px(0.45) + px(0.65)) / 2}" y="${MT - 1}" text-anchor="middle" font-size="11" fill="${C.muted}">인간 기대 평균 대역 0.45–0.65</text>`;
  // gridlines
  for (const v of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    s += `<line x1="${px(v)}" y1="${MT - 8}" x2="${px(v)}" y2="${H - MB + 8}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${px(v)}" y="${H - MB + 24}" text-anchor="middle" font-size="11" fill="${C.muted}" font-variant-numeric="tabular-nums">${v.toFixed(1)}</text>`;
  }
  // rows
  order.forEach((pid, i) => {
    const st = analysis.persona_stats.find(p => p.persona_id === pid);
    const pts = plays.filter(p => p.persona_id === pid);
    const y = py(i);
    s += `<text x="${ML - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="${C.ink2}">${esc(pid)} ${esc(strataKo[st.strata] || st.strata)}</text>`;
    for (const p of pts) {
      const jit = ((p.scene_order * 7 + p.visit * 13) % 9 - 4) * (rowH / 16);
      s += `<circle cx="${px(p.objective)}" cy="${y + jit}" r="4" fill="${C.series}" fill-opacity="0.55" stroke="${C.surface}" stroke-width="2"/>`;
    }
    // mean tick (ink chrome, not a series color)
    s += `<line x1="${px(st.obj_mean)}" y1="${y - rowH * 0.34}" x2="${px(st.obj_mean)}" y2="${y + rowH * 0.34}" stroke="${C.ink}" stroke-width="2"/>`;
  });
  // annotations
  const p08y = py(order.indexOf('p08')), p15y = py(order.indexOf('p15'));
  s += `<text x="${px(0.30)}" y="${p08y - 12}" font-size="11" fill="${C.ink2}">유일한 낮은 꼬리 (평균 0.638)</text>`;
  s += `<text x="${px(0.30)}" y="${p15y - 12}" font-size="11" fill="${C.ink2}">"공감 실패" 연기 실패 — 중위권</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'>
<rect width="${W}" height="${H}" fill="${C.surface}"/>
<text x="16" y="26" font-size="15" font-weight="600" fill="${C.ink}">그림 1. 페르소나별 직접 계산 정렬도 — 전원이 인간 기대 대역 오른쪽 (과공명)</text>
<text x="16" y="44" font-size="12" fill="${C.ink2}">점 = 플레이 1판 (코사인, n=193) · 검은 눈금 = 페르소나 평균 · 평균 내림차순</text>
${s}
<text x="${(ML + W - MR) / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="${C.ink2}">직접 계산 정렬도 = cos(페르소나 감정분포, 원본 감정분포)</text>
</svg>`;
  fs.writeFileSync(path.join(OUT, 'fig1_strip_obj_alignment-260705.svg'), svg);
}

// ── Fig 2: self-report quantization histogram ─────────────────
{
  const W = 760, H = 400, ML = 56, MR = 24, MT = 64, MB = 64;
  const counts = {};
  for (const p of plays) { const k = p.alignment.toFixed(2); counts[k] = (counts[k] || 0) + 1; }
  const vals = Object.keys(counts).sort((a, b) => +a - +b);
  const maxN = Math.max(...Object.values(counts));
  const px = v => ML + (v - 0.35) / (0.9 - 0.35) * (W - ML - MR);
  const py = n => H - MB - n / maxN * (H - MT - MB);
  const barW = Math.max(4, (px(0.36) - px(0.35)) - 2);
  const top3 = new Set(['0.72', '0.62', '0.52']);
  let s = '';
  for (const n of [0, 20, 40, 60]) {
    s += `<line x1="${ML}" y1="${py(n)}" x2="${W - MR}" y2="${py(n)}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${ML - 8}" y="${py(n) + 4}" text-anchor="end" font-size="11" fill="${C.muted}" font-variant-numeric="tabular-nums">${n}</text>`;
  }
  for (const v of vals) {
    const x = px(+v) - barW / 2, n = counts[v];
    s += `<rect x="${x}" y="${py(n)}" width="${barW}" height="${H - MB - py(n)}" rx="3" fill="${C.series}"/>`;
    if (top3.has(v)) {
      s += `<text x="${px(+v)}" y="${py(n) - 20}" text-anchor="middle" font-size="12" font-weight="600" fill="${C.ink}">${esc(v)}</text>`;
      s += `<text x="${px(+v)}" y="${py(n) - 6}" text-anchor="middle" font-size="11" fill="${C.ink2}">${(counts[v] / plays.length * 100).toFixed(1)}%</text>`;
    }
  }
  s += `<line x1="${ML}" y1="${H - MB}" x2="${W - MR}" y2="${H - MB}" stroke="${C.baseline}" stroke-width="1"/>`;
  for (const v of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    s += `<text x="${px(v)}" y="${H - MB + 20}" text-anchor="middle" font-size="11" fill="${C.muted}" font-variant-numeric="tabular-nums">${v.toFixed(1)}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'>
<rect width="${W}" height="${H}" fill="${C.surface}"/>
<text x="16" y="26" font-size="15" font-weight="600" fill="${C.ink}">그림 2. LLM 자기보고 정렬도의 양자화 — 세 값에 71.0% 집중</text>
<text x="16" y="44" font-size="12" fill="${C.ink2}">보고된 값별 빈도 (n=193) · 실효 범위 0.42–0.82로 압축 · 연속 측정도구로 부적격</text>
${s}
<text x="${(ML + W - MR) / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="${C.ink2}">LLM 자기보고 정렬도 값</text>
</svg>`;
  fs.writeFileSync(path.join(OUT, 'fig2_selfreport_quantization-260705.svg'), svg);
}

console.log('[6/fig] ✓ 2 figures →', OUT);
