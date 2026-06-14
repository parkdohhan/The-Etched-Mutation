// generate-dialog-choices — V2.1.2 (δ) dialog_choices LLM 자동 생성 (2026-05-05)
//
// 배경:
//   발자국만 작가 손 dialog_choices 풀 박힘 (씬 6개 × 3 choices + scene_context + ghost_intro).
//   외 8 메모리 비어 있어 V2.1 Phase 1 멀티턴 대화 진입 못 함. 사용자 결정 (5-05) =
//   하이브리드 정공법: 작가 손 박힌 자리는 그대로, 비어 있으면 Haiku 4.5 자동 생성 + DB 캐시.
//   다음 플레이어 = 캐시 사용 (LLM 호출 X). 작가 손 풀과 동일 위계.
//
// 호출 경로:
//   lumen_dialog_phase1.js start() 진입 시 sceneData.meta.dialog_choices 비어 있으면
//     supabase.functions.invoke('generate-dialog-choices', { body: { memoryId, sceneId } })
//   → 서버가 캐시 hit / LLM 호출 결정 → 응답.
//
// 흐름:
//   1. memories SELECT (meta.dialog_choices_llm 캐시 자리 확인)
//      - 캐시 hit: byScene[sceneId] 응답, LLM 호출 X
//   2. 캐시 X: scenes SELECT (memory_id eq, scene_order asc) → 6 씬 본문
//   3. Haiku 4.5 호출 (JSON 응답 강제) — 메모리 통째 byScene 풀 생성
//   4. memories UPDATE meta.dialog_choices_llm = { byScene, generated_at, prompt_version }
//   5. byScene[sceneId] 응답
//
// 안전:
//   - service_role 자리 = memories UPDATE (RLS 우회). 클라이언트가 직접 UPDATE 시 RLS 막힘.
//   - temperature 0 (결정론). max_tokens 4000 (씬 6 × 3 choices ≈ 1500-3000 토큰).
//   - timeout 15초 (씬 6 처리). 실패 시 클라이언트 균일 톤 fallback (안전망).
//   - JSON parse 실패 → null (LLM 가끔 톤 깨짐 자리). 클라이언트 fallback.
//
// 캐시 폐기 자리 (V3): 작가가 admin에서 dialog_choices 박을 때 meta.dialog_choices_llm 폐기.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS 헤더 헬퍼 — _shared/auth.ts 와 동일 패턴 (deploy 시 의존 자리 inline 박음).
function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim())
    : [];
  const origin = req.headers.get("origin") || "";
  let allowedOrigin: string;
  if (allowedOrigins.length === 0) {
    allowedOrigin = "*";
  } else if (allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else {
    allowedOrigin = allowedOrigins[0];
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface GenerateRequest {
  memoryId: string;
  sceneId?: string;  // 응답에 sceneId 자리 포함 (선택). 없으면 byScene 통째 반환.
  lang?: 'ko' | 'en';  // 생성 언어. 캐시도 언어별로 구분.
  oneScene?: boolean;  // V2.1.2 (δ-2, 2026-05-06): 그 씬 1개만 처리 — 응답 빠름 (~3-5초).
                       // 클라이언트 자리 첫 씬 자리 진입 시 박음. 백그라운드 자리 통째 호출 자리는 별도.
                       // oneScene=true 시 DB UPDATE 자리 X (백그라운드 자리에 맡김, race 회피).
}

interface SceneRow {
  id: string;
  scene_order: number;
  text: string;
}

interface DialogChoice {
  label: string;
  ghost_reply: string[];
  free_dialog_open: string[];
}

interface SceneDialogChoices {
  scene_context: string[];
  ghost_intro: string[];
  choices: DialogChoice[];
}

const PROMPT_VERSION = 'gen_dialog_v1_haiku45_2026_05_05';

function buildSystemPrompt(memoryTitle: string, motifs: string[], lang: 'ko' | 'en'): string {
  const motifsLine = motifs.length ? motifs.join(', ') : (lang === 'en' ? '(none)' : '(없음)');
  if (lang === 'en') {
    return `You are an assistant to the content author of the TEM (The Etched Mutation) memory "${memoryTitle}". Generate the *ghost multi-turn dialogue pool* that a player entering this memory will meet.

Rules:
1. Tone = first person, past tense. Quiet self-recollection. Short. No analysis, advice, evaluation, or judgment.
2. Use only sentences / motifs / emotions drawn directly from the memory text. No new information.
3. Memory motifs: ${motifsLine}.
4. For each scene, produce:
   - scene_context: the first 5-6 sentences of the scene text. A breathing space. Quoting the text directly is fine.
   - ghost_intro: 0-1 sentences (usually an empty array []). A short recollection anchor.
   - choices: exactly 3. Each choice:
     - label: a short question or response, 3-8 words.
     - ghost_reply: a 1-2 sentence reply (array).
     - free_dialog_open: a 1-2 sentence opening question for free dialogue (array).
5. Tone consistency: every scene in one memory speaks in the voice of the same ghost.
6. Output = JSON only. No markdown, comments, or explanation. Write all content in English.

Output JSON format:
{
  "byScene": {
    "<scene-uuid-1>": {
      "scene_context": ["Sentence 1.", "Sentence 2."],
      "ghost_intro": [],
      "choices": [
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] },
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] },
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] }
      ]
    }
  }
}`;
  }
  return `당신은 TEM(The Etched Mutation) 메모리 콘텐츠 작가의 보조. "${memoryTitle}" 메모리에 들어간 플레이어가 마주칠 *유령 멀티턴 대화 풀* 을 생성한다.

규칙:
1. 톤 = "~었어" 체. 자기 회상. 짧게. 분석/조언/평가/판단 X.
2. 메모리 본문에서 직접 추출한 *문장/모티프/감정* 만 사용. 새 정보 X.
3. 메모리 모티프: ${motifsLine}.
4. 한 씬 당 박을 자리:
   - scene_context: 씬 본문 첫 5~6 문장. 호흡 자리. 본문 그대로 인용 OK.
   - ghost_intro: 0~1 문장 (보통 빈 배열 []). 짧은 회상 닻.
   - choices: 정확히 3개. 각 choice:
     - label: 5~12자 짧은 질문/응답.
     - ghost_reply: 1~2 문장 응답 (배열).
     - free_dialog_open: 1~2 문장 자유대화 첫 질문 (배열).
5. 톤 균일성: 같은 메모리 안 모든 씬은 같은 화자(유령)의 결로 일관.
6. 출력 = JSON 만. 마크다운/주석/설명 X.

출력 JSON 형식:
{
  "byScene": {
    "<scene-uuid-1>": {
      "scene_context": ["문장1.", "문장2.", ...],
      "ghost_intro": [],
      "choices": [
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] },
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] },
        { "label": "...", "ghost_reply": ["..."], "free_dialog_open": ["..."] }
      ]
    },
    ...
  }
}`;
}

function buildUserPrompt(scenes: SceneRow[], lang: 'ko' | 'en'): string {
  const lines: string[] = [];
  const n = scenes.length;
  lines.push(lang === 'en'
    ? 'Generate the byScene pool for the ' + n + ' scene texts below. Use each scene id exactly as given as the response key.'
    : '아래 씬 본문 ' + n + '개에 대해 byScene 풀을 생성하라. scene id 는 박힌 그대로 응답 키로 사용.');
  lines.push('');
  for (const s of scenes) {
    lines.push(`<scene id="${s.id}" order="${s.scene_order}">`);
    lines.push(s.text || (lang === 'en' ? '(scene text empty)' : '(본문 비어 있음)'));
    lines.push('</scene>');
    lines.push('');
  }
  lines.push(lang === 'en' ? 'JSON response:' : 'JSON 응답:');
  return lines.join('\n');
}

function validateByScene(byScene: any, sceneIds: string[]): boolean {
  if (!byScene || typeof byScene !== 'object') return false;
  for (const sid of sceneIds) {
    const dlg = byScene[sid];
    if (!dlg || typeof dlg !== 'object') return false;
    if (!Array.isArray(dlg.scene_context)) return false;
    if (!Array.isArray(dlg.ghost_intro)) return false;
    if (!Array.isArray(dlg.choices) || dlg.choices.length === 0) return false;
    for (const c of dlg.choices) {
      if (!c || typeof c.label !== 'string') return false;
      if (!Array.isArray(c.ghost_reply)) return false;
      if (!Array.isArray(c.free_dialog_open)) return false;
    }
  }
  return true;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const memoryId = String(body.memoryId || '').trim();
  if (!memoryId) {
    return new Response(JSON.stringify({ error: "memoryId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const lang: 'ko' | 'en' = body.lang === 'en' ? 'en' : 'ko';

  // service_role 자리 — RLS 우회 (memories UPDATE 박는 자리)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[gen-dlg] SUPABASE_URL or SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // 1. memories SELECT
  const memSel = await admin
    .from('memories')
    .select('id, title, meta')
    .eq('id', memoryId)
    .single();
  if (memSel.error || !memSel.data) {
    console.warn("[gen-dlg] memory not found:", memoryId, memSel.error);
    return new Response(JSON.stringify({ error: "Memory not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const memMeta = (memSel.data.meta || {}) as Record<string, any>;
  const memTitle = String(memSel.data.title || '');
  const motifs: string[] = Array.isArray(memMeta.motif_tags) ? memMeta.motif_tags : [];

  // 2. 캐시 hit 자리 — meta.dialog_choices_llm 박혀 있으면 LLM 호출 X
  // 캐시는 언어별로 구분 — cache.lang 이 요청 언어와 다르면 miss 처리 (재생성).
  // lang 필드 없는 옛 캐시는 cache.lang===undefined → 항상 miss → 자동 무효화.
  const cache = memMeta.dialog_choices_llm;
  if (cache && cache.lang === lang && cache.byScene && typeof cache.byScene === 'object' && Object.keys(cache.byScene).length > 0) {
    const sceneId = String(body.sceneId || '');
    const dlg = sceneId ? cache.byScene[sceneId] : null;
    console.log("[gen-dlg] cache hit memId=" + memoryId.slice(0, 8));
    return new Response(JSON.stringify({
      ok: true,
      cached: true,
      dialog_choices: dlg || null,
      byScene: cache.byScene,
      generated_at: cache.generated_at || null,
      prompt_version: cache.prompt_version || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. scenes SELECT
  // oneScene=true 박혀 있으면 *그 씬 1개만* SELECT (응답 자리 빠름).
  // 단 메모리 톤 자리 박는 자리 모티프 자리 (memMeta.motif_tags) 로 보강 자리.
  const oneScene = body.oneScene === true && body.sceneId;
  let scnQuery = admin
    .from('scenes')
    .select('id, scene_order, text')
    .eq('memory_id', memoryId);
  if (oneScene) {
    scnQuery = scnQuery.eq('id', body.sceneId as string);
  } else {
    scnQuery = scnQuery.order('scene_order', { ascending: true });
  }
  const scnSel = await scnQuery;
  if (scnSel.error || !scnSel.data || !scnSel.data.length) {
    console.warn("[gen-dlg] scenes empty memId=" + memoryId.slice(0, 8) + (oneScene ? " (oneScene)" : ""));
    return new Response(JSON.stringify({ error: "Scenes empty" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const scenes = scnSel.data as SceneRow[];
  const sceneIds = scenes.map(s => s.id);

  // 4. Anthropic API key
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) {
    console.error("[gen-dlg] ANTHROPIC_API_KEY missing");
    return new Response(JSON.stringify({ error: "API key missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = buildSystemPrompt(memTitle, motifs, lang);
  const userPrompt = buildUserPrompt(scenes, lang);

  // 5. Haiku 4.5 호출 (JSON 응답 강제)
  // oneScene=true (씬 1개) → 짧은 응답 (max_tokens 1500, timeout 8초)
  // 통째 (씬 N개) → 긴 응답 (max_tokens 8000, timeout 45초)
  const maxTokens = oneScene ? 1500 : 8000;
  const timeoutMs = oneScene ? 8000 : 45000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error("[gen-dlg] Anthropic API error:", errData);
      return new Response(JSON.stringify({ error: "API error", details: errData }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const rawText = (data?.content?.[0]?.text || '').trim();

    // JSON parse — 마크다운 ```json 자리 자르기 (간혹 박힘)
    let jsonStr = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.warn("[gen-dlg] JSON parse fail:", rawText.slice(0, 200));
      return new Response(JSON.stringify({
        ok: false,
        reason: "json_parse_fail",
        raw: rawText.slice(0, 500),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!validateByScene(parsed.byScene, sceneIds)) {
      console.warn("[gen-dlg] invalid byScene shape");
      return new Response(JSON.stringify({
        ok: false,
        reason: "invalid_shape",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. memories UPDATE meta.dialog_choices_llm
    // oneScene=true 박혀 있으면 DB UPDATE 자리 X — 백그라운드 자리 통째 호출 자리에 맡김.
    // race condition 회피 자리 (두 호출 자리 동시에 같은 row 자리 UPDATE 자리 막음).
    const newMeta = {
      ...memMeta,
      dialog_choices_llm: {
        byScene: parsed.byScene,
        lang: lang,
        generated_at: new Date().toISOString(),
        prompt_version: PROMPT_VERSION,
        model: data?.model || 'claude-haiku-4-5-20251001',
      },
    };
    if (!oneScene) {
      const upd = await admin
        .from('memories')
        .update({ meta: newMeta })
        .eq('id', memoryId);
      if (upd.error) {
        console.warn("[gen-dlg] memories UPDATE fail:", upd.error);
      } else {
        console.log("[gen-dlg] cached memId=" + memoryId.slice(0, 8) + " scenes=" + sceneIds.length);
      }
    } else {
      console.log("[gen-dlg] oneScene 응답 memId=" + memoryId.slice(0, 8) + " sceneId=" + String(body.sceneId || '').slice(0, 8) + " (DB UPDATE skip)");
    }

    const sceneId = String(body.sceneId || '');
    const dlgForScene = sceneId ? parsed.byScene[sceneId] : null;

    return new Response(JSON.stringify({
      ok: true,
      cached: false,
      dialog_choices: dlgForScene,
      byScene: parsed.byScene,
      generated_at: newMeta.dialog_choices_llm.generated_at,
      prompt_version: PROMPT_VERSION,
      usage: data?.usage || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn("[gen-dlg] timeout 15s memId=" + memoryId.slice(0, 8));
      return new Response(JSON.stringify({ ok: false, reason: "timeout" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[gen-dlg] exception:", err);
    return new Response(JSON.stringify({ ok: false, reason: "exception", message: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
