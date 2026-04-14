// 부정 제약 콘솔 테스터
// 사용: 브라우저 DevTools 콘솔에 전체 복붙 → 자동 실행
// admin 페이지든 play 페이지든 어디서든 동작 (SceneNavigator만 import 가능하면)

(async () => {
    const mod = await import('/js/core/SceneNavigator.js');
    const { isExcluded } = mod;

    const tests = [
        {
            name: 'T1. exclusions 없음 → 항상 통과',
            scene: { exclusions: null },
            playerState: { userEmotion: { rage: 0.9 } },
            expect: false,
        },
        {
            name: 'T2. emotion_threshold 미달 → 통과',
            scene: {
                exclusions: [{ condition: { type: 'emotion_threshold', emotion: 'rage', min: 0.6 } }]
            },
            playerState: { userEmotion: { rage: 0.3 } },
            expect: false,
        },
        {
            name: 'T3. emotion_threshold 충족 → 제외',
            scene: {
                exclusions: [{ condition: { type: 'emotion_threshold', emotion: 'rage', min: 0.6 } }]
            },
            playerState: { userEmotion: { rage: 0.8 } },
            expect: true,
        },
        {
            name: 'T4. contamination_stage 매칭 → 제외',
            scene: {
                exclusions: [{ condition: { type: 'contamination_stage', stage: 'hypercompletion' } }]
            },
            playerState: { contaminationStage: 'hypercompletion' },
            expect: true,
        },
        {
            name: 'T5. contamination_stage 불일치 → 통과',
            scene: {
                exclusions: [{ condition: { type: 'contamination_stage', stage: 'hypercompletion' } }]
            },
            playerState: { contaminationStage: 'stable' },
            expect: false,
        },
        {
            name: 'T6. visited_scene 방문함 → 제외',
            scene: {
                exclusions: [{ condition: { type: 'visited_scene', sceneIndex: 2 } }]
            },
            playerState: { visitedScenes: [0, 1, 2] },
            expect: true,
        },
        {
            name: 'T7. visited_scene 미방문 → 통과',
            scene: {
                exclusions: [{ condition: { type: 'visited_scene', sceneIndex: 2 } }]
            },
            playerState: { visitedScenes: [0, 1] },
            expect: false,
        },
        {
            name: 'T8. 복수 조건 중 하나 매칭 → 제외',
            scene: {
                exclusions: [
                    { condition: { type: 'emotion_threshold', emotion: 'rage', min: 0.6 } },
                    { condition: { type: 'visited_scene', sceneIndex: 5 } },
                ]
            },
            playerState: { userEmotion: {}, visitedScenes: [5] },
            expect: true,
        },
        {
            name: 'T9. 알 수 없는 type → 무시 (통과)',
            scene: { exclusions: [{ condition: { type: 'nonsense' } }] },
            playerState: {},
            expect: false,
        },
    ];

    console.group('[부정 제약 테스터]');
    let pass = 0, fail = 0;
    for (const t of tests) {
        const got = isExcluded(t.scene, t.playerState);
        const ok = got === t.expect;
        console.log(`${ok ? '✅' : '❌'} ${t.name} — 예상:${t.expect} 실제:${got}`);
        ok ? pass++ : fail++;
    }
    console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
    console.groupEnd();
})();
