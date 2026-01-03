import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let supabaseClient = null;
let initStartTime = null;
let isInitializing = false;
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
        } catch (error) {
            console.error('Supabase 클라이언트 생성 실패:', error);
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
            console.error('Supabase CDN 로드 대기 시간 초과 (10초)');
            isInitializing = false;
            initStartTime = null;
            throw new Error('Supabase 클라이언트 초기화 실패: CDN 스크립트가 로드되지 않았습니다.');
        }
        
        setTimeout(initSupabaseClient, 100);
    }
}

export function getSupabaseClient() {
    if (!supabaseClient && !isInitializing) {
        // 아직 초기화되지 않았으면 시도
        initSupabaseClient();
    }
    
    // 클라이언트가 없으면 null 반환 (에러를 던지지 않음)
    if (!supabaseClient) {
        console.warn('Supabase 클라이언트가 아직 초기화되지 않았습니다');
    }
    
    return supabaseClient;
}

// Supabase 클라이언트가 준비될 때까지 대기하는 함수
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

// DOMContentLoaded 시 자동 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
    initSupabaseClient();
}

