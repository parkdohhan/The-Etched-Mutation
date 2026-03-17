// tools/test-engine.js
// 별이 엔진 테스트 하네스

import { ByeoriEngine } from '../js/core/ByeoriEngine.js';

const engine = new ByeoriEngine();

// 테스트 케이스 정의
const testCases = [
    // 1. alignment_score 범위 테스트 (0~1)
    {
        name: '정렬도 범위: 0 이상',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.1, sadness: 0.2 } },
                originalVector: { base: { fear: 0.1, sadness: 0.2 } }
            }, {});
            return {
                pass: result.alignment_score >= 0,
                expected: '>= 0',
                actual: result.alignment_score,
                details: { alignment_score: result.alignment_score }
            };
        }
    },
    {
        name: '정렬도 범위: 1 이하',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.9, sadness: 0.9, joy: 0.9 } },
                originalVector: { base: { fear: 0.9, sadness: 0.9, joy: 0.9 } }
            }, {});
            return {
                pass: result.alignment_score <= 1,
                expected: '<= 1',
                actual: result.alignment_score,
                details: { alignment_score: result.alignment_score }
            };
        }
    },
    
    // 2. HIGH 버킷 히스테리시스
    {
        name: 'HIGH 진입: alignment >= 0.55',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.8, sadness: 0.8 } },
                originalVector: { base: { fear: 0.8, sadness: 0.8 } }
            }, { previousBucket: null });
            return {
                pass: result.alignment_bucket === 'HIGH' && result.alignment_score >= 0.55,
                expected: 'HIGH (alignment >= 0.55)',
                actual: `${result.alignment_bucket} (${result.alignment_score.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: result.alignment_score,
                    previousBucket: null
                }
            };
        }
    },
    {
        name: 'HIGH 유지: previousBucket=HIGH && alignment >= 0.45',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.6, sadness: 0.5 } },
                originalVector: { base: { fear: 0.6, sadness: 0.5 } }
            }, { previousBucket: 'HIGH' });
            const alignment = result.alignment_score;
            return {
                pass: alignment >= 0.45 && result.alignment_bucket === 'HIGH',
                expected: 'HIGH (alignment >= 0.45)',
                actual: `${result.alignment_bucket} (${alignment.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: alignment,
                    previousBucket: 'HIGH'
                }
            };
        }
    },
    {
        name: 'HIGH 이탈: previousBucket=HIGH && alignment < 0.45',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.3, sadness: 0.2 } },
                originalVector: { base: { fear: 0.8, sadness: 0.8 } }
            }, { previousBucket: 'HIGH' });
            const alignment = result.alignment_score;
            return {
                pass: alignment < 0.45 && result.alignment_bucket !== 'HIGH',
                expected: 'NOT HIGH (alignment < 0.45)',
                actual: `${result.alignment_bucket} (${alignment.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: alignment,
                    previousBucket: 'HIGH'
                }
            };
        }
    },
    
    // 3. LOW 버킷 히스테리시스
    {
        name: 'LOW 진입: alignment < 0.35',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.1, sadness: 0.1 } },
                originalVector: { base: { fear: 0.9, sadness: 0.9 } }
            }, { previousBucket: null });
            return {
                pass: result.alignment_bucket === 'LOW' && result.alignment_score < 0.35,
                expected: 'LOW (alignment < 0.35)',
                actual: `${result.alignment_bucket} (${result.alignment_score.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: result.alignment_score,
                    previousBucket: null
                }
            };
        }
    },
    {
        name: 'LOW 유지: previousBucket=LOW && alignment <= 0.25',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.1, sadness: 0.1 } },
                originalVector: { base: { fear: 0.9, sadness: 0.9 } }
            }, { previousBucket: 'LOW' });
            const alignment = result.alignment_score;
            return {
                pass: alignment <= 0.25 && result.alignment_bucket === 'LOW',
                expected: 'LOW (alignment <= 0.25)',
                actual: `${result.alignment_bucket} (${alignment.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: alignment,
                    previousBucket: 'LOW'
                }
            };
        }
    },
    {
        name: 'LOW 이탈: previousBucket=LOW && alignment > 0.25',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.5, sadness: 0.5 } },
                originalVector: { base: { fear: 0.5, sadness: 0.5 } }
            }, { previousBucket: 'LOW' });
            const alignment = result.alignment_score;
            return {
                pass: alignment > 0.25 && result.alignment_bucket !== 'LOW',
                expected: 'NOT LOW (alignment > 0.25)',
                actual: `${result.alignment_bucket} (${alignment.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: alignment,
                    previousBucket: 'LOW'
                }
            };
        }
    },
    
    // 4. FIXATED 테스트
    {
        name: 'FIXATED: 동일 감정 3회 반복',
        run: () => {
            const emotionHistory = ['sadness', 'sadness', 'sadness'];
            const result = engine.calculateStep({
                userVector: { base: { sadness: 0.8 } },
                originalVector: { base: { sadness: 0.8 } }
            }, { 
                previousBucket: 'HIGH',
                emotionHistory: emotionHistory
            });
            return {
                pass: result.alignment_bucket === 'FIXATED',
                expected: 'FIXATED',
                actual: result.alignment_bucket,
                details: { 
                    bucket: result.alignment_bucket, 
                    emotionHistory: emotionHistory
                }
            };
        }
    },
    {
        name: 'FIXATED 아님: 감정 2회만 반복',
        run: () => {
            const emotionHistory = ['sadness', 'sadness'];
            const result = engine.calculateStep({
                userVector: { base: { sadness: 0.8 } },
                originalVector: { base: { sadness: 0.8 } }
            }, { 
                previousBucket: 'HIGH',
                emotionHistory: emotionHistory
            });
            return {
                pass: result.alignment_bucket !== 'FIXATED',
                expected: 'NOT FIXATED',
                actual: result.alignment_bucket,
                details: { 
                    bucket: result.alignment_bucket, 
                    emotionHistory: emotionHistory
                }
            };
        }
    },
    {
        name: 'FIXATED 아님: 감정이 다름',
        run: () => {
            const emotionHistory = ['sadness', 'fear', 'sadness'];
            const result = engine.calculateStep({
                userVector: { base: { sadness: 0.8 } },
                originalVector: { base: { sadness: 0.8 } }
            }, { 
                previousBucket: 'HIGH',
                emotionHistory: emotionHistory
            });
            return {
                pass: result.alignment_bucket !== 'FIXATED',
                expected: 'NOT FIXATED',
                actual: result.alignment_bucket,
                details: { 
                    bucket: result.alignment_bucket, 
                    emotionHistory: emotionHistory
                }
            };
        }
    },
    
    // 5. MID 버킷 테스트
    {
        name: 'MID 버킷: 0.35 <= alignment < 0.55 (첫 판정)',
        run: () => {
            const result = engine.calculateStep({
                userVector: { base: { fear: 0.4, sadness: 0.4 } },
                originalVector: { base: { fear: 0.5, sadness: 0.5 } }
            }, { previousBucket: null });
            const alignment = result.alignment_score;
            return {
                pass: result.alignment_bucket === 'MID' && alignment >= 0.35 && alignment < 0.55,
                expected: 'MID (0.35 <= alignment < 0.55)',
                actual: `${result.alignment_bucket} (${alignment.toFixed(3)})`,
                details: { 
                    bucket: result.alignment_bucket, 
                    alignment: alignment,
                    previousBucket: null
                }
            };
        }
    }
];

