// js/app/recordPlay.js — RECORD v4 "기록은 첫 체험이고, 첫 유령의 탄생이다" (2026-09-09)
//
// 정본: docs/RECORD_v4_설계-260807.md (§4 흐름, §5 사양, §6 결정) + docs/RECORD_v4_구현-260909.md
//
// 화면 = 플레이 유령 대화의 껍데기(window.LumenDialogPhase1.shell — 자막 상자·타이핑·입력칸)를
// 그대로 빌려 쓴다. 회로는 이 파일이 새로 판다 (씬 없는 진입 모드). 상대 = "또다른 나".
//
//   문 → 또다른 나가 곁에 선다 → 관객이 말한다 (해석 없이 감각을 되묻는다, 침묵 허용)
//   → 매 턴: 안전(js/safety.js) → 17축 원시 측정 (화면엔 숫자 0) → dialog-turn-record
//   → "없어"/침묵/덮기 → 봉인어 한 마디 → 절단(tem_record_cuts, era 소강 경계)
//   → 3씬 미만이면 대화 연장 (두 번째 거절 = 완화 저장)
//   → record-seal (기억·씬·유령 씨앗 한 번에) → 첫 플레이 표식·후단 → 무대(play-test)로 진입
//
// 옛 화면(recordChat.js)은 지우지 않았다 — ?record_old=1 로 연다 (confession.js startBeginner).

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { DEFAULT_EMOTION_ANCHORS } from '../shared/math.js';
import { detectCrisis, getSafetyResources, resetSafetySession } from '../safety.js';
import { segmentTurns, segmentTurnsRelaxed, turnDeltas, RECORD_CUT_RULE } from '../shared/tem_record_cuts.js';
import { saveFirstPlayData } from './userIdentity.js';

export const RECORD_MOUNT_ID = 'temRecordPlay';
const SOFT_TURN_CAP = 12;      // 여기서 "이 정도면 됐어" — 더 말해도 됨
const HARD_TURN_CAP = 20;      // 여기서 봉인으로
const SEAL_BUTTON_AFTER = 4;   // 이 턴부터 '덮기' 버튼 노출
const MEASURE_WAIT_MS = 9000;  // 봉인 시 남은 측정을 기다리는 상한
const POST_SAVE_WAIT_MS = 4500;

