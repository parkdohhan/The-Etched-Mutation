// js/services/MemoryService.js
// 메모리 저장 로직을 중앙화하는 서비스

import { networkService } from './NetworkService.js';

/**
 * 메모리 저장을 위한 payload 구성
 * @param {Object} memory - 메모리 객체 { title, scenes: [...] }
 * @returns {Object} 저장을 위한 payload 객체
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
 * 메모리 payload 검증
 * @param {Object} payload - buildMemoryPayload의 결과
 * @returns {{ valid: boolean, error?: string }} 검증 결과
 */
function validateMemoryPayload(payload) {
    if (!payload.memory) {
        return { valid: false, error: 'memory 필드가 없습니다' };
    }
    
    if (!payload.memory.title || typeof payload.memory.title !== 'string' || payload.memory.title.trim() === '') {
        return { valid: false, error: 'memory.title이 유효하지 않습니다' };
    }
    
    if (!Array.isArray(payload.scenes) || payload.scenes.length === 0) {
        return { valid: false, error: 'scenes 배열이 없거나 비어있습니다' };
    }
    
    for (let i = 0; i < payload.scenes.length; i++) {
        const sceneItem = payload.scenes[i];
        if (!sceneItem.scene) {
            return { valid: false, error: `scenes[${i}].scene이 없습니다` };
        }
        
        if (!sceneItem.scene.text || typeof sceneItem.scene.text !== 'string' || sceneItem.scene.text.trim() === '') {
            return { valid: false, error: `scenes[${i}].scene.text가 유효하지 않습니다` };
        }
        
        if (!Array.isArray(sceneItem.choices)) {
            return { valid: false, error: `scenes[${i}].choices가 배열이 아닙니다` };
        }
        
        for (let j = 0; j < sceneItem.choices.length; j++) {
            const choice = sceneItem.choices[j];
            if (!choice.text || typeof choice.text !== 'string' || choice.text.trim() === '') {
                return { valid: false, error: `scenes[${i}].choices[${j}].text가 유효하지 않습니다` };
            }
        }
    }
    
    return { valid: true };
}

/**
 * 메모리를 DB에 저장 (NetworkService 사용)
 * @param {Object} payload - buildMemoryPayload의 결과
 * @returns {Promise<{ ok: boolean, data: Object|null, error: Error|null }>}
 */
async function persistMemory(payload) {
    try {
        // 1. 메모리 저장
        const memoryResult = await networkService.saveMemory(payload.memory);
        if (!memoryResult.ok) {
            console.error('[MemoryService] 메모리 저장 실패:', memoryResult.error);
            return { ok: false, data: null, error: memoryResult.error };
        }
        
        const memoryData = memoryResult.data;
        console.log('[Memory] New memory created with status: Fetus');
        console.log('메모리 저장 성공:', memoryData);
        
        // 2. 각 장면 저장
        const savedScenes = [];
        for (let i = 0; i < payload.scenes.length; i++) {
            const sceneItem = payload.scenes[i];
            const sceneData = {
                ...sceneItem.scene,
                memory_id: memoryData.id
            };
            
            const sceneResult = await networkService.saveScene(sceneData);
            if (!sceneResult.ok) {
                console.error(`[MemoryService] Scene ${i + 1} 저장 실패:`, sceneResult.error);
                // 기존 코드와 동일하게 continue (에러가 있어도 다음 scene 저장 시도)
                continue;
            }
            
            console.log(`Scene ${i + 1} 저장 성공:`, sceneResult.data);
            savedScenes.push(sceneResult.data);
            
            // 3. 각 선택지 저장
            for (let j = 0; j < sceneItem.choices.length; j++) {
                const choice = sceneItem.choices[j];
                // 빈 선택지는 건너뛰기 (기존 로직과 동일)
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
                    console.error(`[MemoryService] Choice ${j + 1} 저장 실패:`, choiceResult.error);
                    // 기존 코드와 동일하게 에러 로그만 남기고 계속 진행
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
        console.error('[MemoryService] persistMemory 에러 발생:', error);
        return { ok: false, data: null, error };
    }
}

/**
 * 저장 후 필요한 업데이트 (현재는 로그만, 나중에 확장 가능)
 * @param {Object} result - persistMemory의 결과
 */
function postPersistUpdates(result) {
    if (result.ok) {
        console.log('기억 저장 완료');
    }
    // 나중에 store 업데이트나 UI 업데이트가 필요하면 여기에 추가
}

/**
 * MemoryService - 메모리 저장을 중앙화
 */
export const MemoryService = {
    /**
     * 메모리 저장
     * @param {Object} params - { memory: { title, scenes: [...] } }
     * @returns {Promise<{ ok: boolean, data: Object|null, error: Error|null }>}
     */
    async saveMemory({ memory }) {
        console.log('=== 기억 DB 저장 ===');
        console.log('기억 제목:', memory.title);
        console.log('장면 수:', memory.scenes.length);
        
        // 1. Payload 구성
        const payload = buildMemoryPayload(memory);
        
        // 2. 검증
        const validation = validateMemoryPayload(payload);
        if (!validation.valid) {
            const error = new Error(`메모리 payload 검증 실패: ${validation.error}`);
            console.error('[MemoryService]', error.message);
            return { ok: false, data: null, error };
        }
        
        // 3. 저장
        const result = await persistMemory(payload);
        
        // 4. 저장 후 업데이트
        postPersistUpdates(result);
        
        return result;
    }
};