// 테스트 실행 함수
export function runTests() {
    const summaryEl = document.getElementById('summary');
    const resultsEl = document.getElementById('testResults');
    
    // 초기화
    summaryEl.innerHTML = '<div class="loading">테스트를 실행하는 중...</div>';
    resultsEl.innerHTML = '';
    
    let passCount = 0;
    let failCount = 0;
    const results = [];
    
    // 각 테스트 케이스 실행
    testCases.forEach((testCase, index) => {
        try {
            const result = testCase.run();
            results.push({
                ...result,
                name: testCase.name,
                index: index + 1
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
                index: index + 1,
                expected: 'N/A',
                actual: 'ERROR',
                error: error.message,
                details: {}
            });
            failCount++;
        }
    });
    
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
                <div class="stat-value ${failCount === 0 ? 'pass' : 'fail'}">${passRate}%</div>
            </div>
        </div>
    `;
    
    // 결과 표시
    results.forEach(result => {
        const testCaseEl = document.createElement('div');
        testCaseEl.className = `test-case ${result.pass ? 'pass' : 'fail'}`;
        
        let detailsHtml = '';
        if (result.details) {
            detailsHtml = '<div class="test-details">';
            Object.entries(result.details).forEach(([key, value]) => {
                detailsHtml += `
                    <div class="test-detail">
                        <span class="test-detail-label">${key}:</span>
                        <span class="test-detail-value">${JSON.stringify(value)}</span>
                    </div>
                `;
            });
            detailsHtml += '</div>';
        }
        
        let errorHtml = '';
        if (result.error) {
            errorHtml = `<div class="error-message">에러: ${result.error}</div>`;
        }
        
        testCaseEl.innerHTML = `
            <div class="test-header">
                <div class="test-name">${result.index}. ${result.name}</div>
                <div class="test-status ${result.pass ? 'pass' : 'fail'}">
                    ${result.pass ? 'PASS' : 'FAIL'}
                </div>
            </div>
            ${!result.pass ? `
                <div class="test-details">
                    <div class="test-detail">
                        <span class="test-detail-label">기대값:</span>
                        <span class="test-detail-value expected">${result.expected}</span>
                    </div>
                    <div class="test-detail">
                        <span class="test-detail-label">실제값:</span>
                        <span class="test-detail-value actual">${result.actual}</span>
                    </div>
                </div>
            ` : ''}
            ${detailsHtml}
            ${errorHtml}
        `;
        
        resultsEl.appendChild(testCaseEl);
    });
}

// 페이지 로드 시 자동 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTests);
} else {
    runTests();
}

// 전역으로 export (버튼 클릭용)
window.runTests = runTests;
