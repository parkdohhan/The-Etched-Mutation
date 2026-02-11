// tools/test-chat-pipeline.js
// 채팅 파이프라인 테스트 하네스

// 테스트를 위해 필요한 함수들을 동적으로 import
let sendExpChatMessageWithDeps, sendChatMessageWithDeps;
let parseEmotionAnalysisResult, parseSceneGenerationResult;
let AIService; // AIService를 모킹하기 위해 필요

// 테스트용 mock 함수들
const mockPersistExpEmotionResult = {
    called: false,
    calledWith: null,
    reset: function() {
        this.called = false;
        this.calledWith = null;
    }
};

const mockPersistSceneGenerationResult = {
    called: false,
    calledWith: null,
    reset: function() {
        this.called = false;
        this.calledWith = null;
    }
};

// Mock DOM 요소들
function setupMockDOM() {
    // expTextInput
    if (!document.getElementById('expTextInput')) {
        const expInput = document.createElement('input');
        expInput.id = 'expTextInput';
        expInput.type = 'text';
        document.body.appendChild(expInput);
    }
    
    // liveTextInput
    if (!document.getElementById('liveTextInput')) {
        const liveInput = document.createElement('input');
        liveInput.id = 'liveTextInput';
        liveInput.type = 'text';
        document.body.appendChild(liveInput);
    }
    
    // expChatMessages
    if (!document.getElementById('expChatMessages')) {
        const expMessages = document.createElement('div');
        expMessages.id = 'expChatMessages';
        document.body.appendChild(expMessages);
    }
    
    // chatMessages
    if (!document.getElementById('chatMessages')) {
        const chatMessages = document.createElement('div');
        chatMessages.id = 'chatMessages';
        document.body.appendChild(chatMessages);
    }
}

// Mock 함수들
// AIService.call을 모킹하기 위한 함수
// AIService.call(type, payload, meta) 형태로 호출됨
function createMockAIService(result, shouldThrow = false, throwError = null) {
    return {
        call: async (type, payload, meta) => {
            if (shouldThrow) {
                throw throwError || new Error('API 호출 실패');
            }
            return result;
        }
    };
}

function createMockCollectChatMessage(returnValue) {
    return (inputId) => {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = returnValue || '테스트 메시지';
        }
        return returnValue || '테스트 메시지';
    };
}

function createMockReflectExpChatMessageUI() {
    return () => {}; // UI 반영은 테스트에서 중요하지 않음
}

function createMockReflectChatMessageUI() {
    return () => {}; // UI 반영은 테스트에서 중요하지 않음
}

function createMockAddExpChatMessage() {
    return () => {}; // UI 메시지 추가는 테스트에서 중요하지 않음
}

function createMockAddExpChatMessageWithConfirm() {
    return () => {}; // UI 메시지 추가는 테스트에서 중요하지 않음
}

function createMockAddChatMessage() {
    return () => {}; // UI 메시지 추가는 테스트에서 중요하지 않음
}

function createMockAddChatMessageWithConfirm() {
    return () => {}; // UI 메시지 추가는 테스트에서 중요하지 않음
}

function createMockUpdateExperiencerStatus() {
    return () => {}; // 상태 업데이트는 테스트에서 중요하지 않음
}

function createMockPersistExpEmotionResult() {
    return (emotionResult, userMessage) => {
        mockPersistExpEmotionResult.called = true;
        mockPersistExpEmotionResult.calledWith = { emotionResult, userMessage };
    };
}

function createMockPersistSceneGenerationResult() {
    return (generatedText) => {
        mockPersistSceneGenerationResult.called = true;
        mockPersistSceneGenerationResult.calledWith = generatedText;
    };
}

