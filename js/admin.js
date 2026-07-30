import { getSupabaseClient, waitForSupabaseClient } from './lib/supabaseClient.js';
import { loadAdminMemories, saveAdminMemories, exportAdminMemoriesJSON, importAdminMemoriesJSON } from './lib/storage.js';
import { listMemoriesWithScenesChoices, saveMemoryGraph, deleteMemoryGraph, listArchiveLayers } from './lib/repo.js';
import { DEFAULT_EMOTION_ANCHORS, emotionVectorToWaveStyle, cosineSimilarity } from './shared/math.js';
import { showToast } from './admin/toast.js';

// 저장 버튼(플로팅 + 하단) 일괄 잠금/해제 — 이중 클릭·중복 저장 방지 (W1-A)
function setSaveButtonsBusy(busy) {
    document.querySelectorAll('.floating-save-btn, .editor-save-btn').forEach(btn => {
        if (!btn) return;
        if (busy) {
            if (btn.dataset.origLabel == null) btn.dataset.origLabel = btn.textContent;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'progress';
            btn.textContent = '저장 중…';
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            if (btn.dataset.origLabel != null) { btn.textContent = btn.dataset.origLabel; delete btn.dataset.origLabel; }
        }
    });
}

let memories = [];
let currentScenes = [];
let currentMemoryIndex = null;
let currentMemoryId = null;
let previewCurrentScene = 0;
let previewWaveAnimationId = null;
let currentLayers = []; // Archive 레이어 추적
let adminUser = null; // 현재 인증된 관리자
const sceneWaveAnimationMap = new Map(); // sceneIndex -> requestAnimationFrame id

// 편집 dirty-flag — 저장 안 된 변경 사항 경고 (작업 12-5)
let editorDirty = false;
function markEditorDirty() { editorDirty = true; scheduleAutosave(); /* W3-L */ }
function clearEditorDirty() { editorDirty = false; }
window.markEditorDirty = markEditorDirty;
// editorScreen 내부의 input/change 이벤트를 delegation 으로 감지
document.addEventListener('DOMContentLoaded', () => {
    const screen = document.getElementById('editorScreen');
    if (!screen) return;
    const dirtyHandler = (e) => {
        // 화면이 활성 상태이고, dashboard/nav 외부 요소에서 발생할 때만 dirty 처리
        if (!screen.classList.contains('active')) return;
        const t = e.target;
        if (!t || !t.tagName) return;
        const tag = t.tagName.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') markEditorDirty();
    };
    screen.addEventListener('input', dirtyHandler, true);
    screen.addEventListener('change', dirtyHandler, true);
    // 페이지 이탈 경고 (새로고침/닫기)
    window.addEventListener('beforeunload', (e) => {
        if (screen.classList.contains('active') && editorDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

// Supabase Auth 기반 manage자 auth
async function checkPassword() {
    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const error = document.getElementById('passwordError');
    const loginForm = document.getElementById('adminLoginForm');
    const loadingEl = document.getElementById('adminAuthLoading');
    const noPermissionEl = document.getElementById('adminNoPermission');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        error.textContent = '이메일과 비밀번호를 입력해주세요';
        error.classList.add('visible');
        setTimeout(() => error.classList.remove('visible'), 3000);
        return;
    }

 // 딩 display
    loginForm.style.display = 'none';
    loadingEl.style.display = 'block';
    noPermissionEl.style.display = 'none';

    try {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized');
        }

 // 1. Supabase Auth 그인
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            throw new Error(authError.message);
        }

 // 2. profiles 테 블 서 role check
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', authData.user.id)
            .single();

        if (profileError) {
            console.error('[Admin] 프로필 Query failed:', profileError);
            throw new Error('프로필을 확인할 수 not found');
        }

        if (profile.role !== 'admin') {
 // manage자 권 없음
            loadingEl.style.display = 'none';
            noPermissionEl.style.display = 'block';
            return;
        }

 // 3. manage자 auth success
        adminUser = authData.user;
        document.getElementById('passwordScreen').style.display = 'none';
        document.getElementById('adminDashboard').classList.add('active');
        if (window.showAdminNav) window.showAdminNav();
        loadMemories();
        loadAllSessions();

    } catch (err) {
        console.error('[Admin] 인증 오류:', err);
        loadingEl.style.display = 'none';
        loginForm.style.display = 'block';
        error.textContent = err.message || '인증에 실패했습니다';
        error.classList.add('visible');
        emailInput.value = '';
        passwordInput.value = '';
        setTimeout(() => error.classList.remove('visible'), 3000);
    }
}

// 페 지 load 시 existing session check
async function checkExistingSession() {
    try {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) return;

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return;

 // profile 서 role check
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        if (profile?.role === 'admin') {
            adminUser = session.user;
            document.getElementById('passwordScreen').style.display = 'none';
            document.getElementById('adminDashboard').classList.add('active');
            if (window.showAdminNav) window.showAdminNav();
            loadMemories();
            loadAllSessions();
        }
    } catch (e) {
        console.warn('[Admin] 기존 세션 확인 실패:', e.message);
    }
}

// Enter 키 그인
document.getElementById('adminPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
});

// manage자 돌아 기
function adminLogout() {
    const noPermissionEl = document.getElementById('adminNoPermission');
    const loginForm = document.getElementById('adminLoginForm');
    if (noPermissionEl) noPermissionEl.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
}

// 그아웃
async function logout() {
    if (confirm('로그아웃하시겠습니까?')) {
        try {
            const supabaseClient = getSupabaseClient();
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }
        } catch (e) {
            console.warn('[Admin] 로그아웃 오류:', e);
        }
        adminUser = null;
        document.getElementById('adminDashboard').classList.remove('active');
        document.getElementById('editorScreen').classList.remove('active');
        document.getElementById('passwordScreen').style.display = 'flex';
        document.getElementById('adminEmail').value = '';
        document.getElementById('adminPassword').value = '';
        currentMemoryIndex = null;
        currentScenes = [];
    }
}

// init 시 existing session check
setTimeout(() => checkExistingSession(), 500);

// memory list load
async function loadMemories() {
    try {
 // Supabase 서 불러오기
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }
        
        const memoriesData = await listMemoriesWithScenesChoices(supabaseClient);

        if (memoriesData && memoriesData.length > 0) {
            memories = memoriesData;
 // 백업용으 localStorage save
            saveMemoriesToStorage();
        } else {
 // Supabase data 없으면 localStorage 서 불러오기 (마 그레 션)
            const stored = loadAdminMemories();
            if (stored && stored.length > 0) {
                memories = stored;
            } else {
                memories = [];
            }
        }
    } catch (error) {
        console.error('loadMemories error:', error);
        showToast('기억 불러오기 오류: ' + error.message, 'error', { ttl: 0 });
 // Error occurred 시 localStorage 서 불러오기
        const stored = loadAdminMemories();
        if (stored && stored.length > 0) {
            memories = stored;
        } else {
            memories = [];
        }
    }
    renderMemoriesTable();
}

