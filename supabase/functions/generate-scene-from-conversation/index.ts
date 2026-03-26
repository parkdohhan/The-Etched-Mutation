// generate-scene-from-conversation/index.ts — 대화 기반 기억 데이터 → 5장면 생성
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";

// ===== 감정 벡터 매핑 (generate-scene-from-ritual과 동일) =====
const EMOTION_VECTORS: Record<string, Record<string, number>> = {
  guilt:       { fear: 0.1, sadness: 0.3, anger: 0, joy: 0, longing: 0.1, guilt: 0.8 },
  fear:        { fear: 0.8, sadness: 0.2, anger: 0, joy: 0, longing: 0, guilt: 0.1 },
  anger:       { fear: 0.1, sadness: 0.1, anger: 0.8, joy: 0, longing: 0, guilt: 0 },
  sadness:     { fear: 0, sadness: 0.8, anger: 0, joy: 0, longing: 0.3, guilt: 0.1 },
  shame:       { fear: 0.2, sadness: 0.3, anger: 0, joy: 0, longing: 0, guilt: 0.6 },
  longing:     { fear: 0, sadness: 0.4, anger: 0, joy: 0.1, longing: 0.8, guilt: 0 },
  relief:      { fear: 0, sadness: 0.1, anger: 0, joy: 0.5, longing: 0, guilt: 0.3 },
  confusion:   { fear: 0.3, sadness: 0.2, anger: 0.1, joy: 0, longing: 0.1, guilt: 0.2 },
  emptiness:   { fear: 0, sadness: 0.4, anger: 0, joy: 0, longing: 0.2, guilt: 0.1 },
  awe:         { fear: 0.2, sadness: 0, anger: 0, joy: 0.3, longing: 0.3, guilt: 0 },
  strange_joy: { fear: 0.1, sadness: 0.1, anger: 0, joy: 0.6, longing: 0.1, guilt: 0.3 },
  numbness:    { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 },
  despair:     { fear: 0.3, sadness: 0.7, anger: 0, joy: 0, longing: 0.1, guilt: 0.2 },
  helplessness:{ fear: 0.4, sadness: 0.4, anger: 0, joy: 0, longing: 0, guilt: 0.1 },
  isolation:   { fear: 0.2, sadness: 0.5, anger: 0, joy: 0, longing: 0.3, guilt: 0 },
};

// 한국어 감정 → 영어 키 매핑
const KO_EMOTION_MAP: Record<string, string> = {
  '두려움': 'fear', '공포': 'fear', '무서움': 'fear',
  '슬픔': 'sadness', '슬퍼': 'sadness',
  '분노': 'anger', '화남': 'anger', '짜증': 'anger',
  '죄책감': 'guilt', '미안함': 'guilt',
  '수치심': 'shame', '창피': 'shame',
  '그리움': 'longing', '보고싶음': 'longing',
  '안도': 'relief', '홀가분': 'relief',
  '혼란': 'confusion', '모르겠음': 'confusion',
  '허탈': 'emptiness', '공허': 'emptiness', '텅빈': 'emptiness',
  '경외': 'awe',
  '무감각': 'numbness', '아무것도': 'numbness', '마비': 'numbness',
  '절망': 'despair',
  '무력감': 'helplessness',
  '고립': 'isolation', '외로움': 'isolation',
};

interface ConversationData {
  sensory_anchor: { modality: string; content: string };
  situation: string;
  emotion: { primary: string; secondary?: string; intensity: number };
  reason: {
    attribution: string;
    core_fear: string;
    target: string;
    is_void: boolean;
  };
}

function normalizeEmotion(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (EMOTION_VECTORS[lower]) return lower;
  if (KO_EMOTION_MAP[lower]) return KO_EMOTION_MAP[lower];
  // 부분 매칭
  for (const [ko, en] of Object.entries(KO_EMOTION_MAP)) {
    if (lower.includes(ko)) return en;
  }
  return 'sadness'; // fallback
}

