import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/config.js';

// SUPABASE_FUNCTION_URL은 index.js에서만 사용되므로 여기서도 정의
const SUPABASE_FUNCTION_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene';

/**
 * 감정 분석 결과 검증
 * @param {Object} obj - 검증할 객체
 * @returns {boolean} 검증 통과 여부
 * @throws {Error} 검증 실패 시 에러
 */
function validateEmotionAnalysisResult(obj) {
    if (!obj || typeof obj !== 'object') {
        throw new Error('응답 형식 오류: 객체가 아닙니다');
    }
    
    // generatedEmotion 필수
    if (!obj.generatedEmotion || typeof obj.generatedEmotion !== 'string' || obj.generatedEmotion.trim() === '') {
        throw new Error('응답 형식 오류: generatedEmotion이 유효하지 않습니다');
    }
    
    // analysis 필수
    if (!obj.analysis || typeof obj.analysis !== 'object') {
        throw new Error('응답 형식 오류: analysis가 없습니다');
    }
    
    // analysis.base 필수 (핵심 좌표)
    if (!obj.analysis.base || typeof obj.analysis.base !== 'object') {
        throw new Error('응답 형식 오류: analysis.base가 없습니다');
    }
    
    // analysis.base의 감정 필드 검증
    const requiredEmotions = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
    for (const emotion of requiredEmotions) {
        if (typeof obj.analysis.base[emotion] !== 'number' || 
            obj.analysis.base[emotion] < 0 || 
            obj.analysis.base[emotion] > 1) {
            throw new Error(`응답 형식 오류: analysis.base.${emotion}가 유효하지 않습니다 (0-1 범위의 숫자여야 함)`);
        }
    }
    
    // analysis.embedding 검증 (있으면 검증, 없으면 통과)
    if (obj.analysis.embedding !== undefined) {
        if (!Array.isArray(obj.analysis.embedding)) {
            throw new Error('응답 형식 오류: analysis.embedding이 배열이 아닙니다');
        }
        
        // 모든 원소가 number이고 NaN이 아닌지 확인
        for (let i = 0; i < obj.analysis.embedding.length; i++) {
            const val = obj.analysis.embedding[i];
            if (typeof val !== 'number' || isNaN(val)) {
                throw new Error(`응답 형식 오류: analysis.embedding[${i}]가 유효한 숫자가 아닙니다`);
            }
        }
        
        // 길이가 너무 짧으면 경고만 (실패로 처리하지 않음)
        if (obj.analysis.embedding.length < 10) {
            console.warn(`[AIService] analysis.embedding 길이가 짧습니다 (${obj.analysis.embedding.length}). 환경별 임베딩 차이를 허용합니다.`);
        }
    }
    
    // analysis.detailed는 배열이어야 함 (선택)
    if (obj.analysis.detailed !== undefined && !Array.isArray(obj.analysis.detailed)) {
        throw new Error('응답 형식 오류: analysis.detailed가 배열이 아닙니다');
    }
    
    // analysis.intensity는 0-1 범위의 숫자여야 함 (선택)
    if (obj.analysis.intensity !== undefined) {
        if (typeof obj.analysis.intensity !== 'number' || 
            obj.analysis.intensity < 0 || 
            obj.analysis.intensity > 1) {
            throw new Error('응답 형식 오류: analysis.intensity가 유효하지 않습니다 (0-1 범위의 숫자여야 함)');
        }
    }
    
    // analysis.confidence는 0-1 범위의 숫자여야 함 (선택)
    if (obj.analysis.confidence !== undefined) {
        if (typeof obj.analysis.confidence !== 'number' || 
            obj.analysis.confidence < 0 || 
            obj.analysis.confidence > 1) {
            throw new Error('응답 형식 오류: analysis.confidence가 유효하지 않습니다 (0-1 범위의 숫자여야 함)');
        }
    }
    
    // analysis.reason_analysis는 선택 (있으면 검증, 없으면 통과)
    if (obj.analysis.reason_analysis !== undefined) {
        if (typeof obj.analysis.reason_analysis !== 'object' || obj.analysis.reason_analysis === null) {
            throw new Error('응답 형식 오류: analysis.reason_analysis가 객체가 아닙니다');
        }
        // reason_analysis 내부 필드 검증 (필요시 추가)
    }
    
    // 하위 호환성: 최상위 레벨 reason_analysis도 허용 (있으면 검증)
    if (obj.reason_analysis !== undefined) {
        if (typeof obj.reason_analysis !== 'object' || obj.reason_analysis === null) {
            throw new Error('응답 형식 오류: reason_analysis가 객체가 아닙니다');
        }
    }
    
    return true;
}

