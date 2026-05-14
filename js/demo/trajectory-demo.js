// trajectory-demo.js — 시연용 격리 페이지 (V2-11)
//
// admin Canvas의 sim 로직과 의도적으로 격리됨.
// admin-trajectory.js import 안 함. 별이엔진 + sceneNavigator만 import.
//
// 화면 구성:
//   상단 헤더 = 메모리 / 관객 A 프리셋 / 관객 B 프리셋 / 자동 재생 토글
//   메인 = SVG 풀스크린 (감정 좌표 평면 = strata 코디)
//   오버레이 = 큰 패턴 라벨 (중앙 상단), readout (좌하단), 범례 (우하단)

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { byeoriEngine } from '../core/ByeoriEngine.js';
import { sceneNavigator } from '../core/SceneNavigator.js';

// ─── VAD 투영 (admin-trajectory.js와 동일 테이블) ──────────
const VAD_FULL = {
    fear: { v: -0.9, a: 0.9 }, sadness: { v: -0.8, a: -0.4 }, anger: { v: -0.7, a: 0.8 },
    guilt: { v: -0.8, a: 0.2 }, shame: { v: -0.9, a: -0.2 }, isolation: { v: -0.7, a: -0.5 },
    numbness: { v: -0.6, a: -0.8 }, longing: { v: -0.3, a: 0.2 }, resentment: { v: -0.5, a: 0.6 },
    resignation: { v: -0.4, a: -0.6 }, joy: { v: 0.9, a: 0.6 }, hope: { v: 0.7, a: 0.4 },
    relief: { v: 0.6, a: -0.3 }, gratitude: { v: 0.8, a: -0.2 }, love: { v: 1.0, a: 0.5 },
    peace: { v: 0.8, a: -0.6 }, confusion: { v: -0.4, a: 0.3 },
};

function projectToVAD(emoVec) {
    let V = 0, A = 0, wSum = 0;
    for (const k in emoVec) {
        const w = Number(emoVec[k] || 0);
        const m = VAD_FULL[k];
        if (!w || !m) continue;
        V += w * m.v; A += w * m.a; wSum += w;
    }
    if (wSum <= 0) return { v: 0, a: 0 };
    return { v: Math.max(-1, Math.min(1, V / wSum)), a: Math.max(-1, Math.min(1, A / wSum)) };
}

// ─── 프리셋 / 색 / 패턴 메타 ──────────────────────────────
const SIM_PRESETS = {
    echo_seeker: { label: '공명 추구', vec: { longing: 0.8, sadness: 0.5, joy: 0.2 } },
    grief:       { label: '애도',       vec: { sadness: 0.8, longing: 0.4, guilt: 0.2 } },
    anger_avoid: { label: '분노 회피',  vec: { anger: 0.7, fear: 0.4, sadness: 0.2 } },
    numb:        { label: '무감',       vec: { fear: 0.1, sadness: 0.1, anger: 0.1, joy: 0.1, longing: 0.1, guilt: 0.1 } },
    guilt:       { label: '죄책',       vec: { guilt: 0.8, fear: 0.4, sadness: 0.3 } },
    joyful:      { label: '치유 지향',  vec: { joy: 0.7, longing: 0.4, sadness: 0.1 } },
};

const SIM_COLORS = { A: '#c4a882', B: '#6aa383' };

const PATTERN_META = {
    echo_follow:   { color: '#c4a882', label: 'echo_follow',   desc: '원본을 따라간다 — 중심이 원본 쪽으로 0.7 이동' },
    bridge:        { color: '#6aa383', label: 'bridge',        desc: '균형점에 머문다 — 중심이 0.5 : 0.5' },
    displacement: { color: '#a88aa3', label: 'displacement',  desc: '같은 감정축, 귀인 대상이 이동한다' },
    contradiction: { color: '#c97a6a', label: 'contradiction', desc: '현재 감정의 정반대로 중심이 튀어나간다' },
    avoidance:     { color: '#7c7466', label: 'avoidance',     desc: '회피 — void/neutral 영역으로' },
    fixation:      { color: '#9d8a4a', label: 'fixation',      desc: '고착 — 현재 씬 근처에 잠긴다' },
};

