import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let supabaseClient = null;
let initStartTime = null;
let isInitializing = false;
let authStateCallback = null;
const MAX_WAIT_TIME = 10000; // 10초

function initSupabaseClient() {
    if (isInitializing) return;

    if (typeof window.supabase !== 'undefined') {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });
            isInitializing = false;
            initStartTime = null;

 // Auth state 변경 listener 등록
            _setupAuthListener();
        } catch (error) {
            console.error('Supabase client creation failed:', error);
            isInitializing = false;
            initStartTime = null;
        }
    } else {
        const now = Date.now();
        if (!initStartTime) {
            initStartTime = now;
            isInitializing = true;
        }

        const elapsed = now - initStartTime;
        if (elapsed >= MAX_WAIT_TIME) {
            console.error('Supabase CDN load timeout exceeded (10초)');
            isInitializing = false;
            initStartTime = null;
            throw new Error('Supabase 클라이언트 초기화 실패: CDN 스크립트가 로드되지 않았습니다.');
        }

        setTimeout(initSupabaseClient, 100);
    }
}

/**
 * Auth state 변경 listener config
 * SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED 벤트 process
 */
function _setupAuthListener() {
    if (!supabaseClient) return;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log(`[Auth] 상태 변경: ${event}`, session?.user?.email || 'no user');

        if (authStateCallback) {
            authStateCallback(event, session);
        }
    });
}

/**
 * Auth state 변경 callback 등록
 * index.js 서 appStore 업데 트 위해 
 * @param {Function} callback - (event, session) => void
 */
export function onAuthStateChange(callback) {
    authStateCallback = callback;
}

/**
 * 현재 session 져오기 (페 지 새 고침 시 restore용)
 * @returns {Promise<{data: {session}, error}>}
 */
export async function getSession() {
    if (!supabaseClient) return { data: { session: null }, error: null };
    return supabaseClient.auth.getSession();
}

/**
 * 현재 session access_token 져오기 (Edge Function call용)
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token || null;
}

export function getSupabaseClient() {
    if (!supabaseClient && !isInitializing) {
 // 아직 init되지 않았으면 시 
        initSupabaseClient();
    }

 // client 없으면 null return ( 러 던지지 않음)
    if (!supabaseClient) {
        console.warn('Supabase 클라이언트가 아직 not initialized');
    }

    return supabaseClient;
}

// Supabase client 준비될 때 wait하 function
export async function waitForSupabaseClient(maxWaitTime = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        const client = getSupabaseClient();
        if (client) {
            return client;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.error('Supabase 클라이언트 초기화 대기 시간 초과');
    return null;
}

// DOMContentLoaded 시 자동 init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
    initSupabaseClient();
}

