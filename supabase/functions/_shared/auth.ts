// supabase/functions/_shared/auth.ts
// Edge Function 공통 인증 + CORS 헬퍼

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * 환경변수 기반 CORS 헤더 생성
 * ALLOWED_ORIGINS가 설정되어 있으면 origin 검사, 없으면 * 허용 (개발용)
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOriginsRaw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim())
    : [];

  const origin = req.headers.get("origin") || "";

  let allowedOrigin: string;
  if (allowedOrigins.length === 0) {
    // 개발 모드: 모든 origin 허용
    allowedOrigin = "*";
  } else if (allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  } else {
    // 허용 목록에 없으면 첫 번째 origin 반환 (브라우저가 차단)
    allowedOrigin = allowedOrigins[0];
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/**
 * JWT 검증 — 로그인 필수인 함수용
 * Authorization 헤더에서 JWT를 추출하고 Supabase auth.getUser()로 검증
 * @returns user 객체 또는 null
 */
export async function verifyAuth(
  req: Request
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[Auth] SUPABASE_URL 또는 SUPABASE_ANON_KEY가 설정되지 않았습니다");
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.warn("[Auth] 인증 실패:", error?.message || "사용자 없음");
    return null;
  }

  return { id: user.id, email: user.email };
}

/**
 * service_role_key 검증 — 서버 간 호출 전용
 * Authorization: Bearer <service_role_key> 형태로 전달
 */
export function verifyServiceRole(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    console.error("[Auth] SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다");
    return false;
  }

  return token === serviceRoleKey;
}

/**
 * 401 Unauthorized 응답 생성
 */
export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
  message = "인증이 필요합니다."
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * 403 Forbidden 응답 생성
 */
export function forbiddenResponse(
  corsHeaders: Record<string, string>,
  message = "접근이 거부되었습니다."
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
