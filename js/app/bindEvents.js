// js/app/bindEvents.js
// 모든 이벤트 바인딩 코드를 중앙에서 관리

/**
 * 모든 이벤트 리스너를 등록하는 함수
 * @param {Object} deps - 의존성 객체
 * @param {Object} deps.store - appStore
 * @param {Object} deps.engine - ByeoriEngine
 * @param {Object} deps.ui - UIManager
 * @param {Object} deps.visualizer - Visualizer
 * @param {Object} deps.network - NetworkService
 * @param {Object} deps.realtime - RealtimeService
 * @param {Object} deps.flow - FlowController (TODO: 구현 필요)
 * @param {Object} deps.memory - MemoryService
 * @param {Object} deps.ai - AIService
 */
export function bindEvents(deps) {
    const { store, engine, ui, visualizer, network, realtime, flow, memory, ai } = deps;

    // ========== 전역 함수 접근 (window를 통해) ==========
    // 이벤트 핸들러에서 사용되는 전역 함수들은 window를 통해 접근
    
    // ========== 1. 초기화 이벤트 ==========
    // DOMContentLoaded는 이미 index.js에서 처리되므로 여기서는 제외
    // (initApp 내부에서 bindEvents를 호출하도록 변경)

    // ========== 2. 오프닝 화면 이벤트 ==========
    bindOpeningEvents();

    // ========== 3. 로그인/회원가입 이벤트 ==========
    bindAuthEvents();

    // ========== 4. 아카이브 모드 이벤트 ==========
    bindArchiveEvents();

    // ========== 5. Live 모드 이벤트 ==========
    bindLiveEvents();

    // ========== 6. 감정 입력 이벤트 ==========
    bindEmotionInputEvents();

    // ========== 7. 세션 코드 입력 이벤트 ==========
    bindSessionCodeEvents();

    // ========== 8. 3D Carousel 이벤트 ==========
    bindCarouselEvents();

    // ========== 9. 메모리 등록 이벤트 ==========
    bindMemoryRegistrationEvents();

    // ========== 10. The Confession 이벤트 ==========
    bindConfessionEvents();

    // ========== 11. 비교 화면 이벤트 ==========
    bindComparisonEvents();

    // ========== 12. 스와이퍼 이벤트 ==========
    bindSwiperEvents();
}

// ========== 오프닝 화면 이벤트 ==========
function bindOpeningEvents() {
    // 오프닝 사운드 및 UI 초기화
    const openingSound = document.getElementById('openingSound');
    if (openingSound) {
        openingSound.addEventListener('error', function(e) {
            console.error('오프닝 사운드 로드 실패:', e);
            const error = openingSound.error;
            if (error) {
                console.error('오디오 에러 코드:', error.code, '메시지:', error.message);
            }
        });
        openingSound.addEventListener('canplaythrough', function() {
            console.log('오프닝 사운드 로드 완료');
        });
        openingSound.load();
    }

    const openingScreen = document.getElementById('openingScreen');
    if (openingScreen) {
        openingScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:3000 !important';
    }

    const waveContainer = document.getElementById('openingWaveContainer');
    if (waveContainer) {
        waveContainer.classList.add('visible');
        const canvas = document.getElementById('openingWaveCanvas');
        // startOpeningWaveAnimation는 index.js에서 window에 노출됨
        if (canvas && window.startOpeningWaveAnimation) {
            window.startOpeningWaveAnimation(canvas);
        }
    }

    const hint = document.getElementById('openingStartHint');
    if (hint) {
        hint.style.opacity = '1';
        hint.classList.add('visible');
    }

    const registerMemoryBtn = document.getElementById('registerMemoryBtn');
    if (registerMemoryBtn && window.startMemoryRegistration) {
        registerMemoryBtn.addEventListener('click', window.startMemoryRegistration);
    }

    // 오프닝 화면 클릭 이벤트
    const openingScreenEl = document.getElementById('openingScreen');
    if (openingScreenEl) {
        openingScreenEl.addEventListener('click', function(e) {
            if (window.hasZoomedIn) {
                if (window.skipToIntro) window.skipToIntro();
                return;
            }
            window.hasZoomedIn = true;
            const waveContainer = document.getElementById('openingWaveContainer');
            if (waveContainer) {
                waveContainer.style.transform = 'scale(1)';
                waveContainer.style.opacity = '1';
            }
            const openingSound = document.getElementById('openingSound');
            if (openingSound && window.setupLoopWithCrossfade && window.fadeInSound) {
                window.setupLoopWithCrossfade(openingSound, 0.6, 2);
                window.fadeInSound(openingSound, 0.6, 4000);
            }
            const hint = document.getElementById('openingStartHint');
            if (hint) hint.style.opacity = '0';
            setTimeout(() => {
                if (!window.openingSequenceStarted) {
                    window.openingSequenceStarted = true;
                    if (window.startOpeningSequence) window.startOpeningSequence();
                }
            }, 800);
        });
    }

    // 오프닝 키보드 이벤트
    if (window.handleOpeningKeydown) {
        document.addEventListener('keydown', window.handleOpeningKeydown);
    }

    // 오프닝 웨이브 캔버스 이벤트
    // startOpeningWaveAnimation 내부에서 바인딩되므로 여기서는 제외
}

