// admin-trajectory.js ??Canvas (沅ㅼ쟻 ?먮젅?댄꽣)
// 260730 寃??B?? 沅ㅼ쟻 2D ??dagre + SVG 洹몃옒???붿쭊) ??????꾩튂 stage 3D 酉??⑤룆,
// ?섎Ⅴ?뚮굹 STEP ?섏씠?쇱씠?몃뒗 LumenAdminStageView 3D ??쇰줈 ?댁떇.

import { getSupabaseClient } from './lib/supabaseClient.js';
import LumenAdminStageView from './ui/lumen_admin_stage_view.js?v=260731b'; // 罹먯떆踰꾩뒪????260731a ????듭빱 Alt+?대┃
import { DEFAULT_EMOTION_ANCHORS } from './shared/math.js';

// ??? ?곹깭 ??????????????????????????????????????????????????
const state = {
  memory: null,       // memory row (with meta)
  scenes: [],         // scenes (with meta)
  choices: [],        // flat choices
  trajectoryBridges: [], // from trajectory_bridges table
  selectedSceneId: null,
};

// ??? 遺????????????????????????????????????????????????????
async function initTrajectoryViewer(memoryId) {
  // tv* DOM ?놁쑝硫?(???섏씠吏??酉곗뼱媛 ?놁쓬) 以묐떒
  if (!document.getElementById('tvStageRoot')) return;

  // ?대? 媛숈? memory濡?init?먯쑝硫?skip
  if (state.memory && memoryId && state.memory.id === memoryId) return;

  setStatus('Supabase ?곌껐 以묅?);
  const sb = await getSupabaseClient();
  if (!sb) { setStatus('??Supabase ?대씪?댁뼵???ㅽ뙣'); return; }

  setStatus('?곗씠??濡쒕뵫 以묅?);
  try {
    if (memoryId) {
      await loadByMemoryId(sb, memoryId);
    } else {
      await loadFirstAvailable(sb);
    }
  } catch (e) {
    console.error(e);
    setStatus('??' + e.message);
    return;
  }

  setStatus('');
  document.getElementById('tvMemoryLabel').textContent =
    `${state.memory.code} ??${state.memory.title}`;

  renderStats();
  renderMemoryMeta();
  bindToggles();
  loadPersonasForMemory();

  // 260730 B?????꾩튂 stage 酉??곸떆 留덉슫??(?덉씠??????? ?⑤룆 ?쒖떆). idempotent.
  if (!state._stageMounted) {
    LumenAdminStageView.mount('tvStageRoot');
    // ?λ㈃ ?좊졊(?) ?대┃(?쒕옒洹?X) ???곗륫 ???몄쭛 ?⑤꼸
    if (typeof LumenAdminStageView.setSceneClickHandler === 'function') {
      LumenAdminStageView.setSceneClickHandler((sceneId) => {
        const sc = state.scenes.find(s => s.id === sceneId);
        if (sc) selectScene(sc);
      });
    }
    // ?붿긽 ?좊졊 留덉빱 ?대┃(?쒕옒洹?X) ???곗륫 ?붿긽 ?몄쭛 ?⑤꼸
    if (typeof LumenAdminStageView.setGhostClickHandler === 'function') {
      LumenAdminStageView.setGhostClickHandler((ghostIdx) => {
        renderGhostDetail(ghostIdx);
      });
    }
    state._stageMounted = true;
  }
  // terrain mesh ??硫붾え由??⑥쐞濡?濡쒕뱶 (idempotent ??媛숈? id ?ы샇異????щ줈??????
  if (state.memory && state.memory.id) {
    LumenAdminStageView.setMemoryId(state.memory.id);
  }
  syncStageView();
  populateMemorySelect(); // W2-D: ?ъ씠?쒕컮 湲곗뼲 ?좏깮湲?梨꾩슦湲??꾩옱 湲곗뼲 selected)
}

// W2-D (F3): Canvas 湲곗뼲 ?좏깮湲????꾩껜 memories ?쒕∼?ㅼ슫, ?좏깮 ???대떦 湲곗뼲 濡쒕뱶.
function _escHtmlTv(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function populateMemorySelect() {
  const sel = document.getElementById('tvMemorySelect');
  if (!sel) return;
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data: list, error } = await sb.from('memories').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    // W3 ?댁????쒖쇅 ??deleted_at 而щ읆 ?놁쑝硫?undefined ???꾨? ?듦낵(留덉씠洹몃젅?댁뀡 ???덉쟾).
    const visible = (list || []).filter(m => !m.deleted_at);
    const curId = state.memory && state.memory.id;
    if (visible.length === 0) { sel.innerHTML = '<option value="">??湲곗뼲 ?놁쓬 ??/option>'; return; }
    sel.innerHTML = visible.map(m =>
      `<option value="${m.id}"${String(m.id) === String(curId) ? ' selected' : ''}>${_escHtmlTv(m.title || '(?쒕ぉ ?놁쓬)')} ??${_escHtmlTv(m.code || '')}</option>`
    ).join('');
  } catch (e) {
    console.warn('[tv] populateMemorySelect ?ㅽ뙣:', e.message);
  }
}
window.tvSwitchMemory = async function tvSwitchMemory(id) {
  if (!id) return;
  const curId = state.memory && state.memory.id;
  if (String(id) === String(curId)) return; // 媛숈? 湲곗뼲?대㈃ 臾댁떆
  window.currentMemoryId = id;
  await initTrajectoryViewer(id);
};
// 媛숈? 湲곗뼲?대씪??DB ?먯꽌 媛뺤젣濡??ㅼ떆 ?쎈뒗??(?먮낯 蹂듭썝 ?ㅼ쿂???댁슜???듭㎏濡?諛붾?寃쎌슦).
window.tvReloadMemory = async function tvReloadMemory(id) {
  const target = id || (state.memory && state.memory.id) || window.currentMemoryId;
  if (!target) return;
  state.memory = null;         // 媛숈? id 濡쒕룄 ?ㅼ떆 ?쏀엳?꾨줉 珥덇린??  state.selectedSceneId = null;
  const detail = document.getElementById('tvDetail');
  if (detail) detail.innerHTML = '<div class="tv-detail-empty">?몃뱶瑜??대┃?섏꽭??/div>';
  window.currentMemoryId = target;
  await initTrajectoryViewer(target);
};

// 260730 寃??B?? 沅ㅼ쟻/?꾩튂 ?덉씠???꾪솚 ?μ튂(bindLayerToggle 쨌 localStorage 'tv_active_layer') ???// ???꾩튂 stage 酉??곸떆 ?쒖떆.

// ?묒뾽 15 ???꾩튂 ?덉씠?대줈 ???곹깭 push. scene/?쒕? 蹂???쒖젏???몄텧.
function syncStageView() {
  if (!state._stageMounted) return;
  LumenAdminStageView.setScenes(state.scenes);
  // 遺꾧린 ?쒕?(B runner) ???(2026-07-30) ??臾대? 酉?API 怨꾩빟 ?좎?瑜??꾪븳 怨좎젙 ?몄옄.
  LumenAdminStageView.setSimState({ active: false, runners: { A: null, B: null }, compareMode: false });
}

// ??? ?묒씠???뱀뀡 怨듭슜 ?좉? (?ъ씠?쒕컮쨌???⑤꼸 怨듯넻) ?????????
// ?쇰꺼???꾨Ⅴ硫?諛붾줈 ?꾨옒 ?곸옄瑜??묒뿀???덈떎 ?쒕떎. ??= ?묓옒 / ??= ?쇱묠.
window.tvToggleSection = function tvToggleSection(bodyId, labelEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (labelEl) {
    const caret = labelEl.querySelector('.tv-caret');
    if (caret) caret.textContent = open ? '?? : '??;
  }
  try { localStorage.setItem('tv_sec_' + bodyId, open ? '0' : '1'); } catch (e) {}
};
function tvSectionOpen(bodyId, dflt) {
  try {
    const v = localStorage.getItem('tv_sec_' + bodyId);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (e) {}
  return !!dflt;
}

// ??? 硫붾え由?湲곕낯 ?ㅼ젙 ?⑤꼸 (醫뚯륫 ?ъ씠?쒕컮 "湲곗뼲 ?ㅼ젙") ?????
function renderMemoryMeta() {
  const el = document.getElementById('tvMemoryMeta');
  if (!el) return;
  const m = state.memory;
  if (!m) { el.innerHTML = '<div class="tv-detail-empty">硫붾え由??놁쓬</div>'; return; }

  // ???쇱? ??移몄쓣 臾몄옄?대줈 ??ν뻽????諛곗뿴留?諛쏆쑝硫?鍮덉뭏?쇰줈 蹂댁??ㅺ? ?????媛믪씠 ?좎븘媛꾨떎.
  // 臾몄옄?대룄 洹몃?濡?諛쏆븘 蹂댁뿬二쇨퀬, ??μ? 諛곗뿴濡??듭씪?쒕떎.
  const keywords = Array.isArray(m.memory_words) ? m.memory_words.join(', ') : String(m.memory_words || '');
  const inputStyle = `width:100%;box-sizing:border-box;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;`;
  const labelStyle = `font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;display:block;margin-top:12px;`;
  const helpStyle = `font-size:0.66rem;color:#5c544a;line-height:1.5;margin-top:3px;`;
  const numStyle = `width:62px;box-sizing:border-box;padding:3px 5px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-family:inherit;font-size:0.74rem;border-radius:2px;`;

  // 媛먭컖 ?듭빱 ??jsonb {modality, content, weight}. 臾몄옄?대줈留???λ맂 ??媛믩룄 ?≪닔.
  const sa = (m.sensory_anchor && typeof m.sensory_anchor === 'object' && !Array.isArray(m.sensory_anchor))
    ? m.sensory_anchor
    : { modality: '', content: (typeof m.sensory_anchor === 'string' ? m.sensory_anchor : ''), weight: 0.7 };
  const saMod = sa.modality || '';
  const saWeight = sa.weight != null ? sa.weight : 0.7;
  const modOpts = [['', '?놁쓬'], ['smell', '?꾩깉 (smell)'], ['sound', '?뚮━ (sound)'], ['touch', '珥됯컧 (touch)']]
    .map(([v, l]) => `<option value="${v}"${saMod === v ? ' selected' : ''}>${l}</option>`).join('');

  const num = (v, d) => (v != null ? v : d);
  const contOpen = tvSectionOpen('metaContBody', false);
  const saOpen = tvSectionOpen('metaSensoryBody', false);

  el.innerHTML = `
    <div style="font-size:0.66rem;color:#5c544a;margin-bottom:6px;">id: ${m.id?.slice(0,8) || '??}??/div>

    <label style="${labelStyle}margin-top:0;">肄붾뱶 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">??湲곗뼲 怨좎쑀 踰덊샇 (code)</span></label>
    <input type="text" id="metaCode" value="${escapeHtml(m.code || '')}" style="${inputStyle}" />
    <div style="${helpStyle}">湲곗뼲留덈떎 寃뱀튂吏 ?딆븘???? ?? E-005</div>

    <label style="${labelStyle}">?쒕ぉ</label>
    <input type="text" id="metaTitle" value="${escapeHtml(m.title || '')}" style="${inputStyle}" />

    <label style="${labelStyle}">?ㅻ챸</label>
    <textarea id="metaDescription" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(m.description || '')}</textarea>

    <label style="${labelStyle}">?ㅼ썙??(?쇳몴 援щ텇)</label>
    <input type="text" id="metaKeywords" value="${escapeHtml(keywords)}" style="${inputStyle}" />

    <label style="${labelStyle}">?꾩꽦 臾몄옣</label>
    <textarea id="metaCompletedSentence" rows="2" style="${inputStyle}resize:vertical;">${escapeHtml(m.completed_sentence || '')}</textarea>

    <label style="${labelStyle}">?섎Ⅴ?뚮굹 而⑦뀓?ㅽ듃 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">???쒕???二쇱젣 ?붿빟</span></label>
    <textarea id="metaPersonaContext" rows="4" placeholder="???묓뭹???듭떖 ?뚮쭏, ?곸쭠, 愿怨?援щ룄瑜??쒕? ?낆옄媛 ?뚯븘????留뚰겮 ?붿빟." style="${inputStyle}resize:vertical;">${escapeHtml(m.meta?.persona_context || '')}</textarea>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('metaSensoryBody', this)"><span class="tv-caret">${saOpen ? '?? : '??}</span> 媛먭컖 ?듭빱</div>
    <div id="metaSensoryBody" style="display:${saOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">湲곗뼲 ?꾩껜瑜?愿?듯븯???⑥씪 媛먭컖. ?ㅼ젣 諛섏쁺 = 3D 吏??泥???二쇰? ?낆옄???됀룻겕湲??묓깭留??뚮퉬).</div>
      <label style="${labelStyle}margin-top:0;">?묓깭</label>
      <select id="metaSensoryModality" style="${inputStyle}">${modOpts}</select>
      <label style="${labelStyle}">?댁슜 (?⑥뼱)</label>
      <input type="text" id="metaSensoryContent" value="${escapeHtml(sa.content || '')}" placeholder="?? 諛쒖냼由? ?뚮룆?? 李④????由ъ꽍" style="${inputStyle}" />
      <label style="${labelStyle}">媛뺣룄 (0~1)</label>
      <input type="number" id="metaSensoryWeight" min="0" max="1" step="0.05" value="${saWeight}" style="${numStyle}" />
    </div>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('metaContBody', this)"><span class="tv-caret">${contOpen ? '?? : '??}</span> ?ㅼ뿼 珥덇린 ?곹깭</div>
    <div id="metaContBody" style="display:${contOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">愿媛?泥?吏꾩엯 ???곹깭. 遊됱씤?섎㈃ ?고???媛믪쑝濡???엫(1?뚯꽦 ?⑥븮).</div>
      <label style="${labelStyle}margin-top:0;">?꾩쟻 源딆씠 (cont_depth, 0~30)</label>
      <input type="number" id="metaContDepth" min="0" max="30" step="1" value="${num(m.cont_depth, 0)}" style="${numStyle}" />
      <div style="${helpStyle}">0 = ?좎꽑 / 5~10 = ?꾩쟻 / 15+ = 怨쇱닕</div>
      <label style="${labelStyle}">3異?(0~1)</label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">divergence</span><input type="number" id="metaContDivergence" min="0" max="1" step="0.05" value="${num(m.cont_divergence, 0)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">convergence</span><input type="number" id="metaContConvergence" min="0" max="1" step="0.05" value="${num(m.cont_convergence, 0)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">heterogeneity</span><input type="number" id="metaContHeterogeneity" min="0" max="1" step="0.05" value="${num(m.cont_heterogeneity, 0)}" style="${numStyle}" /></label>
      </div>
      <label style="${labelStyle}">?④퀎 ?쇳빀 (0~1, ??1)</label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_1 ?명뼢</span><input type="number" id="metaContStage1" min="0" max="1" step="0.01" value="${num(m.cont_stage_1, 0.33)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_2 蹂묒튂</span><input type="number" id="metaContStage2" min="0" max="1" step="0.01" value="${num(m.cont_stage_2, 0.33)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_3 怨쇱셿寃?/span><input type="number" id="metaContStage3" min="0" max="1" step="0.01" value="${num(m.cont_stage_3, 0.34)}" style="${numStyle}" /></label>
      </div>
      <button class="tv-toggle" id="metaContNormBtn" style="padding:3px 8px;font-size:0.68rem;margin-top:5px;">??= 1 濡?留욎텛湲?/button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;">
      <button class="tv-toggle" id="metaSaveBtn" style="padding:6px 12px;font-size:0.75rem;">???/button>
      <span id="metaSaveStatus" style="font-size:0.7rem;color:#7c7466;"></span>
    </div>
  `;

  document.getElementById('metaSaveBtn').addEventListener('click', saveMemoryMeta);
  const normBtn = document.getElementById('metaContNormBtn');
  if (normBtn) normBtn.addEventListener('click', () => {
    const ids = ['metaContStage1', 'metaContStage2', 'metaContStage3'];
    const vals = ids.map(id => Math.max(0, parseFloat(document.getElementById(id)?.value) || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) { ids.forEach((id, i) => { document.getElementById(id).value = (i === 2 ? 0.34 : 0.33); }); return; }
    ids.forEach((id, i) => { document.getElementById(id).value = (vals[i] / sum).toFixed(2); });
  });

  // ?좊졊 蹂二?? ??Canvas ?ъ씠?쒕컮濡??댁궗???ㅼ궗???몄쭛湲? 湲곗뼲 諛붾??뚮쭏???ㅼ떆 ?쎈뒗??
  if (typeof window.loadGhostVariants === 'function') {
    try { window.loadGhostVariants(m.id); } catch (e) { console.warn('[tv] loadGhostVariants ?ㅽ뙣:', e.message); }
  }
  // ?먮낯 ?대젰 ??admin.js 援ы쁽. 紐⑤뱢 ?대? currentMemoryId 瑜?癒쇱? 留욎떠????湲곗뼲 寃껋쓣 洹몃┛??
  if (typeof window.adminSetCurrentMemory === 'function') window.adminSetCurrentMemory(m.id);
  if (typeof window.renderVersions === 'function') {
    try { window.renderVersions(); } catch (e) { console.warn('[tv] renderVersions ?ㅽ뙣:', e.message); }
  }
}

async function saveMemoryMeta() {
  const statusEl = document.getElementById('metaSaveStatus');
  const code = document.getElementById('metaCode').value.trim();
  const title = document.getElementById('metaTitle').value.trim();
  const desc = document.getElementById('metaDescription').value.trim();
  const keywords = document.getElementById('metaKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
  const completed = document.getElementById('metaCompletedSentence').value.trim();
  const personaCtx = document.getElementById('metaPersonaContext').value.trim();

  // 媛먭컖 ?듭빱 ???묓깭 鍮꾨㈃ ?듭㎏濡??놁쓬(null) 泥섎━
  const saMod = document.getElementById('metaSensoryModality')?.value || '';
  const saContent = (document.getElementById('metaSensoryContent')?.value || '').trim();
  const saWeightRaw = parseFloat(document.getElementById('metaSensoryWeight')?.value);
  const sensoryAnchor = saMod
    ? { modality: saMod, content: saContent, weight: isNaN(saWeightRaw) ? 0.7 : Math.min(1, Math.max(0, saWeightRaw)) }
    : null;

  const numOr = (id, dflt, lo, hi) => {
    const v = parseFloat(document.getElementById(id)?.value);
    if (isNaN(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  };
  const contDepth = Math.round(numOr('metaContDepth', 0, 0, 30));

  statusEl.textContent = '???以묅?;
  statusEl.style.color = '#7c7466';
  try {
    const sb = await getSupabaseClient();
    const nextMeta = { ...(state.memory.meta || {}) };
    if (personaCtx) nextMeta.persona_context = personaCtx;
    else delete nextMeta.persona_context;

    const patch = {
      title, description: desc || null,
      memory_words: keywords.length ? keywords : null,
      completed_sentence: completed || null,
      sensory_anchor: sensoryAnchor,
      cont_depth: contDepth,
      cont_divergence: numOr('metaContDivergence', 0, 0, 1),
      cont_convergence: numOr('metaContConvergence', 0, 0, 1),
      cont_heterogeneity: numOr('metaContHeterogeneity', 0, 0, 1),
      cont_stage_1: numOr('metaContStage1', 0.33, 0, 1),
      cont_stage_2: numOr('metaContStage2', 0.33, 0, 1),
      cont_stage_3: numOr('metaContStage3', 0.34, 0, 1),
      meta: nextMeta,
    };
    if (code) patch.code = code; // 鍮?媛믪쑝濡?肄붾뱶瑜?吏?곗????딆쓬 (UNIQUE 而щ읆)

    const { error } = await sb.from('memories').update(patch).eq('id', state.memory.id);
    if (error) throw error;
    Object.assign(state.memory, patch);
    state.memory.memory_words = keywords;
    document.getElementById('tvMemoryLabel').textContent = `${state.memory.code} ??${state.memory.title}`;
    statusEl.textContent = '????λ맖';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    populateMemorySelect(); // ?쒕ぉ쨌肄붾뱶 諛붾뚮㈃ ?쒕∼?ㅼ슫 ?쇰꺼??媛깆떊
  } catch (e) {
    statusEl.textContent = '??' + e.message;
    statusEl.style.color = '#b85540';
  }
}

// admin.html?먯꽌 ?몄텧
window.initTrajectoryViewer = initTrajectoryViewer;

// ??? ?곗씠??????????????????????????????????????????????????
async function loadByMemoryId(sb, memoryId) {
  const { data: mem, error: e1 } = await sb.from('memories').select('*').eq('id', memoryId).single();
  if (e1) throw e1;
  state.memory = mem;
  await loadScenesAndChoices(sb, mem.id);
  await loadTrajectoryBridges(sb, mem.id);
}

async function loadFirstAvailable(sb) {
  // memory ?뚮씪誘명꽣 ?놁쓣 ????meta.emotion_entries ?덈뒗 寃??곗꽑
  const { data: list, error } = await sb.from('memories').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const withMeta = list.find(m => m.meta && m.meta.emotion_entries) || list[0];
  if (!withMeta) throw new Error('?깅줉??硫붾え由ш? ?놁쓬');
  state.memory = withMeta;
  await loadScenesAndChoices(sb, withMeta.id);
  await loadTrajectoryBridges(sb, withMeta.id);
}

async function loadScenesAndChoices(sb, memoryId) {
  const { data: scenes, error: se } = await sb.from('scenes').select('*').eq('memory_id', memoryId).order('scene_order', { ascending: true });
  if (se) throw se;
  state.scenes = scenes || [];
  if (state.scenes.length === 0) return;

  const sceneIds = state.scenes.map(s => s.id);
  const { data: choices, error: ce } = await sb.from('choices').select('*').in('scene_id', sceneIds).order('choice_order', { ascending: true });
  if (ce) throw ce;
  state.choices = choices || [];
}

async function loadTrajectoryBridges(sb, memoryId) {
  const { data, error } = await sb.from('trajectory_bridges').select('*').eq('memory_id', memoryId).eq('status', 'live');
  if (error) {
    console.warn('trajectory_bridges 濡쒕뱶 ?ㅽ뙣 (?뚯씠釉??놁쓬 媛??:', error.message);
    state.trajectoryBridges = [];
    return;
  }
  state.trajectoryBridges = data || [];
}

// ??? ?ъ씠?쒕컮 ??????????????????????????????????????????????
// 媛먯젙 吏꾩엯???꾪꽣 UI ???(2026-07-30) ??媛뺤젣 ?좏삎??
// meta.emotion_entries ?곗씠???먯껜??蹂댁〈 (UI ?꾪꽣留????.

function renderStats() {
  const sceneCount = state.scenes.length;
  const choiceCount = state.choices.length;
  const authorBridgeCount = state.scenes.reduce((n, s) =>
    n + (s.meta && Array.isArray(s.meta.author_bridges) ? s.meta.author_bridges.length : 0), 0);
  const trajBridgeCount = state.trajectoryBridges.length;
  document.getElementById('tvStats').innerHTML =
    `?? ${sceneCount}<br>?좏깮吏: ${choiceCount}<br>?묎? 釉뚮┸吏: ${authorBridgeCount}<br>沅ㅼ쟻 釉뚮┸吏: ${trajBridgeCount}`;
}

// ??? 紐⑤떖 ???????????????????????????????????????????????????
function openModal(html) {
  const modal = document.getElementById('tvModal');
  const body = document.getElementById('tvModalBody');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.style.display = 'flex';
  // ESC / 諛곌꼍 ?대┃?쇰줈 ?リ린
  modal.onclick = (ev) => { if (ev.target === modal) closeModal(); };
}
function closeModal() {
  const modal = document.getElementById('tvModal');
  if (modal) modal.style.display = 'none';
}
window.tvCloseModal = closeModal;

// ??? ??湲곗뼲 異붽? ???????????????????????????????????????????
function openNewMemoryModal() {
  openModal(`
    <h3 style="margin:0 0 14px;font-family:'Cormorant Garamond',serif;color:#c4a882;font-weight:300;">??湲곗뼲 留뚮뱾湲?/h3>
    <p style="color:#7c7466;font-size:0.78rem;margin:0 0 16px;line-height:1.6;">?쒕ぉ怨?肄붾뱶瑜??낅젰?섏꽭?? ?댄썑 Canvas?먯꽌 ?ъ쓣 異붽??⑸땲??</p>

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">?쒕ぉ</label>
    <input id="nmTitle" type="text" placeholder="?몄?" style="width:100%;margin-top:4px;margin-bottom:10px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.88rem;border-radius:2px;" />

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">肄붾뱶 (E-NNN)</label>
    <input id="nmCode" type="text" placeholder="E-005" style="width:100%;margin-top:4px;margin-bottom:10px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.88rem;border-radius:2px;" />

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">泥???蹂몃Ц (?좏깮)</label>
    <textarea id="nmFirstText" rows="3" placeholder="(鍮꾩썙?먮㈃ 鍮????섎굹濡??쒖옉)" style="width:100%;margin-top:4px;margin-bottom:14px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.82rem;border-radius:2px;resize:vertical;"></textarea>

    <div id="nmStatus" style="font-size:0.72rem;color:#7c7466;margin-bottom:10px;min-height:1em;"></div>

    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="tv-toggle" onclick="tvCloseModal()" style="padding:6px 14px;font-size:0.78rem;">痍⑥냼</button>
      <button class="tv-toggle" id="nmCreateBtn" style="padding:6px 14px;font-size:0.78rem;background:rgba(106,163,131,0.12);border-color:rgba(106,163,131,0.4);">?앹꽦</button>
    </div>
  `);
  document.getElementById('nmCreateBtn').addEventListener('click', createNewMemory);
  document.getElementById('nmTitle').focus();
}
// 260730 ?듯빀: ??쒕낫??[+ ??硫붾え由?異붽?] ????紐⑤떖???대떎 (???????.
// Canvas ??씠 ?꾩쭅 ???대졇?대룄 紐⑤떖? body 吏곸냽 #tvModal ?대씪 洹몃?濡??щ떎.
window.tvOpenNewMemory = openNewMemoryModal;

async function createNewMemory() {
  const title = document.getElementById('nmTitle').value.trim();
  const code = document.getElementById('nmCode').value.trim();
  const firstText = document.getElementById('nmFirstText').value.trim();
  const statusEl = document.getElementById('nmStatus');

  if (!title) { statusEl.textContent = '?쒕ぉ???낅젰?섏꽭??'; statusEl.style.color = '#b85540'; return; }
  if (!code)  { statusEl.textContent = '肄붾뱶瑜??낅젰?섏꽭??'; statusEl.style.color = '#b85540'; return; }

  statusEl.textContent = '?앹꽦 以묅?;
  statusEl.style.color = '#7c7466';

  try {
    const sb = await getSupabaseClient();
    // 1) memories insert
    const { data: mem, error: me } = await sb.from('memories').insert({
      code, title,
      status: 'Fetus', source: 'curated',
      layers: 0, dilution: 100, is_public: true,
      meta: { emotion_entries: {}, key_scenes: [] }
    }).select().single();
    if (me) throw me;

    // 2) 泥???insert
    const { data: sc, error: se } = await sb.from('scenes').insert({
      memory_id: mem.id, scene_order: 0,
      text: firstText || '',
      emotion_dist: {}, emotion_vector: {},
      scene_type: 'normal',
      meta: { scene_code: 'A', motif_tags: [], author_bridges: [] }
    }).select().single();
    if (se) throw se;

    statusEl.textContent = '???앹꽦?? 濡쒕뵫??;
    statusEl.style.color = '#6aa383';

    // 3) ?대떦 硫붾え由щ줈 Canvas ?꾪솚 (紐⑸줉 ??뿉??留뚮뱾?덉쓣 ?섎룄 ?덉쑝???붾㈃遺??Canvas 濡?
    setTimeout(async () => {
      closeModal();
      window.currentMemoryId = mem.id;
      state.memory = null; // 媛뺤젣 由щ줈??      await initTrajectoryViewer(mem.id);
      // ?붾㈃ ?꾪솚? 濡쒕뵫 ?앸궃 ?????ш린???ㅼ떆 遺덈━??init ? 媛숈? 湲곗뼲?대씪 洹몃깷 鍮좎졇?섍컙??
      if (typeof window.switchAdminSection === 'function') window.switchAdminSection('canvas');
    }, 600);
  } catch (e) {
    console.error(e);
    statusEl.textContent = '??' + e.message;
    statusEl.style.color = '#b85540';
  }
}

// ??? ????젣 ????????????????????????????????????????????????
async function deleteScene(s) {
  if (!confirm(`??"${s.meta?.scene_code || s.scene_order}" ??瑜? ??젣?좉퉴??\n(蹂듦뎄 遺덇?)`)) return;
  try {
    const sb = await getSupabaseClient();
    // choices 癒쇱? ??젣 (FK)
    await sb.from('choices').delete().eq('scene_id', s.id);
    const { error } = await sb.from('scenes').delete().eq('id', s.id);
    if (error) throw error;
    // 濡쒖뺄 state?먯꽌 ?쒓굅
    state.scenes = state.scenes.filter(x => x.id !== s.id);
    state.selectedSceneId = null;
    document.getElementById('tvDetail').innerHTML = '<div class="tv-detail-empty">?ъ씠 ??젣?섏뿀?듬땲??</div>';
    syncStageView();
    renderStats();
  } catch (e) {
    console.error(e);
    alert('??젣 ?ㅽ뙣: ' + e.message);
  }
}

// ??? ???쒖꽌 ?대룞 (???? ????????????????????????????????????
// 諛붾줈 ???꾨옒 ?ш낵 scene_order 瑜?留욌컮袁쇰떎. UPDATE 2????濡쒖뺄 ?뺣젹쨌臾대?쨌?⑤꼸 媛깆떊.
async function moveSceneOrder(s, dir) {
  const sorted = state.scenes.slice().sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
  const i = sorted.findIndex(x => x.id === s.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const other = sorted[j];
  let mine = s.scene_order ?? i;
  let theirs = other.scene_order ?? j;
  // ?????쒖꽌 媛믪씠 媛숈쑝硫????곗씠???ш퀬) 留욌컮轅붾룄 ?먮━媛 ??諛붾먮떎 ????移?踰뚮젮以??
  if (mine === theirs) theirs = mine + dir;
  try {
    const sb = await getSupabaseClient();
    const { error: e1 } = await sb.from('scenes').update({ scene_order: theirs }).eq('id', s.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from('scenes').update({ scene_order: mine }).eq('id', other.id);
    if (e2) throw e2;
    s.scene_order = theirs;
    other.scene_order = mine;
    state.scenes.sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
    syncStageView();
    renderDetail(s);
  } catch (e) {
    console.error(e);
    alert('?쒖꽌 ?대룞 ?ㅽ뙣: ' + e.message);
  }
}

// ??? ?ъ슫??誘몃━?ｊ린 (Web Audio API) ????????????????????????
let _audioCtx = null;
let _currentPreview = null;
async function previewSound(url, volume) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_currentPreview) { try { _currentPreview.stop(); } catch(e){} _currentPreview = null; }

    const res = await fetch(url);
    if (!res.ok) throw new Error('?뚯씪 濡쒕뱶 ?ㅽ뙣: ' + res.status);
    const buf = await res.arrayBuffer();
    const audioBuf = await _audioCtx.decodeAudioData(buf);

    const src = _audioCtx.createBufferSource();
    src.buffer = audioBuf;
    const gain = _audioCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain).connect(_audioCtx.destination);
    src.start();
    _currentPreview = src;
    // 理쒕? 10珥?誘몃━?ｊ린
    setTimeout(() => { try { src.stop(); } catch(e){} }, 10000);
  } catch (e) {
    alert('?ъ깮 ?ㅽ뙣: ' + e.message);
  }
}

// ??? ????異붽? ?????????????????????????????????????????????
async function addNewScene() {
  return _insertScene({ role: 'anchor' });
}

// addNewBridgeScene (scene_role='residual') ?먭린 ??2026-05-16. ?붿긽? ?붿긽 ?좊졊?쇰줈 ?듯빀.

async function _insertScene({ role }) {
  if (!state.memory) { alert('癒쇱? 硫붾え由щ? ?좏깮?섏꽭??'); return; }
  const existingCodes = new Set(state.scenes.map(s => s.meta?.scene_code).filter(Boolean));
  let nextCode = '';
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!existingCodes.has(c)) { nextCode = c; break; }
  }
  const nextOrder = Math.max(-1, ...state.scenes.map(s => s.scene_order ?? -1)) + 1;
  const isBridge = role === 'residual';

  try {
    const sb = await getSupabaseClient();
    const { data: sc, error: se } = await sb.from('scenes').insert({
      memory_id: state.memory.id,
      scene_order: nextOrder,
      text: '',
      emotion_dist: {}, emotion_vector: {},
      scene_type: isBridge ? 'branch' : 'normal',
      scene_role: isBridge ? 'residual' : 'anchor',
      meta: { scene_code: nextCode || String(nextOrder), motif_tags: [], author_bridges: [] }
    }).select().single();
    if (se) throw se;
    state.scenes.push(sc);
    syncStageView();
    renderStats();
    selectScene(sc);
  } catch (e) {
    console.error(e);
    alert((isBridge ? '?붿긽 ?? : '??) + ' 異붽? ?ㅽ뙣: ' + e.message);
  }
}

function bindToggles() {
  // 260730 寃??B?? ?쒖떆 ?듭뀡 ?좉?(?꾩껜 ?쒖떆/紐⑤뱺 釉뚮┸吏/媛먯젙 吏??紐⑤뱶/?덉씠?꾩썐 珥덇린??
  // ??????꾨? 2D SVG 洹몃옒???꾩슜?댁뿀??
  // ?좑툘 ???⑥닔??湲곗뼲??諛붽? ?뚮쭏???ㅼ떆 遺덈┛?? ??踰덈쭔 臾띠? ?딆쑝硫?媛숈? 踰꾪듉??泥섎━湲곌?
  //    寃밴껸???볦뿬 "+ ?먮낯 ?? ??踰??뚮??붾뜲 ?ъ씠 ?먯꽭 媛??앷린???ш퀬媛 ?쒕떎.
  if (state._togglesBound) return;
  state._togglesBound = true;

  // ?ъ씠?쒕컮 ?묒씠???뱀뀡 ??吏?쒕쾲???묒뼱???곹깭 蹂듭썝
  ['tvMemoryMeta', 'ghostVariantsSection', 'tvVersionsBox', 'tvSeedBox'].forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    const dflt = box.style.display !== 'none';
    const open = tvSectionOpen(id, dflt);
    box.style.display = open ? '' : 'none';
    const label = box.previousElementSibling;
    const caret = label && label.querySelector ? label.querySelector('.tv-caret') : null;
    if (caret) caret.textContent = open ? '?? : '??;
  });

  const addMemBtn = document.getElementById('tvAddMemoryBtn');
  if (addMemBtn) addMemBtn.addEventListener('click', openNewMemoryModal);
  const addSceneBtn = document.getElementById('tvAddSceneBtn');
  if (addSceneBtn) addSceneBtn.addEventListener('click', addNewScene);
  // 2026-05-16 ??"+ ?붿긽 ?좊졊": ?꾩튂 stage ???뚯깋 留덉빱 異붽?. ("+ ?붿긽 ?? ?먭린 ?泥?
  const addGhostBtn = document.getElementById('tvAddGhostBtn');
  if (addGhostBtn) addGhostBtn.addEventListener('click', () => {
    if (!state.memory || !state.memory.id) { alert('湲곗뼲???좏깮?섏? ?딆븯?듬땲??'); return; }
    if (typeof LumenAdminStageView.addGhostPoint === 'function') {
      LumenAdminStageView.addGhostPoint();
    }
  });

  // 260730 ??"?щЪ 3D 紐⑤뜽 戮묎린": ?쒕쾭??二쇰Ц+?섑솗???쒗궓??(generate-object-model).
  //   ??踰??꾨Ⅴ硫??꾩꽦??寃껋쓣 嫄곕뫊?ㅺ퀬, ?꾩쭅 紐⑤뜽 ?녿뒗 ?⑥뼱???덈줈 二쇰Ц?쒕떎.
  //   紐⑤뜽 ?섎굹??60~120珥덈씪 利됱떆 ???섏삤吏 ?딅뒗?????좎떆 ???ㅼ떆 ?꾨Ⅴ硫??섎㉧吏媛 遺숇뒗??
  const objModelsBtn = document.getElementById('tvObjectModelsBtn');
  if (objModelsBtn) objModelsBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('tvObjectModelsStatus');
    const mid = (state.memory && state.memory.id) || window.currentMemoryId;
    if (!mid) { alert('湲곗뼲???좏깮?섏? ?딆븯?듬땲??'); return; }
    const say = (msg, color) => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = color || '#7c7466';
    };
    objModelsBtn.disabled = true;
    say('?쒕쾭???붿껌 以묅?(二쇰Ц쨌?섑솗)', '#9a9080');
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.functions.invoke('generate-object-model', {
        body: { memoryId: mid, mode: 'sync' },
      });
      if (error) throw new Error(error.message || '?몄텧 ?ㅽ뙣');
      const parts = [];
      if (data.collected?.length) parts.push(`嫄곕몺 ${data.collected.length}: ${data.collected.join(', ')}`);
      if (data.queued?.length) parts.push(`二쇰Ц ${data.queued.length}: ${data.queued.join(', ')} (1~2遺????ㅼ떆 ?꾨Ⅴ硫?遺숈쓬)`);
      if (data.running?.length) parts.push(`援쎈뒗 以?${data.running.length}: ${data.running.join(', ')}`);
      if (data.deferred?.length) parts.push(`?湲?${data.deferred.length}: ${data.deferred.join(', ')}`);
      if (data.failed?.length) parts.push(`?ㅽ뙣 ${data.failed.length}: ${data.failed.join(', ')}`);
      if (data.rejected?.length) parts.push(`嫄곗젅 ${data.rejected.length}: ${data.rejected.join(', ')}`);
      parts.push(`???꾩꽦 ${data.models_total ?? 0}媛?/ 吏꾪뻾 ${data.jobs_pending ?? 0}媛?);
      say(parts.join(' 쨌 '), (data.failed?.length || data.rejected?.length) ? '#b8905a' : '#6aa383');
      syncStageView();   // ?덈줈 遺숈? 紐⑤뜽??臾대? 留덉빱?먮룄 諛섏쁺?섍쾶
    } catch (e) {
      console.error('[ObjectModels]', e);
      say('??' + (e.message || e), '#b85540');
    } finally {
      objModelsBtn.disabled = false;
    }
  });

  const strataBtn = document.getElementById('tvStrataPreviewBtn');
  if (strataBtn) strataBtn.addEventListener('click', () => {
    const mid = (state.memory && state.memory.id) || window.currentMemoryId;
    if (!mid) { alert('湲곗뼲???좏깮?섏? ?딆븯?듬땲??'); return; }
    if (typeof window.showStrataView !== 'function') { alert('strataView.js 濡쒕뵫 ?ㅽ뙣'); return; }
    window.showStrataView(mid, null, () => {
      const sv = document.getElementById('strataView');
      if (sv) sv.style.display = 'none';
    });
  });

  const prevBtn = document.getElementById('tvPersonaPrevBtn');
  const nextBtn = document.getElementById('tvPersonaNextBtn');
  const personaSel = document.getElementById('tvPersonaSelect');
  if (prevBtn) prevBtn.addEventListener('click', personaStepPrev);
  if (nextBtn) nextBtn.addEventListener('click', personaStepNext);
  if (personaSel) personaSel.addEventListener('change', onPersonaSelectChange);
}

// ??? ?섎Ⅴ?뚮굹 ?섎룞 step ????????????????????????????????????
// ?먮룞?ъ깮 ?먭린 ???좏깮 ??泥?step ?쒖떆, ? ?댁쟾 / ?ㅼ쓬 ???쇰줈 吏곸젒 吏꾪뻾.
const personaState = {
  personas: [],      // [{ persona_id, persona_name, strata_label, plays: [...] }]
  plays: [],
  currentIdx: 0,
  orderedPlays: [],
  currentPersona: null,
};

async function loadPersonasForMemory() {
  const sel = document.getElementById('tvPersonaSelect');
  if (!sel || !state.memory) return;
  // 硫붾え由??꾪솚 ??step ?곹깭 珥덇린??  personaState.orderedPlays = [];
  personaState.currentPersona = null;
  personaState.currentIdx = 0;
  clearSceneHighlight();
  const infoEl = document.getElementById('tvPersonaInfo');
  if (infoEl) infoEl.innerHTML = '';
  updatePersonaStepButtons();
  sel.innerHTML = '<option value="">??濡쒕뵫 以???/option>';
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('plays')
      .select('id, scene_id, persona_id, persona_name, strata_label, visit, user_emotion, alignment, mismatch_type, created_at')
      .eq('memory_id', state.memory.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    personaState.plays = data || [];
    const byPersona = new Map();
    for (const p of personaState.plays) {
      if (!p.persona_id) continue;
      if (p.persona_id === 'author-seed') continue; // ?묎? ?쒕뵫 ???섎Ⅴ?뚮굹 ?꾨떂 (?멸뎄 寃⑸━)
      if (!byPersona.has(p.persona_id)) {
        byPersona.set(p.persona_id, {
          persona_id: p.persona_id,
          persona_name: p.persona_name || p.persona_id,
          strata_label: p.strata_label || '',
          plays: []
        });
      }
      byPersona.get(p.persona_id).plays.push(p);
    }
    personaState.personas = Array.from(byPersona.values());
    sel.innerHTML = personaState.personas.length
      ? ['<option value="">???좏깮 ??/option>'].concat(
          personaState.personas.map(p =>
            `<option value="${p.persona_id}">${escapeHtml(p.persona_name)} ${p.strata_label ? '쨌 ' + escapeHtml(p.strata_label) : ''} (${p.plays.length})</option>`
          )
        ).join('')
      : '<option value="">???쒕? ?곗씠???놁쓬 ??/option>';
  } catch (e) {
    console.warn('[persona] load fail:', e.message);
    sel.innerHTML = '<option value="">??濡쒕뱶 ?ㅽ뙣 ??/option>';
  }
}

function onPersonaSelectChange() {
  const sel = document.getElementById('tvPersonaSelect');
  const id = sel && sel.value;
  if (!id) {
    personaState.orderedPlays = [];
    personaState.currentPersona = null;
    personaState.currentIdx = 0;
    clearSceneHighlight();
    const infoEl = document.getElementById('tvPersonaInfo');
    if (infoEl) infoEl.innerHTML = '';
    updatePersonaStepButtons();
    return;
  }
  const persona = personaState.personas.find(p => p.persona_id === id);
  if (!persona || !persona.plays.length) {
    personaState.orderedPlays = [];
    personaState.currentPersona = null;
    personaState.currentIdx = 0;
    updatePersonaStepButtons();
    return;
  }
  // Order plays by scene order so step 吏꾪뻾??沅ㅼ쟻 ?쒖꽌瑜??곕씪媛?  const sceneOrderMap = new Map();
  state.scenes.forEach((s, i) => sceneOrderMap.set(s.id, s.scene_order != null ? s.scene_order : i));
  personaState.orderedPlays = persona.plays.slice().sort((a, b) => {
    const oa = sceneOrderMap.get(a.scene_id); const ob = sceneOrderMap.get(b.scene_id);
    return (oa != null ? oa : 999) - (ob != null ? ob : 999);
  });
  personaState.currentPersona = persona;
  personaState.currentIdx = 0;
  renderPersonaStep();
}

function renderPersonaStep() {
  const plays = personaState.orderedPlays;
  const persona = personaState.currentPersona;
  if (!plays.length || !persona) {
    clearSceneHighlight();
    updatePersonaStepButtons();
    return;
  }
  const idx = Math.max(0, Math.min(personaState.currentIdx, plays.length - 1));
  personaState.currentIdx = idx;
  const play = plays[idx];
  highlightSceneNode(play.scene_id);
  updatePersonaPanel(persona, play);
  updatePersonaStepButtons();
}

function personaStepPrev() {
  if (!personaState.orderedPlays.length) return;
  if (personaState.currentIdx <= 0) return;
  personaState.currentIdx--;
  renderPersonaStep();
}

function personaStepNext() {
  if (!personaState.orderedPlays.length) return;
  if (personaState.currentIdx >= personaState.orderedPlays.length - 1) return;
  personaState.currentIdx++;
  renderPersonaStep();
}

function updatePersonaStepButtons() {
  const prevBtn = document.getElementById('tvPersonaPrevBtn');
  const nextBtn = document.getElementById('tvPersonaNextBtn');
  const total = personaState.orderedPlays.length;
  const idx = personaState.currentIdx;
  if (prevBtn) prevBtn.disabled = !total || idx <= 0;
  if (nextBtn) nextBtn.disabled = !total || idx >= total - 1;
}

// 260730 寃??B?? 2D SVG ?몃뱶 ?뚮몢由?媛뺤“ ???꾩튂 stage 3D ? 媛뺤“濡??댁떇.
function highlightSceneNode(sceneId) {
  if (typeof LumenAdminStageView.highlightPersonaScene === 'function') {
    LumenAdminStageView.highlightPersonaScene(sceneId);
  }
}

function clearSceneHighlight() {
  if (typeof LumenAdminStageView.clearPersonaHighlight === 'function') {
    LumenAdminStageView.clearPersonaHighlight();
  }
}

// ?좑툘 260730: ???⑥닔???덉쟾??#tvDetail(???몄쭛 ?????듭㎏濡???뼱?쇰떎 ???ъ쓣 怨좎튂?ㅺ?
// ?섎Ⅴ?뚮굹 step ???꾨Ⅴ硫?????????낅젰???꾨? ?щ씪議뚮떎. ?댁젣 ?ъ씠?쒕컮???섎Ⅴ?뚮굹 移?// (#tvPersonaInfo) ?덉뿉留?洹몃┛?? #tvDetail ? ???몄쭛 ?꾩슜?쇰줈 怨좎젙.
function updatePersonaPanel(persona, play) {
  const infoEl = document.getElementById('tvPersonaInfo');
  if (!infoEl) return;
  const scene = state.scenes.find(s => s.id === play.scene_id);
  const ue = play.user_emotion || {};
  const top3 = Object.entries(typeof ue === 'string' ? JSON.parse(ue) : ue)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k}:${Number(v).toFixed(2)}`).join(' 쨌 ');
  const total = personaState.orderedPlays.length;
  const stepLabel = total ? `step ${personaState.currentIdx + 1} / ${total}` : '';
  infoEl.innerHTML = `
    <b style="color:#c4a882;">${escapeHtml(persona.persona_name)}</b> <span style="color:#7c7466;">쨌 ${stepLabel}</span>
    ${persona.strata_label ? `<div style="color:#5c544a;">${escapeHtml(persona.strata_label)}</div>` : ''}
    <div style="color:#c0b8a4;margin-top:3px;">??${scene ? (scene.scene_order + 1) : '?'} 쨌 ?뺣젹??<b>${play.alignment != null ? (play.alignment * 100).toFixed(0) + '%' : '??}</b></div>
    <div>?닿툔?? ${escapeHtml(play.mismatch_type || '??)}</div>
    <div style="color:#7c7466;">媛먯젙 top3: ${top3 || '??}</div>
    ${scene ? `<div style="color:#5c544a;margin-top:3px;">${escapeHtml((scene.text || '').slice(0, 50))}??/div>` : ''}`;
}

