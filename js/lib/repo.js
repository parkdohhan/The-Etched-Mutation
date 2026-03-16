// DB CRUD function들 - Supabase 쿼리 직 중앙화

/**
 * memory list scenes choices 함께 load
 * @param {Object} client - Supabase client
 * @returns {Promise<Array>} memory array (각 memory scenes choices )
 */
export async function listMemoriesWithScenesChoices(client) {
    if (!client) {
        throw new Error('Supabase client not initialized.');
    }

    const { data: memoriesData, error } = await client
        .from('memories')
        .select('*')
        .order('id', { ascending: true });

    if (error) throw error;

    if (!memoriesData || memoriesData.length === 0) {
        return [];
    }

 // 각 memory scenes choices 불러오기
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
                originalEmotion: scene.original_emotion ? (typeof scene.original_emotion === 'string' ? JSON.parse(scene.original_emotion) : scene.original_emotion) : null,
                originalReasonVector: scene.original_reason_vector ? (typeof scene.original_reason_vector === 'string' ? JSON.parse(scene.original_reason_vector) : scene.original_reason_vector) : null,
                anchor_emotions: scene.anchor_emotions ? (Array.isArray(scene.anchor_emotions) ? scene.anchor_emotions : (typeof scene.anchor_emotions === 'string' ? JSON.parse(scene.anchor_emotions) : scene.anchor_emotions)) : null,
                text_stage_1: scene.text_stage_1 || null,
                text_stage_2: scene.text_stage_2 || null,
                text_stage_3: scene.text_stage_3 || null
            };
        }));

        return {
            id: memory.id,
            title: memory.title || '',
            code: memory.code || '',
            description: memory.description || '',
            memory_words: memory.memory_words || null,
            completed_sentence: memory.completed_sentence || null,
            author_note: memory.author_note || null,
            status: memory.status || 'Fetus',
            scenes: scenes,
            interpretationLayers: memory.layers || 0,
            visible: memory.is_public !== undefined ? memory.is_public : true,
            sensory_anchor: memory.sensory_anchor || null,
            body_response: memory.body_response || null,
            self_questions: memory.self_questions || null
        };
    }));

    return memories;
}

/**
 * memory 그래프 save (memories, scenes, choices)
 * @param {Object} client - Supabase client
 * @param {Object} memoryPayload - memory 페 load
 * - memoryId: number (업데 트 시) 또 null (create 시)
 *   - code: string
 *   - title: string
 * - scenes: Array - 각 scene { text, sceneType, echoWords, emotionDist, voidInfo, choices, ... } 형태
 * - memoryWaveData: Object (선택적) - plays 테 블 save wave_data
 */
export async function saveMemoryGraph(client, memoryPayload) {
    if (!client) {
        throw new Error('Supabase client not initialized.');
    }

    const { memoryId, code, title, description, memory_words, completed_sentence, author_note, status, source, scenes, memoryWaveData, curator_id, sound_map, sensory_anchor, body_response, self_questions } = memoryPayload;

    let finalMemoryId = memoryId;

 // memory save 또 업데 트
    if (finalMemoryId) {
 // 업데 트
        const { data: updateData, error } = await client
            .from('memories')
            .update({
                code: code,
                title: title,
                description: description || null,
                memory_words: memory_words || null,
                completed_sentence: completed_sentence || null,
                author_note: author_note || null,
                status: status || 'Fetus',
                source: source || 'beginner',
 // sound_map: sound_map || null, // temp 주석: 컬럼 없으면 Error occurred
                layers: 0,
                dilution: 100,
                is_public: true,
                ...(sensory_anchor ? { sensory_anchor } : {}),
                ...(body_response ? { body_response } : {}),
                ...(self_questions ? { self_questions } : {}),
            })
            .eq('id', finalMemoryId)
            .select();

        if (error) throw error;

 // existing scenes choices delete
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
 // 새 create
        const insertPayload = {
            code: code,
            title: title,
            description: description || null,
            memory_words: memory_words || null,
            completed_sentence: completed_sentence || null,
            author_note: author_note || null,
            status: status || 'Fetus',
            source: source || 'beginner',
 // sound_map: sound_map || null, // temp 주석: 컬럼 없으면 Error occurred
            layers: 0,
            dilution: 100,
            is_public: true
        };
 // curator_id 있으면 ( 그인 user)
        if (curator_id) {
            insertPayload.curator_id = curator_id;
        }
 // V3 메타data add
        if (sensory_anchor) insertPayload.sensory_anchor = sensory_anchor;
        if (body_response) insertPayload.body_response = body_response;
        if (self_questions) insertPayload.self_questions = self_questions;
        const { data, error } = await client
            .from('memories')
            .insert(insertPayload)
            .select()
            .single();

        if (error) throw error;

        if (!data || !data.id) {
            throw new Error('No response data received after creating memory.');
        }

        finalMemoryId = data.id;
    }

 // Scenes save
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];

 // emotionDist calculate (admin.js 동일 직)
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
            original_emotion: scene.originalEmotion ? (typeof scene.originalEmotion === 'string' ? scene.originalEmotion : JSON.stringify(scene.originalEmotion)) : null,
            original_reason_vector: scene.originalReasonVector ? (typeof scene.originalReasonVector === 'string' ? scene.originalReasonVector : JSON.stringify(scene.originalReasonVector)) : null,
            anchor_emotions: scene.anchor_emotions ? (Array.isArray(scene.anchor_emotions) ? scene.anchor_emotions : JSON.stringify(scene.anchor_emotions)) : null,
            text_stage_1: scene.text_stage_1 || null,
            text_stage_2: scene.text_stage_2 || null,
            text_stage_3: scene.text_stage_3 || null
        };

        const { data: sceneData, error: sceneError } = await client
            .from('scenes')
            .insert(insertData)
            .select()
            .single();

        if (sceneError) throw sceneError;

        if (!sceneData || !sceneData.id) {
            throw new Error(`No response data received after saving Scene ${i + 1}.`);
        }

 // Wave data 업데 트 (scene.waveData 있으면 , 없으면 emotion_vector 업데 트)
        if (scene.waveData) {
            const { error: waveUpdateError } = await client
                .from('scenes')
                .update({
                    emotion_vector: emotionDistObj,
                    wave_data: scene.waveData
                })
                .eq('id', sceneData.id);

 // wave_data Update failed ignore (선택적)
            if (waveUpdateError) {
                console.warn(`Scene ${i + 1} Wave 데이터 Update failed (무시됨):`, waveUpdateError);
            }
        } else {
 // waveData 없으면 emotion_vector 업데 트
            const { error: waveUpdateError } = await client
                .from('scenes')
                .update({
                    emotion_vector: emotionDistObj
                })
                .eq('id', sceneData.id);

            if (waveUpdateError) {
                console.warn(`Scene ${i + 1} emotion_vector Update failed (무시됨):`, waveUpdateError);
            }
        }

 // Choices save
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

 // Plays 테 블 wave_data save (선택적)
    if (memoryWaveData) {
        try {
            const { error: playsError } = await client
                .from('plays')
                .insert({
                    memory_id: finalMemoryId,
                    wave_data: memoryWaveData,
                    layer_id: 0
                });

 // plays Save failed ignore (선택적)
            if (playsError) {
                console.warn('Plays 테이블 Save failed (무시됨):', playsError);
            }
        } catch (playsError) {
            console.warn('Plays 테이블 저장 중 예외 발생 (무시됨):', playsError);
        }
    }

    return finalMemoryId;
}