// memory list 테 블 렌더링
function renderMemoriesTable() {
    const tbody = document.getElementById('memoriesTableBody');
    if (!tbody) return; // 통합 목록으로 대체됨
    tbody.innerHTML = '';

    if (memories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">등록된 기억이 not found</td></tr>';
        return;
    }

    memories.forEach((memory, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${memory.code || '—'}</td>
            <td>${memory.title || '—'}</td>
            <td>${memory.interpretationLayers || 0}개</td>
            <td>${memory.visible ? '공개' : '숨김'}</td>
            <td>
                <button class="table-btn" onclick="editMemory(${index})">수정</button>
                <button class="table-btn" onclick="toggleMemoryVisibility(${index})">${memory.visible ? '숨김' : '공개'}</button>
                <button class="table-btn" onclick="deleteMemory(${index})" style="border-color:var(--accent-live);color:var(--accent-live)">삭제</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 새 memory add
function addNewMemory() {
    currentMemoryIndex = null;
    currentMemoryId = null;
    currentLayers = []; // 새 메모리 생성 시 레이어 초기화
    currentScenes = [];
    sceneCollapseState.clear(); // W1-B: 접기 상태 초기화
    openSubsections.clear();    // W3
    document.getElementById('memoryTitle').value = '';
    document.getElementById('memoryCode').value = '';
    document.getElementById('memoryDescription').value = '';
    document.getElementById('memoryWords').value = '';
    document.getElementById('completedSentence').value = '';
    document.getElementById('authorNote').value = '';
    document.getElementById('memoryStatus').value = 'Fetus';
    // R1-7: sound_map 5칸 UI 제거됨 — 리셋 코드도 함께 정리
    document.getElementById('scenesContainer').innerHTML = '';
    // original_vector (6-dim) 리셋
    ['fear','sadness','anger','joy','longing','guilt'].forEach(k => {
        const el = document.getElementById('ov_' + k);
        if (el) el.value = '';
    });
    // Lumen V1 (작업 12-1): 감각 앵커 / AF / 오염 초기 상태 / 공간 설정 리셋
    const noneRadio = document.querySelector('input[name="sensoryModality"][value=""]');
    if (noneRadio) noneRadio.checked = true;
    const sc = document.getElementById('sensoryContent'); if (sc) sc.value = '';
    const sw = document.getElementById('sensoryWeight'); if (sw) sw.value = 0.7;
    ['self','other','fate'].forEach(k => {
        const el = document.getElementById('ar_attr_' + k); if (el) el.value = '';
    });
    ['abandonment','rejection','powerlessness','loss'].forEach(k => {
        const el = document.getElementById('ar_cf_' + k); if (el) el.value = '';
    });
    const cd = document.getElementById('contDepth'); if (cd) { cd.value = 0; const cdv = document.getElementById('contDepthValue'); if (cdv) cdv.textContent = '0'; }
    ['divergence','convergence','heterogeneity'].forEach(k => {
        const el = document.getElementById('cont_' + k + '_input'); if (el) el.value = 0;
    });
    const cs1 = document.getElementById('cont_stage_1_input'); if (cs1) cs1.value = 0.33;
    const cs2 = document.getElementById('cont_stage_2_input'); if (cs2) cs2.value = 0.33;
    const cs3 = document.getElementById('cont_stage_3_input'); if (cs3) cs3.value = 0.34;
    const ts = document.getElementById('terrainShape'); if (ts) ts.value = 'circular';
    updateAfSums();
    updateContStageSum();
    // 작업 12-3: 응결점 초기화
    if (typeof loadGhostPoints === 'function') loadGhostPoints(null);
    if (typeof loadGhostVariants === 'function') loadGhostVariants(null);
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
    renderVersions();                 // W3-K: 신규는 빈 패널
    renderSceneToc();                 // W3-M
    maybeShowAutosaveBanner('new');   // W3-L: 신규 작성 임시본
    setTimeout(clearEditorDirty, 0);
}

// memory edit
function editMemory(index) {
    currentMemoryIndex = index;
    const memory = memories[index];
    currentMemoryId = memory.id || null;
    window.currentMemoryId = currentMemoryId; // 다른 모듈(admin-trajectory)에서 참조
    currentLayers = []; // 메모리 편집 시작 시 레이어 초기화

    // Clear previous strata preview so it doesn't persist across memories
    const strataView = document.getElementById('strataView');
    if (strataView) strataView.style.display = 'none';
    if (window.Strata && window.Strata.stop) window.Strata.stop();
    const strataLoading = document.getElementById('strataLoading');
    if (strataLoading) {
        strataLoading.style.display = 'flex';
        strataLoading.textContent = '버튼을 클릭��여 Strata 미리보기 불러오기';
    }
    const btnFs = document.getElementById('strataFullscreenBtn');
    if (btnFs) btnFs.hidden = true;
    const btnFp = document.getElementById('strataFirstPersonBtn');
    if (btnFp) { btnFp.hidden = true; btnFp.textContent = '1인칭 걷기'; }
    // Exit first-person if active
    const rt = window.TemAfStrataTerrain?._lastRuntime;
    if (rt && rt.isFirstPerson()) rt.exitFirstPerson();

    document.getElementById('memoryTitle').value = memory.title || '';
    document.getElementById('memoryCode').value = memory.code || '';
    document.getElementById('memoryDescription').value = memory.description || '';
    document.getElementById('memoryWords').value = memory.memory_words || '';
    document.getElementById('completedSentence').value = memory.completed_sentence || '';
    // original_vector 로드
    const ov = memory.original_vector || {};
    ['fear','sadness','anger','joy','longing','guilt'].forEach(k => {
        const el = document.getElementById('ov_' + k);
        if (el) el.value = ov[k] != null ? ov[k] : '';
    });
    document.getElementById('authorNote').value = memory.author_note || '';
    document.getElementById('memoryStatus').value = memory.status || 'Fetus';

    // Lumen V1 (작업 12-1): 감각 앵커 로드
    const sa = memory.sensory_anchor;
    if (sa && typeof sa === 'object' && !Array.isArray(sa)) {
        const mod = sa.modality || '';
        const modRadio = document.querySelector(`input[name="sensoryModality"][value="${mod}"]`);
        if (modRadio) modRadio.checked = true;
        const sc = document.getElementById('sensoryContent'); if (sc) sc.value = sa.content || '';
        const sw = document.getElementById('sensoryWeight'); if (sw) sw.value = (sa.weight != null ? sa.weight : 0.7);
    } else {
        const noneRadio = document.querySelector('input[name="sensoryModality"][value=""]');
        if (noneRadio) noneRadio.checked = true;
        const sc = document.getElementById('sensoryContent'); if (sc) sc.value = (typeof sa === 'string' ? sa : '');
        const sw = document.getElementById('sensoryWeight'); if (sw) sw.value = 0.7;
    }

    // AF 좌표 로드
    const arv = memory.original_reason_vector || {};
    const attr = arv.attribution || {};
    ['self','other','fate'].forEach(k => {
        const el = document.getElementById('ar_attr_' + k);
        if (el) el.value = attr[k] != null ? attr[k] : '';
    });
    const cf = arv.core_fear || {};
    ['abandonment','rejection','powerlessness','loss'].forEach(k => {
        const el = document.getElementById('ar_cf_' + k);
        if (el) el.value = cf[k] != null ? cf[k] : '';
    });

    // 오염 초기 상태 로드
    const cd = document.getElementById('contDepth');
    if (cd) {
        cd.value = memory.cont_depth != null ? memory.cont_depth : 0;
        const cdv = document.getElementById('contDepthValue'); if (cdv) cdv.textContent = cd.value;
    }
    const cdiv = document.getElementById('cont_divergence_input'); if (cdiv) cdiv.value = memory.cont_divergence != null ? memory.cont_divergence : 0;
    const cconv = document.getElementById('cont_convergence_input'); if (cconv) cconv.value = memory.cont_convergence != null ? memory.cont_convergence : 0;
    const chet = document.getElementById('cont_heterogeneity_input'); if (chet) chet.value = memory.cont_heterogeneity != null ? memory.cont_heterogeneity : 0;
    const cs1 = document.getElementById('cont_stage_1_input'); if (cs1) cs1.value = memory.cont_stage_1 != null ? memory.cont_stage_1 : 0.33;
    const cs2 = document.getElementById('cont_stage_2_input'); if (cs2) cs2.value = memory.cont_stage_2 != null ? memory.cont_stage_2 : 0.33;
    const cs3 = document.getElementById('cont_stage_3_input'); if (cs3) cs3.value = memory.cont_stage_3 != null ? memory.cont_stage_3 : 0.34;
    const ts = document.getElementById('terrainShape'); if (ts) ts.value = memory.terrain_shape || 'circular';
    updateAfSums();
    updateContStageSum();
    // 작업 12-3: 응결점 로드
    if (typeof loadGhostPoints === 'function') loadGhostPoints(memory);
    if (typeof loadGhostVariants === 'function') loadGhostVariants(memory.id);
 // R1-7: sound_map 5칸 UI 제거됨 — 로드 코드도 함께 정리 (DB 값은 보존, UI만 없음)
    currentScenes = memory.scenes ? JSON.parse(JSON.stringify(memory.scenes)) : [];
    // Clear previous diagnostics
    var _diagEl = document.getElementById('sceneNavDiagResult');
    if (_diagEl) _diagEl.innerHTML = '';
    var _graphEl = document.getElementById('sceneGraphContainer');
    if (_graphEl) { _graphEl.style.display = 'none'; document.getElementById('sceneGraphNodes').innerHTML = ''; document.getElementById('sceneGraphSvg').innerHTML = ''; }
    window._diagAccessMatrix = null;
    sceneCollapseState.clear(); // W1-B: 기억마다 접기 상태 초기화(전부 접힘으로 시작)
    openSubsections.clear();    // W3: choices/dialog 하위 섹션 접힘 초기화
    renderScenes();
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
    renderVersions();                 // W3-K: 판본 패널
    renderSceneToc();                 // W3-M: 씬 목차 사이드바
    maybeShowAutosaveBanner(currentMemoryId); // W3-L: 임시 저장본 배너
    // 초기 DOM 세팅 이벤트가 dirty 를 트리거했을 수 있으므로 다음 tick 에서 clear
    setTimeout(clearEditorDirty, 0);
}

// memory 시성 토글
        async function toggleMemoryVisibility(index) {
            const memory = memories[index];
            const newVisibility = !memory.visible;
            
            try {
                const supabaseClient = await getSupabaseClient();
                if (!supabaseClient) {
                    throw new Error('Supabase client not initialized.');
                }
        
                if (memory.id) {
                    const { error } = await supabaseClient
                        .from('memories')
                        .update({ is_public: newVisibility })
                        .eq('id', memory.id);
            
                    if (error) throw error;
                }
        
        memories[index].visible = newVisibility;
        saveMemoriesToStorage(); // 백업용
        renderMemoriesTable();
    } catch (error) {
        console.error('toggleMemoryVisibility error:', error);
        showToast('가시성 변경 오류: ' + error.message, 'error', { ttl: 0 });
    }
}

// memory delete
async function deleteMemory(index) {
    const memory = memories[index];
    
    if (!confirm(`"${memory.title || memory.code}" 기억을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }
        
        if (memory.id) {
            await deleteMemoryGraph(supabaseClient, memory.id);
        }
        
 // local array 서 remove
        memories.splice(index, 1);
        saveMemoriesToStorage(); // 백업용
        
 // list 갱신
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
        
        showToast('기억이 삭제되었습니다', 'success');
    } catch (error) {
        console.error('deleteMemory error:', error);
        showToast('삭제 오류: ' + error.message, 'error', { ttl: 0 });
    }
}

// scene add
function addScene() {
        currentScenes.push({
        text: '',
        sceneType: 'normal',
        scene_role: null,
        echoWords: [],
        originalReason: '',
        originalEmotion: null,
        originalReasonVector: null,
        anchor_emotions: null,
        voidInfo: null,
        exclusions: null
    });
    // W1-B: 새로 추가한 씬은 펼친 상태로 생성 + 그 위치로 스크롤
    const newIndex = currentScenes.length - 1;
    sceneCollapseState.set(newIndex, false);
    renderScenes();
    const block = document.querySelector(`.scene-block[data-scene-index="${newIndex}"]`);
    if (block && block.scrollIntoView) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── 씬 카드 접기 (W1-B, F1) ─────────────────────────────────────
// 씬 폼이 괴물(씬당 41요소)이라 기본 접힘. 헤더 = S{순서} · {역할} · {본문 첫 20자}.
const sceneCollapseState = new Map(); // sceneIndex -> collapsed(boolean). 기본 접힘(true).
function isSceneCollapsed(i) { const v = sceneCollapseState.get(i); return v === undefined ? true : v; }
function _escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sceneRoleLabel(role) {
    if (role === 'anchor') return '원본(anchor)';
    if (role === 'residual') return '잔상(residual)';
    return '역할 없음';
}
function sceneCollapseTitle(scene, i) {
    const head = (scene && scene.text ? scene.text : '').replace(/\s+/g, ' ').trim().slice(0, 20);
    const gname = (scene && scene.meta && scene.meta.ghost_name) ? ` · 👻${scene.meta.ghost_name}` : '';
    return `S${i + 1} · ${sceneRoleLabel(scene && scene.scene_role)} · ${head || '(본문 없음)'}${gname}`;
}
function toggleSceneCollapse(i) {
    const collapsed = !isSceneCollapsed(i);
    sceneCollapseState.set(i, collapsed);
    const block = document.querySelector(`.scene-block[data-scene-index="${i}"]`);
    if (!block) return;
    const body = block.querySelector('.scene-body');
    const caret = block.querySelector('.scene-collapse-caret');
    if (body) body.style.display = collapsed ? 'none' : '';
    if (caret) caret.textContent = collapsed ? '▶' : '▼';
    block.classList.toggle('collapsed', collapsed);
}
function setAllScenesCollapsed(collapsed) {
    currentScenes.forEach((_, i) => sceneCollapseState.set(i, collapsed));
    renderScenes();
}
window.toggleSceneCollapse = toggleSceneCollapse;
window.setAllScenesCollapsed = setAllScenesCollapsed;

// ─── ADM4: 간단/풀버전 편집 모드 ──────────────────────────────────
// 기본 = 간단(현행 저작 루프 칸만). .adv-only 요소는 풀버전에서만 표시.
// 상태는 localStorage 유지 — 재방문 시 마지막 모드 복원.
const FULL_EDIT_KEY = 'tem_admin_full_edit';
function applyFullEditMode() {
    const on = localStorage.getItem(FULL_EDIT_KEY) === '1';
    const content = document.getElementById('editContent');
    if (content) content.classList.toggle('full-edit', on);
    const btn = document.getElementById('fullEditToggle');
    if (btn) {
        btn.textContent = on ? '간단 편집으로' : '풀버전 편집';
        btn.classList.toggle('active', on);
    }
}
function toggleFullEdit() {
    const on = localStorage.getItem(FULL_EDIT_KEY) === '1';
    localStorage.setItem(FULL_EDIT_KEY, on ? '0' : '1');
    applyFullEditMode();
}
window.toggleFullEdit = toggleFullEdit;
applyFullEditMode();

// ─── W3 씬 하위 섹션 접힘 상태(choices/dialog 편집기) ──────────────
const openSubsections = new Set();
function isSubsectionOpen(id) { return openSubsections.has(id); }
window.toggleSceneSubsection = function (id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = el.style.display === 'none';
    el.style.display = willOpen ? 'block' : 'none';
    if (willOpen) openSubsections.add(id); else openSubsections.delete(id);
    if (btn) btn.textContent = (willOpen ? '▼' : '▶') + btn.textContent.slice(1);
};

// ─── W3-O: 감정 결 선택지(choices) 편집기 ────────────────────────
function choiceRowHtml(sceneIndex, ci, c) {
    const opts = DEFAULT_EMOTION_ANCHORS.map(k => `<option value="${k}"${(c.emotion === k) ? ' selected' : ''}>${k}</option>`).join('');
    return `<div class="choice-row" data-scene-index="${sceneIndex}" data-choice-index="${ci}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;">
        <input type="text" class="editor-input choice-text-input" data-scene-index="${sceneIndex}" data-choice-index="${ci}" value="${_escHtml(c.text || '')}" placeholder="선택지 문구" style="flex:1;">
        <select class="editor-input choice-emotion-select" data-scene-index="${sceneIndex}" data-choice-index="${ci}" style="width:auto;">${opts}</select>
        <input type="number" class="editor-input choice-intensity-input" data-scene-index="${sceneIndex}" data-choice-index="${ci}" min="0" max="10" step="1" value="${c.intensity != null ? c.intensity : 5}" style="width:60px;" title="강도 0~10">
        <button type="button" class="scene-btn" onclick="deleteChoiceRow(${sceneIndex},${ci})">×</button>
    </div>`;
}
function renderChoicesEditor(scene, sceneIndex) {
    const rows = (scene.choices || []).map((c, ci) => choiceRowHtml(sceneIndex, ci, c)).join('');
    const open = isSubsectionOpen('choicesFields-' + sceneIndex);
    return `<div class="editor-section" style="margin-top:1.5rem;padding:1.25rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.2);border-radius:4px;">
        <button type="button" class="toggle-contamination-btn" onclick="toggleSceneSubsection('choicesFields-${sceneIndex}', this)">${open ? '▼' : '▶'} 감정 결 선택지 (choices)</button>
        <div id="choicesFields-${sceneIndex}" style="display:${open ? 'block' : 'none'};margin-top:0.8rem;">
            <small style="display:block;margin-bottom:0.6rem;font-size:0.8rem;color:var(--text-muted);">감정 결만 기록(다음 씬 지정 없음). 강도 0~10. 저장 시 이 선택지들로 <b>emotion_dist 가 재계산</b>됩니다(R1-3).</small>
            <div class="choices-list" data-scene-index="${sceneIndex}">${rows}</div>
            <button type="button" class="add-emotion-btn" onclick="addChoiceRow(${sceneIndex})" style="margin-top:0.5rem;padding:0.4rem 0.9rem;">+ 선택지 추가</button>
        </div>
    </div>`;
}
window.addChoiceRow = function (sceneIndex) {
    const s = currentScenes[sceneIndex];
    if (!Array.isArray(s.choices)) s.choices = [];
    s.choices.push({ text: '', emotion: 'fear', intensity: 5 });
    openSubsections.add('choicesFields-' + sceneIndex);
    markEditorDirty();
    renderScenes();
};
window.deleteChoiceRow = function (sceneIndex, ci) {
    const s = currentScenes[sceneIndex];
    if (Array.isArray(s.choices)) { s.choices.splice(ci, 1); markEditorDirty(); renderScenes(); }
};

// ─── W3-N: 유령 대사(dialog_choices) 편집기 ──────────────────────
// 실제 스키마(발자국): { ghost_intro:[], scene_context:[], choices:[{label, ghost_reply:[], free_dialog_open:[]}] }
function _dlgLines(v) { return String(v || '').split('\n').map(s => s.trim()).filter(Boolean); }
function getDlg(scene) {
    const d = (scene && scene.meta && scene.meta.dialog_choices) || {};
    return {
        ghost_intro: Array.isArray(d.ghost_intro) ? d.ghost_intro : [],
        scene_context: Array.isArray(d.scene_context) ? d.scene_context : [],
        choices: Array.isArray(d.choices) ? d.choices : []
    };
}
function setDlg(sceneIndex, dlg) {
    const s = currentScenes[sceneIndex];
    if (!s.meta || typeof s.meta !== 'object') s.meta = {};
    s.meta.dialog_choices = dlg; // meta 병합(다른 키 보존)
    markEditorDirty();
}
function renderDialogEditor(scene, sceneIndex) {
    const dlg = getDlg(scene);
    const choicesHtml = dlg.choices.map((c, ci) => `
        <div class="dlg-choice" style="border:1px solid rgba(196,168,130,.15);border-radius:4px;padding:0.6rem;margin-bottom:0.5rem;">
            <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;">
                <input type="text" class="editor-input dlg-label-input" data-scene-index="${sceneIndex}" data-choice-index="${ci}" value="${_escHtml(c.label || '')}" placeholder="선택지 문구 (…했던 것 같아 회상 화법)" style="flex:1;">
                <button type="button" class="scene-btn" onclick="deleteDlgChoice(${sceneIndex},${ci})">×</button>
            </div>
            <label class="editor-label" style="font-size:0.76rem;">유령 응답 (ghost_reply — 줄바꿈 구분)</label>
            <textarea class="editor-textarea dlg-reply-input" data-scene-index="${sceneIndex}" data-choice-index="${ci}" rows="2" placeholder="한 줄에 하나씩">${_escHtml((c.ghost_reply || []).join('\n'))}</textarea>
            <label class="editor-label" style="font-size:0.76rem;">자유 대화 유도 (free_dialog_open — 줄바꿈 구분)</label>
            <textarea class="editor-textarea dlg-free-input" data-scene-index="${sceneIndex}" data-choice-index="${ci}" rows="2" placeholder="한 줄에 하나씩">${_escHtml((c.free_dialog_open || []).join('\n'))}</textarea>
        </div>`).join('');
    const open = isSubsectionOpen('dlgFields-' + sceneIndex);
    // 260728: adv-only — 상영 경로에서 dialog_choices 선택지는 260709 사용자 결정으로 폐기
    // (자유 입력만). 안 쓰는 편집기는 풀버전 편집에서만 노출 (사용자 지시).
    return `<div class="editor-section adv-only" style="margin-top:1.5rem;padding:1.25rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.2);border-radius:4px;">
        <button type="button" class="toggle-contamination-btn" onclick="toggleSceneSubsection('dlgFields-${sceneIndex}', this)">${open ? '▼' : '▶'} 유령 대사 (dialog_choices) — 상영 미사용 (260709 폐기)</button>
        <div id="dlgFields-${sceneIndex}" style="display:${open ? 'block' : 'none'};margin-top:0.8rem;">
            <small style="display:block;margin-bottom:0.6rem;font-size:0.8rem;color:var(--text-muted);">회상 실패자 화법(…했던 것 같아). 실제 스키마(발자국)와 동일: 도입/맥락/선택지(응답·자유대화). scenes.meta.dialog_choices 로 병합.</small>
            <label class="editor-label" style="font-size:0.78rem;">도입부 (ghost_intro — 줄바꿈 구분)</label>
            <textarea class="editor-textarea dlg-intro-input" data-scene-index="${sceneIndex}" rows="2" placeholder="한 줄에 하나씩">${_escHtml(dlg.ghost_intro.join('\n'))}</textarea>
            <label class="editor-label" style="font-size:0.78rem;">장면 맥락 (scene_context — 줄바꿈 구분)</label>
            <textarea class="editor-textarea dlg-context-input" data-scene-index="${sceneIndex}" rows="3" placeholder="한 줄에 하나씩">${_escHtml(dlg.scene_context.join('\n'))}</textarea>
            <div class="dlg-choices-list">${choicesHtml}</div>
            <button type="button" class="add-emotion-btn" onclick="addDlgChoice(${sceneIndex})" style="margin-top:0.5rem;padding:0.4rem 0.9rem;">+ 유령 선택지 추가</button>
        </div>
    </div>`;
}
window.addDlgChoice = function (sceneIndex) {
    const dlg = getDlg(currentScenes[sceneIndex]);
    dlg.choices.push({ label: '', ghost_reply: [], free_dialog_open: [] });
    setDlg(sceneIndex, dlg);
    openSubsections.add('dlgFields-' + sceneIndex);
    renderScenes();
};
window.deleteDlgChoice = function (sceneIndex, ci) {
    const dlg = getDlg(currentScenes[sceneIndex]);
    dlg.choices.splice(ci, 1);
    setDlg(sceneIndex, dlg);
    renderScenes();
};

// scene 렌더링
function renderScenes() {
    const container = document.getElementById('scenesContainer');
    container.innerHTML = '';

    currentScenes.forEach((scene, sceneIndex) => {
        const sceneBlock = document.createElement('div');
        const _collapsed = isSceneCollapsed(sceneIndex);
        sceneBlock.className = 'scene-block' + (_collapsed ? ' collapsed' : '');
        sceneBlock.setAttribute('data-scene-index', sceneIndex);
        sceneBlock.innerHTML = `
            <div class="scene-collapse-bar" onclick="toggleSceneCollapse(${sceneIndex})" title="클릭하여 접기/펼치기">
                <span class="scene-collapse-caret">${_collapsed ? '▶' : '▼'}</span>
                <span class="scene-collapse-title">${_escHtml(sceneCollapseTitle(scene, sceneIndex))}</span>
            </div>
            <div class="scene-body"${_collapsed ? ' style="display:none;"' : ''}>
            <div class="scene-header">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div class="scene-number">장면 ${sceneIndex + 1}</div>
                    <select class="editor-input scene-type-select adv-only" data-scene-index="${sceneIndex}" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                        <option value="normal" ${(scene.sceneType || 'normal') === 'normal' ? 'selected' : ''}>일반</option>
                        <option value="branch" ${scene.sceneType === 'branch' ? 'selected' : ''}>분기</option>
                        <option value="ending" ${scene.sceneType === 'ending' ? 'selected' : ''}>엔딩</option>
                    </select>
                    <select class="editor-input scene-role-select" data-scene-index="${sceneIndex}" title="씬 역할 — anchor(원본) / residual(잔상·브릿지)" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                        <option value="" ${!scene.scene_role ? 'selected' : ''}>역할 없음</option>
                        <option value="anchor" ${scene.scene_role === 'anchor' ? 'selected' : ''}>anchor (원본)</option>
                        <option value="residual" ${scene.scene_role === 'residual' ? 'selected' : ''}>residual (잔상)</option>
                    </select>
                </div>
                <div class="scene-controls">
                    <button class="scene-btn" onclick="moveSceneUp(${sceneIndex})" ${sceneIndex === 0 ? 'disabled style="opacity:.5"' : ''}>위로</button>
                    <button class="scene-btn" onclick="moveSceneDown(${sceneIndex})" ${sceneIndex === currentScenes.length - 1 ? 'disabled style="opacity:.5"' : ''}>아래로</button>
                    <button class="scene-btn" onclick="deleteScene(${sceneIndex})">삭제</button>
                </div>
            </div>
            <div class="editor-input-group">
                <label class="editor-label">본문</label>
                <textarea class="editor-textarea scene-text-input" data-scene-index="${sceneIndex}" placeholder="장면 본문을 입력하세요">${scene.text || ''}</textarea>
            </div>
            <div class="editor-input-group">
                <label class="editor-label">유령 이름 (공명 시 드러남)</label>
                <input type="text" class="editor-input scene-ghost-name-input" data-scene-index="${sceneIndex}" placeholder="예: 준호, 엄마, 그 사람" value="${_escHtml((scene.meta && scene.meta.ghost_name) || '')}">
                <small style="display:block;margin-top:0.4rem;font-size:0.82rem;color:var(--text-muted);">접촉(공명) 순간에만 플레이어에게 드러나는 이름. 비워도 됨.</small>
            </div>
            <div class="contamination-section">
                <button type="button" class="toggle-contamination-btn" onclick="toggleContamination(${sceneIndex})">
                    ▶ 오염 버전 편집
                </button>
                <div class="contamination-fields" id="contamination-${sceneIndex}" style="display: none;">
                    <div class="contamination-direction-row">
                        <label class="editor-label">오염 방향</label>
                        <select class="editor-input contamination-direction" data-scene-index="${sceneIndex}">
                            <option value="default">default</option>
                            <option value="emotion_mismatch">emotion_mismatch</option>
                            <option value="target_displacement">target_displacement</option>
                            <option value="attribution_mismatch">attribution_mismatch</option>
                            <option value="void_mismatch">void_mismatch</option>
                        </select>
                    </div>
                    <div class="editor-input-group">
                        <label class="editor-label">Stage 1 (객체화: 0.3~0.6)</label>
                        <div class="contamination-stage-row">
                            <textarea class="editor-textarea scene-text-stage-1" data-scene-index="${sceneIndex}" rows="3" placeholder="감정이 객체화되기 시작...">${scene.text_stage_1 || ''}</textarea>
                            <button type="button" class="contamination-regen-btn" onclick="regenerateStage1(${sceneIndex})">재생성</button>
                        </div>
                    </div>
                    <div class="editor-input-group">
                        <label class="editor-label">Stage 2 (추상화: 0.6~0.9)</label>
                        <div class="contamination-stage-row">
                            <textarea class="editor-textarea scene-text-stage-2" data-scene-index="${sceneIndex}" rows="3" placeholder="디테일이 사라지고 추상화...">${scene.text_stage_2 || ''}</textarea>
                            <button type="button" class="contamination-regen-btn" onclick="regenerateStage2(${sceneIndex})">재생성</button>
                        </div>
                    </div>
                    <div class="editor-input-group">
                        <label class="editor-label">Stage 3 (hypercompletion: 과선명/확정화)</label>
                        <div class="contamination-stage-3-controls">
                            <select class="stage3-fixation-select editor-input" data-scene-index="${sceneIndex}">
                                <option value="0.2">weak (0.2)</option>
                                <option value="0.5" selected>medium (0.5)</option>
                                <option value="0.8">strong (0.8)</option>
                            </select>
                            <button type="button" class="contamination-regen-btn" onclick="generateStage3(${sceneIndex})">생성</button>
                        </div>
                        <textarea class="editor-textarea scene-text-stage-3" data-scene-index="${sceneIndex}" rows="3" placeholder="기억이 스스로 사실을 확정한다...">${scene.text_stage_3 || ''}</textarea>
                    </div>
                </div>
            </div>
            <div class="editor-input-group">
                <label class="editor-label">잔향 단어</label>
                <input type="text" class="editor-input scene-echo-words-input" data-scene-index="${sceneIndex}" placeholder="무서웠어, 미안해, 후회했어 (콤마로 구분)" value="${(scene.echoWords || []).join(', ')}">
            </div>
            <div class="editor-input-group scene-original-fields adv-only" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'};">
                <label class="editor-label">원본 이유</label>
                <input type="text" class="editor-input scene-original-reason-input" data-scene-index="${sceneIndex}" placeholder="원본 기록자의 이유 (예: 내가 살릴 수 있었는데...)" value="${scene.originalReason || ''}">
            </div>
            <div class="scene-void-section" data-scene-index="${sceneIndex}">
                <h4>VOID 설정</h4>
                <label>Scene Void <input type="checkbox" class="scene-void-toggle" data-scene-index="${sceneIndex}" ${(scene.voidInfo && scene.voidInfo.sceneVoid) ? 'checked' : ''}></label>
                <label>Emotion Void <input type="checkbox" class="emotion-void-toggle" data-scene-index="${sceneIndex}" ${(scene.voidInfo && scene.voidInfo.emotionVoid) ? 'checked' : ''}></label>
                <label>Reason Void <input type="checkbox" class="reason-void-toggle" data-scene-index="${sceneIndex}" ${(scene.voidInfo && scene.voidInfo.reasonVoid) ? 'checked' : ''}></label>
                <button class="auto-detect-void-btn" data-scene-index="${sceneIndex}">자동 감지</button>
                <p class="void-level-display" data-scene-index="${sceneIndex}">VOID Level: ${(scene.voidInfo && scene.voidInfo.voidLevel) ? scene.voidInfo.voidLevel.charAt(0).toUpperCase() + scene.voidInfo.voidLevel.slice(1) : 'Low'}</p>
            </div>
            ${renderSceneAfPicker(scene, sceneIndex)}
            <div class="editor-section adv-only" style="margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
                <h3 class="editor-section-title" style="margin-bottom: 1rem;">Original Emotion 매핑</h3>
                <div class="editor-input-group" style="margin-bottom: 1.5rem;">
                    <label class="editor-label">감정 (emotion : intensity)</label>
                    <div class="original-emotion-list" data-scene-index="${sceneIndex}">
                        ${renderOriginalEmotions(scene.originalEmotion || {}, sceneIndex)}
                    </div>
                    <button class="add-emotion-btn" onclick="addOriginalEmotion(${sceneIndex})" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: var(--accent-memory); color: var(--bg-deep); border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">+ 감정 추가</button>
                </div>
                <div class="scene-wave-preview" data-scene-index="${sceneIndex}" style="margin-top: 1rem;">
                    <label class="editor-label" style="display:block; margin-bottom: 0.5rem;">원본 파동</label>
                    <button
                        type="button"
                        class="editor-btn preview-wave-btn"
                        data-scene-index="${sceneIndex}"
                        onclick="startOriginalWavePreview(${sceneIndex})"
                        style="margin-bottom:0.6rem;padding:0.45rem 0.85rem;font-size:0.82rem;"
                    >
                        ${(scene.wavePreviewEnabled ? '원본 파동 중지' : '원본 파동 보기')}
                    </button>
                    <canvas class="scene-wave-canvas" id="sceneWaveCanvas-${sceneIndex}" width="400" height="80" style="width:100%; max-width:400px; height:80px; background: var(--bg-deep); border-radius:4px; border:1px solid rgba(196,168,130,.2);"></canvas>
                </div>
                <div class="scene-terrain-preview" data-scene-index="${sceneIndex}" style="margin-top: 1rem;">
                    <label class="editor-label" style="display:block; margin-bottom: 0.5rem;">3D 자연 모양 (자동 mask · §14 Phase 1)</label>
                    <button
                        type="button"
                        class="editor-btn preview-terrain-btn"
                        data-scene-index="${sceneIndex}"
                        onclick="toggleSceneTerrainPreview(${sceneIndex})"
                        style="margin-bottom:0.6rem;padding:0.45rem 0.85rem;font-size:0.82rem;"
                    >
                        ${(scene.terrainPreviewEnabled ? '3D 모양 숨기기' : '3D 모양 보기')}
                    </button>
                    <div class="scene-terrain-mount" data-scene-index="${sceneIndex}" id="sceneTerrainMount-${sceneIndex}" style="${scene.terrainPreviewEnabled ? '' : 'display:none;'}"></div>
                </div>
            </div>
            <div class="editor-section scene-original-fields adv-only" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'}; margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
                <h3 class="editor-section-title" style="margin-bottom: 1rem;">원본 이유 (정렬도 비교용)</h3>
                <div class="editor-input-group" style="margin-bottom: 1.5rem;">
                    <label class="editor-label">감정 앵커 (쉼표로 구분, 자유 입력 가능)</label>
                    <input type="text" class="editor-input anchor-emotions-input" data-scene-index="${sceneIndex}" 
                           value="${(scene.anchor_emotions && Array.isArray(scene.anchor_emotions)) ? scene.anchor_emotions.join(', ') : (scene.anchor_emotions || '')}" 
                           placeholder="공포, 죄책감, 희망, 안도">
                    <small style="display: block; margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                        이 장면에서 측정할 감정들. 한글/영문 모두 가능. 비워두면 기본 앵커 사용.
                    </small>
                </div>
                <div class="editor-input-group" style="margin-bottom: 1.5rem;">
                    <label class="editor-label">원본 이유 벡터 (Reason Vector)</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">귀인 (Attribution)</label>
                            <select class="editor-input original-reason-vector-attribution" data-scene-index="${sceneIndex}" style="width: 100%;">
                                <option value="self_blame" ${scene.originalReasonVector?.attribution === 'self_blame' ? 'selected' : ''}>내 탓 (self_blame)</option>
                                <option value="other_blame" ${scene.originalReasonVector?.attribution === 'other_blame' ? 'selected' : ''}>타인 탓 (other_blame)</option>
                                <option value="fate_blame" ${scene.originalReasonVector?.attribution === 'fate_blame' ? 'selected' : ''}>운명 탓 (fate_blame)</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-muted);">핵심 두려움 (Core Fear)</label>
                            <select class="editor-input original-reason-vector-core-fear" data-scene-index="${sceneIndex}" style="width: 100%;">
                                <option value="abandonment" ${scene.originalReasonVector?.core_fear === 'abandonment' ? 'selected' : ''}>버림받음 (abandonment)</option>
                                <option value="death" ${scene.originalReasonVector?.core_fear === 'death' ? 'selected' : ''}>죽음 (death)</option>
                                <option value="rejection" ${scene.originalReasonVector?.core_fear === 'rejection' ? 'selected' : ''}>거절 (rejection)</option>
                                <option value="failure" ${scene.originalReasonVector?.core_fear === 'failure' ? 'selected' : ''}>실패 (failure)</option>
                                <option value="none" ${scene.originalReasonVector?.core_fear === 'none' || !scene.originalReasonVector?.core_fear ? 'selected' : ''}>없음 (none)</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                            <input type="checkbox" class="original-reason-vector-is-void" data-scene-index="${sceneIndex}" ${scene.originalReasonVector?.is_void ? 'checked' : ''}>
                            <span>공백 여부 (is_void)</span>
                        </label>
                    </div>
                </div>
            </div>
            ${renderChoicesEditor(scene, sceneIndex)}
            ${renderDialogEditor(scene, sceneIndex)}
            <div class="editor-section scene-exclusions-section adv-only" data-scene-index="${sceneIndex}" style="margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
                <h3 class="editor-section-title" style="margin-bottom: 0.5rem;">부정 제약 (연출 레이어)</h3>
                <small style="display: block; margin-bottom: 1rem; font-size: 0.85rem; color: var(--text-muted);">
                    이 씬이 <b>뜨지 않을 조건</b>을 정의. 하나라도 매칭되면 궤적 후보에서 제외됨. 플레이어에게는 이유가 노출되지 않음.
                </small>
                <textarea class="editor-input scene-exclusions-input" data-scene-index="${sceneIndex}"
                          rows="5"
                          style="width:100%; font-family: monospace; font-size: 0.82rem;"
                          placeholder='[{"condition":{"type":"emotion_threshold","emotion":"rage","min":0.6},"reason":"분노 경로에는 안 뜸"}]'>${scene.exclusions ? JSON.stringify(scene.exclusions, null, 2) : ''}</textarea>
                <div class="scene-exclusions-error" data-scene-index="${sceneIndex}" style="display:none; color: #d66; font-size: 0.8rem; margin-top: 0.4rem;"></div>
                <details style="margin-top: 0.6rem;">
                    <summary style="cursor: pointer; font-size: 0.82rem; color: var(--text-muted);">조건 타입 가이드</summary>
                    <pre style="font-size: 0.75rem; color: var(--text-muted); background: var(--bg-deep); padding: 0.6rem; border-radius: 3px; overflow-x: auto;">
emotion_threshold  { type:"emotion_threshold", emotion:"rage", min:0.6 }
contamination_stage{ type:"contamination_stage", stage:"hypercompletion" }
visited_scene      { type:"visited_scene", sceneIndex:2 }
                    </pre>
                </details>
            </div>
            </div><!-- /.scene-body -->
        `;
        container.appendChild(sceneBlock);
    });

    attachSceneListeners();
    renderSceneToc(); // W3-M: 씬 목차 동기화

    currentScenes.forEach((scene, sceneIndex) => {
        if (scene && scene.wavePreviewEnabled) {
            startOriginalWavePreview(sceneIndex, true);
        } else {
            clearSceneWaveCanvas(sceneIndex);
        }
    });

    // 작업 §14 Phase 1: terrainPreviewEnabled 인 씬 자동 복원
    currentScenes.forEach((scene, sceneIndex) => {
        if (scene && scene.terrainPreviewEnabled) {
            _mountSceneTerrainPreview(sceneIndex);
        }
    });
}

// ─── §14 Phase 1: 씬별 3D 자연 모양 미리보기 ────────────────────
const _sceneTerrainApis = new Map();

// 메모리 cont 상태를 미리보기 입력 형식으로 모음. DOM 슬라이더(편집중) + 저장된 memory row(편집 불가 필드) 혼합.
function _getPreviewCont() {
    function _v(id) {
        const el = document.getElementById(id);
        const n = el ? parseFloat(el.value) : NaN;
        return Number.isFinite(n) ? n : null;
    }
    const mem = (currentMemoryIndex != null && memories[currentMemoryIndex]) || null;
    return {
        drift:         mem ? Number(mem.cont_drift) || 0 : 0,
        divergence:    _v('cont_divergence_input') ?? (mem ? Number(mem.cont_divergence) || 0 : 0),
        convergence:   _v('cont_convergence_input') ?? (mem ? Number(mem.cont_convergence) || 0 : 0),
        heterogeneity: _v('cont_heterogeneity_input') ?? (mem ? Number(mem.cont_heterogeneity) || 0 : 0),
        dilution:      mem && mem.dilution != null ? Number(mem.dilution) : 100,
        stage1:        _v('cont_stage_1_input') ?? (mem ? Number(mem.cont_stage_1) || 0 : 0),
        stage2:        _v('cont_stage_2_input') ?? (mem ? Number(mem.cont_stage_2) || 0 : 0),
        stage3:        _v('cont_stage_3_input') ?? (mem ? Number(mem.cont_stage_3) || 0 : 0),
        driftDirV:     mem ? Number(mem.drift_dir_v) || 0.5 : 0.5,
        driftDirA:     mem ? Number(mem.drift_dir_a) || 0.5 : 0.5,
    };
}

function _mountSceneTerrainPreview(sceneIndex) {
    if (!window.LumenAdminSceneTerrainPreview) {
        console.warn('[scene-terrain] LumenAdminSceneTerrainPreview 미로드');
        return;
    }
    const scene = currentScenes[sceneIndex];
    if (!scene) return;
    const mount = document.getElementById('sceneTerrainMount-' + sceneIndex);
    if (!mount) return;
    // 기존 인스턴스 정리 (renderScenes 재호출 시 leak 방지)
    const oldApi = _sceneTerrainApis.get(sceneIndex);
    if (oldApi) { try { oldApi.dispose(); } catch (_) {} _sceneTerrainApis.delete(sceneIndex); }
    mount.style.display = 'block';
    const api = window.LumenAdminSceneTerrainPreview.attach(mount, scene, {
        width: 480, height: 320,
        // refresh 시점마다 최신 cont 가져가게 함수로 넘김 (값 캡처 X)
        getCont: _getPreviewCont,
    });
    if (api) _sceneTerrainApis.set(sceneIndex, api);
}

function _unmountSceneTerrainPreview(sceneIndex) {
    const api = _sceneTerrainApis.get(sceneIndex);
    if (api) { try { api.dispose(); } catch (_) {} _sceneTerrainApis.delete(sceneIndex); }
    const mount = document.getElementById('sceneTerrainMount-' + sceneIndex);
    if (mount) mount.style.display = 'none';
}

function _refreshSceneTerrainPreview(sceneIndex) {
    const api = _sceneTerrainApis.get(sceneIndex);
    if (!api) return;
    const scene = currentScenes[sceneIndex];
    if (!scene) return;
    try { api.refresh(scene); } catch (e) { console.warn('[scene-terrain] refresh fail', e); }
}

// 메모리 cont 슬라이더 변경 시 활성 씬 미리보기 전부 갱신 (cont 가 메모리 단위라 모두 같이 흔들림)
function _refreshAllSceneTerrainPreviews() {
    _sceneTerrainApis.forEach((api, sceneIndex) => {
        const scene = currentScenes[sceneIndex];
        if (!scene) return;
        try { api.refresh(scene); } catch (_) {}
    });
}
window._refreshAllSceneTerrainPreviews = _refreshAllSceneTerrainPreviews;

function toggleSceneTerrainPreview(sceneIndex) {
    const scene = currentScenes[sceneIndex];
    if (!scene) return;
    if (scene.terrainPreviewEnabled) {
        scene.terrainPreviewEnabled = false;
        _unmountSceneTerrainPreview(sceneIndex);
    } else {
        scene.terrainPreviewEnabled = true;
        _mountSceneTerrainPreview(sceneIndex);
    }
    const btn = document.querySelector(`.preview-terrain-btn[data-scene-index="${sceneIndex}"]`);
    if (btn) btn.textContent = scene.terrainPreviewEnabled ? '3D 모양 숨기기' : '3D 모양 보기';
}
window.toggleSceneTerrainPreview = toggleSceneTerrainPreview;
window._refreshSceneTerrainPreview = _refreshSceneTerrainPreview;

// 편집용: 장면 하나의 감정 벡터 (originalEmotion 기반, 0–100 정규화)
function getSceneEmotionVectorForEditor(sceneIndex) {
    const scene = currentScenes[sceneIndex];
    if (!scene) return { fear: 0, sadness: 0, guilt: 0, anger: 0, longing: 0, isolation: 0, numbness: 0, moralPain: 0 };
    const o = scene.originalEmotion || {};
    const base = { fear: 0, sadness: 0, guilt: 0, anger: 0, longing: 0, isolation: 0, numbness: 0, moralPain: 0 };
    const keyMap = { moral_pain: 'moralPain' };
    Object.entries(o).forEach(([emotion, intensity]) => {
        const key = keyMap[emotion] || emotion;
        if (base.hasOwnProperty(key)) base[key] = Math.max(0, Math.min(1, Number(intensity) || 0));
    });
    return base;
}

function getEditorWaveStyle(emotionVector) {
    const ev = (emotionVector && typeof emotionVector === 'object') ? emotionVector : {};
    const alias = Object.assign({}, ev);
    if (alias.moralPain != null && alias.shame == null) alias.shame = alias.moralPain;

    const total = Object.values(alias).reduce((a, b) => a + (Number(b) || 0), 0);
    const intensity = Math.max(0, Math.min(1, total / 6));
    let dominant = 'sadness';
    let maxVal = -1;
    Object.entries(alias).forEach(([k, v]) => {
        const n = Number(v) || 0;
        if (n > maxVal) {
            maxVal = n;
            dominant = k;
        }
    });

    const colors = {
        fear: [100, 80, 180],
        sadness: [80, 100, 160],
        anger: [200, 80, 80],
        joy: [200, 180, 100],
        longing: [80, 180, 180],
        guilt: [150, 130, 100],
        shame: [160, 100, 130],
        numbness: [90, 90, 110],
        isolation: [70, 90, 130],
        confusion: [120, 100, 140],
    };
    const c = colors[dominant] || colors.sadness;
    return {
        color: { r: c[0], g: c[1], b: c[2] },
        speed: 0.3 + intensity * 0.9,
        amplitude: 30 + intensity * 50,
        frequency: 0.008 + intensity * 0.012,
        chaos: 0.1 + intensity * 0.7,
    };
}

// 편집란: 장면 하나의 원본 파동 그리기 (감정 매핑 변경 시 실시간 반영)
function clearSceneWaveCanvas(sceneIndex) {
    stopOriginalWavePreview(sceneIndex);
    const canvas = document.getElementById(`sceneWaveCanvas-${sceneIndex}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(18, 18, 26, 0.3)';
    ctx.fillRect(0, 0, w, h);
}

// 편집란: 장면 하나의 원본 파동 그리기 (두줄 파동 로직 기반, 한 줄만 렌더)
function renderSceneWave(sceneIndex, timeSec = 0) {
    const canvas = document.getElementById(`sceneWaveCanvas-${sceneIndex}`);
    if (!canvas) return;
    const scene = currentScenes[sceneIndex];
    if (!scene || !scene.wavePreviewEnabled) {
        clearSceneWaveCanvas(sceneIndex);
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(18, 18, 26, 0.3)';
    ctx.fillRect(0, 0, w, h);

    const emotionVector = getSceneEmotionVectorForEditor(sceneIndex);
    const style = getEditorWaveStyle(emotionVector);
    const centerY = h * 0.5;
    const phase = timeSec;
    const ampScale = Math.min(1, (h * 0.34) / Math.max(1, style.amplitude));

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${style.color.r}, ${style.color.g}, ${style.color.b}, 0.78)`;
    ctx.lineWidth = 1.6;
    for (let x = 0; x <= w; x += 2) {
        const edgeFade = Math.sin((x / Math.max(1, w)) * Math.PI);
        let y = Math.sin(x * style.frequency + phase * style.speed) * style.amplitude;
        y += Math.sin(x * style.frequency * 2.3 + phase * style.speed * 0.7) * (style.amplitude * 0.4);
        y += Math.sin(x * style.frequency * 0.4 + phase * style.speed * 0.3) * (style.amplitude * 0.6);
        const noiseN = Math.sin(x * 0.129898 + phase * 0.78233) * 43758.5453;
        const noise = noiseN - Math.floor(noiseN);
        y += (noise - 0.5) * (style.chaos * 15);
        y = y * edgeFade * ampScale;
        const yy = centerY + y;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
    }
    ctx.stroke();
}

const EMOTION_LABELS = {
    fear: '공포', sadness: '슬픔', anger: '분노', guilt: '죄책감',
    shame: '수치심', isolation: '고립', numbness: '무감각',
    moral_pain: '도덕적 고통', helplessness: '무력감', despair: '절망',
    joy: '기쁨', hope: '희망', relief: '안도', gratitude: '감사',
    love: '사랑', peace: '평화', comfort: '위로'
};

function renderOriginalEmotions(originalEmotion, sceneIndex) {
    if (!originalEmotion || Object.keys(originalEmotion).length === 0) {
        return '<div style="color: var(--text-muted); padding: 1rem; text-align: center;">감정이 없습니다. 아래 버튼으로 추가하세요.</div>';
    }

    return Object.entries(originalEmotion).map(([emotion, intensity], index) => `
        <div class="original-emotion-item" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-deep); border-radius: 4px;">
            <select class="original-emotion-select" data-scene-index="${sceneIndex}" data-emotion-index="${index}" style="flex: 1; padding: 0.4rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .3); color: var(--text-primary); border-radius: 4px;">
                ${DEFAULT_EMOTION_ANCHORS.map(e =>
                    `<option value="${e}" ${emotion === e ? 'selected' : ''}>${EMOTION_LABELS[e] || e} (${e})</option>`
                ).join('')}
            </select>
            <input type="range" class="original-emotion-intensity" data-scene-index="${sceneIndex}" data-emotion-index="${index}" min="0" max="1" step="0.01" value="${intensity}" style="flex: 2;">
            <input type="number" class="original-emotion-number" data-scene-index="${sceneIndex}" data-emotion-index="${index}" min="0" max="1" step="0.01" value="${(intensity * 1).toFixed(2)}" style="width: 4.5rem; padding: 0.3rem 0.4rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .3); color: var(--accent-memory); border-radius: 4px; text-align: center; font-size: 0.9rem;">
            <button class="remove-emotion-btn" onclick="removeOriginalEmotion(${sceneIndex}, ${index})" style="padding: 0.3rem 0.6rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .3); color: var(--text-primary); border-radius: 4px; cursor: pointer;">삭제</button>
        </div>
    `).join('');
}

// wave data create function (emotionVectorToWaveStyle 기반)
function computeWaveData(emotionVector, sceneTextLength, voidLevel, timeSec = 0) {
    const wavePoints = [];
    const width = Math.max(180, Math.min(900, Math.round((sceneTextLength || 1) * 10)));
    const waveStyle = emotionVectorToWaveStyle(emotionVector);

    for (let x = 0; x < width; x++) {
        const nx = x / Math.max(1, width - 1);
        let y = 0;
        // primary wave
        y += Math.sin(nx * Math.PI * 2 * (waveStyle.frequency * 125) + timeSec * waveStyle.speed) * (waveStyle.amplitude / 30);
        // secondary harmonic
        y += Math.sin(nx * Math.PI * 2 * (waveStyle.frequency * 287) + timeSec * waveStyle.speed * 0.7) * (waveStyle.amplitude / 75);
        // chaos component
        y += (Math.sin(nx * 47.3 + timeSec * 1.7) * 0.5 - 0.25) * waveStyle.chaos;
        // base component
        y += Math.sin(nx * Math.PI * 2 * 0.35 + 0.4 + timeSec * 0.45) * 0.08;
        wavePoints.push({ x, y });
    }

    if (voidLevel === 'high') {
        wavePoints.forEach(p => { p.y *= 0.55; });
    }

    const c = waveStyle.color;
    return { wavePoints, color: `rgb(${c.r}, ${c.g}, ${c.b})` };
}

function stopOriginalWavePreview(sceneIndex) {
    const rafId = sceneWaveAnimationMap.get(sceneIndex);
    if (rafId) {
        cancelAnimationFrame(rafId);
        sceneWaveAnimationMap.delete(sceneIndex);
    }
}

function startOriginalWavePreview(sceneIndex, fromRender = false) {
    const scene = currentScenes[sceneIndex];
    if (!scene) return;

    if (!fromRender) {
        scene.wavePreviewEnabled = !scene.wavePreviewEnabled;
    } else {
        scene.wavePreviewEnabled = true;
    }

    const btn = document.querySelector(`.preview-wave-btn[data-scene-index="${sceneIndex}"]`);
    if (btn) btn.textContent = scene.wavePreviewEnabled ? '원본 파동 중지' : '원본 파동 보기';

    stopOriginalWavePreview(sceneIndex);

    if (!scene.wavePreviewEnabled) {
        clearSceneWaveCanvas(sceneIndex);
        return;
    }

    const tick = () => {
        const t = performance.now() * 0.001;
        renderSceneWave(sceneIndex, t);
        const id = requestAnimationFrame(tick);
        sceneWaveAnimationMap.set(sceneIndex, id);
    };
    const id = requestAnimationFrame(tick);
    sceneWaveAnimationMap.set(sceneIndex, id);
}

// VOID 자동 감지 function
function detectVoid(sceneText, emotionReasonText, emotionVector) {
 // 1) Scene Void (text 모호성 중심)
    const vagueSceneKeywords = ["기억이 안", "흐릿", "모르겠", "잘 기억", "대충", "애매"];
    
    const sceneVoid =
        sceneText.trim().length === 0 ||
        vagueSceneKeywords.some(k => sceneText.includes(k));
    
    // 2) Reason Void
    const vagueReasonKeywords = ["모르겠", "기억 안", "설명하기", "말하기 어렵"];
    
    const reasonVoid =
        !emotionReasonText ||
        emotionReasonText.trim().length === 0 ||
        vagueReasonKeywords.some(k => emotionReasonText.includes(k));
    
 // 3) Emotion Void (emotionVector 기반)
    const emotionSum = Object.values(emotionVector || {}).reduce((a, b) => a + b, 0);
    const emotionVoid = emotionSum === 0;  // 감정 입력 없음
    
 // 최종 VOID Level
    const voidCount = [sceneVoid, reasonVoid, emotionVoid].filter(v => v).length;
    const voidLevel = voidCount >= 2 ? "high" : "low";
    
    return { sceneVoid, reasonVoid, emotionVoid, voidLevel };
}

// scene 벤트 listener connect
function attachSceneListeners() {
 // scene 본문
    document.querySelectorAll('.scene-text-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].text = this.value;
            renderSceneWave(sceneIndex);
        });
    });

 // 유령 이름 (W1-C) — scenes.meta.ghost_name 왕복. meta 는 병합(다른 키 보존, CLAUDE 규칙 3).
    document.querySelectorAll('.scene-ghost-name-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const scene = currentScenes[sceneIndex];
            if (!scene.meta || typeof scene.meta !== 'object') scene.meta = {};
            const v = this.value.trim();
            if (v) scene.meta.ghost_name = v;
            else delete scene.meta.ghost_name;
        });
    });

 // W3-O: 감정 결 선택지(choices) 입력
    document.querySelectorAll('.choice-text-input').forEach(input => {
        input.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            if (currentScenes[si] && currentScenes[si].choices[ci]) currentScenes[si].choices[ci].text = this.value;
        });
    });
    document.querySelectorAll('.choice-emotion-select').forEach(sel => {
        sel.addEventListener('change', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            if (currentScenes[si] && currentScenes[si].choices[ci]) currentScenes[si].choices[ci].emotion = this.value;
        });
    });
    document.querySelectorAll('.choice-intensity-input').forEach(input => {
        input.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            let v = parseInt(this.value, 10); if (isNaN(v)) v = 5; v = Math.max(0, Math.min(10, v));
            if (currentScenes[si] && currentScenes[si].choices[ci]) currentScenes[si].choices[ci].intensity = v;
        });
    });

 // W3-N: 유령 대사(dialog_choices) 입력 — scenes.meta.dialog_choices 병합
    document.querySelectorAll('.dlg-intro-input').forEach(t => {
        t.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex);
            const dlg = getDlg(currentScenes[si]); dlg.ghost_intro = _dlgLines(this.value); setDlg(si, dlg);
        });
    });
    document.querySelectorAll('.dlg-context-input').forEach(t => {
        t.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex);
            const dlg = getDlg(currentScenes[si]); dlg.scene_context = _dlgLines(this.value); setDlg(si, dlg);
        });
    });
    document.querySelectorAll('.dlg-label-input').forEach(input => {
        input.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            const dlg = getDlg(currentScenes[si]); if (dlg.choices[ci]) { dlg.choices[ci].label = this.value; setDlg(si, dlg); }
        });
    });
    document.querySelectorAll('.dlg-reply-input').forEach(t => {
        t.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            const dlg = getDlg(currentScenes[si]); if (dlg.choices[ci]) { dlg.choices[ci].ghost_reply = _dlgLines(this.value); setDlg(si, dlg); }
        });
    });
    document.querySelectorAll('.dlg-free-input').forEach(t => {
        t.addEventListener('input', function() {
            const si = parseInt(this.dataset.sceneIndex), ci = parseInt(this.dataset.choiceIndex);
            const dlg = getDlg(currentScenes[si]); if (dlg.choices[ci]) { dlg.choices[ci].free_dialog_open = _dlgLines(this.value); setDlg(si, dlg); }
        });
    });

 // exclusions (부정 제약) textarea
    document.querySelectorAll('.scene-exclusions-input').forEach(input => {
        input.addEventListener('blur', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const errorEl = document.querySelector(`.scene-exclusions-error[data-scene-index="${sceneIndex}"]`);
            const raw = this.value.trim();
            if (!raw) {
                currentScenes[sceneIndex].exclusions = null;
                if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) throw new Error('배열이어야 합니다');
                for (const entry of parsed) {
                    if (!entry || typeof entry !== 'object' || !entry.condition) {
                        throw new Error('각 항목에 condition 필드 필요');
                    }
                    const t = entry.condition.type;
                    if (!['emotion_threshold', 'contamination_stage', 'visited_scene'].includes(t)) {
                        throw new Error(`알 수 없는 type: ${t}`);
                    }
                }
                currentScenes[sceneIndex].exclusions = parsed.length > 0 ? parsed : null;
                if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
            } catch (err) {
                if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = 'JSON 오류: ' + err.message; }
            }
        });
    });

 // anchor_emotions input 벤트
    document.querySelectorAll('.anchor-emotions-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const value = this.value.trim();
 // 콤마 구분 문자열 array convert
            currentScenes[sceneIndex].anchor_emotions = value
                ? value.split(',').map(s => s.trim()).filter(s => s)
                : null;
            console.log('=== Admin 에디터 개선 ===');
            console.log('anchor_emotions 업데이트:', currentScenes[sceneIndex].anchor_emotions);
        });
    });

 // 잔향 단어
    document.querySelectorAll('.scene-echo-words-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const value = this.value.trim();
 // 콤마 구분하여 array convert
            currentScenes[sceneIndex].echoWords = value ? value.split(',').map(w => w.trim()).filter(w => w) : [];
        });
    });

 // scene 역할 (R1-2: anchor/residual/null — DB scene_role 왕복)
    document.querySelectorAll('.scene-role-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].scene_role = this.value || null;
        });
    });

 // scene 타입
    document.querySelectorAll('.scene-type-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].sceneType = this.value;
 // 타입 변경 시 original 필드 display/숨김 업데 트
            const originalFields = document.querySelectorAll(`.scene-original-fields[data-scene-index="${sceneIndex}"]`);
            const originalSection = document.querySelector(`.editor-section.scene-original-fields[data-scene-index="${sceneIndex}"]`);
            if (this.value === 'branch' || this.value === 'ending') {
                originalFields.forEach(field => field.style.display = 'block');
                if (originalSection) originalSection.style.display = 'block';
            } else {
                originalFields.forEach(field => field.style.display = 'none');
                if (originalSection) originalSection.style.display = 'none';
            }
 // 다음 scene 선택 드롭다운 업데 트 (타입 display 반영)
            renderScenes();
        });
    });

 // original 유
    document.querySelectorAll('.scene-original-reason-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].originalReason = this.value.trim();
        });
    });

 // original 유 vector 업데 트
    document.querySelectorAll('.original-reason-vector-attribution').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].originalReasonVector) {
                currentScenes[sceneIndex].originalReasonVector = {
                    attribution: 'fate_blame',
                    core_fear: 'none',
                    is_void: false
                };
            }
            currentScenes[sceneIndex].originalReasonVector.attribution = this.value;
            if (typeof _refreshSceneTerrainPreview === 'function') _refreshSceneTerrainPreview(sceneIndex);
        });
    });

    document.querySelectorAll('.original-reason-vector-core-fear').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].originalReasonVector) {
                currentScenes[sceneIndex].originalReasonVector = {
                    attribution: 'fate_blame',
                    core_fear: 'none',
                    is_void: false
                };
            }
            currentScenes[sceneIndex].originalReasonVector.core_fear = this.value;
            if (typeof _refreshSceneTerrainPreview === 'function') _refreshSceneTerrainPreview(sceneIndex);
        });
    });

    document.querySelectorAll('.original-reason-vector-is-void').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].originalReasonVector) {
                currentScenes[sceneIndex].originalReasonVector = {
                    attribution: 'fate_blame',
                    core_fear: 'none',
                    is_void: false
                };
            }
            currentScenes[sceneIndex].originalReasonVector.is_void = this.checked;
            if (typeof _refreshSceneTerrainPreview === 'function') _refreshSceneTerrainPreview(sceneIndex);
        });
    });

 // original emotion 선택 변경
    document.querySelectorAll('.original-emotion-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const emotionIndex = parseInt(this.dataset.emotionIndex);
            updateOriginalEmotion(sceneIndex, emotionIndex);
            if (currentScenes[sceneIndex]?.wavePreviewEnabled) renderSceneWave(sceneIndex, performance.now() * 0.001);
        });
    });

    document.querySelectorAll('.original-emotion-intensity').forEach(slider => {
        slider.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const emotionIndex = parseInt(this.dataset.emotionIndex);
            const value = parseFloat(this.value);
            const numberInput = this.parentElement.querySelector('.original-emotion-number');
            if (numberInput) numberInput.value = value.toFixed(2);
            updateOriginalEmotion(sceneIndex, emotionIndex);
            if (currentScenes[sceneIndex]?.wavePreviewEnabled) renderSceneWave(sceneIndex, performance.now() * 0.001);
        });
    });

    document.querySelectorAll('.original-emotion-number').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const emotionIndex = parseInt(this.dataset.emotionIndex);
            let value = parseFloat(this.value);
            if (isNaN(value)) return;
            value = Math.max(0, Math.min(1, value));
            const slider = this.parentElement.querySelector('.original-emotion-intensity');
            if (slider) slider.value = value;
            updateOriginalEmotion(sceneIndex, emotionIndex);
            if (currentScenes[sceneIndex]?.wavePreviewEnabled) renderSceneWave(sceneIndex, performance.now() * 0.001);
        });
    });

 // VOID 체크박스
    document.querySelectorAll('.scene-void-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].voidInfo) {
                currentScenes[sceneIndex].voidInfo = { sceneVoid: false, emotionVoid: false, reasonVoid: false, voidLevel: 'low' };
            }
            currentScenes[sceneIndex].voidInfo.sceneVoid = this.checked;
            updateVoidLevel(sceneIndex);
            if (currentScenes[sceneIndex]?.wavePreviewEnabled) renderSceneWave(sceneIndex, performance.now() * 0.001);
        });
    });

    document.querySelectorAll('.emotion-void-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].voidInfo) {
                currentScenes[sceneIndex].voidInfo = { sceneVoid: false, emotionVoid: false, reasonVoid: false, voidLevel: 'low' };
            }
            currentScenes[sceneIndex].voidInfo.emotionVoid = this.checked;
            updateVoidLevel(sceneIndex);
            renderSceneWave(sceneIndex);
        });
    });

    document.querySelectorAll('.reason-void-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            if (!currentScenes[sceneIndex].voidInfo) {
                currentScenes[sceneIndex].voidInfo = { sceneVoid: false, emotionVoid: false, reasonVoid: false, voidLevel: 'low' };
            }
            currentScenes[sceneIndex].voidInfo.reasonVoid = this.checked;
            updateVoidLevel(sceneIndex);
            renderSceneWave(sceneIndex);
        });
    });

 // 자동 감지 button
    document.querySelectorAll('.auto-detect-void-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const scene = currentScenes[sceneIndex];
            
            const sceneTextInput = document.querySelector(`.scene-text-input[data-scene-index="${sceneIndex}"]`);
            const emotionReasonInput = document.querySelector(`.scene-original-reason-input[data-scene-index="${sceneIndex}"]`);
            
            const sceneText = sceneTextInput ? sceneTextInput.value : '';
            const emotionReasonText = emotionReasonInput ? emotionReasonInput.value : '';
            
 // emotion vector calculate
            const emotionVector = {
                fear: 0, sadness: 0, guilt: 0, anger: 0,
                longing: 0, isolation: 0, numbness: 0, moralPain: 0
            };
            
            if (scene.choices && scene.choices.length > 0) {
                scene.choices.forEach(choice => {
                    const intensity = (choice.intensity || 5) / 10;
                    if (emotionVector.hasOwnProperty(choice.emotion)) {
                        emotionVector[choice.emotion] += intensity;
                    }
                });
                
 // normalize
                const total = Object.values(emotionVector).reduce((sum, val) => sum + val, 0);
                if (total > 0) {
                    Object.keys(emotionVector).forEach(key => {
                        emotionVector[key] = Math.round((emotionVector[key] / total) * 100);
                    });
                }
            }
            
            const voidInfo = detectVoid(sceneText, emotionReasonText, emotionVector);
            
 // 체크박스 업데 트
            const sceneVoidCheckbox = document.querySelector(`.scene-void-toggle[data-scene-index="${sceneIndex}"]`);
            const emotionVoidCheckbox = document.querySelector(`.emotion-void-toggle[data-scene-index="${sceneIndex}"]`);
            const reasonVoidCheckbox = document.querySelector(`.reason-void-toggle[data-scene-index="${sceneIndex}"]`);
            
            if (sceneVoidCheckbox) sceneVoidCheckbox.checked = voidInfo.sceneVoid;
            if (emotionVoidCheckbox) emotionVoidCheckbox.checked = voidInfo.emotionVoid;
            if (reasonVoidCheckbox) reasonVoidCheckbox.checked = voidInfo.reasonVoid;
            
 // voidInfo save
            currentScenes[sceneIndex].voidInfo = voidInfo;
            updateVoidLevel(sceneIndex);
            renderSceneWave(sceneIndex);
        });
    });

 // text_stage_1 벤트
    document.querySelectorAll('.scene-text-stage-1').forEach(textarea => {
        textarea.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].text_stage_1 = this.value.trim() || null;
            console.log('text_stage_1/2/3 저장됨');
        });
    });

 // text_stage_2 벤트
    document.querySelectorAll('.scene-text-stage-2').forEach(textarea => {
        textarea.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].text_stage_2 = this.value.trim() || null;
        });
    });

 // text_stage_3 벤트
    document.querySelectorAll('.scene-text-stage-3').forEach(textarea => {
        textarea.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].text_stage_3 = this.value.trim() || null;
        });
    });
}

// VOID 레벨 업데 트
function updateVoidLevel(sceneIndex) {
    const scene = currentScenes[sceneIndex];
    if (!scene.voidInfo) {
        scene.voidInfo = { sceneVoid: false, emotionVoid: false, reasonVoid: false, voidLevel: 'low' };
    }
    
    const voidCount = (scene.voidInfo.sceneVoid ? 1 : 0) + 
                     (scene.voidInfo.emotionVoid ? 1 : 0) + 
                     (scene.voidInfo.reasonVoid ? 1 : 0);
    
    scene.voidInfo.voidLevel = voidCount > 1 ? 'high' : 'low';
    
    const voidLevelDisplay = document.querySelector(`.void-level-display[data-scene-index="${sceneIndex}"]`);
    if (voidLevelDisplay) {
        voidLevelDisplay.textContent = `VOID Level: ${scene.voidInfo.voidLevel.charAt(0).toUpperCase() + scene.voidInfo.voidLevel.slice(1)}`;
        voidLevelDisplay.className = `void-level-display ${scene.voidInfo.voidLevel}`;
    }
}

function addOriginalEmotion(sceneIndex) {
    if (!currentScenes[sceneIndex].originalEmotion) {
        currentScenes[sceneIndex].originalEmotion = {};
    }

    const existingEmotions = Object.keys(currentScenes[sceneIndex].originalEmotion);
    const newEmotion = DEFAULT_EMOTION_ANCHORS.find(e => !existingEmotions.includes(e));

    if (newEmotion) {
        currentScenes[sceneIndex].originalEmotion[newEmotion] = 0.5;
        renderScenes();
    } else {
        showToast('17개 감정이 모두 추가되었습니다', 'success');
    }
}

// original emotion delete
function removeOriginalEmotion(sceneIndex, emotionIndex) {
    if (!currentScenes[sceneIndex].originalEmotion) return;
    
    const emotions = Object.keys(currentScenes[sceneIndex].originalEmotion);
    if (emotionIndex >= 0 && emotionIndex < emotions.length) {
        const emotionKey = emotions[emotionIndex];
        delete currentScenes[sceneIndex].originalEmotion[emotionKey];
        
 // 빈 object 되면 null config
        if (Object.keys(currentScenes[sceneIndex].originalEmotion).length === 0) {
            currentScenes[sceneIndex].originalEmotion = null;
        }
        renderScenes();
    }
}

// original emotion 업데 트
function updateOriginalEmotion(sceneIndex, emotionIndex) {
    if (!currentScenes[sceneIndex].originalEmotion) {
        currentScenes[sceneIndex].originalEmotion = {};
    }
    
    const emotions = Object.keys(currentScenes[sceneIndex].originalEmotion);
    if (emotionIndex >= 0 && emotionIndex < emotions.length) {
        const oldEmotionKey = emotions[emotionIndex];
        const select = document.querySelector(`.original-emotion-select[data-scene-index="${sceneIndex}"][data-emotion-index="${emotionIndex}"]`);
        const slider = document.querySelector(`.original-emotion-intensity[data-scene-index="${sceneIndex}"][data-emotion-index="${emotionIndex}"]`);
        
        if (select && slider) {
            const newEmotionKey = select.value;
            const intensity = parseFloat(slider.value);
            
 // existing emotion delete
            delete currentScenes[sceneIndex].originalEmotion[oldEmotionKey];

 // 새 emotion add
            currentScenes[sceneIndex].originalEmotion[newEmotionKey] = intensity;
        }
    }
    // §14 Phase 1: 3D 모양 미리보기 활성된 씬은 라이브 갱신
    if (typeof _refreshSceneTerrainPreview === 'function') _refreshSceneTerrainPreview(sceneIndex);
}


// scene delete
function deleteScene(sceneIndex) {
    if (confirm('이 장면을 삭제하시겠습니까?')) {
        currentScenes.splice(sceneIndex, 1);
        renderScenes();
    }
}

// scene 위 navigate
function moveSceneUp(sceneIndex) {
    if (sceneIndex > 0) {
        [currentScenes[sceneIndex], currentScenes[sceneIndex - 1]] = [currentScenes[sceneIndex - 1], currentScenes[sceneIndex]];
        renderScenes();
    }
}

// scene 아래 navigate
function moveSceneDown(sceneIndex) {
    if (sceneIndex < currentScenes.length - 1) {
        [currentScenes[sceneIndex], currentScenes[sceneIndex + 1]] = [currentScenes[sceneIndex + 1], currentScenes[sceneIndex]];
        renderScenes();
    }
}

// 탭 switch (편집 | 미리보기; 미리보기 안에 ①장면별 원본 파동 ②2차원 지형도 ③Strata 3D)
function switchTab(tab) {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-content').forEach(c => c.classList.remove('active'));

    if (tab === 'edit') {
        document.querySelectorAll('.editor-tab')[0].classList.add('active');
        document.getElementById('editContent').classList.add('active');
        stopPreviewWaveAnimation();
    } else if (tab === 'utterances') {
        document.querySelectorAll('.editor-tab')[1].classList.add('active');
        document.getElementById('utterancesContent').classList.add('active');
        loadUtterances();
    }
}

// ─── Afterimage utterance moderation ──────────────────────────────
// See docs/잔상_시스템_설계-260409.md §5

function _escapeUtteranceText(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

async function loadUtterances() {
    const listEl = document.getElementById('utterancesList');
    const countEl = document.getElementById('utterancesCount');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">불러오는 중…</div>';

    try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase client unavailable');

        const status = document.getElementById('utterancesFilterStatus')?.value || 'pending';
        const lang = document.getElementById('utterancesFilterLang')?.value || 'all';

        let q = supabase
            .from('utterances')
            .select('id, text, lang, source_type, contributor_id, memory_id, emotion_tags, keywords, is_public, moderation_status, moderation_flags, show_count, created_at')
            .order('created_at', { ascending: false })
            .limit(200);

        if (status !== 'all') q = q.eq('moderation_status', status);
        if (lang !== 'all') q = q.eq('lang', lang);

        const { data, error } = await q;
        if (error) throw error;

        countEl.textContent = `${data.length}건`;

        if (!data.length) {
            listEl.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">해당 항목이 없습니다.</div>';
            return;
        }

        listEl.innerHTML = data.map((u) => {
            const tags = Array.isArray(u.emotion_tags) && u.emotion_tags.length ? u.emotion_tags.join(', ') : '—';
            const keys = Array.isArray(u.keywords) && u.keywords.length ? u.keywords.join(', ') : '—';
            const consent = u.is_public ? '✓ 공개동의' : '비공개';
            const status = u.moderation_status;
            const sourceLabel = ({ record: 'Record', play: 'Play', seed: 'Seed', scene_input: 'SceneInput' })[u.source_type] || u.source_type;
            return `
                <div data-uid="${u.id}" style="background:var(--bg-surface);border:1px solid rgba(196,168,130,0.18);padding:1rem;display:flex;flex-direction:column;gap:0.5rem;">
                    <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:rgba(245,240,232,0.9);line-height:1.55;">
                        ${_escapeUtteranceText(u.text)}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.75rem;color:var(--text-muted);">
                        <span>[${sourceLabel}]</span>
                        <span>${u.lang}</span>
                        <span>${consent}</span>
                        <span>상태: ${status}</span>
                        <span>표시: ${u.show_count}</span>
                        <span>감정: ${_escapeUtteranceText(tags)}</span>
                        <span>키워드: ${_escapeUtteranceText(keys)}</span>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="editor-btn" data-act="approve" data-uid="${u.id}" type="button">승인</button>
                        <button class="editor-btn" data-act="reject" data-uid="${u.id}" type="button">거절</button>
                        <button class="editor-btn" data-act="toggle-public" data-uid="${u.id}" type="button">${u.is_public ? '비공개 처리' : '공개 처리'}</button>
                        <button class="editor-btn" data-act="delete" data-uid="${u.id}" type="button" style="margin-left:auto;color:#c66;">삭제</button>
                    </div>
                </div>`;
        }).join('');

        // Wire buttons
        listEl.querySelectorAll('button[data-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const act = btn.dataset.act;
                const id = btn.dataset.uid;
                await handleUtteranceAction(act, id);
            });
        });
    } catch (e) {
        console.error('[utterances] load error:', e);
        listEl.innerHTML = `<div style="color:#c66;padding:1rem;">불러오기 실패: ${_escapeUtteranceText(e?.message || e)}</div>`;
    }
}

async function handleUtteranceAction(act, id) {
    if (!id) return;
    try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase client unavailable');

        if (act === 'delete') {
            if (!confirm('이 잔상을 영구 삭제할까요?')) return;
            const { error } = await supabase.from('utterances').delete().eq('id', id);
            if (error) throw error;
        } else if (act === 'approve') {
            const { error } = await supabase.from('utterances').update({ moderation_status: 'approved' }).eq('id', id);
            if (error) throw error;
        } else if (act === 'reject') {
            const { error } = await supabase.from('utterances').update({ moderation_status: 'rejected' }).eq('id', id);
            if (error) throw error;
        } else if (act === 'toggle-public') {
            // Read current value, flip
            const { data, error: readErr } = await supabase.from('utterances').select('is_public').eq('id', id).single();
            if (readErr) throw readErr;
            const { error } = await supabase.from('utterances').update({ is_public: !data.is_public }).eq('id', id);
            if (error) throw error;
        }
        await loadUtterances();
    } catch (e) {
        console.error('[utterances] action error:', e);
        showToast('처리 실패: ' + (e?.message || e), 'error', { ttl: 0 });
    }
}

// Wire filter changes
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('utterancesRefresh')?.addEventListener('click', loadUtterances);
    document.getElementById('utterancesFilterStatus')?.addEventListener('change', loadUtterances);
    document.getElementById('utterancesFilterLang')?.addEventListener('change', loadUtterances);

    // §14: 메모리 cont 슬라이더 변경 → 활성 씬 미리보기 전부 갱신
    const _contIds = [
        'cont_divergence_input', 'cont_convergence_input', 'cont_heterogeneity_input',
        'cont_stage_1_input', 'cont_stage_2_input', 'cont_stage_3_input',
    ];
    _contIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            if (typeof _refreshAllSceneTerrainPreviews === 'function') _refreshAllSceneTerrainPreviews();
        });
    });
});

// 미리보기 렌더링
function renderPreview() {
    const container = document.getElementById('previewSceneContainer');
    if (!container) return;
    container.innerHTML = '';

    if (currentScenes.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">장면이 없습니다</div>';
        renderWavePreview(); // 파동도 업데이트
        return;
    }

    const scene = currentScenes[previewCurrentScene];
    if (!scene) {
        previewCurrentScene = 0;
        return renderPreview();
    }

    const sceneDiv = document.createElement('div');
    sceneDiv.className = 'preview-scene';
    sceneDiv.innerHTML = `
        <div class="preview-scene-text">${scene.text || '본문이 not found'}</div>
        <div class="preview-choices">
            ${scene.choices && scene.choices.length > 0 ? scene.choices.map((choice, index) => `
                <button class="preview-choice-btn" onclick="previewMakeChoice(${index})">${choice.text || '선택지 텍스트 없음'}</button>
            `).join('') : '<div style="color:var(--text-muted);padding:1rem;">선택지가 not found</div>'}
        </div>
    `;
    container.appendChild(sceneDiv);
    
 // wave 렌더링 업데 트
    renderWavePreview();
}

// 미리보기 서 choices 선택
function previewMakeChoice(choiceIndex) {
    const scene = currentScenes[previewCurrentScene];
    if (!scene || !scene.choices || !scene.choices[choiceIndex]) return;

    const choice = scene.choices[choiceIndex];
    const nextScene = choice.nextScene;

    if (nextScene === 'end') {
        showToast('엔딩에 도달했습니다', 'info');
        previewCurrentScene = 0;
    } else if (typeof nextScene === 'number' && nextScene < currentScenes.length) {
        previewCurrentScene = nextScene;
    } else {
        previewCurrentScene = previewCurrentScene + 1;
    }

    if (previewCurrentScene >= currentScenes.length) {
        previewCurrentScene = 0;
    }

    renderPreview(); // renderPreview() 내부에서 renderWavePreview() 호출됨
}

// 현재 scene emotion vector calculate
function getCurrentSceneEmotionVector() {
    const scene = currentScenes[previewCurrentScene];
    if (!scene) {
        return {
            fear: 0, sadness: 0, guilt: 0, anger: 0,
            longing: 0, isolation: 0, numbness: 0, moralPain: 0
        };
    }

    const emotionVector = {
        fear: 0, sadness: 0, guilt: 0, anger: 0,
        longing: 0, isolation: 0, numbness: 0, moralPain: 0
    };

    if (scene.choices && scene.choices.length > 0) {
        scene.choices.forEach(choice => {
            const intensity = (choice.intensity || 5) / 10;
            if (emotionVector.hasOwnProperty(choice.emotion)) {
                emotionVector[choice.emotion] += intensity;
            }
        });

 // normalize
        const total = Object.values(emotionVector).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(emotionVector).forEach(key => {
                emotionVector[key] = Math.round((emotionVector[key] / total) * 100);
            });
        }
    }

    return emotionVector;
}

// wave 엔진 Preview 렌더링
function renderWavePreview() {
 // previewWaveCanvas waveCanvas 
    const canvas = document.getElementById('previewWaveCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
 // canvas 크기 config
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    
    ctx.clearRect(0, 0, width, height);

    const scene = currentScenes[previewCurrentScene];
    if (!scene) return;

 // 현재 scene emotion vector calculate
    const currentEmotionVector = getCurrentSceneEmotionVector();
    const currentSceneText = scene.text || '';
    const voidLevel = scene.voidInfo?.voidLevel || 'low';

 // wave data create
    const waveData = computeWaveData(
        currentEmotionVector,
        currentSceneText.length || 1, // 0이면 1로 설정
        voidLevel
    );

 // background
    ctx.fillStyle = 'rgba(18, 18, 26, 0.1)';
    ctx.fillRect(0, 0, width, height);

 // wave 그리기
    if (waveData.wavePoints && waveData.wavePoints.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = waveData.color;
        ctx.lineWidth = 1.5;

        const centerY = height / 2;
        const maxX = currentSceneText.length * 10 || 1; // 0 방지

        waveData.wavePoints.forEach((p, i) => {
            const x = (p.x / maxX) * width; // x 좌표를 캔버스 너비에 맞게 스케일
            const y = centerY + (p.y / 100) * (height / 2); // y 좌표를 캔버스 높이에 맞게 스케일 (정규화)
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

 // VOID Level display (element 있으면 업데 트)
    const voidLevelEl = document.getElementById('voidLevel');
    if (voidLevelEl) {
        voidLevelEl.textContent = voidLevel;
    }

 // Layer ID display (현재 0으 config)
    const layerIdEl = document.getElementById('layerId');
    if (layerIdEl) {
        layerIdEl.textContent = '0';
    }
}

// 미리보기 wave 애니메 션 start (existing 애니메 션 - 호환성 maintain)
function startPreviewWaveAnimation() {
 // 새 운 wave 엔진 
    renderWavePreview();
    
 // existing 애니메 션 주석 process하거나 remove possible
 // 하지 호환성 위해 maintain
    /*
    const canvas = document.getElementById('previewWaveCanvas');
    if (!canvas) return;
    
    canvas.waveCanvas = true;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    let time = 0;
    function animate() {
        ctx.fillStyle = 'rgba(18, 18, 26, 0.1)';
        ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2);

        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;

        const scene = currentScenes[previewCurrentScene];
        let intensity = 0.5;
        if (scene && scene.choices && scene.choices.length > 0) {
            const avgIntensity = scene.choices.reduce((sum, c) => sum + (c.intensity || 5), 0) / scene.choices.length;
            intensity = avgIntensity / 10;
        }

        ctx.beginPath();
        ctx.strokeStyle = `rgba(196, 168, 130, ${0.4 + intensity * 0.4})`;
        ctx.lineWidth = 1.5;
        for (let x = 0; x < width; x++) {
            const y = centerY + Math.sin(x * 0.02 + time * 0.05) * (15 * intensity) + Math.sin(x * 0.01 + time * 0.03) * (10 * intensity);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        time++;
        previewWaveAnimationId = requestAnimationFrame(animate);
    }
    animate();
    */
}

// 미리보기 wave 애니메 션 중지
function stopPreviewWaveAnimation() {
    if (previewWaveAnimationId) {
        cancelAnimationFrame(previewWaveAnimationId);
        previewWaveAnimationId = null;
    }
}

// Archive Layer load function
async function loadArchiveLayers(memoryId) {
    if (!memoryId) {
        console.warn('[loadArchiveLayers] memoryId가 not found.');
        const canvas = document.getElementById('archiveCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'var(--text-muted)';
            ctx.font = '16px "Noto Serif KR"';
            ctx.textAlign = 'center';
            ctx.fillText('메모리를 먼저 저장해주세요.', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
        console.error('[loadArchiveLayers] Supabase client not initialized.');
        return;
    }

    try {
        console.log('[loadArchiveLayers] Archive 레이어 로드 시작', { memoryId });

        const data = await listArchiveLayers(supabaseClient, memoryId);

        if (!data || data.length === 0) {
            console.log('[loadArchiveLayers] Archive 레이어가 not found.');
            const canvas = document.getElementById('archiveCanvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'var(--text-muted)';
                ctx.font = '16px "Noto Serif KR"';
                ctx.textAlign = 'center';
                ctx.fillText('Archive 레이어가 not found. "다음 층 쌓기" 버튼으로 레이어를 추가하세요.', canvas.width / 2, canvas.height / 2);
            }
            return;
        }

        console.log('[loadArchiveLayers] Archive 레이어 로드 성공', { layersCount: data.length });
        renderArchive(data);
    } catch (error) {
        console.error('[loadArchiveLayers] Archive 로드 오류:', error);
        const canvas = document.getElementById('archiveCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'var(--accent-live)';
            ctx.font = '16px "Noto Serif KR"';
            ctx.textAlign = 'center';
            ctx.fillText('Archive 로드 오류: ' + error.message, canvas.width / 2, canvas.height / 2);
        }
    }
}

// ── 등고선 핀맵 미리보기 (play-test.html과 동일한 렌더링) ──

const ADMIN_MAP_GRID = 80;
const ADMIN_MAP_SIZE = 50;
const ADMIN_MAP_HALF = ADMIN_MAP_SIZE / 2;
const ADMIN_CONTOUR_LEVELS = 24;

// AF projection (play-test.html 동일 로직)
const ADM_AF_AXIS_X = { self_blame: -1, other_blame: 0, fate_blame: 1 };
const ADM_AF_AXIS_Z = { abandonment: -1, rejection: -0.33, powerlessness: 0.33, loss: 1 };
const ADM_E2A_AF = {
    fear: { s: 0.2, o: 0.1, f: 0.7 }, sadness: { s: 0.3, o: 0.1, f: 0.6 }, anger: { s: 0.1, o: 0.7, f: 0.2 },
    guilt: { s: 0.8, o: 0.05, f: 0.15 }, shame: { s: 0.75, o: 0.15, f: 0.1 }, joy: { s: 0.3, o: 0.3, f: 0.4 },
    numbness: { s: 0.15, o: 0.05, f: 0.8 }, isolation: { s: 0.3, o: 0.3, f: 0.4 }, longing: { s: 0.2, o: 0.2, f: 0.6 },
    resentment: { s: 0.1, o: 0.8, f: 0.1 }, resignation: { s: 0.1, o: 0.05, f: 0.85 }, hope: { s: 0.2, o: 0.2, f: 0.6 },
    relief: { s: 0.2, o: 0.1, f: 0.7 }, love: { s: 0.15, o: 0.3, f: 0.55 }, gratitude: { s: 0.15, o: 0.35, f: 0.5 },
    peace: { s: 0.15, o: 0.15, f: 0.7 }, confusion: { s: 0.3, o: 0.2, f: 0.5 },
};
const ADM_E2F_AF = {
    fear: { a: 0.15, r: 0.1, p: 0.55, l: 0.2 }, sadness: { a: 0.3, r: 0.1, p: 0.1, l: 0.5 },
    anger: { a: 0.1, r: 0.3, p: 0.5, l: 0.1 }, guilt: { a: 0.2, r: 0.25, p: 0.15, l: 0.4 },
    shame: { a: 0.15, r: 0.6, p: 0.1, l: 0.15 }, joy: { a: 0.15, r: 0.15, p: 0.15, l: 0.55 },
    numbness: { a: 0.3, r: 0.1, p: 0.4, l: 0.2 }, isolation: { a: 0.6, r: 0.25, p: 0.1, l: 0.05 },
    longing: { a: 0.55, r: 0.15, p: 0.05, l: 0.25 }, resentment: { a: 0.15, r: 0.35, p: 0.4, l: 0.1 },
    resignation: { a: 0.2, r: 0.05, p: 0.6, l: 0.15 }, hope: { a: 0.2, r: 0.15, p: 0.15, l: 0.5 },
    relief: { a: 0.1, r: 0.1, p: 0.3, l: 0.5 }, love: { a: 0.4, r: 0.2, p: 0.1, l: 0.3 },
    gratitude: { a: 0.2, r: 0.15, p: 0.1, l: 0.55 }, peace: { a: 0.15, r: 0.1, p: 0.15, l: 0.6 },
    confusion: { a: 0.2, r: 0.2, p: 0.4, l: 0.2 },
};

function admSafeParseEmotion(val) {
    if (!val) return {};
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch (_) { return {}; } }
    return {};
}

function admEmotionToAttrAF(ev) {
    const out = { self_blame: 0, other_blame: 0, fate_blame: 0 }; let total = 0;
    for (const e in ev) { const w = Number(ev[e] || 0); const m = ADM_E2A_AF[e]; if (!w || !m) continue; out.self_blame += w * m.s; out.other_blame += w * m.o; out.fate_blame += w * m.f; total += w; }
    if (total <= 0) return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
    out.self_blame /= total; out.other_blame /= total; out.fate_blame /= total; return out;
}
function admEmotionToFearAF(ev) {
    const out = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 }; let total = 0;
    for (const e in ev) { const w = Number(ev[e] || 0); const m = ADM_E2F_AF[e]; if (!w || !m) continue; out.abandonment += w * m.a; out.rejection += w * m.r; out.powerlessness += w * m.p; out.loss += w * m.l; total += w; }
    if (total <= 0) return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
    out.abandonment /= total; out.rejection /= total; out.powerlessness /= total; out.loss /= total; return out;
}
function admAfProjectX(attr) { let x = 0, w = 0; for (const k in attr) { const v = Number(attr[k] || 0); if (!v || ADM_AF_AXIS_X[k] === undefined) continue; x += v * ADM_AF_AXIS_X[k]; w += v; } return w > 0 ? Math.max(-1, Math.min(1, x / w)) : 0; }
function admAfProjectZ(fear) { let z = 0, w = 0; for (const k in fear) { const v = Number(fear[k] || 0); if (!v || ADM_AF_AXIS_Z[k] === undefined) continue; z += v * ADM_AF_AXIS_Z[k]; w += v; } return w > 0 ? Math.max(-1, Math.min(1, z / w)) : 0; }

function admProjectEmotionToAFContour(emotionVec) {
    const e = admSafeParseEmotion(emotionVec || {});
    const attr = admEmotionToAttrAF(e);
    const fear = admEmotionToFearAF(e);
    return { x: admAfProjectX(attr), z: admAfProjectZ(fear) };
}

function admEmotionToMapCoords(emotion) {
    const af = admProjectEmotionToAFContour(emotion || {});
    return { x: Math.max(0, Math.min(1, (af.x * ADMIN_MAP_HALF) / ADMIN_MAP_SIZE + 0.5)), y: Math.max(0, Math.min(1, (af.z * ADMIN_MAP_HALF) / ADMIN_MAP_SIZE + 0.5)) };
}

function admMapCoordsSpread(baseX, baseY, idx, sceneId) {
    const s = String(sceneId != null ? sceneId : idx);
    let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    const ang = (Math.abs(h) % 628) / 100;
    const mag = 0.012 + (Math.abs(h) % 23) / 2300;
    return { x: Math.max(0.03, Math.min(0.97, baseX + Math.cos(ang) * mag)), y: Math.max(0.03, Math.min(0.97, baseY + Math.sin(ang * 1.07) * mag)) };
}

// raster helpers (play-test.html 동일)
function admLerp2(a, b, c, d, tx, ty) { return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty; }
function admSampleH(heights, ix, iz, tx, ty, Gc) { const i = iz * Gc + ix; return admLerp2(heights[i], heights[i + 1], heights[i + Gc], heights[i + Gc + 1], tx, ty); }
function admToPastel(r, g, b, scale) {
    let rr = Math.max(0, Math.min(1, r * scale)), gg = Math.max(0, Math.min(1, g * scale)), bb = Math.max(0, Math.min(1, b * scale));
    const lum = rr * 0.299 + gg * 0.587 + bb * 0.114, ds = 0.62;
    let pr = rr * (1 - ds) + lum * ds, pg = gg * (1 - ds) + lum * ds, pb = bb * (1 - ds) + lum * ds;
    const pb2 = [0.26, 0.20, 0.34], pm = 0.38;
    pr = pr * (1 - pm) + pb2[0] * pm; pg = pg * (1 - pm) + pb2[1] * pm; pb = pb * (1 - pm) + pb2[2] * pm;
    pr = Math.min(0.46, Math.max(0, pr)); pg = Math.min(0.46, Math.max(0, pg)); pb = Math.min(0.46, Math.max(0, pb));
    return [pr * 0.9 + 0.02, pg * 0.88 + 0.014, pb * 0.92 + 0.032];
}
function admElevTint(pr, pg, pb, hN) {
    const t = Math.max(0, Math.min(1, hN)), lb = 0.88 + 0.2 * t, sh = (t - 0.5) * 0.1;
    return [pr * lb + sh * 0.55, pg * lb + sh * 0.12, pb * lb - sh * 0.45];
}

function admDrawRaster(ctx, agg, W, H) {
    const Gc = agg.gridG || ADMIN_MAP_GRID;
    let maxCh = 0; for (let i = 0; i < agg.colors.length; i++) maxCh = Math.max(maxCh, agg.colors[i]);
    const gScale = Math.min(0.72, 0.42 / (maxCh || 1));
    const hMin = agg.min, hRange = (agg.max - hMin) || 1;
    const img = ctx.createImageData(W, H); const p = img.data;
    for (let y = 0; y < H; y++) {
        const gy = (y / (H - 1)) * (Gc - 1), iz = Math.max(0, Math.min(Gc - 2, Math.floor(gy))), tz = gy - iz;
        for (let x = 0; x < W; x++) {
            const gx = (x / (W - 1)) * (Gc - 1), ix = Math.max(0, Math.min(Gc - 2, Math.floor(gx))), tx = gx - ix;
            const c00 = (iz * Gc + ix) * 3, c10 = c00 + 3, c01 = ((iz + 1) * Gc + ix) * 3, c11 = c01 + 3;
            const r = admLerp2(agg.colors[c00], agg.colors[c10], agg.colors[c01], agg.colors[c11], tx, tz);
            const g = admLerp2(agg.colors[c00 + 1], agg.colors[c10 + 1], agg.colors[c01 + 1], agg.colors[c11 + 1], tx, tz);
            const b = admLerp2(agg.colors[c00 + 2], agg.colors[c10 + 2], agg.colors[c01 + 2], agg.colors[c11 + 2], tx, tz);
            let [pr, pg, pb] = admToPastel(r, g, b, gScale);
            const hN = (admSampleH(agg.heights, ix, iz, tx, tz, Gc) - hMin) / hRange;
            [pr, pg, pb] = admElevTint(pr, pg, pb, hN);
            const i = (y * W + x) * 4;
            p[i] = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(1, pr)) * 255)));
            p[i + 1] = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(1, pg)) * 255)));
            p[i + 2] = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(1, pb)) * 255)));
            p[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}

function admMarchingSquares(heights, threshold, Gc) {
    const segs = [];
    const ep = (a, b, va, vb) => ({ x: a.x + (b.x - a.x) * ((threshold - va) / ((vb - va) || 1e-6)), y: a.y + (b.y - a.y) * ((threshold - va) / ((vb - va) || 1e-6)) });
    for (let z = 0; z < Gc - 1; z++) {
        for (let x = 0; x < Gc - 1; x++) {
            const i0 = z * Gc + x, v0 = heights[i0], v1 = heights[i0 + 1], v2 = heights[i0 + Gc + 1], v3 = heights[i0 + Gc];
            let c = 0;
            if (v0 >= threshold) c |= 1; if (v1 >= threshold) c |= 2; if (v2 >= threshold) c |= 4; if (v3 >= threshold) c |= 8;
            if (c === 0 || c === 15) continue;
            const p0 = { x, y: z }, p1 = { x: x + 1, y: z }, p2 = { x: x + 1, y: z + 1 }, p3 = { x, y: z + 1 };
            const e0 = ep(p0, p1, v0, v1), e1 = ep(p1, p2, v1, v2), e2 = ep(p3, p2, v3, v2), e3 = ep(p0, p3, v0, v3);
            const lut = { 1: [[e3, e0]], 2: [[e0, e1]], 3: [[e3, e1]], 4: [[e1, e2]], 5: [[e3, e2], [e0, e1]], 6: [[e0, e2]], 7: [[e3, e2]], 8: [[e2, e3]], 9: [[e0, e2]], 10: [[e0, e3], [e1, e2]], 11: [[e1, e2]], 12: [[e1, e3]], 13: [[e0, e1]], 14: [[e0, e3]] };
            (lut[c] || []).forEach(pair => segs.push(pair));
        }
    }
    return segs;
}

function admToCanvas(p, W, H, Gc) { return { x: (p.x / (Gc - 1)) * W, y: (p.y / (Gc - 1)) * H }; }

function renderContourMapPreview(agg, scenes, plays) {
    const canvas = document.getElementById('adminContourCanvas');
    const pinsLayer = document.getElementById('adminPinsLayer');
    if (!canvas) return;

    // ── canvas 크기 설정 ──
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(2, Math.floor(rect.width * dpr));
    const H = Math.max(2, Math.floor(rect.height * dpr));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (!agg) {
        ctx.fillStyle = '#0a0a0e';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#6b6b7b';
        ctx.font = (16 * dpr) + 'px "Noto Serif KR"';
        ctx.textAlign = 'center';
        ctx.fillText('등고선 데이터를 생성할 수 없습니다.', W / 2, H / 2);
        return;
    }

    // ── raster 배경 ──
    admDrawRaster(ctx, agg, W, H);

    // ── contour lines ──
    const Gc = agg.gridG || ADMIN_MAP_GRID;
    const minH = agg.min, maxH = agg.max, range = (maxH - minH) || 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function strokePass(style, lineW) {
        ctx.strokeStyle = style; ctx.lineWidth = lineW;
        for (let i = 1; i <= ADMIN_CONTOUR_LEVELS; i++) {
            const th = minH + range * (i / (ADMIN_CONTOUR_LEVELS + 1));
            const segs = admMarchingSquares(agg.heights, th, Gc);
            ctx.beginPath();
            segs.forEach(pair => { const p1 = admToCanvas(pair[0], W, H, Gc), p2 = admToCanvas(pair[1], W, H, Gc); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); });
            ctx.stroke();
        }
    }
    strokePass('rgba(12, 8, 22, 0.42)', 1.05 * dpr);
    strokePass('rgba(232, 224, 252, 0.48)', 0.62 * dpr);

    // ── pins (DOM) ──
    if (!pinsLayer) return;
    pinsLayer.innerHTML = '';

    if (!scenes || scenes.length === 0) return;

    scenes.forEach((scene, idx) => {
        const emotion = admSafeParseEmotion(scene.originalEmotion || scene.original_emotion);
        const base = admEmotionToMapCoords(emotion);
        const spread = admMapCoordsSpread(base.x, base.y, idx, scene.id || idx);
        const isBridge = scene.sceneType === 'residual' || scene.scene_role === 'residual';
        const pinType = isBridge ? 'bridge' : 'core';
        const order = scene.scene_order != null ? scene.scene_order : idx + 1;

        const el = document.createElement('div');
        el.className = 'map-pin ' + pinType;
        el.style.left = (spread.x * 100) + '%';
        el.style.top = (spread.y * 100) + '%';
        el.title = `S${order}: ${(scene.text || scene.text_stage_1 || '').substring(0, 40)}`;

        const lb = document.createElement('div');
        lb.className = 'map-pin-label';
        lb.textContent = isBridge ? '·' : ('#' + order);
        el.appendChild(lb);

        pinsLayer.appendChild(el);
    });

    // ── echo pins (기존 플레이 감정 잔상) ──
    if (plays && plays.length) {
        plays.slice(-40).forEach((pl, i) => {
            const af = admProjectEmotionToAFContour(admSafeParseEmotion(pl.user_emotion));
            const px = ((af.x * ADMIN_MAP_HALF) / ADMIN_MAP_SIZE + 0.5) * 100;
            const py = ((af.z * ADMIN_MAP_HALF) / ADMIN_MAP_SIZE + 0.5) * 100;
            const j = (i % 7) * 0.4;
            const el = document.createElement('div');
            el.className = 'map-pin echo';
            el.style.left = Math.max(2, Math.min(98, px + Math.sin(i * 1.7) * j)) + '%';
            el.style.top = Math.max(2, Math.min(98, py + Math.cos(i * 1.3) * j)) + '%';
            pinsLayer.appendChild(el);
        });
    }

    console.log('[renderContourMapPreview] 등고선 핀맵 미리보기 렌더링 완료', { scenes: scenes.length, plays: (plays || []).length });
}

// memory save
async function saveMemory() {
    const title = document.getElementById('memoryTitle').value.trim();
    const code = document.getElementById('memoryCode').value.trim();
    const description = document.getElementById('memoryDescription').value.trim();
    const memoryWords = document.getElementById('memoryWords').value.trim();
    const completedSentence = document.getElementById('completedSentence').value.trim();
    // original_vector 수집
    const _ovKeys = ['fear','sadness','anger','joy','longing','guilt'];
    const _ovObj = {};
    let _ovHasValue = false;
    _ovKeys.forEach(k => {
        const v = parseFloat(document.getElementById('ov_' + k)?.value);
        if (!isNaN(v)) { _ovObj[k] = Math.max(0, Math.min(1, v)); _ovHasValue = true; }
    });
    const originalVector = _ovHasValue ? _ovObj : null;
    const authorNote = document.getElementById('authorNote').value.trim();

    // Lumen V1 (작업 12-1): 감각 앵커 수집
    const _modRadio = document.querySelector('input[name="sensoryModality"]:checked');
    const _sensoryModality = _modRadio ? _modRadio.value : '';
    const _sensoryContent = document.getElementById('sensoryContent')?.value.trim() || '';
    const _sensoryWeight = parseFloat(document.getElementById('sensoryWeight')?.value);
    let sensoryAnchor = null;
    if (_sensoryModality && _sensoryContent) {
        sensoryAnchor = {
            modality: _sensoryModality,
            content: _sensoryContent,
            weight: isNaN(_sensoryWeight) ? 0.7 : Math.max(0, Math.min(1, _sensoryWeight))
        };
    } else if (_sensoryContent && !_sensoryModality) {
        // content 만 채우고 modality "없음" 이면 silent drop 되던 버그(e2e 2026-04-22 발견).
        // 저장 동작은 현행 유지(정책: 감각 anchor 는 modality 옵트인). 경고만 노출 → 디버그 가시성.
        console.warn('[admin] sensory_anchor: content 있으나 modality 미선택 → null 저장 (의도였으면 무시)');
    }

    // AF 좌표 수집
    const _attr = {};
    let _attrHas = false;
    ['self','other','fate'].forEach(k => {
        const v = parseFloat(document.getElementById('ar_attr_' + k)?.value);
        if (!isNaN(v)) { _attr[k] = Math.max(0, Math.min(1, v)); _attrHas = true; }
    });
    const _cf = {};
    let _cfHas = false;
    ['abandonment','rejection','powerlessness','loss'].forEach(k => {
        const v = parseFloat(document.getElementById('ar_cf_' + k)?.value);
        if (!isNaN(v)) { _cf[k] = Math.max(0, Math.min(1, v)); _cfHas = true; }
    });
    const originalReasonVector = (_attrHas || _cfHas)
        ? { attribution: _attrHas ? _attr : null, core_fear: _cfHas ? _cf : null }
        : null;

    // 오염 초기 상태 수집
    const _cDepth = parseInt(document.getElementById('contDepth')?.value, 10);
    const _cDiv = parseFloat(document.getElementById('cont_divergence_input')?.value);
    const _cConv = parseFloat(document.getElementById('cont_convergence_input')?.value);
    const _cHet = parseFloat(document.getElementById('cont_heterogeneity_input')?.value);
    const _cS1 = parseFloat(document.getElementById('cont_stage_1_input')?.value);
    const _cS2 = parseFloat(document.getElementById('cont_stage_2_input')?.value);
    const _cS3 = parseFloat(document.getElementById('cont_stage_3_input')?.value);
    const contDepthVal = isNaN(_cDepth) ? 0 : Math.max(0, _cDepth);
    const contDivergenceVal = isNaN(_cDiv) ? 0 : Math.max(0, Math.min(1, _cDiv));
    const contConvergenceVal = isNaN(_cConv) ? 0 : Math.max(0, Math.min(1, _cConv));
    const contHeterogeneityVal = isNaN(_cHet) ? 0 : Math.max(0, Math.min(1, _cHet));
    const contStage1Val = isNaN(_cS1) ? 0.33 : Math.max(0, Math.min(1, _cS1));
    const contStage2Val = isNaN(_cS2) ? 0.33 : Math.max(0, Math.min(1, _cS2));
    const contStage3Val = isNaN(_cS3) ? 0.34 : Math.max(0, Math.min(1, _cS3));

    // 공간 설정
    const terrainShapeVal = document.getElementById('terrainShape')?.value || 'circular';
    // 작업 12-3 응결점 수집 폐기 (2026-05-16) — 잔상 유령은 "위치 stage" 탭에서 즉시 독립 저장
    //   (lumen_admin_stage_view.persistGhostPoints). saveMemory 가 ghost_condensation_points 를
    //   건드리면 stage 탭에서 박은 잔상 유령이 빈 배열로 덮어써짐 → 저장 페이로드에서 제외.
 // R1-7 (2026-07-14): sound_map 수집 폐기 — 레거시 5칸 UI 제거 (admin.html §사운드 매핑).
 // 씬별 공간음향은 Canvas(admin-trajectory) meta.sound_url 로 대체됨. 저장 페이로드에서
 // sound_map 을 안 보내면 repo.js 가 기존 DB 값을 보존한다.

    if (!title || !code) {
        showToast('제목과 코드를 입력해주세요', 'error');
        return;
    }

    if (currentScenes.length === 0) {
        showToast('최소 하나의 장면을 추가해주세요', 'error');
        return;
    }

    setSaveButtonsBusy(true);
    try {
        let memoryId;

        console.log('[saveMemory] 시작', { currentMemoryId, scenesCount: currentScenes.length });
        
 // Supabase client 져오기
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }

 // Wave data 미리 calculate (각 scene )
        console.log('[saveMemory] Wave 데이터 계산 시작', { scenesCount: currentScenes.length });
        const scenesWithWaveData = currentScenes.map((scene, i) => {
 // emotionDist calculate
            const emotionDist = {
                fear: 0, sadness: 0, guilt: 0, anger: 0,
                longing: 0, isolation: 0, numbness: 0, moralPain: 0
            };
            
            if (scene.choices && scene.choices.length > 0) {
                scene.choices.forEach(choice => {
                    const intensity = (choice.intensity || 5) / 10;
                    if (emotionDist.hasOwnProperty(choice.emotion)) {
                        emotionDist[choice.emotion] += intensity;
                    }
                });
            }
            
            const total = Object.values(emotionDist).reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                Object.keys(emotionDist).forEach(key => {
                    emotionDist[key] = Math.round((emotionDist[key] / total) * 100);
                });
            }

 // Wave data create
            const voidLevel = scene.voidInfo?.voidLevel || 'low';
            const waveData = computeWaveData(emotionDist, (scene.text || '').length, voidLevel);
            
            return {
                ...scene,
                choices: scene.choices || [],
                waveData: waveData
            };
        });

 // global memory 평균 emotion vector calculate (plays 테 블용)
        const totalEmotionVector = {
            fear: 0, sadness: 0, guilt: 0, anger: 0,
            longing: 0, isolation: 0, numbness: 0, moralPain: 0
        };
        
        currentScenes.forEach(scene => {
            if (scene.choices && scene.choices.length > 0) {
                scene.choices.forEach(choice => {
                    const intensity = (choice.intensity || 5) / 10;
                    if (totalEmotionVector.hasOwnProperty(choice.emotion)) {
                        totalEmotionVector[choice.emotion] += intensity;
                    }
                });
            }
        });
        
        const total = Object.values(totalEmotionVector).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(totalEmotionVector).forEach(key => {
                totalEmotionVector[key] = Math.round((totalEmotionVector[key] / total) * 100);
            });
        }
        
        const totalTextLength = currentScenes.reduce((sum, scene) => sum + (scene.text || '').length, 0);
        const hasHighVoid = currentScenes.some(s => s.voidInfo?.voidLevel === 'high');
        const overallVoidLevel = hasHighVoid ? 'high' : 'low';
        const memoryWaveData = computeWaveData(totalEmotionVector, totalTextLength, overallVoidLevel);

 // repo.js saveMemoryGraph call
        console.log('[saveMemory] saveMemoryGraph 호출 시작', { 
            memoryId: currentMemoryId, 
            scenesCount: scenesWithWaveData.length 
        });
        
        const status = document.getElementById('memoryStatus').value;
        
        console.log('=== Memory 저장 ===');
        console.log('status:', status);
        console.log('description:', description);
        
        const finalMemoryId = await saveMemoryGraph(supabaseClient, {
            memoryId: currentMemoryId,
            code: code,
            title: title,
            description: description || null,
            memory_words: memoryWords || null,
            completed_sentence: completedSentence || null,
            original_vector: originalVector,
            author_note: authorNote || null,
            status: status,
            scenes: scenesWithWaveData,
            memoryWaveData: memoryWaveData,
            // Lumen V1 (작업 12-1) 확장 필드
            sensory_anchor: sensoryAnchor,
            original_reason_vector: originalReasonVector,
            cont_depth: contDepthVal,
            cont_divergence: contDivergenceVal,
            cont_convergence: contConvergenceVal,
            cont_heterogeneity: contHeterogeneityVal,
            cont_stage_1: contStage1Val,
            cont_stage_2: contStage2Val,
            cont_stage_3: contStage3Val,
            terrain_shape: terrainShapeVal
            // ghost_condensation_points 제외 (2026-05-16) — "위치 stage" 탭이 독립 저장
        });
        
        console.log('=== Admin 에디터 개선 ===');
        console.log('author_note:', authorNote);
        
        console.log('[saveMemory] saveMemoryGraph 완료', { finalMemoryId });
        memoryId = finalMemoryId;

 // R1-7 (2026-07-14): 저장 시 exportMemoriesJSON() 자동 호출 제거 —
 // 저장할 때마다 파일 다운로드 + 클립보드 덮어쓰기가 일어나던 동작.
 // 내보내기는 window.exportMemoriesJSON() 수동 호출로만.
        console.log('[saveMemory] 전체 저장 완료');

 // W1-A (B1+B2 봉합): 저장 후 편집기 잔류. 대시보드 퇴출(cancelEdit) 제거.
 //  - currentMemoryId 확정 → 다음 저장은 UPDATE 경로(신규 중복 INSERT 방지)
 //  - loadMemories() 로 로컬 memories 를 DB 기준 최신화(신규 기억 재진입 정확성)
 //  - loadAllSessions() 로 대시보드 통합 목록 즉시 갱신(B1: 새로고침 불요)
        currentMemoryId = memoryId;
        window.currentMemoryId = memoryId; // admin-trajectory 등 타 모듈 참조
        await loadMemories();
        currentMemoryIndex = memories.findIndex(m => String(m.id) === String(memoryId));
        await loadAllSessions();

        // 260717 지휘 수리: 저장 후 currentScenes 에 DB 부여 씬 id 재수화(rehydrate).
        //   버그: editMemory 는 DB 로드라 씬 id 를 갖지만, W1-A 로 저장 후 편집기에 '잔류'하면
        //   currentScenes 는 id 가 빈 채 남는다. 다음 저장에서 saveMemoryGraph 가 이 씬들을
        //   '신규'로 오인 → 기존 씬 DELETE + 새 UUID INSERT → plays.scene_id 단절(SET NULL).
        //   즉 자주 저장하는 저작 루프에서 매 저장마다 관객 기록이 씬 연결을 잃는다(실기 실측).
        //   loadMemories() 가 방금 가져온 DB 씬(id 有, scene_order 정렬)으로 id 만 되꽂는다.
        try {
            const _savedMem = (currentMemoryIndex >= 0) ? memories[currentMemoryIndex] : null;
            const _dbScenes = (_savedMem && Array.isArray(_savedMem.scenes)) ? _savedMem.scenes : null;
            if (_dbScenes && _dbScenes.length) {
                const _byOrder = new Map();
                _dbScenes.forEach(s => { if (s && s.scene_order != null) _byOrder.set(String(s.scene_order), s.id); });
                currentScenes.forEach((s, i) => {
                    const _ord = (s && s.scene_order != null) ? String(s.scene_order) : null;
                    const _dbId = (_ord != null && _byOrder.has(_ord)) ? _byOrder.get(_ord)
                                : (_dbScenes[i] ? _dbScenes[i].id : null);
                    if (_dbId) s.id = _dbId; // 위치·순서 정합 시에만 스탬프(둘 다 array 순서 보존)
                });
                renderSceneToc();
            }
        } catch (e) { console.warn('[saveMemory] 씬 id 재수화 실패(다음 저장 churn 위험):', e && e.message); }

        // W3-K: 저장 직후 판본 스냅샷(최근 20개 유지). 실패해도 저장 자체는 성공.
        try { await snapshotVersion(supabaseClient, memoryId, '저장'); await renderVersions(); }
        catch (e) { console.warn('[saveMemory] 판본 스냅샷 실패(저장은 성공):', e.message); }
        // W3-L: 저장 성공 시 자동저장 임시본 삭제
        try { clearAutosave(memoryId); } catch (e) {}

        clearEditorDirty(); // 저장 성공 → dirty 해제
        showToast(`저장됨 — 씬 ${currentScenes.length}개`, 'success');
    } catch (error) {
        console.error('[saveMemory] 전체 Error occurred', error);
        console.error('[saveMemory] 에러 상세:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            stack: error.stack
        });
        showToast('저장 실패: ' + (error.message || error.toString()), 'error', { ttl: 0 });
    } finally {
        setSaveButtonsBusy(false);
    }
}

// memoriesData 형식으 convert
function convertToMemoriesDataFormat(adminMemories) {
    return adminMemories.map((memory, index) => {
 // choices 서 emotion 강 정보 추출
        const processedScenes = memory.scenes.map(scene => {
            const processedChoices = (scene.choices || []).map(choice => ({
                text: choice.text,
                percentage: choice.percentage || 0,
                emotion: choice.emotion || 'fear',
                intensity: choice.intensity || 5,
                nextScene: choice.nextScene || 'end'
            }));

 // emotionDist calculate (choices emotion 분포 기반)
            const emotionDist = {
                fear: 0,
                sadness: 0,
                guilt: 0,
                anger: 0,
                longing: 0,
                isolation: 0,
                numbness: 0,
                moralPain: 0
            };
            processedChoices.forEach(choice => {
                const intensity = (choice.intensity || 5) / 10;
                if (choice.emotion === 'fear') emotionDist.fear += intensity;
                else if (choice.emotion === 'sadness') emotionDist.sadness += intensity;
                else if (choice.emotion === 'guilt') emotionDist.guilt += intensity;
                else if (choice.emotion === 'anger') emotionDist.anger += intensity;
                else if (choice.emotion === 'longing') emotionDist.longing += intensity;
                else if (choice.emotion === 'isolation') emotionDist.isolation += intensity;
                else if (choice.emotion === 'numbness') emotionDist.numbness += intensity;
                else if (choice.emotion === 'moralPain') emotionDist.moralPain += intensity;
            });
            const total = emotionDist.fear + emotionDist.sadness + emotionDist.guilt + emotionDist.anger + 
                          emotionDist.longing + emotionDist.isolation + emotionDist.numbness + emotionDist.moralPain;
            if (total > 0) {
                emotionDist.fear = Math.round((emotionDist.fear / total) * 100);
                emotionDist.sadness = Math.round((emotionDist.sadness / total) * 100);
                emotionDist.guilt = Math.round((emotionDist.guilt / total) * 100);
                emotionDist.anger = Math.round((emotionDist.anger / total) * 100);
                emotionDist.longing = Math.round((emotionDist.longing / total) * 100);
                emotionDist.isolation = Math.round((emotionDist.isolation / total) * 100);
                emotionDist.numbness = Math.round((emotionDist.numbness / total) * 100);
                emotionDist.moralPain = Math.round((emotionDist.moralPain / total) * 100);
            } else {
                const defaultValue = Math.round(100 / 8);
                emotionDist.fear = defaultValue;
                emotionDist.sadness = defaultValue;
                emotionDist.guilt = defaultValue;
                emotionDist.anger = defaultValue;
                emotionDist.longing = defaultValue;
                emotionDist.isolation = defaultValue;
                emotionDist.numbness = defaultValue;
                emotionDist.moralPain = defaultValue;
            }

            return {
                text: scene.text || '',
                sceneType: scene.sceneType || 'normal',
                echoWords: scene.echoWords || [],
                choices: processedChoices,
                emotionDist: emotionDist,
                originalReason: scene.originalReason || '',
                originalEmotion: scene.originalEmotion || null
            };
        });

        return {
            id: index,
            code: memory.code || `A-${String(index + 1).padStart(3, '0')}`,
            title: memory.title || '제목 없음',
            layers: memory.interpretationLayers || 0,
            dilution: 50, // 기본값
            recentRank: index + 1, // 기본값
            scenes: processedScenes
        };
    });
}

// JSON 다운load
async function exportMemoriesJSON() {
    if (memories.length === 0) {
        showToast('저장된 기억이 없습니다. 먼저 기억을 추가해주세요.', 'error');
        return;
    }

    const memoriesDataFormat = convertToMemoriesDataFormat(memories);
    const jsonString = JSON.stringify(memoriesDataFormat, null, 2);
    
 // 파일 다운load
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memories-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
 // 클립보드 copy
    try {
        await navigator.clipboard.writeText(jsonString);
        showToast('클립보드에 복사됨 — data/memories.js의 memoriesData 배열에 붙여넣으세요', 'success');
    } catch (err) {
 // 클립보드 copy failure 시 fallback
        console.error('클립보드 복사 실패:', err);
        showToast('memories-export.json 다운로드됨 (클립보드 복사 실패)', 'info');
    }
}

// JSON 불러오기
function importMemoriesJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            
            if (!Array.isArray(jsonData)) {
                showToast('올바른 JSON 형식이 아닙니다. 배열 형식이어야 합니다.', 'error');
                return;
            }

 // memoriesData 형식 서 admin 형식으 convert
            const adminFormat = jsonData.map(memory => ({
                title: memory.title || '',
                code: memory.code || '',
                description: '',
                scenes: memory.scenes.map(scene => ({
                    text: scene.text || '',
                    sceneType: scene.sceneType || 'normal',
                    echoWords: scene.echoWords || [],
                    choices: (scene.choices || []).map(choice => ({
                        text: choice.text || '',
                        emotion: choice.emotion || 'fear',
                        intensity: choice.intensity || 5,
                        nextScene: choice.nextScene || 'end',
                        percentage: choice.percentage || 0
                    })),
                    originalReason: scene.originalReason || '',
                    originalEmotion: scene.originalEmotion || null
                })),
                interpretationLayers: memory.layers || 0,
                visible: true
            }));

            memories = adminFormat;
            saveMemoriesToStorage();
            renderMemoriesTable();
            showToast('JSON 파일을 불러왔습니다', 'success');
        } catch (error) {
            showToast('JSON 읽기 오류: ' + error.message, 'error', { ttl: 0 });
        }
    };
    reader.readAsText(file);
    
 // 파일 input init
    event.target.value = '';
}

// local 스토리지 save
function saveMemoriesToStorage() {
    saveAdminMemories(memories);
}

// 편집 취소
function cancelEdit() {
    if (editorDirty) {
        if (!confirm('저장하지 않은 변경사항이 있습니다.\n정말 나가시겠습니까?')) return;
    }
    clearEditorDirty();
    document.getElementById('editorScreen').classList.remove('active');
    document.getElementById('adminDashboard').classList.add('active');
    currentMemoryIndex = null;
    currentScenes = [];
    previewCurrentScene = 0;
    stopPreviewWaveAnimation();
}

// simulateLayer button 벤트 listener
document.addEventListener('DOMContentLoaded', function() {
    const simulateLayerBtn = document.getElementById('simulateLayer');
    if (simulateLayerBtn) {
        simulateLayerBtn.addEventListener('click', async () => {
            if (!currentMemoryId) {
                showToast('먼저 메모리를 저장해주세요', 'info');
                return;
            }

            const supabaseClient = getSupabaseClient();
            if (!supabaseClient) {
                showToast('Supabase 클라이언트가 초기화되지 않았습니다', 'error', { ttl: 0 });
                return;
            }

            const scene = currentScenes[previewCurrentScene];
            if (!scene) {
                showToast('장면을 찾을 수 없습니다', 'error');
                return;
            }

            try {
 // 현재 scene emotion vector calculate
                const currentEmotionVector = getCurrentSceneEmotionVector();
                const currentSceneText = scene.text || '';
                const voidLevel = scene.voidInfo?.voidLevel || 'low';

 // wave data create
                const waveData = computeWaveData(
                    currentEmotionVector,
                    currentSceneText.length || 1,
                    voidLevel
                );

                console.log('[simulateLayer] 레이어 저장 시작', {
                    memoryId: currentMemoryId,
                    layerId: currentLayers.length,
                    wavePointsCount: waveData.wavePoints.length,
                    color: waveData.color
                });

 // plays 테 블 save
                const { error: playsError } = await supabaseClient
                    .from('plays')
                    .insert({
                        memory_id: currentMemoryId,
                        wave_data: waveData,
                        layer_id: currentLayers.length,
                        void_info: scene.voidInfo || null
                    });

                if (playsError) {
                    console.error('[simulateLayer] 레이어 Save failed', playsError);
                    showToast('레이어 저장 오류: ' + playsError.message, 'error', { ttl: 0 });
                    return;
                }

 // layer add
                currentLayers.push({
                    layerId: currentLayers.length,
                    waveData: waveData,
                    createdAt: new Date()
                });

                console.log('[simulateLayer] 레이어 저장 성공', { layerId: currentLayers.length - 1 });

                showToast('새 지층 레이어 저장 완료', 'success');
                renderWavePreview();
                
            } catch (error) {
                console.error('[simulateLayer] 예외 발생', error);
                showToast('레이어 저장 오류: ' + error.message, 'error', { ttl: 0 });
            }
        });
    }
});

// 통합 session manage function들
let allSessions = [];
let currentFilter = 'all';
let sessionSearchQuery = ''; // W2-E: 제목/코드 부분일치 검색어
let showTrash = false;       // W3-J: 휴지통 보기(삭제된 기억만) 토글

// W2-E: 대시보드 목록 검색 — 제목/코드 부분일치 클라이언트 필터
function setSessionSearch(q) {
    sessionSearchQuery = (q || '').trim().toLowerCase();
    renderSessions();
}
window.setSessionSearch = setSessionSearch;

// W3-J: 휴지통 보기 토글
function toggleTrashView() {
    showTrash = !showTrash;
    const btn = document.getElementById('trashToggleBtn');
    if (btn) {
        btn.textContent = showTrash ? '← 목록으로' : '휴지통';
        btn.classList.toggle('active', showTrash);
    }
    renderSessions();
}
window.toggleTrashView = toggleTrashView;

// W3-J: 삭제된 기억 복원 (deleted_at=null). is_public 은 수동 — 자동 재공개 금지.
async function restoreMemoryById(id) {
    try {
        const sb = await getSupabaseClient();
        if (!sb) throw new Error('Supabase client not initialized.');
        const { error } = await sb.from('memories').update({ deleted_at: null }).eq('id', id);
        if (error) throw error;
        showToast('복원됨 — 공개는 수동으로 켜세요(비공개 상태 유지)', 'success');
        await loadMemories();
        await loadAllSessions();
    } catch (e) {
        console.error('restoreMemoryById error:', e);
        showToast('복원 오류: ' + e.message, 'error', { ttl: 0 });
    }
}
window.restoreMemoryById = restoreMemoryById;

// W3-J: 영구 삭제 (confirm 2단, 기존 hard delete 경로)
async function purgeMemoryById(id, title) {
    if (!confirm(`"${title || id}" 를 영구 삭제합니다.\n관련 씬·선택지·판본이 모두 사라지고 복구 불가합니다. 계속?`)) return;
    if (!confirm('되돌릴 수 없습니다. 정말 영구 삭제할까요?')) return;
    try {
        const sb = await getSupabaseClient();
        if (!sb) throw new Error('Supabase client not initialized.');
        await deleteMemoryGraph(sb, id);
        showToast('영구 삭제되었습니다', 'success');
        await loadMemories();
        await loadAllSessions();
    } catch (e) {
        console.error('purgeMemoryById error:', e);
        showToast('영구 삭제 오류: ' + e.message, 'error', { ttl: 0 });
    }
}
window.purgeMemoryById = purgeMemoryById;

// ─── W3-K: 판본 이력 (admin_versions) ─────────────────────────────
// 저장 직후 {memory row, scenes[], choices[]} 스냅샷. 기억당 최근 20개 유지.
async function snapshotVersion(sb, memoryId, note) {
    if (!sb || !memoryId) return;
    const { data: memory } = await sb.from('memories').select('*').eq('id', memoryId).single();
    const { data: scenes } = await sb.from('scenes').select('*').eq('memory_id', memoryId).order('scene_order', { ascending: true });
    const sceneIds = (scenes || []).map(s => s.id);
    let choices = [];
    if (sceneIds.length) {
        const { data } = await sb.from('choices').select('*').in('scene_id', sceneIds).order('choice_order', { ascending: true });
        choices = data || [];
    }
    const { error } = await sb.from('admin_versions').insert({
        memory_id: memoryId,
        snapshot: { memory, scenes: scenes || [], choices },
        note: note || null
    });
    if (error) throw error;
    // 최근 20개 유지 — 초과분 삭제
    const { data: all } = await sb.from('admin_versions').select('id').eq('memory_id', memoryId).order('created_at', { ascending: false });
    if (all && all.length > 20) {
        const toDelete = all.slice(20).map(r => r.id);
        await sb.from('admin_versions').delete().in('id', toDelete);
    }
}

// 스냅샷(DB row 형태) → 편집기 memory 형태 (listMemoriesWithScenesChoices 매핑 미러)
function snapshotToEditorMemory(snap) {
    const m = snap.memory || {};
    const choicesByScene = {};
    (snap.choices || []).forEach(c => {
        (choicesByScene[c.scene_id] = choicesByScene[c.scene_id] || []).push(c);
    });
    const scenes = (snap.scenes || []).slice().sort((a, b) => (a.scene_order || 0) - (b.scene_order || 0)).map(scene => ({
        id: scene.id,
        text: scene.text || '',
        sceneType: scene.scene_type || 'normal',
        scene_role: scene.scene_role || null,
        echoWords: Array.isArray(scene.echo_words) ? scene.echo_words : (scene.echo_words ? JSON.parse(scene.echo_words) : []),
        emotionDist: scene.emotion_dist || {},
        voidInfo: scene.void_info || null,
        choices: (choicesByScene[scene.id] || []).sort((a, b) => (a.choice_order || 0) - (b.choice_order || 0)).map(choice => ({
            id: choice.id, text: choice.text || '', emotion: choice.emotion || 'fear', intensity: choice.intensity || 5, nextScene: 'end', percentage: 0
        })),
        originalChoice: scene.original_choice || 0,
        originalReason: scene.original_reason || '',
        originalEmotion: scene.original_emotion ? (typeof scene.original_emotion === 'string' ? JSON.parse(scene.original_emotion) : scene.original_emotion) : null,
        originalReasonVector: scene.original_reason_vector ? (typeof scene.original_reason_vector === 'string' ? JSON.parse(scene.original_reason_vector) : scene.original_reason_vector) : null,
        anchor_emotions: scene.anchor_emotions ? (Array.isArray(scene.anchor_emotions) ? scene.anchor_emotions : (typeof scene.anchor_emotions === 'string' ? JSON.parse(scene.anchor_emotions) : scene.anchor_emotions)) : null,
        text_stage_1: scene.text_stage_1 || null,
        text_stage_2: scene.text_stage_2 || null,
        text_stage_3: scene.text_stage_3 || null,
        exclusions: scene.exclusions ? (Array.isArray(scene.exclusions) ? scene.exclusions : (typeof scene.exclusions === 'string' ? JSON.parse(scene.exclusions) : scene.exclusions)) : null,
        meta: scene.meta || null
    }));
    return {
        id: m.id, title: m.title || '', code: m.code || '', description: m.description || '',
        sound_map: m.sound_map || null, memory_words: m.memory_words || null, completed_sentence: m.completed_sentence || null,
        author_note: m.author_note || null, status: m.status || 'Fetus', scenes,
        interpretationLayers: m.cont_depth || 0, visible: m.is_public !== undefined ? m.is_public : true,
        sensory_anchor: m.sensory_anchor || null, original_vector: m.original_vector || null,
        original_reason_vector: m.original_reason_vector || null,
        cont_depth: m.cont_depth != null ? m.cont_depth : null,
        cont_divergence: m.cont_divergence != null ? m.cont_divergence : null,
        cont_convergence: m.cont_convergence != null ? m.cont_convergence : null,
        cont_heterogeneity: m.cont_heterogeneity != null ? m.cont_heterogeneity : null,
        cont_stage_1: m.cont_stage_1 != null ? m.cont_stage_1 : null,
        cont_stage_2: m.cont_stage_2 != null ? m.cont_stage_2 : null,
        cont_stage_3: m.cont_stage_3 != null ? m.cont_stage_3 : null,
        terrain_shape: m.terrain_shape || null,
        ghost_condensation_points: Array.isArray(m.ghost_condensation_points) ? m.ghost_condensation_points : []
    };
}

// 편집화면 판본 패널 렌더
async function renderVersions() {
    const panel = document.getElementById('versionsPanel');
    if (!panel) return;
    if (!currentMemoryId) { panel.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">저장 후 판본이 쌓입니다.</div>'; return; }
    try {
        const sb = await getSupabaseClient();
        const { data: rows, error } = await sb.from('admin_versions').select('id, note, created_at').eq('memory_id', currentMemoryId).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        if (!rows || rows.length === 0) { panel.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">아직 판본이 없습니다. 저장하면 여기에 기록됩니다.</div>'; return; }
        panel.innerHTML = rows.map(r => `
            <div style="display:flex;align-items:center;gap:0.8rem;padding:0.5rem 0.7rem;border:1px solid rgba(196,168,130,.15);border-radius:4px;margin-bottom:0.4rem;">
                <span style="flex:1;font-size:0.82rem;color:#d8cfbf;">${new Date(r.created_at).toLocaleString('ko-KR')}${r.note ? ` · <span style="color:var(--text-muted);">${_escHtml(r.note)}</span>` : ''}</span>
                <button type="button" class="table-btn" style="font-size:0.78rem;" onclick="restoreVersion('${r.id}')">이 판본으로 복원</button>
            </div>
        `).join('');
    } catch (e) {
        console.warn('renderVersions 실패:', e.message);
        panel.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">판본 목록을 불러오지 못했습니다.</div>';
    }
}
window.renderVersions = renderVersions;

// 판본 복원 — 스냅샷을 편집기 상태로 로드 → saveMemoryGraph 경유(씬 id·plays 보존).
async function restoreVersion(versionId) {
    if (!currentMemoryId || currentMemoryIndex == null) { showToast('먼저 기억을 선택하세요', 'info'); return; }
    if (!confirm('이 판본으로 되돌립니다. 저장하지 않은 현재 편집 내용은 사라질 수 있습니다. 계속?')) return;
    try {
        const sb = await getSupabaseClient();
        if (!sb) throw new Error('Supabase client not initialized.');
        // 1) 복원 직전 현재 상태 자동 스냅샷
        await snapshotVersion(sb, currentMemoryId, '복원 전 자동');
        // 2) 판본 로드
        const { data: v, error } = await sb.from('admin_versions').select('*').eq('id', versionId).single();
        if (error) throw error;
        const editorMem = snapshotToEditorMemory(v.snapshot);
        // 3) 편집기에 로드 (editMemory 재사용 — 씬 id 보존)
        memories[currentMemoryIndex] = editorMem;
        editMemory(currentMemoryIndex);
        // 4) saveMemoryGraph 경유 저장 (id 보존 diff)
        await saveMemory();
        showToast('판본 복원 완료', 'success');
    } catch (e) {
        console.error('restoreVersion error:', e);
        showToast('판본 복원 오류: ' + e.message, 'error', { ttl: 0 });
    }
}
window.restoreVersion = restoreVersion;

// ─── W3-M: 씬 목차 사이드바 ───────────────────────────────────────
function renderSceneToc() {
    const el = document.getElementById('sceneTocList');
    if (!el) return;
    if (!currentScenes || currentScenes.length === 0) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem;padding:0.4rem;">씬 없음</div>';
        return;
    }
    el.innerHTML = currentScenes.map((s, i) => {
        const name = (s.meta && s.meta.ghost_name) ? s.meta.ghost_name : '';
        const head = (s.text || '').replace(/\s+/g, ' ').trim().slice(0, 16);
        const role = sceneRoleLabel(s.scene_role);
        return `<div class="scene-toc-item" onclick="jumpToScene(${i})" title="${_escHtml(head)}">
            <span class="scene-toc-order">S${i + 1}</span>
            <span class="scene-toc-name">${_escHtml(name || head || '(빈 씬)')}</span>
            <span class="scene-toc-role">${_escHtml(role)}</span>
        </div>`;
    }).join('');
}
window.renderSceneToc = renderSceneToc;
function jumpToScene(i) {
    sceneCollapseState.set(i, false); // 펼침 (B 연동)
    renderScenes();
    const block = document.querySelector(`.scene-block[data-scene-index="${i}"]`);
    if (block) {
        const body = block.querySelector('.scene-body');
        if (body) body.style.display = '';
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
window.jumpToScene = jumpToScene;

// ─── W3-L: 자동저장(임시본) — localStorage, 디바운스 30초 ─────────────
const AUTOSAVE_PREFIX = 'tem_admin_autosave_';
let _autosaveTimer = null;
function autosaveKey(id) { return AUTOSAVE_PREFIX + (id || 'new'); }
function _val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }
function captureEditorState() {
    return {
        ts: Date.now(),
        title: _val('memoryTitle'), code: _val('memoryCode'), description: _val('memoryDescription'),
        memory_words: _val('memoryWords'), completed_sentence: _val('completedSentence'),
        author_note: _val('authorNote'), status: _val('memoryStatus'),
        scenes: currentScenes
    };
}
function scheduleAutosave() {
    const screen = document.getElementById('editorScreen');
    if (!screen || !screen.classList.contains('active')) return;
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
        try {
            localStorage.setItem(autosaveKey(currentMemoryId), JSON.stringify(captureEditorState()));
            const ind = document.getElementById('autosaveIndicator');
            if (ind) ind.textContent = '임시 저장됨 · ' + new Date().toLocaleTimeString('ko-KR');
        } catch (e) { console.warn('autosave 실패:', e.message); }
    }, 30000);
}
function clearAutosave(id) { try { localStorage.removeItem(autosaveKey(id)); } catch (e) {} }
function maybeShowAutosaveBanner(id) {
    const banner = document.getElementById('autosaveBanner');
    if (!banner) return;
    let raw = null;
    try { raw = localStorage.getItem(autosaveKey(id)); } catch (e) {}
    if (!raw) { banner.style.display = 'none'; return; }
    banner.dataset.key = autosaveKey(id);
    const whenEl = banner.querySelector('.autosave-when');
    try { if (whenEl) whenEl.textContent = new Date(JSON.parse(raw).ts).toLocaleString('ko-KR'); } catch (e) {}
    banner.style.display = 'flex';
}
function restoreAutosave() {
    const banner = document.getElementById('autosaveBanner');
    const key = banner && banner.dataset.key;
    if (!key) return;
    let data; try { data = JSON.parse(localStorage.getItem(key)); } catch (e) { return; }
    if (!data) return;
    _setVal('memoryTitle', data.title); _setVal('memoryCode', data.code); _setVal('memoryDescription', data.description);
    _setVal('memoryWords', data.memory_words); _setVal('completedSentence', data.completed_sentence);
    _setVal('authorNote', data.author_note); _setVal('memoryStatus', data.status);
    if (Array.isArray(data.scenes)) currentScenes = data.scenes;
    sceneCollapseState.clear();
    renderScenes();
    banner.style.display = 'none';
    markEditorDirty();
    showToast('임시 저장본을 복원했습니다', 'success');
}
function discardAutosave() {
    const banner = document.getElementById('autosaveBanner');
    const key = banner && banner.dataset.key;
    if (key) { try { localStorage.removeItem(key); } catch (e) {} }
    if (banner) banner.style.display = 'none';
    showToast('임시 저장본을 버렸습니다', 'info');
}
window.restoreAutosave = restoreAutosave;
window.discardAutosave = discardAutosave;

// ─── W3-P: 작가 궤적 시딩 ─────────────────────────────────────────
// 씬별 plays 1행. persona_id='author-seed' (⚠️ 관객 인구 격리 — 자료스키마 §5).
async function seedAuthorTrajectory() {
    if (!currentMemoryId) { showToast('먼저 기억을 저장하세요', 'info'); return; }
    try {
        const sb = await getSupabaseClient();
        if (!sb) throw new Error('Supabase client not initialized.');
        const { data: scenes, error } = await sb.from('scenes')
            .select('id, scene_order, original_emotion, emotion_dist')
            .eq('memory_id', currentMemoryId).order('scene_order', { ascending: true });
        if (error) throw error;
        if (!scenes || scenes.length === 0) { showToast('씬이 없습니다', 'error'); return; }

        const { data: existing } = await sb.from('plays').select('id')
            .eq('memory_id', currentMemoryId).eq('persona_id', 'author-seed');
        if (existing && existing.length > 0) {
            if (!confirm(`기존 작가 시딩 ${existing.length}행이 있습니다. 삭제하고 다시 심을까요?`)) return;
            await sb.from('plays').delete().eq('memory_id', currentMemoryId).eq('persona_id', 'author-seed');
        } else {
            if (!confirm(`씬 ${scenes.length}개에 작가 궤적(정렬도 1.0)을 심습니다. 계속?`)) return;
        }

        const runId = crypto.randomUUID();
        const rows = scenes.map(s => {
            let ue = s.original_emotion;
            if (typeof ue === 'string') { try { ue = JSON.parse(ue); } catch (e) { ue = null; } }
            if (!ue || typeof ue !== 'object') ue = s.emotion_dist || {};
            return {
                memory_id: currentMemoryId, scene_id: s.id,
                user_emotion: ue, user_reason: 'author-seed',
                alignment: 1.0, mismatch_type: null, run_id: runId,
                persona_id: 'author-seed', persona_name: 'author-seed',
                final_drift_vector: {}, sky_stains: {}
            };
        });
        const { error: insErr } = await sb.from('plays').insert(rows);
        if (insErr) throw insErr;

        // 관객 인구 불변 실측 (§5: 실관객 = persona_id IS NULL AND created_at >= 2026-07-09)
        const { count } = await sb.from('plays').select('id', { count: 'exact', head: true })
            .is('persona_id', null).gte('created_at', '2026-07-09');
        showToast(`작가 궤적 시딩 완료 — ${rows.length}행. 실관객 수(불변 확인)=${count}`, 'success');
    } catch (e) {
        console.error('seedAuthorTrajectory error:', e);
        showToast('시딩 오류: ' + e.message, 'error', { ttl: 0 });
    }
}
window.seedAuthorTrajectory = seedAuthorTrajectory;
const fateLabels={'preserve':'보존','dilute':'자연 소멸','anonymous':'완전 익명'};
const fateColors={'preserve':'#7a9a7a','dilute':'#c4a882','anonymous':'#7b8fa8'};

// 동시 호출 시 race condition으로 allSessions에 같은 row가 두 번 push되어
// 카드가 중복 렌더되는 버그 방지. 진행 중인 호출이 있으면 그 promise를 재사용.
let _loadAllSessionsInFlight = null;
async function loadAllSessions() {
    if (_loadAllSessionsInFlight) return _loadAllSessionsInFlight;
    _loadAllSessionsInFlight = (async () => {
        try {
            allSessions = [];

         // archive session load (existing memories)
            const supabaseClient = getSupabaseClient();
            const { data: archiveData } = await supabaseClient
                .from('memories')
                .select('*')
                .order('created_at', { ascending: false });

            if (archiveData) {
                // Count plays per memory — this count IS the layer number shown.
                const memoryIds = archiveData.map(m => m.id).filter(Boolean);
                const playCounts = {};
                if (memoryIds.length > 0) {
                    const { data: playsData } = await supabaseClient
                        .from('plays')
                        .select('memory_id')
                        .in('memory_id', memoryIds);
                    if (playsData) {
                        playsData.forEach(p => {
                            playCounts[p.memory_id] = (playCounts[p.memory_id] || 0) + 1;
                        });
                    }
                }
                archiveData.forEach(m => {
                    // "레이어" = 이 기억으로 plays 테이블에 쌓인 행 개수 그대로.
                    // 과거엔 m.layers(DB) + playCount 를 더했으나, m.layers 칸 자체가
                    // 플레이 흐름·시뮬레이터에서 "플레이 횟수"로 덮어써지는 값이라
                    // 합산하면 같은 횟수를 두 번 세는 이중 카운트가 됐다.
                    const playRowCount = playCounts[m.id] || 0;
                    allSessions.push({
                        ...m,
                        layers: playRowCount,
                        type: 'archive',
                        displayTitle: m.title || m.code
                    });
                });
            }

         // live session load
            const { data: liveData } = await supabaseClient
                .from('live_sessions')
                .select('*')
                .order('created_at', { ascending: false });

            if (liveData) {
                liveData.forEach(s => {
                    allSessions.push({
                        ...s,
                        type: 'live',
                        displayTitle: s.session_code
                    });
                });
            }

         // 날짜순 정렬
            allSessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            renderSessions();
        } finally {
            _loadAllSessionsInFlight = null;
        }
    })();
    return _loadAllSessionsInFlight;
}

function filterSessions(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderSessions();
}

// ─── Contamination badge for session cards ───────────────────────
function renderContaminationBadge(session) {
    const depth = session.cont_depth || 0;
    if (depth === 0) return '';

    const stage = session.cont_stage || 'stable';
    const drift = ((session.cont_drift || 0) * 100).toFixed(0);
    const fix   = ((session.cont_fixation || 0) * 100).toFixed(0);

    const stageColor = {
        stable:              'rgba(196,168,130,0.4)',
        biased_inclination:  '#c4a048',
        hypercompletion:     '#c46a6a',
    }[stage] || 'rgba(196,168,130,0.4)';

    const stageLabel = {
        stable:              '안정',
        biased_inclination:  '편향 경향',
        hypercompletion:     '과완성',
    }[stage] || stage;

    return `<div style="margin-top:0.4rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        <span style="font-size:0.75rem;color:${stageColor};border:1px solid ${stageColor};padding:1px 6px;border-radius:3px;">${stageLabel}</span>
        <span style="font-size:0.72rem;color:var(--text-muted);">drift ${drift}%</span>
        <span style="font-size:0.72rem;color:var(--text-muted);">fix ${fix}%</span>
        <span style="font-size:0.72rem;color:var(--text-muted);">depth ${depth}</span>
    </div>`;
}

// ─── SceneNavigator emotion-space diagnostics ─────────────────────
//  패턴별 중립 감정 기준으로 씬 간 접근성 계산 + 고립 씬 경고
const DIAG_PATTERN_CENTER = {
    echo_follow:   { wOrig: 0.7, wUser: 0.3 },
    bridge:        { wOrig: 0.5, wUser: 0.5 },
    displacement:  { wOrig: 0.3, wUser: 0.7 },
    contradiction: { mode: 'negate' },
    avoidance:     { mode: 'void' },
    fixation:      { mode: 'current' },
};
const DIAG_BASE_RADIUS = 0.35;

function diagComputeCenter(cfg, origEmo, curEmo) {
    if (cfg.mode === 'void')    return {};
    if (cfg.mode === 'current') return curEmo;
    if (cfg.mode === 'negate') {
        const r = {};
        DEFAULT_EMOTION_ANCHORS.forEach(k => { r[k] = 1 - (origEmo[k] || 0); });
        return r;
    }
    const keys = new Set([...Object.keys(origEmo), ...DEFAULT_EMOTION_ANCHORS]);
    const r = {};
    keys.forEach(k => { r[k] = (origEmo[k] || 0) * cfg.wOrig; });
    return r;
}

function safeParseEmotion(v) {
    if (!v) return {};
    if (typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return {}; } }
    return {};
}

window.runSceneNavDiagnostics = function() {
    const el = document.getElementById('sceneNavDiagResult');
    if (!el) return;
    const scenes = currentScenes;
    if (!scenes || scenes.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted);">씬이 없습니다. 메모리를 먼저 편집 화면에서 열어주세요.</p>';
        return;
    }

    const patterns = Object.keys(DIAG_PATTERN_CENTER);

    // accessMatrix[fromIdx][toIdx] = Set of patterns that can reach toIdx from fromIdx
    const accessMatrix = scenes.map((fromScene, fi) => {
        const fromEmo = safeParseEmotion(fromScene.originalEmotion || fromScene.original_emotion);
        return scenes.map((toScene, ti) => {
            if (ti === fi) return new Set();
            const toEmo = safeParseEmotion(toScene.originalEmotion || toScene.original_emotion);
            const reachableBy = new Set();
            patterns.forEach(pat => {
                const cfg = DIAG_PATTERN_CENTER[pat];
                const center = diagComputeCenter(cfg, fromEmo, fromEmo);
                if (Object.keys(center).length === 0) return; // void → fallback only
                const sim = cosineSimilarity(center, toEmo);
                if (sim >= DIAG_BASE_RADIUS) reachableBy.add(pat);
            });
            return reachableBy;
        });
    });

    // Isolated: scenes never reachable from any other scene via any pattern (in-radius)
    const isolatedIndices = scenes.map((_, ti) => {
        const reachableFromAny = scenes.some((_, fi) => {
            if (fi === ti) return false;
            return accessMatrix[fi][ti].size > 0;
        });
        return !reachableFromAny;
    });

    const isolatedScenes = scenes.filter((_, i) => isolatedIndices[i]);

    // Build HTML
    let html = '';

    // ── Isolated scene warnings ──
    if (isolatedScenes.length > 0) {
        html += `<div style="background:rgba(196,80,80,0.08);border:1px solid rgba(196,80,80,0.4);border-radius:4px;padding:1rem;margin-bottom:1.5rem;">
            <div style="color:#c46a6a;font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;">⚠ 고립 씬 ${isolatedScenes.length}개 — 어떤 패턴으로도 도달 불가</div>
            ${isolatedScenes.map((s, i) => {
                const idx = scenes.indexOf(s);
                const label = s.text ? s.text.slice(0, 40) + (s.text.length > 40 ? '…' : '') : `씬 ${idx + 1}`;
                return `<div style="font-size:0.8rem;color:var(--text-muted);padding:2px 0;">씬 ${idx + 1}: "${label}"</div>`;
            }).join('')}
        </div>`;
    } else {
        html += `<div style="color:#7a9a7a;font-size:0.85rem;margin-bottom:1.5rem;">✓ 고립 씬 없음 — 모든 씬이 최소 1개 패턴으로 접근 가능</div>`;
    }

    // ── Editable accessibility table ──
    const patternColors = {
        echo_follow: '#8888cc', bridge: '#7a9a7a', displacement: '#c4a048',
        contradiction: '#c46a6a', avoidance: '#888', fixation: '#aa88cc',
    };
    const patternNames = Object.keys(patternColors);

    // Store editable matrix globally for saving
    window._diagAccessMatrix = accessMatrix.map(row => row.map(s => new Set(s)));

    window.renderDots = function renderDots(fi, ti) {
        const pats = window._diagAccessMatrix[fi][ti];
        if (pats.size === 0) return '<span style="color:rgba(196,168,130,0.2);">✗</span>';
        return [...pats].map(p => `<span title="${p}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${patternColors[p] || '#888'};margin:1px;"></span>`).join('');
    }

    html += `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
        <thead>
            <tr>
                <th style="padding:6px 8px;text-align:left;color:var(--text-muted);border-bottom:1px solid rgba(196,168,130,0.15);">from ↓ / to →</th>
                ${scenes.map((s, i) => `<th style="padding:6px 4px;color:var(--text-muted);border-bottom:1px solid rgba(196,168,130,0.15);${isolatedIndices[i] ? 'color:#c46a6a;' : ''}">S${i + 1}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${scenes.map((fromScene, fi) => `
            <tr>
                <td style="padding:4px 8px;color:var(--text-muted);white-space:nowrap;border-bottom:1px solid rgba(196,168,130,0.07);">S${fi + 1} ${fromScene.text ? '"' + fromScene.text.slice(0, 20) + '…"' : ''}</td>
                ${scenes.map((_, ti) => {
                    if (ti === fi) return `<td style="padding:4px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(196,168,130,0.07);">—</td>`;
                    return `<td id="diagCell_${fi}_${ti}" data-fi="${fi}" data-ti="${ti}" style="padding:4px;text-align:center;border-bottom:1px solid rgba(196,168,130,0.07);cursor:pointer;" onclick="openPatternEditor(${fi},${ti})">${renderDots(fi, ti)}</td>`;
                }).join('')}
            </tr>`).join('')}
        </tbody>
    </table>
    </div>
    <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;">
        ${Object.entries(patternColors).map(([p, c]) => `<span style="font-size:0.72rem;color:var(--text-muted);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle;"></span>${p}</span>`).join('')}
        <span style="font-size:0.72rem;color:var(--text-muted);">셀 클릭으로 편집</span>
    </div>`;

    // Pattern editor popup
    html += `<div id="diagPatternPopup" style="display:none;position:fixed;z-index:9999;background:rgba(10,10,15,0.95);border:1px solid rgba(196,168,130,0.3);border-radius:6px;padding:12px 16px;min-width:160px;backdrop-filter:blur(6px);">
        <div style="font-size:11px;color:rgba(196,168,130,0.5);margin-bottom:8px;" id="diagPopupTitle">S1 → S2</div>
        ${patternNames.map(p => `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;color:#c4a882;">
                <input type="checkbox" data-pattern="${p}" onchange="toggleDiagPattern(this)" style="accent-color:${patternColors[p]};">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${patternColors[p]};"></span>
                ${p}
            </label>
        `).join('')}
        <div style="margin-top:8px;display:flex;gap:6px;">
            <button onclick="diagSelectAll(true)" style="flex:1;padding:4px;border:1px solid rgba(196,168,130,0.2);background:transparent;color:rgba(196,168,130,0.6);font-size:10px;cursor:pointer;border-radius:3px;">전체 선택</button>
            <button onclick="diagSelectAll(false)" style="flex:1;padding:4px;border:1px solid rgba(196,168,130,0.2);background:transparent;color:rgba(196,168,130,0.6);font-size:10px;cursor:pointer;border-radius:3px;">전체 해제</button>
        </div>
        <div style="margin-top:6px;text-align:right;">
            <button onclick="closeDiagPopup()" style="padding:4px 12px;border:1px solid rgba(196,168,130,0.2);background:transparent;color:rgba(196,168,130,0.5);font-size:10px;cursor:pointer;border-radius:3px;">닫기</button>
        </div>
    </div>`;

    el.innerHTML = html;

    // ── Popup logic ──
    window._diagEditFi = -1;
    window._diagEditTi = -1;

    window.openPatternEditor = function(fi, ti) {
        const popup = document.getElementById('diagPatternPopup');
        const cell = document.getElementById('diagCell_' + fi + '_' + ti);
        if (!popup || !cell) return;
        window._diagEditFi = fi;
        window._diagEditTi = ti;
        document.getElementById('diagPopupTitle').textContent = 'S' + (fi+1) + ' → S' + (ti+1);
        const pats = window._diagAccessMatrix[fi][ti];
        popup.querySelectorAll('input[data-pattern]').forEach(function(cb) {
            cb.checked = pats.has(cb.dataset.pattern);
        });
        // Position near cell
        const rect = cell.getBoundingClientRect();
        popup.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
        popup.style.top = Math.min(rect.bottom + 4, window.innerHeight - 300) + 'px';
        popup.style.display = 'block';
    };

    window.toggleDiagPattern = function(cb) {
        const fi = window._diagEditFi, ti = window._diagEditTi;
        if (fi < 0) return;
        const pat = cb.dataset.pattern;
        const pats = window._diagAccessMatrix[fi][ti];
        if (cb.checked) pats.add(pat);
        else pats.delete(pat);
        // Update cell dots
        const cell = document.getElementById('diagCell_' + fi + '_' + ti);
        if (cell) cell.innerHTML = renderDots(fi, ti);
    };

    window.diagSelectAll = function(selectAll) {
        const fi = window._diagEditFi, ti = window._diagEditTi;
        if (fi < 0) return;
        const popup = document.getElementById('diagPatternPopup');
        const pats = window._diagAccessMatrix[fi][ti];
        popup.querySelectorAll('input[data-pattern]').forEach(function(cb) {
            cb.checked = selectAll;
            if (selectAll) pats.add(cb.dataset.pattern);
            else pats.delete(cb.dataset.pattern);
        });
        const cell = document.getElementById('diagCell_' + fi + '_' + ti);
        if (cell) cell.innerHTML = renderDots(fi, ti);
    };

    window.closeDiagPopup = function() {
        const popup = document.getElementById('diagPatternPopup');
        if (popup) popup.style.display = 'none';
    };

    // Close popup on click outside
    document.addEventListener('click', function(e) {
        const popup = document.getElementById('diagPatternPopup');
        if (!popup || popup.style.display === 'none') return;
        if (!popup.contains(e.target) && !e.target.closest('[id^="diagCell_"]')) {
            popup.style.display = 'none';
        }
    });

    // ── Twine-style node graph ──
    _renderSceneGraph(scenes, patternColors);
};

function _renderSceneGraph(scenes, patternColors) {
    const container = document.getElementById('sceneGraphContainer');
    const svg = document.getElementById('sceneGraphSvg');
    const nodesEl = document.getElementById('sceneGraphNodes');
    const popup = document.getElementById('sceneGraphPopup');
    if (!container || !svg || !nodesEl) return;
    container.style.display = 'block';
    container.style.height = '550px';
    nodesEl.innerHTML = '';
    svg.innerHTML = '';
    svg.style.pointerEvents = 'all';

    const W = container.offsetWidth || 800;
    const H = container.offsetHeight || 550;
    const N = scenes.length;
    const patternNames = Object.keys(patternColors);
    const PAD = 50;

    // ── VA projection per scene ──
    const sceneVA = scenes.map(sc => {
        const emo = safeParseEmotion(sc.originalEmotion || sc.original_emotion);
        let V = 0, A = 0, wSum = 0;
        const VAD = {
            fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
            guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
            numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
            resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
            relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
            peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
        };
        for (const k in emo) {
            const w = emo[k] || 0; const m = VAD[k];
            if (!w || !m) continue;
            V += w * m.v; A += w * m.a; wSum += w;
        }
        if (wSum > 0) { V /= wSum; A /= wSum; }
        // Dominant emotion
        let dk = '', dv = 0;
        for (const k in emo) { if (emo[k] > dv) { dv = emo[k]; dk = k; } }
        return { v: V, a: A, domEmo: dk };
    });

    // VA → pixel
    function vaToXY(v, a) {
        return {
            x: PAD + (v + 1) / 2 * (W - PAD * 2),
            y: PAD + (1 - (a + 1) / 2) * (H - PAD * 2), // invert Y (arousal up)
        };
    }
    function xyToVA(x, y) {
        return {
            v: ((x - PAD) / (W - PAD * 2)) * 2 - 1,
            a: 1 - ((y - PAD) / (H - PAD * 2)) * 2,
        };
    }

    const nodePositions = sceneVA.map(va => vaToXY(va.v, va.a));

    const EC = { fear:'#6647b3', sadness:'#4061a6', anger:'#cc4038', guilt:'#997a59', longing:'#479ea6',
        numbness:'#525261', shame:'#94597a', isolation:'#24243d', joy:'#d1b861', hope:'#8ca673',
        love:'#b3667f', peace:'#739485', gratitude:'#a69466', relief:'#7aad7a', confusion:'#7a618c' };
    const emColors = sceneVA.map(va => EC[va.domEmo] || '#888');

    let selectedIdx = -1;

    // ── Draw axis labels + grid ──
    function _drawGrid() {
        // Axis labels as HTML
        let gridHtml = '';
        gridHtml += '<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(196,168,130,0.3);letter-spacing:2px;">AROUSAL ↑</div>';
        gridHtml += '<div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(196,168,130,0.3);letter-spacing:2px;">↓ CALM</div>';
        gridHtml += '<div style="position:absolute;left:8px;top:50%;transform:translateY(-50%) rotate(-90deg);font-size:10px;color:rgba(196,168,130,0.3);letter-spacing:2px;">NEGATIVE</div>';
        gridHtml += '<div style="position:absolute;right:8px;top:50%;transform:translateY(-50%) rotate(90deg);font-size:10px;color:rgba(196,168,130,0.3);letter-spacing:2px;">POSITIVE</div>';
        // Quadrant labels
        gridHtml += '<div style="position:absolute;top:' + (PAD + 10) + 'px;left:' + (PAD + 10) + 'px;font-size:9px;color:rgba(196,168,130,0.15);">공포·분노</div>';
        gridHtml += '<div style="position:absolute;top:' + (PAD + 10) + 'px;right:' + (PAD + 10) + 'px;font-size:9px;color:rgba(196,168,130,0.15);">기쁨·사랑</div>';
        gridHtml += '<div style="position:absolute;bottom:' + (PAD + 10) + 'px;left:' + (PAD + 10) + 'px;font-size:9px;color:rgba(196,168,130,0.15);">슬픔·무감각</div>';
        gridHtml += '<div style="position:absolute;bottom:' + (PAD + 10) + 'px;right:' + (PAD + 10) + 'px;font-size:9px;color:rgba(196,168,130,0.15);">평화·안도</div>';
        return gridHtml;
    }

    // ── Draw SVG grid lines ──
    function _drawSvgGrid() {
        let s = '';
        const cx = vaToXY(0, 0);
        // Cross hair at origin
        s += `<line x1="${PAD}" y1="${cx.y}" x2="${W-PAD}" y2="${cx.y}" stroke="rgba(196,168,130,0.08)" stroke-width="1"/>`;
        s += `<line x1="${cx.x}" y1="${PAD}" x2="${cx.x}" y2="${H-PAD}" stroke="rgba(196,168,130,0.08)" stroke-width="1"/>`;
        // Border
        s += `<rect x="${PAD}" y="${PAD}" width="${W-PAD*2}" height="${H-PAD*2}" fill="none" stroke="rgba(196,168,130,0.06)" stroke-width="1"/>`;
        return s;
    }

    // ── Create nodes ──
    let gridLabels = _drawGrid();
    nodesEl.innerHTML = gridLabels;

    scenes.forEach((sc, i) => {
        const node = document.createElement('div');
        const letter = String.fromCharCode(65 + i); // A, B, C...
        const preview = sc.text ? sc.text.slice(0, 18) + (sc.text.length > 18 ? '…' : '') : '';
        node.id = 'sgNode_' + i;
        node.dataset.idx = i;
        node.style.cssText = `position:absolute;left:${nodePositions[i].x - 28}px;top:${nodePositions[i].y - 28}px;width:56px;height:56px;background:rgba(15,15,20,0.85);border:2px solid ${emColors[i]};border-radius:50%;cursor:grab;user-select:none;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:box-shadow 0.2s;`;
        node.innerHTML = `<div style="font-size:14px;font-weight:bold;color:${emColors[i]};">${letter}</div><div style="font-size:7px;color:rgba(196,168,130,0.4);max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preview}</div>`;
        nodesEl.appendChild(node);

        // Click to select
        node.addEventListener('click', e => {
            if (e.detail > 0 && !node._wasDragged) {
                selectedIdx = selectedIdx === i ? -1 : i;
                _redraw();
            }
            node._wasDragged = false;
        });

        // Drag
        let dragging = false, startX, startY, origX, origY, moved = false;
        node.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            dragging = true; moved = false;
            node.style.cursor = 'grabbing'; node.style.zIndex = '5';
            startX = e.clientX; startY = e.clientY;
            origX = nodePositions[i].x; origY = nodePositions[i].y;
            e.preventDefault(); e.stopPropagation();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            nodePositions[i].x = Math.max(PAD, Math.min(W - PAD, origX + dx));
            nodePositions[i].y = Math.max(PAD, Math.min(H - PAD, origY + dy));
            node.style.left = (nodePositions[i].x - 28) + 'px';
            node.style.top = (nodePositions[i].y - 28) + 'px';
            // Update VA
            const newVA = xyToVA(nodePositions[i].x, nodePositions[i].y);
            sceneVA[i].v = newVA.v; sceneVA[i].a = newVA.a;
            // Recalculate connections for this scene
            _recalcConnections();
            _redraw();
        });
        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false; node.style.cursor = 'grab'; node.style.zIndex = '2';
                if (moved) node._wasDragged = true;
            }
        });
    });

    // ── Recalculate accessibility from VA positions ──
    function _recalcConnections() {
        const matrix = window._diagAccessMatrix;
        if (!matrix) return;
        for (let fi = 0; fi < N; fi++) {
            for (let ti = 0; ti < N; ti++) {
                if (fi === ti) continue;
                const reachable = new Set();
                // Compute cosine similarity between scenes in emotion space
                // Use VA distance as proxy (simpler than full emotion vector cosine)
                const dv = sceneVA[fi].v - sceneVA[ti].v;
                const da = sceneVA[fi].a - sceneVA[ti].a;
                const dist = Math.sqrt(dv * dv + da * da);
                // Pattern-specific radii (in VA space, scaled from cosine similarity)
                if (dist < 1.2) reachable.add('echo_follow');
                if (dist < 1.5) reachable.add('bridge');
                if (dist < 1.8) reachable.add('displacement');
                // Contradiction: far away is better (negate)
                if (dist > 0.8) reachable.add('contradiction');
                // Avoidance/fixation always available
                reachable.add('avoidance');
                reachable.add('fixation');
                matrix[fi][ti] = reachable;
            }
        }
    }

    // ── Main redraw ──
    function _redraw() {
        svg.innerHTML = _drawSvgGrid();
        const matrix = window._diagAccessMatrix;
        if (!matrix) return;

        // Draw radius circles for selected node
        if (selectedIdx >= 0) {
            const sel = nodePositions[selectedIdx];
            const radii = [
                { name: 'echo_follow', r: 1.2, color: patternColors.echo_follow },
                { name: 'bridge', r: 1.5, color: patternColors.bridge },
                { name: 'displacement', r: 1.8, color: patternColors.displacement },
                { name: 'contradiction (외부)', r: 0.8, color: patternColors.contradiction },
            ];
            radii.forEach(rd => {
                const rPx = rd.r / 2 * (W - PAD * 2);
                if (rd.name.startsWith('contra')) {
                    // Contradiction: show as dashed inner circle (outside = reachable)
                    svg.innerHTML += `<circle cx="${sel.x}" cy="${sel.y}" r="${rPx}" fill="none" stroke="${rd.color}" stroke-width="1" stroke-opacity="0.2" stroke-dasharray="4 4"/>`;
                } else {
                    svg.innerHTML += `<circle cx="${sel.x}" cy="${sel.y}" r="${rPx}" fill="none" stroke="${rd.color}" stroke-width="1" stroke-opacity="0.15"/>`;
                }
            });
        }

        // Draw connections (only from selected, or all dimmed if none selected)
        for (let fi = 0; fi < N; fi++) {
            for (let ti = 0; ti < N; ti++) {
                if (fi === ti) continue;
                const pats = matrix[fi][ti];
                if (!pats || pats.size === 0) continue;

                const showFull = selectedIdx < 0 || fi === selectedIdx;
                if (!showFull && selectedIdx >= 0) continue; // Only show selected node's connections

                const from = nodePositions[fi], to = nodePositions[ti];
                const dx = to.x - from.x, dy = to.y - from.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                // Arrow line
                const strongest = [...pats][0];
                const col = patternColors[strongest] || '#888';
                const opacity = showFull ? 0.5 : 0.1;

                // Shorten line to not overlap nodes
                const shrink = 30;
                const sx = from.x + (dx / len) * shrink;
                const sy = from.y + (dy / len) * shrink;
                const ex = to.x - (dx / len) * shrink;
                const ey = to.y - (dy / len) * shrink;

                svg.innerHTML += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="1.5" stroke-opacity="${opacity}"/>`;

                // Arrowhead
                const ax = dx / len, ay = dy / len;
                const ahx = ex - ax * 8, ahy = ey - ay * 8;
                svg.innerHTML += `<polygon points="${ex},${ey} ${ahx + ay * 4},${ahy - ax * 4} ${ahx - ay * 4},${ahy + ax * 4}" fill="${col}" fill-opacity="${opacity}"/>`;

                // Pattern dots along the line
                if (showFull && pats.size > 0) {
                    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
                    let di = 0;
                    pats.forEach(p => {
                        const off = (di - (pats.size - 1) / 2) * 10;
                        const nx = -dy / len, ny = dx / len;
                        svg.innerHTML += `<circle cx="${mx + nx * off}" cy="${my + ny * off}" r="3" fill="${patternColors[p]}" fill-opacity="0.8"><title>${p}</title></circle>`;
                        di++;
                    });
                }
            }
        }

        // Highlight selected node
        document.querySelectorAll('[id^="sgNode_"]').forEach((n, i) => {
            if (i === selectedIdx) {
                n.style.boxShadow = '0 0 16px ' + emColors[i];
                n.style.transform = 'scale(1.15)';
            } else {
                n.style.boxShadow = '';
                n.style.transform = '';
                n.style.opacity = selectedIdx >= 0 ? '0.5' : '1';
            }
            if (i === selectedIdx) n.style.opacity = '1';
        });

        // Update info panel
        _updateInfoPanel();
    }

    // ── Info panel for selected scene ──
    function _updateInfoPanel() {
        let info = popup;
        if (selectedIdx < 0) { info.style.display = 'none'; return; }
        const matrix = window._diagAccessMatrix;
        const letter = String.fromCharCode(65 + selectedIdx);
        const sc = scenes[selectedIdx];
        const va = sceneVA[selectedIdx];
        let html = `<div style="font-size:13px;font-weight:bold;color:#c4a882;margin-bottom:6px;">${letter}. ${(sc.text || '').slice(0, 30)}${(sc.text || '').length > 30 ? '…' : ''}</div>`;
        html += `<div style="font-size:10px;color:rgba(196,168,130,0.5);margin-bottom:8px;">V: ${va.v.toFixed(2)} · A: ${va.a.toFixed(2)} · ${sceneVA[selectedIdx].domEmo}</div>`;
        html += `<div style="font-size:11px;color:rgba(196,168,130,0.7);margin-bottom:4px;">도달 가능:</div>`;
        for (let ti = 0; ti < N; ti++) {
            if (ti === selectedIdx) continue;
            const pats = matrix[selectedIdx][ti];
            if (!pats || pats.size === 0) continue;
            const tLetter = String.fromCharCode(65 + ti);
            const dots = [...pats].map(p => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${patternColors[p]};margin:0 1px;" title="${p}"></span>`).join('');
            html += `<div style="font-size:10px;padding:2px 0;">→ ${tLetter} ${dots}</div>`;
        }
        info.innerHTML = html;
        info.style.display = 'block';
        info.style.right = '12px';
        info.style.top = '12px';
        info.style.left = 'auto';
    }

    // Initial draw
    _recalcConnections();
    _redraw();
}