// ─── 상태 ──────────────────────────────────────────────────
const state = {
    memories: [],     // 메모리 목록
    memory: null,     // 선택된 메모리
    scenes: [],       // 선택된 메모리의 씬 (scene_order asc)
    runners: { A: null, B: null },
    active: false,
    autoPlay: false,
    autoTimer: null,
    autoInterval: 1800,
};

// ─── DOM ───────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const svgNs = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(svgNs, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function showToast(msg) {
    const t = $('demoToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
}

// ─── 씬 헬퍼 ───────────────────────────────────────────────
// 일부 옛 row 는 jsonb 가 아니라 JSON 문자열로 박혀 있음 — 파싱 박음
function parseVec(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    return raw;
}

function sceneEmotionVec(scene) {
    const raw = scene?.original_emotion || scene?.originalVector || scene?.emotion_dist || scene?.emotion_vector;
    const v = parseVec(raw);
    if (Object.keys(v).length === 0) return {};
    // 모든 값이 0 이면 다음 fallback 으로
    const hasNonZero = Object.values(v).some(x => Number(x) > 0);
    if (!hasNonZero) {
        const alt = parseVec(scene?.emotion_dist) || parseVec(scene?.emotion_vector);
        if (alt && Object.values(alt).some(x => Number(x) > 0)) return alt;
    }
    return v;
}

function sceneReason(scene) {
    return parseVec(scene?.original_reason_vector || scene?.originalReasonVector);
}

