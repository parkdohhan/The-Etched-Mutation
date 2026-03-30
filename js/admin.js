import { getSupabaseClient, waitForSupabaseClient } from './lib/supabaseClient.js';
import { loadAdminMemories, saveAdminMemories, exportAdminMemoriesJSON, importAdminMemoriesJSON } from './lib/storage.js';
import { listMemoriesWithScenesChoices, saveMemoryGraph, deleteMemoryGraph, listArchiveLayers } from './lib/repo.js';
import { DEFAULT_EMOTION_ANCHORS, emotionVectorToWaveStyle, cosineSimilarity } from './shared/math.js';

let memories = [];
let currentScenes = [];
let currentMemoryIndex = null;
let currentMemoryId = null;
let previewCurrentScene = 0;
let previewWaveAnimationId = null;
let currentLayers = []; // Archive 레이어 추적
let adminUser = null; // 현재 인증된 관리자
let previewAudio = null; // 사운드 미리듣기용
const sceneWaveAnimationMap = new Map(); // sceneIndex -> requestAnimationFrame id

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
        alert('기억 불러오기 오류가 발생했습니다: ' + error.message);
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
    document.getElementById('memoryTitle').value = '';
    document.getElementById('memoryCode').value = '';
    document.getElementById('memoryDescription').value = '';
    document.getElementById('memoryWords').value = '';
    document.getElementById('completedSentence').value = '';
    document.getElementById('authorNote').value = '';
    document.getElementById('memoryStatus').value = 'Fetus';
    document.getElementById('soundMapOpening').value = '';
    document.getElementById('soundMapHigh').value = '';
    document.getElementById('soundMapMid').value = '';
    document.getElementById('soundMapLow').value = '';
    document.getElementById('soundMapFixated').value = '';
    document.getElementById('scenesContainer').innerHTML = '';
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
}

