import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

// ─── R3-2 입력 상한 (2026-07-14, L3-01 🔴) ────────────────────────
// verify_jwt=false 공개 엔드포인트 → 호출 1건 = Anthropic 크레딧 소모.
// 익명 관객이 회차 끝 reveal 을 받는 경로라 차단은 금지. 입력 크기만 좁힌다.
// 실사용: 회차 방문 3~11개 × 씬 텍스트 150자 슬라이스 → 수 KB.
const MAX_BODY_BYTES = 32768;
const MAX_VISITS = 40;
const MAX_TITLE_CHARS = 200;

// ─── W2-4 (2026-07-16): 이본 명명 + 접촉 언어 입력 상한 ────────────
// 정본: docs/이본지층/이본지층_설계_v1-260716.md 결정 2·3. 선택 필드(하위호환) —
// 기존 입력만 오면 기존 출력 그대로. variant_summary 가 오면 서사 끝에 "이본 초상화"
// 한 단락을 요구하되 서열·평가·성공/실패 언어를 금지한다.
const MAX_MISMATCH_CHARS = 40;
const MAX_FIXATION_CHARS = 40;
const MAX_CONTACT_CHARS = 300;

// variant_summary 정규화 (타입·범위·상한). 유효하지 않으면 null → 초상화 단락 미부착(하위호환).
function normVariant(v: unknown): { align: string; mismatch: string; fixation: string } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const align = (typeof o.alignment_avg === "number" && isFinite(o.alignment_avg))
    ? Math.max(0, Math.min(1, o.alignment_avg)).toFixed(2)
    : "?";
  const mismatch = typeof o.dominant_mismatch === "string"
    ? o.dominant_mismatch.slice(0, MAX_MISMATCH_CHARS)
    : "?";
  const fixation = typeof o.fixation_level === "number" && isFinite(o.fixation_level)
    ? o.fixation_level.toFixed(2)
    : (typeof o.fixation_level === "string" ? o.fixation_level.slice(0, MAX_FIXATION_CHARS) : "?");
  return { align, mismatch, fixation };
}

// contact 정규화. occurred=true 일 때만 접촉 문장을 요구.
function normContact(c: unknown): { occurred: boolean; utterance: string } {
  if (!c || typeof c !== "object" || Array.isArray(c)) return { occurred: false, utterance: "" };
  const o = c as Record<string, unknown>;
  return {
    occurred: o.occurred === true,
    utterance: typeof o.utterance === "string" ? o.utterance.slice(0, MAX_CONTACT_CHARS) : "",
  };
}

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

    // W2-4: 선택 입력 정규화 (없으면 하위호환 경로).
    const variant = normVariant(body.variant_summary);
    const contact = normContact(body.contact);

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

    // ─── W2-4: 이본 초상화 지시 (variant_summary 가 있을 때만 부착) ───
    // 서열·평가 언어 금지. 판본은 우열이 아니라 성격. 접촉은 '성취'가 아니라 '사건'.
    let variantBlockKo = "";
    let variantBlockEn = "";
    if (variant) {
      const contactLineKo = contact.occurred
        ? `\n11. 여정 중 유령과 정말 겹친 순간이 있었다. 이것을 '성취/성공'이 아니라 '일어난 사건'으로 담담히 한 문장 언급하라. ("거의 도달", "마침내", "해냈다" 류 금지.)${contact.utterance ? ` 그 순간의 말: "${contact.utterance}" — 인용해도 좋다.` : ""}`
        : "";
      variantBlockKo = `\n\n--- 마지막에 한 단락 더: 이본(異本) 초상화 ---
10. 위 서사 뒤에, 이 여정이 어떤 판본(이본)이 되었는지 한 단락으로 묘사하라. 서열·평가·성공/실패 언어를 절대 쓰지 말 것 ('잘했다/아쉽다/거의 도달/성공/실패/높은 정렬' 류 금지). 우열이 아니라 성격만 그린다. 참고 재료(그대로 나열하지 말고 성격으로 녹일 것): 평균 정렬 수준 ${variant.align}, 지배적 어긋남 ${variant.mismatch}, 고착도 ${variant.fixation}.${contactLineKo}`;
      const contactLineEn = contact.occurred
        ? `\n11. Somewhere in the journey there was a moment where you genuinely overlapped with the ghost. Mention it in ONE plain sentence as something that "happened," not something "achieved" (no "almost reached", "finally", "succeeded"). ${contact.utterance ? `The words of that moment: "${contact.utterance}" — you may quote it.` : ""}`
        : "";
      variantBlockEn = `\n\n--- One more paragraph at the end: the variant (異本) portrait ---
10. After the narrative above, describe in one paragraph what edition (variant) this journey became. Never use ranking / evaluation / success-failure language (no "did well / fell short / almost reached / succeeded / failed / high alignment"). Draw character, not rank. Reference material (weave as character, do not list): average alignment ${variant.align}, dominant mismatch ${variant.mismatch}, fixation ${variant.fixation}.${contactLineEn}`;
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
4. Reflect resonance and fracture as texture, not as score or rank.
5. If mismatch exists, reflect tension in the narrative.
6. Include at least one sensory detail.
7. No psychological jargon — literary expression only.
8. End the narrative with what was taken from or left in the memory.
9. Output narrative text only. No JSON.${variantBlockEn}`
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
4. 공명과 균열은 점수나 서열이 아니라 결(texture)로 표현
5. 미스매치가 있으면 서사에 긴장 반영
6. 감각 묘사 1개 이상
7. 심리 용어 금지, 문학적 표현
8. 서사의 마지막 문장은 기억에서 무엇을 가져갔는지/남겼는지로 끝낼 것
9. 서사 텍스트만 출력. JSON 금지.${variantBlockKo}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5", thinking: { type: "disabled" },
        max_tokens: 1536,
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
