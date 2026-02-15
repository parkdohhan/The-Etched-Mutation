// js/ui/UIManager.js
// DOM 조작 및 화면 전환 관리 (계산 금지)

/**
 * UI Manager - DOM 조작 및 화면 전환 전담
 * 계산 로직은 포함하지 않음
 */

export class UIManager {
    constructor() {
        // UI Manager는 상태를 가지지 않음
    }

    // ========== 화면 전환 ==========
    
    /**
     * 마이페이지 표시
     * @param {Object} userData - 사용자 데이터
     */
    showMypage(userData) {
        const introScreen = document.getElementById('introScreen');
        if (introScreen) {
            introScreen.classList.add('hidden');
            introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important';
        }
        
        ['modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'loginModal', 'signupModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('active');
                el.style.display = 'none';
            }
        });
        
        const mypageScreen = document.getElementById('mypageScreen');
        if (mypageScreen) {
            mypageScreen.classList.add('active');
            mypageScreen.style.cssText = 'display:flex !important;z-index:2100 !important';
        }
        
        if (userData) {
            const usernameEl = document.getElementById('displayUsername');
            if (usernameEl) usernameEl.textContent = userData.username;
            
            const emailEl = document.getElementById('displayEmail');
            if (emailEl) emailEl.textContent = userData.email || '—';
            
            const joinDateEl = document.getElementById('displayJoinDate');
            if (joinDateEl) joinDateEl.textContent = userData.joinDate || '—';
            
            if (userData.loginMethod) {
                const loginMethodEl = document.getElementById('displayLoginMethod');
                if (loginMethodEl) {
                    loginMethodEl.style.display = 'block';
                    const methodText = userData.loginMethod === 'google' ? '구글' : 
                                     userData.loginMethod === 'facebook' ? '페이스북' : '일반';
                    const methodTextEl = document.getElementById('loginMethodText');
                    if (methodTextEl) methodTextEl.textContent = methodText;
                }
            } else {
                const loginMethodEl = document.getElementById('displayLoginMethod');
                if (loginMethodEl) loginMethodEl.style.display = 'none';
            }
        }
    }

    /**
     * 마이페이지 닫기
     */
    closeMypage() {
        const mypageScreen = document.getElementById('mypageScreen');
        if (mypageScreen) {
            mypageScreen.classList.remove('active');
            mypageScreen.style.display = 'none';
        }
        
        const introScreen = document.getElementById('introScreen');
        if (introScreen) {
            introScreen.classList.remove('hidden');
            introScreen.classList.add('visible');
            introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important';
        }
    }

    /**
     * 정렬도 표시 업데이트
     * @param {number} alignment - 정렬도 값 (0-1)
     */
    updateAlignmentDisplay(alignment) {
        const alignmentValueEl = document.getElementById('alignmentValue');
        if (alignmentValueEl) {
            alignmentValueEl.textContent = alignment.toFixed(2);
        }
        
        const alignmentFillEl = document.getElementById('alignmentFill');
        if (alignmentFillEl) {
            alignmentFillEl.style.width = (alignment * 100) + '%';
        }
    }

    /**
     * 체험자 정렬도 표시 업데이트
     * @param {number} alignment - 정렬도 값 (0-1)
     */
    updateExperiencerAlignmentDisplay(alignment) {
        const expAlignmentPercentage = document.getElementById('expAlignmentPercentage');
        if (expAlignmentPercentage) {
            expAlignmentPercentage.textContent = String(Math.round(alignment * 100)).padStart(2, '0') + '%';
        }
    }

    // ========== 메모리 카드 렌더링 ==========

    /**
     * 메모리 카드 렌더링
     * @param {Array} allMemoriesData - 전체 메모리 데이터
     * @param {string} currentCategory - 현재 카테고리 ('live'|'archive')
     * @param {string} currentSort - 현재 정렬 방식 ('all'|'popular'|'recent')
     * @param {Function} onSelectMemory - 메모리 선택 콜백 (index) => void
     * @param {Function} onFilterMemories - 필터링 콜백 () => void
     */
    renderMemoryCards(allMemoriesData, currentCategory, currentSort, onSelectMemory, onFilterMemories) {
        console.log('[UIManager.renderMemoryCards] 호출됨');
        console.log('[UIManager.renderMemoryCards] allMemoriesData:', allMemoriesData);
        console.log('[UIManager.renderMemoryCards] currentCategory:', currentCategory);
        console.log('[UIManager.renderMemoryCards] currentSort:', currentSort);
        const list = document.getElementById('memoryList');
        if (!list) {
            console.error('[UIManager.renderMemoryCards] memoryList 요소를 찾을 수 없습니다');
            return;
        }
        
        if (!allMemoriesData || allMemoriesData.length === 0) {
            console.log('[UIManager.renderMemoryCards] 메모리 데이터가 없습니다');
            list.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">기억이 없습니다.</div>';
            return;
        }
        
        let filteredMemories = [...allMemoriesData];
        console.log('[UIManager.renderMemoryCards] 필터링 전 메모리 수:', filteredMemories.length);
        if (currentCategory === 'live') {
            filteredMemories = filteredMemories.filter(m => (m.live_session_id || m.is_live));
            console.log('[UIManager.renderMemoryCards] live 필터링 후:', filteredMemories.length);
        } else if (currentCategory === 'archive') {
            filteredMemories = filteredMemories.filter(m => (!m.live_session_id && !m.is_live));
            console.log('[UIManager.renderMemoryCards] archive 필터링 후:', filteredMemories.length);
        } else {
            console.log('[UIManager.renderMemoryCards] 전체 카테고리 - 필터링 없음');
        }
        
        let sortedMemories;
        if (currentSort === 'all') {
            sortedMemories = filteredMemories;
        } else if (currentSort === 'popular') {
            sortedMemories = [...filteredMemories].sort((a, b) => (b.layers || 0) - (a.layers || 0));
        } else if (currentSort === 'recent') {
            sortedMemories = [...filteredMemories].sort((a, b) => (b.recentRank || 0) - (a.recentRank || 0));
        }
        
        list.innerHTML = '';
        if (sortedMemories.length === 0) {
            list.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">해당 카테고리의 기억이 없습니다.</div>';
            return;
        }
        
        sortedMemories.forEach((memory, index) => {
            const originalIndex = allMemoriesData.findIndex(m => m.id === memory.id);
            const card = document.createElement('div');
            card.className = 'memory-card';
            card.setAttribute('data-code', memory.code || '');
            card.setAttribute('data-layers', memory.layers || 0);
            card.setAttribute('data-recent', memory.recentRank || 0);
            const isLive = !!(memory.live_session_id || memory.is_live);
            card.setAttribute('data-category', isLive ? 'live' : 'archive');
            card.setAttribute('onclick', `selectMemory(${originalIndex >= 0 ? originalIndex : index})`);
            const categoryLabel = isLive ? '<span class="memory-category-badge live">라이브</span>' : '';
            const isFetus = !memory.status || memory.status === 'Fetus';
            const statusBadge = isFetus ? '<div class="status-badge Fetus">Fetus</div>' : '';
            console.log('[Memory] Rendering card:', memory.title, 'status:', memory.status);
            card.innerHTML = `${categoryLabel}${statusBadge}<h3 class="memory-card-title">${memory.title || '제목 없음'}</h3><p class="memory-card-meta">원본: ${memory.code || '—'} · 해석 레이어: ${memory.layers || 0}개</p><div class="memory-card-dilution"><span>원본</span><div class="dilution-bar"><div class="dilution-fill" style="width:${memory.dilution || 50}%"></div></div><span>${memory.dilution || 50}%</span></div>`;
            list.appendChild(card);
        });
        
        if (onFilterMemories) {
            onFilterMemories();
        }
    }

    // ========== 체험자 화면 ==========

    /**
     * 체험자 화면에 장면 표시
     * @param {Object} scene - 장면 객체 { id, text }
     * @param {Object} callbacks - 콜백 함수들
     * @param {Function} callbacks.onSwitchTab - 탭 전환 콜백 (tab) => void
     * @param {Function} callbacks.onAddChatMessage - 채팅 메시지 추가 콜백 (role, message) => void
     * @param {Function} callbacks.onShowNotification - 알림 표시 콜백 (message) => void
     * @param {string} emotionCueMsg - 감정 큐 메시지
     * @param {string} sceneArrivedMsg - 장면 도착 메시지
     */
    displaySceneForExperiencer(scene, callbacks = {}, emotionCueMsg = '', sceneArrivedMsg = '') {
        console.log('displaySceneForExperiencer 호출:', scene);
        if (!scene) {
            console.error('장면 객체가 없습니다');
            return;
        }
        if (!scene.text) {
            console.error('장면 텍스트가 없습니다. scene:', JSON.stringify(scene));
            return;
        }
        
        console.log('체험자 화면에 장면 표시 시작:', scene.text);
        const expSceneText = document.getElementById('expSceneText');
        if (expSceneText) {
            expSceneText.textContent = scene.text;
            console.log('장면 텍스트 업데이트 완료');
            
            if (callbacks.onSwitchTab) {
                callbacks.onSwitchTab('scene');
            }
            
            window.currentSceneId = scene.id || null;
            
            const expChatMessages = document.getElementById('expChatMessages');
            if (expChatMessages) {
                expChatMessages.style.display = 'block';
                expChatMessages.innerHTML = '';
            }
            
            if (callbacks.onAddChatMessage) {
                if (sceneArrivedMsg) {
                    callbacks.onAddChatMessage('ai', sceneArrivedMsg);
                }
                if (emotionCueMsg) {
                    callbacks.onAddChatMessage('ai', emotionCueMsg);
                }
            }
            
            const expTextInput = document.getElementById('expTextInput');
            if (expTextInput) {
                expTextInput.value = '';
                expTextInput.focus();
                expTextInput.placeholder = '감정을 입력하세요...';
            }
            
            if (callbacks.onShowNotification) {
                callbacks.onShowNotification('새 장면이 도착했습니다');
            }
        } else {
            console.error('expSceneText 요소를 찾을 수 없습니다');
        }
    }

    // ========== Live 선택지 렌더링 ==========

    /**
     * Live 선택지 렌더링
     * @param {Array} choices - 선택지 배열 [{ text }]
     * @param {Function} onMakeChoice - 선택 콜백 (index) => void
     */
    renderLiveChoices(choices, onMakeChoice) {
        const container = document.getElementById('liveChoices');
        if (!container) return;
        container.innerHTML = '';
        if (!choices || !Array.isArray(choices)) return;
        
        choices.forEach((choice, i) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            btn.onclick = function() {
                if (onMakeChoice) {
                    onMakeChoice(i);
                }
            };
            container.appendChild(btn);
        });
    }

    // ========== 감정 입력 수집 ==========

    /**
     * 감정 입력 필드에서 값 수집
     * @returns {string} 입력된 이유 텍스트 (기본값: "말하고 싶지 않아")
     */
    collectEmotionInput() {
        const inputEl = document.getElementById('emotionInputField');
        return inputEl?.value || "말하고 싶지 않아";
    }

    /**
     * 감정 모달 닫기 및 입력 필드 초기화
     */
    closeEmotionModal() {
        const modalEl = document.getElementById('emotionModal');
        if (modalEl) modalEl.classList.remove('active');
        const inputEl = document.getElementById('emotionInputField');
        if (inputEl) inputEl.value = '';
    }
}

export const uiManager = new UIManager();