// ========== 로그인/회원가입 이벤트 ==========
function bindAuthEvents() {
    const loginPasswordEl = document.getElementById('loginPassword');
    if (loginPasswordEl) {
        loginPasswordEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && window.handleLogin) {
                window.handleLogin();
            }
        });
    }

    const loginUsernameEl = document.getElementById('loginUsername');
    if (loginUsernameEl) {
        loginUsernameEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const passwordEl = document.getElementById('loginPassword');
                if (passwordEl) passwordEl.focus();
            }
        });
    }

    const signupPasswordConfirmEl = document.getElementById('signupPasswordConfirm');
    if (signupPasswordConfirmEl) {
        signupPasswordConfirmEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && window.handleSignup) {
                window.handleSignup();
            }
        });
    }

    const signupPasswordEl = document.getElementById('signupPassword');
    if (signupPasswordEl) {
        signupPasswordEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const confirmEl = document.getElementById('signupPasswordConfirm');
                if (confirmEl) confirmEl.focus();
            }
        });
    }

    const signupEmailEl = document.getElementById('signupEmail');
    if (signupEmailEl) {
        signupEmailEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const passwordEl = document.getElementById('signupPassword');
                if (passwordEl) passwordEl.focus();
            }
        });
    }

    const signupUsernameEl = document.getElementById('signupUsername');
    if (signupUsernameEl) {
        signupUsernameEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.isComposing) {
                const emailEl = document.getElementById('signupEmail');
                if (emailEl) emailEl.focus();
            }
        });
    }
}

// ========== 아카이브 모드 이벤트 ==========
function bindArchiveEvents() {
    // 자유 입력 필드
    const freeInputEl = document.getElementById('freeInput');
    if (freeInputEl) {
        freeInputEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                const customAction = this.value.trim();
                if (customAction) {
                    this.value = '';
                    if (window.userChoices) window.userChoices.push(-1);
                    if (window.showNpcDialogue && window.NPC_DIALOGUES) {
                        window.showNpcDialogue(window.NPC_DIALOGUES.archive.customAction(customAction), 3000);
                    }
                    const emotionQuestion = document.getElementById('emotionQuestion');
                    if (emotionQuestion) emotionQuestion.textContent = "왜 그런 선택을 했어?";
                    const emotionModal = document.getElementById('emotionModal');
                    if (emotionModal) emotionModal.classList.add('active');
                    const emotionInputField = document.getElementById('emotionInputField');
                    if (emotionInputField) emotionInputField.focus();
                }
            }
        });
    }

    // 감정 입력 필드
    const emotionInputFieldEl = document.getElementById('emotionInputField');
    if (emotionInputFieldEl) {
        emotionInputFieldEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.isComposing && window.submitEmotion) {
                e.preventDefault();
                window.submitEmotion();
            }
        });
    }

    // 원본 기억 열람 버튼 (동적으로 생성되므로 renderChoices나 다른 곳에서 바인딩)
    // initProgressDots와 renderChoices는 함수 내부에서 바인딩하므로 여기서는 제외
}

