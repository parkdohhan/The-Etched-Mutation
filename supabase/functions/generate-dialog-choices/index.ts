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

function buildSystemPrompt(memoryTitle: string, motifs: string[]): string {
  const motifsLine = motifs.length ? motifs.join(', ') : '(없음)';
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
5. 톤 균일성: 같은 메모리 안 6 씬은 같은 화자(유령)의 결로 일관.
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

function buildUserPrompt(scenes: SceneRow[]): string {
  const lines: string[] = [];
  lines.push('아래 씬 본문 6개에 대해 byScene 풀을 생성하라. scene id 는 박힌 그대로 응답 키로 사용.');
  lines.push('');
  for (const s of scenes) {
    lines.push(`<scene id="${s.id}" order="${s.scene_order}">`);
    lines.push(s.text || '(본문 비어 있음)');
    lines.push('</scene>');
    lines.push('');
  }
  lines.push('JSON 응답:');
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
  const cache = memMeta.dialog_choices_llm;
  if (cache && cache.byScene && typeof cache.byScene === 'object' && Object.keys(cache.byScene).length > 0) {
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

  // 3. scenes SELECT (씬 6개 본문)
  const scnSel = await admin
    .from('scenes')
    .select('id, scene_order, text')
    .eq('memory_id', memoryId)
    .order('scene_order', { ascending: true });
  if (scnSel.error || !scnSel.data || !scnSel.data.length) {
    console.warn("[gen-dlg] scenes empty memId=" + memoryId.slice(0, 8));
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

  const systemPrompt = buildSystemPrompt(memTitle, motifs);
  const userPrompt = buildUserPrompt(scenes);

  // 5. Haiku 4.5 호출 (JSON 응답 강제)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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
        max_tokens: 4000,
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
    const newMeta = {
      ...memMeta,
      dialog_choices_llm: {
        byScene: parsed.byScene,
        generated_at: new Date().toISOString(),
        prompt_version: PROMPT_VERSION,
        model: data?.model || 'claude-haiku-4-5-20251001',
      },
    };
    const upd = await admin
      .from('memories')
      .update({ meta: newMeta })
      .eq('id', memoryId);
    if (upd.error) {
      console.warn("[gen-dlg] memories UPDATE fail:", upd.error);
      // UPDATE 실패해도 응답은 박음 — 클라이언트가 이번 회차에서 사용 가능
    } else {
      console.log("[gen-dlg] cached memId=" + memoryId.slice(0, 8) + " scenes=" + sceneIds.length);
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
