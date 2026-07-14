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
                scene_role: scene.scene_role || null,
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
                text_stage_3: scene.text_stage_3 || null,
                exclusions: scene.exclusions ? (Array.isArray(scene.exclusions) ? scene.exclusions : (typeof scene.exclusions === 'string' ? JSON.parse(scene.exclusions) : scene.exclusions)) : null,
                meta: scene.meta || null
            };
        }));

        return {
            id: memory.id,
            title: memory.title || '',
            code: memory.code || '',
            description: memory.description || '',
            sound_map: memory.sound_map || null,
            memory_words: memory.memory_words || null,
            completed_sentence: memory.completed_sentence || null,
            author_note: memory.author_note || null,
            status: memory.status || 'Fetus',
            scenes: scenes,
            interpretationLayers: memory.cont_depth || 0,
            visible: memory.is_public !== undefined ? memory.is_public : true,
            sensory_anchor: memory.sensory_anchor || null,
            body_response: memory.body_response || null,
            self_questions: memory.self_questions || null,
            original_vector: memory.original_vector || null,
            // Lumen V1 (2026-04-21+)
            original_reason_vector: memory.original_reason_vector || null,
            cont_depth: memory.cont_depth != null ? memory.cont_depth : null,
            cont_divergence: memory.cont_divergence != null ? memory.cont_divergence : null,
            cont_convergence: memory.cont_convergence != null ? memory.cont_convergence : null,
            cont_heterogeneity: memory.cont_heterogeneity != null ? memory.cont_heterogeneity : null,
            cont_stage_1: memory.cont_stage_1 != null ? memory.cont_stage_1 : null,
            cont_stage_2: memory.cont_stage_2 != null ? memory.cont_stage_2 : null,
            cont_stage_3: memory.cont_stage_3 != null ? memory.cont_stage_3 : null,
            terrain_shape: memory.terrain_shape || null,
            ghost_condensation_points: Array.isArray(memory.ghost_condensation_points) ? memory.ghost_condensation_points : []
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

    const { memoryId, code, title, description, memory_words, completed_sentence, original_vector, author_note, status, source, scenes, memoryWaveData, curator_id, sound_map, sensory_anchor, body_response, self_questions, original_reason_vector, cont_depth, cont_divergence, cont_convergence, cont_heterogeneity, cont_stage_1, cont_stage_2, cont_stage_3, terrain_shape, ghost_condensation_points } = memoryPayload;

    let finalMemoryId = memoryId;
    let existingSceneIds = new Set(); // R1-1: diff 저장용 — 신규 생성이면 빈 집합

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
                original_vector: original_vector || null,
                author_note: author_note || null,
                // R1-4 (2026-07-14): layers/dilution/is_public 강제 리셋 제거 — 작가가 저장할 때마다
                // 공개 상태·희석값이 초기화되던 경로. UPDATE 에서는 기존 값 보존 (키 자체를 안 보냄).
                // status/source 도 값이 안 왔으면 기존 값을 덮지 않는다 (|| 폴백이 기존 값을 덮던 버그).
                ...(status ? { status } : {}),
                ...(source ? { source } : {}),
                ...(sound_map ? { sound_map } : {}),
                ...(sensory_anchor !== undefined ? { sensory_anchor } : {}),
                ...(body_response ? { body_response } : {}),
                ...(self_questions ? { self_questions } : {}),
                ...(original_reason_vector !== undefined ? { original_reason_vector } : {}),
                ...(cont_depth !== undefined ? { cont_depth } : {}),
                ...(cont_divergence !== undefined ? { cont_divergence } : {}),
                ...(cont_convergence !== undefined ? { cont_convergence } : {}),
                ...(cont_heterogeneity !== undefined ? { cont_heterogeneity } : {}),
                ...(cont_stage_1 !== undefined ? { cont_stage_1 } : {}),
                ...(cont_stage_2 !== undefined ? { cont_stage_2 } : {}),
                ...(cont_stage_3 !== undefined ? { cont_stage_3 } : {}),
                ...(terrain_shape ? { terrain_shape } : {}),
                ...(ghost_condensation_points !== undefined ? { ghost_condensation_points } : {}),
            })
            .eq('id', finalMemoryId)
            .select();

        if (error) throw error;

 // R1-1 (2026-07-14): 파괴 저장 제거. 예전에는 여기서 기존 scenes 를 전부 DELETE 후
 // 새 UUID 로 INSERT 했다 — plays.scene_id FK 가 ON DELETE CASCADE 라 저장할 때마다
 // 그 기억의 플레이 기록이 통째로 증발했다. 이제 기존 씬 id 를 수집해 diff 저장:
 // id 있는 씬 = UPDATE, id 없는 씬 = INSERT, 목록에서 사라진 씬만 DELETE.
        const { data: existingScenes, error: scenesSelectError } = await client
            .from('scenes')
            .select('id')
            .eq('memory_id', finalMemoryId);

        if (scenesSelectError) throw scenesSelectError;

        existingSceneIds = new Set((existingScenes || []).map(s => s.id));

        const keptIds = new Set(
            scenes.filter(s => s.id && existingSceneIds.has(s.id)).map(s => s.id)
        );
        const removedIds = [...existingSceneIds].filter(id => !keptIds.has(id));

        if (removedIds.length > 0) {
            const { error: choicesDeleteError } = await client
                .from('choices')
                .delete()
                .in('scene_id', removedIds);

            if (choicesDeleteError) throw choicesDeleteError;

            const { error: scenesDeleteError } = await client
                .from('scenes')
                .delete()
                .in('id', removedIds);

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
            original_vector: original_vector || null,
            author_note: author_note || null,
            status: status || 'Fetus',
            source: source || 'beginner',
            layers: 0,
            dilution: 100,
            is_public: true
        };
 // curator_id 있으면 ( 그인 user)
        if (curator_id) {
            insertPayload.curator_id = curator_id;
        }
 // V3 메타data add
        if (sound_map) insertPayload.sound_map = sound_map;
        if (sensory_anchor) insertPayload.sensory_anchor = sensory_anchor;
        if (body_response) insertPayload.body_response = body_response;
        if (self_questions) insertPayload.self_questions = self_questions;
 // Lumen 확장 (2026-04-21)
        if (original_reason_vector) insertPayload.original_reason_vector = original_reason_vector;
        if (cont_depth !== undefined && cont_depth !== null) insertPayload.cont_depth = cont_depth;
        if (cont_divergence !== undefined && cont_divergence !== null) insertPayload.cont_divergence = cont_divergence;
        if (cont_convergence !== undefined && cont_convergence !== null) insertPayload.cont_convergence = cont_convergence;
        if (cont_heterogeneity !== undefined && cont_heterogeneity !== null) insertPayload.cont_heterogeneity = cont_heterogeneity;
        if (cont_stage_1 !== undefined && cont_stage_1 !== null) insertPayload.cont_stage_1 = cont_stage_1;
        if (cont_stage_2 !== undefined && cont_stage_2 !== null) insertPayload.cont_stage_2 = cont_stage_2;
        if (cont_stage_3 !== undefined && cont_stage_3 !== null) insertPayload.cont_stage_3 = cont_stage_3;
        if (terrain_shape) insertPayload.terrain_shape = terrain_shape;
        if (ghost_condensation_points !== undefined) insertPayload.ghost_condensation_points = ghost_condensation_points;
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

 // Scenes save — R1-1: id 있는 씬 = UPDATE (plays FK 보존), id 없는 씬 = INSERT
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const isUpdate = !!(scene.id && existingSceneIds.has(scene.id));
        const hasChoices = !!(scene.choices && scene.choices.length > 0);

 // emotionDist calculate (admin.js 동일 직) — R1-3: choices 있을 때만 계산.
 // choices 0개 씬의 emotion_dist/emotion_vector 를 0벡터로 덮어쓰던 버그 제거.
        let emotionDistObj = null;
        if (hasChoices) {
            const emotionDist = {
                fear: 0, sadness: 0, guilt: 0, anger: 0,
                longing: 0, isolation: 0, numbness: 0, moralPain: 0
            };

            scene.choices.forEach(choice => {
                const intensity = (choice.intensity || 5) / 10;
                if (emotionDist.hasOwnProperty(choice.emotion)) {
                    emotionDist[choice.emotion] += intensity;
                }
            });

            const total = Object.values(emotionDist).reduce((sum, val) => sum + val, 0);
            if (total > 0) {
                Object.keys(emotionDist).forEach(key => {
                    emotionDist[key] = Math.round((emotionDist[key] / total) * 100);
                });
            }
            emotionDistObj = emotionDist;
        } else if (!isUpdate && scene.emotionDist && Object.keys(scene.emotionDist).length > 0) {
 // 신규 INSERT 인데 choices 없음 — 들고 온 emotionDist(Record/로드값)가 있으면 그대로 사용
            emotionDistObj = scene.emotionDist;
        }

        const echoWords = scene.echoWords || [];

        const scenePayload = {
            memory_id: finalMemoryId,
            scene_order: i,
            text: scene.text || '',
            echo_words: echoWords,
            scene_type: scene.sceneType || 'normal',
            void_info: scene.voidInfo || null,
            original_choice: scene.originalChoice !== undefined ? scene.originalChoice : null,
            original_reason: scene.originalReason || null,
            original_emotion: scene.originalEmotion ? (typeof scene.originalEmotion === 'string' ? scene.originalEmotion : JSON.stringify(scene.originalEmotion)) : null,
            original_reason_vector: scene.originalReasonVector ? (typeof scene.originalReasonVector === 'string' ? scene.originalReasonVector : JSON.stringify(scene.originalReasonVector)) : null,
            anchor_emotions: scene.anchor_emotions ? (Array.isArray(scene.anchor_emotions) ? scene.anchor_emotions : JSON.stringify(scene.anchor_emotions)) : null,
            text_stage_1: scene.text_stage_1 || null,
            text_stage_2: scene.text_stage_2 || null,
            text_stage_3: scene.text_stage_3 || null,
            exclusions: scene.exclusions && Array.isArray(scene.exclusions) && scene.exclusions.length > 0 ? scene.exclusions : null,
            // meta JSONB 보존: pin_override(궤적 레이어) / stage_position(위치 레이어, 작업 15) /
            // motif_tags / scene_code / author_bridges 등이 저장 사이클에서 살아남도록.
            meta: scene.meta || null
        };

 // R1-2: scene_role — 값을 들고 온 경우에만 포함 (다른 호출자가 null 로 덮지 않게)
        if (scene.scene_role !== undefined) {
            scenePayload.scene_role = scene.scene_role;
        }

 // R1-3: emotion_dist 는 계산된 경우에만 포함. UPDATE + choices 0개 = 키 자체를 안 보냄 (기존 값 보존)
        if (emotionDistObj) {
            scenePayload.emotion_dist = emotionDistObj;
        }

        let sceneId;
        if (isUpdate) {
            const { data: updatedRows, error: sceneError } = await client
                .from('scenes')
                .update(scenePayload)
                .eq('id', scene.id)
                .select();

            if (sceneError) throw sceneError;
            if (!updatedRows || updatedRows.length === 0) {
                throw new Error(`Scene ${i + 1} UPDATE 가 0행을 갱신함 (id=${scene.id}). RLS 또는 쓰기 권한 문제.`);
            }
            sceneId = scene.id;
        } else {
            const { data: sceneData, error: sceneError } = await client
                .from('scenes')
                .insert(scenePayload)
                .select()
                .single();

            console.log(`[saveMemoryGraph] Scene ${i} INSERT 결과:`, { id: sceneData?.id, memory_id: sceneData?.memory_id, error: sceneError });

            if (sceneError) throw sceneError;

            if (!sceneData || !sceneData.id) {
                throw new Error(`No response data received after saving Scene ${i + 1}.`);
            }

            // FK 검증: 방금 INSERT한 scene이 실제로 DB에 있는지 재확인
            const { data: verifyScene, error: verifyError } = await client
                .from('scenes')
                .select('id')
                .eq('id', sceneData.id)
                .maybeSingle();
            if (verifyError || !verifyScene) {
                console.error(`[saveMemoryGraph] Scene ${i} INSERT 응답은 있으나 DB 재조회 실패:`, { sceneData, verifyError });
                throw new Error(`Scene ${i + 1} INSERT 응답 ID(${sceneData.id})가 DB에 없음. RLS 또는 쓰기 권한 문제.`);
            }
            sceneId = sceneData.id;
        }

 // Wave/emotion_vector 업데 트 (실패 무시 — 기존 관용 유지). R1-3: 계산된 경우에만.
        const tolerantUpdate = {};
        if (emotionDistObj) tolerantUpdate.emotion_vector = emotionDistObj;
        if (scene.waveData) tolerantUpdate.wave_data = scene.waveData;
        if (Object.keys(tolerantUpdate).length > 0) {
            const { error: waveUpdateError } = await client
                .from('scenes')
                .update(tolerantUpdate)
                .eq('id', sceneId);

            if (waveUpdateError) {
                console.warn(`Scene ${i + 1} emotion_vector/wave_data Update failed (무시됨):`, waveUpdateError);
            }
        }

 // Choices save — 씬별 교체 (UPDATE 씬은 기존 choices 삭제 후 재삽입)
        if (isUpdate) {
            const { error: choicesClearError } = await client
                .from('choices')
                .delete()
                .eq('scene_id', sceneId);

            if (choicesClearError) throw choicesClearError;
        }

        if (hasChoices) {
            for (let j = 0; j < scene.choices.length; j++) {
                const choice = scene.choices[j];
                const { error: choiceError } = await client
                    .from('choices')
                    .insert({
                        scene_id: sceneId,
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

 // 3-b. trajectory_bridges delete (FK constraint 방지)
    try {
        const { error: bridgesError } = await client
            .from('trajectory_bridges')
            .delete()
            .eq('memory_id', memoryId);
        if (bridgesError) {
            console.warn('trajectory_bridges 삭제 중 오류:', bridgesError);
        }
    } catch (error) {
        console.warn('trajectory_bridges 삭제 중 예외 발생 (무시하고 계속 진행):', error);
    }

 // 4. scenes delete
    if (sceneIds.length > 0) {
        await client.from('scenes').delete().eq('memory_id', memoryId);
    }

 // 5. memory delete — .select() returns deleted rows; empty array = silent RLS failure
    const { data: deletedRows, error } = await client
        .from('memories')
        .delete()
        .eq('id', memoryId)
        .select();

    if (error) throw error;

 // 6. Verify deletion (RLS 등으로 silent failure 감지)
    if (!deletedRows || deletedRows.length === 0) {
        throw new Error(`삭제에 실패했습니다. memory id=${memoryId}. RLS 정책 또는 권한 문제일 수 있습니다.`);
    }

 // 7. Post-delete verification — re-query to ensure the row is gone
    const { data: verifyRows, error: verifyError } = await client
        .from('memories')
        .select('id')
        .eq('id', memoryId);
    if (verifyError) {
        console.warn('[deleteMemoryGraph] 삭제 검증 쿼리 실패:', verifyError);
    } else if (verifyRows && verifyRows.length > 0) {
        throw new Error(`삭제 후에도 memory id=${memoryId}가 남아있습니다. RLS 정책을 확인하세요.`);
    }
    console.log(`[deleteMemoryGraph] memory id=${memoryId} 삭제 확인됨 (${deletedRows.length}행 삭제)`);
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
