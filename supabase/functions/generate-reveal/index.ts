import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API 키 미설정" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const visits = body.visits || [];
    const memoryTitle = body.memory_title || "무제";
    const emotionTrajectory = body.emotion_trajectory || [];

    if (visits.length === 0) {
      return new Response(JSON.stringify({ error: "방문 데이터 없음" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const visitDescriptions = visits.map((v: any, i: number) => {
      const pinLabel = v.pin_type === "core" ? "Core(원본 기억)" : "Bridge(가교 조각)";
      const emotions = v.emotion_data?.base || {};
      const dominant = Object.entries(emotions)
        .filter(([, val]) => (val as number) > 0.3)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([key]) => key)
        .slice(0, 3);
      const reason = v.emotion_data?.reason_analysis || {};
      return `[${i + 1}번째] ${pinLabel}
장면: "${(v.scene_text || "").substring(0, 150)}"
감정: ${dominant.join(", ") || "없음"}
정렬도: ${v.engine_result?.alignment_bucket || "?"} (${v.engine_result?.alignment_score?.toFixed(2) || "?"})
패턴: ${v.engine_result?.transition_pattern || "?"}
미스매치: ${v.engine_result?.mismatch_type || "none"}
귀인: ${reason.attribution || "?"} / 두려움: ${reason.core_fear || "?"}`;
    }).join("\n\n");

    let trajectoryNote = "";
    if (emotionTrajectory.length >= 2) {
      const f = emotionTrajectory[0];
      const l = emotionTrajectory[emotionTrajectory.length - 1];
      trajectoryNote = `감정이동: V ${f.v?.toFixed(2)}→${l.v?.toFixed(2)}, A ${f.a?.toFixed(2)}→${l.a?.toFixed(2)}`;
    }

    const prompt = `기억 제목: "${memoryTitle}"
방문 수: ${visits.length}
${trajectoryNote}

--- 방문 기록 ---
${visitDescriptions}
--- 끝 ---

위 데이터는 한 사람이 타인의 기억 지형을 탐색한 기록이다.
이 사람의 여정을 하나의 짧은 서사로 재구성하라.

규칙:
1. 2인칭 시점 ("당신은")
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "TEM Reveal 서사 생성기. 기억 탐색 데이터를 받아 문학적 서사 텍스트만 출력.",
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
