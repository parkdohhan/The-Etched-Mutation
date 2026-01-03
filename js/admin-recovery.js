import { getSupabaseClient } from './lib/supabaseClient.js';
import { loadAdminMemories } from './lib/storage.js';
import { recoverScenesFromBackup } from './lib/repo.js';

function checkLocalStorage() {
    const resultDiv = document.getElementById('localStorageResult');
    const memories = loadAdminMemories();
    
    if (!memories || memories.length === 0) {
        resultDiv.innerHTML = '<p class="error">localStorage에 백업 데이터가 없습니다.</p>';
        return;
    }

    try {
        const testMemory = memories.find(m => m.title && m.title.includes('테스트'));
        
        resultDiv.innerHTML = `
            <p class="success">✅ localStorage 백업 발견!</p>
            <p>총 ${memories.length}개의 메모리</p>
            ${testMemory ? `<p class="success">✅ "테스트" 관련 메모리 발견: "${testMemory.title}"</p>
            <p>장면 개수: ${testMemory.scenes ? testMemory.scenes.length : 0}개</p>
            <details>
                <summary>상세 데이터 보기</summary>
                <pre>${JSON.stringify(testMemory, null, 2)}</pre>
            </details>` : '<p class="error">"테스트" 관련 메모리를 찾을 수 없습니다.</p>'}
            <details>
                <summary>전체 메모리 목록</summary>
                <pre>${JSON.stringify(memories.map(m => ({ title: m.title, code: m.code, scenesCount: m.scenes?.length || 0 })), null, 2)}</pre>
            </details>
        `;
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">데이터 파싱 오류: ${e.message}</p>`;
    }
}

async function checkSupabase() {
    const resultDiv = document.getElementById('supabaseResult');
    const supabaseClient = await getSupabaseClient();
    
    if (!supabaseClient) {
        resultDiv.innerHTML = '<p class="error">Supabase 클라이언트가 초기화되지 않았습니다.</p>';
        return;
    }

    try {
        // 메모리 확인
        const { data: memories, error: memError } = await supabaseClient
            .from('memories')
            .select('*')
            .order('id', { ascending: true });

        if (memError) throw memError;

        const testMemory = memories.find(m => m.title && m.title.includes('테스트'));
        
        if (testMemory) {
            // 해당 메모리의 scenes 확인
            const { data: scenes, error: scenesError } = await supabaseClient
                .from('scenes')
                .select('*')
                .eq('memory_id', testMemory.id)
                .order('scene_order', { ascending: true });

            if (scenesError) throw scenesError;

            resultDiv.innerHTML = `
                <p class="success">✅ Supabase에서 "테스트" 메모리 발견!</p>
                <p>메모리 ID: ${testMemory.id}</p>
                <p>제목: ${testMemory.title}</p>
                <p>코드: ${testMemory.code}</p>
                <p class="${scenes && scenes.length > 0 ? 'success' : 'error'}">장면 개수: ${scenes ? scenes.length : 0}개</p>
                ${scenes && scenes.length === 0 ? '<p class="error">⚠️ 장면이 모두 삭제되었습니다!</p>' : ''}
                ${scenes && scenes.length > 0 ? `
                    <details>
                        <summary>장면 목록 보기</summary>
                        <pre>${JSON.stringify(scenes.map(s => ({ 
                            id: s.id, 
                            scene_order: s.scene_order, 
                            text: s.text?.substring(0, 50) + '...',
                            scene_type: s.scene_type 
                        })), null, 2)}</pre>
                    </details>
                ` : ''}
            `;
        } else {
            resultDiv.innerHTML = `
                <p class="error">Supabase에서 "테스트" 관련 메모리를 찾을 수 없습니다.</p>
                <p>전체 메모리 개수: ${memories.length}개</p>
                <details>
                    <summary>전체 메모리 목록</summary>
                    <pre>${JSON.stringify(memories.map(m => ({ id: m.id, title: m.title, code: m.code })), null, 2)}</pre>
                </details>
            `;
        }
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">오류 발생: ${e.message}</p>`;
    }
}

async function recoverFromLocalStorage() {
    const resultDiv = document.getElementById('recoveryResult');
    const memories = loadAdminMemories();
    
    if (!memories || memories.length === 0) {
        resultDiv.innerHTML = '<p class="error">localStorage에 백업 데이터가 없습니다.</p>';
        return;
    }

    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
        resultDiv.innerHTML = '<p class="error">Supabase 클라이언트가 초기화되지 않았습니다.</p>';
        return;
    }

    try {
        const testMemory = memories.find(m => m.title && m.title.includes('테스트'));
        
        if (!testMemory) {
            resultDiv.innerHTML = '<p class="error">"테스트" 관련 메모리를 찾을 수 없습니다.</p>';
            return;
        }

        if (!testMemory.scenes || testMemory.scenes.length === 0) {
            resultDiv.innerHTML = '<p class="error">복구할 장면이 없습니다.</p>';
            return;
        }

        resultDiv.innerHTML = '<p class="info">복구 중... (장면 개수: ' + testMemory.scenes.length + '개)</p>';

        // repo.js의 recoverScenesFromBackup 호출
        await recoverScenesFromBackup(supabaseClient, testMemory.code, testMemory.scenes);

        resultDiv.innerHTML = `
            <p class="success">✅ 복구 완료!</p>
            <p>성공: ${testMemory.scenes.length}개</p>
            <p>이제 admin.html을 새로고침하여 확인하세요.</p>
        `;
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">복구 중 오류 발생: ${e.message}</p>`;
    }
}

// 전역 스코프에 함수 노출 (onclick 속성에서 사용하기 위해)
window.checkLocalStorage = checkLocalStorage;
window.checkSupabase = checkSupabase;
window.recoverFromLocalStorage = recoverFromLocalStorage;