// ========== Live 모드 이벤트 ==========
function bindLiveEvents() {
    // Experiencer 감정 입력
    const experiencerFeelingInputEl = document.getElementById('experiencerFeelingInput');
    if (experiencerFeelingInputEl) {
        experiencerFeelingInputEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.ctrlKey && !e.isComposing && window.submitExperiencerFeeling) {
                e.preventDefault();
                window.submitExperiencerFeeling();
            }
        });
    }

    // Narrator 웨이브 섹션 클릭 (동적으로 바인딩되므로 startLiveVoiceInput 내부에서 처리)
    // switchExpToTextInput, switchExpToVoiceInput, switchToTextInput, switchToVoiceInput 내부에서 바인딩
}

// ========== 감정 입력 이벤트 ==========
function bindEmotionInputEvents() {
    // 이미 bindArchiveEvents에서 처리됨
}

// ========== 세션 코드 입력 이벤트 ==========
function bindSessionCodeEvents() {
    const sessionCodeInputEl = document.getElementById('sessionCodeInput');
    if (sessionCodeInputEl) {
        sessionCodeInputEl.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }
}

// ========== 3D Carousel 이벤트 ==========
function bindCarouselEvents() {
    // init3DCarousel 내부에서 바인딩되므로 여기서는 제외
    // 하지만 DOMContentLoaded 이후에 호출되므로 별도로 바인딩 필요할 수 있음
    // 일단 init3DCarousel 내부의 이벤트 바인딩은 그대로 유지하고,
    // init3DCarousel 호출 시점에 바인딩되도록 함
}

// ========== 메모리 등록 이벤트 ==========
function bindMemoryRegistrationEvents() {
    document.addEventListener('DOMContentLoaded', function() {
        const registrationScreen = document.getElementById('memory-registration-screen');
        if (!registrationScreen) return;

        const sendBtn = document.getElementById('registrationSendBtn');
        const textInput = document.getElementById('registrationTextInput');
        const voiceBtn = document.getElementById('registrationVoiceBtn');
        const finishBtn = document.querySelector('.finish-registration-btn');
        const closeBtn = document.querySelector('.close-registration-btn');
        const reviewConfirmBtn = document.getElementById('reviewConfirmBtn');
        const reviewBackBtn = document.getElementById('reviewBackBtn');
        const addChoiceBtn = document.getElementById('addChoiceBtn');

        if (sendBtn && textInput) {
            sendBtn.addEventListener('click', () => {
                const input = textInput.value.trim();
                if (input && window.handleRegistrationInput) {
                    window.handleRegistrationInput(input);
                    textInput.value = '';
                }
            });

            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendBtn.click();
                }
            });
        }

        if (voiceBtn) {
            let isRecording = false;
            let recognition = null;

            voiceBtn.addEventListener('click', async () => {
                if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                    if (window.showNotification) {
                        window.showNotification('이 브라우저는 음성 인식을 지원하지 않습니다');
                    }
                    return;
                }

                if (isRecording) {
                    if (recognition) {
                        recognition.stop();
                        recognition = null;
                    }
                    isRecording = false;
                    voiceBtn.textContent = '🎤';
                    return;
                }

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.lang = 'ko-KR';
                recognition.continuous = false;
                recognition.interimResults = true;

                recognition.onresult = (event) => {
                    let finalText = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalText += event.results[i][0].transcript;
                        }
                    }
                    if (finalText && textInput) {
                        textInput.value = finalText.trim();
                    }
                };

                recognition.onend = () => {
                    isRecording = false;
                    voiceBtn.textContent = '🎤';
                    if (recognition) {
                        recognition = null;
                    }
                };

                recognition.onerror = (event) => {
                    console.error('음성 인식 오류:', event.error);
                    isRecording = false;
                    voiceBtn.textContent = '🎤';
                    if (event.error === 'not-allowed' && window.showNotification) {
                        window.showNotification('마이크 권한이 필요합니다');
                    }
                };

                try {
                    recognition.start();
                    isRecording = true;
                    voiceBtn.textContent = '⏹';
                } catch (e) {
                    console.error('음성 인식 시작 실패:', e);
                    if (window.showNotification) {
                        window.showNotification('음성 인식을 시작할 수 없습니다');
                    }
                }
            });
        }

        if (finishBtn && window.finishRegistration) {
            finishBtn.addEventListener('click', window.finishRegistration);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (confirm('기억 등록을 취소하시겠습니까? 저장되지 않은 내용은 사라집니다.') && window.closeRegistrationScreen) {
                    window.closeRegistrationScreen();
                }
            });
        }

        if (reviewConfirmBtn && window.confirmScene) {
            reviewConfirmBtn.addEventListener('click', window.confirmScene);
        }

        if (reviewBackBtn) {
            reviewBackBtn.addEventListener('click', () => {
                if (window.memoryRegistrationState) {
                    window.memoryRegistrationState.phase = 'collecting';
                }
                const conversationEl = document.getElementById('registration-conversation');
                const reviewEl = document.getElementById('registration-review');
                if (reviewEl) reviewEl.classList.add('hidden');
                if (conversationEl) conversationEl.classList.remove('hidden');
            });
        }

        if (addChoiceBtn) {
            addChoiceBtn.addEventListener('click', () => {
                const choicesContainer = document.getElementById('reviewChoices');
                if (choicesContainer) {
                    const choiceInput = document.createElement('input');
                    choiceInput.type = 'text';
                    choiceInput.placeholder = '선택지 텍스트 입력';
                    choiceInput.className = 'choice-input';
                    choicesContainer.appendChild(choiceInput);
                    choiceInput.focus();
                }
            });
        }
    });
}

