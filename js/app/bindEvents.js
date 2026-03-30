// js/app/bindEvents.js
// 모든 벤트 바인딩 코드 중앙 서 manage

import { showNotification } from '../ui/notify.js';

/**
 * 모든 벤트 listener 등록하 function
 * @param {Object} deps - 존성 object
 * @param {Object} deps.store - appStore
 * @param {Object} deps.engine - ByeoriEngine
 * @param {Object} deps.ui - UIManager
 * @param {Object} deps.visualizer - Visualizer
 * @param {Object} deps.network - NetworkService
 * @param {Object} deps.realtime - RealtimeService
 * @param {Object} deps.flow - FlowController (TODO: 구현 needed)
 * @param {Object} deps.memory - MemoryService
 * @param {Object} deps.ai - AIService
 */
export function bindEvents(deps) {
    const { store, engine, ui, visualizer, network, realtime, flow, memory, ai } = deps;

 // ========== global function 접근 (window ) ==========
 // 벤트 handler 서 되 global function들 window 접근

 // ========== 1. init 벤트 ==========
 // DOMContentLoaded 미 index.js 서 process되므 여기서 제외
 // (initApp 내부 서 bindEvents call하 록 변경)

 // ========== 2. 오프닝 screen 벤트 ==========
    bindOpeningEvents();

 // ========== 3. 그인/회원 입 벤트 ==========
    bindAuthEvents();

 // ========== 4. archive mode 벤트 ==========
    bindArchiveEvents();

 // ========== 5. Live mode 벤트 ==========
    bindLiveEvents();

 // ========== 6. emotion input 벤트 ==========
    bindEmotionInputEvents();

 // ========== 7. session 코드 input 벤트 ==========
    bindSessionCodeEvents();

 // ========== 8. 3D Carousel 벤트 ==========
    bindCarouselEvents();

 // ========== 9. memory 등록 벤트 ==========
    bindMemoryRegistrationEvents();

 // ========== 10. The Confession 벤트 ==========
    bindConfessionEvents();

 // ========== 11. comparison screen 벤트 ==========
    bindComparisonEvents();

 // ========== 12. 스 퍼 벤트 ==========
    bindSwiperEvents();
}

// ========== 오프닝 screen 벤트 ==========
function bindOpeningEvents() {
    // OAuth 리다이렉트 직후 index.js의 checkOAuthRedirect가 오프닝을 숨긴 뒤,
    // 여기서 다시 display:flex를 주면 오프닝이 덮어씌워지는 버그가 난다.
    const oauthSkipOpening = !!window.__oauthRedirectSkipOpening;

 // 오프닝 sound 및 UI init
    const openingSound = document.getElementById('openingSound');
    if (openingSound) {
        openingSound.addEventListener('error', function (e) {
            console.error('오프닝 사운드 로드 실패:', e);
            const error = openingSound.error;
            if (error) {
                console.error('오디오 에러 코드:', error.code, '메시지:', error.message);
            }
        });
        openingSound.addEventListener('canplaythrough', function () {
            console.log('오프닝 사운드 로드 완료');
        });
        openingSound.load();
    }

    const openingScreen = document.getElementById('openingScreen');
    if (openingScreen) {
        if (oauthSkipOpening) {
            openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important';
            openingScreen.classList.add('hidden');
        } else {
            openingScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:3000 !important';
        }
    }

    const waveContainer = document.getElementById('openingWaveContainer');
    if (waveContainer && !oauthSkipOpening) {
        waveContainer.classList.add('visible');
        const canvas = document.getElementById('openingWaveCanvas');
 // startOpeningWaveAnimation index.js 서 window 노출됨
        if (canvas && window.startOpeningWaveAnimation) {
            window.startOpeningWaveAnimation(canvas);
        }
    }
    if (waveContainer && oauthSkipOpening) {
        waveContainer.classList.remove('visible');
    }

    const hint = document.getElementById('openingStartHint');
    if (hint && !oauthSkipOpening) {
        hint.style.opacity = '1';
        hint.classList.add('visible');
    }

    const registerMemoryBtn = document.getElementById('registerMemoryBtn');
    if (registerMemoryBtn && window.startMemoryRegistration) {
        registerMemoryBtn.addEventListener('click', window.startMemoryRegistration);
    }

 // 오프닝 screen 클릭 벤트
    const openingScreenEl = document.getElementById('openingScreen');
    if (openingScreenEl) {
        openingScreenEl.addEventListener('click', function (e) {
            if (window.hasZoomedIn) {
                if (window.skipToIntro) window.skipToIntro();
                return;
            }
            window.hasZoomedIn = true;
            const waveContainer = document.getElementById('openingWaveContainer');
            if (waveContainer) {
                waveContainer.style.transform = 'scale(5, 1)';
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

 // 오프닝 키보드 벤트
    if (window.handleOpeningKeydown) {
        document.addEventListener('keydown', window.handleOpeningKeydown);
    }

 // 오프닝 wave canvas 벤트
 // startOpeningWaveAnimation 내부 서 바인딩되므 여기서 제외
}

// ========== 그인/회원 입 벤트 ==========
function bindAuthEvents() {
    const loginPasswordEl = document.getElementById('loginPassword');
    if (loginPasswordEl) {
        loginPasswordEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && window.handleLogin) {
                window.handleLogin();
            }
        });
    }

    const loginUsernameEl = document.getElementById('loginUsername');
    if (loginUsernameEl) {
        loginUsernameEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                const passwordEl = document.getElementById('loginPassword');
                if (passwordEl) passwordEl.focus();
            }
        });
    }

    const signupPasswordConfirmEl = document.getElementById('signupPasswordConfirm');
    if (signupPasswordConfirmEl) {
        signupPasswordConfirmEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && window.handleSignup) {
                window.handleSignup();
            }
        });
    }

    const signupPasswordEl = document.getElementById('signupPassword');
    if (signupPasswordEl) {
        signupPasswordEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                const confirmEl = document.getElementById('signupPasswordConfirm');
                if (confirmEl) confirmEl.focus();
            }
        });
    }

    const signupEmailEl = document.getElementById('signupEmail');
    if (signupEmailEl) {
        signupEmailEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                const passwordEl = document.getElementById('signupPassword');
                if (passwordEl) passwordEl.focus();
            }
        });
    }

    const signupUsernameEl = document.getElementById('signupUsername');
    if (signupUsernameEl) {
        signupUsernameEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.isComposing) {
                const emailEl = document.getElementById('signupEmail');
                if (emailEl) emailEl.focus();
            }
        });
    }
}

