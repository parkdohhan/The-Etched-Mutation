// js/app/bindEvents.js
// 모든 벤트 바인딩 코드 중앙 서 manage

import { showNotification } from '../ui/notify.js';
import { isTesterMode } from './testerMode.js';

/**
 * 모든 벤트 listener 등록하 function
 * @param {Object} deps - 존성 object
 * @param {Object} deps.store - appStore
 * @param {Object} deps.engine - ByeoriEngine
 * @param {Object} deps.ui - UIManager
 * @param {Object} deps.visualizer - Visualizer
 * @param {Object} deps.network - NetworkService
 * @param {Object} deps.realtime - RealtimeService
 * @param {Object} deps.flow - Reserved for future FlowController (not needed yet)
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

 // ========== 9. The Confession 벤트 ==========
 // (구 memory 등록 바인딩은 R5-3 에서 제거 — 등록 화면과 진입 버튼 모두 셸에 없음)
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

    // V2-13 (γ-full): 닉네임 박힌 사용자(localStorage `tem_user_name`) = opening 자리 영구 skip.
    // *바로 메뉴*가 박힌 자리. 첫 사용자(닉네임 X) 자리만 디폴트 opening 박음.
    // sessionStorage `tem_skip_opening_once` 자리 = 옛 V2-13 자리(β) 호환 — 박힌 자리 즉시 remove.
    let v213SkipOpening = false;
    try {
        if (sessionStorage.getItem('tem_skip_opening_once') === '1') {
            v213SkipOpening = true;
            sessionStorage.removeItem('tem_skip_opening_once');
        }
        if (localStorage.getItem('tem_user_name')) {
            v213SkipOpening = true;
        }
    } catch (_) {}
    // 261121 우주 무대(space-play.html): 엔딩이 끝나면 오프닝이 아니라 메인 화면(메뉴)으로 간다 (작가 지시).
    // 엔딩이 세운 표시 한 번만 따른다(읽고 바로 지운다). 아래 테스터 모드 무효화도 이 한 번은 받지 않는다.
    // 옛 `tem_skip_opening_once`(옛 지형 무대의 메뉴 복귀)는 그대로 — 그쪽 동작은 바꾸지 않았다.
    let menuAfterEnding = false;
    try {
        if (sessionStorage.getItem('tem_menu_after_ending') === '1') {
            menuAfterEnding = true;
            sessionStorage.removeItem('tem_menu_after_ending');
        }
    } catch (_) {}
    if (menuAfterEnding) v213SkipOpening = true;
    // 260802 테스터 모드 — 재방문이든 뭐든 오프닝을 매번 처음부터 보여준다.
    // (테스터마다 같은 진입을 겪어야 반응을 비교할 수 있다. 풀버전은 위 규칙 그대로.)
    if (isTesterMode() && v213SkipOpening && !menuAfterEnding) {
        v213SkipOpening = false;
        console.info('[opening] 테스터 모드 — 재방문 오프닝 skip 무시, 오프닝 강제 표시');
    }
    const skipOpeningInit = oauthSkipOpening || v213SkipOpening;

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

    // 오프닝 소리: 둥근 버튼을 누르면 옆에 조절 막대 + 끄기/켜기가 나온다 (261123 작가 지시 — 예전엔 끄기/켜기뿐이라 "모 아니면 도").
    // 막대 = 작품 전체 음량(설정·멈춤 화면과 같은 값, localStorage 'tem_volume'). 끄기/켜기 = 오프닝 소리만('tem_opening_muted'). 오프닝 화면이 사라지면 같이 사라짐.
    const openingMuteBtn = document.getElementById('openingMuteBtn');
    const openingMuteIcon = document.getElementById('openingMuteIcon');
    if (openingMuteBtn && openingSound) {
        const ICON_ON = '<path d="M11 5 L6 9 H3 v6 h3 l5 4 z"/><path d="M15.5 9 a4 4 0 0 1 0 6"/><path d="M18.5 6.5 a8 8 0 0 1 0 11"/>';
        const ICON_OFF = '<path d="M11 5 L6 9 H3 v6 h3 l5 4 z"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>';
        const _volNow = () => (typeof window._temGetMasterVolume === 'function' ? window._temGetMasterVolume() : 1);
        // the panel: a slider, and beside it the on/off — it comes out to the left of the round button
        const _panel = document.createElement('div');
        _panel.className = 'opening-mute-btn opening-sound-panel';           // (the class keeps the opening's own click handler off it)
        _panel.style.cssText = 'position:absolute;top:24px;right:92px;height:56px;padding:0 10px 0 20px;display:flex;align-items:center;gap:14px;background:rgba(10,10,12,0.85);border:1px solid rgba(220,196,160,0.45);border-radius:28px;z-index:10;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transform:translateX(14px);pointer-events:none;transition:opacity .45s ease,transform .45s ease;';
        const _slider = document.createElement('input');
        _slider.type = 'range'; _slider.min = '0'; _slider.max = '1'; _slider.step = '0.02'; _slider.value = String(_volNow());
        _slider.setAttribute('aria-label', '소리 크기 / Volume');
        _slider.style.cssText = 'width:150px;accent-color:#c4a882;cursor:pointer;';
        const _panelMute = document.createElement('button');
        _panelMute.type = 'button';
        _panelMute.style.cssText = 'width:38px;height:38px;border-radius:50%;background:none;border:1px solid rgba(220,196,160,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:all .25s ease;';
        _panelMute.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></svg>';
        const _panelIcon = _panelMute.firstChild;
        _panel.appendChild(_slider); _panel.appendChild(_panelMute);
        openingMuteBtn.parentNode.insertBefore(_panel, openingMuteBtn);
        let _panelOpen = false;
        function _showPanel(on) { _panelOpen = on; _panel.style.opacity = on ? '1' : '0'; _panel.style.transform = on ? 'translateX(0)' : 'translateX(14px)'; _panel.style.pointerEvents = on ? 'auto' : 'none'; openingMuteBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
        _panel.addEventListener('click', function (e) { e.stopPropagation(); });
        _slider.addEventListener('input', function () {
            const v = Math.max(0, Math.min(1, parseFloat(_slider.value) || 0));
            if (typeof window._temSetMasterVolume === 'function') window._temSetMasterVolume(v);
            try { openingSound.volume = openingSound.volume; } catch (_) {}   // (re-applies this element's own level under the new master)
            if (v > 0.001 && openingSound.muted) { try { localStorage.setItem('tem_opening_muted', '0'); } catch (_) {} _applyOpeningMute(false); }   // moving the slider up is asking for sound
            else _applyOpeningMute(openingSound.muted);
        });
        _panelMute.addEventListener('click', function (e) {
            e.stopPropagation();
            const next = !openingSound.muted;
            _applyOpeningMute(next);
            try { localStorage.setItem('tem_opening_muted', next ? '1' : '0'); } catch (_) {}
        });
        document.addEventListener('pointerdown', function (e) { if (_panelOpen && !_panel.contains(e.target) && !openingMuteBtn.contains(e.target)) _showPanel(false); });
        function _applyOpeningMute(muted) {
            openingSound.muted = muted;
            const _quiet = muted || _volNow() <= 0.001;
            if (openingMuteIcon) openingMuteIcon.innerHTML = _quiet ? ICON_OFF : ICON_ON;
            if (_panelIcon) _panelIcon.innerHTML = muted ? ICON_OFF : ICON_ON;
            if (_panelMute) { _panelMute.title = muted ? '소리 켜기 / Unmute' : '소리 끄기 / Mute'; _panelMute.setAttribute('aria-label', _panelMute.title); _panelMute.style.color = muted ? 'rgba(220,180,140,0.6)' : 'rgba(245,222,189,1)'; }
            openingMuteBtn.setAttribute('aria-label', '소리 조절 / Sound');
            openingMuteBtn.title = '소리 조절 / Sound';
            openingMuteBtn.style.color = muted ? 'rgba(220,180,140,0.75)' : 'rgba(240,216,180,0.95)';
            openingMuteBtn.style.borderColor = muted ? 'rgba(220,196,160,0.45)' : 'rgba(220,196,160,0.7)';
        }
        let _initialMuted = false;
        try { _initialMuted = localStorage.getItem('tem_opening_muted') === '1'; } catch (_) {}
        _applyOpeningMute(_initialMuted);
        openingMuteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            _slider.value = String(_volNow());
            _showPanel(!_panelOpen);                                         // the round button no longer mutes: it brings the slider out
        });
        openingMuteBtn.addEventListener('mouseenter', function () {
            openingMuteBtn.style.borderColor = 'rgba(240,216,180,0.95)';
            openingMuteBtn.style.color = openingSound.muted ? 'rgba(240,216,180,0.95)' : 'rgba(255,232,200,1)';
            openingMuteBtn.style.background = 'rgba(10,10,12,0.75)';
        });
        openingMuteBtn.addEventListener('mouseleave', function () {
            openingMuteBtn.style.borderColor = openingSound.muted ? 'rgba(220,196,160,0.45)' : 'rgba(220,196,160,0.7)';
            openingMuteBtn.style.color = openingSound.muted ? 'rgba(220,180,140,0.75)' : 'rgba(240,216,180,0.95)';
            openingMuteBtn.style.background = 'rgba(10,10,12,0.55)';
        });
    }

    const openingScreen = document.getElementById('openingScreen');
    if (openingScreen) {
        if (skipOpeningInit) {
            openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important';
            openingScreen.classList.add('hidden');
        } else {
            openingScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:3000 !important';
        }
    }
    // V2-13: opening skip 자리 = introScreen(메뉴 자리) 직접 visible 박음 (oauth 자리 패턴 차용).
    if (v213SkipOpening) {
        const introScreen = document.getElementById('introScreen');
        if (introScreen) {
            introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important';
            introScreen.classList.add('visible');
            introScreen.classList.remove('hidden');
        }
        // startOpeningSequence 안 가드(opening.js:838 `__oauthRedirectSkipOpening`) 도 한 번 박음.
        window.__oauthRedirectSkipOpening = true;
    }

    const waveContainer = document.getElementById('openingWaveContainer');
    if (waveContainer && !skipOpeningInit) {
        waveContainer.classList.add('visible');
        const canvas = document.getElementById('openingWaveCanvas');
 // startOpeningWaveAnimation index.js 서 window 노출됨
        if (canvas && window.startOpeningWaveAnimation) {
            window.startOpeningWaveAnimation(canvas);
        }
    }
    if (waveContainer && skipOpeningInit) {
        waveContainer.classList.remove('visible');
    }

    const hint = document.getElementById('openingStartHint');
    if (hint && !skipOpeningInit) {
        hint.style.opacity = '1';
        hint.classList.add('visible');
    }

 // (registerMemoryBtn → startMemoryRegistration 바인딩은 R5-3 에서 제거.
 //  해당 버튼도, 등록 화면도 셸에 존재하지 않았다.)

 // v2: 온보딩 완료 플래그 기반 오프닝 스킵은 데모 기간 동안 비활성화 — 매 진입마다 오프닝 강제 노출.

 // v2: 오프닝 클릭은 초기 웨이브·사운드 시작만 담당. "Press any key → 메뉴" 스킵 폐기.
    const openingScreenEl = document.getElementById('openingScreen');
    if (openingScreenEl) {
        openingScreenEl.addEventListener('click', function (e) {
            if (window.hasZoomedIn) return; // 두 번째 클릭부터는 v2 시퀀스가 Start 버튼으로 진행
            // 버튼 내부 클릭은 무시 (Start 버튼이 자기 핸들러 처리)
            if (e.target && (e.target.closest('.opening-lang-btn') || e.target.closest('.opening-start-btn') || e.target.closest('.opening-mute-btn'))) return;
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
            setTimeout(() => {
                if (!window.openingSequenceStarted) {
                    window.openingSequenceStarted = true;
                    if (window.startOpeningSequence) window.startOpeningSequence();
                }
            }, 800);
        });
    }
    // v2: 키보드 스킵 폐기 — 메뉴가 없으므로 스킵 대상 없음

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
