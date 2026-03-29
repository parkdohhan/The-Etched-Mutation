// Supabase config — Vite dev uses import.meta.env, production static uses fallback
const _env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const SUPABASE_URL = _env.VITE_SUPABASE_URL || 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
export const SUPABASE_ANON_KEY = _env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';

export const SUPABASE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/claude-scene`;