// 테스트 케이스 정의 (핵심 4개만)
const testCases = [
    // 1. 정상적인 감정 분석 응답 처리 (persist 호출 확인)
    {
        name: '감정 분석: 정상 응답 → persist 호출',
        run: async () => {
            mockPersistExpEmotionResult.reset();
            
            const validEmotionResult = {
                generatedEmotion: '기쁨',
                analysis: {
                    base: {
                        fear: 0.1, sadness: 0.1, anger: 0.1,
                        joy: 0.8, longing: 0.2, guilt: 0.1
                    },
                    intensity: 0.7,
                    confidence: 0.9
                }
            };
            
            // AIService 모킹
            const originalAIService = window.AIService;
            window.AIService = createMockAIService(validEmotionResult);
            
            try {
                await sendExpChatMessageWithDeps({
                    persistExpEmotionResult: createMockPersistExpEmotionResult(),
                    collectChatMessage: createMockCollectChatMessage('기쁘다'),
                    reflectExpChatMessageUI: createMockReflectExpChatMessageUI(),
                    addExpChatMessage: createMockAddExpChatMessage(),
                    addExpChatMessageWithConfirm: createMockAddExpChatMessageWithConfirm(),
                    parseEmotionAnalysisResult: parseEmotionAnalysisResult,
                    getExpCurrentPhase: () => 'interpret',
                    setExpPendingEmotion: () => {}
                });
            } finally {
                // 원래 AIService 복원
                if (originalAIService) {
                    window.AIService = originalAIService;
                }
            }
            
            const persistCalled = mockPersistExpEmotionResult.called;
            return {
                pass: persistCalled === true,
                expected: 'persistExpEmotionResult 호출됨 (정상)',
                actual: persistCalled ? '호출됨 (정상)' : '호출 안 됨 (비정상)',
                persistCalled: persistCalled,
                isExpectedBehavior: true // 호출이 정상인 경우
            };
        }
    },
    
    // 2. 감정 분석 응답 형식 오류 처리 (persist 미호출 확인)
    {
        name: '감정 분석: 형식 오류 → persist 미호출',
        run: async () => {
            mockPersistExpEmotionResult.reset();
            
            const validationError = new Error('응답 형식 오류: generatedEmotion이 유효하지 않습니다');
            
            // AIService 모킹
            const originalAIService = window.AIService;
            window.AIService = createMockAIService({}, true, validationError);
            
            try {
                await sendExpChatMessageWithDeps({
                    persistExpEmotionResult: createMockPersistExpEmotionResult(),
                    collectChatMessage: createMockCollectChatMessage('기쁘다'),
                    reflectExpChatMessageUI: createMockReflectExpChatMessageUI(),
                    addExpChatMessage: createMockAddExpChatMessage(),
                    addExpChatMessageWithConfirm: createMockAddExpChatMessageWithConfirm(),
                    parseEmotionAnalysisResult: parseEmotionAnalysisResult,
                    getExpCurrentPhase: () => 'interpret',
                    setExpPendingEmotion: () => {}
                });
            } finally {
                // 원래 AIService 복원
                if (originalAIService) {
                    window.AIService = originalAIService;
                }
            }
            
            const persistCalled = mockPersistExpEmotionResult.called;
            return {
                pass: persistCalled === false,
                expected: 'persistExpEmotionResult 호출 안 됨 (정상)',
                actual: persistCalled ? '호출됨 (비정상)' : '호출 안 됨 (정상)',
                persistCalled: persistCalled,
                isExpectedBehavior: true // 미호출이 정상인 경우
            };
        }
    },
    
    // 3. 정상적인 장면 생성 응답 처리 (persist 호출 확인)
    {
        name: '장면 생성: 정상 응답 → persist 호출',
        run: async () => {
            mockPersistSceneGenerationResult.reset();
            
            // AIService 모킹
            const originalAIService = window.AIService;
            window.AIService = createMockAIService({ response: '그날 밤, 나는 거리에서 길을 잃었다.' });
            
            try {
                await sendChatMessageWithDeps({
                    persistSceneGenerationResult: createMockPersistSceneGenerationResult(),
                    collectChatMessage: createMockCollectChatMessage('그날 밤의 기억'),
                    reflectChatMessageUI: createMockReflectChatMessageUI(),
                    addChatMessage: createMockAddChatMessage(),
                    addChatMessageWithConfirm: createMockAddChatMessageWithConfirm(),
                    updateExperiencerStatus: createMockUpdateExperiencerStatus(),
                    parseSceneGenerationResult: parseSceneGenerationResult,
                    getCurrentPhase: () => 'scene',
                    getConversationHistory: () => [],
                    pushConversationHistory: () => {},
                    getAISystemPrompt: () => '테스트 프롬프트',
                    handleUnifiedSubmit: async () => {}
                });
            } finally {
                // 원래 AIService 복원
                if (originalAIService) {
                    window.AIService = originalAIService;
                }
            }
            
            const persistCalled = mockPersistSceneGenerationResult.called;
            return {
                pass: persistCalled === true,
                expected: 'persistSceneGenerationResult 호출됨 (정상)',
                actual: persistCalled ? '호출됨 (정상)' : '호출 안 됨 (비정상)',
                persistCalled: persistCalled,
                isExpectedBehavior: true // 호출이 정상인 경우
            };
        }
    },
    
    // 4. 장면 생성 응답 형식 오류 처리 (persist 미호출 확인)
    {
        name: '장면 생성: 형식 오류 → persist 미호출',
        run: async () => {
            mockPersistSceneGenerationResult.reset();
            
            const validationError = new Error('응답 형식 오류: response가 유효하지 않습니다');
            
            // AIService 모킹
            const originalAIService = window.AIService;
            window.AIService = createMockAIService({ scene: null }, true, validationError);
            
            try {
                await sendChatMessageWithDeps({
                    persistSceneGenerationResult: createMockPersistSceneGenerationResult(),
                    collectChatMessage: createMockCollectChatMessage('그날 밤의 기억'),
                    reflectChatMessageUI: createMockReflectChatMessageUI(),
                    addChatMessage: createMockAddChatMessage(),
                    addChatMessageWithConfirm: createMockAddChatMessageWithConfirm(),
                    updateExperiencerStatus: createMockUpdateExperiencerStatus(),
                    parseSceneGenerationResult: parseSceneGenerationResult,
                    getCurrentPhase: () => 'scene',
                    getConversationHistory: () => [],
                    pushConversationHistory: () => {},
                    getAISystemPrompt: () => '테스트 프롬프트',
                    handleUnifiedSubmit: async () => {}
                });
            } finally {
                // 원래 AIService 복원
                if (originalAIService) {
                    window.AIService = originalAIService;
                }
            }
            
            const persistCalled = mockPersistSceneGenerationResult.called;
            return {
                pass: persistCalled === false,
                expected: 'persistSceneGenerationResult 호출 안 됨 (정상)',
                actual: persistCalled ? '호출됨 (비정상)' : '호출 안 됨 (정상)',
                persistCalled: persistCalled,
                isExpectedBehavior: true // 미호출이 정상인 경우
            };
        }
    }
];

