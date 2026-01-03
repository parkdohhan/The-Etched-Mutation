import { getSupabaseClient } from './lib/supabaseClient.js';
import { ADMIN_PASSWORD } from './lib/config.js';
import { loadAdminMemories, saveAdminMemories, exportAdminMemoriesJSON, importAdminMemoriesJSON } from './lib/storage.js';
import { listMemoriesWithScenesChoices, saveMemoryGraph, deleteMemoryGraph, listArchiveLayers } from './lib/repo.js';

let memories = [];
let currentScenes = [];
let currentMemoryIndex = null;
let currentMemoryId = null;
let previewCurrentScene = 0;
let previewWaveAnimationId = null;
let currentLayers = []; // Archive 레이어 추적

// 비밀번호 확인
function checkPassword() {
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');
    
    if (input.value === ADMIN_PASSWORD) {
        document.getElementById('passwordScreen').style.display = 'none';
        document.getElementById('adminDashboard').classList.add('active');
        loadMemories();
        loadAllSessions();
    } else {
        error.classList.add('visible');
        input.value = '';
        setTimeout(() => {
            error.classList.remove('visible');
        }, 3000);
    }
}

// Enter 키로 비밀번호 확인
document.getElementById('passwordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
});

// 로그아웃
function logout() {
    if (confirm('로그아웃하시겠습니까?')) {
        document.getElementById('adminDashboard').classList.remove('active');
        document.getElementById('editorScreen').classList.remove('active');
        document.getElementById('passwordScreen').style.display = 'flex';
        document.getElementById('passwordInput').value = '';
        currentMemoryIndex = null;
        currentScenes = [];
    }
}

// 기억 목록 로드
async function loadMemories() {
    try {
        // Supabase에서 불러오기
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }
        
        const memoriesData = await listMemoriesWithScenesChoices(supabaseClient);

        if (memoriesData && memoriesData.length > 0) {
            memories = memoriesData;
            // 백업용으로 localStorage에도 저장
            saveMemoriesToStorage();
        } else {
            // Supabase에 데이터가 없으면 localStorage에서 불러오기 (마이그레이션)
            const stored = loadAdminMemories();
            if (stored && stored.length > 0) {
                memories = stored;
            } else {
                memories = [];
            }
        }
    } catch (error) {
        console.error('loadMemories error:', error);
        alert('기억을 불러오는 중 오류가 발생했습니다: ' + error.message);
        // 에러 발생 시 localStorage에서 불러오기
        const stored = loadAdminMemories();
        if (stored && stored.length > 0) {
            memories = stored;
        } else {
            memories = [];
        }
    }
    renderMemoriesTable();
}

