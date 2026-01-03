// DB CRUD 함수들 - Supabase 쿼리 로직을 중앙화

/**
 * 메모리 목록을 scenes와 choices와 함께 로드
 * @param {Object} client - Supabase 클라이언트
 * @returns {Promise<Array>} 메모리 배열 (각 메모리에 scenes와 choices 포함)
 */
export async function listMemoriesWithScenesChoices(client) {
    if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    const { data: memoriesData, error } = await client
        .from('memories')
        .select('*')
        .order('id', { ascending: true });

    if (error) throw error;

    if (!memoriesData || memoriesData.length === 0) {
        return [];
    }

    // 각 메모리의 scenes와 choices를 불러오기
    const memories = await Promise.all(memoriesData.map(async (memory) => {
        const { data: scenesData, error: scenesError } = await client
            .from('scenes')
            .select('*')
            .eq('memory_id', memory.id)
            .order('scene_order', { ascending: true });

        if (scenesError) throw scenesError;

        const scenes = await Promise.all((scenesData || []).map(async (scene) => {
            const { data: choicesData, error: choicesError } = await client
                .from('choices')
                .select('*')
                .eq('scene_id', scene.id)
                .order('choice_order', { ascending: true });

            if (choicesError) throw choicesError;

            return {
                id: scene.id,
                text: scene.text || '',
                sceneType: scene.scene_type || 'normal',
                echoWords: Array.isArray(scene.echo_words) ? scene.echo_words : (scene.echo_words ? JSON.parse(scene.echo_words) : []),
                emotionDist: scene.emotion_dist || {},
                voidInfo: scene.void_info || null,
                choices: (choicesData || []).map(choice => ({
                    id: choice.id,
                    text: choice.text || '',
                    emotion: choice.emotion || 'fear',
                    intensity: choice.intensity || 5,
                    nextScene: 'end',
                    percentage: 0
                })),
                originalChoice: scene.original_choice || 0,
                originalReason: scene.original_reason || '',
                originalEmotion: scene.original_emotion ? (typeof scene.original_emotion === 'string' ? JSON.parse(scene.original_emotion) : scene.original_emotion) : null
            };
        }));

        return {
            id: memory.id,
            title: memory.title || '',
            code: memory.code || '',
            description: '',
            scenes: scenes,
            interpretationLayers: memory.layers || 0,
            visible: memory.is_public !== undefined ? memory.is_public : true
        };
    }));

    return memories;
}

/**
 * 메모리 그래프 저장 (memories, scenes, choices)
 * @param {Object} client - Supabase 클라이언트
 * @param {Object} memoryPayload - 메모리 페이로드
 *   - memoryId: number (업데이트 시) 또는 null (생성 시)
 *   - code: string
 *   - title: string
 *   - scenes: Array - 각 scene은 { text, sceneType, echoWords, emotionDist, voidInfo, choices, ... } 형태
 *   - memoryWaveData: Object (선택적) - plays 테이블에 저장할 wave_data
 */
