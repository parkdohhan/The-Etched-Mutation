// Archive Entry (floating sentences) — extracted from test/demo2.html
// 목적: index.html의 Archive 진입을 "기억 선택 → play-test"로 단순화

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';

let _raf = null;
let _mountedEl = null;
let _items = [];
let _words = [];

function noise(x, y, z) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function getHardcodedFallbackMemories() {
  return [
    { id: 'e001', code: 'E-001', title: 'The Jacket on the Chair', completed_sentence: 'The jacket on the chair was the last thing he left behind.' },
    { id: 'e002', code: 'E-002', title: 'The Voicemail I Kept', completed_sentence: 'Her voice on the voicemail is all I have left.' },
    { id: 'e003', code: 'E-003', title: 'What I Said at the Funeral', completed_sentence: 'I tried to make his funeral funny. His mother didn\'t laugh.' },
  ];
}

function memoriesFromMemoriesJs() {
  const raw = window.memoriesData;
  if (!raw || !raw.length) return null;
  return raw.map((m) => ({
    id: m.id,
    code: m.code || '',
    title: m.title || '',
    completed_sentence: (m.completed_sentence && String(m.completed_sentence).trim()) || m.title || '',
  }));
}

function fetchMemoriesFromSupabaseREST() {
  const url = `${SUPABASE_URL}/rest/v1/memories?select=id,completed_sentence,title,code&order=id.asc`;
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  }).then((res) => {
    if (!res.ok) throw new Error(`memories REST ${res.status}`);
    return res.json();
  });
}

function normalizeRows(rows) {
  return (rows || [])
    .filter((r) => r && r.id)
    .map((r) => {
      const sentence =
        (r.completed_sentence && String(r.completed_sentence).trim()) ||
        (r.title && String(r.title).trim()) ||
        '—';
      return {
        id: r.id,
        code: r.code || '',
        title: r.title || '',
        text: sentence,
        completed_sentence: sentence,
      };
    });
}

/** Supabase → 실패 시 data/memories.js → 최소 하드코딩 */
export function getArchiveMemories() {
  if (window.__temArchiveMemoriesPromise) return window.__temArchiveMemoriesPromise;
  window.__temArchiveMemoriesPromise = fetchMemoriesFromSupabaseREST()
    .then((data) => {
      const arr = Array.isArray(data) ? normalizeRows(data) : [];
      if (arr.length) return arr;
      throw new Error('empty memories from Supabase');
    })
    .catch((err) => {
      console.warn('[ArchiveEntry] Supabase fetch failed; using memories.js / hardcoded fallback', err);
      const fb = memoriesFromMemoriesJs();
      if (fb && fb.length) return normalizeRows(fb);
      return normalizeRows(getHardcodedFallbackMemories());
    });
  return window.__temArchiveMemoriesPromise;
}

/** 뷰포트 비율을 반영한 그리드 + 노이즈 지터 (개수 n에 맞춤) */
export function layoutFloatingPositions(n) {
  if (n <= 0) return [];
  const margin = 0.07;
  const lo = margin;
  const hi = 1 - margin;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const aspect = w / Math.max(h, 1);
  let cols = Math.max(1, Math.round(Math.sqrt(n * aspect)));
  if (cols > n) cols = n;
  const rows = Math.ceil(n / cols);
  const cellW = (hi - lo) / cols;
  const cellH = (hi - lo) / rows;
  const out = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = lo + (col + 0.5) * cellW;
    const y = lo + (row + 0.5) * cellH;
    const jx = (noise(i * 0.73, 1.1, 0) - 0.5) * cellW * 0.4;
    const jy = (noise(i * 0.41, 2.2, 0) - 0.5) * cellH * 0.4;
    out.push({
      x: Math.max(lo + 0.02, Math.min(hi - 0.02, x + jx)),
      y: Math.max(lo + 0.02, Math.min(hi - 0.02, y + jy)),
    });
  }
  return out;
}

export function detectArchiveLang(m) {
  const s = (m?.title || '') + (m?.completed_sentence || '') + (m?.text || '');
  return /[가-힣]/.test(s) ? 'ko' : 'en';
}

