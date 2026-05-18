// Scene Sound Generator
// admin 씬 편집기의 "AI 음향 생성". 두 모드:
//   mode "draft"    : 씬 본문 → Claude Haiku → 영어 사운드 프롬프트 초안
//   mode "generate" : (작가가 다듬은) 프롬프트 → ElevenLabs Sound Effects → mp3
//                     → Supabase Storage `scene_sounds` 버킷 → public URL
//
// 흐름:
//   1) admin → { mode, ... } 전송
//   2) draft   → { prompt } 반환 — 작가가 admin 에서 수정
//   3) generate→ { soundUrl, fileName } 반환 — scene.meta.sound_url 에 저장
//
// 본보기: 폐기된 generate-lumen-narration (TTS) 의 골격. ElevenLabs 호출만 SFX 로 교체.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS 헤더 — _shared/auth.ts 의 getCorsHeaders 를 인라인 (단일 파일 배포용)
function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim())
    : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowedOrigins.length === 0) allowedOrigin = "*";
  else if (allowedOrigins.includes(origin)) allowedOrigin = origin;
  else allowedOrigin = allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const SFX_DURATION_SECONDS = 18;   // 앰비언트 루프용 길이 (ElevenLabs SFX 상한 ~22s)
const SFX_PROMPT_INFLUENCE = 0.4;  // 0=창의적 … 1=프롬프트 충실

// 씬 본문 → 영어 사운드 프롬프트 초안 지시문
function buildDraftPrompt(sceneText: string, motifs: string[]): string {
  const motifLine = (motifs && motifs.length)
    ? `\n모티프 태그: ${motifs.join(", ")}`
    : "";
  return `당신은 어떤 기억을 묘사한 글을 읽고, 그 기억 속에서 실제로 들렸을 법한 "주변 소리(diegetic ambient sound)"를 ElevenLabs Sound Effects 용 영어 프롬프트로 옮기는 사운드 디자이너입니다.

기억 본문:
"""
${sceneText}
"""${motifLine}

규칙:
1. 감정 형용사("sad", "tense")가 아니라 그 장소에 실제로 있었을 소리의 원천을 적어라 — 부엌이면 kettle, 멀리 traffic, fluorescent hum 식으로.
2. 음악·멜로디 금지. 끊김 없이 깔리는 연속 ambient texture 여야 한다.
3. "기억을 통해 들리는" 결 — distant, muffled, faded, looping 같은 단어로 현장음이 아니라 회상된 소리임을 명시.
4. 영어로, 한 문장(쉼표로 요소 나열). 25단어 이내.
5. 설명·따옴표·접두어 없이 프롬프트 본문만 출력.

프롬프트:`;
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 허용됨" }, 405, corsHeaders);

  try {
    const body = await req.json();
    const mode = body.mode;

    // ── draft: 씬 본문 → Claude → 사운드 프롬프트 ──────────────────
    if (mode === "draft") {
      const sceneText = (body.sceneText || "").trim();
      if (!sceneText) return json({ error: "sceneText 필수" }, 400, corsHeaders);

      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
      if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500, corsHeaders);

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 200,
          messages: [{ role: "user", content: buildDraftPrompt(sceneText, body.motifs || []) }],
        }),
      });
      if (!claudeResp.ok) {
        const t = await claudeResp.text();
        console.error("[generate-scene-sound] Claude 실패:", t);
        return json({ error: "Claude API 호출 실패", detail: t.slice(0, 400) }, 502, corsHeaders);
      }
      const claudeData = await claudeResp.json();
      const prompt = (claudeData?.content?.[0]?.text || "").trim();
      if (!prompt) return json({ error: "Claude 응답이 비어있음" }, 502, corsHeaders);
      return json({ prompt }, 200, corsHeaders);
    }

    // ── generate: 프롬프트 → ElevenLabs SFX → Storage → URL ───────
    if (mode === "generate") {
      const prompt = (body.prompt || "").trim();
      const sceneId = body.sceneId || "scene";
      if (!prompt) return json({ error: "prompt 필수" }, 400, corsHeaders);

      const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!elevenKey || !supabaseUrl || !serviceKey) {
        return json({
          error: "환경변수 누락",
          missing: { elevenlabs: !elevenKey, supabase_url: !supabaseUrl, service_role: !serviceKey },
        }, 500, corsHeaders);
      }

      // ElevenLabs Sound Effects
      const sfxResp = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenKey,
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: SFX_DURATION_SECONDS,
          prompt_influence: SFX_PROMPT_INFLUENCE,
        }),
      });
      if (!sfxResp.ok) {
        const t = await sfxResp.text();
        console.error("[generate-scene-sound] ElevenLabs 실패:", t);
        return json({ error: "ElevenLabs API 호출 실패", detail: t.slice(0, 400) }, 502, corsHeaders);
      }
      const audioBytes = new Uint8Array(await sfxResp.arrayBuffer());

      // Supabase Storage 업로드 (service_role 키로)
      const supabase = createClient(supabaseUrl, serviceKey);
      const fileName = `${sceneId}/${crypto.randomUUID()}.mp3`;
      const { error: upErr } = await supabase.storage
        .from("scene_sounds")
        .upload(fileName, audioBytes, { contentType: "audio/mpeg", upsert: true });
      if (upErr) {
        console.error("[generate-scene-sound] Storage 업로드 실패:", upErr);
        return json({ error: "Storage 업로드 실패", detail: upErr.message }, 502, corsHeaders);
      }

      const { data: pub } = supabase.storage.from("scene_sounds").getPublicUrl(fileName);
      return json({ soundUrl: pub.publicUrl, fileName }, 200, corsHeaders);
    }

    return json({ error: "mode 는 'draft' 또는 'generate' 여야 함" }, 400, corsHeaders);
  } catch (e) {
    console.error("[generate-scene-sound] 내부 오류:", e);
    return json({ error: "서버 내부 오류", detail: (e as Error).message }, 500, getCorsHeaders(req));
  }
});