export async function saveMemoryGraph(client, memoryPayload) {
    if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    const { memoryId, code, title, scenes, memoryWaveData } = memoryPayload;

    let finalMemoryId = memoryId;

    // 메모리 저장 또는 업데이트
    if (finalMemoryId) {
        // 업데이트
        const { data: updateData, error } = await client
            .from('memories')
            .update({
                code: code,
                title: title,
                layers: 0,
                dilution: 50,
                is_public: true
            })
            .eq('id', finalMemoryId)
            .select();

        if (error) throw error;

        // 기존 scenes와 choices 삭제
        const { data: existingScenes, error: scenesSelectError } = await client
            .from('scenes')
            .select('id')
            .eq('memory_id', finalMemoryId);

        if (scenesSelectError) throw scenesSelectError;

        if (existingScenes && existingScenes.length > 0) {
            const sceneIds = existingScenes.map(s => s.id);
            const { error: choicesDeleteError } = await client
                .from('choices')
                .delete()
                .in('scene_id', sceneIds);

            if (choicesDeleteError) throw choicesDeleteError;

            const { error: scenesDeleteError } = await client
                .from('scenes')
                .delete()
                .eq('memory_id', finalMemoryId);

            if (scenesDeleteError) throw scenesDeleteError;
        }
    } else {
        // 새로 생성
        const { data, error } = await client
            .from('memories')
            .insert({
                code: code,
                title: title,
                layers: 0,
                dilution: 50,
                is_public: true
            })
            .select()
            .single();

        if (error) throw error;

        if (!data || !data.id) {
            throw new Error('메모리 생성 후 응답 데이터를 받지 못했습니다.');
        }

        finalMemoryId = data.id;
    }

    // Scenes 저장
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];

        // emotionDist 계산 (admin.js와 동일한 로직)
        const emotionDist = {
            fear: 0, sadness: 0, guilt: 0, anger: 0,
            longing: 0, isolation: 0, numbness: 0, moralPain: 0
        };

        if (scene.choices && scene.choices.length > 0) {
            scene.choices.forEach(choice => {
                const intensity = (choice.intensity || 5) / 10;
                if (emotionDist.hasOwnProperty(choice.emotion)) {
                    emotionDist[choice.emotion] += intensity;
                }
            });
        }

        const total = Object.values(emotionDist).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(emotionDist).forEach(key => {
                emotionDist[key] = Math.round((emotionDist[key] / total) * 100);
            });
        }

        const echoWords = scene.echoWords || [];
        const emotionDistObj = emotionDist;

        const insertData = {
            memory_id: finalMemoryId,
            scene_order: i,
            text: scene.text || '',
            echo_words: echoWords,
            emotion_dist: emotionDistObj,
            scene_type: scene.sceneType || 'normal',
            void_info: scene.voidInfo || null,
            original_choice: scene.originalChoice !== undefined ? scene.originalChoice : null,
            original_reason: scene.originalReason || null,
            original_emotion: scene.originalEmotion ? (typeof scene.originalEmotion === 'string' ? scene.originalEmotion : JSON.stringify(scene.originalEmotion)) : null
        };

        const { data: sceneData, error: sceneError } = await client
            .from('scenes')
            .insert(insertData)
            .select()
            .single();

        if (sceneError) throw sceneError;

        if (!sceneData || !sceneData.id) {
            throw new Error(`Scene ${i + 1} 저장 후 응답 데이터를 받지 못했습니다.`);
        }

        // Wave 데이터 업데이트 (scene.waveData가 있으면 사용, 없으면 emotion_vector만 업데이트)
        if (scene.waveData) {
            const { error: waveUpdateError } = await client
                .from('scenes')
                .update({
                    emotion_vector: emotionDistObj,
                    wave_data: scene.waveData
                })
                .eq('id', sceneData.id);

            // wave_data 업데이트 실패는 무시 (선택적)
            if (waveUpdateError) {
                console.warn(`Scene ${i + 1} Wave 데이터 업데이트 실패 (무시됨):`, waveUpdateError);
            }
        } else {
            // waveData가 없으면 emotion_vector만 업데이트
            const { error: waveUpdateError } = await client
                .from('scenes')
                .update({
                    emotion_vector: emotionDistObj
                })
                .eq('id', sceneData.id);

            if (waveUpdateError) {
                console.warn(`Scene ${i + 1} emotion_vector 업데이트 실패 (무시됨):`, waveUpdateError);
            }
        }

        // Choices 저장
        if (scene.choices && scene.choices.length > 0) {
            for (let j = 0; j < scene.choices.length; j++) {
                const choice = scene.choices[j];
                const { error: choiceError } = await client
                    .from('choices')
                    .insert({
                        scene_id: sceneData.id,
                        choice_order: j,
                        text: choice.text || '',
                        emotion: choice.emotion || 'fear',
                        intensity: choice.intensity || 5
                    });

                if (choiceError) throw choiceError;
            }
        }
    }

    // Plays 테이블에 wave_data 저장 (선택적)
    if (memoryWaveData) {
        try {
            const { error: playsError } = await client
                .from('plays')
                .insert({
                    memory_id: finalMemoryId,
                    wave_data: memoryWaveData,
                    layer_id: 0
                });

            // plays 저장 실패는 무시 (선택적)
            if (playsError) {
                console.warn('Plays 테이블 저장 실패 (무시됨):', playsError);
            }
        } catch (playsError) {
            console.warn('Plays 테이블 저장 중 예외 발생 (무시됨):', playsError);
        }
    }

    return finalMemoryId;
}

/**
 * 메모리 그래프 삭제 (choices -> scenes -> memories 순서)
 * @param {Object} client - Supabase 클라이언트
 * @param {number} memoryId - 삭제할 메모리 ID
 */
