// js/ui/Visualizer.js
// 캔버스 렌더링 전담 (계산 금지, 숫자만 입력)

/**
 * Visualizer - 캔버스 렌더링 전담
 * 계산 로직은 포함하지 않음, 이미 계산된 숫자만 받아서 그리기
 */

export class Visualizer {
    constructor() {
        // 애니메이션 ID 관리
        this.alignmentWaveAnimationId = null;
        this.comparisonWaveAnimationId = null;

        // 시간 상태
        this.alignmentWaveTime = 0;
        this.comparisonWaveTime = 0;

        // 마우스 상태 (정렬도 파동용)
        this.alignmentIsMouseDown = false;
        this.alignmentMouseX = 0;
        this.alignmentMouseY = 0;

        // 파동 override (흡수 연출용)
        this._waveOverride = null; // { speedMultiplier: 0-1, colorOverride: {r,g,b} }
        this._frozenTime = null;   // 파동 정지 시 고정된 시간값

        // 투명 배경 모드 (ambient wave용)
        this.transparentBackground = false;
        // 파동 두께 배율
        this.lineWidthMultiplier = 1;

        // ── 파동 전환 (transition) 상태 ──
        this._waveTx = null;       // { fromNarrator, fromExperiencer, progress, duration }
        this._prevNarratorWaveStyle = null;
        this._prevExperiencerWaveStyle = null;
    }

    /** 두 waveStyle 사이를 easeInOutQuad로 보간 */
    _lerpWaveStyle(a, b, t) {
        if (!a || !b) return b || a;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return {
            color: {
                r: Math.round(a.color.r + (b.color.r - a.color.r) * e),
                g: Math.round(a.color.g + (b.color.g - a.color.g) * e),
                b: Math.round(a.color.b + (b.color.b - a.color.b) * e),
            },
            speed: a.speed + (b.speed - a.speed) * e,
            amplitude: a.amplitude + (b.amplitude - a.amplitude) * e,
            frequency: a.frequency + (b.frequency - a.frequency) * e,
            chaos: a.chaos + (b.chaos - a.chaos) * e,
        };
    }

    /** 유령 요동 — 전환 중 파동이 위아래로 요동치다 잦아듦 */
    _ghostTremor(x, t, progress) {
        const intensity = Math.pow(1 - progress, 2.5);
        const tremAmp = intensity * 10;
        return Math.sin(x * 0.06 + t * 8) * tremAmp
             + Math.sin(x * 0.02 - t * 3.5) * tremAmp * 0.6;
    }

    /** 파동 override 설정 (흡수 연출: 진폭 감쇠 + 탈채도) */
    setWaveOverride(override) { this._waveOverride = override; }
    /** 파동 override 해제 */
    clearWaveOverride() { this._waveOverride = null; this._frozenTime = null; }

    /**
     * 노이즈 함수 (파동 효과용)
     * @private
     */
    _noise(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453;
        return n - Math.floor(n);
    }

