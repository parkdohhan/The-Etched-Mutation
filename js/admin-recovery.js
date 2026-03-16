import { getSupabaseClient } from './lib/supabaseClient.js';
import { loadAdminMemories } from './lib/storage.js';
import { recoverScenesFromBackup } from './lib/repo.js';

function checkLocalStorage() {
    const resultDiv = document.getElementById('localStorageResult');
    const memories = loadAdminMemories();
    
    if (!memories || memories.length === 0) {
        resultDiv.innerHTML = '<p class="error">No backup data found in localStorage.</p>';
        return;
    }

    try {
        const testMemory = memories.find(m => m.title && m.title.includes('Test'));
        
        resultDiv.innerHTML = `
            <p class="success">✅ localStorage backup found!</p>
            <p>Total ${memories.length} memories</p>
            ${testMemory ? `<p class="success">✅ Test-related memory found: "${testMemory.title}"</p>
            <p>Scene count: ${testMemory.scenes ? testMemory.scenes.length : 0}</p>
            <details>
                <summary>View detailed data</summary>
                <pre>${JSON.stringify(testMemory, null, 2)}</pre>
            </details>` : '<p class="error">No test-related memory found.</p>'}
            <details>
                <summary>All memories</summary>
                <pre>${JSON.stringify(memories.map(m => ({ title: m.title, code: m.code, scenesCount: m.scenes?.length || 0 })), null, 2)}</pre>
            </details>
        `;
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">Data parsing error: ${e.message}</p>`;
    }
}

async function checkSupabase() {
    const resultDiv = document.getElementById('supabaseResult');
    const supabaseClient = await getSupabaseClient();
    
    if (!supabaseClient) {
        resultDiv.innerHTML = '<p class="error">Supabase client not initialized.</p>';
        return;
    }

    try {
 // memory check
        const { data: memories, error: memError } = await supabaseClient
            .from('memories')
            .select('*')
            .order('id', { ascending: true });

        if (memError) throw memError;

        const testMemory = memories.find(m => m.title && m.title.includes('Test'));
        
        if (testMemory) {
 // 해당 memory scenes check
            const { data: scenes, error: scenesError } = await supabaseClient
                .from('scenes')
                .select('*')
                .eq('memory_id', testMemory.id)
                .order('scene_order', { ascending: true });

            if (scenesError) throw scenesError;

            resultDiv.innerHTML = `
                <p class="success">✅ Test memory found in Supabase!</p>
                <p>Memory ID: ${testMemory.id}</p>
                <p>Title: ${testMemory.title}</p>
                <p>Code: ${testMemory.code}</p>
                <p class="${scenes && scenes.length > 0 ? 'success' : 'error'}">Scene count: ${scenes ? scenes.length : 0}</p>
                ${scenes && scenes.length === 0 ? '<p class="error">⚠️ All scenes have been deleted!</p>' : ''}
                ${scenes && scenes.length > 0 ? `
                    <details>
                        <summary>View scene list</summary>
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
                <p class="error">No test-related memory found in Supabase.</p>
                <p>Total memories: ${memories.length}</p>
                <details>
                    <summary>All memories</summary>
                    <pre>${JSON.stringify(memories.map(m => ({ id: m.id, title: m.title, code: m.code })), null, 2)}</pre>
                </details>
            `;
        }
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">Error occurred: ${e.message}</p>`;
    }
}

async function recoverFromLocalStorage() {
    const resultDiv = document.getElementById('recoveryResult');
    const memories = loadAdminMemories();
    
    if (!memories || memories.length === 0) {
        resultDiv.innerHTML = '<p class="error">No backup data found in localStorage.</p>';
        return;
    }

    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
        resultDiv.innerHTML = '<p class="error">Supabase client not initialized.</p>';
        return;
    }

    try {
        const testMemory = memories.find(m => m.title && m.title.includes('Test'));
        
        if (!testMemory) {
            resultDiv.innerHTML = '<p class="error">No test-related memory found.</p>';
            return;
        }

        if (!testMemory.scenes || testMemory.scenes.length === 0) {
            resultDiv.innerHTML = '<p class="error">No scenes to recover.</p>';
            return;
        }

        resultDiv.innerHTML = '<p class="info">Recovering... (scene count: ' + testMemory.scenes.length + ')</p>';

 // repo.js recoverScenesFromBackup call
        await recoverScenesFromBackup(supabaseClient, testMemory.code, testMemory.scenes);

        resultDiv.innerHTML = `
            <p class="success">✅ Recovery complete!</p>
            <p>Succeeded: ${testMemory.scenes.length} scenes</p>
            <p>Please refresh admin.html to verify.</p>
        `;
    } catch (e) {
        resultDiv.innerHTML = `<p class="error">Error during recovery: ${e.message}</p>`;
    }
}

// global 스코프 function 노출 (onclick 속성 서 위해)
window.checkLocalStorage = checkLocalStorage;
window.checkSupabase = checkSupabase;
window.recoverFromLocalStorage = recoverFromLocalStorage;