// memory edit
function editMemory(index) {
    currentMemoryIndex = index;
    const memory = memories[index];
    currentMemoryId = memory.id || null;
    currentLayers = []; // 메모리 편집 시작 시 레이어 초기화
    document.getElementById('memoryTitle').value = memory.title || '';
    document.getElementById('memoryCode').value = memory.code || '';
    document.getElementById('memoryDescription').value = memory.description || '';
    document.getElementById('memoryWords').value = memory.memory_words || '';
    document.getElementById('completedSentence').value = memory.completed_sentence || '';
    document.getElementById('authorNote').value = memory.author_note || '';
    document.getElementById('memoryStatus').value = memory.status || 'Fetus';
 // sound mapping load
    var soundMap = memory.sound_map || {};
    document.getElementById('soundMapOpening').value = soundMap.opening || '';
    document.getElementById('soundMapHigh').value = soundMap.HIGH || '';
    document.getElementById('soundMapMid').value = soundMap.MID || '';
    document.getElementById('soundMapLow').value = soundMap.LOW || '';
    document.getElementById('soundMapFixated').value = soundMap.FIXATED || '';
    currentScenes = memory.scenes ? JSON.parse(JSON.stringify(memory.scenes)) : [];
    renderScenes();
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
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
        alert('가시성 변경 중 오류가 발생했습니다: ' + error.message);
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
        
        alert('기억이 삭제되었습니다.');
    } catch (error) {
        console.error('deleteMemory error:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    }
}

// scene add
function addScene() {
        currentScenes.push({
        text: '',
        sceneType: 'normal',
        echoWords: [],
        originalReason: '',
        originalEmotion: null,
        originalReasonVector: null,
        anchor_emotions: null,
        voidInfo: null
    });
    renderScenes();
}

// scene 렌더링
function renderScenes() {
    const container = document.getElementById('scenesContainer');
    container.innerHTML = '';

    currentScenes.forEach((scene, sceneIndex) => {
        const sceneBlock = document.createElement('div');
        sceneBlock.className = 'scene-block';
        sceneBlock.innerHTML = `
            <div class="scene-header">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div class="scene-number">장면 ${sceneIndex + 1}</div>
                    <select class="editor-input scene-type-select" data-scene-index="${sceneIndex}" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.9rem;">
                        <option value="normal" ${(scene.sceneType || 'normal') === 'normal' ? 'selected' : ''}>일반</option>
                        <option value="branch" ${scene.sceneType === 'branch' ? 'selected' : ''}>분기</option>
                        <option value="ending" ${scene.sceneType === 'ending' ? 'selected' : ''}>엔딩</option>
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
                        <label class="editor-label">Stage 3 (소거: 0.9~1.0)</label>
                        <div class="contamination-stage-3-controls">
                            <select class="stage3-style-select editor-input" data-scene-index="${sceneIndex}">
                                <option value="Glitch">Glitch</option>
                                <option value="Redact">Redact</option>
                                <option value="Dissolve">Dissolve</option>
                            </select>
                            <button type="button" class="contamination-regen-btn" onclick="generateStage3(${sceneIndex})">생성</button>
                        </div>
                        <textarea class="editor-textarea scene-text-stage-3" data-scene-index="${sceneIndex}" rows="3" placeholder="거의 소거된 상태...">${scene.text_stage_3 || ''}</textarea>
                    </div>
                </div>
            </div>
            <div class="editor-input-group">
                <label class="editor-label">잔향 단어</label>
                <input type="text" class="editor-input scene-echo-words-input" data-scene-index="${sceneIndex}" placeholder="무서웠어, 미안해, 후회했어 (콤마로 구분)" value="${(scene.echoWords || []).join(', ')}">
            </div>
            <div class="editor-input-group scene-original-fields" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'};">
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
            <div class="editor-section" style="margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
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
            </div>
            <div class="editor-section scene-original-fields" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'}; margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
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
        `;
        container.appendChild(sceneBlock);
    });

    attachSceneListeners();

    currentScenes.forEach((scene, sceneIndex) => {
        if (scene && scene.wavePreviewEnabled) {
            startOriginalWavePreview(sceneIndex, true);
        } else {
            clearSceneWaveCanvas(sceneIndex);
        }
    });
}

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
        alert('17개 감정이 모두 추가되었습니다.');
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
    } else if (tab === 'preview') {
        document.querySelectorAll('.editor-tab')[1].classList.add('active');
        document.getElementById('previewContent').classList.add('active');
        // 2D/3D 미리보기는 사용자가 해당 버튼을 클릭했을 때만 로드
    }
}

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
        alert('엔딩에 도달했습니다.');
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

