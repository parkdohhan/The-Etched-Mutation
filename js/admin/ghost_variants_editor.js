/**
 * V2-2: admin 유령 변주 풀 편집기 (V2.1 SCOPE §4)
 *
 * 작업 12 (memory 저작기) 확장. drift 발화 변주 + speciation 새 유령 시드 입력 도구.
 * admin.html 의 #ghostVariantsList 컨테이너에 카드형 UI 자체 attach.
 *
 * 의존:
 *   - js/lib/supabaseClient.js: getSupabaseClient
 *   - 운영 DB ghost_variants 테이블 (V2-1 마이그레이션, 2026-05-03 적용)
 *
 * 글로벌 export (admin.js 호출 위해):
 *   - window.loadGhostVariants(memoryId)  메모리 편집 진입 시. memoryId=null → 비활성.
 *   - window.unloadGhostVariants()        에디터 나가기 시 (선택).
 *
 * 저장 패턴: 카드별 즉시 supabase INSERT/UPDATE. 메모리 저장과 분리.
 *   (ghost_variants 는 별도 테이블이라 memories row 저장과 트랜잭션 묶지 않음.)
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';

// ─────────────────────────────────
// 상수 — V2-1 CHECK 제약 enum 정합
// ─────────────────────────────────

const ATTRIBUTIONS = ['self_blame', 'other_blame', 'fate_blame', 'unknown'];
const CORE_FEARS = ['abandonment', 'death', 'rejection', 'failure', 'none'];
const MODALITIES = ['visual', 'olfactory', 'auditory', 'somatic', 'narrative'];
const ROLES = ['actor', 'observer', 'victim'];

// emotion_vec 12축 — claude-scene emotion_extract 출력 키 정합
const EMOTION_KEYS = [
  'fear', 'sadness', 'anger', 'joy', 'longing', 'guilt',
  'shame', 'numbness', 'isolation', 'relief', 'confusion', 'emptiness',
];

// ─────────────────────────────────
// 모듈 상태
// ─────────────────────────────────

let _currentMemoryId = null;
let _variants = [];
let _container = null;
let _addBtn = null;
let _addBtnBound = false;

// ─────────────────────────────────
// 진입/종료
// ─────────────────────────────────

async function loadGhostVariants(memoryId) {
  _currentMemoryId = memoryId || null;
  _ensureContainerRef();
  if (!_container) return;
  _setSectionDisabled(!memoryId, memoryId ? null : '메모리를 먼저 저장한 후 변주를 추가할 수 있습니다.');
  if (!memoryId) {
    _variants = [];
    _renderList();
    return;
  }
  const sb = getSupabaseClient();
  if (!sb) {
    _showError('Supabase client unavailable.');
    return;
  }
  const { data, error } = await sb
    .from('ghost_variants')
    .select('*')
    .eq('memory_id', memoryId)
    .order('created_at', { ascending: true });
  if (error) {
    _showError('변주 풀 로드 실패: ' + error.message);
    _variants = [];
  } else {
    _variants = data || [];
  }
  _renderList();
}

function unloadGhostVariants() {
  _currentMemoryId = null;
  _variants = [];
  if (_container) _container.innerHTML = '';
}

// ─────────────────────────────────
// DOM 렌더
// ─────────────────────────────────

function _ensureContainerRef() {
  if (!_container) _container = document.getElementById('ghostVariantsList');
  if (!_addBtn) _addBtn = document.getElementById('addGhostVariantBtn');
  if (_addBtn && !_addBtnBound) {
    _addBtn.addEventListener('click', _onAddCard);
    _addBtnBound = true;
  }
}

function _setSectionDisabled(disabled, message) {
  const section = document.getElementById('ghostVariantsSection');
  if (section) section.style.opacity = disabled ? 0.5 : 1;
  if (_addBtn) _addBtn.disabled = !!disabled;
  const hint = document.getElementById('ghostVariantsHint');
  if (hint) {
    hint.textContent = message || '같은 메모리 안의 유령 인격 카드. drift = 같은 유령 발화 변주. speciation = 다른 path 가 만든 새 유령 시드. SeekerMatchEngine 매칭 입력.';
    hint.style.color = disabled ? '#d99' : 'var(--text-muted)';
  }
}

function _renderList() {
  if (!_container) return;
  _container.innerHTML = '';
  _variants.forEach((v, idx) => {
    _container.appendChild(_renderCard(v, idx));
  });
}

function _renderCard(variant, idx) {
  const card = document.createElement('div');
  card.className = 'ghost-variant-card';
  card.dataset.idx = idx;
  if (variant.id) card.dataset.id = variant.id;
  card.style.cssText = 'border:1px solid rgba(196,168,130,.3);border-radius:4px;padding:0.7rem;background:#0a0a0e;';

  const utteranceShort = (variant.utterance || '').slice(0, 30);
  const kindLabel = variant.kind === 'speciation' ? '⚛ speciation' : '~ drift';
  const headerHTML = `#${idx + 1} · ${kindLabel} · <span style="color:var(--text-muted);">${_escape(utteranceShort)}${(variant.utterance || '').length > 30 ? '…' : ''}</span>`;

  card.innerHTML = `
    <div class="gv-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
      <span class="gv-title" style="font-size:0.85rem;color:var(--accent-memory);">${headerHTML}</span>
      <span class="gv-actions" style="display:flex;gap:0.4rem;">
        <button type="button" class="gv-toggle" style="background:none;border:1px solid rgba(196,168,130,.3);color:var(--text-muted);padding:0.2rem 0.6rem;border-radius:3px;cursor:pointer;font-size:0.72rem;">펴기</button>
        ${variant.id ? '<button type="button" class="gv-delete" style="background:none;border:1px solid rgba(220,80,80,.4);color:#d66;padding:0.2rem 0.6rem;border-radius:3px;cursor:pointer;font-size:0.72rem;">삭제</button>' : ''}
      </span>
    </div>
    <div class="gv-body" style="display:none;margin-top:0.7rem;flex-direction:column;gap:0.5rem;">
      ${_renderCardBody(variant, idx)}
    </div>
  `;

  const header = card.querySelector('.gv-header');
  const body = card.querySelector('.gv-body');
  const toggleBtn = card.querySelector('.gv-toggle');
  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    _toggleBody(body, toggleBtn);
  });
  toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleBody(body, toggleBtn); });

  if (!variant.id) {
    body.style.display = 'flex';
    toggleBtn.textContent = '접기';
  }

  const delBtn = card.querySelector('.gv-delete');
  if (delBtn) {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('이 변주를 삭제하시겠습니까?')) return;
      _onDelete(variant, idx);
    });
  }

  card.querySelectorAll(`input[name="kind-${idx}"]`).forEach(input => {
    input.addEventListener('change', (e) => {
      const isSpec = e.target.value === 'speciation';
      const parentRow = card.querySelector('.gv-parent-row');
      if (parentRow) parentRow.style.display = isSpec ? 'flex' : 'none';
    });
  });

  card.querySelectorAll('.gv-emotion').forEach(input => {
    input.addEventListener('input', (e) => {
      const k = e.target.dataset.key;
      const display = card.querySelector(`.gv-emotion-display[data-key="${k}"]`);
      if (display) display.textContent = parseFloat(e.target.value).toFixed(2);
    });
  });

  card.querySelector('.gv-save').addEventListener('click', () => _onSave(card, idx));
  return card;
}

function _renderCardBody(variant, idx) {
  const e = variant.emotion_vec || {};
  const emotionRows = EMOTION_KEYS.map(k => `
    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.72rem;">
      <span style="display:inline-block;width:80px;color:var(--text-muted);">${k}</span>
      <input type="range" min="0" max="1" step="0.05" value="${e[k] != null ? e[k] : 0}" class="gv-emotion" data-key="${k}" style="flex:1;">
      <span class="gv-emotion-display" data-key="${k}" style="display:inline-block;width:40px;text-align:right;color:var(--accent-memory);">${(e[k] != null ? e[k] : 0).toFixed(2)}</span>
    </label>
  `).join('');

  const dropdown = (cls, options, selected) => `
    <select class="${cls}" style="background:#0a0a0e;border:1px solid rgba(196,168,130,.3);color:var(--text-fg);padding:0.3rem;border-radius:3px;font-size:0.78rem;">
      <option value="">— 미지정 —</option>
      ${options.map(o => `<option value="${o}"${selected === o ? ' selected' : ''}>${o}</option>`).join('')}
    </select>
  `;

  const parentOptions = _variants
    .filter(v => v.id && v.id !== variant.id)
    .map(v => {
      const short = (v.utterance || '').slice(0, 25);
      return `<option value="${v.id}"${variant.parent_variant_id === v.id ? ' selected' : ''}>${_escape(short)}…</option>`;
    }).join('');

  return `
    <div style="display:flex;gap:1rem;font-size:0.78rem;">
      <label><input type="radio" name="kind-${idx}" value="drift"${variant.kind !== 'speciation' ? ' checked' : ''}> drift (같은 유령 변주)</label>
      <label><input type="radio" name="kind-${idx}" value="speciation"${variant.kind === 'speciation' ? ' checked' : ''}> speciation (새 유령 시드)</label>
    </div>

    <div class="gv-parent-row" style="display:${variant.kind === 'speciation' ? 'flex' : 'none'};gap:0.4rem;align-items:center;font-size:0.78rem;">
      <span style="width:80px;color:var(--text-muted);">부모 변주</span>
      <select class="gv-parent" style="background:#0a0a0e;border:1px solid rgba(196,168,130,.3);color:var(--text-fg);padding:0.3rem;border-radius:3px;font-size:0.78rem;flex:1;">
        <option value="">없음 (root)</option>
        ${parentOptions}
      </select>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.4rem 1rem;font-size:0.78rem;">
      <label style="display:flex;align-items:center;gap:0.4rem;"><span style="width:80px;color:var(--text-muted);">귀인</span>${dropdown('gv-attribution', ATTRIBUTIONS, variant.attribution)}</label>
      <label style="display:flex;align-items:center;gap:0.4rem;"><span style="width:80px;color:var(--text-muted);">핵심 두려움</span>${dropdown('gv-core_fear', CORE_FEARS, variant.core_fear)}</label>
      <label style="display:flex;align-items:center;gap:0.4rem;"><span style="width:80px;color:var(--text-muted);">감각 양식</span>${dropdown('gv-modality', MODALITIES, variant.modality)}</label>
      <label style="display:flex;align-items:center;gap:0.4rem;"><span style="width:80px;color:var(--text-muted);">역할</span>${dropdown('gv-role', ROLES, variant.role)}</label>
    </div>

    <details style="border:1px dashed rgba(196,168,130,.2);padding:0.5rem;border-radius:3px;">
      <summary style="cursor:pointer;font-size:0.78rem;color:var(--accent-memory);">감정 12축 슬라이더</summary>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.3rem 1rem;margin-top:0.5rem;">
        ${emotionRows}
      </div>
    </details>

    <label style="display:flex;flex-direction:column;gap:0.2rem;font-size:0.78rem;">
      <span style="color:var(--text-muted);">키워드 (쉼표 구분)</span>
      <input type="text" class="gv-motif" value="${_escape((variant.motif_tags || []).join(', '))}" placeholder="엄마, 김치찌개, 잘했어야" style="background:#0a0a0e;border:1px solid rgba(196,168,130,.3);color:var(--text-fg);padding:0.3rem 0.5rem;border-radius:3px;font-size:0.78rem;">
    </label>

    <label style="display:flex;flex-direction:column;gap:0.2rem;font-size:0.78rem;">
      <span style="color:var(--text-muted);">발화 본문 (1~1000자) <span style="color:#d66;">*</span></span>
      <textarea class="gv-utterance" rows="3" maxlength="1000" required style="background:#0a0a0e;border:1px solid rgba(196,168,130,.3);color:var(--text-fg);padding:0.4rem 0.5rem;border-radius:3px;font-size:0.85rem;font-family:inherit;resize:vertical;">${_escape(variant.utterance || '')}</textarea>
    </label>

    <label style="display:flex;flex-direction:column;gap:0.2rem;font-size:0.78rem;">
      <span style="color:var(--text-muted);">자세 메타 (선택)</span>
      <input type="text" class="gv-pose" value="${_escape(variant.pose || '')}" placeholder="쪼그려 앉음, 등 돌림 ..." style="background:#0a0a0e;border:1px solid rgba(196,168,130,.3);color:var(--text-fg);padding:0.3rem 0.5rem;border-radius:3px;font-size:0.78rem;">
    </label>

    <div style="display:flex;justify-content:flex-end;margin-top:0.4rem;">
      <button type="button" class="gv-save" style="background:rgba(196,168,130,.2);border:1px solid var(--accent-memory);color:var(--accent-memory);padding:0.4rem 1.2rem;border-radius:3px;cursor:pointer;font-size:0.85rem;">저장</button>
    </div>
    <div class="gv-status" style="font-size:0.72rem;color:var(--text-muted);text-align:right;"></div>
  `;
}

function _toggleBody(body, btn) {
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'flex';
  btn.textContent = open ? '펴기' : '접기';
}

// ─────────────────────────────────
// 핸들러
// ─────────────────────────────────

function _onAddCard() {
  if (!_currentMemoryId) return;
  _variants.push({
    kind: 'drift',
    parent_variant_id: null,
    emotion_vec: {},
    attribution: null,
    core_fear: null,
    modality: null,
    role: null,
    motif_tags: [],
    utterance: '',
    pose: null,
    is_seed: true,
  });
  _renderList();
}

async function _onSave(card, idx) {
  const variant = _variants[idx];
  const data = _readCard(card);
  if (!data) return;

  const sb = getSupabaseClient();
  if (!sb) { _setCardStatus(card, 'Supabase client unavailable.', 'error'); return; }
  if (!_currentMemoryId) { _setCardStatus(card, '메모리 미저장 상태입니다.', 'error'); return; }

  const payload = {
    memory_id: _currentMemoryId,
    kind: data.kind,
    parent_variant_id: data.parent_variant_id,
    emotion_vec: data.emotion_vec,
    attribution: data.attribution,
    core_fear: data.core_fear,
    modality: data.modality,
    role: data.role,
    motif_tags: data.motif_tags,
    utterance: data.utterance,
    pose: data.pose,
    is_seed: true,
  };

  _setCardStatus(card, '저장 중...', null);
  let res;
  if (variant.id) {
    res = await sb.from('ghost_variants').update(payload).eq('id', variant.id).select().single();
  } else {
    res = await sb.from('ghost_variants').insert(payload).select().single();
  }
  if (res.error) {
    _setCardStatus(card, '저장 실패: ' + res.error.message, 'error');
    return;
  }

  _variants[idx] = res.data;
  _setCardStatus(card, `저장됨 (${new Date().toLocaleTimeString()})`, 'ok');

  // 헤더만 갱신 (펴기 상태 유지)
  const titleSpan = card.querySelector('.gv-title');
  const utteranceShort = (res.data.utterance || '').slice(0, 30);
  const kindLabel = res.data.kind === 'speciation' ? '⚛ speciation' : '~ drift';
  if (titleSpan) {
    titleSpan.innerHTML = `#${idx + 1} · ${kindLabel} · <span style="color:var(--text-muted);">${_escape(utteranceShort)}${(res.data.utterance || '').length > 30 ? '…' : ''}</span>`;
  }

  // 새 변주 첫 저장 = 삭제 버튼 추가
  if (!card.dataset.id) {
    card.dataset.id = res.data.id;
    const actions = card.querySelector('.gv-actions');
    if (actions && !actions.querySelector('.gv-delete')) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'gv-delete';
      delBtn.textContent = '삭제';
      delBtn.style.cssText = 'background:none;border:1px solid rgba(220,80,80,.4);color:#d66;padding:0.2rem 0.6rem;border-radius:3px;cursor:pointer;font-size:0.72rem;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('이 변주를 삭제하시겠습니까?')) return;
        _onDelete(_variants[idx], idx);
      });
      actions.appendChild(delBtn);
    }
  }
}

function _readCard(card) {
  const idx = parseInt(card.dataset.idx, 10);
  const kindInput = card.querySelector(`input[name="kind-${idx}"]:checked`);
  const kind = kindInput ? kindInput.value : 'drift';
  const parentSel = card.querySelector('.gv-parent');
  const parent_variant_id = (kind === 'speciation' && parentSel && parentSel.value) ? parentSel.value : null;

  const utterance = (card.querySelector('.gv-utterance')?.value || '').trim();
  if (!utterance) {
    _setCardStatus(card, '발화 본문 필수입니다.', 'error');
    return null;
  }
  if (utterance.length > 1000) {
    _setCardStatus(card, '발화 본문은 1000자 이하여야 합니다.', 'error');
    return null;
  }

  const emotion_vec = {};
  card.querySelectorAll('.gv-emotion').forEach(input => {
    const v = parseFloat(input.value);
    if (!isNaN(v) && v > 0) emotion_vec[input.dataset.key] = Number(v.toFixed(2));
  });

  const motif_tags = (card.querySelector('.gv-motif')?.value || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const _val = (sel) => {
    const s = card.querySelector(sel)?.value;
    return s || null;
  };
  const pose = (card.querySelector('.gv-pose')?.value || '').trim() || null;

  return {
    kind,
    parent_variant_id,
    emotion_vec,
    attribution: _val('.gv-attribution'),
    core_fear: _val('.gv-core_fear'),
    modality: _val('.gv-modality'),
    role: _val('.gv-role'),
    motif_tags,
    utterance,
    pose,
  };
}

async function _onDelete(variant, idx) {
  if (!variant.id) {
    _variants.splice(idx, 1);
    _renderList();
    return;
  }
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.from('ghost_variants').delete().eq('id', variant.id);
  if (error) {
    alert('삭제 실패: ' + error.message);
    return;
  }
  _variants.splice(idx, 1);
  _renderList();
}

function _setCardStatus(card, message, kind) {
  const status = card.querySelector('.gv-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = kind === 'error' ? '#d66' : (kind === 'ok' ? 'rgba(140,196,168,.9)' : 'var(--text-muted)');
}

function _showError(msg) {
  console.error('[ghost_variants_editor]', msg);
  const hint = document.getElementById('ghostVariantsHint');
  if (hint) { hint.textContent = msg; hint.style.color = '#d66'; }
}

function _escape(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}

// ─────────────────────────────────
// init
// ─────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _ensureContainerRef);
} else {
  _ensureContainerRef();
}

window.loadGhostVariants = loadGhostVariants;
window.unloadGhostVariants = unloadGhostVariants;