// 기억 목록 테이블 렌더링
function renderMemoriesTable() {
    const tbody = document.getElementById('memoriesTableBody');
    if (!tbody) return; // 통합 목록으로 대체됨
    tbody.innerHTML = '';

    if (memories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">등록된 기억이 없습니다</td></tr>';
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

// 새 기억 추가
function addNewMemory() {
    currentMemoryIndex = null;
    currentMemoryId = null;
    currentLayers = []; // 새 메모리 생성 시 레이어 초기화
    currentScenes = [];
    document.getElementById('memoryTitle').value = '';
    document.getElementById('memoryCode').value = '';
    document.getElementById('memoryDescription').value = '';
    document.getElementById('scenesContainer').innerHTML = '';
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
}

// 기억 수정
function editMemory(index) {
    currentMemoryIndex = index;
    const memory = memories[index];
    currentMemoryId = memory.id || null;
    currentLayers = []; // 메모리 편집 시작 시 레이어 초기화
    document.getElementById('memoryTitle').value = memory.title || '';
    document.getElementById('memoryCode').value = memory.code || '';
    document.getElementById('memoryDescription').value = memory.description || '';
    currentScenes = memory.scenes ? JSON.parse(JSON.stringify(memory.scenes)) : [];
    renderScenes();
    document.getElementById('adminDashboard').classList.remove('active');
    document.getElementById('editorScreen').classList.add('active');
    switchTab('edit');
}

// 기억 가시성 토글
        async function toggleMemoryVisibility(index) {
            const memory = memories[index];
            const newVisibility = !memory.visible;
            
            try {
                const supabaseClient = await getSupabaseClient();
                if (!supabaseClient) {
                    throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
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

// 기억 삭제
async function deleteMemory(index) {
    const memory = memories[index];
    
    if (!confirm(`"${memory.title || memory.code}" 기억을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }
        
        if (memory.id) {
            await deleteMemoryGraph(supabaseClient, memory.id);
        }
        
        // 로컬 배열에서 제거
        memories.splice(index, 1);
        saveMemoriesToStorage(); // 백업용
        
        // 목록 갱신
        await loadMemories(); // memories 배열 최신화
        await loadAllSessions(); // 통합 목록 갱신
        
        alert('기억이 삭제되었습니다.');
    } catch (error) {
        console.error('deleteMemory error:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    }
}

// 장면 추가
function addScene() {
        currentScenes.push({
        text: '',
        sceneType: 'normal',
        echoWords: [],
        choices: [],
        originalChoice: 0,
        originalReason: '',
        originalEmotion: null,
        voidInfo: null
    });
    renderScenes();
}

// 장면 렌더링
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
            <div class="editor-input-group">
                <label class="editor-label">잔향 단어</label>
                <input type="text" class="editor-input scene-echo-words-input" data-scene-index="${sceneIndex}" placeholder="무서웠어, 미안해, 후회했어 (콤마로 구분)" value="${(scene.echoWords || []).join(', ')}">
            </div>
            <div class="editor-input-group scene-original-fields" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'};">
                <label class="editor-label">원본 선택</label>
                <select class="editor-input scene-original-choice-select" data-scene-index="${sceneIndex}">
                    ${renderOriginalChoiceOptions(scene.choices || [], scene.originalChoice || 0)}
                </select>
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
            <div class="editor-section scene-original-fields" data-scene-index="${sceneIndex}" style="display: ${(scene.sceneType === 'branch' || scene.sceneType === 'ending') ? 'block' : 'none'}; margin-top: 1.5rem; padding: 1.5rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .2); border-radius: 4px;">
                <h3 class="editor-section-title" style="margin-bottom: 1rem;">원본 감정/이유 (정렬도 비교용)</h3>
                <div class="editor-input-group" style="margin-bottom: 1.5rem;">
                    <label class="editor-label">원본 감정</label>
                    <div class="original-emotion-list" data-scene-index="${sceneIndex}">
                        ${renderOriginalEmotions(scene.originalEmotion || {}, sceneIndex)}
                    </div>
                    <button class="add-emotion-btn" onclick="addOriginalEmotion(${sceneIndex})" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: var(--accent-memory); color: var(--bg-deep); border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">+ 감정 추가</button>
                </div>
            </div>
            <div class="editor-input-group">
                <label class="editor-label">선택지</label>
                <div class="choices-list" data-scene-index="${sceneIndex}">
                    ${renderChoices(scene.choices || [], sceneIndex)}
                </div>
                <button class="add-choice-btn" onclick="addChoice(${sceneIndex})">+ 선택지 추가</button>
            </div>
        `;
        container.appendChild(sceneBlock);
    });

    // 이벤트 리스너 연결
    attachSceneListeners();
}

// 선택지 렌더링
function renderChoices(choices, sceneIndex) {
    if (!choices || choices.length === 0) {
        return '<div style="color:var(--text-muted);padding:1rem;text-align:center;">선택지가 없습니다</div>';
    }

    return choices.map((choice, choiceIndex) => `
        <div class="choice-item">
            <div class="choice-controls">
                <input type="text" class="choice-text-input" data-scene-index="${sceneIndex}" data-choice-index="${choiceIndex}" placeholder="선택지 텍스트" value="${choice.text || ''}">
                <select class="choice-emotion-select" data-scene-index="${sceneIndex}" data-choice-index="${choiceIndex}">
                    <option value="fear" ${choice.emotion === 'fear' ? 'selected' : ''}>공포</option>
                    <option value="sadness" ${choice.emotion === 'sadness' ? 'selected' : ''}>슬픔</option>
                    <option value="guilt" ${choice.emotion === 'guilt' ? 'selected' : ''}>죄책감</option>
                    <option value="anger" ${choice.emotion === 'anger' ? 'selected' : ''}>분노</option>
                    <option value="longing" ${choice.emotion === 'longing' ? 'selected' : ''}>그리움</option>
                    <option value="isolation" ${choice.emotion === 'isolation' ? 'selected' : ''}>고립감</option>
                    <option value="numbness" ${choice.emotion === 'numbness' ? 'selected' : ''}>무감각</option>
                    <option value="moralPain" ${choice.emotion === 'moralPain' ? 'selected' : ''}>도덕적 고통</option>
                </select>
                <div class="choice-intensity-container">
                    <input type="range" class="choice-intensity-slider" data-scene-index="${sceneIndex}" data-choice-index="${choiceIndex}" min="1" max="10" value="${choice.intensity || 5}">
                    <span class="choice-intensity-value">${choice.intensity || 5}</span>
                </div>
                <select class="choice-next-scene-select" data-scene-index="${sceneIndex}" data-choice-index="${choiceIndex}">
                    ${renderNextSceneOptions(sceneIndex, choice.nextScene)}
                </select>
                <button class="choice-delete-btn" onclick="deleteChoice(${sceneIndex}, ${choiceIndex})">삭제</button>
            </div>
        </div>
    `).join('');
}

// 원본 선택 옵션 렌더링
function renderOriginalChoiceOptions(choices, selectedValue) {
    if (!choices || choices.length === 0) {
        return '<option value="0">선택지 없음</option>';
    }
    return choices.map((choice, index) => 
        `<option value="${index}" ${selectedValue === index ? 'selected' : ''}>선택지 ${index + 1}: ${choice.text || '(텍스트 없음)'}</option>`
    ).join('');
}

// 원본 감정 렌더링
function renderOriginalEmotions(originalEmotion, sceneIndex) {
    if (!originalEmotion || Object.keys(originalEmotion).length === 0) {
        return '<div style="color: var(--text-muted); padding: 1rem; text-align: center;">감정이 없습니다</div>';
    }
    
    const emotionLabels = {
        fear: '공포',
        sadness: '슬픔',
        guilt: '죄책감',
        anger: '분노',
        longing: '그리움',
        isolation: '고립감',
        numbness: '무감각',
        shame: '수치심',
        moral_pain: '도덕적 고통'
    };
    
    return Object.entries(originalEmotion).map(([emotion, intensity], index) => `
        <div class="original-emotion-item" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-deep); border-radius: 4px;">
            <select class="original-emotion-select" data-scene-index="${sceneIndex}" data-emotion-index="${index}" style="flex: 1; padding: 0.4rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .3); color: var(--text-primary); border-radius: 4px;">
                <option value="fear" ${emotion === 'fear' ? 'selected' : ''}>${emotionLabels.fear}</option>
                <option value="sadness" ${emotion === 'sadness' ? 'selected' : ''}>${emotionLabels.sadness}</option>
                <option value="guilt" ${emotion === 'guilt' ? 'selected' : ''}>${emotionLabels.guilt}</option>
                <option value="anger" ${emotion === 'anger' ? 'selected' : ''}>${emotionLabels.anger}</option>
                <option value="longing" ${emotion === 'longing' ? 'selected' : ''}>${emotionLabels.longing}</option>
                <option value="isolation" ${emotion === 'isolation' ? 'selected' : ''}>${emotionLabels.isolation}</option>
                <option value="numbness" ${emotion === 'numbness' ? 'selected' : ''}>${emotionLabels.numbness}</option>
                <option value="shame" ${emotion === 'shame' ? 'selected' : ''}>${emotionLabels.shame}</option>
                <option value="moral_pain" ${emotion === 'moral_pain' ? 'selected' : ''}>${emotionLabels.moral_pain}</option>
            </select>
            <input type="range" class="original-emotion-intensity" data-scene-index="${sceneIndex}" data-emotion-index="${index}" min="0" max="1" step="0.01" value="${intensity}" style="flex: 2;">
            <span class="original-emotion-value" style="min-width: 3rem; text-align: right; color: var(--accent-memory);">${(intensity * 100).toFixed(0)}%</span>
            <button class="remove-emotion-btn" onclick="removeOriginalEmotion(${sceneIndex}, ${index})" style="padding: 0.3rem 0.6rem; background: var(--bg-surface); border: 1px solid rgba(196, 168, 130, .3); color: var(--text-primary); border-radius: 4px; cursor: pointer;">삭제</button>
        </div>
    `).join('');
}

// 다음 장면 옵션 렌더링
function renderNextSceneOptions(currentSceneIndex, selectedValue) {
    let options = '';
    for (let i = 0; i < currentScenes.length; i++) {
        options += `<option value="${i}" ${selectedValue === i ? 'selected' : ''}>장면 ${i + 1}</option>`;
    }
    options += `<option value="end" ${selectedValue === 'end' ? 'selected' : ''}>엔딩</option>`;
    return options;
}

// 감정 벡터를 색상으로 보간하는 함수
function interpolateColors(emotionVector) {
    // 감정별 색상 매핑 (RGB)
    const emotionColors = {
        fear: { r: 74, g: 144, b: 217 },      // #4A90D9
        sadness: { r: 90, g: 122, b: 154 },   // #5A7A9A
        guilt: { r: 139, g: 115, b: 85 },     // #8B7355
        anger: { r: 217, g: 74, b: 74 },      // #D94A4A
        longing: { r: 196, g: 168, b: 130 },  // #C4A882
        isolation: { r: 74, g: 74, b: 90 },    // #4A4A5A
        numbness: { r: 106, g: 106, b: 106 }, // #6A6A6A
        moralPain: { r: 155, g: 89, b: 182 }  // #9B59B6
    };
    
    let totalWeight = 0;
    let r = 0, g = 0, b = 0;
    
    Object.entries(emotionVector).forEach(([emotion, value]) => {
        if (emotionColors[emotion] && value > 0) {
            const weight = value / 100; // 0-1 범위로 정규화
            r += emotionColors[emotion].r * weight;
            g += emotionColors[emotion].g * weight;
            b += emotionColors[emotion].b * weight;
            totalWeight += weight;
        }
    });
    
    if (totalWeight > 0) {
        r = Math.round(r / totalWeight);
        g = Math.round(g / totalWeight);
        b = Math.round(b / totalWeight);
    } else {
        // 기본값 (회색)
        r = 128;
        g = 128;
        b = 128;
    }
    
    return `rgb(${r}, ${g}, ${b})`;
}

// 파동 데이터 생성 함수
function computeWaveData(emotionVector, sceneTextLength, voidLevel) {
    const wavePoints = [];
    const freq = 0.02;
    
    for (let x = 0; x < sceneTextLength * 10; x++) {
        let y = 0;
        
        Object.entries(emotionVector).forEach(([emotion, value]) => {
            y += Math.sin(x * freq) * value * 50;
        });
        
        wavePoints.push({ x, y });
    }
    
    if (voidLevel === 'high') {
        wavePoints.forEach(p => p.y *= 0.3);
    }
    
    const avgColor = interpolateColors(emotionVector);
    
    return { wavePoints, color: avgColor };
}

// VOID 자동 감지 함수
function detectVoid(sceneText, emotionReasonText, emotionVector) {
    // 1) Scene Void (텍스트 모호성 중심)
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

// 장면 이벤트 리스너 연결
function attachSceneListeners() {
    // 장면 본문
    document.querySelectorAll('.scene-text-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].text = this.value;
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 잔향 단어
    document.querySelectorAll('.scene-echo-words-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const value = this.value.trim();
            // 콤마로 구분하여 배열로 변환
            currentScenes[sceneIndex].echoWords = value ? value.split(',').map(w => w.trim()).filter(w => w) : [];
        });
    });

    // 장면 타입
    document.querySelectorAll('.scene-type-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].sceneType = this.value;
            // 타입 변경 시 원본 필드 표시/숨김 업데이트
            const originalFields = document.querySelectorAll(`.scene-original-fields[data-scene-index="${sceneIndex}"]`);
            const originalSection = document.querySelector(`.editor-section.scene-original-fields[data-scene-index="${sceneIndex}"]`);
            if (this.value === 'branch' || this.value === 'ending') {
                originalFields.forEach(field => field.style.display = 'block');
                if (originalSection) originalSection.style.display = 'block';
            } else {
                originalFields.forEach(field => field.style.display = 'none');
                if (originalSection) originalSection.style.display = 'none';
            }
            // 다음 장면 선택 드롭다운 업데이트 (타입 표시 반영)
            renderScenes();
        });
    });

    // 원본 선택
    document.querySelectorAll('.scene-original-choice-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].originalChoice = parseInt(this.value);
        });
    });

    // 원본 이유
    document.querySelectorAll('.scene-original-reason-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            currentScenes[sceneIndex].originalReason = this.value.trim();
        });
    });

    // 원본 감정 선택 변경
    document.querySelectorAll('.original-emotion-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const emotionIndex = parseInt(this.dataset.emotionIndex);
            updateOriginalEmotion(sceneIndex, emotionIndex);
        });
    });

    // 원본 감정 강도 변경
    document.querySelectorAll('.original-emotion-intensity').forEach(slider => {
        slider.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const emotionIndex = parseInt(this.dataset.emotionIndex);
            const value = parseFloat(this.value);
            const valueDisplay = this.parentElement.querySelector('.original-emotion-value');
            if (valueDisplay) {
                valueDisplay.textContent = (value * 100).toFixed(0) + '%';
            }
            updateOriginalEmotion(sceneIndex, emotionIndex);
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
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
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
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 자동 감지 버튼
    document.querySelectorAll('.auto-detect-void-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const scene = currentScenes[sceneIndex];
            
            const sceneTextInput = document.querySelector(`.scene-text-input[data-scene-index="${sceneIndex}"]`);
            const emotionReasonInput = document.querySelector(`.scene-original-reason-input[data-scene-index="${sceneIndex}"]`);
            
            const sceneText = sceneTextInput ? sceneTextInput.value : '';
            const emotionReasonText = emotionReasonInput ? emotionReasonInput.value : '';
            
            // 감정 벡터 계산
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
                
                // 정규화
                const total = Object.values(emotionVector).reduce((sum, val) => sum + val, 0);
                if (total > 0) {
                    Object.keys(emotionVector).forEach(key => {
                        emotionVector[key] = Math.round((emotionVector[key] / total) * 100);
                    });
                }
            }
            
            const voidInfo = detectVoid(sceneText, emotionReasonText, emotionVector);
            
            // 체크박스 업데이트
            const sceneVoidCheckbox = document.querySelector(`.scene-void-toggle[data-scene-index="${sceneIndex}"]`);
            const emotionVoidCheckbox = document.querySelector(`.emotion-void-toggle[data-scene-index="${sceneIndex}"]`);
            const reasonVoidCheckbox = document.querySelector(`.reason-void-toggle[data-scene-index="${sceneIndex}"]`);
            
            if (sceneVoidCheckbox) sceneVoidCheckbox.checked = voidInfo.sceneVoid;
            if (emotionVoidCheckbox) emotionVoidCheckbox.checked = voidInfo.emotionVoid;
            if (reasonVoidCheckbox) reasonVoidCheckbox.checked = voidInfo.reasonVoid;
            
            // voidInfo 저장
            currentScenes[sceneIndex].voidInfo = voidInfo;
            
            // 레벨 표시 업데이트
            updateVoidLevel(sceneIndex);
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 선택지 텍스트
    document.querySelectorAll('.choice-text-input').forEach(input => {
        input.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const choiceIndex = parseInt(this.dataset.choiceIndex);
            if (!currentScenes[sceneIndex].choices) currentScenes[sceneIndex].choices = [];
            if (!currentScenes[sceneIndex].choices[choiceIndex]) currentScenes[sceneIndex].choices[choiceIndex] = {};
            currentScenes[sceneIndex].choices[choiceIndex].text = this.value;
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 감정 선택
    document.querySelectorAll('.choice-emotion-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const choiceIndex = parseInt(this.dataset.choiceIndex);
            if (!currentScenes[sceneIndex].choices) currentScenes[sceneIndex].choices = [];
            if (!currentScenes[sceneIndex].choices[choiceIndex]) currentScenes[sceneIndex].choices[choiceIndex] = {};
            currentScenes[sceneIndex].choices[choiceIndex].emotion = this.value;
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 감정 강도
    document.querySelectorAll('.choice-intensity-slider').forEach(slider => {
        slider.addEventListener('input', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const choiceIndex = parseInt(this.dataset.choiceIndex);
            if (!currentScenes[sceneIndex].choices) currentScenes[sceneIndex].choices = [];
            if (!currentScenes[sceneIndex].choices[choiceIndex]) currentScenes[sceneIndex].choices[choiceIndex] = {};
            currentScenes[sceneIndex].choices[choiceIndex].intensity = parseInt(this.value);
            this.parentElement.querySelector('.choice-intensity-value').textContent = this.value;
            
            // Preview 탭이 활성화되어 있고 현재 장면이면 파동 업데이트
            if (document.getElementById('previewContent').classList.contains('active') && previewCurrentScene === sceneIndex) {
                renderWavePreview();
            }
        });
    });

    // 다음 장면 선택
    document.querySelectorAll('.choice-next-scene-select').forEach(select => {
        select.addEventListener('change', function() {
            const sceneIndex = parseInt(this.dataset.sceneIndex);
            const choiceIndex = parseInt(this.dataset.choiceIndex);
            if (!currentScenes[sceneIndex].choices) currentScenes[sceneIndex].choices = [];
            if (!currentScenes[sceneIndex].choices[choiceIndex]) currentScenes[sceneIndex].choices[choiceIndex] = {};
            currentScenes[sceneIndex].choices[choiceIndex].nextScene = this.value;
        });
    });
}

// VOID 레벨 업데이트
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

// 원본 감정 추가
function addOriginalEmotion(sceneIndex) {
    if (!currentScenes[sceneIndex].originalEmotion) {
        currentScenes[sceneIndex].originalEmotion = {};
    }
    
    // 사용 가능한 감정 목록
    const availableEmotions = ['fear', 'sadness', 'guilt', 'anger', 'longing', 'isolation', 'numbness', 'shame', 'moral_pain'];
    
    // 이미 추가된 감정 목록
    const existingEmotions = Object.keys(currentScenes[sceneIndex].originalEmotion);
    
    // 아직 추가되지 않은 첫 번째 감정 찾기
    const newEmotion = availableEmotions.find(emotion => !existingEmotions.includes(emotion));
    
    if (newEmotion) {
        // 새로운 감정 추가
        currentScenes[sceneIndex].originalEmotion[newEmotion] = 0.5;
        renderScenes();
    } else {
        // 모든 감정이 이미 추가된 경우
        alert('모든 감정이 이미 추가되었습니다.');
    }
}

// 원본 감정 삭제
function removeOriginalEmotion(sceneIndex, emotionIndex) {
    if (!currentScenes[sceneIndex].originalEmotion) return;
    
    const emotions = Object.keys(currentScenes[sceneIndex].originalEmotion);
    if (emotionIndex >= 0 && emotionIndex < emotions.length) {
        const emotionKey = emotions[emotionIndex];
        delete currentScenes[sceneIndex].originalEmotion[emotionKey];
        
        // 빈 객체가 되면 null로 설정
        if (Object.keys(currentScenes[sceneIndex].originalEmotion).length === 0) {
            currentScenes[sceneIndex].originalEmotion = null;
        }
        renderScenes();
    }
}

// 원본 감정 업데이트
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
            
            // 기존 감정 삭제
            delete currentScenes[sceneIndex].originalEmotion[oldEmotionKey];
            
            // 새 감정 추가
            currentScenes[sceneIndex].originalEmotion[newEmotionKey] = intensity;
        }
    }
}