function isLocalDev() {
  try {
    if (location.protocol === 'file:') return true;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || (typeof h === 'string' && h.endsWith('.local'));
  } catch (_) {
    return false;
  }
}

function navigateToPlay(memoryId, lang) {
  const l = lang === 'ko' ? 'ko' : 'en';
  const isLocal = isLocalDev() || !String(window.location.hostname || '').includes('vercel');
  const base = isLocal ? 'play-test.html' : '/play';
  try {
    // URL 전달 실패(리라이트/프록시/링크 가공) 대비 이중 백업
    sessionStorage.setItem('demoMemoryId', String(memoryId || ''));
    sessionStorage.setItem('tem_archive_memory_id', String(memoryId || ''));
    sessionStorage.setItem('tem_archive_lang', l);
  } catch (_) {}
  window.location.href = `${base}?memory=${encodeURIComponent(memoryId)}&lang=${encodeURIComponent(l)}`;
}

function cleanup() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = null;
  _items = [];
  _words = [];
  if (_mountedEl) _mountedEl.innerHTML = '';
  _mountedEl = null;
}

function floatLoop() {
  let ft = 0;
  function tick() {
    ft += 0.02;
    for (let i = 0; i < _words.length; i++) {
      const w = _words[i];
      const freq = 0.3 + (w.vad?.a ? Math.abs(w.vad.a) : 0.1) * 0.8;
      const dy = Math.sin(ft + i * 1.7) * 8 * freq;
      const dx = Math.cos(ft * 0.7 + i * 2.1) * 3;
      w.el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    _raf = requestAnimationFrame(tick);
  }
  tick();
}

function buildMonologuesFromMemories(memories) {
  const pos = layoutFloatingPositions(memories.length);
  return memories.map((m, i) => {
    const p = pos[i] || { x: 0.5, y: 0.5 };
    return {
      id: m.id,
      code: m.code,
      title: m.title,
      text: m.text,
      completed_sentence: m.completed_sentence,
      vad: { v: -0.3, a: 0.1, d: -0.2 },
      x: p.x,
      y: p.y,
    };
  });
}

export async function initArchiveEntry(containerEl) {
  if (!containerEl) return;
  if (_mountedEl && _mountedEl !== containerEl) cleanup();

  _mountedEl = containerEl;
  containerEl.innerHTML = '';
  containerEl.setAttribute('data-tem-mounted', '1');

  const hint = document.createElement('div');
  hint.className = 'archive-entry-hint';
  hint.textContent = '[ Click a sentence to enter the memory ]';
  containerEl.appendChild(hint);

  _items = await getArchiveMemories();
  const monologues = buildMonologuesFromMemories(_items);

  const frag = document.createDocumentFragment();
  _words = monologues.map((m) => {
    const div = document.createElement('div');
    div.className = 'archive-entry-word';
    div.textContent = m.text;
    div.style.left = `${m.x * 100}%`;
    div.style.top = `${m.y * 100}%`;
    div.style.transform = 'translate(-50%, -50%)';
    div.addEventListener('click', () => {
      const lang = detectArchiveLang(m);
      navigateToPlay(m.id, lang);
    });
    frag.appendChild(div);
    return { ...m, el: div };
  });
  containerEl.appendChild(frag);

  floatLoop();

  // expose a tiny console helper for QA
  window.__archiveEntryDebug = {
    memories: () => getArchiveMemories().then((list) => {
      const rows = list.map((x) => ({ id: x.id, code: x.code, title: x.title }));
      console.table(rows);
      return rows;
    }),
    go: (idOrCode) => getArchiveMemories().then((list) => {
      const m = list.find((x) => x.id === idOrCode || x.code === idOrCode);
      if (!m) return console.warn('[ArchiveEntry] unknown id/code', idOrCode);
      navigateToPlay(m.id, detectArchiveLang(m));
      return true;
    }),
  };
}

export function destroyArchiveEntry() {
  cleanup();
}