// Archive wave 렌더링 function
function renderArchive(layers) {
    const canvas = document.getElementById('archiveCanvas');
    if (!canvas) {
        console.warn('[renderArchive] archiveCanvas를 not found.');
        return;
    }

    const ctx = canvas.getContext('2d');
    
 // canvas 크기 조정 (반응형)
    const container = canvas.parentElement;
    if (container) {
        const maxWidth = Math.min(1000, container.offsetWidth - 32);
        canvas.width = maxWidth;
        canvas.height = Math.floor(maxWidth * 0.6); // 5:3 비율
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

 // background
    ctx.fillStyle = 'rgba(18, 18, 26, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!layers || layers.length === 0) {
        ctx.fillStyle = 'var(--text-muted)';
        ctx.font = '16px "Noto Serif KR"';
        ctx.textAlign = 'center';
        ctx.fillText('Archive 레이어가 not found.', canvas.width / 2, canvas.height / 2);
        return;
    }

 // 각 layer 렌더링
    layers.forEach((layer, index) => {
        if (!layer.wave_data || !layer.wave_data.wavePoints) {
            console.warn(`[renderArchive] 레이어 ${index}에 wave_data가 not found.`);
            return;
        }

        const { wave_data } = layer;
        const { wavePoints, color } = wave_data;

 // 각 layer 조금씩 아래 오프셋
        const layerSpacing = canvas.height / (layers.length + 1);
        const yOffset = (index + 1) * layerSpacing;
        const centerY = canvas.height / 2;

 // VOID Level high 면 blur filter 적용
        if (layer.void_info && layer.void_info.voidLevel === 'high') {
            ctx.filter = 'blur(1.5px)';
        } else {
            ctx.filter = 'none';
        }

        ctx.beginPath();
        ctx.strokeStyle = color || 'rgba(196, 168, 130, 0.6)';
        ctx.lineWidth = 1.5;

 // wavePoints canvas 크기 맞게 스케일링
        const maxX = Math.max(...wavePoints.map(p => p.x), 1);
        const scaleX = canvas.width / maxX;
        const scaleY = (canvas.height / 4) / 100; // y 좌표 정규화

        wavePoints.forEach((p, i) => {
            const x = p.x * scaleX;
            const y = centerY + (p.y * scaleY) + (yOffset - centerY) / layers.length;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    });

 // filter 리셋
    ctx.filter = 'none';

    console.log('[renderArchive] Archive 렌더링 완료', { layersCount: layers.length });
}

// memory save
async function saveMemory() {
    const title = document.getElementById('memoryTitle').value.trim();
    const code = document.getElementById('memoryCode').value.trim();
    const description = document.getElementById('memoryDescription').value.trim();
    const memoryWords = document.getElementById('memoryWords').value.trim();
    const completedSentence = document.getElementById('completedSentence').value.trim();
    const authorNote = document.getElementById('authorNote').value.trim();
 // sound mapping 수집
    var soundMap = {};
    var smOpening = document.getElementById('soundMapOpening')?.value?.trim();
    var smHigh = document.getElementById('soundMapHigh')?.value?.trim();
    var smMid = document.getElementById('soundMapMid')?.value?.trim();
    var smLow = document.getElementById('soundMapLow')?.value?.trim();
    var smFixated = document.getElementById('soundMapFixated')?.value?.trim();
    if (smOpening) soundMap.opening = smOpening;
    if (smHigh) soundMap.HIGH = smHigh;
    if (smMid) soundMap.MID = smMid;
    if (smLow) soundMap.LOW = smLow;
    if (smFixated) soundMap.FIXATED = smFixated;

    if (!title || !code) {
        alert('제목과 코드를 입력해주세요');
        return;
    }

    if (currentScenes.length === 0) {
        alert('최소 하나의 장면을 추가해주세요');
        return;
    }

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
            sound_map: Object.keys(soundMap).length > 0 ? soundMap : null,
            memory_words: memoryWords || null,
            completed_sentence: completedSentence || null,
            author_note: authorNote || null,
            status: status,
            scenes: scenesWithWaveData,
            memoryWaveData: memoryWaveData
        });
        
        console.log('=== Admin 에디터 개선 ===');
        console.log('author_note:', authorNote);
        
        console.log('[saveMemory] saveMemoryGraph 완료', { finalMemoryId });
        memoryId = finalMemoryId;

 // local memory 업데 트
        const prevVisibility = currentMemoryIndex !== null
            ? (memories[currentMemoryIndex]?.is_public ?? memories[currentMemoryIndex]?.visible ?? true)
            : true;
        const memoryData = {
            id: memoryId,
            title,
            code,
            description,
            memory_words: memoryWords || null,
            completed_sentence: completedSentence || null,
            scenes: currentScenes,
            interpretationLayers: 0,
            is_public: prevVisibility,
            visible: prevVisibility
        };

        if (currentMemoryIndex !== null) {
            memories[currentMemoryIndex] = memoryData;
        } else {
            memories.push(memoryData);
        }

        saveMemoriesToStorage(); // 백업용
        renderMemoriesTable();
        
 // JSON 다운load
        exportMemoriesJSON();
        
        console.log('[saveMemory] 전체 저장 완료');
        
        cancelEdit();
    } catch (error) {
        console.error('[saveMemory] 전체 Error occurred', error);
        console.error('[saveMemory] 에러 상세:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            stack: error.stack
        });
        alert('저장 중 오류가 발생했습니다: ' + (error.message || error.toString()) + '\n\n콘솔을 확인해주세요.');
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
        alert('저장된 기억이 없습니다. 먼저 기억을 추가해주세요.');
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
        alert('클립보드에 복사됨. data/memories.js의 memoriesData 배열에 붙여넣으세요');
    } catch (err) {
 // 클립보드 copy failure 시 fallback
        console.error('클립보드 복사 실패:', err);
        alert('memories-export.json 파일이 다운로드되었습니다. (클립보드 복사 실패)');
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
                alert('올바른 JSON 형식이 아닙니다. 배열 형식이어야 합니다.');
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
            alert('JSON 파일이 성공적으로 불러와졌습니다.');
        } catch (error) {
            alert('JSON 파일을 읽는 중 오류가 발생했습니다: ' + error.message);
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
                alert('먼저 메모리를 저장해주세요.');
                return;
            }

            const supabaseClient = getSupabaseClient();
            if (!supabaseClient) {
                alert('Supabase 클라이언트가 초기화되지 않았습니다.');
                return;
            }

            const scene = currentScenes[previewCurrentScene];
            if (!scene) {
                alert('장면을 찾을 수 없습니다.');
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
                    alert('레이어 저장 중 오류가 발생했습니다: ' + playsError.message);
                    return;
                }

 // layer add
                currentLayers.push({
                    layerId: currentLayers.length,
                    waveData: waveData,
                    createdAt: new Date()
                });

                console.log('[simulateLayer] 레이어 저장 성공', { layerId: currentLayers.length - 1 });

                alert('새 지층 레이어 저장 완료');
                renderWavePreview();
                
            } catch (error) {
                console.error('[simulateLayer] 예외 발생', error);
                alert('레이어 저장 중 오류가 발생했습니다: ' + error.message);
            }
        });
    }
});