// 260730 寃??B?? 2D SVG 洹몃옒???붿쭊 ?꾩껜 ?????dagre ?덉씠?꾩썐 ?뚮뜑쨌?몃뱶 ?쒕옒洹맞룹쨲???// 耳?대툝/釉뚮┸吏 ?ｌ? 洹몃━湲걔톅A 吏??諛곌꼍 紐⑤뱶쨌?몃뱶 ?꾩튂 localStorage ??? ?꾩튂 stage 3D 酉??⑤룆.

// ??? ?뷀뀒???⑤꼸 ???????????????????????????????????????????
function selectScene(s) {
  state.selectedSceneId = s.id;
  renderDetail(s);
}

// 260730 寃??B?? 寃쎈줈 鍮꾧탳 ??????????몄쭛 ?⑥씪 ?⑤꼸.
function renderDetail(s) {
  const container = document.getElementById('tvDetail');
  const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);

  const headerHtml = `
    <div style="font-family:'Cormorant Garamond';font-size:1.4rem;color:#c4a882;margin-bottom:4px;">${code}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:14px;">scene_order ${s.scene_order}</div>
  `;

  container.innerHTML = headerHtml + renderDetailTab(s);

  // ?몄쭛 紐⑤뱶 ?대깽??諛붿씤??  bindDetailFormEvents(s);
}