function renderSessions() {
    let filtered = currentFilter === 'all'
        ? allSessions
        : allSessions.filter(s => s.type === currentFilter);

    // W3-J: 휴지통 파티션 — 삭제된 archive 는 기본 숨김, 휴지통 보기에서만 노출.
    //   라이브 세션은 soft-delete 대상 아님 → 휴지통 보기에서는 제외.
    if (showTrash) {
        filtered = filtered.filter(s => s.type === 'archive' && s.deleted_at);
    } else {
        filtered = filtered.filter(s => !(s.type === 'archive' && s.deleted_at));
    }

    // W2-E: 제목/코드 부분일치 검색
    if (sessionSearchQuery) {
        filtered = filtered.filter(s => {
            const title = (s.displayTitle || '').toLowerCase();
            const code = (s.code || '').toLowerCase();
            return title.includes(sessionSearchQuery) || code.includes(sessionSearchQuery);
        });
    }

    const container = document.getElementById('sessionsListContainer');
    if (!container) return;

    if (!filtered || filtered.length === 0) {
        const msg = showTrash ? '휴지통이 비어 있습니다.'
            : (sessionSearchQuery ? '검색 결과가 없습니다.' : '세션이 없습니다.');
        container.innerHTML = `<p style="color: var(--text-muted);">${msg}</p>`;
        return;
    }
    
    container.innerHTML = filtered.map(session => {
        const isArchive = session.type === 'archive';
        const isPublic = isArchive ? (session.is_public ?? session.visible ?? true) : null;
        const visibilityLabel = isPublic ? '공개' : '비공개';
        const visibilityColor = isPublic ? '#7a9a7a' : '#a66a6a';
        const visibilityBtnLabel = isPublic ? '비공개로' : '공개로';
        return `
        <div class="session-card ${session.type}" data-session-id="${session.id}">
            <input type="checkbox" class="session-checkbox" onclick="event.stopPropagation(); updateSelectedCount()" data-id="${session.id}" data-type="${session.type}">
            <div class="session-content" onclick="openSessionDetail('${session.id}', '${session.type}')" style="flex: 1; cursor: pointer;">
                <div class="session-header">
                    <span class="session-title">${session.displayTitle}</span>
                    ${session.type === 'live' ? '<span class="live-tag">LIVE</span>' : ''}
                </div>
                <div class="session-meta">
                    <span>${new Date(session.created_at).toLocaleString('ko-KR')}</span>
                    ${session.type === 'live' ? `<span>정렬도: ${((session.alignment || 0) * 100).toFixed(0)}%</span>` : `<span>레이어: ${session.layers || 0}</span>`}
                </div>
                ${isArchive ? `<div class="session-fate" style="color: ${visibilityColor}; margin-top: 0.5rem; font-size: 0.9rem;">공개 상태: ${visibilityLabel}</div>` : ''}
                ${isArchive ? renderContaminationBadge(session) : ''}
                ${session.type === 'live' && session.memory_fate ? `<div class="session-fate" style="color: ${fateColors[session.memory_fate] || '#666'}; margin-top: 0.5rem; font-size: 0.9rem;">운명: ${fateLabels[session.memory_fate] || '미정'}</div>` : ''}
            </div>
            ${showTrash ? `
            <button class="session-delete-btn" onclick="event.stopPropagation(); restoreMemoryById('${session.id}')" style="padding: 0.5rem 1rem; background: transparent; color: var(--accent-memory); border: 1px solid var(--accent-memory); border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">복원</button>
            <button class="session-delete-btn" onclick="event.stopPropagation(); purgeMemoryById('${session.id}', '${(session.displayTitle || '').replace(/'/g, "\\'")}')" style="padding: 0.5rem 1rem; background: var(--accent-live); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">영구 삭제</button>
            ` : `
            ${isArchive ? `<button class="session-delete-btn" onclick="event.stopPropagation(); toggleArchiveVisibilityById('${session.id}')" style="padding: 0.5rem 0.85rem; background: transparent; color: var(--accent-memory); border: 1px solid var(--accent-memory); border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">${visibilityBtnLabel}</button>` : ''}
            <button class="session-delete-btn" onclick="event.stopPropagation(); deleteSessionById('${session.id}', '${session.type}')" style="padding: 0.5rem 1rem; background: var(--accent-live); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">삭제</button>
            `}
        </div>
    `;
    }).join('');
    updateSelectedCount();
}