// 선택지 추가
function addChoice(sceneIndex) {
    if (!currentScenes[sceneIndex].choices) currentScenes[sceneIndex].choices = [];
    currentScenes[sceneIndex].choices.push({
        text: '',
        emotion: 'fear',
        intensity: 5,
        nextScene: sceneIndex + 1 < currentScenes.length ? sceneIndex + 1 : 'end'
    });
    // 원본 선택이 선택지 개수를 초과하면 조정
    if (currentScenes[sceneIndex].originalChoice >= currentScenes[sceneIndex].choices.length) {
        currentScenes[sceneIndex].originalChoice = currentScenes[sceneIndex].choices.length - 1;
    }
    renderScenes();
}

// 선택지 삭제
function deleteChoice(sceneIndex, choiceIndex) {
    if (confirm('이 선택지를 삭제하시겠습니까?')) {
        currentScenes[sceneIndex].choices.splice(choiceIndex, 1);
        // 원본 선택이 삭제된 인덱스보다 크거나 같으면 조정
        if (currentScenes[sceneIndex].originalChoice >= choiceIndex) {
            if (currentScenes[sceneIndex].originalChoice > 0) {
                currentScenes[sceneIndex].originalChoice = currentScenes[sceneIndex].originalChoice - 1;
            } else {
                currentScenes[sceneIndex].originalChoice = 0;
            }
        }
        renderScenes();
    }
}

