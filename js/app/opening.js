/**
 * Opening Sequence Module — wave animation, NPC dialogue, audio fade, and skip logic.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   (none — this module is self-contained)
 */

import { NPC_DIALOGUES } from '../npc-dialogues.js';

// === Module State ===
let openingSkipped = false;
let openingWaveAnimationId = null;
let openingMouseX = -100;
let openingMouseY = -100;
let hasZoomedIn = false;
let openingSequenceStarted = false;
let openingSound = null;
let fadeOutAnimationId = null;
let fadeOutInterval = null;
let crossfadeTimeUpdateHandler = null;
let crossfadeEndedHandler = null;

// ─────────────────────────────────────
// === Text Utilities ===
// ─────────────────────────────────────

function typeText(element, text, callback) { let index = 0; element.textContent = ''; element.classList.add('typing'); function typeChar() { if (index < text.length) { element.textContent += text.charAt(index); index++; setTimeout(typeChar, 50) } else { element.classList.remove('typing'); if (callback) callback() } } typeChar() }
function typeTextAsync(element, text, speed = 80) { return new Promise(resolve => { element.classList.add('typing'); let i = 0; element.textContent = ''; const timer = setInterval(() => { if (i < text.length) { element.textContent += text.charAt(i); i++ } else { clearInterval(timer); element.classList.remove('typing'); resolve() } }, speed) }) }
function typeDots(element, callback) { element.textContent = '\n'; element.classList.add('typing'); let dotCount = 0; function addDot() { if (dotCount < 3) { element.textContent += '.'; dotCount++; setTimeout(addDot, 300) } else { element.classList.remove('typing'); if (callback) callback() } } addDot() }

// ─────────────────────────────────────
// === NPC Intro ===
// ─────────────────────────────────────

async function playNpcIntro() { const centerWrapper = document.querySelector('.intro-center-wrapper'); const dialogue = document.getElementById('npcIntroDialogue'); if (!centerWrapper || !dialogue) return; await new Promise(r => setTimeout(r, 2000)); centerWrapper.classList.add('lifted'); await new Promise(r => setTimeout(r, 1000)); dialogue.classList.add('visible'); await typeTextAsync(dialogue, NPC_DIALOGUES.intro.firstVisit, 100); await new Promise(r => setTimeout(r, 1500)); dialogue.textContent = ''; await typeTextAsync(dialogue, NPC_DIALOGUES.intro.returning, 80); await new Promise(r => setTimeout(r, 2000)); dialogue.classList.remove('visible'); await new Promise(r => setTimeout(r, 500)); centerWrapper.classList.remove('lifted') }

// ─────────────────────────────────────
// === Audio ===
// ─────────────────────────────────────

function fadeInSound(audio, targetVolume = 0.6, duration = 4000) { if (!audio) { console.error('fadeInSound: audio 요소가 not found'); return } audio.volume = 0; const playPromise = audio.play(); if (playPromise !== undefined) { playPromise.then(() => { console.log('opening 사운드 재생 시작'); const steps = 60; const step = targetVolume / steps; const interval = duration / steps; let currentStep = 0; const fade = setInterval(() => { currentStep++; if (currentStep < steps) { audio.volume = Math.min(1, Math.max(0, Math.min(step * currentStep, targetVolume))) } else { audio.volume = Math.min(1, Math.max(0, targetVolume)); clearInterval(fade) } }, interval) }).catch(e => { console.error('opening 사운드 재생 Failed:', e); console.error('오디오 Status:', { readyState: audio.readyState, networkState: audio.networkState, error: audio.error }) }) } }

function fadeOutSound(audio, duration = 3000) { if (!audio) return; if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (crossfadeTimeUpdateHandler && audio) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && audio) { audio.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } const startVolume = Math.max(audio.volume || 0, 0.01); if (startVolume <= 0) { audio.pause(); audio.currentTime = 0; return } if (audio.paused) { audio.play().catch(() => { }) } const startTime = performance.now(); let lastVolume = startVolume; let pauseCheckInterval = setInterval(() => { if (audio && audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } }, 50); function animateFadeOut(currentTime) { if (!audio) { if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } return } if (audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const newVolume = Math.max(startVolume * (1 - progress), 0); lastVolume = newVolume; try { if (audio) { audio.volume = Math.min(1, Math.max(0.001, Math.max(newVolume, 0.001))) } } catch (e) { console.error('Volume update error:', e) } if (progress >= 1 || newVolume <= 0.01) { if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } setTimeout(() => { try { if (audio) { audio.volume = 0; audio.pause(); audio.currentTime = 0 } } catch (e) { console.error('Audio pause error:', e) } if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } }, 200) } else { fadeOutAnimationId = requestAnimationFrame(animateFadeOut) } } fadeOutAnimationId = requestAnimationFrame(animateFadeOut) }