async function toggleArchiveVisibilityById(memoryId) {
    const target = allSessions.find(s => s.type === 'archive' && String(s.id) === String(memoryId));
    if (!target) {
        showToast('대상 기억을 찾지 못했습니다', 'error');
        return;
    }

    const current = target.is_public ?? target.visible ?? true;
    const next = !current;

    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }

        const { error } = await supabaseClient
            .from('memories')
            .update({ is_public: next })
            .eq('id', target.id);

        if (error) throw error;

        target.is_public = next;
        target.visible = next;
        const memoryIdx = memories.findIndex(m => String(m.id) === String(target.id));
        if (memoryIdx >= 0) {
            memories[memoryIdx].is_public = next;
            memories[memoryIdx].visible = next;
        }
        saveMemoriesToStorage();
        renderSessions();
    } catch (error) {
        console.error('toggleArchiveVisibilityById error:', error);
        showToast('공개 상태 변경 오류: ' + error.message, 'error', { ttl: 0 });
    }
}

let selectedSessionIds = [];

function toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.session-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
    updateSelectedCount();
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.session-checkbox:checked');
    const count = checkboxes.length;
    const selectedCountEl = document.getElementById('selectedCount');
    if (selectedCountEl) {
        selectedCountEl.textContent = count + '개 선택됨';
    }
    const allCheckboxes = document.querySelectorAll('.session-checkbox');
    const selectAll = document.getElementById('selectAllSessions');
    if (selectAll) {
        selectAll.checked = count > 0 && count === allCheckboxes.length;
        selectAll.indeterminate = count > 0 && count < allCheckboxes.length;
    }
}