    /**
     * 아카이브 감정 파동 렌더링
     * @param {HTMLCanvasElement} canvas - 캔버스 요소
     * @param {Object} waveData - 파동 데이터 { color, frequency, amplitude }
     * @param {number} time - 시간 값
     */
    renderArchiveEmotionWave(canvas, waveData, time) {
        if (!canvas || !waveData) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        
        ctx.fillStyle = 'rgba(18,18,26,0.1)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.beginPath();
        const c = waveData.color;
        ctx.strokeStyle = typeof c === 'string' ? c : `rgba(${c.r},${c.g},${c.b},0.6)`;
        ctx.lineWidth = 1.5;

        const effectiveAmplitude = Math.min(waveData.amplitude, centerY * 0.8);
        for (let x = 0; x < width; x++) {
            const y = centerY + Math.sin(x * waveData.frequency + time) * effectiveAmplitude;
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }

    /**
     * 정렬도 파동 그리기
     * @param {HTMLCanvasElement} canvas - 캔버스 요소
     * @param {number} offsetY - Y 오프셋
     * @param {number} opacity - 투명도
     * @param {number} timeOffset - 시간 오프셋
     * @param {Object} waveStyle - 파동 스타일 { color: {r,g,b}, speed, amplitude, frequency, chaos }
     * @param {Object} mouseState - 마우스 상태 { isDown, x, y } (선택)
     */
    drawAlignmentWave(canvas, offsetY, opacity, timeOffset, waveStyle, mouseState = null, txProgress = -1) {
        if (!canvas || !waveStyle) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const liveTime = this.alignmentWaveTime + timeOffset;
        // 파동 정지: speedMultiplier가 0에 가까울수록 frozenTime에 고정
        const _spdMul = this._waveOverride ? this._waveOverride.speedMultiplier : 1;
        if (_spdMul < 1 && this._frozenTime == null) this._frozenTime = liveTime;
        const t = this._frozenTime != null
            ? this._frozenTime + (liveTime - this._frozenTime) * _spdMul
            : liveTime;
        const points = [];
        const segments = 100;

        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            const normalizedX = x / width;
            let y = Math.sin(x * waveStyle.frequency + t * waveStyle.speed) * waveStyle.amplitude;
            y += Math.sin(x * waveStyle.frequency * 2.3 + t * waveStyle.speed * 0.7) * (waveStyle.amplitude * 0.4);
            y += Math.sin(x * waveStyle.frequency * 0.4 + t * waveStyle.speed * 0.3) * (waveStyle.amplitude * 0.6);

            if (mouseState && mouseState.isDown) {
                const rect = canvas.getBoundingClientRect();
                const canvasMouseX = mouseState.x - rect.left;
                const canvasMouseY = mouseState.y - rect.top;
                const dx = x - canvasMouseX;
                const dy = offsetY - canvasMouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const influence = Math.max(0, 1 - dist / 300);
                y += Math.sin(dist * 0.02 - t * 2) * influence * 80;
            }

            // 전환 중: 유령 요동
            if (txProgress >= 0 && txProgress < 1) {
                y += this._ghostTremor(x, t, txProgress);
            }

            const edgeFade = Math.sin(normalizedX * Math.PI);
            y *= edgeFade;
            points.push({ x, y: offsetY + y });
        }

        const color = this._waveOverride && this._waveOverride.colorOverride
            ? this._waveOverride.colorOverride : waveStyle.color;
        const mult = (this.lineWidthMultiplier || 1);

        // Dual stroke 빛나는 실 — outer halo + inner core
        // halo 가 너비 + shadowBlur 로 빛 번짐, core 가 얇은 밝은 선.
        // transparentBackground 모드와 결합되면 trail 위에 누적되어 몽환적 잔상.

        // path build (한 번만)
        const buildPath = () => {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        };

        // 1) Outer halo — 흐릿한 빛 번짐 (선 자체보다 glow 가 본체)
        buildPath();
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${opacity * 0.18})`;
        ctx.lineWidth = 2.5 * mult;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},${Math.min(0.5, opacity * 0.55)})`;
        ctx.shadowBlur = 8 * mult;
        ctx.stroke();

