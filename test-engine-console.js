// 브라우저 콘솔에서 실행할 수 있는 ByeoriEngine 테스트 스크립트
// index.html을 열고 개발자 도구 콘솔에서 이 스크립트를 실행하세요

async function testByeoriEngine() {
    console.log('=== ByeoriEngine 테스트 시작 ===\n');

    try {
        // ByeoriEngine import
        const { calculateStep } = await import('./js/core/ByeoriEngine.js');
        
        // 기존 함수들 (index.js에서)
        const { cosineSimilarity } = await import('./js/shared/math.js');

        // 기존 calculateComplexAlignment
        function oldCalculateComplexAlignment(userVector, originalVector, anchorEmotions = null) {
            if (!userVector || !originalVector) return 0;
            const emotionScore = cosineSimilarity(
                userVector.base || userVector,
                originalVector.base || originalVector,
                anchorEmotions
            );
            let reasonScore = 0;
            const userReason = userVector.reason_analysis || {};
            const origReason = originalVector.reason_analysis || {};
            const attributionMatch = userReason.attribution && 
                                     origReason.attribution && 
                                     userReason.attribution === origReason.attribution;
            const coreFearMatch = userReason.core_fear && 
                                  origReason.core_fear && 
                                  userReason.core_fear === origReason.core_fear;
            if (attributionMatch) reasonScore += 0.5;
            if (coreFearMatch) reasonScore += 0.5;
            let voidScore = 0;
            if (!!userReason.is_void === !!origReason.is_void) {
                voidScore = 1.0;
            }
            return (emotionScore * 0.4) + (reasonScore * 0.4) + (voidScore * 0.2);
        }

        // 기존 getMismatchType
        function oldGetMismatchType(userVector, originalVector) {
            if (!userVector || !originalVector) return null;
            const emotionSimilarity = cosineSimilarity(
                userVector.base,
                originalVector.base || originalVector
            );
            const userReason = userVector.reason_analysis || {};
            const origReason = originalVector.reason_analysis || {};
            if (!!userReason.is_void !== !!origReason.is_void) return 'void_mismatch';
            if (emotionSimilarity < 0.5) return 'emotion_mismatch';
            if (userReason.attribution && origReason.attribution && userReason.attribution !== origReason.attribution) {
                return 'attribution_mismatch';
            }
            if (userReason.core_fear && origReason.core_fear && userReason.core_fear !== origReason.core_fear) {
                return 'target_displacement';
            }
            return null;
        }

        // 테스트 케이스
        const testCases = [
            {
                name: '기본 감정 유사도',
                userVector: { base: { fear: 0.8, sadness: 0.2 } },
                originalVector: { base: { fear: 0.7, sadness: 0.3 } },
                anchorEmotions: null,
                context: {}
            },
            {
                name: '복합 정렬도 (이유 일치)',
                userVector: {
                    base: { fear: 0.8, sadness: 0.2 },
                    reason_analysis: { attribution: 'self_blame', core_fear: 'abandonment', is_void: false }
                },
                originalVector: {
                    base: { fear: 0.7, sadness: 0.3 },
                    reason_analysis: { attribution: 'self_blame', core_fear: 'abandonment', is_void: false }
                },
                anchorEmotions: null,
                context: {}
            },
            {
                name: 'VOID 미스매치',
                userVector: {
                    base: { fear: 0.5, sadness: 0.5 },
                    reason_analysis: { is_void: true }
                },
                originalVector: {
                    base: { fear: 0.5, sadness: 0.5 },
                    reason_analysis: { is_void: false }
                },
                anchorEmotions: null,
                context: {}
            },
            {
                name: '버킷 HIGH 판정',
                userVector: { base: { fear: 0.9, sadness: 0.1 } },
                originalVector: { base: { fear: 0.85, sadness: 0.15 } },
                anchorEmotions: null,
                context: { previousBucket: null }
            }
        ];

        let passCount = 0;
        let failCount = 0;

        testCases.forEach((testCase, i) => {
            console.log(`\n[테스트 ${i + 1}] ${testCase.name}`);
            console.log('입력:', JSON.stringify(testCase, null, 2));

            // 기존 함수
            const oldAlignment = oldCalculateComplexAlignment(
                testCase.userVector,
                testCase.originalVector,
                testCase.anchorEmotions
            );
            const oldMismatch = oldGetMismatchType(
                testCase.userVector,
                testCase.originalVector
            );

            // 엔진
            const engineResult = calculateStep(
                {
                    userVector: testCase.userVector,
                    originalVector: testCase.originalVector,
                    anchorEmotions: testCase.anchorEmotions
                },
                testCase.context
            );

            // 비교
            const alignmentDiff = Math.abs(oldAlignment - engineResult.alignment_score);
            const mismatchMatch = oldMismatch === engineResult.mismatch_type;
            const isPass = alignmentDiff < 0.0001 && mismatchMatch;

            console.log(`결과: ${isPass ? '✓ 통과' : '✗ 실패'}`);
            console.log(`  정렬도: 기존=${oldAlignment.toFixed(4)}, 엔진=${engineResult.alignment_score.toFixed(4)}, 차이=${alignmentDiff.toFixed(6)}`);
            console.log(`  미스매치: 기존=${oldMismatch}, 엔진=${engineResult.mismatch_type}, 일치=${mismatchMatch}`);
            console.log(`  버킷: ${engineResult.alignment_bucket}`);
            console.log(`  VAD: v=${engineResult.affective_position.v.toFixed(3)}, a=${engineResult.affective_position.a.toFixed(3)}, d=${engineResult.affective_position.d.toFixed(3)}`);

            if (isPass) passCount++;
            else failCount++;
        });

        console.log('\n=== 테스트 요약 ===');
        console.log(`통과: ${passCount} / 실패: ${failCount} / 전체: ${passCount + failCount}`);
        console.log(failCount === 0 ? '✓ 모든 테스트 통과!' : '✗ 일부 테스트 실패');

    } catch (error) {
        console.error('테스트 실행 중 오류:', error);
        console.error(error.stack);
    }
}

// 실행
testByeoriEngine();