/**
 * memory 그래프 delete (choices -> scenes -> memories 순서)
 * @param {Object} client - Supabase client
 * @param {number} memoryId - delete memory ID
 */
export async function deleteMemoryGraph(client, memoryId) {
    if (!client) {
        throw new Error('Supabase client not initialized.');
    }

 // 1. scenes 먼저 져 서 scene_id list 얻기
    const { data: scenesData } = await client
        .from('scenes')
        .select('id')
        .eq('memory_id', memoryId);

    const sceneIds = scenesData && scenesData.length > 0 ? scenesData.map(s => s.id) : [];

 // 2. plays 테 블 서 delete (memory_id scene_id 모두 시 )
 // plays scene_id 외래키 지고 있 수 있으므 scenes delete 전 먼저 delete해야 함
    try {
 // memory_id delete 시 
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

 // scene_id delete 시 (외래키 제약조건 needed 수 있음)
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

 // 3. choices delete
    if (sceneIds.length > 0) {
        await client.from('choices').delete().in('scene_id', sceneIds);
    }

 // 4. scenes delete
    if (sceneIds.length > 0) {
        await client.from('scenes').delete().eq('memory_id', memoryId);
    }

 // 5. memory delete
    const { error } = await client
        .from('memories')
        .delete()
        .eq('id', memoryId);

    if (error) throw error;
}

/**
 * 백업 서 scene 복구
 * @param {Object} client - Supabase client
 * @param {string} memoryCode - memory 코드
 * @param {Array} scenesArray - 복구 scene array
 */
export async function recoverScenesFromBackup(client, memoryCode, scenesArray) {
    if (!client) {
        throw new Error('Supabase client not initialized.');
    }

 // Supabase 서 해당 memory 찾기
    const { data: existingMemories, error: memError } = await client
        .from('memories')
        .select('id')
        .eq('code', memoryCode)
        .limit(1);

    if (memError) throw memError;

    if (!existingMemories || existingMemories.length === 0) {
        throw new Error('Memory not found in Supabase. Please save the memory in admin.html first.');
    }

    const memoryId = existingMemories[0].id;

 // existing scenes delete
    const { error: deleteError } = await client
        .from('scenes')
        .delete()
        .eq('memory_id', memoryId);

    if (deleteError) throw deleteError;

 // scene 복구
    for (let i = 0; i < scenesArray.length; i++) {
        const scene = scenesArray[i];

 // emotionDist calculate
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
 * archive layer list load
 * @param {Object} client - Supabase client
 * @param {number} memoryId - memory ID
 * @returns {Promise<Array>} plays 테 블 data array
 */
export async function listArchiveLayers(client, memoryId) {
    if (!client) {
        throw new Error('Supabase client not initialized.');
    }

    const { data, error } = await client
        .from('plays')
        .select('*')
        .eq('memory_id', memoryId)
        .order('layer_id', { ascending: true });

    if (error) throw error;

    return data || [];
}
