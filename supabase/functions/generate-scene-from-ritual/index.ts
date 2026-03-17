// generate-scene-from-ritual/index.ts — V2: 5장면 생성 + originalVector 내장
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";

// ===== Label Maps (한국어 → 프롬프트용) =====
const SMELL_MAP: Record<string, string> = {
  rain_heavy: '비릿한 물 냄새', dust: '매캐한 먼지', hospital: '소독약 냄새',
  grass: '풀 냄새', nothing: '냄새 없음',
};
const SOUND_MAP: Record<string, string> = {
  rain: '빗소리', silence: '적막', crowd: '웅성거림',
  wind: '바람 소리', nothing: '소리 없음',
};
const TOUCH_MAP: Record<string, string> = {
  cold_air: '차가운 공기', sweat: '축축한 땀', someones_hand: '누군가의 손',
  hard_floor: '단단한 바닥', nothing: '촉감 없음',
};
const ANCHOR_CONTEXT_MAP: Record<string, string> = {
  always_there: '원래 있던 것', someone_placed: '누군가 놓은 것',
  unknown: '왜 있는지 모름', void: '말하고 싶지 않음',
};
const ATTRIBUTION_MAP: Record<string, string> = {
  my_choice: '자신의 선택', no_choice: '어쩔 수 없었음', unknown: '모름',
};
const BODY_MAP: Record<string, string> = {
  chest_tight: '가슴이 조임', breathless: '숨이 멎음', trembling: '손이 떨림',
  tears: '눈물', nothing: '아무것도 느끼지 못함',
};
const EMOTION_MAP: Record<string, string> = {
  guilt: '죄책감', fear: '두려움', anger: '분노', sadness: '슬픔',
  shame: '수치심', longing: '그리움', relief: '안도', confusion: '혼란',
  emptiness: '허탈', awe: '경외', strange_joy: '이상한 기쁨', numbness: '무감각',
};
const TARGET_MAP: Record<string, string> = {
  self: '자기 자신', other: '상대방', situation: '상황', unknown: '모름',
};
const RELATION_MAP: Record<string, string> = {
  still_hurts: '아직 아픈 기억', okay_now: '괜찮아진 기억',
  dont_know: '아직 모르는 기억', never_again: '다시 보고 싶지 않은 기억',
};

// ===== originalVector 추출 (클라이언트와 동일 로직) =====
interface FlowData {
  sensory: { smell: string; sound: string; touch: string };
  anchor: { object: string; context: string };
  action: { what: string; attribution: string };
  crash: { event: string; bodyFeel: string; emotion: string | string[]; target: string };
  seal: { relation: string; word: string };
}

function extractOriginalVector(data: FlowData) {
  const emotionVectors: Record<string, Record<string, number>> = {
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
  };

  const attrMap: Record<string, string> = {
    my_choice: 'internal', no_choice: 'external', unknown: 'situational',
  };
  const fearMap: Record<string, string> = {
    guilt: 'worthlessness', fear: 'punishment', anger: 'powerlessness',
    sadness: 'loss', shame: 'worthlessness', longing: 'loss',
    relief: 'guilt_release', confusion: 'disorientation', emptiness: 'loss',
    awe: 'insignificance', strange_joy: 'guilt_release', numbness: 'powerlessness',
  };
  const tgtMap: Record<string, string> = {
    self: 'self', other: 'other', situation: 'situation', unknown: 'unknown',
  };

  // Compound emotion blending
  const emotions = Array.isArray(data.crash.emotion) ? data.crash.emotion : [data.crash.emotion];
  const keys = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
  const blended: Record<string, number> = {};
  keys.forEach(k => blended[k] = 0);

  emotions.forEach((emo: string) => {
    const vec = emotionVectors[emo] || emotionVectors.sadness;
    keys.forEach(k => blended[k] += (vec[k] || 0) / emotions.length);
  });

  const primaryEmotion = emotions[0];
  const is_void = emotions.includes('numbness') || data.crash.bodyFeel === 'nothing';

  return {
    base: blended,
    reason_analysis: {
      attribution: attrMap[data.action.attribution] || 'situational',
      core_fear: fearMap[primaryEmotion] || 'loss',
      target: tgtMap[data.crash.target] || 'unknown',
      is_void,
      is_compound: emotions.length > 1,
      emotions,
    },
  };
}

