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
    }

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
        ctx.strokeStyle = waveData.color || 'rgba(196,168,130,0.6)';
        ctx.lineWidth = 1.5;
        
        for (let x = 0; x < width; x++) {
            const y = centerY + Math.sin(x * waveData.frequency + time) * waveData.amplitude * 20;
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
    drawAlignmentWave(canvas, offsetY, opacity, timeOffset, waveStyle, mouseState = null) {
        if (!canvas || !waveStyle) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const t = this.alignmentWaveTime + timeOffset;
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
            
            const edgeFade = Math.sin(normalizedX * Math.PI);
            y *= edgeFade;
            points.push({ x, y: offsetY + y });
        }
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        const color = waveStyle.color;
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${opacity})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
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
                    const rect = canvas.getBoundingClientRect();
                    this.alignmentMouseX = e.clientX;
                    this.alignmentMouseY = e.clientY;
                });
                canvas.addEventListener('mousemove', (e) => {
                    this.alignmentMouseX = e.clientX;
                    this.alignmentMouseY = e.clientY;
                });
                canvas.addEventListener('mouseup', () => {
                    this.alignmentIsMouseDown = false;
                });
                canvas.addEventListener('mouseleave', () => {
                    this.alignmentIsMouseDown = false;
                });
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
                const alignmentPercent = Math.round(alignmentValue * 100);
                
                if (onUpdateAlignmentDisplay) {
                    onUpdateAlignmentDisplay(alignmentValue);
                }
                
                ctx.fillStyle = 'rgba(10,10,12,0.85)';
                ctx.fillRect(0, 0, width, height);
                
                if (narratorEmotionVector && narratorWaveStyle) {
                    const narratorY = height * 0.3;
                    const mouseState = {
                        isDown: this.alignmentIsMouseDown,
                        x: this.alignmentMouseX,
                        y: this.alignmentMouseY
                    };
                    this.drawAlignmentWave(canvas, narratorY, 0.7, 0, narratorWaveStyle, mouseState);
                }
                
                if (experiencerEmotionVector && experiencerWaveStyle) {
                    const experiencerY = height * 0.7;
                    const mouseState = {
                        isDown: this.alignmentIsMouseDown,
                        x: this.alignmentMouseX,
                        y: this.alignmentMouseY
                    };
                    this.drawAlignmentWave(canvas, experiencerY, 0.7, 50, experiencerWaveStyle, mouseState);
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
