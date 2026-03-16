// js/ui/UIManager.js
// DOM 조작 및 screen switch manage (calculate 금지)

/**
 * UI Manager - DOM 조작 및 screen switch 전담
 * calculate 직 하지 않음
 */

export class UIManager {
    constructor() {
 // UI Manager state 지지 않음
    }

 // ========== screen switch ==========
    
    /**
 * 마 페 지 display
 * @param {Object} userData - user data
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
                    const methodText = userData.loginMethod === 'google' ? 'Google' : 
                                     userData.loginMethod === 'facebook' ? 'Facebook' : 'Standard';
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
 * 마 페 지 닫기
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
 * alignment display 업데 트
 * @param {number} alignment - alignment 값 (0-1)
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
 * experiencer alignment display 업데 트
 * @param {number} alignment - alignment 값 (0-1)
     */
    updateExperiencerAlignmentDisplay(alignment) {
        const expAlignmentPercentage = document.getElementById('expAlignmentPercentage');
        if (expAlignmentPercentage) {
            expAlignmentPercentage.textContent = String(Math.round(alignment * 100)).padStart(2, '0') + '%';
        }
    }

 // ========== memory card 렌더링 ==========

    /**
 * memory card 렌더링
 * @param {Array} allMemoriesData - global memory data
 * @param {string} currentCategory - 현재 카테고리 ('story'|'archive')
 * @param {string} currentSort - 현재 정렬 방식 ('all'|'popular'|'recent')
 * @param {Function} onSelectMemory - memory 선택 callback (index) => void
 * @param {Function} onFilterMemories - filter링 callback () => void
     */
    renderMemoryCards(allMemoriesData, currentCategory, currentSort, onSelectMemory, onFilterMemories) {
        console.log('[UIManager.renderMemoryCards] 호출됨');
        console.log('[UIManager.renderMemoryCards] allMemoriesData:', allMemoriesData);
        console.log('[UIManager.renderMemoryCards] currentCategory:', currentCategory);
        console.log('[UIManager.renderMemoryCards] currentSort:', currentSort);
        const list = document.getElementById('memoryList');
        if (!list) {
            console.error('[UIManager.renderMemoryCards] memoryList 요소를 not found');
            return;
        }
        
        if (!allMemoriesData || allMemoriesData.length === 0) {
            console.log('[UIManager.renderMemoryCards] 메모리 데이터가 not found');
            list.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">No memories found.</div>';
            return;
        }
        
        let filteredMemories = [...allMemoriesData];
        console.log('[UIManager.renderMemoryCards] 필터링 전 메모리 수:', filteredMemories.length);
        if (currentCategory === 'story') {
            filteredMemories = filteredMemories.filter(m => (!m.live_session_id && !m.is_live));
            console.log('[UIManager.renderMemoryCards] story 필터링 후:', filteredMemories.length);
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
            list.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">No memories found in this category.</div>';
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
            const categoryLabel = isLive ? '<span class="memory-category-badge live">Live</span>' : '';
            const isFetus = !memory.status || memory.status === 'Fetus';
            const statusBadge = isFetus ? '<div class="status-badge Fetus">Fetus</div>' : '';
            console.log('[Memory] Rendering card:', memory.title, 'status:', memory.status);
            card.innerHTML = `${categoryLabel}${statusBadge}<h3 class="memory-card-title">${memory.title || 'Untitled'}</h3><p class="memory-card-meta">Original: ${memory.code || '—'} · Interpretation layers: ${memory.layers || 0}</p><div class="memory-card-dilution"><span>Original</span><div class="dilution-bar"><div class="dilution-fill" style="width:${memory.dilution !== undefined ? memory.dilution : 100}%"></div></div><span>${memory.dilution !== undefined ? memory.dilution : 100}%</span></div>`;
            list.appendChild(card);
        });
        
        if (onFilterMemories) {
            onFilterMemories();
        }
    }

 // ========== experiencer screen ==========

    /**
 * experiencer screen scene display
 * @param {Object} scene - scene object { id, text }
 * @param {Object} callbacks - callback function들
 * @param {Function} callbacks.onSwitchTab - 탭 switch callback (tab) => void
 * @param {Function} callbacks.onAddChatMessage - 채팅 message add callback (role, message) => void
 * @param {Function} callbacks.onShowNotification - notification display callback (message) => void
 * @param {string} emotionCueMsg - emotion 큐 message
 * @param {string} sceneArrivedMsg - scene 착 message
     */
    displaySceneForExperiencer(scene, callbacks = {}, emotionCueMsg = '', sceneArrivedMsg = '') {
        console.log('displaySceneForExperiencer 호출:', scene);
        if (!scene) {
            console.error('장면 객체가 not found');
            return;
        }
        if (!scene.text) {
            console.error('장면 텍스트가 not found. scene:', JSON.stringify(scene));
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
                expTextInput.placeholder = 'Enter your feelings...';
            }
            
            if (callbacks.onShowNotification) {
                callbacks.onShowNotification('A new scene has arrived');
            }
        } else {
            console.error('expSceneText 요소를 not found');
        }
    }

 // ========== Live choices 렌더링 ==========

    /**
 * Live choices 렌더링
 * @param {Array} choices - choices array [{ text }]
 * @param {Function} onMakeChoice - 선택 callback (index) => void
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

 // ========== emotion input 수집 ==========

    /**
 * emotion input 필드 서 값 수집
 * @returns {string} input 유 text (default값: "말하고 싶지 않아")
     */
    collectEmotionInput() {
        const inputEl = document.getElementById('emotionInputField');
        return inputEl?.value || "I don't want to talk about it";
    }

    /**
 * emotion modal 닫기 및 input 필드 init
     */
    closeEmotionModal() {
        const modalEl = document.getElementById('emotionModal');
        if (modalEl) modalEl.classList.remove('active');
        const inputEl = document.getElementById('emotionInputField');
        if (inputEl) inputEl.value = '';
    }
}

export const uiManager = new UIManager();