// index.js 로드 대기 함수
async function waitForIndexJS(maxWait = 15000) {
    const startTime = Date.now();
    let lastCheck = '';
    
    while (Date.now() - startTime < maxWait) {
        const checks = {
            sendExpChatMessageWithDeps: typeof window.sendExpChatMessageWithDeps !== 'undefined',
            sendChatMessageWithDeps: typeof window.sendChatMessageWithDeps !== 'undefined',
            parseEmotionAnalysisResult: typeof window.parseEmotionAnalysisResult !== 'undefined',
            parseSceneGenerationResult: typeof window.parseSceneGenerationResult !== 'undefined',
            AIService: typeof window.AIService !== 'undefined'
        };
        
        const missing = Object.entries(checks)
            .filter(([_, exists]) => !exists)
            .map(([name, _]) => name);
        
        if (missing.length === 0) {
            return { success: true, missing: [] };
        }
        
        // 디버깅을 위해 상태 업데이트
        const currentCheck = `대기 중... (${Math.floor((Date.now() - startTime) / 1000)}초) - 누락: ${missing.join(', ')}`;
        if (currentCheck !== lastCheck) {
            console.log(currentCheck);
            lastCheck = currentCheck;
        }
        
        // 100ms마다 확인
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 최종 확인
    const finalChecks = {
        sendExpChatMessageWithDeps: typeof window.sendExpChatMessageWithDeps !== 'undefined',
        sendChatMessageWithDeps: typeof window.sendChatMessageWithDeps !== 'undefined',
        parseEmotionAnalysisResult: typeof window.parseEmotionAnalysisResult !== 'undefined',
        parseSceneGenerationResult: typeof window.parseSceneGenerationResult !== 'undefined',
        AIService: typeof window.AIService !== 'undefined'
    };
    
    const finalMissing = Object.entries(finalChecks)
        .filter(([_, exists]) => !exists)
        .map(([name, _]) => name);
    
    return { success: false, missing: finalMissing };
}

// 테스트 실행 함수
export async function runTests() {
    const summaryEl = document.getElementById('summary');
    const resultsEl = document.getElementById('testResults');
    
    // 초기화
    summaryEl.innerHTML = '<div class="loading">테스트를 실행하는 중...</div>';
    resultsEl.innerHTML = '';
    
    // Mock DOM 설정
    setupMockDOM();
    
    // index.js 로드 대기
    summaryEl.innerHTML = '<div class="loading">index.js 로드를 기다리는 중...</div>';
    console.log('index.js 로드 대기 시작...');
    console.log('현재 window 상태:', {
        sendExpChatMessageWithDeps: typeof window.sendExpChatMessageWithDeps,
        sendChatMessageWithDeps: typeof window.sendChatMessageWithDeps,
        parseEmotionAnalysisResult: typeof window.parseEmotionAnalysisResult,
        parseSceneGenerationResult: typeof window.parseSceneGenerationResult,
        AIService: typeof window.AIService
    });
    
    const indexResult = await waitForIndexJS(15000);
    
    if (!indexResult.success) {
        console.error('index.js 로드 실패. 누락된 함수:', indexResult.missing);
        console.log('현재 window 상태:', {
            sendExpChatMessageWithDeps: typeof window.sendExpChatMessageWithDeps,
            sendChatMessageWithDeps: typeof window.sendChatMessageWithDeps,
            parseEmotionAnalysisResult: typeof window.parseEmotionAnalysisResult,
            parseSceneGenerationResult: typeof window.parseSceneGenerationResult,
            AIService: typeof window.AIService
        });
        
        summaryEl.innerHTML = `
            <h2>테스트 초기화 실패</h2>
            <div class="error-message">index.js가 15초 내에 로드되지 않았습니다.</div>
            <div class="error-message" style="margin-top: 1rem;">
                누락된 함수: ${indexResult.missing.join(', ')}<br><br>
                확인 사항:<br>
                1. 브라우저 콘솔(F12)을 열어 에러 메시지를 확인하세요<br>
                2. index.js 파일이 올바른 경로에 있는지 확인하세요 (../js/index.js)<br>
                3. HTTP 서버를 통해 접근하고 있는지 확인하세요 (file:// 프로토콜은 작동하지 않을 수 있음)<br>
                4. Network 탭에서 index.js 파일이 실제로 로드되었는지 확인하세요
            </div>
        `;
        return;
    }
    
    console.log('index.js 로드 완료!');
    
    // 전역 함수 확인 및 할당
    try {
        sendExpChatMessageWithDeps = window.sendExpChatMessageWithDeps;
        sendChatMessageWithDeps = window.sendChatMessageWithDeps;
        parseEmotionAnalysisResult = window.parseEmotionAnalysisResult;
        parseSceneGenerationResult = window.parseSceneGenerationResult;
        AIService = window.AIService;
        
        if (!sendExpChatMessageWithDeps || !sendChatMessageWithDeps || 
            !parseEmotionAnalysisResult || !parseSceneGenerationResult || !AIService) {
            throw new Error('필요한 함수 중 일부가 undefined입니다.');
        }
    } catch (error) {
        summaryEl.innerHTML = `
            <h2>테스트 초기화 실패</h2>
            <div class="error-message">${error.message}</div>
            <div class="error-message" style="margin-top: 1rem;">
                브라우저 콘솔을 확인하여 자세한 에러를 확인하세요.
            </div>
        `;
        return;
    }
    
    let passCount = 0;
    let failCount = 0;
    const results = [];
    
    // 각 테스트 케이스 실행
    for (const testCase of testCases) {
        try {
            const result = await testCase.run();
            results.push({
                ...result,
                name: testCase.name,
                index: results.length + 1
            });
            
            if (result.pass) {
                passCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            results.push({
                pass: false,
                name: testCase.name,
                index: results.length + 1,
                expected: 'N/A',
                actual: 'ERROR',
                error: error.message,
                persistCalled: false,
                persistCalledWith: null
            });
            failCount++;
        }
    }
    
    // 요약 표시
    const total = passCount + failCount;
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : 0;
    
    summaryEl.innerHTML = `
        <h2>테스트 요약</h2>
        <div class="summary-stats">
            <div class="stat">
                <div class="stat-label">전체</div>
                <div class="stat-value">${total}</div>
            </div>
            <div class="stat">
                <div class="stat-label">통과</div>
                <div class="stat-value pass">${passCount}</div>
            </div>
            <div class="stat">
                <div class="stat-label">실패</div>
                <div class="stat-value fail">${failCount}</div>
            </div>
            <div class="stat">
                <div class="stat-label">통과율</div>
                <div class="stat-value ${passCount === total ? 'pass' : 'fail'}">${passRate}%</div>
            </div>
        </div>
    `;
    
    // 결과 표시
    results.forEach(result => {
        const testCaseEl = document.createElement('div');
        testCaseEl.className = `test-case ${result.pass ? 'pass' : 'fail'}`;
        
        let detailsHTML = '';
        if (result.error) {
            detailsHTML = `<div class="error-message">에러: ${result.error}</div>`;
        } else {
            detailsHTML = `
                <div class="test-detail">
                    <span class="test-detail-label">기대값:</span>
                    <span class="test-detail-value expected">${result.expected}</span>
                </div>
                <div class="test-detail">
                    <span class="test-detail-label">실제값:</span>
                    <span class="test-detail-value actual">${result.actual}</span>
                </div>
            `;
        }
        
        // persist 호출 여부 로그
        const persistLogClass = result.persistCalled ? '' : 'not-called';
        let persistLogText = '';
        if (result.persistCalled) {
            persistLogText = `persist 함수 호출됨 ✓`;
            if (result.persistCalledWith) {
                persistLogText += ` (${JSON.stringify(result.persistCalledWith)})`;
            }
        } else {
            // 테스트 이름에 "미호출"이 포함되어 있으면 정상 동작
            const isExpected = result.name.includes('미호출') || result.isExpectedBehavior;
            persistLogText = `persist 함수 호출 안 됨 ${isExpected ? '✓ (정상)' : '✗ (비정상)'}`;
        }
        
        detailsHTML += `
            <div class="persist-log ${result.pass ? '' : persistLogClass}">
                <strong>persist 호출 여부:</strong> ${persistLogText}
            </div>
        `;
        
        testCaseEl.innerHTML = `
            <div class="test-header">
                <div class="test-name">${result.index}. ${result.name}</div>
                <div class="test-status ${result.pass ? 'pass' : 'fail'}">
                    ${result.pass ? 'PASS' : 'FAIL'}
                </div>
            </div>
            <div class="test-details">
                ${detailsHTML}
            </div>
        `;
        
        resultsEl.appendChild(testCaseEl);
    });
}

// 페이지 로드 시 자동 실행 (index.js 로드 대기)
async function initTests() {
    console.log('initTests 시작');
    // 약간의 초기 대기 (DOM이 완전히 준비될 때까지)
    await new Promise(resolve => setTimeout(resolve, 100));
    // runTests에서 waitForIndexJS를 호출하므로 여기서는 바로 실행
    runTests();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTests);
} else {
    initTests();
}

// 전역으로 export (버튼 클릭용)
window.runTests = runTests;
