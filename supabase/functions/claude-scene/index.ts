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
            model: "claude-sonnet-4-20250514",
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
            model: "claude-sonnet-4-20250514",
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
            model: "claude-sonnet-4-20250514",
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
      
      console.log('감정 및 이유 분석 요청:', { emotionText, reasonText, anchorEmotions });

      // 감정 앵커 목록 동적 생성
      const defaultAnchors = 'fear, sadness, anger, joy, hope, relief, longing, guilt, isolation, numbness, shame, peace, love, gratitude';
      const emotionList = anchorEmotions && anchorEmotions.length > 0
        ? anchorEmotions.join(', ')
        : defaultAnchors;

      // 프롬프트 수정: 이유 분석 규칙 추가 + 동적 앵커
      const prompt = `다음 감정 표현과 그 이유를 분석해줘.

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
          model: "claude-sonnet-4-20250514",
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

    // ---- 기존 장면 생성 로직 ----
    const { text } = body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: '텍스트 입력이 필요합니다.' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
            content: `화자가 떠올린 기억: "${text.trim()}"\n이 장면을 체험자가 몰입할 수 있는 즉각적인 경험으로 변환해라.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API 에러 (scene):', errorData);
      return new Response(JSON.stringify({ 
        error: 'Claude API 호출 실패',
        details: errorData.error?.message || '알 수 없는 오류'
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const scene = data.content[0].text;

    return new Response(JSON.stringify({ scene }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error('Edge Function 에러:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