// ========== The Confession 이벤트 ==========
function bindConfessionEvents() {
    // 기억 등록 버튼 → The Confession 시작
    const registerBtn = document.getElementById('registerMemoryBtn') || document.querySelector('.register-memory-btn');
    if (registerBtn) {
        registerBtn.onclick = null; // 기존 onclick 제거
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.startConfession) window.startConfession();
        });
    }
    
    // 종료 버튼
    const exitBtn = document.querySelector('.confession-exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            if (confirm('기억 등록을 중단하시겠습니까?') && window.endConfession) {
                window.endConfession();
            }
        });
    }
    
    // Step 0: 입장 버튼
    const enterBtn = document.querySelector('.confession-enter-btn');
    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            if (window.nextStep) window.nextStep();
        });
    }
    
    // Step 2: 앵커 입력
    const anchorInput = document.querySelector('.anchor-input');
    if (anchorInput) {
        anchorInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && anchorInput.value.trim()) {
                // 안전 체크
                if (window.checkSafetyBeforeSubmit && !window.checkSafetyBeforeSubmit(anchorInput.value.trim(), anchorInput)) {
                    return; // 위기 감지 시 차단
                }
                
                if (window.confessionState) {
                    window.confessionState.ritualData.anchorObject = anchorInput.value.trim();
                }
                const pinnedEl = document.querySelector('.anchor-pinned');
                if (pinnedEl) {
                    pinnedEl.textContent = anchorInput.value.trim();
                    pinnedEl.classList.remove('hidden');
                }
                setTimeout(() => {
                    if (window.nextStep) window.nextStep();
                }, 500);
            }
        });
    }
    
    // Step 3: 발화 입력
    const leadInput = document.querySelector('.lead-input');
    if (leadInput) {
        leadInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && leadInput.value.trim()) {
                // 안전 체크
                if (window.checkSafetyBeforeSubmit && !window.checkSafetyBeforeSubmit(leadInput.value.trim(), leadInput)) {
                    return; // 위기 감지 시 차단
                }
                
                if (window.confessionState) {
                    window.confessionState.ritualData.action = leadInput.value.trim();
                }
                setTimeout(() => {
                    if (window.nextStep) window.nextStep();
                }, 500);
            }
        });
    }
    
    // Step 4: 충돌 입력
    const crashInput = document.querySelector('.crash-input');
    if (crashInput) {
        crashInput.addEventListener('blur', () => {
            if (crashInput.value.trim()) {
                // 안전 체크
                if (window.checkSafetyBeforeSubmit && !window.checkSafetyBeforeSubmit(crashInput.value.trim(), crashInput)) {
                    return; // 위기 감지 시 차단
                }
                
                if (window.confessionState) {
                    window.confessionState.ritualData.conflict = crashInput.value.trim();
                }
                setTimeout(() => {
                    if (window.nextStep) window.nextStep();
                }, 500);
            }
        });
    }
    
    // Step 5: 봉인 입력
    const sealInput = document.querySelector('.seal-input');
    const saveBtn = document.querySelector('.confession-save-btn');
    if (sealInput) {
        sealInput.addEventListener('input', () => {
            if (sealInput.value.trim() && saveBtn) {
                saveBtn.classList.remove('hidden');
            } else if (saveBtn) {
                saveBtn.classList.add('hidden');
            }
        });
        
        sealInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && sealInput.value.trim()) {
                e.preventDefault();
                e.stopPropagation();
                
                const inputValue = sealInput.value.trim();
                
                // 안전 체크
                if (window.checkSafetyBeforeSubmit && !window.checkSafetyBeforeSubmit(inputValue, sealInput)) {
                    return; // 위기 감지 시 차단
                }
                
                // 즉시 UI 업데이트 (비동기 작업 전에)
                if (window.confessionState) {
                    window.confessionState.ritualData.emotionWord = inputValue;
                }
                sealInput.value = ''; // 입력창 바로 비우기
                sealInput.blur(); // 포커스 제거
                if (saveBtn) {
                    saveBtn.classList.add('hidden');
                }
                
                // 비동기 작업은 다음 틱에 실행
                setTimeout(() => {
                    if (window.generateSceneFromRitual) window.generateSceneFromRitual();
                }, 0);
            }
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (sealInput && sealInput.value.trim()) {
                const inputValue = sealInput.value.trim();
                
                // 안전 체크
                if (window.checkSafetyBeforeSubmit && !window.checkSafetyBeforeSubmit(inputValue, sealInput)) {
                    return; // 위기 감지 시 차단
                }
                
                if (window.confessionState) {
                    window.confessionState.ritualData.emotionWord = inputValue;
                }
                sealInput.value = ''; // 입력창 바로 비우기
                saveBtn.classList.add('hidden');
                if (window.generateSceneFromRitual) window.generateSceneFromRitual();
            }
        });
    }
    
    // 결과 화면 완료 버튼
    const completeBtn = document.querySelector('.confession-complete-btn');
    if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
            // 장면을 scenes 배열에 추가
            if (window.confessionState) {
                if (!window.confessionState.scenes) window.confessionState.scenes = [];
                if (window.confessionState.generatedScene) {
                    window.confessionState.scenes.push(window.confessionState.generatedScene);
                }
                
                // 다음 장면 수집할지 물어보기
                const continueMore = confirm(`장면 ${window.confessionState.scenes.length}개 수집됨. 다음 장면을 추가할까요?`);
                
                if (continueMore) {
                    // 상태 초기화하고 Step 0부터 다시
                    window.confessionState.ritualData = {
                        sensory: { temperature: '', smell: '', sound: '' },
                        anchorObject: '',
                        action: '',
                        conflict: '',
                        emotionWord: ''
                    };
                    window.confessionState.generatedScene = null;
                    if (window.renderStep) window.renderStep(0);
                } else {
                    // 최종 저장
                    if (window.saveConfessionToDB) await window.saveConfessionToDB();
                }
            }
        });
    }
}

// ========== 비교 화면 이벤트 ==========
function bindComparisonEvents() {
    // endComparisonSession 내부에서 동적으로 바인딩되므로 여기서는 제외
    // dot.onclick은 renderComparisonView 내부에서 바인딩
}

// ========== 스와이퍼 이벤트 ==========
function bindSwiperEvents() {
    // initSwiper 내부에서 바인딩되므로 여기서는 제외
}