function pickStartIdx(emotion) {
    if (!state.scenes.length) return -1;
    const entries = state.memory?.meta?.emotion_entries || {};
    if (entries && Object.keys(entries).length) {
        const top = Object.entries(emotion || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
        const topKey = top && top[1] > 0 ? top[0] : null;
        const entryCode = topKey ? entries[topKey] : null;
        if (entryCode) {
            const idx = state.scenes.findIndex(s => (s.meta?.scene_code || String(s.scene_order)) === entryCode);
            if (idx >= 0) return idx;
        }
    }
    return 0;
}

function sceneCode(s) {
    if (!s) return '?';
    return s.meta?.scene_code || String(s.scene_order ?? '?');
}

// ─── runner ────────────────────────────────────────────────
function mkRunner(label, emotion) {
    return {
        label,
        emotion,
        currentIdx: pickStartIdx(emotion),
        visited: [],
        userTraj: [],
        origTraj: [],
        sceneScores: [],
        candidateIdx: null,
        candidateIsFallback: false,
        fallbackNarrative: null,
        lastResult: null,
        done: false,
    };
}

function computeRunnerStep(r) {
    if (!r || r.currentIdx < 0 || r.currentIdx >= state.scenes.length) {
        r.done = true;
        return;
    }
    const scene = state.scenes[r.currentIdx];
    const origEmo = sceneEmotionVec(scene);
    const origReason = sceneReason(scene);

    const engineResult = byeoriEngine.calculateStep({
        userVector: { base: r.emotion },
        originalVector: { base: origEmo, reason_analysis: origReason },
        userTrajectory: r.userTraj,
        originalTrajectory: r.origTraj,
        sceneScores: r.sceneScores,
    }, {});
    r.lastResult = engineResult;

    const navResult = sceneNavigator.navigate({
        scenes: state.scenes,
        currentSceneIndex: r.currentIdx,
        visitedScenes: r.visited,
        transitionPattern: engineResult.transition_pattern,
        userEmotion: r.emotion,
        originalEmotion: origEmo,
        playerState: { userEmotion: r.emotion, visitedScenes: r.visited },
    });
    if (navResult) {
        r.candidateIdx = navResult.index;
        r.candidateIsFallback = !!navResult.isFallback;
        r.fallbackNarrative = navResult.fallbackNarrative || null;
    } else {
        r.candidateIdx = null;
        r.candidateIsFallback = false;
        r.fallbackNarrative = null;
        r.done = true;
    }
}

// ─── sim lifecycle ─────────────────────────────────────────
function startSim() {
    const presetA = SIM_PRESETS[$('presetA').value] || SIM_PRESETS.echo_seeker;
    const presetB = SIM_PRESETS[$('presetB').value] || SIM_PRESETS.grief;

    state.runners.A = mkRunner('A', { ...presetA.vec });
    state.runners.B = mkRunner('B', { ...presetB.vec });
    state.runners.A.visited = [state.runners.A.currentIdx];
    state.runners.B.visited = [state.runners.B.currentIdx];

    computeRunnerStep(state.runners.A);
    computeRunnerStep(state.runners.B);

    state.active = true;

    $('aPresetLabel').textContent = presetA.label;
    $('bPresetLabel').textContent = presetB.label;
    $('demoReadout').style.display = 'block';
    $('demoEmpty').style.display = 'none';

    draw();
}

function stepSim() {
    if (!state.active) {
        startSim();
        return;
    }
    let advanced = false;
    ['A', 'B'].forEach(k => {
        const r = state.runners[k];
        if (!r || r.done) return;
        if (r.candidateIdx == null) { r.done = true; return; }

        const prevScene = state.scenes[r.currentIdx];
        if (prevScene) {
            r.userTraj.push(r.emotion);
            r.origTraj.push(sceneEmotionVec(prevScene));
            if (r.lastResult) r.sceneScores.push(r.lastResult.current_scene_score);
        }
        r.currentIdx = r.candidateIdx;
        r.visited.push(r.currentIdx);
        computeRunnerStep(r);
        advanced = true;
    });

    if (!advanced) {
        showToast('두 관객 모두 끝까지 도달함');
        if (state.autoPlay) toggleAutoPlay();
    }
    draw();
}

function resetSim() {
    state.runners.A = null;
    state.runners.B = null;
    state.active = false;
    if (state.autoPlay) toggleAutoPlay();
    $('demoReadout').style.display = 'none';
    $('patternOverlay').style.display = 'none';
    if (state.memory) {
        $('demoEmpty').style.display = 'none';
        draw();
    } else {
        $('demoEmpty').style.display = 'block';
        const svg = $('stageSvg');
        if (svg) svg.innerHTML = '';
    }
}

function toggleAutoPlay() {
    state.autoPlay = !state.autoPlay;
    const btn = $('btnAutoPlay');
    if (state.autoPlay) {
        btn.classList.add('is-active');
        btn.textContent = '⏸ 일시정지';
        if (!state.active) startSim();
        state.autoInterval = parseInt($('autoSpeed').value, 10) || 1800;
        state.autoTimer = setInterval(() => stepSim(), state.autoInterval);
    } else {
        btn.classList.remove('is-active');
        btn.textContent = '▶▶ 자동 재생';
        if (state.autoTimer) {
            clearInterval(state.autoTimer);
            state.autoTimer = null;
        }
    }
}

// ─── 그리기 ────────────────────────────────────────────────
function draw() {
    const svg = $('stageSvg');
    if (!svg) return;

    const w = svg.clientWidth;
    const h = svg.clientHeight;
    svg.innerHTML = '';

    // 좌표 변환: (v, a) ∈ [-1, 1] → 화면 픽셀
    const padX = 80;
    const padY = 100;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    const cx = padX + innerW / 2;
    const cy = padY + innerH / 2;
    const toPx = (v, a) => ({
        x: cx + v * (innerW / 2),
        y: cy - a * (innerH / 2),     // y축 뒤집기 (arousal 위쪽이 +)
    });

    // 축 라인
    svg.appendChild(svgEl('line', {
        x1: padX, y1: cy, x2: w - padX, y2: cy,
        stroke: 'rgba(196,168,130,0.08)', 'stroke-width': 1,
    }));
    svg.appendChild(svgEl('line', {
        x1: cx, y1: padY, x2: cx, y2: h - padY,
        stroke: 'rgba(196,168,130,0.08)', 'stroke-width': 1,
    }));

    // 축 라벨
    const lblL = svgEl('text', { x: padX - 8, y: cy + 4, 'text-anchor': 'end', class: 'axis-label' });
    lblL.textContent = '— valence';
    svg.appendChild(lblL);
    const lblR = svgEl('text', { x: w - padX + 8, y: cy + 4, class: 'axis-label' });
    lblR.textContent = 'valence +';
    svg.appendChild(lblR);
    const lblU = svgEl('text', { x: cx, y: padY - 8, 'text-anchor': 'middle', class: 'axis-label' });
    lblU.textContent = 'arousal +';
    svg.appendChild(lblU);
    const lblD = svgEl('text', { x: cx, y: h - padY + 18, 'text-anchor': 'middle', class: 'axis-label' });
    lblD.textContent = '— arousal';
    svg.appendChild(lblD);

    // 씬 핀 (VAD 좌표 위)
    state.scenes.forEach((s, i) => {
        const emo = sceneEmotionVec(s);
        const { v, a } = projectToVAD(emo);
        const { x, y } = toPx(v, a);
        const g = svgEl('g', { 'data-scene-idx': String(i) });
        // 점
        g.appendChild(svgEl('circle', {
            cx: x, cy: y, r: 6,
            fill: 'rgba(196,168,130,0.18)',
            stroke: 'rgba(196,168,130,0.5)',
            'stroke-width': 1,
        }));
        // 라벨
        const t = svgEl('text', {
            x: x + 10, y: y + 4,
            fill: '#7c7466', 'font-size': 9,
            'font-family': 'Cormorant Garamond, serif',
            'font-style': 'italic',
        });
        t.textContent = sceneCode(s);
        g.appendChild(t);
        svg.appendChild(g);
    });

    // 두 runner의 궤적 + 현재 + 후보
    ['A', 'B'].forEach((k, runnerIdx) => {
        const r = state.runners[k];
        if (!r) return;
        const color = SIM_COLORS[k];
        const offset = (runnerIdx - 0.5) * 6;     // 살짝 어긋나게

        // 방문 경로 (line)
        const pts = r.visited.map(i => {
            const s = state.scenes[i];
            if (!s) return null;
            const { v, a } = projectToVAD(sceneEmotionVec(s));
            return toPx(v, a);
        }).filter(Boolean);

        if (pts.length >= 2) {
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x + offset},${p.y + offset}`).join(' ');
            svg.appendChild(svgEl('path', {
                d, stroke: color, 'stroke-width': 2,
                'stroke-dasharray': '6,4',
                fill: 'none', opacity: 0.6,
            }));
        }

        // 현재 위치 — 큰 링
        const curScene = state.scenes[r.currentIdx];
        if (curScene) {
            const { v, a } = projectToVAD(sceneEmotionVec(curScene));
            const { x, y } = toPx(v, a);
            const patternColor = r.lastResult?.transition_pattern
                ? (PATTERN_META[r.lastResult.transition_pattern]?.color || color)
                : color;
            svg.appendChild(svgEl('circle', {
                cx: x + offset, cy: y + offset, r: 14,
                fill: 'none', stroke: patternColor, 'stroke-width': 3,
                opacity: 0.95,
            }));
            // 글로우
            svg.appendChild(svgEl('circle', {
                cx: x + offset, cy: y + offset, r: 24,
                fill: patternColor, opacity: 0.08,
            }));
            // 라벨 (A / B)
            const t = svgEl('text', {
                x: x + offset + 18, y: y + offset - 12,
                fill: color, 'font-size': 14,
                'font-family': 'Cormorant Garamond, serif',
                'font-style': 'italic', 'font-weight': 600,
            });
            t.textContent = k;
            svg.appendChild(t);
        }

        // 후보 위치 — 점선 링 + 화살표
        if (r.candidateIdx != null && r.candidateIdx !== r.currentIdx) {
            const candScene = state.scenes[r.candidateIdx];
            if (candScene && curScene) {
                const cur = projectToVAD(sceneEmotionVec(curScene));
                const cand = projectToVAD(sceneEmotionVec(candScene));
                const curPx = toPx(cur.v, cur.a);
                const candPx = toPx(cand.v, cand.a);
                svg.appendChild(svgEl('circle', {
                    cx: candPx.x + offset, cy: candPx.y + offset, r: 18,
                    fill: 'none', stroke: color, 'stroke-width': 1.5,
                    'stroke-dasharray': '4,4', opacity: 0.7,
                }));
                svg.appendChild(svgEl('line', {
                    x1: curPx.x + offset, y1: curPx.y + offset,
                    x2: candPx.x + offset, y2: candPx.y + offset,
                    stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3,3', opacity: 0.4,
                }));
            }
        }
    });

    // 패턴 라벨 오버레이 + readout 업데이트
    updateOverlay();
    updateReadout();
}

function updateOverlay() {
    const a = state.runners.A;
    const b = state.runners.B;
    if (!a && !b) {
        $('patternOverlay').style.display = 'none';
        return;
    }
    // A 우선 (없으면 B), 두 명 다 있으면 같이 표시
    const aPat = a?.lastResult?.transition_pattern;
    const bPat = b?.lastResult?.transition_pattern;

    if (!aPat && !bPat) {
        $('patternOverlay').style.display = 'none';
        return;
    }

    $('patternOverlay').style.display = 'block';

    // 두 runner 패턴이 같으면 큰 라벨 한 줄, 다르면 A → B 형태
    if (aPat && bPat && aPat === bPat) {
        const meta = PATTERN_META[aPat] || { label: aPat, desc: '' };
        $('patternLabel').textContent = meta.label;
        $('patternDesc').textContent = meta.desc;
        $('patternPair').textContent = '두 관객 모두 같은 결';
    } else {
        const aLabel = aPat ? (PATTERN_META[aPat]?.label || aPat) : '—';
        const bLabel = bPat ? (PATTERN_META[bPat]?.label || bPat) : '—';
        $('patternLabel').textContent = `${aLabel} · ${bLabel}`;
        const aDesc = aPat ? PATTERN_META[aPat]?.desc : '';
        const bDesc = bPat ? PATTERN_META[bPat]?.desc : '';
        $('patternDesc').textContent = aPat && bPat && aDesc !== bDesc
            ? '두 관객의 결이 갈라진다'
            : (aDesc || bDesc || '');
        $('patternPair').textContent = `A: ${aLabel}   ↔   B: ${bLabel}`;
    }
}

function updateReadout() {
    ['A', 'B'].forEach(k => {
        const r = state.runners[k];
        const el = $(k === 'A' ? 'aStatLine' : 'bStatLine');
        if (!r) {
            el.textContent = '대기 중';
            return;
        }
        const res = r.lastResult || {};
        const dbg = res.debug || {};
        const fmt = (x) => (x == null ? '—' : Number(x).toFixed(2));
        const curCode = sceneCode(state.scenes[r.currentIdx]);
        const candCode = r.candidateIdx != null
            ? sceneCode(state.scenes[r.candidateIdx])
            : (r.done ? '종료' : '—');
        const fbTag = r.candidateIsFallback ? ' <span style="color:#c97a6a">(fallback)</span>' : '';
        el.innerHTML = `
            <div>씬 <b>${curCode}</b> → <b>${candCode}</b>${fbTag}</div>
            <div>pattern <b>${res.transition_pattern || '—'}</b> · bucket ${res.alignment_bucket || '—'}</div>
            <div>align <b>${fmt(res.alignment_score)}</b> · level ${fmt(dbg.level)} · shape ${fmt(dbg.shape)}</div>
        `;
    });
}

// ─── 데이터 로드 ───────────────────────────────────────────
async function loadMemoryList() {
    const sel = $('memorySelect');
    try {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Supabase 클라이언트 없음');
        const { data, error } = await sb.from('memories')
            .select('id, code, title, meta, status')
            .order('created_at', { ascending: false })
            .limit(40);
        if (error) throw error;
        state.memories = data || [];
        const withMeta = state.memories.filter(m => m.meta?.emotion_entries);
        const ordered = [...withMeta, ...state.memories.filter(m => !m.meta?.emotion_entries)];
        sel.innerHTML = '<option value="">— 메모리 선택 —</option>'
            + ordered.map(m => `<option value="${m.id}">${escapeHtml(m.code || '?')} — ${escapeHtml(m.title || '제목 없음')}</option>`).join('');
    } catch (e) {
        console.error('[demo] 메모리 목록 로드 실패:', e);
        sel.innerHTML = '<option value="">— 로드 실패 —</option>';
        showToast('메모리 목록 로드 실패: ' + e.message);
    }
}

async function selectMemory(memoryId) {
    if (!memoryId) {
        state.memory = null;
        state.scenes = [];
        resetSim();
        return;
    }
    try {
        const sb = getSupabaseClient();
        const { data: mem, error: e1 } = await sb.from('memories').select('*').eq('id', memoryId).single();
        if (e1) throw e1;
        const { data: scenes, error: e2 } = await sb.from('scenes')
            .select('*').eq('memory_id', memoryId).order('scene_order', { ascending: true });
        if (e2) throw e2;
        state.memory = mem;
        state.scenes = scenes || [];
        if (state.scenes.length === 0) {
            showToast('이 메모리에는 씬이 없음');
            state.memory = null;
            return;
        }
        resetSim();
        startSim();
    } catch (e) {
        console.error('[demo] 메모리 로드 실패:', e);
        showToast('메모리 로드 실패: ' + e.message);
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// ─── 이벤트 바인딩 ─────────────────────────────────────────
function bindEvents() {
    $('memorySelect').addEventListener('change', (e) => selectMemory(e.target.value));
    $('presetA').addEventListener('change', () => {
        if (state.active) { resetSim(); startSim(); }
    });
    $('presetB').addEventListener('change', () => {
        if (state.active) { resetSim(); startSim(); }
    });
    $('btnReset').addEventListener('click', () => {
        if (state.memory) { resetSim(); startSim(); }
        else resetSim();
    });
    $('btnStep').addEventListener('click', () => stepSim());
    $('btnAutoPlay').addEventListener('click', () => toggleAutoPlay());
    $('autoSpeed').addEventListener('change', () => {
        if (state.autoPlay && state.autoTimer) {
            clearInterval(state.autoTimer);
            state.autoInterval = parseInt($('autoSpeed').value, 10) || 1800;
            state.autoTimer = setInterval(() => stepSim(), state.autoInterval);
        }
    });
    window.addEventListener('resize', () => { if (state.memory) draw(); });
}

// ─── 부트 ──────────────────────────────────────────────────
async function boot() {
    bindEvents();
    // Supabase 클라이언트 init 대기
    let tries = 0;
    while (!getSupabaseClient() && tries < 30) {
        await new Promise(r => setTimeout(r, 200));
        tries++;
    }
    if (!getSupabaseClient()) {
        showToast('Supabase 연결 실패');
        return;
    }
    await loadMemoryList();
}

boot();

// 디버그 핸들
if (typeof window !== 'undefined') {
    window.__demoTrajectory = { state, stepSim, resetSim, startSim, toggleAutoPlay };
}
