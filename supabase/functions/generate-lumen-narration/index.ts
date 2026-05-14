// Lumen Narration Generator
// POV 플레이 끝나고 장면화 시퀀스에서 재생할 더빙 음성 생성.
//
// 흐름:
//   1) 클라이언트 → { memoryId, completedSentence, scenes, alignment, alignmentBucket,
//                    transitionPattern, sessionId? } 전송
//   2) 클로드 Haiku로 옛날 이야기 톤 한국어 텍스트 윤색 (200자 내외)
//   3) 일레븐랩스로 텍스트 → mp3 변환
//   4) Supabase Storage `lumen_voice` 버킷에 업로드
//   5) public URL + 윤색된 텍스트 반환

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

// ── 환경/모델 ─────────────────────────────────────────────────────
// Voice ID는 ELEVENLABS_VOICE_ID secret으로 override 가능.
// 기본값은 사용자가 고른 한/영 모두 자연스러운 보이스.
const DEFAULT_VOICE_ID = "BNgbHR0DNeZixGQVzloa"; // 한국어/영어 모두 자연스러운 톤 (사용자 선택, 2026-05-14)
const ELEVENLABS_MODEL = "eleven_multilingual_v2";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// ── 입력 타입 ─────────────────────────────────────────────────────
interface SceneInput {
  sceneIndex?: number;
  sceneId?: string | null;
  sceneText?: string;
  userEmotion?: Record<string, number>;
  userReason?: string;
}

interface RequestBody {
  memoryId: string;
  completedSentence?: string;
  scenes: SceneInput[];
  alignment?: number;
  alignmentBucket?: string;
  transitionPattern?: string;
  sessionId?: string;
}

// ── 윤색 프롬프트 생성 ────────────────────────────────────────────
function buildNarrationPrompt(body: RequestBody): string {
  const sceneSummary = body.scenes
    .map((s, i) => {
      const e = s.userEmotion || {};
      const topEmotions = Object.entries(e)
        .filter(([_, v]) => typeof v === "number" && v > 0.3)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([k, v]) => `${k}(${(v as number).toFixed(2)})`)
        .join(", ");
      const reason = (s.userReason || "").slice(0, 60);
      const sceneText = (s.sceneText || "").slice(0, 80);
      return `씬 ${i + 1}: 원본="${sceneText}" / 플레이어 감정: ${topEmotions || "없음"} / 이유: "${reason}"`;
    })
    .join("\n");

  const completed = body.completedSentence || "(결말 문장 없음)";
  const bucket = body.alignmentBucket || "unknown";
  const pattern = body.transitionPattern || "unknown";
  const alignmentStr = typeof body.alignment === "number" ? body.alignment.toFixed(2) : "unknown";

  return `당신은 옛날 이야기를 들려주는 화자입니다. 한 사람이 어떤 기억을 따라 갔습니다. 그 사람의 흔적을 옛날 이야기 톤으로 짧게 풀어주세요.

원본 결말 문장: "${completed}"
정렬 카테고리: ${bucket}
변이 패턴: ${pattern}
정렬 점수: ${alignmentStr}

이 사람이 거쳐온 길:
${sceneSummary}

규칙:
1. 한국어로 작성. 180자 이상 240자 이내. 너무 짧지도 너무 길지도 않게.
2. 옛날 이야기 화자 톤. "그날", "어쩌면", "그 사람은…" 같은 자연스러운 도입.
3. 결말 감정과 변이의 결만 담기. 중간 선택의 구체적 디테일은 흐릿하게.
4. 마지막 한 문장은 "이건 누군가의 기억이었다" 또는 비슷한 의미로 마감 (똑같이 따라쓰지 말 것, 같은 의미를 변주).
5. 시스템 설명·분석·메타 언급 금지. 순수 이야기만 출력.
6. 사용자에게 직접 말 걸지 말 것 (2인칭 금지). 3인칭 화자 톤 유지.

이야기 본문만 출력 (제목·따옴표 없이):`;
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST만 허용됨" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.memoryId || !Array.isArray(body.scenes) || body.scenes.length === 0) {
      return new Response(
        JSON.stringify({ error: "memoryId와 scenes(비어있지 않은 배열) 필수" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 환경변수 체크
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE_ID;

    const missing = {
      anthropic: !anthropicKey,
      elevenlabs: !elevenLabsKey,
      supabase_url: !supabaseUrl,
      service_role: !supabaseServiceKey,
    };

    if (!anthropicKey || !elevenLabsKey || !supabaseUrl || !supabaseServiceKey) {
      console.error("[generate-lumen-narration] 환경변수 누락:", missing);
      return new Response(
        JSON.stringify({ error: "환경변수 누락", missing }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 1) 클로드 Haiku 윤색 ────────────────────────────────────
    const prompt = buildNarrationPrompt(body);

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("[generate-lumen-narration] Claude 호출 실패:", errText);
      return new Response(
        JSON.stringify({ error: "Claude API 호출 실패", detail: errText.slice(0, 500) }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const claudeData = await claudeResp.json();
    const narrationText: string = (claudeData?.content?.[0]?.text || "").trim();

    if (!narrationText) {
      return new Response(
        JSON.stringify({ error: "Claude 응답이 비어있음", raw: claudeData }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 2) 일레븐랩스 TTS ───────────────────────────────────────
    const elevenResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: narrationText,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.7,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      console.error("[generate-lumen-narration] ElevenLabs 호출 실패:", errText);
      return new Response(
        JSON.stringify({
          error: "ElevenLabs API 호출 실패",
          detail: errText.slice(0, 500),
          narrationText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioBuffer = await elevenResp.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // ── 3) Supabase Storage 업로드 ──────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sessionId = body.sessionId || crypto.randomUUID();
    const fileName = `${body.memoryId}/${sessionId}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from("lumen_voice")
      .upload(fileName, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-lumen-narration] Storage 업로드 실패:", uploadError);
      return new Response(
        JSON.stringify({
          error: "Storage 업로드 실패",
          detail: uploadError.message,
          narrationText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 4) public URL 발급 ──────────────────────────────────────
    const { data: publicUrlData } = supabase.storage
      .from("lumen_voice")
      .getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        audioUrl: publicUrlData.publicUrl,
        narrationText,
        fileName,
        sessionId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[generate-lumen-narration] 내부 오류:", e);
    return new Response(
      JSON.stringify({ error: "서버 내부 오류", detail: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
