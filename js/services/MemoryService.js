// js/services/MemoryService.js
// memory save 직 중앙화하 service

import { networkService } from './NetworkService.js';

/**
 * memory save 위 payload 구성
 * @param {Object} memory - memory object { title, scenes: [...] }
 * @returns {Object} save 위 payload object
 */
function buildMemoryPayload(memory) {
    return {
        memory: {
            title: memory.title,
            status: 'Fetus',
            created_at: new Date().toISOString()
        },
        scenes: memory.scenes.map((scene, index) => ({
            scene: {
                scene_order: index + 1,
                text: scene.text,
                original_emotion: scene.originalEmotion,
                original_reason: scene.originalReason,
                original_reason_vector: scene.original_reason_vector,
                scene_type: index === memory.scenes.length - 1 ? 'ending' : 'branch'
            },
            choices: (scene.choices || []).map((choiceText, choiceIndex) => ({
                text: choiceText,
                next_scene_order: choiceIndex + 1 < scene.choices.length ? index + 2 : null
            }))
        }))
    };
}

/**
 * memory payload validate
 * @param {Object} payload - buildMemoryPayload result
 * @returns {{ valid: boolean, error?: string }} validate result
 */
function validateMemoryPayload(payload) {
    if (!payload.memory) {
        return { valid: false, error: 'memory field is missing' };
    }
    
    if (!payload.memory.title || typeof payload.memory.title !== 'string' || payload.memory.title.trim() === '') {
        return { valid: false, error: 'memory.title is invalid' };
    }
    
    if (!Array.isArray(payload.scenes) || payload.scenes.length === 0) {
        return { valid: false, error: 'scenes array is missing or empty' };
    }
    
    for (let i = 0; i < payload.scenes.length; i++) {
        const sceneItem = payload.scenes[i];
        if (!sceneItem.scene) {
            return { valid: false, error: `scenes[${i}].scene is missing` };
        }
        
        if (!sceneItem.scene.text || typeof sceneItem.scene.text !== 'string' || sceneItem.scene.text.trim() === '') {
            return { valid: false, error: `scenes[${i}].scene.text is invalid` };
        }
        
        if (!Array.isArray(sceneItem.choices)) {
            return { valid: false, error: `scenes[${i}].choices is not an array` };
        }
        
        for (let j = 0; j < sceneItem.choices.length; j++) {
            const choice = sceneItem.choices[j];
            if (!choice.text || typeof choice.text !== 'string' || choice.text.trim() === '') {
                return { valid: false, error: `scenes[${i}].choices[${j}].text is invalid` };
            }
        }
    }
    
    return { valid: true };
}

/**
 * memory DB save (NetworkService )
 * @param {Object} payload - buildMemoryPayload result
 * @returns {Promise<{ ok: boolean, data: Object|null, error: Error|null }>}
 */
async function persistMemory(payload) {
    try {
 // 1. memory save
        const memoryResult = await networkService.saveMemory(payload.memory);
        if (!memoryResult.ok) {
            console.error('[MemoryService] 메모리 Save failed:', memoryResult.error);
            return { ok: false, data: null, error: memoryResult.error };
        }
        
        const memoryData = memoryResult.data;
        console.log('[Memory] New memory created with status: Fetus');
        console.log('메모리 저장 성공:', memoryData);
        
 // 2. 각 scene save
        const savedScenes = [];
        for (let i = 0; i < payload.scenes.length; i++) {
            const sceneItem = payload.scenes[i];
            const sceneData = {
                ...sceneItem.scene,
                memory_id: memoryData.id
            };
            
            const sceneResult = await networkService.saveScene(sceneData);
            if (!sceneResult.ok) {
                console.error(`[MemoryService] Scene ${i + 1} Save failed:`, sceneResult.error);
 // existing 코드 동일하게 continue ( 러 있어 다음 scene save 시 )
                continue;
            }
            
            console.log(`Scene ${i + 1} 저장 성공:`, sceneResult.data);
            savedScenes.push(sceneResult.data);
            
 // 3. 각 choices save
            for (let j = 0; j < sceneItem.choices.length; j++) {
                const choice = sceneItem.choices[j];
 // 빈 choices 건너뛰기 (existing 직 동일)
                if (!choice.text || choice.text.trim().length === 0) {
                    continue;
                }
                
                const choiceData = {
                    scene_id: sceneResult.data.id,
                    text: choice.text,
                    next_scene_order: choice.next_scene_order
                };
                
                const choiceResult = await networkService.saveChoice(choiceData);
                if (!choiceResult.ok) {
                    console.error(`[MemoryService] Choice ${j + 1} Save failed:`, choiceResult.error);
 // existing 코드 동일하게 러 그 남기고 계속 진행
                }
            }
        }
        
        return {
            ok: true,
            data: {
                memory: memoryData,
                scenes: savedScenes
            },
            error: null
        };
    } catch (error) {
        console.error('[MemoryService] persistMemory Error occurred:', error);
        return { ok: false, data: null, error };
    }
}

/**
 * save 후 needed 업데 트 (현재 그 , 나중 확장 possible)
 * @param {Object} result - persistMemory result
 */
function postPersistUpdates(result) {
    if (result.ok) {
        console.log('기억 저장 완료');
    }
 // 나중 store 업데 트나 UI 업데 트 needed하면 여기 add
}

/**
 * MemoryService - memory save 중앙화
 */
export const MemoryService = {
    /**
 * memory save
     * @param {Object} params - { memory: { title, scenes: [...] } }
     * @returns {Promise<{ ok: boolean, data: Object|null, error: Error|null }>}
     */
    async saveMemory({ memory, curator_id }) {
        console.log('=== 기억 DB 저장 ===');
        console.log('기억 제목:', memory.title);
        console.log('장면 수:', memory.scenes.length);
        console.log('curator_id:', curator_id || '(없음 - 익명)');

 // 1. Payload 구성
        const payload = buildMemoryPayload(memory);

 // curator_id 있으면 memory 페 load 
        if (curator_id) {
            payload.memory.curator_id = curator_id;
        }

 // 2. validate
        const validation = validateMemoryPayload(payload);
        if (!validation.valid) {
            const error = new Error(`Memory payload validation failed: ${validation.error}`);
            console.error('[MemoryService]', error.message);
            return { ok: false, data: null, error };
        }

 // 3. save
        const result = await persistMemory(payload);

 // 4. save 후 업데 트
        postPersistUpdates(result);

        return result;
    }
};
