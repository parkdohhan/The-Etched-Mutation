// --- CORS + Claude API + Emotion Analysis 버전 --- //
// 인증: 익명 허용 (anon key로 호출 가능)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // ---- CORS preflight 처리 ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // API 키 확인
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      console.error('API 키가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- V3 타입 처리 ----
    
    // sensory_analysis 타입
    if (body.type === 'sensory_analysis') {
      const text = body.text || '';
      const prompt = `사용자가 기억 속 감각을 묘사한 텍스트를 분석하세요.

입력: "${text}"

감각 양식 분류:
- "visual": 표정, 색채, 공간, 빛/어둠
- "olfactory": 냄새, 맛 연상
- "auditory": 목소리, 환경음, 음악
- "somatic": 신체 감각, 온도, 긴장, 통증
- "narrative": 3인칭 재전, 간접 회상

가장 생생하게 묘사된 감각이 지배적 양식. 냄새 언급 시 olfactory 우선.

JSON만 출력:
{ "modality": "visual|olfactory|auditory|somatic|narrative", "content": "핵심 감각 묘사 1~2문장", "weight": 1.0, "all_modalities": { "visual": 0.0, "olfactory": 0.0, "auditory": 0.0, "somatic": 0.0, "narrative": 0.0 } }`;

      const systemPrompt = `너는 감각 분석 AI야. 텍스트에서 가장 생생한 감각 양식을 정확히 분류해야 해. JSON 형식을 엄격히 지켜줘.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-5", thinking: { type: "disabled" },
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let text = data.content[0].text;
          text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
      } catch (e) {
        console.error('Sensory analysis error:', e);
      }
      
      // 폴백
      return new Response(JSON.stringify({
        modality: 'narrative',
        content: text.substring(0, 100),
        weight: 1.0,
        all_modalities: { visual: 0, olfactory: 0, auditory: 0, somatic: 0, narrative: 1.0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // situation_analysis 타입
    if (body.type === 'situation_analysis') {
      const text = body.text || '';
      const anchor = body.sensory_anchor || {};
      const prompt = `기억 속 상황을 분석하세요.

감각 앵커: ${anchor.modality || '?'} "${anchor.content || ''}"
상황 서술: "${text}"

추출 대상:
1. temporal: 시간적 맥락 (과거/현재/반복)
2. spatial: 공간적 맥락 (실내/실외/이동중/불명)
3. actors: 등장인물 배열 (역할만, 이름 없이)
4. role: 기록자의 역할 (actor/observer/victim)

JSON만 출력:
{ "temporal": "...", "spatial": "...", "actors": ["..."], "role": "actor|observer|victim" }`;

      const systemPrompt = `너는 상황 분석 AI야. 텍스트에서 시간, 공간, 등장인물, 역할을 정확히 추출해야 해. JSON 형식을 엄격히 지켜줘.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-5", thinking: { type: "disabled" },
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let text = data.content[0].text;
          text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
      } catch (e) {
        console.error('Situation analysis error:', e);
      }
      
      // 폴백
      return new Response(JSON.stringify({
        temporal: 'unknown',
        spatial: 'unknown',
        actors: [],
        role: 'unknown'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // generate_questions 타입
    if (body.type === 'generate_questions') {
      const d = body.confession_data || {};
      const emos = (d.emotions || []).join(', ') || 'unknown';
      const prompt = `기록자 Confession 데이터:
- 감각: ${d.sensory_anchor?.modality || '?'} "${d.sensory_anchor?.content || ''}"
- 상황: "${d.situation_raw || ''}"
- 신체: ${d.body_cluster || '?'} (${(d.body_responses || []).join(', ')})
- 감정: ${emos}
- 귀인: ${d.reason || '?'}
- 대상: ${d.target || '?'}

5가지 카테고리 중 적합한 2~4개 질문 생성:
A. spotlight — 수치심+타인 대상: "걔들이 알아챘을까?"
B. counterfactual — self_blame+후회: "그때 다르게 했으면?"
C. attribution_error — self_blame+죄책감: "정말 내 잘못이었을까?"
D. reality_check — 모순/혼란: "정말 그렇게 된 거 맞아?"
E. perspective_shift — 특정 대상: "걔는 나를 어떻게 봤을까?"

한국어, 구어체, 짧게. 상투적 질문 금지.

JSON만: { "questions": [{ "text": "...", "category": "spotlight|counterfactual|attribution_error|reality_check|perspective_shift" }] }`;

      const systemPrompt = `임상심리 기반 자기문답 생성 AI. JSON만 출력.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-5", thinking: { type: "disabled" },
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let text = data.content[0].text;
          text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
      } catch (e) {
        console.error('Question generation error:', e);
      }
      
      // 폴백 질문 배열
      return new Response(JSON.stringify({
        questions: [
          { text: '그게 정말 그렇게 된 거 맞아?', category: 'reality_check' },
          { text: '그때 다르게 했으면 어떻게 됐을까?', category: 'counterfactual' }
        ]
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- 감정 분석 타입 처리 ----
    if (body.type === 'emotion_analysis') {
      const emotionText = body.emotion || '';
      const reasonText = body.reason || '';
      const anchorEmotions = body.anchorEmotions || [];

      // 260728 씬 맥락 조건부 주입 (리트머스 §7-① 2단계) — body.context 가 없으면
      // 아래 ctxHeader = '' 이고 프롬프트는 기존과 문자 그대로 동일 (RECORD/live 무영향).
      // 배경: 관객은 유령에게 "말을 거는" 형식으로 쓴다("~겠네요"). 맥락 없이 읽으면
      // 분류기가 이를 화자 자신의 감정 서술로 뒤집어 공감을 냉소로 오독한다 (실측:
      // 공감 질문 → anger 0.55·"조롱하듯"). reason 주입(1단계)으로는 미해소.
      const ctx = (body.context && typeof body.context === 'object' && !Array.isArray(body.context))
        ? body.context : null;
      const ctxSceneText = (ctx && typeof ctx.scene_text === 'string') ? ctx.scene_text.slice(0, 400) : '';
      const ctxGhostLine = (ctx && typeof ctx.ghost_line === 'string') ? ctx.ghost_line.slice(0, 200) : '';
      const ctxHeader = (ctxSceneText || ctxGhostLine) ? `[상황] 아래 "입력된 감정" 텍스트는 관객이 타인의 기억 장면을 지나며, 그 기억의 화자(유령)에게 직접 건넨 말이다.

${ctxSceneText ? `[장면 원문 — 배경 참고용, 분석 대상 아님]
"${ctxSceneText}"

` : ''}${ctxGhostLine ? `[직전 유령의 말]
"${ctxGhostLine}"

` : ''}[읽기 규칙 — 최우선]
- 측정할 것은 관객 발화에 담긴 **관객 자신의** 감정뿐이다. 장면 원문의 감정 분포를 그대로 옮겨 적으면 오답이다. 장면과 발화의 감정 결이 다르면 반드시 발화를 따르라.
- "~겠네요", "~었어요?" 같은 문형은 상대의 경험을 헤아려 건네는 말이다. 이를 관객 자신의 냉소·조롱·거리감으로 뒤집어 읽지 마라. 명백한 조롱 표지가 없는 한, 헤아림에 담기는 감정은 공감·애틋함·그리움·따뜻한 슬픔 쪽이다.

` : '';

      console.log('감정 및 이유 분석 요청:', { emotionText, reasonText, anchorEmotions, hasContext: !!ctxHeader });

      // 감정 앵커 목록 동적 생성
      const defaultAnchors = 'fear, sadness, anger, joy, hope, relief, longing, guilt, isolation, numbness, shame, peace, love, gratitude';
      const emotionList = anchorEmotions && anchorEmotions.length > 0
        ? anchorEmotions.join(', ')
        : defaultAnchors;

      // 프롬프트 수정: 이유 분석 규칙 추가 + 동적 앵커 (+ 260728 조건부 ctxHeader)
      const prompt = `${ctxHeader}다음 감정 표현과 그 이유를 분석해줘.

입력된 감정: "${emotionText}"
입력된 이유: "${reasonText}"

**분석 목표 1: 감정 분석 (동적 앵커 기반)**
다음 감정 앵커들에 대한 근접도를 0.0~1.0으로 측정하세요: ${emotionList}

- 입력된 텍스트에서 해당 감정이 느껴지면 0.5 이상
- 강하게 느껴지면 0.7 이상
- 매핑에 없는 자유 앵커도 맥락상 판단하여 수치화
- 명시적 감정 단어가 있으면 해당 감정은 절대 0이 아님!
- "무서웠어", "두려웠어", "공포", "무섭다" → fear를 0.7 이상으로
- "슬펐어", "울었어", "슬프다" → sadness를 0.7 이상으로
- "그리웠어", "보고싶었어" → longing을 0.7 이상으로
- "화났어", "열받았어", "분노" → anger를 0.7 이상으로
- "죄책감", "미안했어" → guilt를 0.7 이상으로
- 명시적 감정 단어가 있으면 해당 감정은 절대 0이 아님!

**분석 목표 2: 이유 벡터(Reason Vector) 추출**
입력된 '이유' 텍스트를 분석하여 다음 3가지 필드를 도출해줘.

1. attribution (귀인 방향 - 누구 탓인가?)
   - "self_blame": 내 탓, 내가 부족해서, 내가 잘못해서
   - "other_blame": 타인 탓, 그 사람 때문에, 엄마/아빠/친구가
   - "fate_blame": 운명, 어쩔 수 없는 상황, 우연히, 그냥 그렇게 됨
   - (판단 불가 시 가장 가까운 것 선택)

2. core_fear (핵심 두려움 - 무엇이 가장 두려운가?)
   - "abandonment": 버림받음, 혼자 남음, 떠날까봐, 고립
   - "death": 죽음, 소멸, 끝남, 다침
   - "rejection": 거절, 미움받음, 비난, 인정받지 못함
   - "failure": 실패, 못함, 실수, 능력 부족
   - (해당없으면 "none" 또는 가장 문맥에 맞는 것)

3. is_void (공백 여부)
   - true: "모르겠어", "말하고 싶지 않아", "기억 안 나", 또는 빈 입력("")
   - false: 구체적인 이유가 있는 경우

**응답 형식 (반드시 JSON만 출력):**
{
  "generatedEmotion": "변환된 감정 표현 (2-3문장)",
  "analysis": {
    "base": { 각 앵커에 대한 수치 (0.0~1.0) - 요청된 앵커 목록의 모든 감정 포함 },
    "detailed": [],
    "intensity": 0.5,
    "confidence": 0.8
  },
  "reason_analysis": {
    "attribution": "self_blame", 
    "core_fear": "abandonment",
    "is_void": false
  }
}

**중요**: base 객체에는 요청된 앵커 목록(${emotionList})의 모든 감정에 대해 수치를 포함해야 합니다.`;

      const systemPrompt = `너는 심리 분석 AI야. 텍스트에서 감정의 종류뿐만 아니라, 그 감정의 '원인'이 어디로 향하는지(귀인), 그리고 기저에 깔린 근원적 공포(Core Fear)가 무엇인지 정확하게 분류해야 해. JSON 형식을 엄격히 지켜줘.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-5", thinking: { type: "disabled" },
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Claude API 에러 (emotion):', errorData);
        // 기본 감정 벡터 생성 (앵커 기반)
        const defaultBase = {};
        if (anchorEmotions && anchorEmotions.length > 0) {
          anchorEmotions.forEach(anchor => {
            defaultBase[anchor.toLowerCase()] = 0;
          });
        } else {
          defaultBase.fear = 0;
          defaultBase.sadness = 0.3;
          defaultBase.anger = 0;
          defaultBase.joy = 0;
          defaultBase.longing = 0.2;
          defaultBase.guilt = 0;
        }
        return new Response(JSON.stringify({
          generatedEmotion: `그 순간, ${emotionText || '알 수 없는'} 감정이 밀려왔다.`,
          analysis: {
            base: defaultBase,
            detailed: [],
            intensity: 0.5,
            confidence: 0.3
          },
          reason_analysis: {
            attribution: "fate_blame",
            core_fear: "none",
            is_void: true
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await response.json();
      let text = data.content[0].text;
      
      console.log('Claude 감정 응답 원본:', text);

      // JSON 파싱 시도
      try {
        // ```json 제거
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // JSON 객체만 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          text = jsonMatch[0];
        }
        
        const parsed = JSON.parse(text);
        console.log('파싱된 감정 결과:', JSON.stringify(parsed));
        
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        console.error('JSON parse error:', e, 'text:', text);
        
        // 파싱 실패 시 기본값 (앵커 기반)
        const defaultBase = {};
        if (anchorEmotions && anchorEmotions.length > 0) {
          anchorEmotions.forEach(anchor => {
            defaultBase[anchor.toLowerCase()] = 0;
          });
        } else {
          defaultBase.fear = 0;
          defaultBase.sadness = 0.3;
          defaultBase.anger = 0;
          defaultBase.joy = 0;
          defaultBase.longing = 0.2;
          defaultBase.guilt = 0;
        }
        return new Response(JSON.stringify({
          generatedEmotion: `그 순간, ${emotionText || '알 수 없는'} 감정이 밀려왔다.`,
          analysis: {
            base: defaultBase,
            detailed: [],
            intensity: 0.5,
            confidence: 0.3
          },
          reason_analysis: {
            attribution: "fate_blame",
            core_fear: "none",
            is_void: true
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ---- 오타·띄어쓰기 교정 (Haiku 4.5, play-test 자유 입력 전용) ----
    if (body.type === "typo_correct") {
      const text = String(body.text || "").trim();
      if (!text) {
        return new Response(JSON.stringify({ corrected: "", changed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = `다음 한국어 문장의 **명백한 오타와 띄어쓰기**만 교정해라.

원문: """${text}"""

규칙:
- 의미를 바꾸거나 단어를 추가/삭제/풀어쓰기 하지 말 것
- 인물 이름, 고유명사, 의도된 비표준어("머가", "넘 좋아" 같은 구어체 표현)는 그대로 둘 것
- 자모 인접키 오타(예: "안ㄴ녕" → "안녕"), 받침 누락(예: "햇어" → "했어"), 어색한 띄어쓰기만 수정
- 교정할 게 없으면 원문 그대로 출력
- **메타 코멘트·오류 메시지·해설 절대 금지** (예: "해석할 수 없습니다", "원문을 다시 확인해 주세요" 같은 응답 금지)
- 입력이 무의미해 보이거나 자모만 있어도 **원문 그대로 한 줄만** 반환할 것
- 설명·따옴표·접두사 없이 **교정된 문장 한 줄만** 출력`;

      const systemPrompt = `한국어 오타 교정기. 원문의 톤·어휘·뉘앙스 유지. 메타 응답 금지. 교정문 한 줄만 출력 (교정 불가 시 원문 그대로).`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let corrected = String(data.content?.[0]?.text || "").trim();
          // 따옴표·코드펜스 제거
          corrected = corrected.replace(/^["'`]+|["'`]+$/g, "").replace(/^```[\s\S]*?\n|\n```$/g, "").trim();
          // 모델이 여러 줄을 뱉으면 첫 줄만
          if (corrected.includes("\n")) corrected = corrected.split("\n")[0].trim();
          if (!corrected) corrected = text;
          return new Response(
            JSON.stringify({ corrected, changed: corrected !== text }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.error("typo_correct error:", e);
      }

      // 폴백: 원문 그대로
      return new Response(
        JSON.stringify({ corrected: text, changed: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Core 핀: 사용자 반응 → 감정 벡터 (play-test emotion_extract) ----
    // 결정론 보장:
    //   - PROMPT_VERSION 응답에 박음 = 프롬프트 손대면 버전 올림. ghost_variants.extractor_version 컬럼에 저장.
    //   - 5/19 마감 후 프롬프트 수정 시 전량 재추출 후 같은 버전으로 덮어쓰기.
    //   - (2026-07-05) sonnet-4 은퇴로 sonnet-5 전환. temperature 파라미터는 sonnet-5가 거부(400)해 제거.
    if (body.type === "emotion_extract") {
      const PROMPT_VERSION = "tem-emotion-v2.1.0";
      const userText = String(body.user_text || "").trim();
      const sceneText = String(body.scene_text || "").trim();

      if (!userText) {
        return new Response(JSON.stringify({ error: "user_text가 필요합니다." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anchorKeys = [
        "fear", "sadness", "anger", "joy", "longing", "guilt", "shame", "numbness", "isolation",
        "relief", "confusion", "emptiness",
      ];

      const prompt = `너는 기억 장면에 대한 사용자의 **자유 반응**을 분석한다.

**중요**: 사용자 텍스트는 한국어, 영어, 혼용 어떤 언어로 와도 된다. 입력 언어를 그대로 이해하고 판단해라. 영어로 번역해서만 분석하지 말고, 의미를 직접 읽어라.

[장면 맥락 — 참고용]
${sceneText ? `"""${sceneText}"""` : "(장면 텍스트 없음)"}

[사용자 반응]
"""${userText}"""

**과제**: 위 반응에 담긴 정서를 아래 **영어 키** 축으로만 0.0~1.0 점수를 부여한다. 키 이름은 반드시 영어 소문자로만 출력한다.

축: ${anchorKeys.join(", ")}

**한국어 매핑 예시 (반드시 참고)**:
- 슬프다, 슬펐다, 슬퍼, 우울, 눈물, 울었, 비통 → **sadness** 높게 (0.65~1.0)
- 무섭다, 무서워, 두려움, 공포, 불안, 조마조마 → **fear** 높게
- 화나, 분노, 열받, 짜증, 격분 → **anger** 높게
- 그립다, 그리워, 보고 싶, 그리움 → **longing** 높게
- 미안, 죄책감, 내 탓 → **guilt** 높게
- 창피, 수치, 부끄 → **shame** 높게
- 멍하, 아무것도, 감각 없 → **numbness**
- 혼자, 고립, 외로 → **isolation**
- 후련, 안도, 다행 → **relief**
- 헷갈, 모르겠, 혼란 → **confusion**
- 공허, 텅 빈 → **emptiness**

**영어 매핑 예시**: sad, sorrow, grief → sadness / afraid, scared → fear / angry, furious → anger

반응이 짧아도(예: "슬프다.") 명시된 감정 단어가 있으면 해당 축은 0.65 이상으로 올려라.

**JSON만 출력** (다른 설명 금지):
{
  "base": {
    ${anchorKeys.map((k) => `"${k}": 0.0`).join(",\n    ")}
  },
  "reason_analysis": {
    "attribution": "self_blame|other_blame|fate_blame|unknown",
    "core_fear": "abandonment|death|rejection|failure|none",
    "target": "unknown",
    "is_void": false
  }
}

base 객체에는 위 모든 키를 포함하고 숫자만 넣어라.`;

      const systemPrompt = `감정 추출기. 사용자 입력 언어(한·영·혼용)를 직접 이해한다. 출력의 감정 키는 항상 영어 소문자(base 내)이다. JSON만 출력.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-5", thinking: { type: "disabled" },
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("emotion_extract API error:", errText);
          throw new Error("Claude API failed");
        }

        const data = await response.json();
        let text = data.content[0].text as string;
        text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            base?: Record<string, number>;
            reason_analysis?: Record<string, unknown>;
          };
          const base = parsed.base || {};
          anchorKeys.forEach((k) => {
            if (typeof base[k] !== "number") base[k] = 0;
          });
          const reason = parsed.reason_analysis || {};
          return new Response(
            JSON.stringify({
              base,
              reason_analysis: {
                attribution: reason.attribution ?? "unknown",
                core_fear: reason.core_fear ?? "none",
                target: reason.target ?? "unknown",
                is_void: Boolean(reason.is_void),
              },
              prompt_version: PROMPT_VERSION,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.error("emotion_extract error:", e);
      }

      // 폴백: 한글 슬픔 키워드 휴리스틱 (프롬프트 버전은 폴백임을 표시)
      const low = userText.toLowerCase();
      const koSad = /슬프|슬퍼|슬펐|우울|눈물|울었|비통|슬픔/;
      const fb: Record<string, number> = {};
      anchorKeys.forEach((k) => {
        fb[k] = 0;
      });
      if (koSad.test(userText) || /\bsad\b|sorrow|grief/i.test(low)) fb.sadness = 0.82;
      else fb.sadness = 0.15;
      return new Response(
        JSON.stringify({
          base: fb,
          reason_analysis: {
            attribution: "unknown",
            core_fear: "none",
            target: "unknown",
            is_void: false,
          },
          prompt_version: `${PROMPT_VERSION}-fallback`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- 기존 장면 생성 로직 ----
    const { text } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "텍스트 입력이 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5", thinking: { type: "disabled" },
        max_tokens: 300,
        system: `너는 '기억 변환 장치'이다. 화자가 입력한 문장을 바탕으로, 체험자에게 보여줄 장면을 생성한다.

규칙:
1) 출력은 반드시 2~3문장
2) 감각 묘사를 1개 이상 포함
3) 과도한 서사 금지
4) 심리 해석 금지
5) 2인칭 시점
6) 원문을 단순 반복하지 말고 감각적으로 변환`,
        messages: [
          {
            role: "user",
            content: `화자가 떠올린 기억: "${text.trim()}"\n이 장면을 체험자가 몰입할 수 있는 즉각적인 경험으로 변환해라.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API 에러 (scene):", errorData);
      return new Response(
        JSON.stringify({
          error: "Claude API 호출 실패",
          details: errorData.error?.message || "알 수 없는 오류",
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const scene = data.content[0].text;

    return new Response(JSON.stringify({ scene }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error('Edge Function 에러:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