        // 2) Mid layer — 가는 본체
        buildPath();
        ctx.shadowBlur = 2 * mult;
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${opacity * 0.45})`;
        ctx.lineWidth = 1.1 * mult;
        ctx.stroke();

        // 3) Inner core — 매우 얇은 밝은 심
        buildPath();
        ctx.shadowBlur = 0;
        const cr = Math.min(255, color.r + 30);
        const cg = Math.min(255, color.g + 30);
        const cb = Math.min(255, color.b + 30);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${Math.min(0.95, opacity * 0.95)})`;
        ctx.lineWidth = 0.5 * mult;
        ctx.stroke();

        // 투명 배경 모드: 파동 아래를 반투명 그라데이션으로 채움
        if (this.transparentBackground && points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.lineTo(points[points.length - 1].x, height);
            ctx.lineTo(points[0].x, height);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, offsetY - (waveStyle.amplitude || 30), 0, height);
            grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${opacity * 0.3})`);
            grad.addColorStop(0.5, `rgba(${color.r},${color.g},${color.b},${opacity * 0.12})`);
            grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }

    /**
     * 정렬도 파동 애니메이션 시작
     * @param {HTMLCanvasElement} narratorCanvas - 화자 캔버스
     * @param {HTMLCanvasElement} experiencerCanvas - 체험자 캔버스
     * @param {Object} data - 데이터 객체
     * @param {number} data.alignment - 정렬도 값 (0-1)
     * @param {Object} data.narratorEmotionVector - 화자 감정 벡터
     * @param {Object} data.experiencerEmotionVector - 체험자 감정 벡터
     * @param {Object} data.narratorWaveStyle - 화자 파동 스타일 { color, speed, amplitude, frequency, chaos }
     * @param {Object} data.experiencerWaveStyle - 체험자 파동 스타일 { color, speed, amplitude, frequency, chaos }
     * @param {Function} data.onUpdateAlignmentDisplay - 정렬도 표시 업데이트 콜백 (alignment) => void
     */
    startAlignmentWaveAnimation(narratorCanvas, experiencerCanvas, data) {
        const { alignment, narratorEmotionVector, experiencerEmotionVector, narratorWaveStyle, experiencerWaveStyle, onUpdateAlignmentDisplay } = data;

        // 2026-05-06: 같은 캔버스에서 이미 돌고 있으면 *재시작 안 함*. 데이터만 갱신.
        // animateWave 가 매 프레임 this._alignmentWaveData 읽음 → 매끄러운 갱신.
        // 100ms proximity 폴링 같은 빈번한 재호출 자리에서 phase reset · 캔버스 클리어 ·
        // transition 재설정으로 인한 opacity 깜빡임 방지.
        if (this.alignmentWaveAnimationId
            && this._alignmentWaveNarratorCanvas === narratorCanvas
            && this._alignmentWaveExperiencerCanvas === experiencerCanvas) {
            this._alignmentWaveData = data;
            this._prevNarratorWaveStyle = narratorWaveStyle;
            this._prevExperiencerWaveStyle = experiencerWaveStyle;
            return;
        }

        // ── 전환 설정: 이전 스타일이 있으면 보간 (씬 진입/종료 등 *드문 호출* 자리에서만 동작) ──
        const hadPrev = this._prevNarratorWaveStyle || this._prevExperiencerWaveStyle;
        if (hadPrev) {
            // 전환 중 재호출: 현재 보간 중간값을 from으로 사용
            let fromN, fromE;
            if (this._waveTx && this._waveTx.progress < 1) {
                fromN = this._lerpWaveStyle(this._waveTx.fromNarrator, this._prevNarratorWaveStyle, this._waveTx.progress);
                fromE = this._lerpWaveStyle(this._waveTx.fromExperiencer, this._prevExperiencerWaveStyle, this._waveTx.progress);
            } else {
                fromN = this._prevNarratorWaveStyle;
                fromE = this._prevExperiencerWaveStyle;
            }
            const isFast = this._waveTx && this._waveTx.progress < 0.3;
            this._waveTx = {
                fromNarrator: fromN,
                fromExperiencer: fromE,
                progress: 0,
                duration: isFast ? 0.5 : 1.6,
            };
        }
        this._prevNarratorWaveStyle = narratorWaveStyle;
        this._prevExperiencerWaveStyle = experiencerWaveStyle;
        this._alignmentWaveData = data;

        if (this.alignmentWaveAnimationId) {
            cancelAnimationFrame(this.alignmentWaveAnimationId);
        }

        this.alignmentWaveTime = 0;
        this._alignmentWaveNarratorCanvas = narratorCanvas;
        this._alignmentWaveExperiencerCanvas = experiencerCanvas;
        let narratorInitialized = false;
        let experiencerInitialized = false;

        const initializeCanvas = (canvas) => {
            if (!canvas) return false;
            if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return false;
            try {
                const ctx = canvas.getContext('2d');
                canvas.width = canvas.offsetWidth * 2;
                canvas.height = canvas.offsetHeight * 2;
                ctx.scale(2, 2);
                canvas.addEventListener('mousedown', (e) => {
                    this.alignmentIsMouseDown = true;
                    this.alignmentMouseX = e.clientX;
                    this.alignmentMouseY = e.clientY;
                });
                canvas.addEventListener('mousemove', (e) => {
                    this.alignmentMouseX = e.clientX;
                    this.alignmentMouseY = e.clientY;
                });
                canvas.addEventListener('mouseup', () => { this.alignmentIsMouseDown = false; });
                canvas.addEventListener('mouseleave', () => { this.alignmentIsMouseDown = false; });
                return true;
            } catch (e) {
                return false;
            }
        };

        const animateWave = (canvas) => {
            if (!canvas) return;
            try {
                // 매 프레임 활성 데이터 읽음 — startAlignmentWaveAnimation 재호출 시 갱신됨.
                const active = this._alignmentWaveData || data;
                const alignmentValue = active.alignment || 0;
                const activeNarratorEV = active.narratorEmotionVector;
                const activeExperiencerEV = active.experiencerEmotionVector;
                const targetNarratorWS = active.narratorWaveStyle;
                const targetExperiencerWS = active.experiencerWaveStyle;
                const activeOnUpdate = active.onUpdateAlignmentDisplay;

                // 2026-05-06: 프레임 단위 표시 스타일 lerp — 100ms proximity 갱신 사이 *부드럽게* 보간.
                // 0.08 = 매 프레임 8% 타겟 쪽으로 이동 → ~150ms 안에 거의 따라잡음.
                const SMOOTH = 0.08;
                if (targetNarratorWS) {
                    this._displayedNarratorWS = this._displayedNarratorWS
                        ? this._lerpWaveStyle(this._displayedNarratorWS, targetNarratorWS, SMOOTH)
                        : targetNarratorWS;
                } else {
                    this._displayedNarratorWS = null;
                }
                if (targetExperiencerWS) {
                    this._displayedExperiencerWS = this._displayedExperiencerWS
                        ? this._lerpWaveStyle(this._displayedExperiencerWS, targetExperiencerWS, SMOOTH)
                        : targetExperiencerWS;
                } else {
                    this._displayedExperiencerWS = null;
                }
                const activeNarratorWS = this._displayedNarratorWS;
                const activeExperiencerWS = this._displayedExperiencerWS;

                const ctx = canvas.getContext('2d');
                const width = canvas.width / 2;
                const height = canvas.height / 2;

                if (activeOnUpdate) {
                    activeOnUpdate(alignmentValue);
                }

                // ── 전환 보간 처리 ──
                let txProgress = -1;
                let txFromN = null, txFromE = null;
                if (this._waveTx) {
                    this._waveTx.progress = Math.min(1, this._waveTx.progress + 0.016 / this._waveTx.duration);
                    txProgress = this._waveTx.progress;
                    txFromN = this._waveTx.fromNarrator;
                    txFromE = this._waveTx.fromExperiencer;
                    if (this._waveTx.progress >= 1) this._waveTx = null;
                }

                if (this.transparentBackground) {
                    // Frame trail — destination-in 으로 이전 픽셀 alpha 만 약화.
                    // 0.78 = 매 프레임 22% 흐려짐 → ~5프레임 뒤 거의 사라짐. 잔상 trail.
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-in';
                    ctx.fillStyle = 'rgba(0,0,0,0.78)';
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                } else {
                    // 어두운 배경 모드 — alpha 낮춰서 더 부드러운 trail (이전 0.85 → 0.55)
                    ctx.fillStyle = 'rgba(10,10,12,0.55)';
                    ctx.fillRect(0, 0, width, height);
                }

                const mouseState = {
                    isDown: this.alignmentIsMouseDown,
                    x: this.alignmentMouseX,
                    y: this.alignmentMouseY
                };

                // ── 화자(narrator) 파동 ──
                if (activeNarratorEV && activeNarratorWS) {
                    const narratorY = height * 0.3;

                    // 유령 잔상 (전환 중): 이전 파동이 흐릿하게 사라짐
                    if (txProgress >= 0 && txProgress < 1 && txFromN) {
                        const ghostOpacity = 0.4 * Math.pow(1 - txProgress, 2);
                        this.drawAlignmentWave(canvas, narratorY, ghostOpacity, 0, txFromN, null, txProgress);
                    }

                    // 메인 파동 (보간된 스타일)
                    const activeStyle = txProgress >= 0 && txFromN
                        ? this._lerpWaveStyle(txFromN, activeNarratorWS, txProgress)
                        : activeNarratorWS;
                    const mainOpacity = txProgress >= 0 ? 0.3 + 0.4 * txProgress : 0.7;
                    this.drawAlignmentWave(canvas, narratorY, mainOpacity, 0, activeStyle, mouseState, txProgress);
                }

                // ── 체험자(experiencer) 파동 ──
                if (activeExperiencerEV && activeExperiencerWS) {
                    const experiencerY = height * 0.7;

                    // 유령 잔상
                    if (txProgress >= 0 && txProgress < 1 && txFromE) {
                        const ghostOpacity = 0.4 * Math.pow(1 - txProgress, 2);
                        this.drawAlignmentWave(canvas, experiencerY, ghostOpacity, 50, txFromE, null, txProgress);
                    }

                    // 메인 파동
                    const activeStyle = txProgress >= 0 && txFromE
                        ? this._lerpWaveStyle(txFromE, activeExperiencerWS, txProgress)
                        : activeExperiencerWS;
                    const mainOpacity = txProgress >= 0 ? 0.3 + 0.4 * txProgress : 0.7;
                    this.drawAlignmentWave(canvas, experiencerY, mainOpacity, 50, activeStyle, mouseState, txProgress);
                }
            } catch (e) {
                console.error('Alignment wave animation error:', e);
            }
        };

        const animate = () => {
            if (narratorCanvas) {
                if (!narratorInitialized) {
                    narratorInitialized = initializeCanvas(narratorCanvas);
                }
                if (narratorInitialized) {
                    animateWave(narratorCanvas);
                }
            }
            if (experiencerCanvas) {
                if (!experiencerInitialized) {
                    experiencerInitialized = initializeCanvas(experiencerCanvas);
                }
                if (experiencerInitialized) {
                    animateWave(experiencerCanvas);
                } else if (experiencerCanvas.offsetWidth > 0 && experiencerCanvas.offsetHeight > 0) {
                    experiencerInitialized = initializeCanvas(experiencerCanvas);
                }
            }
            this.alignmentWaveTime += 0.016;
            this.alignmentWaveAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * 정렬도 파동 애니메이션 중지
     */
    stopAlignmentWaveAnimation() {
        if (this.alignmentWaveAnimationId) {
            cancelAnimationFrame(this.alignmentWaveAnimationId);
            this.alignmentWaveAnimationId = null;
        }
        // 2026-05-06: 캔버스 추적 상태 + 프레임 lerp 표시 스타일 클리어.
        this._alignmentWaveNarratorCanvas = null;
        this._alignmentWaveExperiencerCanvas = null;
        this._alignmentWaveData = null;
        this._displayedNarratorWS = null;
        this._displayedExperiencerWS = null;
    }

    /**
     * 비교 파동 그리기
     * @param {HTMLCanvasElement} canvas - 캔버스 요소
     * @param {Object} emotionVector - 감정 벡터
     * @param {number} timeOffset - 시간 오프셋
     * @param {Object} waveStyle - 파동 스타일 { color: {r,g,b}, speed, amplitude, frequency, chaos }
     */
    drawComparisonWave(canvas, emotionVector, timeOffset, waveStyle) {
        if (!canvas || !emotionVector || !waveStyle) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        const t = this.comparisonWaveTime + timeOffset;
        const points = [];
        const segments = 100;
        
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            const normalizedX = x / width;
            let y = Math.sin(x * waveStyle.frequency + t * waveStyle.speed) * waveStyle.amplitude;
            y += Math.sin(x * waveStyle.frequency * 2.3 + t * waveStyle.speed * 0.7) * (waveStyle.amplitude * 0.4);
            y += Math.sin(x * waveStyle.frequency * 0.4 + t * waveStyle.speed * 0.3) * (waveStyle.amplitude * 0.6);
            const chaosAmount = waveStyle.chaos * 15;
            y += (this._noise(x * 0.01, t * 0.1, 0) - 0.5) * chaosAmount;
            const edgeFade = Math.sin(normalizedX * Math.PI);
            y *= edgeFade;
            points.push({ x, y: centerY + y });
        }
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        const color = waveStyle.color;
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.8)`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    /**
     * 비교 파동 애니메이션 시작
     * @param {Array} comparisonScenes - 비교 장면 배열 [{ userEmotion, originalEmotion, userWaveStyle, originalWaveStyle }]
     */
    startComparisonWaveAnimation(comparisonScenes) {
        if (this.comparisonWaveAnimationId) {
            cancelAnimationFrame(this.comparisonWaveAnimationId);
        }
        
        this.comparisonWaveTime = 0;
        const initializedCanvases = new Map();
        
        const initializeCanvas = (canvas) => {
            if (!canvas) return false;
            if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return false;
            if (initializedCanvases.has(canvas)) return true;
            try {
                const ctx = canvas.getContext('2d');
                canvas.width = canvas.offsetWidth * 2;
                canvas.height = canvas.offsetHeight * 2;
                ctx.scale(2, 2);
                initializedCanvases.set(canvas, true);
                return true;
            } catch (e) {
                console.error('Comparison canvas initialization error:', e);
                return false;
            }
        };
        
        const animate = () => {
            comparisonScenes.forEach((item, index) => {
                const userCanvas = document.querySelector(`canvas[data-type="user"][data-index="${index}"]`);
                const originalCanvas = document.querySelector(`canvas[data-type="original"][data-index="${index}"]`);
                
                if (userCanvas && item.userEmotion && item.userWaveStyle) {
                    if (initializeCanvas(userCanvas)) {
                        const ctx = userCanvas.getContext('2d');
                        const width = userCanvas.width / 2;
                        const height = userCanvas.height / 2;
                        ctx.clearRect(0, 0, width, height);
                        ctx.fillStyle = 'rgba(18, 18, 26, 1)';
                        ctx.fillRect(0, 0, width, height);
                        this.drawComparisonWave(userCanvas, item.userEmotion, 0, item.userWaveStyle);
                    }
                }
                
                if (originalCanvas && item.originalEmotion && item.originalWaveStyle) {
                    if (initializeCanvas(originalCanvas)) {
                        const ctx = originalCanvas.getContext('2d');
                        const width = originalCanvas.width / 2;
                        const height = originalCanvas.height / 2;
                        ctx.clearRect(0, 0, width, height);
                        ctx.fillStyle = 'rgba(18, 18, 26, 1)';
                        ctx.fillRect(0, 0, width, height);
                        this.drawComparisonWave(originalCanvas, item.originalEmotion, 50, item.originalWaveStyle);
                    }
                }
            });
            
            this.comparisonWaveTime += 0.016;
            this.comparisonWaveAnimationId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * 비교 파동 애니메이션 중지
     */
    stopComparisonWaveAnimation() {
        if (this.comparisonWaveAnimationId) {
            cancelAnimationFrame(this.comparisonWaveAnimationId);
            this.comparisonWaveAnimationId = null;
        }
    }

    /**
     * 비교 파동 렌더링 시작 (중지 후 시작)
     * @param {Array} comparisonScenes - 비교 장면 배열
     */
    renderComparisonWaves(comparisonScenes) {
        console.log('[renderComparisonWaves] 시작, comparisonScenes:', comparisonScenes);
        this.stopComparisonWaveAnimation();
        this.startComparisonWaveAnimation(comparisonScenes);
    }
}

export const visualizer = new Visualizer();