const END_RX = {
  ko: /^(없어|없다|없음|없어요|여기까지(야|만|요)?|그만(할래|하자|할게)?|됐어|이제 됐어|다 말했어|끝(이야)?|이게 다야|이만)[.!…~ ]*$/,
  en: /^(that'?s all|nothing more|nothing else|enough|i'?m done|done|no more|that is all|that'?s it|stop)[.!… ]*$/i,
};

const L = {
  ko: {
    label: '또다른 나',
    open1: '……왔구나.',
    open2: '떠오르는 게 있어서 온 거지. 제일 먼저 떠오르는 게 뭐야?',
    placeholder: '여기에 이야기해……',
    voidBtn: '[ … ]', voidTitle: '말하고 싶지 않아',
    sealBtn: '덮기',
    silence: ['그래, 굳이 입 밖으로 낼 필요 없어.', '말하지 않아도, 우린 이미 아니까.', '……그냥, 빈칸으로 남겨두자.', '침묵도 대답이 될 수 있어.'],
    mid: ['……다른 방식으로 말해볼까.', '그 말은 지금 너무 무거워.'],
    crisis: ['……아냐, 이건 너무 날카로워.', '이 이상 파고들면, 내가 다쳐.', '숨이 막혀. 여기까지만 하자.', '지금은 덮어두는 게 좋겠어. 위험해.'],
    crisisLead: '누군가에게는, 솔직하게 말해도 괜찮아.',
    coverBtn: '덮어두기',
    endAck: '……그래.',
    offerSeal: '……그럼, 여기까지로 덮어둘까?', offerYes: '덮을게', offerNo: '조금 더',
    sealAsk: '……그럼. 이 기억을 덮을 한 마디만 남겨줘.', sealPlaceholder: '한 마디……',
    extend: '……아직 조금 흐릿해. 조금만 더 서 있어볼까.',
    softCap: '……이 정도면 됐어. 더 말해도 되고, 이제 덮어도 돼.',
    buried: '……묻었어. 이제, 들어가 봐.',
    saveFail: '……지금은 묻히지 않아. 잠시 뒤에 다시 덮어보자.',
    nothing: '……아무것도 남지 않았어. 문 앞으로 돌아가자.',
    fallbackQ: ['그때, 무슨 소리가 났어?', '거기 냄새가 기억나?', '몇 시쯤이었어?', '네 옆엔 누가 있었어?', '그 자리에서 뭘 보고 있었어?', '손에 뭘 쥐고 있었어?'],
    back: '← 문으로',
  },
  en: {
    label: 'another me',
    open1: '......You came.',
    open2: 'Something brought you here. What comes up first?',
    placeholder: 'Tell me here......',
    voidBtn: '[ … ]', voidTitle: "I don't want to say",
    sealBtn: 'Cover it',
    silence: ['Right. No need to say it out loud.', 'Even without words, we already know.', "......Let's just leave it blank.", 'Silence can be an answer too.'],
    mid: ["......Let's try a different way.", 'Those words carry too much weight right now.'],
    crisis: ['......No. This is too sharp.', "If I dig any deeper, I'll get hurt.", "I can't breathe. Let's stop here.", "Better to leave this covered for now. It's dangerous."],
    crisisLead: "It's okay to speak honestly to someone.",
    coverBtn: 'Leave it covered',
    endAck: '......Alright.',
    offerSeal: '......Then, shall we cover it here?', offerYes: 'Cover it', offerNo: 'A little more',
    sealAsk: '......Then. Leave one word to cover this memory.', sealPlaceholder: 'one word......',
    extend: '......It is still a little blurred. Let us stand here a moment longer.',
    softCap: '......This is enough. You can go on, or cover it now.',
    buried: '......It is buried. Now, go in.',
    saveFail: '......It will not settle right now. Let us try to cover it again in a moment.',
    nothing: '......Nothing stayed. Let us go back to the door.',
    fallbackQ: ['What sound was there, that moment?', 'Do you remember the smell of that place?', 'About what time was it?', 'Who was beside you?', 'What were you looking at, right there?', 'What was in your hand?'],
    back: '← to the door',
  },
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function isEndPhrase(text, lang) {
  const t = String(text || '').trim().toLowerCase();
  return END_RX[lang].test(t) || END_RX.en.test(t) || END_RX.ko.test(t);
}
function playTestHref(memoryId, lang) {
  const h = location.hostname || '';
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(h) || h.endsWith('.local');
  const base = isLocal ? 'play-test.html' : '/play';
  return `${base}?memory=${encodeURIComponent(memoryId)}&lang=${encodeURIComponent(lang)}&born=1`;
}
function topKeys(vec, n = 4) {
  return Object.entries(vec || {}).filter(([, v]) => typeof v === 'number' && v > 0.15).sort(([, a], [, b]) => b - a).slice(0, n).map(([k]) => k);
}

/**
 * RECORD v4 진입점. 문(confessionHub) 뒤에서 confession.js startBeginner 가 부른다.
 * @param {{ lang?: 'ko'|'en', onCancel?: Function }} opts
 */
export async function startRecordPlay(opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'ko';
  const T = L[lang];
  const onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function () {};
  const shell = typeof window !== 'undefined' && window.LumenDialogPhase1 && window.LumenDialogPhase1.shell;
  if (!shell) {
    console.error('[record] LumenDialogPhase1.shell 없음 — index.html 에 js/ui/lumen_dialog_phase1.js 가 실려야 한다');
    onCancel();
    return;
  }
  try { sessionStorage.setItem('tem_lang', lang); } catch (_) {}
  try { document.documentElement.lang = lang; } catch (_) {}
  resetSafetySession();

  // ─── 무대 배경 (index.html 엔 지형이 없다 — 어두운 바닥 + 느린 숨) ───
  const backdrop = document.createElement('div');
  backdrop.id = RECORD_MOUNT_ID + '-backdrop';
  backdrop.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2790',
    'background:radial-gradient(ellipse at 50% 68%, rgba(52,40,64,0.55) 0%, rgba(8,6,12,0.97) 58%, #050408 100%)',
    'opacity:0', 'transition:opacity 1600ms ease',
  ].join(';');
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => { backdrop.style.opacity = '1'; });

  const overlay = shell.buildOverlay(RECORD_MOUNT_ID);
  overlay.style.paddingBottom = shell.isNarrow() ? '12vh' : '18vh';
  shell.resetChain();
  shell.setGhostLabel(T.label);

  // ← 문으로 (좌상단, 옛 화면의 rec-back 자리)
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.textContent = T.back;
  backBtn.style.cssText = [
    'position:fixed', 'top:22px', 'left:24px', 'z-index:2810',
    'background:none', 'border:none', 'cursor:pointer',
    'color:rgba(196,168,130,0.45)', 'font-family:"Cormorant Garamond",serif', 'font-size:0.95rem', 'letter-spacing:0.12em',
    'transition:color 500ms ease',
  ].join(';');
  backBtn.onmouseenter = () => { backBtn.style.color = 'rgba(228,204,164,0.9)'; };
  backBtn.onmouseleave = () => { backBtn.style.color = 'rgba(196,168,130,0.45)'; };
  overlay.appendChild(backBtn);

  const sb = getSupabaseClient();
  const S = {
    turns: [],        // 관객 턴 [{ text, isVoid, vector|null, reason|null, ts }]
    dialog: [],       // 전체 대화 [{ role, content }] — 또다른 나 포함 (서버 history + 증거)
    userTurns: 0,
    voidStreak: 0,
    sealAttempts: 0,
    pending: [],
    startedAt: new Date().toISOString(),
    cancelled: false,
    finished: false,
  };

  function teardown() {
    try { window.LumenDialogPhase1.cleanup({ mountId: RECORD_MOUNT_ID }); } catch (_) {}
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  }
  function cancel() {
    if (S.cancelled || S.finished) return;
    S.cancelled = true;
    console.info('[record] 취소 — 문으로 복귀 (턴 ' + S.userTurns + ')');
    teardown();
    onCancel();
  }
  backBtn.onclick = (e) => { e.stopPropagation(); cancel(); };

  const say = (text, who = 'ghost') => shell.playLine(overlay, text, who);
  const sayGhost = async (text) => { S.dialog.push({ role: 'assistant', content: text }); await say(text, 'ghost'); };

  function mkBtn(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.style.cssText = [
      'background:transparent', 'border:none', 'border-bottom:1px solid rgba(196,168,130,0.35)',
      'color:rgba(214,188,150,0.8)', 'font-family:inherit', 'font-size:0.98rem', 'cursor:pointer',
      'padding:6px 14px', 'border-radius:0', 'letter-spacing:0.04em',
    ].join(';');
    b.onmouseenter = () => { b.style.borderBottomColor = 'rgba(196,168,130,0.8)'; b.style.color = 'rgba(240,216,180,0.98)'; };
    b.onmouseleave = () => { b.style.borderBottomColor = 'rgba(196,168,130,0.35)'; b.style.color = 'rgba(214,188,150,0.8)'; };
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }

  /** 입력 차례 — 텍스트 / 침묵 / 덮기. 자막이 다 끝나야 입력칸이 뜬다 (껍데기 게이트). */
  function ask({ placeholder, allowVoid = true, showSeal = false } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (settled) return; settled = true; shell.clearInputArea(overlay); resolve(v); };
      shell.renderTextInput(overlay, { placeholder: placeholder || T.placeholder }, (v) => finish({ text: v }));
      shell.subtitleIdle().then(() => {
        setTimeout(() => {
          if (settled || S.cancelled) return;
          const area = overlay.querySelector('[id$="-input-area"]');
          if (!area || !area.isConnected) return;
          const row = document.createElement('div');
          row.className = 'rec-extra-row';
          row.style.cssText = 'display:flex;justify-content:center;gap:22px;margin-top:10px;opacity:0;transition:opacity 700ms ease;';
          if (allowVoid) row.appendChild(mkBtn(T.voidBtn, T.voidTitle, () => finish({ void: true })));
          if (showSeal) row.appendChild(mkBtn(T.sealBtn, '', () => finish({ seal: true })));
          if (row.childNodes.length) {
            area.appendChild(row);
            requestAnimationFrame(() => { row.style.opacity = '1'; });
          }
        }, 160);
      });
    });
  }

  /** 두 갈래 선택 (덮을게 / 조금 더) */
  function askChoice(yesLabel, noLabel) {
    return new Promise((resolve) => {
      shell.clearInputArea(overlay);
      shell.subtitleIdle().then(() => {
        if (S.cancelled) return;
        const area = overlay.querySelector('[id$="-input-area"]');
        if (!area) { resolve(false); return; }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:center;gap:26px;opacity:0;transition:opacity 600ms ease;';
        row.appendChild(mkBtn(yesLabel, '', () => { shell.clearInputArea(overlay); resolve(true); }));
        row.appendChild(mkBtn(noLabel, '', () => { shell.clearInputArea(overlay); resolve(false); }));
        area.appendChild(row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      });
    });
  }

  // ─── 17축 원시 측정 (뒤에서, 화면엔 아무 수치도 없음) ───
  function measure(turn) {
    if (!sb) return Promise.resolve(null);
    const p = sb.functions.invoke('claude-scene', {
      body: { type: 'emotion_analysis', emotion: turn.text, reason: turn.text, anchorEmotions: DEFAULT_EMOTION_ANCHORS, context: null },
    }).then((resp) => {
      if (!resp || resp.error) { console.warn('[record] 측정 실패', resp && resp.error); return null; }
      let base = resp.data && resp.data.analysis && resp.data.analysis.base;
      if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
      if (!base || typeof base !== 'object' || Array.isArray(base) || !Object.keys(base).length) return null;
      const vec = {};
      Object.keys(base).forEach((k) => { const n = Number(base[k]); if (Number.isFinite(n)) vec[k] = n; });
      turn.vector = vec;   // 원시값 그대로 (설계 §3-2)
      const ra = resp.data.reason_analysis;
      turn.reason = (ra && typeof ra === 'object' && !Array.isArray(ra)) ? ra : null;
      return vec;
    }).catch((e) => { console.warn('[record] 측정 예외', e); return null; });
    S.pending.push(p);
    return p;
  }

  /** 리듬 힌트 — 최근 두 측정의 델타 vs 지금까지의 평균 (엔진 리듬이 질문 결을 바꾼다. 이름은 안 나간다) */
  function rhythm() {
    const vs = S.turns.filter((t) => t.vector && !t.isVoid).map((t) => t.vector);
    if (vs.length < 2) return 'open';
    const d = turnDeltas(vs);
    const last = d[d.length - 1];
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    return last >= mean ? 'surge' : 'lull';
  }

  async function askAnotherMe(text) {
    const history = S.dialog.slice(-40);
    if (sb) {
      try {
        const resp = await sb.functions.invoke('dialog-turn-record', {
          body: { userInput: text, history, lang, rhythm: rhythm(), turn: S.userTurns },
        });
        const d = resp && resp.data;
        if (!resp.error && d && d.ok && d.reply) return String(d.reply);
        console.warn('[record] dialog-turn-record 폴백:', resp && (resp.error || (d && d.reason)));
      } catch (e) {
        console.warn('[record] dialog-turn-record 예외:', e);
      }
    }
    return pick(T.fallbackQ);
  }

  async function crisis(text) {
    console.info('[record] 위기 감지 — 또다른 나의 육성으로 덮음');
    const line = pick(T.crisis);
    await sayGhost(line);
    shell.clearInputArea(overlay);
    await shell.subtitleIdle();
    const area = overlay.querySelector('[id$="-input-area"]');
    if (!area) { cancel(); return; }
    const box = document.createElement('div');
    box.style.cssText = 'text-align:center;color:rgba(214,188,150,0.9);font-size:0.95rem;line-height:1.8;opacity:0;transition:opacity 900ms ease;';
    const res = getSafetyResources(lang);
    box.innerHTML = `<div style="margin-bottom:6px;opacity:0.8">${esc(T.crisisLead)}</div>` +
      res.map((r) => `<div><span style="opacity:0.7">${esc(r.name)}</span> <a href="${esc(r.action)}" style="color:rgba(240,216,180,0.98);text-decoration:none;margin-left:10px;letter-spacing:0.05em">${esc(r.number)}</a>${r.desc ? ` <small style="opacity:0.5">${esc(r.desc)}</small>` : ''}</div>`).join('');
    const btn = mkBtn(T.coverBtn, '', () => cancel());
    btn.style.marginTop = '16px';
    box.appendChild(btn);
    area.appendChild(box);
    requestAnimationFrame(() => { box.style.opacity = '1'; });
  }

  // ─── 대화 루프 ───
  async function talk() {
    while (!S.cancelled) {
      const showSeal = S.userTurns >= SEAL_BUTTON_AFTER;
      const input = await ask({ showSeal });
      if (S.cancelled) return 'cancel';
      if (input.seal) return 'seal';

      if (input.void) {
        S.voidStreak += 1;
        S.turns.push({ text: '[VOID]', isVoid: true, vector: null, reason: null, ts: new Date().toISOString() });
        S.dialog.push({ role: 'user', content: '[VOID]' });
        await sayGhost(pick(T.silence));
        if (S.voidStreak >= 2 && S.userTurns >= 2) {
          await sayGhost(T.offerSeal);
          const yes = await askChoice(T.offerYes, T.offerNo);
          if (S.cancelled) return 'cancel';
          if (yes) return 'seal';
          S.voidStreak = 0;
        }
        continue;
      }

      const text = String(input.text || '').trim();
      if (!text) continue;
      const safety = detectCrisis(text);
      if (safety.level === 'high') { await crisis(text); return 'crisis'; }
      if (isEndPhrase(text, lang)) {
        await say(text, 'player');
        S.dialog.push({ role: 'user', content: text });
        await sayGhost(T.endAck);
        return 'seal';
      }

      S.voidStreak = 0;
      S.userTurns += 1;
      const turn = { text, isVoid: false, vector: null, reason: null, ts: new Date().toISOString() };
      S.turns.push(turn);
      measure(turn);                       // 뒤에서 — 기다리지 않는다
      await say(text, 'player');           // 내 말이 무대 자막으로 한 번 지나간다
      if (safety.level === 'mid') await sayGhost(pick(T.mid));

      const loading = shell.showLoading(overlay);
      const reply = await askAnotherMe(text);
      loading.stop();
      if (S.cancelled) return 'cancel';
      S.dialog.push({ role: 'user', content: text });
      await sayGhost(reply);

      if (S.userTurns >= HARD_TURN_CAP) return 'seal';
      if (S.userTurns === SOFT_TURN_CAP) await sayGhost(T.softCap);
    }
    return 'cancel';
  }

  // ─── 봉인 ───
  async function seal() {
    S.sealAttempts += 1;
    await sayGhost(T.sealAsk);
    const w = await ask({ placeholder: T.sealPlaceholder, allowVoid: true, showSeal: false });
    if (S.cancelled) return 'cancel';
    const sealWord = w.void ? '……' : String(w.text || '').trim().slice(0, 80);
    if (!w.void) await say(sealWord, 'player');

    // 남은 측정 기다림 (상한)
    await Promise.race([Promise.allSettled(S.pending.slice()), sleep(MEASURE_WAIT_MS)]);
    if (S.cancelled) return 'cancel';

    let cut = segmentTurns(S.turns);
    if (cut.measuredCount === 0) {
      console.warn('[record] 측정된 턴 0 — 저장하지 않는다');
      await sayGhost(T.nothing);
      await sleep(600);
      cancel();
      return 'cancel';
    }
    if (cut.needMore) {
      if (S.sealAttempts < 2) {
        // 설계 §6-③: 3씬 미만 → 대화 연장. 두 번째 거절 시 완화 저장.
        console.info('[record] 절단 결과 ' + cut.segments.length + '씬 (측정 ' + cut.measuredCount + ') — 대화 연장');
        await sayGhost(T.extend);
        S.pendingSealWord = sealWord;
        return 'extend';
      }
      cut = segmentTurnsRelaxed(S.turns);
    }
    const finalSeal = sealWord || S.pendingSealWord || '……';
    console.info('[record] 절단: ' + cut.segments.length + '씬 / 규칙 ' + cut.method + ' / 경계 ' + JSON.stringify(cut.boundaries) + ' / 측정 ' + cut.measuredCount);

    // 오염 기준선(depth=1, alignment 1.0) — _autoCreateFirstPlay 와 같은 입력. anon 은 memories UPDATE 가
    // RLS 에 막히므로(42501) record-seal 이 service_role 로 함께 쓴다.
    let contamination = null;
    try {
      const { updateContamination, createEmptyState } = await import('../core/ContaminationTracker.js');
      contamination = updateContamination(createEmptyState(), {
        alignment: 1.0, level: 1.0, shape: 1.0, shape_active: false,
        transition_pattern: 'echo_follow', mismatch_type: 'none', fixation_level: 0,
        user_valence: 0, user_arousal: 0, user_dominance: 0,
      });
    } catch (e) { console.warn('[record] 오염 기준선 계산 실패 (건너뜀)', e); }

    const loading = shell.showLoading(overlay);
    const res = await callRecordSeal(cut, finalSeal, contamination);
    loading.stop();
    if (S.cancelled) return 'cancel';
    if (!res || !res.ok) {
      console.error('[record] record-seal 실패:', res);
      await sayGhost(T.saveFail);
      S.sealAttempts = 0; // 대화는 살아 있다 — 다시 덮을 수 있게
      return 'retry';
    }
    S.finished = true;
    console.info('[record] 저장 — memory ' + res.memoryId + ' (' + res.code + ') 씬 ' + (res.sceneIds || []).length + ' 씨앗 ' + res.seeds);
    await afterSave(res, cut, finalSeal);
    await sayGhost(T.buried);
    await sleep(900);
    overlay.style.transition = 'opacity 1200ms ease';
    overlay.style.opacity = '0';
    await sleep(1300);
    window.location.href = playTestHref(res.memoryId, lang);
    return 'done';
  }

  async function callRecordSeal(cut, sealWord, contamination) {
    if (!sb) return { ok: false, error: 'no supabase client' };
    try {
      const resp = await sb.functions.invoke('record-seal', {
        body: {
          lang,
          sealWord,
          contamination: contamination || null,
          turns: S.turns.map((t) => ({ text: t.text, isVoid: !!t.isVoid, vector: t.vector || null, reason: t.reason || null, ts: t.ts })),
          scenes: cut.segments.map((s) => ({ turnIndices: s.turnIndices, utterances: s.utterances, vector: s.vector, voidCount: s.voidCount })),
          cut: { rule: RECORD_CUT_RULE, method: cut.method, boundaries: cut.boundaries, deltas: cut.deltas, thresholds: cut.thresholds, measuredCount: cut.measuredCount },
          dialog: S.dialog.slice(0, 120),
          client: { startedAt: S.startedAt, endedAt: new Date().toISOString(), userAgent: navigator.userAgent.slice(0, 120) },
        },
      });
      if (resp.error) return { ok: false, error: resp.error.message || String(resp.error), data: resp.data };
      return resp.data || { ok: false, error: 'empty response' };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  async function afterSave(res, cut, sealWord) {
    const memoryId = res.memoryId;
    const memoryVec = averageVec(cut.segments.map((s) => s.vector));
    // 1) 첫 플레이 표식 — ARCHIVE '내가 박은 기억' + 봉인어 카드 + PLAY 풀 제외 (기록 = 첫 플레이)
    try {
      saveFirstPlayData(memoryId, {
        scenes: (res.sceneIds || []).map((id, i) => ({ sceneIndex: i, sceneId: id, userEmotion: (cut.segments[i] && cut.segments[i].vector) || {}, userReason: 'First telling' })),
        alignment_score: 1,
        alignment_bucket: 'HIGH',
        transition_pattern: 'echo_follow',
        completed_sentence: sealWord,
        source: 'record_v4',
      });
    } catch (e) { console.warn('[record] 첫 플레이 표식 실패', e); }
    // 2) 무대 진입 표식 (archive.js selectMemory 와 동일 자리)
    try {
      sessionStorage.setItem('demoMemoryId', String(memoryId));
      sessionStorage.setItem('tem_archive_memory_id', String(memoryId));
      sessionStorage.setItem('tem_archive_lang', lang);
      sessionStorage.removeItem('tem_replay');
    } catch (_) {}
    // 3) 기존 후단 (설계 §2 재사용): 첫 플레이 plays + 오염 depth=1, 사물 모델 주문, 잔상 수확 — 상한 시간만 기다린다
    const tasks = [];
    try {
      const conf = await import('./confession.js');
      if (typeof conf.autoCreateFirstPlay === 'function') tasks.push(conf.autoCreateFirstPlay(memoryId, { originalVector: { base: memoryVec } }, { skipContamination: true }));
      const hasObjects = Array.isArray(res.tags) && res.tags.some((t) => t && Array.isArray(t.objects) && t.objects.length);
      if (hasObjects && typeof conf.requestObjectModels === 'function') tasks.push(Promise.resolve(conf.requestObjectModels(memoryId, 'enqueue')));
    } catch (e) { console.warn('[record] 후단(confession) 로드 실패', e); }
    try {
      const { saveUtteranceCandidates } = await import('../lib/afterimage.js');
      tasks.push(saveUtteranceCandidates({ conversation: S.dialog, lang, memoryId, contributorId: null, emotionTags: topKeys(memoryVec), isPublic: false }));
    } catch (e) { console.warn('[record] 잔상 수확 로드 실패', e); }
    await Promise.race([Promise.allSettled(tasks), sleep(POST_SAVE_WAIT_MS)]);
  }

  function averageVec(list) {
    const out = {};
    const vs = (list || []).filter((v) => v && Object.keys(v).length);
    if (!vs.length) return out;
    const keys = new Set();
    vs.forEach((v) => Object.keys(v).forEach((k) => keys.add(k)));
    keys.forEach((k) => { let s = 0; vs.forEach((v) => { s += Number(v[k]) || 0; }); out[k] = s / vs.length; });
    return out;
  }

  // ─── 실행 ───
  try {
    await sleep(500);
    await sayGhost(T.open1);
    await sayGhost(T.open2);
    let outcome = await talk();
    while (!S.cancelled && (outcome === 'seal' || outcome === 'retry' || outcome === 'extend')) {
      if (outcome === 'seal') outcome = await seal();
      else outcome = await talk();   // retry / extend — 대화로 돌아간다
    }
    if (outcome === 'crisis') return; // 자원 카드가 떠 있다 — 덮어두기로 문으로
  } catch (e) {
    console.error('[record] 회로 예외', e);
    if (!S.finished) cancel();
  }
}