// ?붿긽 ?좊졊 ?몄쭛 ?⑤꼸 ?????몄쭛湲곗? 媛숈? ?먮━(#tvDetail), ?붿긽 ?꾩슜 UI (2026-05-16).
// ?붿긽 ?좊졊? scene row 媛 ?꾨땲??memories.ghost_condensation_points ??????
// ?몄쭛 ?꾨뱶: text(?붿긽 ?띿뒪?? / pollution_threshold(?깆옣 ?꾧퀎) / ??젣. ?꾩튂??吏???쒕옒洹?
function renderGhostDetail(ghostIdx) {
  const container = document.getElementById('tvDetail');
  if (!container) return;
  const gp = (typeof LumenAdminStageView.getGhostPoint === 'function')
    ? LumenAdminStageView.getGhostPoint(ghostIdx) : null;
  if (!gp) {
    container.innerHTML = '<div class="tv-detail-empty">?붿긽 ?좊졊??李얠쓣 ???놁뒿?덈떎.</div>';
    return;
  }
  const thr = gp.pollution_threshold != null ? gp.pollution_threshold : 0;

  container.innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#c8c8d0;margin-bottom:4px;">?붿긽 ?좊졊 P${ghostIdx}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:16px;">醫뚰몴 (${gp.x.toFixed(1)}, ${gp.z.toFixed(1)}) 쨌 ?꾩튂??吏?뺤뿉??留덉빱瑜??쒕옒洹?/div>

    <label style="display:block;font-size:0.75rem;color:#c4a882;margin-bottom:6px;">?붿긽 ?띿뒪??<span style="color:#7c7466;">???좊룄???뚮Ц ??議곌컖</span></label>
    <textarea id="ghostTextInput" rows="3" placeholder="鍮꾩썙?먮㈃ 硫붾え由?echo_words ??먯꽌 鍮뚮젮?? style="width:100%;box-sizing:border-box;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(200,200,208,0.3);color:#e0d8c4;font-family:inherit;font-size:0.85rem;border-radius:3px;margin-bottom:16px;resize:vertical;">${escapeHtml(gp.text || '')}</textarea>

    <label style="display:block;font-size:0.75rem;color:#c4a882;margin-bottom:4px;">?깆옣 ?꾧퀎 (pollution_threshold)</label>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:8px;line-height:1.5;">硫붾え由ш? ?대쭔???ㅼ뿼?쇱빞 ???붿긽??play ?붾㈃???섑??? 0 = 泥섏쓬遺??</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:18px;">
      <input type="range" id="ghostThrInput" min="0" max="1" step="0.05" value="${thr}" style="flex:1;">
      <span id="ghostThrVal" style="font-size:0.8rem;color:#c8c8d0;min-width:34px;text-align:right;">${thr.toFixed(2)}</span>
    </div>

    <button id="ghostDeleteBtn" style="width:100%;padding:8px;background:rgba(201,122,106,0.12);border:1px solid rgba(201,122,106,0.4);color:#c97a6a;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.8rem;">???붿긽 ?좊졊 ??젣</button>
  `;

  const textInput = document.getElementById('ghostTextInput');
  if (textInput) {
    textInput.addEventListener('change', () => {
      LumenAdminStageView.updateGhostPoint(ghostIdx, { text: textInput.value });
    });
  }
  const thrInput = document.getElementById('ghostThrInput');
  const thrVal = document.getElementById('ghostThrVal');
  if (thrInput) {
    thrInput.addEventListener('input', () => {
      if (thrVal) thrVal.textContent = Number(thrInput.value).toFixed(2);
    });
    thrInput.addEventListener('change', () => {
      LumenAdminStageView.updateGhostPoint(ghostIdx, { pollution_threshold: Number(thrInput.value) });
    });
  }
  const delBtn = document.getElementById('ghostDeleteBtn');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!confirm('???붿긽 ?좊졊????젣?좉퉴??')) return;
      LumenAdminStageView.removeGhostPoint(ghostIdx);
      container.innerHTML = '<div class="tv-detail-empty">?붿긽 ?좊졊????젣?섏뿀?듬땲??</div>';
    });
  }
}

function bindDetailFormEvents(s) {
  // ???踰꾪듉
  const saveBtn = document.getElementById('sceneSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveScene(s));

  // ??젣 踰꾪듉
  const delBtn = document.getElementById('sceneDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', () => deleteScene(s));

  // ???쒖꽌 ?대룞 (???욎쑝濡?/ ???ㅻ줈)
  const upBtn = document.getElementById('sceneMoveUpBtn');
  if (upBtn) upBtn.addEventListener('click', () => moveSceneOrder(s, -1));
  const downBtn = document.getElementById('sceneMoveDownBtn');
  if (downBtn) downBtn.addEventListener('click', () => moveSceneOrder(s, 1));

  // ?ъ슫???쒕∼?ㅼ슫 ??URL ?낅젰移??곕룞
  const soundSelect = document.getElementById('sceneSoundSelect');
  const soundUrlInput = document.getElementById('sceneSoundUrl');
  if (soundSelect && soundUrlInput) {
    soundSelect.addEventListener('change', () => {
      if (soundSelect.value === '__custom__') {
        soundUrlInput.style.display = 'block';
        soundUrlInput.focus();
      } else {
        soundUrlInput.style.display = 'none';
        soundUrlInput.value = soundSelect.value;
      }
    });
  }

  // ?ъ슫??誘몃━?ｊ린
  const testBtn = document.getElementById('sceneSoundTestBtn');
  if (testBtn) testBtn.addEventListener('click', () => {
    const sel = document.getElementById('sceneSoundSelect');
    const inp = document.getElementById('sceneSoundUrl');
    const url = (sel && sel.value && sel.value !== '__custom__') ? sel.value : (inp?.value.trim() || '');
    const vol = parseFloat(document.getElementById('sceneSoundVolume').value) || 1;
    if (!url) { alert('?ъ슫?쒕? ?좏깮?섏꽭??'); return; }
    previewSound(url, vol);
  });

  // AI ?뚰뼢 ???꾨＼?꾪듃 珥덉븞 (??蹂몃Ц ??Claude)
  const soundDraftBtn = document.getElementById('sceneSoundDraftBtn');
  if (soundDraftBtn) soundDraftBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('sceneSoundGenStatus');
    const promptEl = document.getElementById('sceneSoundPrompt');
    const sceneText = (document.getElementById('sceneText')?.value || '').trim();
    if (!sceneText) { alert('??蹂몃Ц??癒쇱? 梨꾩슦?몄슂.'); return; }
    const motifs = (document.getElementById('sceneMotifs')?.value || '')
      .split(',').map(x => x.trim()).filter(Boolean);
    statusEl.textContent = '珥덉븞 諛쏅뒗 以묅?; statusEl.style.color = '#7c7466';
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.functions.invoke('generate-scene-sound', {
        body: { mode: 'draft', sceneText, motifs }
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      promptEl.value = (data && data.prompt) || '';
      statusEl.textContent = '??珥덉븞 ???ㅻ벉怨?[?앹꽦]';
      statusEl.style.color = '#6aa383';
    } catch (e) {
      console.error(e);
      statusEl.textContent = '??' + (e.message || '珥덉븞 ?ㅽ뙣');
      statusEl.style.color = '#b85540';
    }
  });

  // AI ?뚰뼢 ???앹꽦 (?꾨＼?꾪듃 ??ElevenLabs ??Storage)
  const soundGenBtn = document.getElementById('sceneSoundGenBtn');
  if (soundGenBtn) soundGenBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('sceneSoundGenStatus');
    const promptEl = document.getElementById('sceneSoundPrompt');
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) { alert('?ъ슫???꾨＼?꾪듃瑜?梨꾩슦?몄슂 ([珥덉븞] 踰꾪듉 ?먮뒗 吏곸젒 ?낅젰).'); return; }
    statusEl.textContent = '?앹꽦 以묅?(10~20珥?'; statusEl.style.color = '#7c7466';
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.functions.invoke('generate-scene-sound', {
        body: { mode: 'generate', prompt, sceneId: s.id }
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      const url = data && data.soundUrl;
      if (!url) throw new Error('soundUrl ?놁쓬');
      // 寃곌낵 URL ??custom URL 移?+ ?쒕∼?ㅼ슫??諛섏쁺
      const sel = document.getElementById('sceneSoundSelect');
      const inp = document.getElementById('sceneSoundUrl');
      if (sel) sel.value = '__custom__';
      if (inp) { inp.value = url; inp.style.display = 'block'; }
      statusEl.textContent = '???앹꽦??????誘몃━?ｊ린濡??뺤씤 ?????;
      statusEl.style.color = '#6aa383';
    } catch (e) {
      console.error(e);
      statusEl.textContent = '??' + (e.message || '?앹꽦 ?ㅽ뙣');
      statusEl.style.color = '#b85540';
    }
  });

  // 釉뚮┸吏 異붽?
  const addBtn = document.getElementById('bridgeAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (!s.meta) s.meta = {};
    if (!Array.isArray(s.meta.author_bridges)) s.meta.author_bridges = [];
    s.meta.author_bridges.push({ id: `ab-${Date.now()}`, text: '', reveal_hint: '' });
    renderDetail(s); // ?щ젋??  });

  // 釉뚮┸吏 ??젣
  document.querySelectorAll('.bridgeDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (s.meta?.author_bridges) {
        s.meta.author_bridges.splice(idx, 1);
        renderDetail(s);
      }
    });
  });

  // 遺???쒖빟 異붽?
  // 260730: ?덉쟾??s.meta.exclusions ???ｌ뿀?붾뜲 ?붾㈃? s.exclusions 瑜?癒쇱? ?쎌뼱??
  // 議곌굔???대? ?덈뒗 ?ъ뿉?쒕뒗 [+ ?? ???뚮윭???꾨Т ?쇰룄 ???쇱뼱?섎뒗 寃껋쿂??蹂댁??? ?뺣낯 ?먮━濡??듭씪.
  document.querySelectorAll('.exclusion-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // DOM ?곹깭 癒쇱? ?섍굅 (?ㅻⅨ row ?몄쭛 ?좎?). 紐?洹몃┛ 議곌굔? ?ㅼ뿉 ?몃젮 ?⑤떎.
      const current = collectExclusionsFromDOM(s.id) || [];
      const type = btn.dataset.type;
      const added = [];
      if (type === 'emotion_threshold') added.push({ condition: { type, emotion: 'fear', min: 0.6 } });
      else if (type === 'contamination_stage') added.push({ condition: { type, stage: 'hypercompletion' } });
      else if (type === 'visited_scene') {
        const firstOrder = state.scenes?.[0]?.scene_order ?? 0;
        added.push({ condition: { type, sceneIndex: firstOrder } });
      }
      // 洹몃┫ ???덈뒗 議곌굔? ?욎そ, 紐?洹몃━??蹂닿?遺꾩? ?ㅼそ ?????됱? 洹몃┫ ???덈뒗 寃껊뱾 ?앹뿉 遺숈씤??
      const keepCount = (state._unrenderedExclusions && state._unrenderedExclusions.sceneId === s.id)
        ? state._unrenderedExclusions.items.length : 0;
      const head = keepCount ? current.slice(0, current.length - keepCount) : current;
      const tail = keepCount ? current.slice(current.length - keepCount) : [];
      s.exclusions = head.concat(added, tail);
      if (s.meta) delete s.meta.exclusions; // ?덇굅???먮━ 泥?냼
      renderDetail(s);
    });
  });

  // 遺???쒖빟 ??젣
  document.querySelectorAll('#sceneExclusionsList .exRow-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = collectExclusionsFromDOM(s.id) || [];
      const idx = parseInt(btn.dataset.idx, 10);
      current.splice(idx, 1); // data-idx = ?붾㈃??洹몃젮吏????쒖꽌 = current ?욎そ ?쒖꽌? ?쇱튂
      s.exclusions = current;
      if (s.meta) delete s.meta.exclusions;
      renderDetail(s);
    });
  });
}

async function saveScene(s) {
  const statusEl = document.getElementById('sceneSaveStatus');
  const text = document.getElementById('sceneText').value;
  const emo = {};
  document.querySelectorAll('.sceneEmoInput').forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) emo[inp.dataset.emo] = Math.min(1, Math.max(0, v));
  });
  const motifsStr = document.getElementById('sceneMotifs').value;
  const motifs = motifsStr.split(',').map(x => x.trim()).filter(Boolean);
  // 260730 ?щЪ ?꾩슜 紐⑸줉 ??3?곹깭 (???놁쓬 / 鍮?諛곗뿴 / 紐⑸줉). null = ?ㅻ? 吏?대떎????
  const objNone = !!document.getElementById('sceneObjectNone')?.checked;
  const objTagsRaw = (document.getElementById('sceneObjectTags')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const objectTags = objNone ? [] : (objTagsRaw.length ? objTagsRaw : null);
  // ?щЪ 臾몄옣 吏????"?⑥뼱: 臾몄옣" ??以꾩뵫. 肄쒕줎 泥?媛쒕쭔 援щ텇?먮줈 ?대떎 (臾몄옣 ??肄쒕줎 蹂댁〈).
  const objectLines = {};
  (document.getElementById('sceneObjectLines')?.value || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t) return;
    const i = t.indexOf(':');
    if (i <= 0) return;
    const w = t.slice(0, i).trim();
    const sentence = t.slice(i + 1).trim();
    if (w && sentence) objectLines[w] = sentence;
  });
  const sceneCode = document.getElementById('sceneCode').value.trim();
  const soundSelectEl = document.getElementById('sceneSoundSelect');
  const soundUrlInputEl = document.getElementById('sceneSoundUrl');
  const soundSelectVal = soundSelectEl?.value || '';
  const soundUrl = (soundSelectVal && soundSelectVal !== '__custom__')
    ? soundSelectVal
    : (soundUrlInputEl?.value.trim() || '');
  const soundVolume = parseFloat(document.getElementById('sceneSoundVolume')?.value) || 1;
  const soundRadius = parseFloat(document.getElementById('sceneSoundRadius')?.value) || 15;
  const soundPrompt = (document.getElementById('sceneSoundPrompt')?.value || '').trim();

  // 260730 Canvas ?듯빀 ?????꾩껜 ?쇱뿉留??덈뜕 移몃뱾
  const roleVal = document.getElementById('sceneRole')?.value || '';
  const ghostName = (document.getElementById('sceneGhostName')?.value || '').trim();
  const echoWords = (document.getElementById('sceneEchoWords')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const anchorEmotions = (document.getElementById('sceneAnchorEmotions')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const vScene = !!document.getElementById('sceneVoidScene')?.checked;
  const vEmotion = !!document.getElementById('sceneVoidEmotion')?.checked;
  const vReason = !!document.getElementById('sceneVoidReason')?.checked;
  const voidCount = (vScene ? 1 : 0) + (vEmotion ? 1 : 0) + (vReason ? 1 : 0);
  // ??洹쒖튃 洹몃?濡? ??媛??댁긽 泥댄겕硫?high, ?꾨땲硫?low. ?섎굹???놁쑝硫??듭㎏濡??놁쓬(null).
  const voidInfo = voidCount > 0
    ? { sceneVoid: vScene, emotionVoid: vEmotion, reasonVoid: vReason, voidLevel: voidCount > 1 ? 'high' : 'low' }
    : null;
  const stage1 = (document.getElementById('sceneStage1')?.value || '').trim();
  const stage2 = (document.getElementById('sceneStage2')?.value || '').trim();
  const stage3 = (document.getElementById('sceneStage3')?.value || '').trim();
  const originalReason = (document.getElementById('sceneOriginalReason')?.value || '').trim();

  // 遺???쒖빟 (DOM row?먯꽌 ?섍굅 + ?붾㈃??紐?洹몃┛ 議곌굔 蹂댁〈)
  const exclusions = collectExclusionsFromDOM(s.id);

  // 釉뚮┸吏 ?낅젰 ?섏쭛
  const bridges = [];
  document.querySelectorAll('.bridgeText').forEach((ta, i) => {
    const hintEl = document.querySelectorAll('.bridgeHint')[i];
    const txt = ta.value.trim();
    if (!txt) return;
    const existing = s.meta?.author_bridges?.[i] || {};
    bridges.push({
      id: existing.id || `ab-${Date.now()}-${i}`,
      text: txt,
      reveal_hint: hintEl ? hintEl.value.trim() : ''
    });
  });

  statusEl.textContent = '???以묅?;
  statusEl.style.color = '#7c7466';

  try {
    const sb = await getSupabaseClient();
    const newMeta = { ...(s.meta || {}) };
    newMeta.motif_tags = motifs;
    newMeta.author_bridges = bridges;
    // 260730 ?щЪ ?꾩슜 紐⑸줉쨌臾몄옣. null ?대㈃ ???먯껜瑜?吏??紐⑦떚???쒓렇 ?대갚?쇰줈 ?섎룎由곕떎.
    if (objectTags === null) delete newMeta.object_tags;
    else newMeta.object_tags = objectTags;
    if (Object.keys(objectLines).length) newMeta.object_lines = objectLines;
    else delete newMeta.object_lines;
    if (sceneCode) newMeta.scene_code = sceneCode;
    if (soundUrl) {
      newMeta.sound_url = soundUrl;
      newMeta.sound_volume = soundVolume;
      newMeta.sound_radius = soundRadius;
    } else {
      delete newMeta.sound_url;
      delete newMeta.sound_volume;
      delete newMeta.sound_radius;
    }
    // ?ъ슫???꾨＼?꾪듃??URL ?좊Т? 臾닿??섍쾶 蹂댁〈 ???섏쨷???ъ깮?깆슜
    if (soundPrompt) newMeta.sound_prompt = soundPrompt;
    else delete newMeta.sound_prompt;
    // ?좊졊 ?대쫫 ??meta ?덉뿉 ?곕떎. 鍮꾩슦硫????먯껜瑜?吏?대떎.
    if (ghostName) newMeta.ghost_name = ghostName;
    else delete newMeta.ghost_name;
    // 260730: ?좉툑? scenes.exclusions 而щ읆?????(?곸쁺???쎈뒗 ?뺣낯).
    // meta.exclusions ???곕뜕 寃고븿 寃쎈줈 ?먭린 ???⑥? ?덇굅???ㅻ뒗 ?????泥?냼.
    delete newMeta.exclusions;

    const patch = {
      text,
      emotion_dist: emo,
      emotion_vector: emo,
      // R1-5: jsonb 而щ읆??JSON.stringify 濡?臾몄옄?댁쓣 ?ｋ뜕 踰꾧렇 ??媛앹껜 洹몃?濡????
      // (臾몄옄?대줈 ?ㅼ뼱媛硫??뚮퉬?먮쭏??typeof 寃??+ JSON.parse ?댁쨷?붽? 媛뺤젣??
      original_emotion: emo,
      exclusions: exclusions,
      // 260730 Canvas ?듯빀 ???꾨옒 7媛쒕뒗 ?덉쟾?????쇱뿉?쒕쭔 ??λ릺??而щ읆
      scene_role: roleVal || null,
      echo_words: echoWords,
      anchor_emotions: anchorEmotions.length ? anchorEmotions : null,
      void_info: voidInfo,
      text_stage_1: stage1 || null,
      text_stage_2: stage2 || null,
      text_stage_3: stage3 || null,
      original_reason: originalReason || null,
      meta: newMeta,
    };
    const { error } = await sb.from('scenes').update(patch).eq('id', s.id);
    if (error) throw error;

    // 濡쒖뺄 state ?낅뜲?댄듃 ??DB 濡?蹂대궦 媛믨낵 ?붾㈃???닿툔?섏? ?딄쾶 ?꾨? 諛섏쁺
    Object.assign(s, patch);

    statusEl.textContent = '????λ맖';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);

    // ?꾩튂 stage 酉??щ룞湲고솕 (肄붾뱶/媛먯젙 諛붾뚮㈃ ? ?쇰꺼쨌?꾩튂 媛깆떊)
    syncStageView();
  } catch (e) {
    console.error(e);
    statusEl.textContent = '??' + e.message;
    statusEl.style.color = '#b85540';
  }
}

function renderDetailTab(s) {
  const authorBridges = (s.meta && Array.isArray(s.meta.author_bridges)) ? s.meta.author_bridges : [];
  const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);
  const motifs = (s.meta && Array.isArray(s.meta.motif_tags)) ? s.meta.motif_tags : [];
  const emo = s.original_emotion ? (typeof s.original_emotion === 'string' ? safeJsonParse(s.original_emotion) : s.original_emotion) : (s.emotion_dist || {});

  // ?몄쭛 ??  const inputStyle = `width:100%;box-sizing:border-box;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;`;
  const labelStyle = `font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;display:block;margin-top:14px;`;
  // R1-5 (2026-07-14): 8異??섎뱶肄붾뵫 ??17異?(?붿쭊 ?먮떒 異뺢낵 ?숈씪 紐⑸줉). 8異뺣쭔 洹몃━硫?  // saveScene ???붾㈃???녿뒗 異뺤쓣 議곗슜???섎씪癒뱀뿀??(?꾨옒 emo ?섏쭛???낅젰移?湲곗??대씪).
  // ?ъ뿉 ?대? ?덈뒗 鍮꾪몴以 異?longing ???덇굅??? ?ㅼ뿉 遺숈뿬 ?몄쭛 媛?ν븯寃??좎?.
  const EMO_KEYS = [...DEFAULT_EMOTION_ANCHORS];
  Object.keys(emo || {}).forEach(k => { if (!EMO_KEYS.includes(k)) EMO_KEYS.push(k); });
  const helpStyle = `font-size:0.66rem;color:#5c544a;line-height:1.5;margin-top:3px;`;
  const roleVal = s.scene_role || '';
  const vi = s.void_info || {};
  // ?듭빱 媛먯젙쨌?뷀뼢 ?⑥뼱 ??諛곗뿴/臾몄옄?????뺥깭 紐⑤몢 ?ㅼ뼱???대젰???덈떎. ????諛쏆븘以??
  const anchorStr = Array.isArray(s.anchor_emotions) ? s.anchor_emotions.join(', ') : String(s.anchor_emotions || '');
  const echoStr = Array.isArray(s.echo_words) ? s.echo_words.join(', ') : String(s.echo_words || '');
  // 260730 ?щЪ ?꾩슜 移???3?곹깭: ???놁쓬(紐⑦떚???쒓렇 ?곕쫫) / 鍮?諛곗뿴(?щЪ ?놁쓬) / 紐⑸줉
  const hasObjTagsKey = !!(s.meta && Array.isArray(s.meta.object_tags));
  const objTagStr = hasObjTagsKey ? s.meta.object_tags.join(', ') : '';
  const objLines = (s.meta && s.meta.object_lines && typeof s.meta.object_lines === 'object') ? s.meta.object_lines : {};
  const objLinesStr = Object.keys(objLines).map(k => `${k}: ${objLines[k]}`).join('\n');
  const stageOpen = tvSectionOpen('sceneStageBody', false);
  // ???쒖꽌 ?대룞 ??寃쎄퀎?먯꽌??紐??꾨Ⅴ寃?  const ordered = state.scenes.slice().sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
  const myIdx = ordered.findIndex(x => x.id === s.id);
  const canUp = myIdx > 0;
  const canDown = myIdx >= 0 && myIdx < ordered.length - 1;
  // ???몄쭛湲곌? 紐?洹몃━??議곌굔??紐?媛쒖씤吏 (?????蹂댁〈?????덈궡留?.
  // splitExclusions 媛 state._unrenderedExclusions ??蹂닿?源뚯? ?댁???(?꾨옒 renderExclusionRows ? 媛숈? 怨꾩궛).
  splitExclusions(s);
  const unrenderedCount = state._unrenderedExclusions.items.length;

  return `
    <label style="${labelStyle}margin-top:0;">??븷 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">?????ъ씠 ?먮낯?몄? ?붿긽?몄? (scene_role)</span></label>
    <select id="sceneRole" style="${inputStyle}">
      <option value=""${roleVal === '' ? ' selected' : ''}>??븷 ?놁쓬</option>
      <option value="anchor"${roleVal === 'anchor' ? ' selected' : ''}>?먮낯 (anchor)</option>
      <option value="residual"${roleVal === 'residual' ? ' selected' : ''}>?붿긽 (residual)</option>
    </select>

    <label style="${labelStyle}">?좊졊 ?대쫫 (?묒큺 ???쒕윭??</label>
    <input type="text" id="sceneGhostName" value="${escapeHtml(s.meta?.ghost_name || '')}" placeholder="?? 以?? ?꾨쭏, 洹??щ엺" style="${inputStyle}" />
    <div style="${helpStyle}">鍮꾩썙????</div>

    <label style="${labelStyle}">蹂몃Ц</label>
    <textarea id="sceneText" rows="6" style="${inputStyle}resize:vertical;line-height:1.5;">${escapeHtml(s.text || '')}</textarea>

    <label style="${labelStyle}">媛먯젙 遺꾪룷 (0~1)</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      ${EMO_KEYS.map(k => `
        <label style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:#a09886;">
          <span style="width:54px;flex-shrink:0;">${k}</span>
          <input type="number" class="sceneEmoInput" data-emo="${k}" min="0" max="1" step="0.05" value="${(emo[k] != null ? emo[k] : 0).toFixed(2)}" style="flex:1;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-family:inherit;font-size:0.75rem;border-radius:2px;" />
        </label>
      `).join('')}
    </div>

    <label style="${labelStyle}">?뷀뼢 ?⑥뼱 (?쇳몴 援щ텇)</label>
    <input type="text" id="sceneEchoWords" value="${escapeHtml(echoStr)}" placeholder="臾댁꽌?좎뼱, 誘몄븞?? ?꾪쉶?덉뼱" style="${inputStyle}" />
    <div style="${helpStyle}">????二쇰????좎삤瑜대뒗 ?깅쭚 (echo_words).</div>

    <label style="${labelStyle}">?듭빱 媛먯젙 (?쇳몴 援щ텇)</label>
    <input type="text" id="sceneAnchorEmotions" value="${escapeHtml(anchorStr)}" placeholder="fear, guilt, longing" style="${inputStyle}" />
    <div style="${helpStyle}">???ъ뿉??痢≪젙??媛먯젙. 鍮꾩슦硫?湲곕낯 17異? ?붿쭊 ?먯젙 異뺤씠 ?ш린??醫곹?吏?(anchor_emotions).</div>

    <label style="${labelStyle}">移⑤У (VOID)</label>
    <div style="display:flex;flex-direction:column;gap:3px;font-size:0.74rem;color:#a09886;">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidScene"${vi.sceneVoid ? ' checked' : ''} /> ?λ㈃??鍮꾩뼱 ?덉쓬 (sceneVoid)</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidEmotion"${vi.emotionVoid ? ' checked' : ''} /> 媛먯젙??鍮꾩뼱 ?덉쓬 (emotionVoid)</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidReason"${vi.reasonVoid ? ' checked' : ''} /> ?댁쑀媛 鍮꾩뼱 ?덉쓬 (reasonVoid)</label>
    </div>
    <div style="${helpStyle}">泥댄겕??異뺤? 愿媛앹씠 鍮꾩썙???먮━濡?痍④툒 ???뚰뵾 ?먯젙쨌吏??援щ뜦?댁뿉 ?곗엫. ??媛??댁긽 泥댄겕?섎㈃ ?먮룞?쇰줈 '源딆쓬(high)'.</div>

    <label style="${labelStyle}">?먮낯 ?댁쑀</label>
    <input type="text" id="sceneOriginalReason" value="${escapeHtml(s.original_reason || '')}" placeholder="?? ?닿? ?대┫ ???덉뿀?붾뜲?? style="${inputStyle}" />
    <div style="${helpStyle}">?묎?媛 湲곕줉???댁쑀 臾몄옣. 洹???議곗뿉 ?곗엫 (original_reason).</div>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('sceneStageBody', this)"><span class="tv-caret">${stageOpen ? '?? : '??}</span> ?ㅼ뿼 踰꾩쟾 ?띿뒪??(stage 1/2/3)</div>
    <div id="sceneStageBody" style="display:${stageOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">愿媛??ㅼ뿼?꾧? ?ㅻⅤ硫?蹂몃Ц ?????臾몄옣???щ떎. 鍮꾩슦硫??먮Ц ?좎?. ?ъ깮?깆? ?踰꾩쟾 ?몄쭛湲?諛깆뾽)?먯꽌.</div>
      <label style="${labelStyle}margin-top:0;">1?④퀎 ???명뼢</label>
      <textarea id="sceneStage1" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_1 || '')}</textarea>
      <label style="${labelStyle}">2?④퀎 ???댁꽍 蹂묒튂</label>
      <textarea id="sceneStage2" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_2 || '')}</textarea>
      <label style="${labelStyle}">3?④퀎 ??怨쇱셿寃?/label>
      <textarea id="sceneStage3" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_3 || '')}</textarea>
    </div>

    <label style="${labelStyle}">紐⑦떚???쒓렇 (?쇳몴 援щ텇)</label>
    <input type="text" id="sceneMotifs" value="${escapeHtml(motifs.join(', '))}" style="${inputStyle}" />
    <div style="${helpStyle}">?섏깉源 ?먯젙쨌????щ즺쨌?꾩뭅?대툕 寃?됱씠 ?④퍡 ?곕뒗 紐⑸줉. 吏?뺤뿉 ?몄슱 臾쇨굔留??곕줈 ?뺥븯?ㅻ㈃ ?꾨옒 移몄쓣 ??寃?</div>

    <label style="${labelStyle}">?щЪ ?쒓렇 ??吏?뺤뿉 ?몄슱 臾쇨굔留?(?쇳몴 援щ텇)</label>
    <input type="text" id="sceneObjectTags" value="${escapeHtml(objTagStr)}" style="${inputStyle}" ${hasObjTagsKey && !objTagStr ? 'disabled' : ''} />
    <label style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:0.72rem;color:#9a9080;cursor:pointer;">
      <input type="checkbox" id="sceneObjectNone" ${hasObjTagsKey && !objTagStr ? 'checked' : ''}
             onchange="document.getElementById('sceneObjectTags').disabled = this.checked;" />
      ???ъ뿏 ?щЪ ?놁쓬 (?쇰????꾨Т寃껊룄 ???몄?)
    </label>
    <div style="${helpStyle}">鍮꾩썙?먮㈃ ?꾩쓽 紐⑦떚???쒓렇瑜?洹몃?濡??ъ슜. ?ш린???곸쑝硫?吏???щЪ? ??紐⑸줉留??곕Ⅴ怨? 紐⑦떚???쒓렇???섏깉源쨌??붋룰??됱뿉留??곗씤??</div>

    <label style="${labelStyle}">?щЪ 臾몄옣 吏??(??以꾩뿉 <b>?⑥뼱: 臾몄옣</b>)</label>
    <textarea id="sceneObjectLines" rows="3" style="${inputStyle}resize:vertical;" placeholder="?ы떚: ?덉씠?ㅺ? ?덈쾮吏瑜?湲곸뿀怨? ?곕㈃ 鍮꾩쫰媛 ?댁쓣 ?뚮???">${escapeHtml(objLinesStr)}</textarea>
    <div style="${helpStyle}">?щЪ??湲멸쾶 ?뚮윭 ?ㅼ뿬?ㅻ낵 ???⑤뒗 臾몄옣. ???곸쑝硫???蹂몃Ц?먯꽌 洹??⑥뼱媛 ??臾몄옣???먮룞?쇰줈 怨⑤씪 ?대떎. 諛섏쟾湲?臾몄옣??肄?吏묒쓣 ?뚮쭔 ?ъ슜.</div>

    <label style="${labelStyle}">??肄붾뱶 (A, B, C??</label>
    <input type="text" id="sceneCode" value="${escapeHtml(s.meta?.scene_code || '')}" maxlength="4" style="${inputStyle}width:80px;" />

    <label style="${labelStyle}">?ъ슫??(怨듦컙?뚰뼢)</label>
    <select id="sceneSoundSelect" style="${inputStyle}">
      <option value="">???놁쓬 ??/option>
      ${window.TEM_SOUND_LIBRARY ? window.TEM_SOUND_LIBRARY.map(f => `<option value="${escapeHtml(f)}" ${s.meta?.sound_url === f ? 'selected' : ''}>${escapeHtml(f.replace(/^sounds\//, ''))}</option>`).join('') : ''}
      <option value="__custom__" ${s.meta?.sound_url && !(window.TEM_SOUND_LIBRARY || []).includes(s.meta.sound_url) ? 'selected' : ''}>??吏곸젒 ?낅젰??/option>
    </select>
    <input type="text" id="sceneSoundUrl" placeholder="寃쎈줈 ?먮뒗 https://..." value="${escapeHtml(s.meta?.sound_url || '')}" style="${inputStyle}margin-top:4px;display:${s.meta?.sound_url && !(window.TEM_SOUND_LIBRARY || []).includes(s.meta.sound_url) ? 'block' : 'none'};" />
    <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
      <label style="font-size:0.7rem;color:#7c7466;">蹂쇰ⅷ</label>
      <input type="number" id="sceneSoundVolume" min="0" max="1" step="0.1" value="${s.meta?.sound_volume ?? 1}" style="width:60px;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-size:0.75rem;border-radius:2px;" />
      <label style="font-size:0.7rem;color:#7c7466;">諛섍꼍</label>
      <input type="number" id="sceneSoundRadius" min="1" max="100" step="1" value="${s.meta?.sound_radius ?? 15}" style="width:60px;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-size:0.75rem;border-radius:2px;" title="??諛섍꼍 ?덉뿉 ?뚮젅?댁뼱媛 ?ㅻ㈃ 理쒕? 蹂쇰ⅷ" />
      <button class="tv-toggle" id="sceneSoundTestBtn" style="padding:3px 10px;font-size:0.7rem;">??誘몃━?ｊ린</button>
    </div>
    <div style="margin-top:6px;padding:8px;background:rgba(196,168,130,0.04);border:1px solid rgba(196,168,130,0.12);border-radius:2px;">
      <div style="font-size:0.66rem;color:#7c7466;margin-bottom:4px;line-height:1.4;">
        AI ?뚰뼢 ?앹꽦 ????蹂몃Ц?먯꽌 ?뚮━ ?꾨＼?꾪듃 珥덉븞??諛쏆븘 ?ㅻ벉? ???앹꽦. 寃곌낵????URL 移몄뿉 ?ㅼ뼱媛?
      </div>
      <textarea id="sceneSoundPrompt" rows="2" placeholder="?ъ슫???꾨＼?꾪듃 (?곸뼱) ??[珥덉븞] 踰꾪듉?쇰줈 梨꾩슦嫄곕굹 吏곸젒 ?낅젰" style="${inputStyle}resize:vertical;font-size:0.72rem;">${escapeHtml(s.meta?.sound_prompt || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
        <button class="tv-toggle" id="sceneSoundDraftBtn" style="padding:3px 10px;font-size:0.7rem;">??珥덉븞</button>
        <button class="tv-toggle" id="sceneSoundGenBtn" style="padding:3px 10px;font-size:0.7rem;">?렦 ?앹꽦</button>
        <span id="sceneSoundGenStatus" style="font-size:0.68rem;color:#7c7466;"></span>
      </div>
    </div>

    <label style="${labelStyle}">???ъ씠 ?⑥? ?딆쓣 議곌굔</label>
    <div style="font-size:0.68rem;color:#7c7466;margin-bottom:6px;line-height:1.4;">
      ?꾨옒 議곌굔 以??섎굹?쇰룄 留욎쑝硫????ъ? 沅ㅼ쟻 ?꾨낫?먯꽌 鍮좎쭚. ?뚮젅?댁뼱?먭쾺 ?댁쑀媛 ??蹂댁엫.
    </div>
    <div id="sceneExclusionsList">
      ${renderExclusionRows(s, EMO_KEYS)}
    </div>
    ${unrenderedCount ? `<div style="font-size:0.68rem;color:#9d8a4a;background:rgba(157,138,74,0.08);border:1px solid rgba(157,138,74,0.25);border-radius:2px;padding:5px 7px;margin-top:5px;line-height:1.5;">???ъ뿉?????몄쭛湲곌? 紐?洹몃━??議곌굔 ${unrenderedCount}媛쒓? ?덉쓬 ????ν빐??<b>蹂댁〈??/b>. ?몄쭛? ?踰꾩쟾 ?몄쭛湲곗뿉??</div>` : ''}
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
      <button class="tv-toggle exclusion-add-btn" data-type="emotion_threshold" style="padding:3px 8px;font-size:0.7rem;">+ 媛먯젙 媛뺣룄</button>
      <button class="tv-toggle exclusion-add-btn" data-type="contamination_stage" style="padding:3px 8px;font-size:0.7rem;">+ ?ㅼ뿼 ?④퀎</button>
      <button class="tv-toggle exclusion-add-btn" data-type="visited_scene" style="padding:3px 8px;font-size:0.7rem;">+ ??諛⑸Ц</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;flex-wrap:wrap;">
      <button class="tv-toggle" id="sceneSaveBtn" style="padding:6px 14px;font-size:0.78rem;">???/button>
      <button class="tv-toggle" id="sceneDeleteBtn" style="padding:6px 14px;font-size:0.78rem;color:#b85540;border-color:rgba(184,85,64,0.3);">????젣</button>
      <button class="tv-toggle" id="sceneMoveUpBtn" style="padding:6px 10px;font-size:0.78rem;" title="??移??욎쑝濡?${canUp ? '' : ' disabled'}>??/button>
      <button class="tv-toggle" id="sceneMoveDownBtn" style="padding:6px 10px;font-size:0.78rem;" title="??移??ㅻ줈"${canDown ? '' : ' disabled'}>??/button>
      <span id="sceneSaveStatus" style="font-size:0.7rem;color:#7c7466;"></span>
    </div>
    <div style="font-size:0.66rem;color:#5c544a;line-height:1.6;margin-top:10px;padding-top:8px;border-top:1px solid rgba(196,168,130,0.06);">
      ?????덇굅??移??좏깮吏쨌?좊졊 ???룹씠??踰≫꽣쨌?????? ?ㅻ퉬諛?[?踰꾩쟾 ?몄쭛湲? 諛깆뾽?먯꽌 ?몄쭛.
      ?먮낯 ?뚮룞쨌3D 紐⑥뼇 誘몃━蹂닿린??媛?대뜲 3D 臾대?? 寃뱀퀜 ??린吏 ?딆쓬.
    </div>

    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(196,168,130,0.08);">
      <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">?뵕 ?묎? 釉뚮┸吏 (${authorBridges.length})</div>
      <div id="authorBridgesList">
        ${authorBridges.map((b, i) => `
          <div style="font-size:0.75rem;color:#c0b8a4;padding:8px 10px;border-left:2px solid #6a655a;background:rgba(106,101,90,0.08);margin-bottom:6px;position:relative;">
            <textarea class="bridgeText" data-idx="${i}" rows="2" style="width:100%;padding:4px 6px;background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.1);color:#c0b8a4;font-family:inherit;font-size:0.75rem;border-radius:2px;resize:vertical;">${escapeHtml(b.text || '')}</textarea>
            <input class="bridgeHint" data-idx="${i}" placeholder="reveal_hint (?좏깮)" value="${escapeHtml(b.reveal_hint || '')}" style="width:calc(100% - 60px);margin-top:4px;padding:3px 6px;background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.08);color:#c0b8a4;font-family:inherit;font-size:0.7rem;border-radius:2px;" />
            <button class="bridgeDel" data-idx="${i}" style="position:absolute;top:6px;right:6px;padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid rgba(184,85,64,0.3);color:#b85540;cursor:pointer;border-radius:2px;">??젣</button>
          </div>
        `).join('')}
      </div>
      <button class="tv-toggle" id="bridgeAddBtn" style="padding:4px 10px;font-size:0.7rem;margin-top:4px;">+ ?묎? 釉뚮┸吏 異붽?</button>
    </div>

    ${trajBridges.length ? `
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(196,168,130,0.08);">
      <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">?뙄 沅ㅼ쟻 釉뚮┸吏 (${trajBridges.length}) ???쎄린 ?꾩슜</div>
      ${trajBridges.map(b => `
        <div style="font-size:0.75rem;color:#a8c4d8;padding:8px 10px;border-left:2px solid #4a7c9d;background:rgba(74,124,157,0.08);margin-bottom:6px;">
          ${escapeHtml(b.source_completed_sentence || '(蹂몃Ц ?놁쓬)')}
          <div style="font-size:0.65rem;color:#7c7466;margin-top:4px;">吏꾩엯: ${b.entry_emotion}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;
}

function safeJsonParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

const EMOTION_LABELS_KO = {
  fear: '?먮젮?', sadness: '?ы뵒', anger: '遺꾨끂', guilt: '二꾩콉媛?,
  shame: '?섏튂', longing: '媛덈쭩', numbness: '臾닿컧媛?, isolation: '怨좊┰'
};
const STAGE_OPTIONS = [
  { v: 'biased_inclination', l: '?명뼢 (biased_inclination)' },
  { v: 'hypercompletion', l: '怨쇱엵 ?꾧껐 (hypercompletion)' },
  { v: 'stable', l: '?덉젙 (stable)' },
];

// ???⑤꼸??洹몃┫ 以??꾨뒗 議곌굔 醫낅쪟. ??諛뽰쓽 寃????쇱뿉???먯쑀 JSON ?쇰줈 ?ｌ? 議곌굔 ???
// ?붾㈃??紐?洹몃━誘濡??곕줈 蹂닿??덈떎媛 ??ν븷 ??洹몃?濡??섎룎??遺숈씤??????洹몃윭硫?議곗슜??吏?뚯쭊??
const RENDERABLE_EXCLUSION_TYPES = ['emotion_threshold', 'contamination_stage', 'visited_scene'];

function exclusionListOf(s) {
  // 260730: ?뺣낯 = scenes.exclusions 而щ읆 (?곸쁺 play-test 媛 ?쎈뒗 ?좎씪???먮━).
  // meta.exclusions ?????⑤꼸???섎せ ?곕뜕 ?덇굅?????쒖떆 ?대갚?쇰줈留??④?.
  return Array.isArray(s.exclusions) ? s.exclusions
    : (Array.isArray(s.meta?.exclusions) ? s.meta.exclusions : []);
}

// 紐?洹몃━??議곌굔??state ??梨숆꺼?먭퀬, 洹몃┫ ???덈뒗 寃껊쭔 ?뚮젮以??
function splitExclusions(s) {
  const list = exclusionListOf(s);
  const drawable = [];
  const kept = [];
  list.forEach(entry => {
    const t = entry && entry.condition && entry.condition.type;
    if (RENDERABLE_EXCLUSION_TYPES.includes(t)) drawable.push(entry);
    else kept.push(entry);
  });
  state._unrenderedExclusions = { sceneId: s.id, items: kept };
  return drawable;
}

function renderExclusionRows(s, emoKeys) {
  const list = splitExclusions(s);
  if (list.length === 0) {
    return `<div style="font-size:0.72rem;color:#5c544a;padding:6px 0;font-style:italic;">議곌굔 ?놁쓬 ????긽 ?꾨낫???ы븿??/div>`;
  }
  const rowStyle = `background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.1);border-radius:3px;padding:6px 8px;margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
  const selStyle = `padding:2px 4px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-size:0.72rem;border-radius:2px;font-family:inherit;`;
  const reasonStyle = `flex:1;min-width:80px;padding:2px 4px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.1);color:#a09886;font-size:0.7rem;border-radius:2px;font-family:inherit;`;
  const delStyle = `padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid rgba(184,85,64,0.3);color:#b85540;cursor:pointer;border-radius:2px;`;

  return list.map((entry, i) => {
    const c = entry.condition || {};
    const reason = escapeHtml(entry.reason || '');
    if (c.type === 'emotion_threshold') {
      const emoOpts = emoKeys.map(k => `<option value="${k}" ${c.emotion === k ? 'selected' : ''}>${EMOTION_LABELS_KO[k] || k}</option>`).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="emotion_threshold" style="${rowStyle}">
        <span style="font-size:0.72rem;color:#7c7466;">?뚮젅?댁뼱</span>
        <select class="exRow-emo" style="${selStyle}">${emoOpts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">媛</span>
        <input type="number" class="exRow-min" min="0" max="1" step="0.05" value="${Number(c.min ?? 0.6).toFixed(2)}" style="${selStyle}width:50px;" />
        <span style="font-size:0.72rem;color:#7c7466;">?댁긽????/span>
        <input type="text" class="exRow-reason" placeholder="硫붾え (?좏깮)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">??/button>
      </div>`;
    }
    if (c.type === 'contamination_stage') {
      const opts = STAGE_OPTIONS.map(o => `<option value="${o.v}" ${c.stage === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="contamination_stage" style="${rowStyle}">
        <span style="font-size:0.72rem;color:#7c7466;">?ㅼ뿼 ?④퀎媛</span>
        <select class="exRow-stage" style="${selStyle}">${opts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">????/span>
        <input type="text" class="exRow-reason" placeholder="硫붾え (?좏깮)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">??/button>
      </div>`;
    }
    if (c.type === 'visited_scene') {
      const sceneOpts = (state.scenes || []).map(sc => {
        const lbl = sc.meta?.scene_code || `??${sc.scene_order}`;
        return `<option value="${sc.scene_order}" ${Number(c.sceneIndex) === sc.scene_order ? 'selected' : ''}>${escapeHtml(lbl)}</option>`;
      }).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="visited_scene" style="${rowStyle}">
        <select class="exRow-scene" style="${selStyle}">${sceneOpts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">??瑜??대? 蹂???/span>
        <input type="text" class="exRow-reason" placeholder="硫붾え (?좏깮)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">??/button>
      </div>`;
    }
    return '';
  }).join('');
}

function collectExclusionsFromDOM(sceneId) {
  const rows = document.querySelectorAll('#sceneExclusionsList .exclusion-row');
  const result = [];
  rows.forEach(row => {
    const type = row.dataset.type;
    const reason = row.querySelector('.exRow-reason')?.value.trim() || '';
    let condition = null;
    if (type === 'emotion_threshold') {
      const emotion = row.querySelector('.exRow-emo')?.value;
      const min = parseFloat(row.querySelector('.exRow-min')?.value);
      if (emotion && !isNaN(min)) condition = { type, emotion, min };
    } else if (type === 'contamination_stage') {
      const stage = row.querySelector('.exRow-stage')?.value;
      if (stage) condition = { type, stage };
    } else if (type === 'visited_scene') {
      const sceneIndex = parseInt(row.querySelector('.exRow-scene')?.value, 10);
      if (!isNaN(sceneIndex)) condition = { type, sceneIndex };
    }
    if (condition) result.push(reason ? { condition, reason } : { condition });
  });
  // ?붾㈃??紐?洹몃┛ 議곌굔???ㅼ뿉 洹몃?濡?遺숈뿬 ?섏궡由곕떎 (議곗슜???좎떎 諛⑹?).
  const stash = state._unrenderedExclusions;
  const keep = (stash && (!sceneId || stash.sceneId === sceneId)) ? stash.items : [];
  const merged = keep.length ? result.concat(keep) : result;
  return merged.length > 0 ? merged : null;
}

// 260730 寃??B?? renderCompareTab(寃쎈줈 鍮꾧탳 ?? ?????媛먯젙 沅ㅼ쟻 ?좏깮 UI ?좏뻾 ??대줈 ??긽 鍮??곹깭???

// ??? ?좏떥 ??????????????????????????????????????????????????
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(msg) {
  const el = document.getElementById('tvStatus');
  if (el) el.textContent = msg;
}
