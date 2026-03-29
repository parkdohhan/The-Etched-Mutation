import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_FUNCTION_URL } from '../lib/config.js';

/**
 * emotion analysis result validate
 * @param {Object} obj - validate object
 * @returns {boolean} validate 통 여부
 * @throws {Error} validate failure 시 러
 */
function validateEmotionAnalysisResult(obj) {
    if (!obj || typeof obj !== 'object') {
        throw new Error('Response format error: not an object');
    }
    
 // generatedEmotion 필수
    if (!obj.generatedEmotion || typeof obj.generatedEmotion !== 'string' || obj.generatedEmotion.trim() === '') {
        throw new Error('Response format error: generatedEmotion is invalid');
    }
    
 // analysis 필수
    if (!obj.analysis || typeof obj.analysis !== 'object') {
        throw new Error('Response format error: analysis is missing');
    }
    
 // analysis.base 필수 (핵심 좌표)
    if (!obj.analysis.base || typeof obj.analysis.base !== 'object') {
        throw new Error('Response format error: analysis.base is missing');
    }
    
 // analysis.base emotion 필드 validate
    const requiredEmotions = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
    for (const emotion of requiredEmotions) {
        if (typeof obj.analysis.base[emotion] !== 'number' || 
            obj.analysis.base[emotion] < 0 || 
            obj.analysis.base[emotion] > 1) {
            throw new Error(`Response format error: analysis.base.${emotion} is invalid (must be a number between 0 and 1)`);
        }
    }
    
 // analysis.embedding validate (있으면 validate, 없으면 통 )
    if (obj.analysis.embedding !== undefined) {
        if (!Array.isArray(obj.analysis.embedding)) {
            throw new Error('Response format error: analysis.embedding is not an array');
        }
        
 // 모든 원소 number 고 NaN 지 check
        for (let i = 0; i < obj.analysis.embedding.length; i++) {
            const val = obj.analysis.embedding[i];
            if (typeof val !== 'number' || isNaN(val)) {
                throw new Error(`Response format error: analysis.embedding[${i}] is not a valid number`);
            }
        }
        
 // 길 너무 짧으면 경고 (failure process하지 않음)
        if (obj.analysis.embedding.length < 10) {
            console.warn(`[AIService] analysis.embedding 길이가 짧습니다 (${obj.analysis.embedding.length}). 환경별 임베딩 차이를 허용합니다.`);
        }
    }
    
 // analysis.detailed array 어야 함 (선택)
    if (obj.analysis.detailed !== undefined && !Array.isArray(obj.analysis.detailed)) {
        throw new Error('Response format error: analysis.detailed is not an array');
    }
    
 // analysis.intensity 0-1 범위 숫자여야 함 (선택)
    if (obj.analysis.intensity !== undefined) {
        if (typeof obj.analysis.intensity !== 'number' || 
            obj.analysis.intensity < 0 || 
            obj.analysis.intensity > 1) {
            throw new Error('Response format error: analysis.intensity is invalid (must be a number between 0 and 1)');
        }
    }
    
 // analysis.confidence 0-1 범위 숫자여야 함 (선택)
    if (obj.analysis.confidence !== undefined) {
        if (typeof obj.analysis.confidence !== 'number' || 
            obj.analysis.confidence < 0 || 
            obj.analysis.confidence > 1) {
            throw new Error('Response format error: analysis.confidence is invalid (must be a number between 0 and 1)');
        }
    }
    
 // analysis.reason_analysis 선택 (있으면 validate, 없으면 통 )
    if (obj.analysis.reason_analysis !== undefined) {
        if (typeof obj.analysis.reason_analysis !== 'object' || obj.analysis.reason_analysis === null) {
            throw new Error('Response format error: analysis.reason_analysis is not an object');
        }
 // reason_analysis 내부 필드 validate (needed시 add)
    }
    
 // 하위 호환성: 최상위 레벨 reason_analysis 허용 (있으면 validate)
    if (obj.reason_analysis !== undefined) {
        if (typeof obj.reason_analysis !== 'object' || obj.reason_analysis === null) {
            throw new Error('Response format error: reason_analysis is not an object');
        }
    }
    
    return true;
}

/**
 * scene create result validate
 * @param {Object} obj - validate object
 * @returns {boolean} validate 통 여부
 * @throws {Error} validate failure 시 러
 */
function validateSceneGenerationResult(obj) {
    if (!obj || typeof obj !== 'object') {
        throw new Error('Response format error: not an object');
    }
    
 // response 필수
    if (!obj.response || typeof obj.response !== 'string' || obj.response.trim() === '') {
        throw new Error('Response format error: response is invalid');
    }
    
    return true;
}

/**
 * AI call function
 * @param {string} type - call 타입: 'emotion_analysis' | 'scene_generation'
 * @param {string} payload - user input 프롬프트
 * @param {Object} meta - 메타data { reasonText?, anchorEmotions?, conversationHistory?, systemPrompt? }
 * @returns {Promise<Object>} validate AI response result
 * @throws {Error} API call failure 또 validate failure 시 러
 */
async function call(type, payload, meta = {}) {
    const { reasonText, anchorEmotions, conversationHistory, systemPrompt } = meta;
    
    try {
        if (type === 'emotion_analysis') {
 // emotion analysis API call
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
                throw new Error('API call failed: ' + response.status);
            }
            
            const data = await response.json();
            console.log('API 응답 data:', JSON.stringify(data));
            
 // validate 
            validateEmotionAnalysisResult(data);
            
            return data;
            
        } else if (type === 'scene_generation') {
 // scene create API call
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
                    systemPrompt: systemPrompt || 'You are "another me." You are a presence that helps bring out the other person\'s memories together.'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || error.details || 'API call failed');
            }
            
            const data = await response.json();
            let result;
            
 // response 형식 normalize
            if (data.scene) {
                result = { response: data.scene };
            } else if (data.response) {
                result = { response: data.response };
            } else {
                throw new Error('Could not receive a response');
            }
            
 // validate 
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