function setupLoopWithCrossfade(audio, targetVolume = 0.6, fadeDuration = 2) { if (!audio) return; if (crossfadeTimeUpdateHandler) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler) } if (crossfadeEndedHandler) { audio.removeEventListener('ended', crossfadeEndedHandler) } crossfadeTimeUpdateHandler = function () { if (fadeOutInterval) return; const timeLeft = audio.duration - audio.currentTime; if (timeLeft <= fadeDuration && timeLeft > 0) { audio.volume = Math.min(1, Math.max(0, targetVolume * (timeLeft / fadeDuration))) } }; crossfadeEndedHandler = function () { if (fadeOutInterval) return; audio.currentTime = 0; fadeInSound(audio, targetVolume, fadeDuration * 1000) }; audio.addEventListener('timeupdate', crossfadeTimeUpdateHandler); audio.addEventListener('ended', crossfadeEndedHandler) }

// ─────────────────────────────────────
// === Dialogue Sequence ===
// ─────────────────────────────────────

function showContinueButton() { if (openingSkipped) return; const startHint = document.getElementById('openingStartHint'); if (startHint) { startHint.style.opacity = ''; startHint.classList.add('visible') } }
function showFourthText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nCome in.', function () { if (openingSkipped) return; setTimeout(showContinueButton, 500) }) }
function showThirdText(dialogue) { if (openingSkipped) return; typeDots(dialogue, function () { if (openingSkipped) return; setTimeout(function () { showFourthText(dialogue) }, 1200) }) }
function showSecondText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n...you came looking for a memory?', function () { if (openingSkipped) return; setTimeout(function () { showThirdText(dialogue) }, 1200) }) }
function showFirstTextPart1(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nHello.', function () { if (openingSkipped) return; setTimeout(function () { showFirstTextPart2(dialogue) }, 1500) }) }
function showFirstTextPart2(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nYou\'re here. It\'s been a while.', function () { if (openingSkipped) return; setTimeout(function () { showSecondText(dialogue) }, 1200) }) }

// ─────────────────────────────────────
// === Wave Animation ===
// ─────────────────────────────────────

function startOpeningWaveAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        openingMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
        openingMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
    });
    canvas.addEventListener('mouseleave', function () {
        openingMouseX = -100;
        openingMouseY = -100;
    });

    const width = canvas.width / 2;
    const height = canvas.height / 2;
    const maxAmplitude = height * 0.35;

    const waves = [
        { color: 'rgba(100,130,150,', baseOpacity: 0.10, speed: 0.010, amplitude: Math.min(80, maxAmplitude), phase: 0, freq: 0.020, noiseScale: 0.8 },
        { color: 'rgba(120,150,170,', baseOpacity: 0.15, speed: 0.014, amplitude: Math.min(70, maxAmplitude * 0.9), phase: 0.6, freq: 0.025, noiseScale: 0.7 },
        { color: 'rgba(130,155,175,', baseOpacity: 0.20, speed: 0.018, amplitude: Math.min(60, maxAmplitude * 0.8), phase: 1.2, freq: 0.030, noiseScale: 0.6 },
        { color: 'rgba(140,165,185,', baseOpacity: 0.26, speed: 0.022, amplitude: Math.min(55, maxAmplitude * 0.7), phase: 1.9, freq: 0.035, noiseScale: 0.5 },
        { color: 'rgba(155,175,195,', baseOpacity: 0.33, speed: 0.026, amplitude: Math.min(45, maxAmplitude * 0.6), phase: 2.6, freq: 0.040, noiseScale: 0.4 },
        { color: 'rgba(170,190,205,', baseOpacity: 0.42, speed: 0.030, amplitude: Math.min(35, maxAmplitude * 0.5), phase: 3.3, freq: 0.045, noiseScale: 0.3 },
        { color: 'rgba(190,205,215,', baseOpacity: 0.52, speed: 0.034, amplitude: Math.min(28, maxAmplitude * 0.4), phase: 4.0, freq: 0.050, noiseScale: 0.25 },
    ];

    let time = 0;

    function animate() {
        ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
        ctx.fillRect(0, 0, width, height);

        const centerY = height / 2;

        waves.forEach((wave) => {
            ctx.beginPath();
            ctx.lineWidth = 1.2;

            for (let x = 0; x < width; x++) {
                const baseY = centerY
                    + Math.sin(x * wave.freq + time * wave.speed + wave.phase) * wave.amplitude
                    + Math.sin(x * wave.freq * 0.5 + time * wave.speed * 0.6 + wave.phase * 1.4) * (wave.amplitude * 0.4)
                    + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.3) * (wave.amplitude * 0.15)
                    + Math.sin(x * wave.freq * 0.3 + time * wave.speed * 0.4 + wave.phase * 2.1) * (wave.amplitude * 0.25)
                    + Math.sin(x * wave.freq * 3.7 + time * wave.speed * 1.8 + wave.phase * 0.7) * (wave.amplitude * 0.1);

                const noise = Math.sin(x * 0.003 + time * 0.02) * Math.cos(x * 0.007 + time * 0.015) * wave.noiseScale;
                const irregularOffset = wave.amplitude * noise * 0.4;

                let hoverPush = 0;
                if (openingMouseX >= 0 && openingMouseY >= 0) {
                    const distX = Math.abs(x - openingMouseX);
                    const distY = Math.abs(baseY - openingMouseY);
                    const dist = Math.sqrt(distX * distX + distY * distY);

                    const influenceRadius = 200;
                    const normalizedDist = Math.min(dist / influenceRadius, 1);
                    const influence = Math.pow(1 - normalizedDist, 3);

                    if (influence > 0) {
                        const pushDirection = openingMouseY - baseY;
                        const xNormalized = Math.min(distX / influenceRadius, 1);
                        const xInfluence = Math.pow(1 - xNormalized, 2);

                        hoverPush = pushDirection * influence * xInfluence * 1.35;

                        const amplitudeBoost = influence * 0.8;
                        hoverPush += (baseY - centerY) * amplitudeBoost;

                        const rippleEffect = Math.sin(distX * 0.05) * influence * 15;
                        hoverPush += rippleEffect;
                    }
                }

                const y = baseY + irregularOffset + hoverPush;
                const clampedY = Math.max(2, Math.min(height - 2, y));

                x === 0 ? ctx.moveTo(x, clampedY) : ctx.lineTo(x, clampedY);
            }

            ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
            ctx.stroke();
        });

        time += 0.5;
        if (!openingSkipped) {
            openingWaveAnimationId = requestAnimationFrame(animate);
        }
    }

    animate();
}

// ─────────────────────────────────────
// === Sequence Orchestration ===
// ─────────────────────────────────────

function startOpeningSequence() { if (openingSkipped || window.__oauthRedirectSkipOpening) return; const waveContainer = document.getElementById('openingWaveContainer'); if (waveContainer) { waveContainer.style.transform = 'scale(5, 1)'; waveContainer.style.opacity = '1'; waveContainer.classList.add('visible') } const canvas = document.getElementById('openingWaveCanvas'); if (canvas) startOpeningWaveAnimation(canvas); setTimeout(function () { if (openingSkipped) return; const dialogue = document.getElementById('openingDialogue'); if (dialogue) showFirstTextPart1(dialogue) }, 2500) }

function skipOpening() { if (openingSkipped) return; openingSkipped = true; if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null } const sound = openingSound || document.getElementById('openingSound'); if (sound) { if (crossfadeTimeUpdateHandler && sound) { sound.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && sound) { sound.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } fadeOutSound(sound, 500); setTimeout(() => { finishOpeningSequence() }, 600) } else { finishOpeningSequence() } }

function skipToIntro() { openingSequenceStarted = true; skipOpening() }

function handleOpeningKeydown(e) { if (!openingSkipped) { const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''; if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return; e.preventDefault(); skipOpening() } }

function finishOpeningSequence() { const openingScreen = document.getElementById('openingScreen'); const introScreen = document.getElementById('introScreen'); if (openingScreen) { openingScreen.removeEventListener('click', skipOpening); openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; openingScreen.classList.add('hidden') } document.removeEventListener('keydown', handleOpeningKeydown); if (introScreen) { introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important'; introScreen.classList.add('visible'); introScreen.classList.remove('hidden') } playNpcIntro() }

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // Audio
    fadeInSound,
    fadeOutSound,
    setupLoopWithCrossfade,

    // Sequence control
    startOpeningSequence,
    startOpeningWaveAnimation,
    skipToIntro,
    handleOpeningKeydown,

    // NPC
    playNpcIntro,
};