async function deleteSessionById(id, type) {
    // W3-J: 기억(archive)은 soft-delete(휴지통). 라이브 세션은 기존 hard delete.
    const confirmMsg = type === 'archive'
        ? '이 기억을 휴지통으로 보낼까요?\n(공개가 해제되며, 휴지통에서 복원할 수 있습니다.)'
        : '라이브 세션을 삭제하시겠습니까?\n관련된 장면 데이터도 함께 삭제됩니다.';
    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }

        if (type === 'archive') {
            // soft-delete: 행 보존(deleted_at) + 공개 해제(is_public=false).
            // play-test 는 is_public=false 로 자연 숨김 — play-test 무수정.
            const { error } = await supabaseClient
                .from('memories')
                .update({ deleted_at: new Date().toISOString(), is_public: false })
                .eq('id', id);
            if (error) throw error;
        } else {
 // live session delete: 모든 data 먼저 delete
 // 1. live_scenes delete
            const { error: scenesError } = await supabaseClient
                .from('live_scenes')
                .delete()
                .eq('session_id', id);
            
            if (scenesError) {
                console.warn('live_scenes 삭제 중 오류 (무시하고 계속 진행):', scenesError);
            }
            
 // 2. scenes 테 블 서 live_session_id 참조 remove (중요!)
            const { error: scenesUpdateError } = await supabaseClient
                .from('scenes')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (scenesUpdateError) {
                console.warn('scenes live_session_id 업데이트 중 오류 (무시하고 계속 진행):', scenesUpdateError);
            }
            
 // 3. choices 테 블 서 live_session_id 참조 remove (중요!)
            const { error: choicesUpdateError } = await supabaseClient
                .from('choices')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (choicesUpdateError) {
                console.warn('choices live_session_id 업데이트 중 오류 (무시하고 계속 진행):', choicesUpdateError);
            }
            
 // 4. live_sessions delete
            const { error: sessionsError } = await supabaseClient
                .from('live_sessions')
                .delete()
                .eq('id', id);
            
            if (sessionsError) {
                throw new Error(`live_sessions Delete failed: ${sessionsError.message}`);
            }
        }
        
        showToast(type === 'archive' ? '휴지통으로 보냈습니다' : '라이브 세션이 삭제되었습니다', 'success');
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
    } catch (e) {
        console.error('Delete error:', e);
        showToast('삭제 오류: ' + e.message, 'error', { ttl: 0 });
    }
}