// ========== archive mode 벤트 ==========
function bindArchiveEvents() {
 // freeInput Enter handler renderArchiveFreeInput 서 동적으 바인딩

 // original memory 열람 button (동적으 create되므 renderChoices나 다른 곳 서 바인딩)
 // initProgressDots renderChoices function 내부 서 바인딩하므 여기서 제외
}

// ========== Live mode 벤트 ==========
function bindLiveEvents() {
 // Experiencer emotion input
    const experiencerFeelingInputEl = document.getElementById('experiencerFeelingInput');
    if (experiencerFeelingInputEl) {
        experiencerFeelingInputEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && e.ctrlKey && !e.isComposing && window.submitExperiencerFeeling) {
                e.preventDefault();
                window.submitExperiencerFeeling();
            }
        });
    }

 // Narrator wave 섹션 클릭 (동적으 바인딩되므 startLiveVoiceInput 내부 서 process)
 // switchExpToTextInput, switchExpToVoiceInput, switchToTextInput, switchToVoiceInput 내부 서 바인딩
}

// ========== emotion input 벤트 ==========
function bindEmotionInputEvents() {
 // 미 bindArchiveEvents 서 process됨
}

// ========== session 코드 input 벤트 ==========
function bindSessionCodeEvents() {
    const sessionCodeInputEl = document.getElementById('sessionCodeInput');
    if (sessionCodeInputEl) {
        sessionCodeInputEl.addEventListener('input', function (e) {
            this.value = this.value.toUpperCase();
        });
    }
}

// ========== 3D Carousel 벤트 ==========
function bindCarouselEvents() {
 // init3DCarousel 내부 서 바인딩되므 여기서 제외
 // 하지 DOMContentLoaded 후 call되므 별 바인딩 needed 수 있음
 // 일단 init3DCarousel 내부 벤트 바인딩 그대 maintain하고,
 // init3DCarousel call 시점 바인딩되 록 함
}

// ========== memory 등록 벤트 ==========
function bindMemoryRegistrationEvents() {
    document.addEventListener('DOMContentLoaded', function () {
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
                    showNotification('This browser does not support speech recognition');
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
                    if (recognition) recognition = null;
                };

                recognition.onerror = (event) => {
                    console.error('음성 인식 오류:', event.error);
                    isRecording = false;
                    voiceBtn.textContent = '🎤';
                    if (event.error === 'not-allowed') {
                        showNotification('Microphone permission is required');
                    }
                };

                try {
                    recognition.start();
                    isRecording = true;
                    voiceBtn.textContent = '⏹';
                } catch (e) {
                    console.error('음성 인식 시작 실패:', e);
                    showNotification('Could not start speech recognition');
                }
            });
        }

        if (finishBtn && window.finishRegistration) {
            finishBtn.addEventListener('click', window.finishRegistration);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (confirm('Cancel memory registration? Unsaved content will be lost.') && window.closeRegistrationScreen) {
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
                    choiceInput.placeholder = 'Enter choice text';
                    choiceInput.className = 'choice-input';
                    choicesContainer.appendChild(choiceInput);
                    choiceInput.focus();
                }
            });
        }
    });
}

// ========== The Confession 벤트 ==========
function bindConfessionEvents() {
 // memory 등록 button → The Confession start
    const registerBtn = document.getElementById('registerMemoryBtn') || document.querySelector('.register-memory-btn');
    if (registerBtn) {
        registerBtn.onclick = null; // 기존 onclick 제거
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.startConfession) window.startConfession();
        });
    }

 // end button
    const exitBtn = document.querySelector('.confession-exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            if (confirm('Stop memory registration?') && window.endConfession) {
                window.endConfession();
            }
        });
    }

 // V2 Flow: 벤트 동적으 바인딩되므 정적 바인딩 불needed
 // (renderPrompt() 내부 서 각 input/chip 벤트 바인딩)
}

// ========== comparison screen 벤트 ==========
function bindComparisonEvents() {
 // endComparisonSession 내부 서 동적으 바인딩되므 여기서 제외
 // dot.onclick renderComparisonView 내부 서 바인딩
}

// ========== 스 퍼 벤트 ==========
function bindSwiperEvents() {
 // initSwiper 내부 서 바인딩되므 여기서 제외
}