/**
 * 장면 생성 결과 검증
 * @param {Object} obj - 검증할 객체
 * @returns {boolean} 검증 통과 여부
 * @throws {Error} 검증 실패 시 에러
 */
function validateSceneGenerationResult(obj) {
    if (!obj || typeof obj !== 'object') {
        throw new Error('응답 형식 오류: 객체가 아닙니다');
    }
    
    // response 필수
    if (!obj.response || typeof obj.response !== 'string' || obj.response.trim() === '') {
        throw new Error('응답 형식 오류: response가 유효하지 않습니다');
    }
    
    return true;
}

/**
 * AI 호출 함수
 * @param {string} type - 호출 타입: 'emotion_analysis' | 'scene_generation'
 * @param {string} payload - 사용자 입력 프롬프트
 * @param {Object} meta - 메타데이터 { reasonText?, anchorEmotions?, conversationHistory?, systemPrompt? }
 * @returns {Promise<Object>} 검증된 AI 응답 결과
 * @throws {Error} API 호출 실패 또는 검증 실패 시 에러
 */
async function call(type, payload, meta = {}) {
    const { reasonText, anchorEmotions, conversationHistory, systemPrompt } = meta;
    
    try {
        if (type === 'emotion_analysis') {
            // 감정 분석 API 호출
            console.log('callAI: emotion_analysis 호출:', { prompt: payload, reasonText, anchorEmotions });
            const requestBody = {
                type: 'emotion_analysis',
                emotion: payload || '',
                reason: reasonText || '',
                anchorEmotions: anchorEmotions || []
            };
            console.log('API 요청 body:', JSON.stringify(requestBody));
            
            const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-scene`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log('API 응답 status:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API 오류 응답:', errorText);
                throw new Error('API 호출 실패: ' + response.status);
            }
            
            const data = await response.json();
            console.log('API 응답 data:', JSON.stringify(data));
            
            // 검증 수행
            validateEmotionAnalysisResult(data);
            
            return data;
            
        } else if (type === 'scene_generation') {
            // 장면 생성 API 호출
            console.log('callAI: scene_generation 호출:', { prompt: payload, conversationHistory });
            const messages = conversationHistory && conversationHistory.length > 0 
                ? conversationHistory 
                : [{ role: 'user', content: payload }];
            
            if (conversationHistory && conversationHistory.length === 0 || 
                (conversationHistory && conversationHistory[conversationHistory.length - 1].role !== 'user')) {
                messages.push({ role: 'user', content: payload });
            }
            
            const response = await fetch(SUPABASE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    text: payload,
                    conversationHistory: messages,
                    systemPrompt: systemPrompt || '너는 "또다른 나"야. 상대방의 기억을 함께 꺼내는 존재야.'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || error.details || 'API 호출 실패');
            }
            
            const data = await response.json();
            let result;
            
            // 응답 형식 정규화
            if (data.scene) {
                result = { response: data.scene };
            } else if (data.response) {
                result = { response: data.response };
            } else {
                throw new Error('응답을 받을 수 없습니다');
            }
            
            // 검증 수행
            validateSceneGenerationResult(result);
            
            return result;
        } else {
            throw new Error(`Unknown AI call type: ${type}`);
        }
    } catch (error) {
        console.error('callAI error:', error);
        throw error;
    }
}

export const AIService = { call };