// ===== Scene Types =====
function getSceneTypes(data: FlowData) {
  const vulnerability = data.seal.relation;
  return [
    { order: 1, type: 'normal',  label: '감각',  vectorWeight: 0 },
    { order: 2, type: 'branch',  label: '앵커',  vectorWeight: 0.3 },
    { order: 3, type: 'branch',  label: '행위',  vectorWeight: 0.5 },
    { order: 4, type: 'branch',  label: '충돌',  vectorWeight: 1.0 },  // 핵심 비교 지점
    { order: 5, type: 'ending',  label: '봉인',  vectorWeight: 0.4 },
  ];
}

// ===== Build Prompt =====
function buildPrompt(data: FlowData): string {
  const smell = SMELL_MAP[data.sensory.smell] || data.sensory.smell;
  const sound = SOUND_MAP[data.sensory.sound] || data.sensory.sound;
  const touch = TOUCH_MAP[data.sensory.touch] || data.sensory.touch;
  const anchorCtx = ANCHOR_CONTEXT_MAP[data.anchor.context] || data.anchor.context;
  const attribution = ATTRIBUTION_MAP[data.action.attribution] || data.action.attribution;
  const bodyFeel = BODY_MAP[data.crash.bodyFeel] || data.crash.bodyFeel;
  const emotions = Array.isArray(data.crash.emotion) ? data.crash.emotion : [data.crash.emotion];
  const emotionLabels = emotions.map(e => EMOTION_MAP[e] || e);
  const emotion = emotionLabels.join(' + ');
  const isCompound = emotions.length > 1;
  const target = TARGET_MAP[data.crash.target] || data.crash.target;
  const relation = RELATION_MAP[data.seal.relation] || data.seal.relation;

  const isVoid = emotions.includes('numbness') || data.crash.bodyFeel === 'nothing';
  const isAnchorVoid = data.anchor.context === 'void';
  const isSealVoid = data.seal.relation === 'never_again';

  return `당신은 기억을 장면으로 변환하는 작가입니다.
한 사람의 인터뷰 데이터를 바탕으로 정확히 5개의 장면을 작성하세요.

## 인터뷰 데이터

### 감각 (이 기억의 물리적 공간)
- 냄새: ${smell}
- 소리: ${sound}
- 촉감: ${touch}

### 앵커 (시선이 머무는 사물)
- 사물: ${data.anchor.object}
- 맥락: ${anchorCtx}

### 행위 (화자가 한 것)
- 행동: ${data.action.what}
- 귀인: ${attribution}

### 충돌 (일어난 일)
- 사건: ${data.crash.event}
- 신체 반응: ${bodyFeel}
- 핵심 감정: ${emotion}
- 감정의 대상: ${target}

### 봉인 (기억과의 관계)
- 관계: ${relation}
- 한 단어: ${data.seal.word}
${isVoid ? '\n⚠ 이 화자는 감정적 무감각(numbness) 상태를 보였습니다. 장면에 감정을 직접 서술하지 마세요.' : ''}
${isCompound ? `\n⚠ 이 화자는 복합 감정(${emotion})을 선택했습니다. 장면 4에서 이 두 감정이 동시에 또는 순차적으로 나타나야 합니다. 하나의 감정만 묘사하지 마세요.` : ''}
${isAnchorVoid ? '\n⚠ 화자가 앵커 사물의 맥락을 말하길 거부했습니다. 이 사물은 장면에서 설명 없이 존재해야 합니다.' : ''}
${isSealVoid ? '\n⚠ 화자가 이 기억을 다시 보고 싶지 않다고 했습니다. 5번째 장면은 차단/거부의 느낌을 담으세요.' : ''}

## 5장면 구조

**장면 1 (감각):** 공간의 감각만 묘사. 인물의 행동 없이 냄새, 소리, 촉감으로 시작. 2~3문장.
**장면 2 (앵커):** 앵커 사물 등장. 시선이 그곳에 머무는 순간. 사물의 존재감을 강조. 2~3문장.
**장면 3 (행위):** 화자의 행동. "${data.action.what}"을 장면화. 귀인(${attribution})의 뉘앙스 반영. 2~3문장.
**장면 4 (충돌):** 핵심 사건. "${data.crash.event}"를 장면화. 신체 반응(${bodyFeel})을 직접 묘사. 감정 단어를 쓰지 말고 신체/행동으로 표현. 3~5문장. 가장 긴 장면.
**장면 5 (봉인):** 기억에서 빠져나오는 순간. "${data.seal.word}"의 잔향. 열린 결말. 2~3문장.

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
    {
      "order": 1,
      "sceneType": "normal",
      "text": "장면 1 텍스트",
      "emotionCue": "이 장면에서 체험자가 느낄 수 있는 감정 힌트 (1~2단어)"
    },
    {
      "order": 2,
      "sceneType": "branch",
      "text": "장면 2 텍스트",
      "emotionCue": "..."
    },
    {
      "order": 3,
      "sceneType": "branch",
      "text": "장면 3 텍스트",
      "emotionCue": "..."
    },
    {
      "order": 4,
      "sceneType": "branch",
      "text": "장면 4 텍스트",
      "emotionCue": "..."
    },
    {
      "order": 5,
      "sceneType": "ending",
      "text": "장면 5 텍스트",
      "emotionCue": "..."
    }
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
    // 인증
    const user = await verifyAuth(req);
    if (!user) {
      return unauthorizedResponse(corsHeaders, "기억을 생성하려면 로그인이 필요합니다.");
    }
    console.log(`[generate-scene-v2] user: ${user.id}`);

    const body = await req.json();
    const { flowData } = body;

    // 하위 호환: 기존 ritualData도 지원
    const data: FlowData = flowData || convertLegacy(body.ritualData);

    if (!data) {
      return new Response(JSON.stringify({ error: "flowData가 필요합니다." }), {
        status: 400, headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API 키 미설정" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // originalVector 서버에서도 계산 (클라이언트와 이중 검증)
    const originalVector = extractOriginalVector(data);
    const sceneTypes = getSceneTypes(data);
    const prompt = buildPrompt(data);

    console.log("[generate-scene-v2] prompt length:", prompt.length);

    // Claude API 호출 (non-streaming, JSON 파싱 필요)
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
      console.error("[generate-scene-v2] Claude API error:", err);
      return new Response(JSON.stringify({
        error: (err as any)?.error?.message || "Claude API 호출 실패",
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const rawText = (result as any).content?.[0]?.text || "";

    // JSON 추출
    let scenesData;
    try {
      // ```json ... ``` 블록 또는 순수 JSON
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) throw new Error("JSON 블록을 찾을 수 없습니다");
      scenesData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error("[generate-scene-v2] JSON parse error:", e, "raw:", rawText.substring(0, 200));
      return new Response(JSON.stringify({
        error: "장면 생성 결과 파싱 실패",
        raw: rawText,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // originalVector를 각 장면에 내장
    const scenes = (scenesData.scenes || []).map((scene: any, i: number) => {
      const meta = sceneTypes[i] || sceneTypes[0];
      return {
        order: scene.order || i + 1,
        sceneType: scene.sceneType || meta.type,
        text: scene.text,
        emotionCue: scene.emotionCue || '',
        // V3 엔진용 originalVector (장면 4가 핵심)
        originalVector: meta.vectorWeight > 0 ? {
          base: Object.fromEntries(
            Object.entries(originalVector.base).map(([k, v]) => [k, (v as number) * meta.vectorWeight])
          ),
          reason_analysis: meta.vectorWeight >= 0.5 ? originalVector.reason_analysis : undefined,
        } : undefined,
        vectorWeight: meta.vectorWeight,
      };
    });

    // 전체 응답
    const responseData = {
      scenes,
      originalVector,
      flowData: data,
      vulnerability: data.seal.relation,
      sealWord: data.seal.word,
    };

    console.log("[generate-scene-v2] success, scenes:", scenes.length);

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-scene-v2] error:", error);
    return new Response(JSON.stringify({
      error: (error as Error).message || "알 수 없는 오류",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ===== Legacy Conversion =====
function convertLegacy(ritualData: any): FlowData | null {
  if (!ritualData) return null;
  return {
    sensory: {
      smell: ritualData.sensory?.smell || '',
      sound: ritualData.sensory?.sound || '',
      touch: ritualData.sensory?.temperature || '',
    },
    anchor: { object: ritualData.anchorObject || '', context: 'unknown' },
    action: { what: ritualData.action || '', attribution: 'unknown' },
    crash: {
      event: ritualData.conflict || '',
      bodyFeel: 'unknown',
      emotion: ritualData.emotionWord || 'sadness',
      target: 'unknown',
    },
    seal: { relation: 'dont_know', word: ritualData.emotionWord || '' },
  };
}
