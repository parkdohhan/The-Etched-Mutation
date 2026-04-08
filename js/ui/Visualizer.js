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

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        const color = this._waveOverride && this._waveOverride.colorOverride
            ? this._waveOverride.colorOverride : waveStyle.color;
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${opacity})`;
        ctx.lineWidth = 2 * (this.lineWidthMultiplier || 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
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

        // ── 전환 설정: 이전 스타일이 있으면 보간 ──
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

        if (this.alignmentWaveAnimationId) {
            cancelAnimationFrame(this.alignmentWaveAnimationId);
        }

        this.alignmentWaveTime = 0;
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
                const ctx = canvas.getContext('2d');
                const width = canvas.width / 2;
                const height = canvas.height / 2;
                const alignmentValue = alignment || 0;

                if (onUpdateAlignmentDisplay) {
                    onUpdateAlignmentDisplay(alignmentValue);
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
                    ctx.clearRect(0, 0, width, height);
                } else {
                    ctx.fillStyle = 'rgba(10,10,12,0.85)';
                    ctx.fillRect(0, 0, width, height);
                }

                const mouseState = {
                    isDown: this.alignmentIsMouseDown,
                    x: this.alignmentMouseX,
                    y: this.alignmentMouseY
                };

                // ── 화자(narrator) 파동 ──
                if (narratorEmotionVector && narratorWaveStyle) {
                    const narratorY = height * 0.3;

                    // 유령 잔상 (전환 중): 이전 파동이 흐릿하게 사라짐
                    if (txProgress >= 0 && txProgress < 1 && txFromN) {
                        const ghostOpacity = 0.4 * Math.pow(1 - txProgress, 2);
                        this.drawAlignmentWave(canvas, narratorY, ghostOpacity, 0, txFromN, null, txProgress);
                    }

                    // 메인 파동 (보간된 스타일)
                    const activeStyle = txProgress >= 0 && txFromN
                        ? this._lerpWaveStyle(txFromN, narratorWaveStyle, txProgress)
                        : narratorWaveStyle;
                    const mainOpacity = txProgress >= 0 ? 0.3 + 0.4 * txProgress : 0.7;
                    this.drawAlignmentWave(canvas, narratorY, mainOpacity, 0, activeStyle, mouseState, txProgress);
                }

                // ── 체험자(experiencer) 파동 ──
                if (experiencerEmotionVector && experiencerWaveStyle) {
                    const experiencerY = height * 0.7;

                    // 유령 잔상
                    if (txProgress >= 0 && txProgress < 1 && txFromE) {
                        const ghostOpacity = 0.4 * Math.pow(1 - txProgress, 2);
                        this.drawAlignmentWave(canvas, experiencerY, ghostOpacity, 50, txFromE, null, txProgress);
                    }

                    // 메인 파동
                    const activeStyle = txProgress >= 0 && txFromE
                        ? this._lerpWaveStyle(txFromE, experiencerWaveStyle, txProgress)
                        : experiencerWaveStyle;
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
