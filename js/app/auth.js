import { appStore } from './appStore.js';
import { showNotification, showNpcDialogue } from '../ui/notify.js';
/**
 * Auth Module — login, signup, OAuth, mypage, session history, notes.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   appStore, showNotification, window.saveMemory,
 *   window.handleCrisis
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { networkService } from '../services/NetworkService.js';
import { uiManager } from '../ui/UIManager.js';
import { detectCrisis } from '../safety.js';

// === Module State ===
let pendingSaveAction = null;
let supabaseClient = null;

function getPendingSaveAction() { return pendingSaveAction; }
function setPendingSaveAction(val) { pendingSaveAction = val; }

// ─────────────────────────────────────
// === Core Auth Functions ===
// ─────────────────────────────────────

function openMypage() { const state = appStore.getState(); if (!state.isLoggedIn) { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() } else { showMypage() } }
async function showMypage() {
    const state = appStore.getState();
    if (!state.isLoggedIn) return;
    if (pendingSaveAction === 'save') return;

    uiManager.showMypage(state.currentUser);
    await loadMypageDataFromDB();
}
function closeMypage() {
    uiManager.closeMypage();
}

/** Google OAuth redirect: close modal, navigate to mypage (same as email login) */
function tryOAuthPostLoginNavigation() {
    if (!window.__oauthPendingMypage) return;
    const state = appStore.getState();
    if (!state.isLoggedIn || !state.currentUser) return;
    window.__oauthPendingMypage = false;
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.classList.remove('active');
        loginModal.style.display = 'none';
    }
    const signupModal = document.getElementById('signupModal');
    if (signupModal) {
        signupModal.classList.remove('active');
        signupModal.style.display = 'none';
    }
    showNotification('Signed in successfully');
    if (pendingSaveAction === 'save') {
        pendingSaveAction = null;
        setTimeout(() => { window.saveMemory(); }, 300);
    } else {
        showMypage();
    }
}
async function handleLogin() { const email = document.getElementById('loginUsername').value.trim(); const password = document.getElementById('loginPassword').value.trim(); if (!email || !password) { showNotification('Please enter email and password'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password }); if (error) { showNotification('Sign in failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: data.user.user_metadata?.username || email.split('@')[0], email: email, joinDate: new Date(data.user.created_at).toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; showNotification('Signed in successfully'); document.dispatchEvent(new CustomEvent('tem:login-success')); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { window.saveMemory() }, 300) } else { showMypage() } }
function closeLogin() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; pendingSaveAction = null }
function switchToSignup() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.add('active'); signupModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('signupUsername').focus() }
function switchToLogin() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() }
async function handleSignup() { const username = document.getElementById('signupUsername').value.trim(); const email = document.getElementById('signupEmail').value.trim(); const password = document.getElementById('signupPassword').value.trim(); const passwordConfirm = document.getElementById('signupPasswordConfirm').value.trim(); if (!username || !email || !password || !passwordConfirm) { showNotification('Please fill in all fields'); return } if (password !== passwordConfirm) { showNotification('Passwords do not match'); return } if (password.length < 6) { showNotification('Password must be at least 6 characters'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { username: username } } }); if (error) { showNotification('Sign up failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: username, email: email, joinDate: new Date().toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = ''; showNotification('Sign up complete'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { window.saveMemory() }, 300) } else { showMypage() } }
function closeSignup() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = '' }
async function handleSocialLogin(provider) { if (provider === 'google') { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const redirectTo = `${window.location.origin}${window.location.pathname || '/'}`; const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }); if (error) { showNotification('Google sign in failed: ' + error.message) } } else { showNotification('Coming soon') } }
async function handleLogout() { if (confirm('Are you sure you want to sign out?')) { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } await supabaseClient.auth.signOut(); appStore.setState({ isLoggedIn: false, currentUser: null }); closeMypage(); showNotification('Signed out successfully') } }
function updateUserStats(type, value = 1) { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const currentUser = state.currentUser; if (type === 'liveSession') { currentUser.liveSessions = (currentUser.liveSessions || 0) + value } else if (type === 'memory') { if (!currentUser.visitedMemories) currentUser.visitedMemories = []; if (!currentUser.visitedMemories.includes(value)) { currentUser.visitedMemories.push(value); currentUser.memories = (currentUser.memories || 0) + 1 } } else if (type === 'interpretation') { currentUser.interpretations = (currentUser.interpretations || 0) + value } appStore.setState({ currentUser: currentUser }); if (document.getElementById('mypageScreen') && document.getElementById('mypageScreen').classList.contains('active')) { showMypage() } }