function extractOriginalVector(data: ConversationData) {
  const primary = normalizeEmotion(data.emotion.primary);
  const secondary = data.emotion.secondary ? normalizeEmotion(data.emotion.secondary) : null;
  const emotions = secondary ? [primary, secondary] : [primary];

  const keys = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
  const blended: Record<string, number> = {};
  keys.forEach(k => blended[k] = 0);

  emotions.forEach((emo: string) => {
    const vec = EMOTION_VECTORS[emo] || EMOTION_VECTORS.sadness;
    keys.forEach(k => blended[k] += (vec[k] || 0) / emotions.length);
  });

  // attribution 매핑
  const attrMap: Record<string, string> = {
    self_blame: 'internal', other_blame: 'external', fate_blame: 'situational',
  };

  const is_void = primary === 'numbness' || data.reason.is_void;

  return {
    base: blended,
    reason_analysis: {
      attribution: attrMap[data.reason.attribution] || 'situational',
      core_fear: data.reason.core_fear || 'loss',
      target: data.reason.target || 'unknown',
      is_void,
      is_compound: emotions.length > 1,
      emotions,
    },
  };
}

const SCENE_TYPES = [
  { order: 1, type: 'normal',  label: '감각',  vectorWeight: 0 },
  { order: 2, type: 'branch',  label: '앵커',  vectorWeight: 0.3 },
  { order: 3, type: 'branch',  label: '행위',  vectorWeight: 0.5 },
  { order: 4, type: 'branch',  label: '충돌',  vectorWeight: 1.0 },
  { order: 5, type: 'ending',  label: '봉인',  vectorWeight: 0.4 },
];

function buildPrompt(data: ConversationData, lang: string): string {
  const sensory = `${data.sensory_anchor.modality}: ${data.sensory_anchor.content}`;
  const situation = data.situation;
  const primary = data.emotion.primary;
  const secondary = data.emotion.secondary || '';
  const intensity = data.emotion.intensity;
  const attribution = data.reason.attribution;
  const target = data.reason.target;
  const isVoid = data.reason.is_void;
  const isCompound = !!secondary;

  if (lang === 'en') {
    return `You are a writer who transforms memories into scenes.
Based on the interview data below, write exactly 5 scenes.

## Interview Data

### Sensory Anchor
- ${sensory}

### Situation
- ${situation}

### Core Emotion
- Primary: ${primary}${secondary ? `, Secondary: ${secondary}` : ''}
- Intensity: ${intensity}
- Attribution: ${attribution}
- Target: ${target}
${isVoid ? '\n⚠ This person showed emotional numbness. Do NOT describe emotions directly in scenes.' : ''}
${isCompound ? `\n⚠ This person felt compound emotions (${primary} + ${secondary}). Scene 4 must show both emotions simultaneously or sequentially.` : ''}

## 5-Scene Structure

**Scene 1 (Sensory):** Only sensory description. No character actions. Smell, sound, texture. 2–3 sentences.
**Scene 2 (Anchor):** The anchor object appears. Eyes linger. Emphasize its presence. 2–3 sentences.
**Scene 3 (Action):** The narrator's action within the situation. Reflect attribution nuance. 2–3 sentences.
**Scene 4 (Crash):** The core event. Show body reactions physically, not with emotion words. 3–5 sentences. Longest scene.
**Scene 5 (Seal):** Exiting the memory. Open ending. 2–3 sentences.

## Style Rules

- First person ("I")
- Dry, restrained English. No emotion adjectives.
- Short sentences. Broken rhythm.
- Sensory-focused. Not "I was sad" but "My hands shook."
- Each scene reads independently but connects.

## Output Format

Follow this JSON format exactly. Output only JSON.

\`\`\`json
{
  "scenes": [
    { "order": 1, "sceneType": "normal", "text": "Scene 1 text", "emotionCue": "1-2 word emotion hint" },
    { "order": 2, "sceneType": "branch", "text": "Scene 2 text", "emotionCue": "..." },
    { "order": 3, "sceneType": "branch", "text": "Scene 3 text", "emotionCue": "..." },
    { "order": 4, "sceneType": "branch", "text": "Scene 4 text", "emotionCue": "..." },
    { "order": 5, "sceneType": "ending", "text": "Scene 5 text", "emotionCue": "..." }
  ]
}
\`\`\``;
  }

  // Korean (default)
  return `당신은 기억을 장면으로 변환하는 작가입니다.
아래 인터뷰 데이터를 바탕으로 정확히 5개의 장면을 작성하세요.

## 인터뷰 데이터

### 감각 앵커
- ${sensory}

### 상황
- ${situation}

### 핵심 감정
- 주감정: ${primary}${secondary ? `, 부감정: ${secondary}` : ''}
- 강도: ${intensity}
- 귀인: ${attribution}
- 대상: ${target}
${isVoid ? '\n⚠ 이 화자는 감정적 무감각 상태를 보였습니다. 장면에 감정을 직접 서술하지 마세요.' : ''}
${isCompound ? `\n⚠ 이 화자는 복합 감정(${primary} + ${secondary})을 느꼈습니다. 장면 4에서 이 두 감정이 동시에 또는 순차적으로 나타나야 합니다.` : ''}

## 5장면 구조

**장면 1 (감각):** 공간의 감각만 묘사. 인물의 행동 없이 냄새, 소리, 촉감으로 시작. 2~3문장.
**장면 2 (앵커):** 앵커 사물 등장. 시선이 그곳에 머무는 순간. 존재감을 강조. 2~3문장.
**장면 3 (행위):** 화자의 행동. 귀인(${attribution})의 뉘앙스 반영. 2~3문장.
**장면 4 (충돌):** 핵심 사건. 신체 반응을 직접 묘사. 감정 단어를 쓰지 말고 신체/행동으로 표현. 3~5문장. 가장 긴 장면.
**장면 5 (봉인):** 기억에서 빠져나오는 순간. 열린 결말. 2~3문장.

## 문체 규칙

- 1인칭 시점 ("나는")
- 건조하고 담담한 한국어. 감정 형용사 금지.
- 짧은 문장. 호흡이 끊기는 리듬.
- 감각 묘사 중심. "슬펐다" 대신 "손이 떨렸다."
- 각 장면은 독립적으로 읽혀야 하지만, 연결되어야 함.

## 출력 형식

아래 JSON 형식을 정확히 따르세요. JSON만 출력하세요.

\`\`\`json
{
  "scenes": [
    { "order": 1, "sceneType": "normal", "text": "장면 1 텍스트", "emotionCue": "감정 힌트 1~2단어" },
    { "order": 2, "sceneType": "branch", "text": "장면 2 텍스트", "emotionCue": "..." },
    { "order": 3, "sceneType": "branch", "text": "장면 3 텍스트", "emotionCue": "..." },
    { "order": 4, "sceneType": "branch", "text": "장면 4 텍스트", "emotionCue": "..." },
    { "order": 5, "sceneType": "ending", "text": "장면 5 텍스트", "emotionCue": "..." }
  ]
}
\`\`\``;
}

