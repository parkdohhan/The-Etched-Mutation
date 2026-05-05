// insert-ghost-variant — V2.1 §4 V2-4 후반: anon 플레이어가 ghost_variants 에 speciation row 자동 INSERT.
// V2.1.2 (2026-05-05) 확장: drift 흡수 row 도 허용 — 슬롯 흡수 자생 변주.
//
// 배경:
//   ghost_variants RLS 정책 = admin only INSERT (V2-1 마이그레이션).
//   플레이어 회차 끝 speciation / drift 흡수 발생 시 anon 권한으로는 INSERT 불가.
//   본 Edge function 이 service_role key 로 우회.
//
// 호출 경로:
//   - speciation: opening.js _handleOpeningSubmit 회차 끝 → decideBranch → kind === 'speciation' →
//                 buildSpeciationRow → sb.functions.invoke('insert-ghost-variant', { body: row })
//   - drift 흡수: lumen_dialog_phase1.js _backgroundInsertAbsorbed → SlotAbsorber 성공 시 비동기 호출
//
// 안전:
//   - kind ∈ {'speciation', 'drift'} 만 허용 (admin 시드 경로는 별도)
//   - is_seed === false 강제 (admin 시드와 구분)
//   - memory_id 존재 검증
//   - utterance 1~1000자 검증 (DB CHECK 와 정합)
//   - parent_variant_id 가 같은 memory_id 안 변주인지 검증 (계보 무결성)
//   - V2.1.2 drift 흡수 = 메모리당 흡수 변주 상한 50 (2026-05-05 30→50 갱신, 초과 시 거절)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

interface VariantRow {
  memory_id: string;
  kind: 'speciation' | 'drift';
  parent_variant_id?: string | null;
  emotion_vec?: Record<string, number>;
  extractor_version?: string | null;
  attribution?: string | null;
  core_fear?: string | null;
  modality?: string | null;
  role?: string | null;
  motif_tags?: string[];
  utterance: string;
  pose?: string | null;
  is_seed?: boolean;
  created_by?: string | null;
}

const ABSORB_DRIFT_CAP = 50;  // V2.1.2 — 메모리당 자생 drift 흡수 변주 상한 (2026-05-05 30→50, 5-19 데모 친구 7명·심사위원·영상 회차 누적 흡수)

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

  let body: VariantRow;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Validation ───────────────────────────────────────────
  if (!body.memory_id || typeof body.memory_id !== 'string') {
    return new Response(JSON.stringify({ error: "memory_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (body.kind !== 'speciation' && body.kind !== 'drift') {
    return new Response(JSON.stringify({ error: "kind must be 'speciation' or 'drift' (admin 시드는 별도 경로)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const utterance = String(body.utterance || '').trim();
  if (utterance.length === 0 || utterance.length > 1000) {
    return new Response(JSON.stringify({ error: "utterance must be 1~1000 chars" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Service-role client (RLS 우회) ───────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[insert-ghost-variant] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ error: "service config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ─── parent_variant_id 무결성 (같은 memory 안 변주인지) ─────
  if (body.parent_variant_id) {
    const { data: parent, error: parentErr } = await sb
      .from('ghost_variants')
      .select('id, memory_id')
      .eq('id', body.parent_variant_id)
      .maybeSingle();
    if (parentErr) {
      console.warn("[insert-ghost-variant] parent lookup error:", parentErr);
    } else if (parent && parent.memory_id !== body.memory_id) {
      return new Response(JSON.stringify({
        error: "parent_variant_id is not in the same memory",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // parent 가 없어도 (이미 삭제된 경우 등) 허용 — DB 의 ON DELETE SET NULL 동작.
  }

  // ─── V2.1.2 drift 흡수 상한 (메모리당 자생 drift ≤ 50) ─────
  if (body.kind === 'drift') {
    const { count: absorbCount, error: countErr } = await sb
      .from('ghost_variants')
      .select('id', { count: 'exact', head: true })
      .eq('memory_id', body.memory_id)
      .eq('kind', 'drift')
      .eq('is_seed', false);
    if (countErr) {
      console.warn("[insert-ghost-variant] absorb count error:", countErr);
    } else if (typeof absorbCount === 'number' && absorbCount >= ABSORB_DRIFT_CAP) {
      return new Response(JSON.stringify({
        error: `drift absorb cap reached (${absorbCount}/${ABSORB_DRIFT_CAP}) for this memory`,
        cap_reached: true,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── INSERT ───────────────────────────────────────────────
  const payload = {
    memory_id: body.memory_id,
    kind: body.kind,
    parent_variant_id: body.parent_variant_id || null,
    emotion_vec: body.emotion_vec || {},
    extractor_version: body.extractor_version || null,
    attribution: body.attribution || null,
    core_fear: body.core_fear || null,
    modality: body.modality || null,
    role: body.role || null,
    motif_tags: Array.isArray(body.motif_tags) ? body.motif_tags : [],
    utterance,
    pose: body.pose || null,
    is_seed: false,        // 플레이어 contribution 강제 (admin 시드와 구분)
    created_by: body.created_by || null,
  };

  const { data, error } = await sb
    .from('ghost_variants')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[insert-ghost-variant] insert failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[insert-ghost-variant] ${body.kind} created:`, {
    id: data.id,
    memory_id: data.memory_id,
    parent_variant_id: data.parent_variant_id,
    extractor_version: data.extractor_version,
  });

  return new Response(JSON.stringify({ ok: true, variant: data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