async function deleteSelectedSessions() {
    const checkboxes = document.querySelectorAll('.session-checkbox:checked');
    const liveSessions = Array.from(checkboxes).filter(cb => cb.dataset.type === 'live').map(cb => cb.dataset.id);
    const archiveSessions = Array.from(checkboxes).filter(cb => cb.dataset.type === 'archive').map(cb => cb.dataset.id);
    
    if (liveSessions.length === 0 && archiveSessions.length === 0) {
        showToast('삭제할 세션을 선택하세요', 'info');
        return;
    }
    
    let confirmMessage = '';
    if (liveSessions.length > 0 && archiveSessions.length > 0) {
        confirmMessage = `${liveSessions.length}개의 라이브 세션과 ${archiveSessions.length}개의 아카이브를 삭제하시겠습니까?`;
    } else if (liveSessions.length > 0) {
        confirmMessage = `${liveSessions.length}개의 라이브 세션을 삭제하시겠습니까?\n관련된 장면 데이터도 함께 삭제됩니다.`;
    } else {
        confirmMessage = `${archiveSessions.length}개의 아카이브를 삭제하시겠습니까?\n관련된 장면 데이터도 함께 삭제됩니다.`;
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }
        
 // live session delete
        for (const id of liveSessions) {
 // 1. live_scenes delete
            const { error: scenesError } = await supabaseClient
                .from('live_scenes')
                .delete()
                .eq('session_id', id);
            
            if (scenesError) {
                console.warn(`live_scenes 삭제 중 오류 (session_id: ${id}):`, scenesError);
            }
            
 // 2. scenes 테 블 서 live_session_id 참조 remove (중요!)
            const { error: scenesUpdateError } = await supabaseClient
                .from('scenes')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (scenesUpdateError) {
                console.warn(`scenes live_session_id 업데이트 중 오류 (session_id: ${id}):`, scenesUpdateError);
            }
            
 // 3. choices 테 블 서 live_session_id 참조 remove (중요!)
            const { error: choicesUpdateError } = await supabaseClient
                .from('choices')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (choicesUpdateError) {
                console.warn(`choices live_session_id 업데이트 중 오류 (session_id: ${id}):`, choicesUpdateError);
            }
            
 // 4. live_sessions delete
            const { error: sessionsError } = await supabaseClient
                .from('live_sessions')
                .delete()
                .eq('id', id);
            
            if (sessionsError) {
                throw new Error(`live_sessions Delete failed (id: ${id}): ${sessionsError.message}`);
            }
        }
        
 // archive memory delete
        for (const id of archiveSessions) {
            await deleteMemoryGraph(supabaseClient, id);
        }
        
        let successMessage = '';
        if (liveSessions.length > 0 && archiveSessions.length > 0) {
            successMessage = `${liveSessions.length}개의 라이브 세션과 ${archiveSessions.length}개의 아카이브가 삭제되었습니다`;
        } else if (liveSessions.length > 0) {
            successMessage = `${liveSessions.length}개의 라이브 세션이 삭제되었습니다`;
        } else {
            successMessage = `${archiveSessions.length}개의 아카이브가 삭제되었습니다`;
        }
        
        showToast(successMessage, 'success');
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
    } catch (e) {
        console.error('Delete error:', e);
        showToast('삭제 오류: ' + e.message, 'error', { ttl: 0 });
    }
}

async function openSessionDetail(id, type) {
    if (type === 'archive') {
 // existing archive 상세 직 - 디터 열기
        const memoryIndex = memories.findIndex(m => m.id == id);
        if (memoryIndex !== -1) {
            editMemory(memoryIndex);
        }
    } else {
 // live session 상세
        openLiveSessionDetail(id);
    }
}