// 장면 삭제
function deleteScene(sceneIndex) {
    if (confirm('이 장면을 삭제하시겠습니까?')) {
        currentScenes.splice(sceneIndex, 1);
        renderScenes();
    }
}

// 장면 위로 이동
function moveSceneUp(sceneIndex) {
    if (sceneIndex > 0) {
        [currentScenes[sceneIndex], currentScenes[sceneIndex - 1]] = [currentScenes[sceneIndex - 1], currentScenes[sceneIndex]];
        renderScenes();
    }
}

// 장면 아래로 이동
function moveSceneDown(sceneIndex) {
    if (sceneIndex < currentScenes.length - 1) {
        [currentScenes[sceneIndex], currentScenes[sceneIndex + 1]] = [currentScenes[sceneIndex + 1], currentScenes[sceneIndex]];
        renderScenes();
    }
}

// 탭 전환
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
        renderPreview();
        startPreviewWaveAnimation();
    } else if (tab === 'archive') {
        document.querySelectorAll('.editor-tab')[2].classList.add('active');
        document.getElementById('archiveContent').classList.add('active');
        // Archive 탭 열릴 때 자동으로 로드
        if (currentMemoryId) {
            loadArchiveLayers(currentMemoryId);
        }
    }
}

// 미리보기 렌더링
function renderPreview() {
    const container = document.getElementById('previewSceneContainer');
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
        <div class="preview-scene-text">${scene.text || '본문이 없습니다'}</div>
        <div class="preview-choices">
            ${scene.choices && scene.choices.length > 0 ? scene.choices.map((choice, index) => `
                <button class="preview-choice-btn" onclick="previewMakeChoice(${index})">${choice.text || '선택지 텍스트 없음'}</button>
            `).join('') : '<div style="color:var(--text-muted);padding:1rem;">선택지가 없습니다</div>'}
        </div>
    `;
    container.appendChild(sceneDiv);
    
    // 파동 렌더링 업데이트
    renderWavePreview();
}

// 미리보기에서 선택지 선택
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

// 현재 장면의 감정 벡터 계산
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

        // 정규화
        const total = Object.values(emotionVector).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(emotionVector).forEach(key => {
                emotionVector[key] = Math.round((emotionVector[key] / total) * 100);
            });
        }
    }

    return emotionVector;
}

// 파동 엔진을 사용한 Preview 렌더링
function renderWavePreview() {
    // previewWaveCanvas를 waveCanvas로 사용
    const canvas = document.getElementById('previewWaveCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // 캔버스 크기 설정
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    
    ctx.clearRect(0, 0, width, height);

    const scene = currentScenes[previewCurrentScene];
    if (!scene) return;

    // 현재 장면의 감정 벡터 계산
    const currentEmotionVector = getCurrentSceneEmotionVector();
    const currentSceneText = scene.text || '';
    const voidLevel = scene.voidInfo?.voidLevel || 'low';

    // 파동 데이터 생성
    const waveData = computeWaveData(
        currentEmotionVector,
        currentSceneText.length || 1, // 0이면 1로 설정
        voidLevel
    );

    // 배경
    ctx.fillStyle = 'rgba(18, 18, 26, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // 파동 그리기
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

    // VOID Level 표시 (요소가 있으면 업데이트)
    const voidLevelEl = document.getElementById('voidLevel');
    if (voidLevelEl) {
        voidLevelEl.textContent = voidLevel;
    }

    // Layer ID 표시 (현재는 0으로 설정)
    const layerIdEl = document.getElementById('layerId');
    if (layerIdEl) {
        layerIdEl.textContent = '0';
    }
}

// 미리보기 파동 애니메이션 시작 (기존 애니메이션 - 호환성 유지)
function startPreviewWaveAnimation() {
    // 새로운 파동 엔진 사용
    renderWavePreview();
    
    // 기존 애니메이션은 주석 처리하거나 제거 가능
    // 하지만 호환성을 위해 유지
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

// 미리보기 파동 애니메이션 중지
function stopPreviewWaveAnimation() {
    if (previewWaveAnimationId) {
        cancelAnimationFrame(previewWaveAnimationId);
        previewWaveAnimationId = null;
    }
}

// Archive Layer 로드 함수
async function loadArchiveLayers(memoryId) {
    if (!memoryId) {
        console.warn('[loadArchiveLayers] memoryId가 없습니다.');
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
        console.error('[loadArchiveLayers] Supabase 클라이언트가 초기화되지 않았습니다.');
        return;
    }

    try {
        console.log('[loadArchiveLayers] Archive 레이어 로드 시작', { memoryId });

        const data = await listArchiveLayers(supabaseClient, memoryId);

        if (!data || data.length === 0) {
            console.log('[loadArchiveLayers] Archive 레이어가 없습니다.');
            const canvas = document.getElementById('archiveCanvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'var(--text-muted)';
                ctx.font = '16px "Noto Serif KR"';
                ctx.textAlign = 'center';
                ctx.fillText('Archive 레이어가 없습니다. "다음 층 쌓기" 버튼으로 레이어를 추가하세요.', canvas.width / 2, canvas.height / 2);
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

// Archive 파동 렌더링 함수
function renderArchive(layers) {
    const canvas = document.getElementById('archiveCanvas');
    if (!canvas) {
        console.warn('[renderArchive] archiveCanvas를 찾을 수 없습니다.');
        return;
    }

    const ctx = canvas.getContext('2d');
    
    // 캔버스 크기 조정 (반응형)
    const container = canvas.parentElement;
    if (container) {
        const maxWidth = Math.min(1000, container.offsetWidth - 32);
        canvas.width = maxWidth;
        canvas.height = Math.floor(maxWidth * 0.6); // 5:3 비율
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 배경
    ctx.fillStyle = 'rgba(18, 18, 26, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!layers || layers.length === 0) {
        ctx.fillStyle = 'var(--text-muted)';
        ctx.font = '16px "Noto Serif KR"';
        ctx.textAlign = 'center';
        ctx.fillText('Archive 레이어가 없습니다.', canvas.width / 2, canvas.height / 2);
        return;
    }

    // 각 레이어 렌더링
    layers.forEach((layer, index) => {
        if (!layer.wave_data || !layer.wave_data.wavePoints) {
            console.warn(`[renderArchive] 레이어 ${index}에 wave_data가 없습니다.`);
            return;
        }

        const { wave_data } = layer;
        const { wavePoints, color } = wave_data;

        // 각 레이어를 조금씩 아래로 오프셋
        const layerSpacing = canvas.height / (layers.length + 1);
        const yOffset = (index + 1) * layerSpacing;
        const centerY = canvas.height / 2;

        // VOID Level이 high이면 blur 필터 적용
        if (layer.void_info && layer.void_info.voidLevel === 'high') {
            ctx.filter = 'blur(1.5px)';
        } else {
            ctx.filter = 'none';
        }

        ctx.beginPath();
        ctx.strokeStyle = color || 'rgba(196, 168, 130, 0.6)';
        ctx.lineWidth = 1.5;

        // wavePoints를 캔버스 크기에 맞게 스케일링
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

    // 필터 리셋
    ctx.filter = 'none';

    console.log('[renderArchive] Archive 렌더링 완료', { layersCount: layers.length });
}

// 기억 저장
async function saveMemory() {
    const title = document.getElementById('memoryTitle').value.trim();
    const code = document.getElementById('memoryCode').value.trim();
    const description = document.getElementById('memoryDescription').value.trim();

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
        
        // Supabase 클라이언트 가져오기
        const supabaseClient = await getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }

        // Wave 데이터 미리 계산 (각 scene에 포함)
        console.log('[saveMemory] Wave 데이터 계산 시작', { scenesCount: currentScenes.length });
        const scenesWithWaveData = currentScenes.map((scene, i) => {
            // emotionDist 계산
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

            // Wave 데이터 생성
            const voidLevel = scene.voidInfo?.voidLevel || 'low';
            const waveData = computeWaveData(emotionDist, (scene.text || '').length, voidLevel);
            
            return {
                ...scene,
                waveData: waveData
            };
        });

        // 전체 메모리의 평균 감정 벡터 계산 (plays 테이블용)
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

        // repo.js의 saveMemoryGraph 호출
        console.log('[saveMemory] saveMemoryGraph 호출 시작', { 
            memoryId: currentMemoryId, 
            scenesCount: scenesWithWaveData.length 
        });
        
        const finalMemoryId = await saveMemoryGraph(supabaseClient, {
            memoryId: currentMemoryId,
            code: code,
            title: title,
            scenes: scenesWithWaveData,
            memoryWaveData: memoryWaveData
        });
        
        console.log('[saveMemory] saveMemoryGraph 완료', { finalMemoryId });
        memoryId = finalMemoryId;

        // 로컬 메모리 업데이트
        const memoryData = {
            id: memoryId,
            title,
            code,
            description,
            scenes: currentScenes,
            interpretationLayers: 0,
            visible: true
        };

        if (currentMemoryIndex !== null) {
            memories[currentMemoryIndex] = memoryData;
        } else {
            memories.push(memoryData);
        }

        saveMemoriesToStorage(); // 백업용
        renderMemoriesTable();
        
        // JSON 다운로드
        exportMemoriesJSON();
        
        console.log('[saveMemory] 전체 저장 완료');
        
        // Archive 탭이 활성화되어 있으면 Archive 로드
        if (document.getElementById('archiveContent').classList.contains('active') && memoryId) {
            loadArchiveLayers(memoryId);
        }
        
        cancelEdit();
    } catch (error) {
        console.error('[saveMemory] 전체 에러 발생', error);
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

// memoriesData 형식으로 변환
function convertToMemoriesDataFormat(adminMemories) {
    return adminMemories.map((memory, index) => {
        // 선택지에서 감정과 강도 정보 추출
        const processedScenes = memory.scenes.map(scene => {
            const processedChoices = scene.choices.map(choice => ({
                text: choice.text,
                percentage: choice.percentage || 0,
                emotion: choice.emotion || 'fear',
                intensity: choice.intensity || 5,
                nextScene: choice.nextScene || 'end'
            }));

            // emotionDist 계산 (선택지의 감정 분포 기반)
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
                originalChoice: scene.originalChoice || 0,
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

// JSON 다운로드
async function exportMemoriesJSON() {
    if (memories.length === 0) {
        alert('저장된 기억이 없습니다. 먼저 기억을 추가해주세요.');
        return;
    }

    const memoriesDataFormat = convertToMemoriesDataFormat(memories);
    const jsonString = JSON.stringify(memoriesDataFormat, null, 2);
    
    // 파일 다운로드
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memories-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 클립보드에 복사
    try {
        await navigator.clipboard.writeText(jsonString);
        alert('클립보드에 복사됨. data/memories.js의 memoriesData 배열에 붙여넣으세요');
    } catch (err) {
        // 클립보드 복사 실패 시 fallback
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

            // memoriesData 형식에서 admin 형식으로 변환
            const adminFormat = jsonData.map(memory => ({
                title: memory.title || '',
                code: memory.code || '',
                description: '',
                scenes: memory.scenes.map(scene => ({
                    text: scene.text || '',
                    sceneType: scene.sceneType || 'normal',
                    echoWords: scene.echoWords || [],
                    choices: scene.choices.map(choice => ({
                        text: choice.text || '',
                        emotion: choice.emotion || 'fear',
                        intensity: choice.intensity || 5,
                        nextScene: choice.nextScene || 'end',
                        percentage: choice.percentage || 0
                    })),
                    originalChoice: scene.originalChoice !== undefined ? scene.originalChoice : 0,
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
    
    // 파일 입력 초기화
    event.target.value = '';
}

// 로컬 스토리지에 저장
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

// simulateLayer 버튼 이벤트 리스너
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
                alert('장면이 없습니다.');
                return;
            }

            try {
                // 현재 장면의 감정 벡터 계산
                const currentEmotionVector = getCurrentSceneEmotionVector();
                const currentSceneText = scene.text || '';
                const voidLevel = scene.voidInfo?.voidLevel || 'low';

                // 파동 데이터 생성
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

                // plays 테이블에 저장
                const { error: playsError } = await supabaseClient
                    .from('plays')
                    .insert({
                        memory_id: currentMemoryId,
                        wave_data: waveData,
                        layer_id: currentLayers.length,
                        void_info: scene.voidInfo || null
                    });

                if (playsError) {
                    console.error('[simulateLayer] 레이어 저장 실패', playsError);
                    alert('레이어 저장 중 오류가 발생했습니다: ' + playsError.message);
                    return;
                }

                // 레이어 추가
                currentLayers.push({
                    layerId: currentLayers.length,
                    waveData: waveData,
                    createdAt: new Date()
                });

                console.log('[simulateLayer] 레이어 저장 성공', { layerId: currentLayers.length - 1 });

                alert('새 지층 레이어 저장 완료');
                renderWavePreview();
                
                // Archive 탭이 활성화되어 있으면 Archive 로드
                if (document.getElementById('archiveContent').classList.contains('active')) {
                    loadArchiveLayers(currentMemoryId);
                }
            } catch (error) {
                console.error('[simulateLayer] 예외 발생', error);
                alert('레이어 저장 중 오류가 발생했습니다: ' + error.message);
            }
        });
    }
});

// 통합 세션 관리 함수들
let allSessions = [];
let currentFilter = 'all';
const fateLabels={'preserve':'보존','dilute':'자연 소멸','anonymous':'완전 익명'};
const fateColors={'preserve':'#7a9a7a','dilute':'#c4a882','anonymous':'#7b8fa8'};

async function loadAllSessions() {
    allSessions = [];
    
    // 아카이브 세션 로드 (기존 memories)
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
    
    // 라이브 세션 로드
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

function renderSessions() {
    const filtered = currentFilter === 'all' 
        ? allSessions 
        : allSessions.filter(s => s.type === currentFilter);
    
    const container = document.getElementById('sessionsListContainer');
    if (!container) return;
    
    if (!filtered || filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">세션이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = filtered.map(session => `
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
                ${session.type === 'live' && session.memory_fate ? `<div class="session-fate" style="color: ${fateColors[session.memory_fate] || '#666'}; margin-top: 0.5rem; font-size: 0.9rem;">운명: ${fateLabels[session.memory_fate] || '미정'}</div>` : ''}
            </div>
            <button class="session-delete-btn" onclick="event.stopPropagation(); deleteSessionById('${session.id}', '${session.type}')" style="padding: 0.5rem 1rem; background: var(--accent-live); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-left: 1rem;">삭제</button>
        </div>
    `).join('');
    updateSelectedCount();
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
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }
        
        if (type === 'archive') {
            await deleteMemoryGraph(supabaseClient, id);
        } else {
            // 라이브 세션 삭제: 관련된 모든 데이터를 먼저 삭제
            // 1. live_scenes 삭제
            const { error: scenesError } = await supabaseClient
                .from('live_scenes')
                .delete()
                .eq('session_id', id);
            
            if (scenesError) {
                console.warn('live_scenes 삭제 중 오류 (무시하고 계속 진행):', scenesError);
            }
            
            // 2. scenes 테이블에서 live_session_id 참조 제거 (중요!)
            const { error: scenesUpdateError } = await supabaseClient
                .from('scenes')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (scenesUpdateError) {
                console.warn('scenes live_session_id 업데이트 중 오류 (무시하고 계속 진행):', scenesUpdateError);
            }
            
            // 3. choices 테이블에서 live_session_id 참조 제거 (중요!)
            const { error: choicesUpdateError } = await supabaseClient
                .from('choices')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (choicesUpdateError) {
                console.warn('choices live_session_id 업데이트 중 오류 (무시하고 계속 진행):', choicesUpdateError);
            }
            
            // 4. live_sessions 삭제
            const { error: sessionsError } = await supabaseClient
                .from('live_sessions')
                .delete()
                .eq('id', id);
            
            if (sessionsError) {
                throw new Error(`live_sessions 삭제 실패: ${sessionsError.message}`);
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
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }
        
        // 라이브 세션 삭제
        for (const id of liveSessions) {
            // 1. live_scenes 삭제
            const { error: scenesError } = await supabaseClient
                .from('live_scenes')
                .delete()
                .eq('session_id', id);
            
            if (scenesError) {
                console.warn(`live_scenes 삭제 중 오류 (session_id: ${id}):`, scenesError);
            }
            
            // 2. scenes 테이블에서 live_session_id 참조 제거 (중요!)
            const { error: scenesUpdateError } = await supabaseClient
                .from('scenes')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (scenesUpdateError) {
                console.warn(`scenes live_session_id 업데이트 중 오류 (session_id: ${id}):`, scenesUpdateError);
            }
            
            // 3. choices 테이블에서 live_session_id 참조 제거 (중요!)
            const { error: choicesUpdateError } = await supabaseClient
                .from('choices')
                .update({ live_session_id: null })
                .eq('live_session_id', id);
            
            if (choicesUpdateError) {
                console.warn(`choices live_session_id 업데이트 중 오류 (session_id: ${id}):`, choicesUpdateError);
            }
            
            // 4. live_sessions 삭제
            const { error: sessionsError } = await supabaseClient
                .from('live_sessions')
                .delete()
                .eq('id', id);
            
            if (sessionsError) {
                throw new Error(`live_sessions 삭제 실패 (id: ${id}): ${sessionsError.message}`);
            }
        }
        
        // 아카이브 메모리 삭제
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
        // 기존 아카이브 상세 로직 - 에디터로 열기
        const memoryIndex = memories.findIndex(m => m.id == id);
        if (memoryIndex !== -1) {
            editMemory(memoryIndex);
        }
    } else {
        // 라이브 세션 상세
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
            `).join('') : '<p style="color: var(--text-muted);">저장된 장면이 없습니다.</p>'}
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
        alert('저장 실패');
        return;
    }
    
    // UI 업데이트
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

// 전역 스코프에 함수 노출 (onclick 속성에서 사용하기 위해)
window.checkPassword = checkPassword;
window.logout = logout;
window.addNewMemory = addNewMemory;
window.editMemory = editMemory;
window.deleteMemory = deleteMemory;
window.deleteSessionById = deleteSessionById;
window.toggleMemoryVisibility = toggleMemoryVisibility;
window.filterSessions = filterSessions;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedSessions = deleteSelectedSessions;
window.openSessionDetail = openSessionDetail;
window.closeSessionDetail = closeSessionDetail;
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
window.addChoice = addChoice;
window.deleteChoice = deleteChoice;
window.loadArchiveLayers = loadArchiveLayers;
window.updateSelectedCount = updateSelectedCount;
window.addOriginalEmotion = addOriginalEmotion;
window.removeOriginalEmotion = removeOriginalEmotion;

