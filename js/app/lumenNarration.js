// js/app/lumenNarration.js
// Edge Function `generate-lumen-narration` 호출 헬퍼.
// 실패 시 null 반환 — UI는 음성 없이도 진행 가능해야 함 (graceful degradation).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';

/**
 * @param {object} args
 * @param {string} args.memoryId
 * @param {string} [args.completedSentence]
 * @param {Array} args.scenes
 * @param {number} [args.alignment]
 * @param {string} [args.bucket]
 * @param {string} [args.transitionPattern]
 * @returns {Promise<{audioUrl: string, narrationText: string} | null>}
 */
export async function generateLumenNarration({
    memoryId,
    completedSentence,
    scenes,
    alignment,
    bucket,
    transitionPattern,
}) {
    if (!memoryId || !Array.isArray(scenes) || scenes.length === 0) {
        console.warn('[lumenNarration] 입력 부족 — 호출 안 함');
        return null;
    }

    try {
        const body = {
            memoryId,
            completedSentence: completedSentence || '',
            scenes: scenes.map((s) => ({
                sceneIndex: s.sceneIndex,
                sceneId: s.sceneId || null,
                sceneText: s.sceneText || '',
                userEmotion: s.userEmotion || {},
                userReason: s.userReason || '',
            })),
            alignment: typeof alignment === 'number' ? alignment : null,
            alignmentBucket: bucket || null,
            transitionPattern: transitionPattern || null,
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-lumen-narration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.warn('[lumenNarration] Edge Function HTTP 실패:', response.status, errText.slice(0, 300));
            return null;
        }

        const data = await response.json();
        if (!data?.audioUrl) {
            console.warn('[lumenNarration] audioUrl 누락:', data);
            return null;
        }

        console.log('[lumenNarration] 더빙 생성 성공:', { audioUrl: data.audioUrl, narrationText: data.narrationText?.slice(0, 60) + '...' });
        return { audioUrl: data.audioUrl, narrationText: data.narrationText || '' };
    } catch (e) {
        console.warn('[lumenNarration] 예외:', e?.message || e);
        return null;
    }
}