async function openLiveSessionDetail(sessionId) {
    const supabaseClient = getSupabaseClient();
    const { data: sessionData } = await supabaseClient
        .from('live_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
    
    const { data: scenesData } = await supabaseClient
        .from('live_scenes')
        .select('*')
        .eq('session_id', sessionId)
        .order('scene_index', { ascending: true });
    
    const detailContainer = document.getElementById('sessionDetailContainer');
    
    detailContainer.innerHTML = `
        <div class="detail-header">
            <button class="back-btn" onclick="closeSessionDetail()">← 목록으로</button>
            <h2>${sessionData.session_code} <span class="live-tag">LIVE</span></h2>
            <div class="detail-info" style="display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap;">
                <span>정렬도: ${((sessionData.alignment || 0) * 100).toFixed(0)}%</span>
                ${sessionData.memory_fate ? `<span style="color: ${fateColors[sessionData.memory_fate] || '#666'}">운명: ${fateLabels[sessionData.memory_fate] || '미정'}</span>` : '<span style="color: #666">운명: 미정</span>'}
            </div>
        </div>
        
        <div class="scenes-list">
            ${scenesData && scenesData.length > 0 ? scenesData.map(scene => `
                <div class="scene-item" id="scene-${scene.id}">
                    <div class="scene-header">
                        <h3>장면 ${scene.scene_index}</h3>
                        <span class="void-icons">
                            ${scene.void_scene ? '○' : ''}${scene.void_emotion ? '△' : ''}${scene.void_reason ? '□' : ''}
                        </span>
                    </div>
                    
                    <div class="scene-text-box">
                        <p>${scene.scene_text || '(장면 없음)'}</p>
                    </div>
                    
                    <div class="emotion-text-box">
                        <p>${scene.generated_emotion || '(감정 없음)'}</p>
                    </div>
                    
                    <div class="scene-controls">
                        <button class="control-btn" onclick="toggleVectorPanel('${scene.id}')">감정 벡터</button>
                        <button class="control-btn" onclick="toggleVoidPanel('${scene.id}')">Void 설정</button>
                    </div>
                    
                    <div class="vector-panel" id="vector-panel-${scene.id}" style="display:none">
                        ${renderVectorPanel(scene)}
                    </div>
                    
                    <div class="void-panel" id="void-panel-${scene.id}" style="display:none">
                        ${renderVoidPanel(scene)}
                    </div>
                </div>
            `).join('') : '<p style="color: var(--text-muted);">저장된 장면이 not found.</p>'}
        </div>
    `;
    
    document.getElementById('sessionsListSection').style.display = 'none';
    detailContainer.style.display = 'block';
}

function renderVectorPanel(scene) {
    const vector = scene.emotion_vector || {fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0};
    const emotions = [
        { key: 'fear', label: '공포' },
        { key: 'sadness', label: '슬픔' },
        { key: 'anger', label: '분노' },
        { key: 'joy', label: '기쁨' },
        { key: 'longing', label: '그리움' },
        { key: 'guilt', label: '죄책감' }
    ];
    
    return `
        <div class="vector-values" id="vector-values-${scene.id}">
            <h4>기본 감정</h4>
            ${emotions.map(e => `
                <div class="vector-row">
                    <span class="vector-label">${e.label}</span>
                    <span class="vector-num" id="val-${scene.id}-${e.key}">${(vector[e.key] || 0).toFixed(2)}</span>
                </div>
            `).join('')}
            
            <h4>메타</h4>
            <div class="vector-row">
                <span class="vector-label">강도</span>
                <span class="vector-num" id="val-${scene.id}-intensity">${(scene.intensity || 0.5).toFixed(2)}</span>
            </div>
            <div class="vector-row">
                <span class="vector-label">확신도</span>
                <span class="vector-num" id="val-${scene.id}-confidence">${(scene.confidence || 0.5).toFixed(2)}</span>
            </div>
            
            <button class="edit-btn" onclick="editVector('${scene.id}')">수정</button>
        </div>
        
        <div class="vector-edit" id="vector-edit-${scene.id}" style="display:none">
            <h4>기본 감정</h4>
            ${emotions.map(e => `
                <div class="vector-row">
                    <span class="vector-label">${e.label}</span>
                    <input type="number" min="0" max="1" step="0.01" value="${(vector[e.key] || 0).toFixed(2)}" 
                        id="input-${scene.id}-${e.key}">
                </div>
            `).join('')}
            
            <h4>메타</h4>
            <div class="vector-row">
                <span class="vector-label">강도</span>
                <input type="number" min="0" max="1" step="0.01" value="${(scene.intensity || 0.5).toFixed(2)}" 
                    id="input-${scene.id}-intensity">
            </div>
            <div class="vector-row">
                <span class="vector-label">확신도</span>
                <input type="number" min="0" max="1" step="0.01" value="${(scene.confidence || 0.5).toFixed(2)}" 
                    id="input-${scene.id}-confidence">
            </div>
            
            <div class="edit-buttons">
                <button class="save-btn" onclick="saveVector('${scene.id}')">저장</button>
                <button class="cancel-btn" onclick="cancelEditVector('${scene.id}')">취소</button>
            </div>
        </div>
    `;
}

function renderVoidPanel(scene) {
    return `
        <div class="void-checkboxes">
            <label>
                <input type="checkbox" id="void-scene-${scene.id}" ${scene.void_scene ? 'checked' : ''}
                    onchange="updateVoid('${scene.id}', 'void_scene', this.checked)">
                장면 공백 (○)
            </label>
            <label>
                <input type="checkbox" id="void-emotion-${scene.id}" ${scene.void_emotion ? 'checked' : ''}
                    onchange="updateVoid('${scene.id}', 'void_emotion', this.checked)">
                감정 공백 (△)
            </label>
            <label>
                <input type="checkbox" id="void-reason-${scene.id}" ${scene.void_reason ? 'checked' : ''}
                    onchange="updateVoid('${scene.id}', 'void_reason', this.checked)">
                이유 공백 (□)
            </label>
        </div>
    `;
}

function toggleVectorPanel(sceneId) {
    const panel = document.getElementById('vector-panel-' + sceneId);
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function toggleVoidPanel(sceneId) {
    const panel = document.getElementById('void-panel-' + sceneId);
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function editVector(sceneId) {
    document.getElementById('vector-values-' + sceneId).style.display = 'none';
    document.getElementById('vector-edit-' + sceneId).style.display = 'block';
}

function cancelEditVector(sceneId) {
    document.getElementById('vector-edit-' + sceneId).style.display = 'none';
    document.getElementById('vector-values-' + sceneId).style.display = 'block';
}

async function saveVector(sceneId) {
    const emotions = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
    const vector = {};
    
    emotions.forEach(key => {
        const input = document.getElementById('input-' + sceneId + '-' + key);
        vector[key] = parseFloat(input.value) || 0;
    });
    
    const intensity = parseFloat(document.getElementById('input-' + sceneId + '-intensity').value) || 0.5;
    const confidence = parseFloat(document.getElementById('input-' + sceneId + '-confidence').value) || 0.5;
    
    const supabaseClient = getSupabaseClient();
    const { error } = await supabaseClient
        .from('live_scenes')
        .update({
            emotion_vector: vector,
            intensity: intensity,
            confidence: confidence
        })
        .eq('id', sceneId);
    
    if (error) {
        console.error('Save error:', error);
        showToast('저장에 실패했습니다', 'error', { ttl: 0 });
        return;
    }
    
 // UI 업데 트
    emotions.forEach(key => {
        document.getElementById('val-' + sceneId + '-' + key).textContent = vector[key].toFixed(2);
    });
    document.getElementById('val-' + sceneId + '-intensity').textContent = intensity.toFixed(2);
    document.getElementById('val-' + sceneId + '-confidence').textContent = confidence.toFixed(2);
    
    cancelEditVector(sceneId);
    showToast('저장 완료', 'success');
}

async function updateVoid(sceneId, field, value) {
    const supabaseClient = getSupabaseClient();
    const { error } = await supabaseClient
        .from('live_scenes')
        .update({ [field]: value })
        .eq('id', sceneId);
    
    if (error) {
        console.error('Void update error:', error);
    }
}

function closeSessionDetail() {
    document.getElementById('sessionDetailContainer').style.display = 'none';
    document.getElementById('sessionsListSection').style.display = 'block';
}

// global 스코프 function 노출 (onclick 속성 서 위해)
// strataView.js fetchStrataInput이 window.getSupabaseClient를 사용함 (index.js와 동일)
window.getSupabaseClient = getSupabaseClient;
window.checkPassword = checkPassword;
window.adminLogout = adminLogout;
window.logout = logout;
window.addNewMemory = addNewMemory;

// R1-7: sound_map 5칸 UI 제거로 previewSound/stopPreviewSound (admin.js판) 참조 0 → 삭제.
// 씬별 미리듣기는 admin-trajectory.js 의 자체 previewSound(url, volume) 가 담당 (별개 함수).
// 씬의 original_emotion에서 평균 감정벡터를 자동 유도
function autoFillOriginalVector() {
    if (!currentScenes || currentScenes.length === 0) {
        showToast('씬이 없습니다. 먼저 씬을 추가하세요.', 'error');
        return;
    }
    const keys = ['fear','sadness','anger','joy','longing','guilt'];
    const avg = {};
    keys.forEach(k => { avg[k] = 0; });
    let count = 0;
    currentScenes.forEach(s => {
        let emo = s.original_emotion || s.originalVector;
        if (!emo) return;
        if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return; } }
        if (typeof emo !== 'object') return;
        count++;
        keys.forEach(k => {
            avg[k] += Number(emo[k]) || 0;
            // grief→sadness, shame→guilt 매핑
            if (k === 'sadness') avg[k] += Number(emo.grief) || 0;
            if (k === 'guilt') avg[k] += (Number(emo.shame) || 0) * 0.6;
        });
    });
    if (count === 0) {
        showToast('씬에 original_emotion 데이터가 없습니다', 'error');
        return;
    }
    keys.forEach(k => {
        avg[k] = Math.min(1, Math.round((avg[k] / count) * 100) / 100);
        const el = document.getElementById('ov_' + k);
        if (el) el.value = avg[k];
    });
}
window.autoFillOriginalVector = autoFillOriginalVector;
window.editMemory = editMemory;
window.deleteMemory = deleteMemory;
window.deleteSessionById = deleteSessionById;
window.toggleMemoryVisibility = toggleMemoryVisibility;
window.toggleArchiveVisibilityById = toggleArchiveVisibilityById;
window.filterSessions = filterSessions;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedSessions = deleteSelectedSessions;
window.openSessionDetail = openSessionDetail;
window.closeSessionDetail = closeSessionDetail;
window.startOriginalWavePreview = startOriginalWavePreview;
window.switchTab = switchTab;
window.loadUtterances = loadUtterances; // W2-G: 운영 탭 진입 시 인라인 스크립트가 호출
window.addScene = addScene;
window.saveMemory = saveMemory;
window.cancelEdit = cancelEdit;
window.exportMemoriesJSON = exportMemoriesJSON;
window.importMemoriesJSON = importMemoriesJSON;
window.openTrajectoryViewer = function() {
    const id = currentMemoryId || '';
    if (window.switchAdminSection) window.switchAdminSection('canvas');
    if (window.initTrajectoryViewer) window.initTrajectoryViewer(id || null);
};
window.previewMakeChoice = previewMakeChoice;
window.toggleVectorPanel = toggleVectorPanel;
window.toggleVoidPanel = toggleVoidPanel;
window.editVector = editVector;
window.cancelEditVector = cancelEditVector;
window.saveVector = saveVector;
window.updateVoid = updateVoid;
window.moveSceneUp = moveSceneUp;
window.moveSceneDown = moveSceneDown;
window.deleteScene = deleteScene;
window.loadArchiveLayers = loadArchiveLayers;
window.updateSelectedCount = updateSelectedCount;
window.addOriginalEmotion = addOriginalEmotion;
window.removeOriginalEmotion = removeOriginalEmotion;

// contamination 버전 토글 function
function toggleContamination(sceneIndex) {
    const fields = document.getElementById(`contamination-${sceneIndex}`);
    const btn = fields.previousElementSibling;
    if (fields.style.display === 'none') {
        fields.style.display = 'block';
        btn.textContent = '▼ 오염 버전 접기';
    } else {
        fields.style.display = 'none';
        btn.textContent = '▶ 오염 버전 편집';
    }
}

window.toggleContamination = toggleContamination;

// ─── Lumen V1 (작업 12-2) 씬 수준 AF 렌더 ──────────────────
function renderSceneAfPicker(scene, sceneIndex) {
    const arv = scene.originalReasonVector || {};
    const attr = arv.attribution || {};
    const cf = arv.core_fear || {};
    const aNum = (v) => (v != null && !isNaN(v) ? Number(v) : '');
    const attrSum = ['self','other','fate'].reduce((a, k) => a + (parseFloat(attr[k]) || 0), 0);
    const cfSum = ['abandonment','rejection','powerlessness','loss'].reduce((a, k) => a + (parseFloat(cf[k]) || 0), 0);
    const sumColor = (s) => Math.abs(s - 1) < 0.02 ? 'var(--accent-memory)' : (s === 0 ? 'var(--text-muted)' : '#c97a6a');
    const input = (key, group) => `<input type="number" class="editor-input scene-af-input" data-scene-index="${sceneIndex}" data-af-group="${group}" data-af-key="${key}" min="0" max="1" step="0.05" value="${aNum(group === 'attr' ? attr[key] : cf[key])}" style="width:60px;">`;
    return `
            <div class="scene-af-section adv-only" data-scene-index="${sceneIndex}" style="margin-top:1rem;padding:1rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.2);border-radius:4px;">
                <h4 style="margin:0 0 0.4rem 0;font-size:0.9rem;">씬 AF 좌표 (선택)</h4>
                <small style="display:block;color:var(--text-muted);margin-bottom:0.6rem;font-size:0.72rem;">비우면 메모리 수준 AF 상속. 씬별 미세 차이 있을 때만 입력.</small>
                <div style="margin-bottom:0.5rem;">
                    <label style="font-size:0.78rem;color:var(--text-muted);">Attribution · 합 <span class="scene-af-attr-sum" data-scene-index="${sceneIndex}" style="color:${sumColor(attrSum)};">${attrSum.toFixed(2)}</span></label>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">self</span>${input('self','attr')}
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">other</span>${input('other','attr')}
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">fate</span>${input('fate','attr')}
                    </div>
                </div>
                <div>
                    <label style="font-size:0.78rem;color:var(--text-muted);">Core Fear · 합 <span class="scene-af-cf-sum" data-scene-index="${sceneIndex}" style="color:${sumColor(cfSum)};">${cfSum.toFixed(2)}</span></label>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">abandon</span>${input('abandonment','cf')}
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">reject</span>${input('rejection','cf')}
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">power</span>${input('powerlessness','cf')}
                        <span style="font-size:0.75rem;color:#c4a882;align-self:center;">loss</span>${input('loss','cf')}
                    </div>
                </div>
            </div>`;
}

function updateSceneAfSum(sceneIndex) {
    const attrKeys = ['self','other','fate'];
    const cfKeys = ['abandonment','rejection','powerlessness','loss'];
    const readGroup = (group, keys) => keys.reduce((a, k) => {
        const el = document.querySelector(`.scene-af-input[data-scene-index="${sceneIndex}"][data-af-group="${group}"][data-af-key="${k}"]`);
        const v = el ? parseFloat(el.value) : NaN;
        return a + (isNaN(v) ? 0 : v);
    }, 0);
    const aSum = readGroup('attr', attrKeys);
    const cSum = readGroup('cf', cfKeys);
    const aEl = document.querySelector(`.scene-af-attr-sum[data-scene-index="${sceneIndex}"]`);
    const cEl = document.querySelector(`.scene-af-cf-sum[data-scene-index="${sceneIndex}"]`);
    const color = (s) => Math.abs(s - 1) < 0.02 ? 'var(--accent-memory)' : (s === 0 ? 'var(--text-muted)' : '#c97a6a');
    if (aEl) { aEl.textContent = aSum.toFixed(2); aEl.style.color = color(aSum); }
    if (cEl) { cEl.textContent = cSum.toFixed(2); cEl.style.color = color(cSum); }
}

function handleSceneAfInput(e) {
    const el = e.target;
    if (!el.classList.contains('scene-af-input')) return;
    const sceneIndex = parseInt(el.dataset.sceneIndex, 10);
    const group = el.dataset.afGroup;
    const key = el.dataset.afKey;
    const v = parseFloat(el.value);
    if (!currentScenes[sceneIndex]) return;
    if (!currentScenes[sceneIndex].originalReasonVector) {
        currentScenes[sceneIndex].originalReasonVector = { attribution: null, core_fear: null };
    }
    const arv = currentScenes[sceneIndex].originalReasonVector;
    const groupKey = (group === 'attr') ? 'attribution' : 'core_fear';
    if (!arv[groupKey]) arv[groupKey] = {};
    if (isNaN(v) || el.value === '') {
        delete arv[groupKey][key];
        if (Object.keys(arv[groupKey]).length === 0) arv[groupKey] = null;
    } else {
        arv[groupKey][key] = Math.max(0, Math.min(1, v));
    }
    // 비어 있으면 전체 원 상태로
    if (!arv.attribution && !arv.core_fear) {
        currentScenes[sceneIndex].originalReasonVector = null;
    }
    updateSceneAfSum(sceneIndex);
}

// 이벤트 위임 (renderScenes가 다시 렌더해도 리바인딩 안 해도 됨)
document.addEventListener('input', handleSceneAfInput, true);

window.renderSceneAfPicker = renderSceneAfPicker;
window.updateSceneAfSum = updateSceneAfSum;
// Debug: 모듈 스코프 let 변수를 콘솔에서 조회 가능하게
Object.defineProperty(window, 'currentScenes', { configurable: true, get: () => currentScenes });

// ─── Lumen V1 (작업 12-3) 유령 응결점 편집 ──────────────────
const TERRAIN_R = 56;
const VOID_R = 5.6; // 중심 void 반경 (어댑터 기본값 0.1R)
let _ghostPoints = []; // [{x, z, pollution_threshold}]
let _gpSelectedIdx = -1;
let _gpDragIdx = -1;

function _gpSvgToWorld(svgEl, evt) {
    const pt = svgEl.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svgEl.getScreenCTM().inverse();
    const p = pt.matrixTransform(ctm);
    return { x: p.x, z: p.y };
}

function _gpClamp(x, z) {
    const r = Math.sqrt(x * x + z * z);
    if (r <= VOID_R + 1) {
        // void 영역은 금지 → void 경계 바로 밖으로 밀어냄
        const theta = Math.atan2(z, x);
        return { x: (VOID_R + 1) * Math.cos(theta), z: (VOID_R + 1) * Math.sin(theta) };
    }
    if (r > TERRAIN_R - 1) {
        const scale = (TERRAIN_R - 1) / r;
        return { x: x * scale, z: z * scale };
    }
    return { x, z };
}

function renderGhostPoints() {
    const group = document.getElementById('ghostPointsGroup');
    const list = document.getElementById('ghostPointsList');
    const countEl = document.getElementById('ghostPointsCount');
    if (!group || !list) return;
    if (countEl) countEl.textContent = _ghostPoints.length;

    // SVG 점
    group.innerHTML = _ghostPoints.map((p, i) => {
        const selected = (i === _gpSelectedIdx);
        const threshold = p.pollution_threshold != null ? p.pollution_threshold : 0.3;
        const radius = 1.8 + threshold * 2.2; // threshold에 비례한 크기
        const fill = selected ? 'rgba(196,168,130,.95)' : 'rgba(168,140,196,.75)';
        const stroke = selected ? '#f4e0b5' : 'rgba(168,140,196,.95)';
        return `<circle class="gp-dot" data-idx="${i}" cx="${p.x.toFixed(2)}" cy="${p.z.toFixed(2)}" r="${radius.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="0.4" style="cursor:grab;"/>
                <text x="${p.x.toFixed(2)}" y="${(p.z - radius - 1).toFixed(2)}" fill="rgba(196,168,130,.7)" font-size="2.4" text-anchor="middle" pointer-events="none">P${i}</text>`;
    }).join('');

    // 리스트
    list.innerHTML = _ghostPoints.length === 0
        ? '<div style="color:var(--text-muted);font-size:0.78rem;padding:0.6rem;border:1px dashed rgba(196,168,130,.2);border-radius:4px;">아직 응결점 없음. SVG 빈 곳 클릭.</div>'
        : _ghostPoints.map((p, i) => {
            const t = p.pollution_threshold != null ? p.pollution_threshold : 0.3;
            const selected = (i === _gpSelectedIdx);
            return `<div class="gp-row" data-idx="${i}" style="padding:0.5rem;margin-bottom:0.4rem;border:1px solid rgba(196,168,130,${selected ? '.5' : '.15'});border-radius:4px;background:${selected ? 'rgba(196,168,130,.08)' : 'transparent'};cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
                    <span style="color:var(--accent-memory);font-weight:bold;">P${i}</span>
                    <span style="color:var(--text-muted);font-size:0.72rem;">(x=${p.x.toFixed(1)}, z=${p.z.toFixed(1)})</span>
                    <button class="gp-del" data-idx="${i}" style="background:transparent;border:1px solid rgba(201,122,106,.4);color:#c97a6a;padding:2px 7px;border-radius:3px;cursor:pointer;font-size:0.75rem;">✕</button>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.72rem;color:#c4a882;">threshold</span>
                    <input type="range" class="gp-threshold" data-idx="${i}" min="0" max="1" step="0.05" value="${t}" style="flex:1;">
                    <span class="gp-threshold-display" data-idx="${i}" style="font-size:0.75rem;color:var(--accent-memory);min-width:32px;text-align:right;">${t.toFixed(2)}</span>
                </div>
            </div>`;
        }).join('');
}

function renderScenePinsRef() {
    // 씬별 original_reason_vector → AF 좌표 투영 (참조 표시)
    const group = document.getElementById('scenePinsRefGroup');
    if (!group) return;
    const pins = [];
    (currentScenes || []).forEach((s, i) => {
        const arv = s.originalReasonVector || {};
        const attr = arv.attribution || {};
        const cf = arv.core_fear || {};
        // X축: attribution (self=-1, other=0, fate=+1)
        // Z축: core_fear (abandonment=-1, rejection=-0.33, powerlessness=+0.33, loss=+1)
        const axX = -1 * (attr.self || 0) + 0 * (attr.other || 0) + 1 * (attr.fate || 0);
        const axZ = -1 * (cf.abandonment || 0) + (-0.33) * (cf.rejection || 0) + 0.33 * (cf.powerlessness || 0) + 1 * (cf.loss || 0);
        if (axX === 0 && axZ === 0) return; // 원점 = 값 없음, 스킵
        pins.push({ x: axX * TERRAIN_R * 0.7, z: axZ * TERRAIN_R * 0.7, order: i });
    });
    group.innerHTML = pins.map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.z.toFixed(2)}" r="0.8" fill="rgba(196,168,130,.3)" stroke="rgba(196,168,130,.4)" stroke-width="0.2"/>
        <text x="${p.x.toFixed(2)}" y="${(p.z - 1.2).toFixed(2)}" fill="rgba(196,168,130,.4)" font-size="1.6" text-anchor="middle">S${p.order}</text>`).join('');
}

function _bindGhostPointsHandlers() {
    const svg = document.getElementById('ghostPointsSvg');
    const list = document.getElementById('ghostPointsList');
    if (!svg || !list) return;

    svg.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target.classList && target.classList.contains('gp-dot')) {
            _gpDragIdx = parseInt(target.dataset.idx, 10);
            _gpSelectedIdx = _gpDragIdx;
            target.style.cursor = 'grabbing';
            renderGhostPoints();
            e.preventDefault();
            return;
        }
        // 빈 공간 클릭: 새 점 추가
        const { x, z } = _gpSvgToWorld(svg, e);
        const clamped = _gpClamp(x, z);
        _ghostPoints.push({ x: +clamped.x.toFixed(2), z: +clamped.z.toFixed(2), pollution_threshold: 0.3 });
        _gpSelectedIdx = _ghostPoints.length - 1;
        renderGhostPoints();
    });

    window.addEventListener('mousemove', (e) => {
        if (_gpDragIdx < 0) return;
        const { x, z } = _gpSvgToWorld(svg, e);
        const clamped = _gpClamp(x, z);
        _ghostPoints[_gpDragIdx].x = +clamped.x.toFixed(2);
        _ghostPoints[_gpDragIdx].z = +clamped.z.toFixed(2);
        renderGhostPoints();
    });

    window.addEventListener('mouseup', () => {
        if (_gpDragIdx >= 0) _gpDragIdx = -1;
    });

    list.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.gp-del');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.idx, 10);
            _ghostPoints.splice(idx, 1);
            if (_gpSelectedIdx === idx) _gpSelectedIdx = -1;
            else if (_gpSelectedIdx > idx) _gpSelectedIdx -= 1;
            renderGhostPoints();
            return;
        }
        const row = e.target.closest('.gp-row');
        if (row) {
            _gpSelectedIdx = parseInt(row.dataset.idx, 10);
            renderGhostPoints();
        }
    });

    list.addEventListener('input', (e) => {
        if (!e.target.classList.contains('gp-threshold')) return;
        const idx = parseInt(e.target.dataset.idx, 10);
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && _ghostPoints[idx]) {
            _ghostPoints[idx].pollution_threshold = v;
            const disp = document.querySelector(`.gp-threshold-display[data-idx="${idx}"]`);
            if (disp) disp.textContent = v.toFixed(2);
            // SVG 점 크기만 업데이트 (전체 리렌더 피함)
            const dot = document.querySelector(`.gp-dot[data-idx="${idx}"]`);
            if (dot) dot.setAttribute('r', (1.8 + v * 2.2).toFixed(2));
        }
    });
}

function loadGhostPoints(memory) {
    const pts = memory && memory.ghost_condensation_points;
    if (Array.isArray(pts)) {
        _ghostPoints = pts.map(p => ({
            x: Number(p.x) || 0,
            z: Number(p.z) || 0,
            pollution_threshold: p.pollution_threshold != null ? Number(p.pollution_threshold) : 0.3
        }));
    } else {
        _ghostPoints = [];
    }
    _gpSelectedIdx = -1;
    renderGhostPoints();
    renderScenePinsRef();
}

function getGhostPointsForSave() {
    return _ghostPoints.map(p => ({
        x: Number(p.x.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        pollution_threshold: Number((p.pollution_threshold != null ? p.pollution_threshold : 0.3).toFixed(2))
    }));
}

// 바인딩 (DOMContentLoaded 대응)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindGhostPointsHandlers);
} else {
    _bindGhostPointsHandlers();
}

window.renderGhostPoints = renderGhostPoints;
window.renderScenePinsRef = renderScenePinsRef;
window.loadGhostPoints = loadGhostPoints;
window.getGhostPointsForSave = getGhostPointsForSave;
Object.defineProperty(window, '_ghostPoints', { configurable: true, get: () => _ghostPoints });

// ─── Lumen V1 (작업 12-1) AF / 오염 초기 상태 헬퍼 ──────────────────
function _afSum(prefix, keys) {
    return keys.reduce((acc, k) => {
        const v = parseFloat(document.getElementById(prefix + k)?.value);
        return acc + (isNaN(v) ? 0 : v);
    }, 0);
}

function updateAfSums() {
    const aSum = _afSum('ar_attr_', ['self','other','fate']);
    const cSum = _afSum('ar_cf_', ['abandonment','rejection','powerlessness','loss']);
    const aEl = document.getElementById('arAttribSum');
    const cEl = document.getElementById('arCoreFearSum');
    if (aEl) { aEl.textContent = aSum.toFixed(2); aEl.style.color = Math.abs(aSum - 1) < 0.02 ? 'var(--accent-memory)' : '#c97a6a'; }
    if (cEl) { cEl.textContent = cSum.toFixed(2); cEl.style.color = Math.abs(cSum - 1) < 0.02 ? 'var(--accent-memory)' : '#c97a6a'; }
}

function updateContStageSum() {
    const s1 = parseFloat(document.getElementById('cont_stage_1_input')?.value) || 0;
    const s2 = parseFloat(document.getElementById('cont_stage_2_input')?.value) || 0;
    const s3 = parseFloat(document.getElementById('cont_stage_3_input')?.value) || 0;
    const sum = s1 + s2 + s3;
    const el = document.getElementById('contStageSum');
    if (el) { el.textContent = sum.toFixed(2); el.style.color = Math.abs(sum - 1) < 0.02 ? 'var(--accent-memory)' : '#c97a6a'; }
}

function normalizeAttribution() {
    _normalizeGroup(['ar_attr_self','ar_attr_other','ar_attr_fate']);
    updateAfSums();
}

function normalizeCoreFear() {
    _normalizeGroup(['ar_cf_abandonment','ar_cf_rejection','ar_cf_powerlessness','ar_cf_loss']);
    updateAfSums();
}

function normalizeContStage() {
    _normalizeGroup(['cont_stage_1_input','cont_stage_2_input','cont_stage_3_input']);
    updateContStageSum();
}

function _normalizeGroup(ids) {
    const vals = ids.map(id => {
        const v = parseFloat(document.getElementById(id)?.value);
        return isNaN(v) ? 0 : Math.max(0, v);
    });
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) return;
    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.value = (vals[i] / sum).toFixed(2);
    });
}

// AF/cont_stage input 이벤트 바인딩
function _bindLumenFormListeners() {
    document.querySelectorAll('.af-attr, .af-cf').forEach(el => {
        el.addEventListener('input', updateAfSums);
    });
    document.querySelectorAll('.cont-stage').forEach(el => {
        el.addEventListener('input', updateContStageSum);
    });
    updateAfSums();
    updateContStageSum();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindLumenFormListeners);
} else {
    _bindLumenFormListeners();
}

window.updateAfSums = updateAfSums;
window.updateContStageSum = updateContStageSum;
window.normalizeAttribution = normalizeAttribution;
window.normalizeCoreFear = normalizeCoreFear;
window.normalizeContStage = normalizeContStage;

let adminStrataFullscreenBound = false;

function exitAdminStrataFullscreen() {
    const container = document.getElementById('adminStrataContainer');
    const btnEnter = document.getElementById('strataFullscreenBtn');
    const btnBack = document.getElementById('strataFullscreenBackBtn');
    const strataView = document.getElementById('strataView');
    if (!container) return;
    container.classList.remove('admin-strata-fullscreen');
    document.body.classList.remove('admin-strata-fs-active');
    const strataLoaded = strataView && strataView.style.display !== 'none';
    if (btnEnter) btnEnter.hidden = !strataLoaded;
    if (btnBack) btnBack.hidden = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (window.Strata && window.Strata.resizeToCanvas) window.Strata.resizeToCanvas();
        });
    });
}

function enterAdminStrataFullscreen() {
    const container = document.getElementById('adminStrataContainer');
    const btnEnter = document.getElementById('strataFullscreenBtn');
    const btnBack = document.getElementById('strataFullscreenBackBtn');
    const strataView = document.getElementById('strataView');
    if (!container || !strataView || strataView.style.display === 'none') return;
    if (container.classList.contains('admin-strata-fullscreen')) return;
    container.classList.add('admin-strata-fullscreen');
    document.body.classList.add('admin-strata-fs-active');
    if (btnEnter) btnEnter.hidden = true;
    if (btnBack) btnBack.hidden = false;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (window.Strata && window.Strata.resizeToCanvas) window.Strata.resizeToCanvas();
        });
    });
}

function ensureAdminStrataFullscreenBindings() {
    if (adminStrataFullscreenBound) return;
    adminStrataFullscreenBound = true;
    const container = document.getElementById('adminStrataContainer');
    const btnEnter = document.getElementById('strataFullscreenBtn');
    const btnBack = document.getElementById('strataFullscreenBackBtn');
    const strataView = document.getElementById('strataView');
    if (!container || !btnEnter || !btnBack) return;

    btnEnter.addEventListener('click', (e) => {
        e.stopPropagation();
        enterAdminStrataFullscreen();
    });
    btnBack.addEventListener('click', (e) => {
        e.stopPropagation();
        exitAdminStrataFullscreen();
    });

    container.addEventListener('dblclick', (e) => {
        if (!strataView || strataView.style.display === 'none') return;
        if (e.target.closest && (e.target.closest('.admin-strata-fs-enter') || e.target.closest('.admin-strata-fs-back'))) return;
        enterAdminStrataFullscreen();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const c = document.getElementById('adminStrataContainer');
        if (c && c.classList.contains('admin-strata-fullscreen')) {
            exitAdminStrataFullscreen();
            e.preventDefault();
        }
    });
}

// Strata 3D strata 미리보기 load
async function loadStrataPreview(memoryId) {
 // memoryId 없으면 currentMemoryId 
    if (!memoryId) {
        memoryId = currentMemoryId;
    }
    
    if (!memoryId) {
        console.warn('[loadStrataPreview] memoryId가 not found.');
        showToast('메모리를 먼저 선택해주세요', 'info');
        return;
    }

    console.log('[Admin] Strata 미리보기 로드 시작:', memoryId);

    exitAdminStrataFullscreen();
    const btnFs = document.getElementById('strataFullscreenBtn');
    if (btnFs) btnFs.hidden = true;

    try {
        const loadingEl = document.getElementById('strataLoading');
        if (loadingEl) loadingEl.textContent = 'Supabase 연결 중...';
        const sb = await waitForSupabaseClient(15000);
        if (!sb) {
            throw new Error('Supabase 클라이언트를 준비할 수 없습니다. 페이지를 새로고침하세요.');
        }
        if (loadingEl) loadingEl.textContent = 'Strata 데이터를 로드하는 중...';

 // window.showStrataView 
        if (window.showStrataView) {
 // alignmentResult calculate하지 않고 null 전달
            await window.showStrataView(memoryId, null, () => {
                console.log('[Admin] Strata 미리보기 닫힘');
                exitAdminStrataFullscreen();
                const strataView = document.getElementById('strataView');
                if (strataView) {
                    strataView.style.display = 'none';
                }
                const b1 = document.getElementById('strataFullscreenBtn');
                const b2 = document.getElementById('strataFullscreenBackBtn');
                if (b1) b1.hidden = true;
                if (b2) b2.hidden = true;
                if (loadingEl) {
                    loadingEl.style.display = 'flex';
                    loadingEl.textContent = '버튼을 클릭하여 Strata 미리보기 불러오기';
                }
            });

            const strataView = document.getElementById('strataView');
            if (strataView) {
                strataView.style.display = 'block';
                strataView.style.position = 'relative';
                strataView.style.width = '100%';
                strataView.style.height = '100%';
                strataView.style.background = '#0a0a0f';
            }
            if (loadingEl) loadingEl.style.display = 'none';

            ensureAdminStrataFullscreenBindings();
            if (btnFs) btnFs.hidden = false;

            // First-person walk button (admin only)
            const btnFp = document.getElementById('strataFirstPersonBtn');
            if (btnFp) {
                btnFp.hidden = false;
                btnFp.onclick = function () {
                    const rt = window.TemAfStrataTerrain?._lastRuntime;
                    if (!rt) return;
                    if (rt.isFirstPerson()) {
                        rt.exitFirstPerson();
                        btnFp.textContent = '1인칭 걷기';
                    } else {
                        // Enter fullscreen then first-person
                        enterAdminStrataFullscreen();
                        // requestPointerLock requires user gesture — call synchronously
                        rt.enterFirstPerson();
                        btnFp.textContent = 'ESC로 나가기';
                    }
                };
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (window.Strata && window.Strata.resizeToCanvas) window.Strata.resizeToCanvas();
                });
            });

        } else {
            throw new Error('Strata 뷰를 사용할 수 not found. strataView.js가 로드되었는지 확인하세요.');
        }

    } catch (error) {
        console.error('[Admin] Strata 미리보기 로드 오류:', error);
        const loadingEl = document.getElementById('strataLoading');
        const btnFsErr = document.getElementById('strataFullscreenBtn');
        if (btnFsErr) btnFsErr.hidden = true;
        if (loadingEl) {
            loadingEl.style.display = 'flex';
            loadingEl.textContent = '로드 실패: ' + error.message;
        }
        showToast('Strata 미리보기 로드 실패: ' + error.message, 'error', { ttl: 0 });
    }
}

window.loadStrataPreview = loadStrataPreview;

// 미리보기 탭에서 등고선 핀맵 불러오기 (play-test.html 동일 렌더링)
window.loadArchive2DPreview = async function () {
    const T = window.TemAfStrataTerrain;
    if (!T) {
        console.error('[loadArchive2DPreview] TemAfStrataTerrain not loaded');
        return;
    }
    if (!currentMemoryId) {
        console.warn('[loadArchive2DPreview] 메모리를 먼저 저장해주세요.');
        return;
    }

    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) return;

    // plays 로드
    let plays = [];
    try {
        const { data } = await supabaseClient.from('plays').select('*').eq('memory_id', currentMemoryId).order('created_at', { ascending: true });
        plays = data || [];
    } catch (e) { console.warn('[loadArchive2DPreview] plays 로드 실패:', e); }

    // terrain 필드 생성 (TemAfStrataTerrain 사용)
    const memRow = { id: currentMemoryId, title: document.getElementById('memoryTitle')?.value || '' };
    const playsByMem = {}; playsByMem[currentMemoryId] = plays;
    // Load scenes for terrain bedrock
    let sceneRows = currentScenes || [];
    if (!sceneRows.length) {
        try {
            const { data } = await supabaseClient.from('scenes').select('*').eq('memory_id', currentMemoryId).order('scene_order');
            sceneRows = data || [];
        } catch (_) {}
    }
    const scenesByMem = {}; scenesByMem[currentMemoryId] = sceneRows;
    const P = T.buildMemoryItems([memRow], playsByMem, scenesByMem);
    const field = T.computeAfTerrainFields(P, null);
    const total = field.G * field.G;
    const agg = {
        heights: field.hts,
        colors: field.cls,
        min: field.minH,
        max: field.maxH,
        gridG: field.G,
    };

    renderContourMapPreview(agg, currentScenes, plays);
};

// ─── Anchor Images Manager ──────────────────────────────────────

window.saveAnchorImage = async function () {
    const keyword = document.getElementById('anchorKeyword')?.value.trim();
    const imageType = document.getElementById('anchorType')?.value || 'text';
    const content = document.getElementById('anchorContent')?.value || '';
    const vivMin = imageType === 'photo' ? 0.7 : imageType === 'ascii' ? 0.3 : 0.0;
    const vivMax = imageType === 'photo' ? 1.0 : imageType === 'ascii' ? 0.7 : 0.3;
    const fileInput = document.getElementById('anchorPhotoFile');

    if (!keyword) { showToast('키워드를 입력하세요', 'error'); return; }

    const client = getSupabaseClient();
    if (!client) { showToast('Supabase 연결이 없습니다', 'error', { ttl: 0 }); return; }

    let storagePath = null;

    // Upload photo to Supabase Storage if photo type
    if (imageType === 'photo' && fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        const ext = file.name.split('.').pop();
        const path = `anchors/${Date.now()}_${keyword.replace(/\s+/g, '_')}.${ext}`;

        const { error: uploadErr } = await client.storage
            .from('anchor-images')
            .upload(path, file, { upsert: true });

        if (uploadErr) {
            showToast('업로드 실패: ' + uploadErr.message, 'error', { ttl: 0 });
            return;
        }

        const { data: urlData } = client.storage.from('anchor-images').getPublicUrl(path);
        storagePath = urlData?.publicUrl || path;
    }

    const row = {
        keyword,
        image_type: imageType,
        content: imageType !== 'photo' ? content : null,
        storage_path: storagePath,
        vividness_min: vivMin,
        vividness_max: vivMax,
    };

    const { error } = await client.from('anchor_images').insert(row);
    if (error) {
        showToast('저장 실패: ' + error.message, 'error', { ttl: 0 });
    } else {
        // Clear form
        document.getElementById('anchorKeyword').value = '';
        document.getElementById('anchorContent').value = '';
        if (fileInput) fileInput.value = '';
        loadAnchorImages();
    }
};

window.loadAnchorImages = async function () {
    const client = getSupabaseClient();
    if (!client) return;

    const listEl = document.getElementById('anchorImagesList');
    if (!listEl) return;

    listEl.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">Loading...</p>';

    const { data, error } = await client
        .from('anchor_images')
        .select('*')
        .order('created_at', { ascending: false });

    if (error || !data) {
        listEl.innerHTML = '<p style="color:var(--text-muted);">Failed to load.</p>';
        return;
    }

    if (data.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No anchor images yet.</p>';
        return;
    }

    listEl.innerHTML = data.map(a => {
        const preview = a.image_type === 'photo' && a.storage_path
            ? `<img src="${a.storage_path}" style="max-width:60px;max-height:40px;object-fit:cover;border-radius:2px;margin-right:8px;vertical-align:middle;">`
            : a.image_type === 'ascii' && a.content
                ? `<pre style="display:inline;font-size:7px;line-height:1;margin-right:8px;vertical-align:middle;">${a.content.substring(0, 80)}</pre>`
                : '';
        return `<div style="padding:0.6rem;margin-bottom:0.4rem;background:var(--bg-deep);border:1px solid rgba(196,168,130,.1);display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;">
                ${preview}
                <span style="font-size:0.9rem;color:var(--text-primary);">${a.keyword}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">${a.image_type} · ${a.vividness_min}~${a.vividness_max}</span>
            </div>
            <button onclick="deleteAnchorImage('${a.id}')" style="background:none;border:1px solid rgba(200,80,80,.3);color:rgba(200,80,80,.7);font-size:0.75rem;padding:2px 8px;cursor:pointer;">×</button>
        </div>`;
    }).join('');
};

window.deleteAnchorImage = async function (id) {
    if (!confirm('Delete this anchor image?')) return;
    const client = getSupabaseClient();
    if (!client) return;

    await client.from('anchor_images').delete().eq('id', id);
    loadAnchorImages();
};

// Auto-load on dashboard init
setTimeout(() => {
    if (document.getElementById('anchorImagesList')) loadAnchorImages();
}, 2000);

// ─── Seed Data: 박소정 기억 + 50 play 시뮬레이션 ──────────────────
window.seedParkSojungMemory = async function () {
    const client = await getSupabaseClient();
    if (!client) { console.error('[Seed] No Supabase client'); return; }

    const TITLE = '당신에게';
    const SENTENCE = '당신입니까? 지금 내 배 안에 있는 게 당신입니까? 아니면 엄마입니까?';

    // ── 1. Insert memory ──
    console.log('[Seed] Creating memory...');
    const { data: mem, error: memErr } = await client.from('memories').insert({
        title: TITLE,
        code: Array.from({length:5}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*31)]).join(''),
        completed_sentence: SENTENCE,
        sensory_anchor: '짜사이의 오독거리는 식감, 차가운 대리석 바닥, 욕조 물의 차가움',
        body_response: ['구토', '소름', '손발톱이 퍼렇게 뜸', '배를 가리는 반사'],
        self_questions: ['당신입니까?', '엄마입니까?', '핏줄이 아닌 사랑은 차선인가?'],
        status: 'Fetus',
        original_vector: {
            fear: 0.25, guilt: 0.22, longing: 0.20, sadness: 0.15,
            love: 0.08, numbness: 0.05, shame: 0.03, confusion: 0.02,
        },
        original_reason_vector: {
            is_void: false,
            attribution: 'fate_blame',
            target: 'self_and_mother',
            core_fear: 'abandonment',
        },
        lang: 'ko',
        // contamination: heavy erosion to match jacket-level terrain
        cont_drift: 0.55,
        cont_fixation: 0.48,
        cont_depth: 85,
        cont_stage: 'hypercompletion',
        cont_stage_1: 0.30,
        cont_stage_2: 0.40,
        cont_stage_3: 0.30,
        cont_last_mismatch: 'attribution_mismatch',
        dilution: 5,
        drift_dir_v: -0.4,
        drift_dir_a: 0.3,
        drift_dir_d: -0.5,
        cont_divergence: 0.42,
        cont_convergence: 0.20,
        cont_heterogeneity: 0.45,
    }).select('id').single();

    if (memErr) { console.error('[Seed] Memory insert failed:', memErr); return; }
    const memoryId = mem.id;
    console.log('[Seed] Memory created:', memoryId);

    // ── 2. Insert scenes (7 core + 3 residual) ──
    const SCENES = [
        // === Core scenes ===
        {
            scene_order: 1,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '엄마에게 투정을 부리거나 매달리는 엄마의 모습이 그랬어. 무뚝뚝한 나는 그런 식으로 엄마에게 달라붙어본 적이 없었는데, 그게 핏줄이 아니어서인가, 하는 쓸모없는 결론에 다다르곤 했어.',
            text_stage_1: '엄마에게 투정을 부리는 엄마의 모습이 그랬어. 무뚝뚝한 나는 그런 식으로 달라붙어본 적이 없었는데, 그게 핏줄이 아니어서인가, 하는 결론에 미끄러지곤 했어. 결론은 늘 같은 자리에서 기다리고 있었어.',
            text_stage_2: '엄마에게 매달리는 모습. 나는 한 번도. 핏줄이 아니어서? 아니, 핏줄이라는 단어가 입 안에서 녹지 않고 남아 있어. 삼킬 수도 뱉을 수도 없는 것.',
            text_stage_3: '투정. 매달림. 핏줄. 결론. 모든 단어가 같은 뜻이었다는 것을 지금에서야.',
            original_emotion: { shame: 0.35, isolation: 0.25, longing: 0.20, sadness: 0.15, confusion: 0.05 },
            anchor_emotions: ['shame', 'isolation', 'longing'],
            echo_words: ['핏줄', '무뚝뚝', '달라붙다'],
            void_info: null,
            meta: {
                dialog_choices: {
                    ghost_intro: '엄마에게 투정을 부리거나 매달리는 엄마의 모습이 그랬어... 무뚝뚝한 나는 그런 식으로 달라붙어본 적이 없었는데.',
                    choices: [
                        {
                            label: '엄마는 왜 그랬을까?',
                            type: 'causal',
                            ghost_reply: '...글쎄. 늘 그랬으니까. 다른 모습은 본 적이 없었어.',
                            free_dialog_open: '너는... 너의 엄마는 어땠어?',
                        },
                        {
                            label: '그 모습이 어떻게 보였어?',
                            type: 'sensory',
                            ghost_reply: '...낯설었어. 같은 사람이 둘로 갈라진 것처럼.',
                            free_dialog_open: '너도 그런 거리감을 본 적 있어?',
                        },
                        {
                            label: '너는 왜 거리를 뒀어?',
                            type: 'self',
                            ghost_reply: '...무뚝뚝하다고 했지만, 사실은 어떻게 다가가야 할지 몰랐던 것 같아.',
                            free_dialog_open: '너도 그렇게 거리를 둔 적 있었어?',
                        },
                    ],
                },
            },
        },
        {
            scene_order: 2,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '처음 임신했을 때 엄마에게 말하지 않기로 했어. 불임인 엄마, 산부인과는 밥먹듯이 갔을 엄마를 생각하면, 대학에 떨어진 친구에게 합격 소식을 전하는 것 같았어.',
            text_stage_1: '처음 임신했을 때 말하지 않기로 했어. 불임인 엄마를 생각하면, 합격 소식을 전하는 것 같았어. 못생긴 친구에게 축의금을 받는 것 같았어. 그 비유들이 연속으로 스쳤고, 하나도 정확하지 않았어.',
            text_stage_2: '말하지 않기로. 이유는 선명했는데 말로 하면 잔인해지니까. 합격. 축의금. 취직. 전부 남의 말처럼 나열됐어. 내 입에서 나온 말인데.',
            text_stage_3: '말하지 않았어. 이유를 나열할수록 이유가 아닌 것들만 남았어.',
            original_emotion: { guilt: 0.40, fear: 0.20, shame: 0.15, love: 0.10, sadness: 0.15 },
            anchor_emotions: ['guilt', 'fear', 'shame'],
            echo_words: ['불임', '합격', '축의금', '숨기다'],
            void_info: null,
        },
        {
            scene_order: 3,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '"이거 알지, 네가 제일 좋아하는 거." 나는 고개를 끄덕였지만 동시에 조금 이상하다고 느꼈어. 짜사이는 늘 중국집에서만 먹던 음식이었고, 엄마는 집에서 그런 반찬을 만드는 사람이 아니었어.',
            text_stage_1: '"네가 제일 좋아하는 거." 고개를 끄덕였지만 이상했어. 짜사이는 중국집에서만 먹던 것이었고, 엄마의 밥상에는 정해진 것들만 올라왔어. "어릴 땐 이런 거 좋아했어." 어릴 적 기억 속에 짜사이는 없었어.',
            text_stage_2: '짜사이. 내가 좋아한 적 없는 것을 엄마는 확신했어. "그래도 좋아했을 거야." 추측이 아니라 확신이었어. 누구의 기억이지.',
            text_stage_3: '오독오독. 엄마가 기억하는 나는 내가 아니었어.',
            original_emotion: { confusion: 0.30, fear: 0.25, longing: 0.15, love: 0.15, sadness: 0.15 },
            anchor_emotions: ['confusion', 'fear', 'longing'],
            echo_words: ['짜사이', '오독오독', '좋아했을 거야'],
            void_info: null,
        },
        {
            scene_order: 4,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '한 달 뒤, 엄마는 트럭에 치여 죽었어.',
            text_stage_1: '한 달 뒤, 엄마는 트럭에 치여 죽었어. 네 명이 죽고 열두 명이 부상당했어. 안개가 가득 낀 서해안고속도로에서.',
            text_stage_2: '한 달. 트럭. 네 명. 열두 명. 안개. 숫자들만 남았어.',
            text_stage_3: '죽었어.',
            original_emotion: { numbness: 0.35, guilt: 0.30, sadness: 0.20, fear: 0.10, shame: 0.05 },
            anchor_emotions: ['numbness', 'guilt', 'sadness'],
            echo_words: ['트럭', '안개', '한 달'],
            void_info: null,
        },
        {
            scene_order: 5,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '영안실에서 엄마의 발가락을 만졌을 때, 엄지발가락의 굳은살과 뒤꿈치의 갈라진 틈이 손에 박혔어. 만져본 적 없는 촉감을 눈을 감고 느껴봐.',
            text_stage_1: '엄마의 발가락을 만졌을 때, 굳은살과 갈라진 틈이 손에 박혔어. 어린 발이 떠올랐어. 만져본 적 없는 촉감을 눈을 감고 느껴봐. 둥실둥실.',
            text_stage_2: '굳은살. 갈라진 틈. 어린 발. 만져본 적 없는. 있었을 거야. 부드러웠을 거야.',
            text_stage_3: '발가락. 둥실둥실. 천 위로 그려지다가 흐려졌어.',
            original_emotion: { sadness: 0.35, longing: 0.25, love: 0.15, numbness: 0.15, guilt: 0.10 },
            anchor_emotions: ['sadness', 'longing', 'love'],
            echo_words: ['발가락', '둥실둥실', '촉감'],
            void_info: null,
        },
        {
            scene_order: 6,
            scene_type: 'normal',
            scene_role: 'anchor',
            text: '현관문을 열어놓고 대리석 바닥에 드러누웠어. 소리가 들렸어. 당신임을 알았어. 미안했어요. 미안했어요. 그 말밖에 나오지 않았어.',
            text_stage_1: '현관문을 열어놓고 드러누웠어. 발을 끄는 소리인지 바람인지 구분이 되지 않았지만 당신임을 알았어. 미안했어요. 구체적으로 말하면 더 진짜가 되어버릴 것 같아서.',
            text_stage_2: '대리석. 서늘함. 소리. 당신. 미안했어요. 반복할수록 의미가 닳아 없어졌어.',
            text_stage_3: '미안했어요. 미안했어요. 미안했어요.',
            original_emotion: { guilt: 0.35, longing: 0.25, sadness: 0.20, love: 0.10, fear: 0.10 },
            anchor_emotions: ['guilt', 'longing', 'sadness'],
            echo_words: ['현관문', '미안', '소리'],
            void_info: null,
        },
        {
            scene_order: 7,
            scene_type: 'ending',
            scene_role: 'anchor',
            text: '샤워기를 급하게 켜봐. 반도 채워지지 않은 찬물에 몸을 던져. 차갑다. 돌아와. 당신이 양막 안에서 몸을 웅크리고 있어.',
            text_stage_1: '찬물에 몸을 던져. 차갑다. 솜털을 적시는 것이 전부 느껴져. 돌아와. 당신이 양막 안에서 웅크리고 있어. 머리는 어느 때보다도 뚜렷했어.',
            text_stage_2: '찬물. 차갑다. 솜털. 양막. 웅크림. 뚜렷함. 모든 감각이 필요 이상으로 생생했어.',
            text_stage_3: '"조금 더 품고 있으면 살아나지 않을까요?" "아니오."',
            original_emotion: { fear: 0.30, longing: 0.25, love: 0.15, numbness: 0.15, sadness: 0.15 },
            anchor_emotions: ['fear', 'longing', 'love'],
            echo_words: ['찬물', '양막', '돌아와', '차갑다'],
            void_info: null,
        },
        // === Residual (bridge) scenes ===
        {
            scene_order: 8,
            scene_type: 'branch',
            scene_role: 'residual',
            text: '"다시 태어나도 다시 똑같이 널 사랑할게." 꿈에서 들었던 엄마의 목소리. 안 된다고, 그것만은 안 된다고 소리치려 하는데 입이 안 열려.',
            text_stage_1: '"다시 태어나도 다시 똑같이 널 사랑할게." 꿈에서. 안 된다고. 입이 안 열려. 전화가 꺼지고.',
            original_emotion: { fear: 0.40, love: 0.20, longing: 0.15, guilt: 0.15, confusion: 0.10 },
            anchor_emotions: ['fear', 'love'],
            echo_words: ['다시 태어나도', '전화', '입이 열리지'],
            void_info: null,
        },
        {
            scene_order: 9,
            scene_type: 'branch',
            scene_role: 'residual',
            text: '짜사이가 밥상에 올라와. 식감이 엄마가 해준 것과 달라. "갑자기 먹고 싶길래." 엄마가 이 집안 어딘가에 돌아와 있다는 것을 알아채.',
            text_stage_1: '짜사이. 식감이 달라. 남편이 사 온 것. 엄마가 돌아와 있다는 것을 알아채.',
            original_emotion: { confusion: 0.30, longing: 0.25, fear: 0.20, love: 0.15, hope: 0.10 },
            anchor_emotions: ['confusion', 'longing', 'fear'],
            echo_words: ['짜사이', '식감', '돌아와'],
            void_info: null,
        },
        {
            scene_order: 10,
            scene_type: 'branch',
            scene_role: 'residual',
            text: '껌껌한 어둠으로 채워진 현관문을 봤어. 누군가 복도에 서 있어. 그게 당신임을 느껴. 현관에 발을 디디는 순간 바람이 불어와 문을 쳐닫아.',
            text_stage_1: '어둠. 현관문. 누군가. 당신. 발을 디디는 순간 바람이 문을 쳐닫아.',
            original_emotion: { fear: 0.35, longing: 0.30, numbness: 0.15, love: 0.10, confusion: 0.10 },
            anchor_emotions: ['fear', 'longing'],
            echo_words: ['현관문', '복도', '바람'],
            void_info: { sceneVoid: true, voidLevel: 'high', voidType: 'absence' },
        },
    ];

    console.log('[Seed] Inserting', SCENES.length, 'scenes...');
    const scenesToInsert = SCENES.map(s => ({
        memory_id: memoryId,
        scene_order: s.scene_order,
        scene_type: s.scene_type,
        scene_role: s.scene_role || null,
        text: s.text,
        text_stage_1: s.text_stage_1 || null,
        text_stage_2: s.text_stage_2 || null,
        text_stage_3: s.text_stage_3 || null,
        original_emotion: s.original_emotion,
        anchor_emotions: s.anchor_emotions,
        echo_words: s.echo_words,
        void_info: s.void_info,
    }));

    const { data: insertedScenes, error: scErr } = await client
        .from('scenes').insert(scenesToInsert).select('id, scene_order');
    if (scErr) { console.error('[Seed] Scenes insert failed:', scErr); return; }
    console.log('[Seed] Scenes created:', insertedScenes.length);

    // Map scene_order → scene id
    const sceneIdByOrder = {};
    insertedScenes.forEach(s => { sceneIdByOrder[s.scene_order] = s.id; });

    // ── 3. Persona-based play simulation ──
    console.log('[Seed] Generating persona-based plays...');

    function normalize(v) {
        let t = 0; for (const k in v) t += v[k];
        if (t > 0) for (const k in v) v[k] = Math.round((v[k] / t) * 100) / 100;
        return v;
    }
    function jitter(base, amt) {
        const v = {};
        for (const k in base) {
            const val = base[k] + (Math.random() - 0.5) * amt;
            if (val > 0.02) v[k] = Math.max(0, Math.min(1, val));
        }
        return normalize(v);
    }

    // 15 personas × high visit counts → ~350 plays, wide alignment spread
    const PERSONAS = [
        { name: '유산 경험자', scenes: [2,5,7,3,6,1],
          lens: { guilt: 0.30, fear: 0.25, longing: 0.20, sadness: 0.15, love: 0.10 },
          alignRange: [0.65, 0.94], drift: 0.15, mismatch: null, reason: 'memory', visits: 6 },
        { name: '입양인 (30대)', scenes: [1,3,9,8,2,6],
          lens: { shame: 0.25, anger: 0.20, isolation: 0.20, longing: 0.15, resentment: 0.10, sadness: 0.10 },
          alignRange: [0.20, 0.55], drift: 0.35, mismatch: 'emotion_mismatch', reason: 'projection', visits: 5 },
        { name: '사별한 딸', scenes: [4,5,6,8,10,1,3],
          lens: { sadness: 0.35, numbness: 0.20, longing: 0.20, guilt: 0.15, love: 0.10 },
          alignRange: [0.45, 0.92], drift: 0.22, mismatch: 'attribution_mismatch', reason: 'empathy', visits: 7 },
        { name: '임산부 (첫째)', scenes: [7,2,3,9,5,10],
          lens: { fear: 0.45, confusion: 0.15, love: 0.15, hope: 0.10, guilt: 0.15 },
          alignRange: [0.08, 0.45], drift: 0.40, mismatch: 'emotion_mismatch', reason: 'instinct', visits: 4 },
        { name: '불임 치료 중인 여성', scenes: [2,7,8,5,9,1,4],
          lens: { longing: 0.30, guilt: 0.20, sadness: 0.20, hope: 0.10, resignation: 0.10, shame: 0.10 },
          alignRange: [0.12, 0.50], drift: 0.38, mismatch: 'attribution_mismatch', reason: 'projection', visits: 6 },
        { name: '해리 경험자', scenes: [10,7,4,6,1,3,8],
          lens: { numbness: 0.40, fear: 0.15, isolation: 0.15, confusion: 0.15, resignation: 0.15 },
          alignRange: [0.04, 0.30], drift: 0.45, mismatch: 'void_mismatch', reason: 'void', visits: 5 },
        { name: '영적 탐구자', scenes: [8,9,10,5,3,6,7],
          lens: { peace: 0.25, hope: 0.20, love: 0.20, longing: 0.15, confusion: 0.10, gratitude: 0.10 },
          alignRange: [0.10, 0.40], drift: 0.42, mismatch: 'emotion_mismatch', reason: 'empathy', visits: 4 },
        { name: '분석적 관찰자', scenes: [1,2,4,7,3,5,9],
          lens: { confusion: 0.30, sadness: 0.15, peace: 0.15, resignation: 0.15, guilt: 0.10, fear: 0.15 },
          alignRange: [0.25, 0.55], drift: 0.25, mismatch: 'target_displacement', reason: 'empathy', visits: 3 },
        { name: '유사 가족역학 경험자', scenes: [1,6,3,4,5,9,7,2],
          lens: { guilt: 0.25, longing: 0.20, love: 0.15, shame: 0.15, fear: 0.15, sadness: 0.10 },
          alignRange: [0.55, 0.90], drift: 0.18, mismatch: 'attribution_mismatch', reason: 'memory', visits: 7 },
        { name: '20대 초반 학생', scenes: [3,7,9,10,1,5],
          lens: { confusion: 0.30, fear: 0.20, sadness: 0.15, longing: 0.15, hope: 0.10, isolation: 0.10 },
          alignRange: [0.15, 0.45], drift: 0.35, mismatch: 'emotion_mismatch', reason: 'instinct', visits: 3 },
        { name: '상실 치유 중 (사별 2년차)', scenes: [5,6,4,8,9,7,1,2],
          lens: { sadness: 0.20, hope: 0.20, longing: 0.15, relief: 0.15, love: 0.15, peace: 0.15 },
          alignRange: [0.35, 0.75], drift: 0.25, mismatch: 'attribution_mismatch', reason: 'memory', visits: 5 },
        { name: '남편/파트너 시점', scenes: [6,4,7,2,9,3,10],
          lens: { guilt: 0.20, fear: 0.20, love: 0.20, sadness: 0.15, confusion: 0.10, resignation: 0.15 },
          alignRange: [0.15, 0.50], drift: 0.30, mismatch: 'target_displacement', reason: 'projection', visits: 5 },
        { name: '공감각자', scenes: [3,7,5,9,10,6],
          lens: { fear: 0.20, longing: 0.20, love: 0.15, confusion: 0.15, sadness: 0.15, joy: 0.05, numbness: 0.10 },
          alignRange: [0.40, 0.80], drift: 0.28, mismatch: 'emotion_mismatch', reason: 'instinct', visits: 4 },
        { name: '분노 투사자', scenes: [1,2,4,6,8,3,7],
          lens: { anger: 0.30, resentment: 0.25, guilt: 0.10, sadness: 0.10, shame: 0.10, fear: 0.15 },
          alignRange: [0.04, 0.25], drift: 0.48, mismatch: 'emotion_mismatch', reason: 'projection', visits: 5 },
        { name: '체화 명상 수련자', scenes: [5,7,3,10,6,1,8],
          lens: { peace: 0.20, numbness: 0.15, sadness: 0.15, love: 0.15, relief: 0.15, longing: 0.10, fear: 0.10 },
          alignRange: [0.30, 0.65], drift: 0.22, mismatch: null, reason: 'empathy', visits: 3 },
    ];

    const plays = [];
    let dayCounter = 0;

    PERSONAS.forEach((p, pi) => {
        for (let visit = 0; visit < p.visits; visit++) {
            const visitDayBase = dayCounter;
            dayCounter += 1 + Math.floor(Math.random() * 2);
            // Play most scenes each visit (4~all)
            const minScenes = Math.min(4, p.scenes.length);
            const numScenes = minScenes + Math.floor(Math.random() * (p.scenes.length - minScenes + 1));
            const scenesToPlay = p.scenes.slice(0, numScenes);

            scenesToPlay.forEach((scOrder, si) => {
                const sceneId = sceneIdByOrder[scOrder];
                if (!sceneId) return;
                const sceneOrig = SCENES[scOrder - 1].original_emotion;

                // Blend persona lens with scene's original emotion
                const blended = {};
                for (const k in sceneOrig) blended[k] = (sceneOrig[k] || 0) * 0.35;
                for (const k in p.lens) blended[k] = (blended[k] || 0) + p.lens[k] * 0.65;
                const userEmotion = jitter(blended, p.drift + visit * 0.06);

                // Alignment: wider range + per-visit decay + scene noise
                const visitDecay = visit * 0.05;
                const sceneNoise = (Math.random() - 0.5) * 0.20;
                const al = Math.max(0.05, Math.min(0.95,
                    p.alignRange[0] + (p.alignRange[1] - p.alignRange[0]) * Math.random() - visitDecay + sceneNoise));

                // Mismatch: frequent, especially on revisits
                let mm = null;
                if (p.mismatch && Math.random() < 0.4 + visit * 0.12) {
                    mm = p.mismatch;
                }
                // 20% chance of secondary mismatch type for variety
                if (!mm && Math.random() < 0.20) {
                    mm = ['attribution_mismatch', 'target_displacement', 'void_mismatch'][Math.floor(Math.random() * 3)];
                }

                const created = new Date(Date.now() - (90 - visitDayBase - si * 0.3) * 86400000 + Math.random() * 43200000);

                plays.push({
                    memory_id: memoryId,
                    scene_id: sceneId,
                    user_emotion: userEmotion,
                    user_reason: mm === 'void_mismatch' ? 'void' : p.reason,
                    alignment: Math.round(al * 1000) / 1000,
                    mismatch_type: mm,
                    wave_data: null,
                    layer_id: 0,
                    created_at: created.toISOString(),
                });
            });
        }
    });

    plays.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Insert in batches
    for (let b = 0; b < plays.length; b += 25) {
        const batch = plays.slice(b, b + 25);
        const { error: plErr } = await client.from('plays').insert(batch);
        if (plErr) { console.error('[Seed] Plays batch insert failed:', plErr); return; }
    }
    console.log('[Seed]', plays.length, 'plays inserted from', PERSONAS.length, 'personas');

    // ── 4. Summary ──
    console.log('═══════════════════════════════════════');
    console.log('[Seed] ✓ Complete!');
    console.log('  Memory ID:', memoryId);
    console.log('  Title:', TITLE);
    console.log('  Scenes: 7 core + 3 residual (1 void)');
    console.log('  Personas:', PERSONAS.length);
    console.log('  Total plays:', plays.length);
    PERSONAS.forEach(p => {
        const ct = plays.filter(pl => {
            const blended = {}; for (const k in p.lens) blended[k] = p.lens[k];
            return true;
        }).length;
        console.log('    ' + p.name + ': ' + p.visits + ' visit(s), scenes ' + p.scenes.join(','));
    });
    console.log('');
    console.log('  To play: play-test.html?memory=' + memoryId);
    console.log('═══════════════════════════════════════');
    return memoryId;
};

// ─── Nuke a memory + all related data, then re-seed ──────────
window.nukeThenReseed = async function (memoryId) {
    if (!memoryId) { console.error('[Nuke] memoryId required'); return; }
    // R1-7 (2026-07-14): confirm 2단 가드 — 기억+플레이 기록 전체 삭제라 오타 한 번에 실기억이 날아감
    if (!confirm(`[Nuke] memory ${memoryId} 의 plays/scenes/memory 를 전부 삭제하고 재시드합니다. 계속할까요?`)) {
        console.warn('[Nuke] 취소됨 (1단)'); return;
    }
    if (!confirm('[Nuke] 마지막 확인 — 이 작업은 되돌릴 수 없습니다. 정말 삭제할까요?')) {
        console.warn('[Nuke] 취소됨 (2단)'); return;
    }
    const client = await getSupabaseClient();
    if (!client) { console.error('[Nuke] No Supabase client'); return; }

    console.log('[Nuke] Deleting plays, scenes, memory for', memoryId, '...');
    await client.from('plays').delete().eq('memory_id', memoryId);
    await client.from('scenes').delete().eq('memory_id', memoryId);
    await client.from('memories').delete().eq('id', memoryId);
    console.log('[Nuke] Deleted. Re-seeding...');
    return await seedParkSojungMemory();
};
