import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

// ─── R3-2 입력 상한 (2026-07-14, L3-01 🔴) ────────────────────────
// verify_jwt=false 공개 엔드포인트 → 호출 1건 = Anthropic 크레딧 소모.
// 익명 관객이 회차 끝 reveal 을 받는 경로라 차단은 금지. 입력 크기만 좁힌다.
// 실사용: 회차 방문 3~11개 × 씬 텍스트 150자 슬라이스 → 수 KB.
const MAX_BODY_BYTES = 32768;
const MAX_VISITS = 40;
const MAX_TITLE_CHARS = 200;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "body too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API 키 미설정" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const visits = Array.isArray(body.visits) ? body.visits : [];
    const memoryTitle = String(body.memory_title || "무제").slice(0, MAX_TITLE_CHARS);
    const emotionTrajectory = Array.isArray(body.emotion_trajectory) ? body.emotion_trajectory : [];
    const lang = body.lang === "en" ? "en" : "ko";

    if (visits.length === 0) {
      return new Response(JSON.stringify({ error: "방문 데이터 없음" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (visits.length > MAX_VISITS) {
      return new Response(JSON.stringify({ error: `too many visits (max ${MAX_VISITS})` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const visitDescriptions = visits.map((v: any, i: number) => {
      const pinLabel = v.pin_type === "core"
        ? (lang === "en" ? "Core" : "Core(원본 기억)")
        : (lang === "en" ? "Bridge" : "Bridge(가교 조각)");
      const emotions = v.emotion_data?.base || {};
      const dominant = Object.entries(emotions)
        .filter(([, val]) => (val as number) > 0.3)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([key]) => key)
        .slice(0, 3);
      const reason = v.emotion_data?.reason_analysis || {};
      return `[#${i + 1}] ${pinLabel}
Scene: "${(v.scene_text || "").substring(0, 150)}"
Emotions: ${dominant.join(", ") || "none"}
Alignment: ${v.engine_result?.alignment_bucket || "?"} (${v.engine_result?.alignment_score?.toFixed(2) || "?"})
Pattern: ${v.engine_result?.transition_pattern || "?"}
Mismatch: ${v.engine_result?.mismatch_type || "none"}
Attribution: ${reason.attribution || "?"} / Fear: ${reason.core_fear || "?"}`;
    }).join("\n\n");

    let trajectoryNote = "";
    if (emotionTrajectory.length >= 2) {
      const f = emotionTrajectory[0];
      const l = emotionTrajectory[emotionTrajectory.length - 1];
      trajectoryNote = `Emotion shift: V ${f.v?.toFixed(2)}→${l.v?.toFixed(2)}, A ${f.a?.toFixed(2)}→${l.a?.toFixed(2)}`;
    }

    const systemPrompt = lang === "en"
      ? "TEM Reveal narrative generator. Receive memory exploration data, output literary narrative text only."
      : "TEM Reveal 서사 생성기. 기억 탐색 데이터를 받아 문학적 서사 텍스트만 출력.";

    const prompt = lang === "en"
      ? `Memory title: "${memoryTitle}"
Visits: ${visits.length}
${trajectoryNote}

--- Visit Log ---
${visitDescriptions}
--- End ---

The above is a record of one person exploring another person's memory terrain.
Reconstruct this journey into a short narrative.

Rules:
1. Write in English. Use second person ("you").
2. 3–6 sentences.
3. Follow visit order, focusing on emotional flow and shifts.
4. High alignment = resonance, low alignment = fracture.
5. If mismatch exists, reflect tension in the narrative.
6. Include at least one sensory detail.
7. No psychological jargon — literary expression only.
8. End with what was taken from or left in the memory.
9. Output narrative text only. No JSON.`
      : `기억 제목: "${memoryTitle}"
방문 수: ${visits.length}
${trajectoryNote}

--- 방문 기록 ---
${visitDescriptions}
--- 끝 ---

위 데이터는 한 사람이 타인의 기억 지형을 탐색한 기록이다.
이 사람의 여정을 하나의 짧은 서사로 재구성하라.

규칙:
1. 서사 텍스트를 한국어로 작성하라. 2인칭 시점 ("당신은").
2. 3~6문장
3. 방문 순서를 따르되 감정의 흐름과 변화에 초점
4. 정렬도 높으면 공명, 낮으면 균열로 표현
5. 미스매치가 있으면 서사에 긴장 반영
6. 감각 묘사 1개 이상
7. 심리 용어 금지, 문학적 표현
8. 마지막 문장은 기억에서 무엇을 가져갔는지/남겼는지로 끝낼 것
9. 서사 텍스트만 출력. JSON 금지.`;

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
      const err = await response.json().catch(() => ({}));
      console.error("Claude API error:", err);
      return new Response(JSON.stringify({ narrative: "기억의 조각들이 침묵 속에 가라앉았습니다." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const narrative = (data as any).content[0].text.trim();

    return new Response(JSON.stringify({ narrative }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("generate-reveal error:", err);
    return new Response(JSON.stringify({ narrative: "기억을 읽는 데 실패했습니다." }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });
  }
});