// ─────────────────────────────────────
// === Mypage Data Loading / Rendering ===
// ─────────────────────────────────────

async function loadMypageDataFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) { renderSessionHistoryEmpty(); renderMyMemoriesEmpty(); return } try { const [sessionsResult, memoriesResult, statsResult] = await Promise.all([loadSessionHistoryFromDB(), loadMyMemoriesFromDB(), loadUserStatsFromDB()]); renderSessionHistoryList(sessionsResult); renderMyMemoriesList(memoriesResult); updateMypageStats(statsResult); await renderReceivedNotes() } catch (e) { console.error('loadMypageDataFromDB error:', e); renderSessionHistoryEmpty(); renderMyMemoriesEmpty() } }
async function loadSessionHistoryFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) return []; try { const result = await networkService.getUserSessionHistory(state.currentUser.id, 50); if (!result.ok) return []; return result.data || [] } catch (e) { console.error('loadSessionHistoryFromDB error:', e); return [] } }
async function loadMyMemoriesFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return [];
    const userId = state.currentUser.id;
    try {
        const client = networkService._getClient ? networkService._getClient() : null;
        const results = await Promise.allSettled([
            // 1) live_sessions path (live records)
            (async () => {
                const sessionIdsResult = await networkService.getUserSessionIds(userId);
                if (sessionIdsResult.ok && sessionIdsResult.data && sessionIdsResult.data.length > 0) {
                    const ids = sessionIdsResult.data.map(s => s.id);
                    const memoriesResult = await networkService.getMemoriesBySessionIds(ids, 50);
                    return (memoriesResult.ok && memoriesResult.data) ? memoriesResult.data : [];
                }
                return [];
            })(),
            // 2) curator_id path (Record/confession memories)
            (async () => {
                if (!client) return [];
                const { data, error } = await client
                    .from('memories')
                    .select('*')
                    .eq('curator_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                return (!error && data) ? data : [];
            })(),
        ]);
        const liveMemories = results[0].status === 'fulfilled' ? results[0].value : [];
        const curatedMemories = results[1].status === 'fulfilled' ? results[1].value : [];
        const seen = new Set();
        const merged = [];
        for (const m of [...liveMemories, ...curatedMemories]) {
            if (m?.id && !seen.has(m.id)) { seen.add(m.id); merged.push(m); }
        }
        return merged;
    } catch (e) {
        console.error('loadMyMemoriesFromDB error:', e);
        return [];
    }
}
async function loadUserStatsFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return { sessions: 0, memories: 0, interpretations: 0 };
    const userId = state.currentUser.id;
    const client = networkService._getClient ? networkService._getClient() : null;
    try {
        const [sessionsResult, playsCountResult, curatedMemoriesResult] = await Promise.allSettled([
            networkService.getUserSessionIds(userId),
            (async () => {
                if (!client) return 0;
                const { count, error } = await client
                    .from('plays')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId);
                return (!error && count != null) ? count : 0;
            })(),
            (async () => {
                if (!client) return 0;
                const { count, error } = await client
                    .from('memories')
                    .select('id', { count: 'exact', head: true })
                    .eq('curator_id', userId);
                return (!error && count != null) ? count : 0;
            })(),
        ]);
        const sessionIds = (sessionsResult.status === 'fulfilled' && sessionsResult.value.ok && sessionsResult.value.data)
            ? sessionsResult.value.data.map(s => s.id) : [];
        const playsCount = playsCountResult.status === 'fulfilled' ? playsCountResult.value : 0;
        const curatedCount = curatedMemoriesResult.status === 'fulfilled' ? curatedMemoriesResult.value : 0;
        let liveMemoriesCount = 0;
        if (sessionIds.length > 0) {
            const memoriesResult = await networkService.getMemoryIdsBySessionIds(sessionIds);
            liveMemoriesCount = (memoriesResult.ok && memoriesResult.data) ? memoriesResult.data.length : 0;
        }
        return {
            sessions: sessionIds.length,
            memories: Math.max(liveMemoriesCount, curatedCount),
            interpretations: playsCount,
        };
    } catch (e) {
        console.error('loadUserStatsFromDB error:', e);
        return { sessions: 0, memories: 0, interpretations: 0 };
    }
}
function renderSessionHistoryEmpty() { const listEl = document.getElementById('sessionHistoryList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No saved sessions.</div>' }
function renderMyMemoriesEmpty() { const listEl = document.getElementById('myMemoriesList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No shared memories yet.</div>' }
function renderSessionHistoryList(sessions) { const listEl = document.getElementById('sessionHistoryList'); if (!listEl) { return } if (!sessions || sessions.length === 0) { renderSessionHistoryEmpty(); return } const currentUser = appStore.getState().currentUser; listEl.innerHTML = ''; sessions.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.style.borderRadius = '4px'; sessionItem.style.cursor = 'pointer'; sessionItem.style.transition = 'all .3s'; sessionItem.onmouseenter = () => { sessionItem.style.borderColor = 'var(--accent-memory)'; sessionItem.style.transform = 'translateX(4px)' }; sessionItem.onmouseleave = () => { sessionItem.style.borderColor = 'rgba(196,168,130,.1)'; sessionItem.style.transform = 'translateX(0)' }; const date = session.created_at ? new Date(session.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = session.narrator_id === currentUser?.id ? '화자' : session.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = session.ended_at ? 'Complete' : '진행중'; const alignment = session.alignment ? Math.round(session.alignment * 100) + '%' : '0%'; const fate = session.memory_fate === 'preserve' ? 'Preserve' : session.memory_fate === 'dilute' ? 'Natural Dissolution' : session.memory_fate === 'anonymous' ? 'Full Anonymity' : '—'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${date}</strong> <span style="color:var(--accent-memory);font-size:.75rem">[${session.session_code || '—'}]</span></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">Role: ${role} | Status: ${status}<br>Alignment: ${alignment} | Fate: ${fate}</div>`; sessionItem.onclick = () => { showSessionDetail(session.id) }; listEl.appendChild(sessionItem) }) }
function renderMyMemoriesList(memories) { const listEl = document.getElementById('myMemoriesList'); if (!listEl) { return } if (!memories || memories.length === 0) { renderMyMemoriesEmpty(); return } listEl.innerHTML = ''; memories.forEach(memory => { const memoryItem = document.createElement('div'); memoryItem.style.padding = '.8rem'; memoryItem.style.marginBottom = '.5rem'; memoryItem.style.background = 'var(--bg-surface)'; memoryItem.style.border = '1px solid rgba(196,168,130,.1)'; memoryItem.style.borderRadius = '4px'; memoryItem.style.cursor = 'pointer'; const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; const title = memory.title || memory.code || 'Untitled'; const dilution = memory.dilution !== undefined ? memory.dilution + '%' : '—'; const fate = memory.memory_fate === 'preserve' ? 'Preserve' : memory.memory_fate === 'dilute' ? 'Natural Dissolution' : memory.memory_fate === 'anonymous' ? 'Full Anonymity' : '—'; memoryItem.innerHTML = `<div style="font-size:.9rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${title}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">${date} | 희석도: ${dilution} | Fate: ${fate}</div>`; memoryItem.onclick = () => { closeMypage(); viewMemoryFromArchive(memory.id) }; listEl.appendChild(memoryItem) }) }
function updateMypageStats(stats) { document.getElementById('displayMemories').textContent = stats.memories || 0; document.getElementById('displayInterpretations').textContent = stats.interpretations || 0 }
// True ending note UI
function showTrueEndingNoteUI(authorNote, authorId, memoryId) { const endContent = document.getElementById('endContent'); if (!endContent) return; const endButtons = endContent.querySelector('.end-buttons'); if (!endButtons) return; const existingNoteSection = endContent.querySelector('.note-section'); if (existingNoteSection) existingNoteSection.remove(); const noteSection = document.createElement('div'); noteSection.className = 'note-section'; noteSection.innerHTML = (authorNote ? `<div class="author-note-box"><p class="note-label">Note from the experiencer</p><p class="note-content">${authorNote}</p></div>` : '') + `<div class="reply-section"><p class="reply-label">You can leave a message for the memory author</p><textarea class="reply-input" id="replyInput" maxlength="100" placeholder="Please write within 100 characters..."></textarea><div class="reply-counter"><span id="replyCount">0</span>/100</div><div class="reply-buttons"><button class="reply-submit-btn" id="replySubmitBtn">Send Note</button><button class="reply-skip-btn" id="replySkipBtn">건너뛰기</button></div></div>`; endContent.insertBefore(noteSection, endButtons); const replyInput = document.getElementById('replyInput'); const replyCount = document.getElementById('replyCount'); if (replyInput && replyCount) { replyInput.addEventListener('input', () => { replyCount.textContent = replyInput.value.length }) } const replySubmitBtn = document.getElementById('replySubmitBtn'); if (replySubmitBtn) { replySubmitBtn.addEventListener('click', async () => { const message = replyInput.value.trim(); if (!message) { alert('메시지를 입력 please.'); return } const safetyResult = detectCrisis(message); if (safetyResult.level === 'high') { window.handleCrisis('high', replyInput); return } await sendNoteToAuthor(authorId, memoryId, message) }) } const replySkipBtn = document.getElementById('replySkipBtn'); if (replySkipBtn) { replySkipBtn.addEventListener('click', () => { noteSection.remove() }) } }
async function sendNoteToAuthor(authorId, memoryId, message) { try { const client = networkService.getClient(); if (!client) { alert('Supabase client not initialized.'); return } const { data: { user } } = await client.auth.getUser(); if (!user) { alert('Login required to send a note.'); return } const result = await networkService.sendNote({ memory_id: memoryId, sender_id: user.id, recipient_id: authorId, message: message, note_type: 'player_to_author' }); if (!result.ok) { console.error('쪽지 전송 error:', result.error); alert('Note send failed.'); return } const noteSection = document.querySelector('.note-section'); if (noteSection) { noteSection.innerHTML = '<div class="note-sent-message"><p>Delivered to the memory author.</p></div>' } console.log('=== Note sent ===') } catch (e) { console.error('sendNoteToAuthor error:', e); alert('An error occurred while sending the note.') } }
async function loadReceivedNotes() { try { const client = networkService.getClient(); if (!client) return []; const { data: { user } } = await client.auth.getUser(); if (!user) return []; const result = await networkService.loadReceivedNotes(user.id); if (!result.ok) { console.error('쪽지 로드 error:', result.error); return [] } return result.data || [] } catch (e) { console.error('loadReceivedNotes error:', e); return [] } }
async function renderReceivedNotes() { const notes = await loadReceivedNotes(); const container = document.getElementById('mypageNotesList'); if (!container) return; if (notes.length === 0) { container.innerHTML = '<p class="no-notes" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:1rem">No notes received.</p>'; return } container.innerHTML = notes.map(note => { const memoryTitle = note.memories?.title || 'Unknown'; const date = new Date(note.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); const unreadClass = note.is_read ? 'read' : 'unread'; const unreadBadge = note.is_read ? '' : '<span class="unread-badge" style="display:inline-block;padding:.2rem .5rem;background:rgba(212,175,55,.2);border:1px solid rgba(212,175,55,.4);color:#d4af37;font-size:.7rem;letter-spacing:.1em;margin-left:.5rem">NEW</span>'; return `<div class="note-card ${unreadClass}" data-note-id="${note.id}" style="padding:.8rem;margin-bottom:.5rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.1);border-radius:4px;cursor:pointer;transition:all .3s"><p class="note-memory" style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>Memory: ${memoryTitle}</strong>${unreadBadge}</p><p class="note-message" style="font-size:.9rem;color:var(--text-primary);line-height:1.6;margin-bottom:.5rem">${note.message}</p><p class="note-date" style="font-size:.75rem;color:var(--text-muted)">${date}</p></div>` }).join(''); container.querySelectorAll('.note-card.unread').forEach(card => { card.addEventListener('click', async () => { const noteId = card.dataset.noteId; try { const result = await networkService.markNoteAsRead(noteId); if (result.ok) { card.classList.remove('unread'); card.classList.add('read'); const badge = card.querySelector('.unread-badge'); if (badge) badge.remove() } } catch (e) { console.error('쪽지 읽음 처리 error:', e) } }) }) }
function viewMemoryFromArchive(memoryId) {
    if (!memoryId) return;
    const lang = /[가-힣]/.test(String(memoryId)) ? 'ko' : 'en';
    const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const base = isLocal ? 'play-test.html' : '/play';
    window.location.href = `${base}?memory=${encodeURIComponent(memoryId)}&lang=${lang}`;
}
async function showSessionDetail(sessionId) { const modal = document.getElementById('sessionDetailModal'); const body = document.getElementById('sessionDetailBody'); if (!modal || !body) { return } const currentUser = appStore.getState().currentUser; modal.classList.add('active'); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading...</div>'; try { const sessionResult = await networkService.getSessionById(sessionId); if (!sessionResult.ok) throw sessionResult.error; const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(sessionId); if (!scenesResult.ok) throw scenesResult.error; const scenesData = scenesResult.data; const date = sessionData.created_at ? new Date(sessionData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const endDate = sessionData.ended_at ? new Date(sessionData.ended_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = sessionData.narrator_id === currentUser?.id ? '화자' : sessionData.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = sessionData.ended_at ? 'Complete' : '진행중'; const alignment = sessionData.alignment ? Math.round(sessionData.alignment * 100) + '%' : '0%'; const fate = sessionData.memory_fate === 'preserve' ? 'Preserve' : sessionData.memory_fate === 'dilute' ? 'Natural Dissolution' : sessionData.memory_fate === 'anonymous' ? 'Full Anonymity' : '미정'; document.getElementById('sessionDetailTitle').textContent = sessionData.session_code || 'Session Info'; let scenesHtml = ''; if (scenesData && scenesData.length > 0) { scenesHtml = '<div class="session-detail-scenes"><h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.3rem;color:var(--accent-memory);margin-bottom:1rem;letter-spacing:.1em">Scene 목록</h3>'; scenesData.forEach((scene, index) => { const sceneText = scene.text || '[텍스트 없음]'; const sceneType = scene.scene_type || 'normal'; const voidInfo = scene.void_info; scenesHtml += `<div class="session-detail-scene-item"><div class="session-detail-scene-header">Scene ${index + 1}${sceneType === 'void' ? ' (void in memory)' : ''}</div><div class="session-detail-scene-text">${sceneText}</div>${voidInfo && voidInfo.reason ? `<div style="font-size:.85rem;color:var(--text-muted);font-style:italic;margin-top:.5rem">공백 이유: ${voidInfo.reason}</div>` : ''}</div>` }); scenesHtml += '</div>' } else { scenesHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-style:italic">No saved scenes.</div>' } body.innerHTML = `<div class="session-detail-info-item"><div class="session-detail-info-label">Session Code</div><div class="session-detail-info-value">${sessionData.session_code || '—'}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Started</div><div class="session-detail-info-value">${date}</div></div>${sessionData.ended_at ? `<div class="session-detail-info-item"><div class="session-detail-info-label">Ended</div><div class="session-detail-info-value">${endDate}</div></div>` : ''}<div class="session-detail-info-item"><div class="session-detail-info-label">Role</div><div class="session-detail-info-value">${role}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Status</div><div class="session-detail-info-value">${status}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Alignment</div><div class="session-detail-info-value">${alignment}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Fate</div><div class="session-detail-info-value">${fate}</div></div>${scenesHtml}` } catch (e) { console.error('showSessionDetail error:', e); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Error loading session info.</div>'; showNotification('세션 정보를 불러오는 중 An error occurred') } }
function closeSessionDetail() { const modal = document.getElementById('sessionDetailModal'); if (modal) { modal.classList.remove('active') } }
function renderSessionHistory_DEPRECATED() { const listEl = document.getElementById('sessionHistoryList'); const currentUser = appStore.getState().currentUser; if (!listEl || !currentUser || !currentUser.sessionHistory || currentUser.sessionHistory.length === 0) { if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No saved sessions.</div>'; return } listEl.innerHTML = ''; currentUser.sessionHistory.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${session.date}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">Role: ${session.role} | Fate: ${session.memoryFate === 'preserve' ? 'Preserve' : session.memoryFate === 'dilute' ? 'Natural Dissolution' : session.memoryFate === 'anonymous' ? 'Full Anonymity' : '—'}<br>Alignment: ${session.alignment} | 장면: ${session.scenes} | 조각: ${session.fragments} | 일치: ${session.matches}</div>`; listEl.appendChild(sessionItem) }) }

// ─────────────────────────────────────
// === Session Check (runs on load) ===
// ─────────────────────────────────────

async function checkSession() {
    supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appStore.setState({
            isLoggedIn: true,
            currentUser: {
                id: session.user.id,
                username: session.user.user_metadata?.username || session.user.email.split('@')[0],
                email: session.user.email,
                joinDate: new Date(session.user.created_at).toLocaleDateString('en-US'),
                liveSessions: 0,
                memories: 0,
                interpretations: 0,
                visitedMemories: [],
                sessionHistory: []
            }
        });
    }
}
(async function () { await checkSession() })();

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // pendingSaveAction access
    getPendingSaveAction,
    setPendingSaveAction,

    // Core auth
    openMypage,
    showMypage,
    closeMypage,
    tryOAuthPostLoginNavigation,
    handleLogin,
    closeLogin,
    switchToSignup,
    switchToLogin,
    handleSignup,
    closeSignup,
    handleSocialLogin,
    handleLogout,
    updateUserStats,

    // Mypage
    loadMypageDataFromDB,
    showTrueEndingNoteUI,
    sendNoteToAuthor,
    loadReceivedNotes,
    renderReceivedNotes,
    viewMemoryFromArchive,
    showSessionDetail,
    closeSessionDetail,

    // Session
    checkSession,
};
