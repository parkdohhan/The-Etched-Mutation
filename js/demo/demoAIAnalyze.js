// js/demo/demoAIAnalyze.js
// 데모용 AI 분석 — Supabase Edge Function (claude-scene) 호출, 실패 시 null 반환

import { SUPABASE_ANON_KEY } from '../lib/config.js';

const DEMO_ANALYZE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene';

const SYSTEM_PROMPT = `너는 기억 해석 분석 엔진이다.
사용자가 타인의 기억 장면을 읽고 쓴 짧은 반응 텍스트를 분석한다.
다음 JSON만 반환하라. 설명이나 마크다운 없이.

{
  "base": {
    "fear": 0~1,
    "sadness": 0~1,
    "anger": 0~1,
    "guilt": 0~1,
    "shame": 0~1,
    "longing": 0~1,
    "numbness": 0~1,
    "isolation": 0~1,
    "moral_pain": 0~1
  },
  "attribution": "self" | "other" | "situation" | "mixed" | null,
  "distortionTag": "idealization" | "projection" | "rationalization" | "avoidance" | "raw" | null,
  "intensity": 0~1,
  "isVoid": true | false
}

규칙:
- 각 감정 항목은 독립적. 합이 1일 필요 없음.
- 텍스트가 짧아도 분석할 것.
- 회피, 합리화, 전가, 미화 같은 해석 기울기를 distortionTag로 잡아라.
- isVoid는 감정을 직접 쓰지 않거나 상황 묘사만 할 때 true.`;

/**
 * @param {string} userText
 * @param {string} sceneContext
 * @returns {Promise<{ base: Object, attribution: string|null, distortionTag: string|null, intensity?: number, isVoid: boolean, isRough: boolean }|null>}
 */
export async function aiAnalyze(userText, sceneContext) {
  const userPrompt = `장면: "${sceneContext}"\n반응: "${userText}"`;

  try {
    const res = await fetch(DEMO_ANALYZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 300,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const raw = data?.content?.[0]?.text || data?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return { ...parsed, isRough: false };
  } catch (e) {
    console.warn('[demoAIAnalyze] failed:', e.message);
    return null;
  }
}