export async function deleteMemoryGraph(client, memoryId) {
    if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    // 1. scenes를 먼저 가져와서 scene_id 목록 얻기
    const { data: scenesData } = await client
        .from('scenes')
        .select('id')
        .eq('memory_id', memoryId);

    const sceneIds = scenesData && scenesData.length > 0 ? scenesData.map(s => s.id) : [];

    // 2. plays 테이블에서 삭제 (memory_id와 scene_id 모두로 시도)
    // plays가 scene_id를 외래키로 가지고 있을 수 있으므로 scenes 삭제 전에 먼저 삭제해야 함
    try {
        // memory_id로 삭제 시도
        const { error: memoryIdError } = await client
            .from('plays')
            .delete()
            .eq('memory_id', memoryId);
        
        if (memoryIdError) {
            console.warn('plays 테이블 memory_id 삭제 중 오류:', memoryIdError);
        }
    } catch (error) {
        console.warn('plays 테이블 memory_id 삭제 중 예외 발생 (무시하고 계속 진행):', error);
    }

    // scene_id로도 삭제 시도 (외래키 제약조건 때문에 필요할 수 있음)
    if (sceneIds.length > 0) {
        try {
            const { error: sceneIdError } = await client
                .from('plays')
                .delete()
                .in('scene_id', sceneIds);
            
            if (sceneIdError) {
                console.warn('plays 테이블 scene_id 삭제 중 오류:', sceneIdError);
            }
        } catch (error) {
            console.warn('plays 테이블 scene_id 삭제 중 예외 발생 (무시하고 계속 진행):', error);
        }
    }

    // 3. choices 삭제
    if (sceneIds.length > 0) {
        await client.from('choices').delete().in('scene_id', sceneIds);
    }

    // 4. scenes 삭제
    if (sceneIds.length > 0) {
        await client.from('scenes').delete().eq('memory_id', memoryId);
    }

    // 5. 메모리 삭제
    const { error } = await client
        .from('memories')
        .delete()
        .eq('id', memoryId);

    if (error) throw error;
}

/**
 * 백업에서 장면 복구
 * @param {Object} client - Supabase 클라이언트
 * @param {string} memoryCode - 메모리 코드
 * @param {Array} scenesArray - 복구할 장면 배열
 */
export async function recoverScenesFromBackup(client, memoryCode, scenesArray) {
    if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    // Supabase에서 해당 메모리 찾기
    const { data: existingMemories, error: memError } = await client
        .from('memories')
        .select('id')
        .eq('code', memoryCode)
        .limit(1);

    if (memError) throw memError;

    if (!existingMemories || existingMemories.length === 0) {
        throw new Error('Supabase에서 해당 메모리를 찾을 수 없습니다. 먼저 admin.html에서 메모리를 저장하세요.');
    }

    const memoryId = existingMemories[0].id;

    // 기존 scenes 삭제
    const { error: deleteError } = await client
        .from('scenes')
        .delete()
        .eq('memory_id', memoryId);

    if (deleteError) throw deleteError;

    // 장면 복구
    for (let i = 0; i < scenesArray.length; i++) {
        const scene = scenesArray[i];

        // emotionDist 계산
        const emotionDist = {
            fear: 0, sadness: 0, guilt: 0, anger: 0,
            longing: 0, isolation: 0, numbness: 0, moralPain: 0
        };

        if (scene.choices && scene.choices.length > 0) {
            scene.choices.forEach(choice => {
                const intensity = (choice.intensity || 5) / 10;
                if (emotionDist.hasOwnProperty(choice.emotion)) {
                    emotionDist[choice.emotion] += intensity;
                }
            });
        }

        const total = Object.values(emotionDist).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(emotionDist).forEach(key => {
                emotionDist[key] = Math.round((emotionDist[key] / total) * 100);
            });
        }

        const { data: sceneData, error: sceneError } = await client
            .from('scenes')
            .insert({
                memory_id: memoryId,
                scene_order: i,
                text: scene.text || '',
                echo_words: scene.echoWords || [],
                emotion_dist: emotionDist,
                scene_type: scene.sceneType || 'normal',
                void_info: scene.voidInfo || null
            })
            .select()
            .single();

        if (sceneError) throw sceneError;

        // Choices 복구
        if (scene.choices && scene.choices.length > 0) {
            for (let j = 0; j < scene.choices.length; j++) {
                const choice = scene.choices[j];
                await client
                    .from('choices')
                    .insert({
                        scene_id: sceneData.id,
                        choice_order: j,
                        text: choice.text || '',
                        emotion: choice.emotion || 'fear',
                        intensity: choice.intensity || 5
                    });
            }
        }
    }
}

/**
 * 아카이브 레이어 목록 로드
 * @param {Object} client - Supabase 클라이언트
 * @param {number} memoryId - 메모리 ID
 * @returns {Promise<Array>} plays 테이블 데이터 배열
 */
export async function listArchiveLayers(client, memoryId) {
    if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    const { data, error } = await client
        .from('plays')
        .select('*')
        .eq('memory_id', memoryId)
        .order('layer_id', { ascending: true });

    if (error) throw error;

    return data || [];
}