// ===== Serve =====
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 인증 optional — 비로그인도 장면 생성 허용 (저장 시점에만 필수)
    const user = await verifyAuth(req);
    console.log(`[generate-scene-conv] user: ${user ? user.id : 'anonymous'}`);

    const body = await req.json();
    const { conversationData, lang } = body;

    if (!conversationData) {
      return new Response(JSON.stringify({ error: "conversationData가 필요합니다." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API 키 미설정" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data: ConversationData = conversationData;
    const originalVector = extractOriginalVector(data);
    const prompt = buildPrompt(data, lang || 'ko');

    console.log("[generate-scene-conv] prompt length:", prompt.length);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[generate-scene-conv] Claude API error:", err);
      return new Response(JSON.stringify({
        error: (err as any)?.error?.message || "Claude API 호출 실패",
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const rawText = (result as any).content?.[0]?.text || "";

    let scenesData;
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) throw new Error("JSON 블록을 찾을 수 없습니다");
      scenesData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error("[generate-scene-conv] JSON parse error:", e, "raw:", rawText.substring(0, 200));
      return new Response(JSON.stringify({ error: "장면 생성 결과 파싱 실패", raw: rawText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // originalVector를 각 장면에 내장
    const scenes = (scenesData.scenes || []).map((scene: any, i: number) => {
      const meta = SCENE_TYPES[i] || SCENE_TYPES[0];
      return {
        order: scene.order || i + 1,
        sceneType: scene.sceneType || meta.type,
        text: scene.text,
        emotionCue: scene.emotionCue || '',
        originalVector: meta.vectorWeight > 0 ? {
          base: Object.fromEntries(
            Object.entries(originalVector.base).map(([k, v]) => [k, (v as number) * meta.vectorWeight])
          ),
          reason_analysis: meta.vectorWeight >= 0.5 ? originalVector.reason_analysis : undefined,
        } : undefined,
        vectorWeight: meta.vectorWeight,
      };
    });

    const responseData = {
      scenes,
      originalVector,
      conversationData: data,
    };

    console.log("[generate-scene-conv] success, scenes:", scenes.length);

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-scene-conv] error:", error);
    return new Response(JSON.stringify({
      error: (error as Error).message || "알 수 없는 오류",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