// 통합 session manage function들
let allSessions = [];
let currentFilter = 'all';
const fateLabels={'preserve':'보존','dilute':'자연 소멸','anonymous':'완전 익명'};
const fateColors={'preserve':'#7a9a7a','dilute':'#c4a882','anonymous':'#7b8fa8'};

async function loadAllSessions() {
    allSessions = [];
    
 // archive session load (existing memories)
    const supabaseClient = getSupabaseClient();
    const { data: archiveData } = await supabaseClient
        .from('memories')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (archiveData) {
        archiveData.forEach(m => {
            allSessions.push({
                ...m,
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

    // ── Accessibility table ──
    const patternColors = {
        echo_follow: '#8888cc', bridge: '#7a9a7a', displacement: '#c4a048',
        contradiction: '#c46a6a', avoidance: '#888', fixation: '#aa88cc',
    };

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
                    const pats = accessMatrix[fi][ti];
                    if (pats.size === 0) {
                        return `<td style="padding:4px;text-align:center;border-bottom:1px solid rgba(196,168,130,0.07);"><span style="color:rgba(196,168,130,0.2);">✗</span></td>`;
                    }
                    const dots = [...pats].map(p => `<span title="${p}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${patternColors[p] || '#888'};margin:1px;"></span>`).join('');
                    return `<td style="padding:4px;text-align:center;border-bottom:1px solid rgba(196,168,130,0.07);">${dots}</td>`;
                }).join('')}
            </tr>`).join('')}
        </tbody>
    </table>
    </div>
    <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.75rem;">
        ${Object.entries(patternColors).map(([p, c]) => `<span style="font-size:0.72rem;color:var(--text-muted);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle;"></span>${p}</span>`).join('')}
        <span style="font-size:0.72rem;color:var(--text-muted);">avoidance/fixation은 항상 fallback (void 제외)</span>
    </div>`;

    el.innerHTML = html;
};

function renderSessions() {
    const filtered = currentFilter === 'all' 
        ? allSessions 
        : allSessions.filter(s => s.type === currentFilter);
    
    const container = document.getElementById('sessionsListContainer');
    if (!container) return;
    
    if (!filtered || filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">세션이 not found.</p>';
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
            ${isArchive ? `<button class="session-delete-btn" onclick="event.stopPropagation(); toggleArchiveVisibilityById('${session.id}')" style="padding: 0.5rem 0.85rem; background: transparent; color: var(--accent-memory); border: 1px solid var(--accent-memory); border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">${visibilityBtnLabel}</button>` : ''}
            <button class="session-delete-btn" onclick="event.stopPropagation(); deleteSessionById('${session.id}', '${session.type}')" style="padding: 0.5rem 1rem; background: var(--accent-live); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 0.5rem;">삭제</button>
        </div>
    `;
    }).join('');
    updateSelectedCount();
}

async function toggleArchiveVisibilityById(memoryId) {
    const target = allSessions.find(s => s.type === 'archive' && String(s.id) === String(memoryId));
    if (!target) {
        alert('대상 기억을 찾지 못했습니다.');
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
        alert('공개 상태 변경 중 오류가 발생했습니다: ' + error.message);
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
    if (!confirm(`${type === 'archive' ? '아카이브' : '라이브 세션'}을 삭제하시겠습니까?\n관련된 장면 데이터도 함께 삭제됩니다.`)) {
        return;
    }
    
    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }
        
        if (type === 'archive') {
            await deleteMemoryGraph(supabaseClient, id);
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
        
        alert(`${type === 'archive' ? '아카이브' : '라이브 세션'}이 삭제되었습니다`);
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
    } catch (e) {
        console.error('Delete error:', e);
        alert('삭제 중 오류가 발생했습니다: ' + e.message);
    }
}

async function deleteSelectedSessions() {
    const checkboxes = document.querySelectorAll('.session-checkbox:checked');
    const liveSessions = Array.from(checkboxes).filter(cb => cb.dataset.type === 'live').map(cb => cb.dataset.id);
    const archiveSessions = Array.from(checkboxes).filter(cb => cb.dataset.type === 'archive').map(cb => cb.dataset.id);
    
    if (liveSessions.length === 0 && archiveSessions.length === 0) {
        alert('삭제할 세션을 선택하세요');
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
        
        alert(successMessage);
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
    } catch (e) {
        console.error('Delete error:', e);
        alert('삭제 중 오류가 발생했습니다: ' + e.message);
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
        alert('저장에 실패했습니다');
        return;
    }
    
 // UI 업데 트
    emotions.forEach(key => {
        document.getElementById('val-' + sceneId + '-' + key).textContent = vector[key].toFixed(2);
    });
    document.getElementById('val-' + sceneId + '-intensity').textContent = intensity.toFixed(2);
    document.getElementById('val-' + sceneId + '-confidence').textContent = confidence.toFixed(2);
    
    cancelEditVector(sceneId);
    alert('저장 완료');
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

// sound 미리듣기 function
function previewSound(inputId) {
    stopPreviewSound();
    var input = document.getElementById(inputId);
    if (!input || !input.value.trim()) {
        alert('URL을 입력하세요');
        return;
    }
    previewAudio = new Audio(input.value.trim());
    previewAudio.volume = 0.4;
    previewAudio.loop = true;
    previewAudio.play().catch(function(e) { alert('재생 실패: ' + e.message); });
}

function stopPreviewSound() {
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
        previewAudio = null;
    }
}

window.previewSound = previewSound;
window.stopPreviewSound = stopPreviewSound;
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
window.addScene = addScene;
window.saveMemory = saveMemory;
window.cancelEdit = cancelEdit;
window.exportMemoriesJSON = exportMemoriesJSON;
window.importMemoriesJSON = importMemoriesJSON;
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
        alert('메모리를 먼저 선택해주세요.');
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
        alert('Strata 미리보기 로드 실패: ' + error.message);
    }
}

window.loadStrataPreview = loadStrataPreview;

// 미리보기 탭에서 currentMemoryId를 쓰기 위한 래퍼 (모듈 스코프라 HTML에서 직접 참조 불가)
window.loadArchive2DPreview = function () {
    loadArchiveLayers(currentMemoryId);
};
