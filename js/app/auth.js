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
import { t } from '../lib/i18n.js';   // 261123 PROFILE 재단장: 목록 줄의 말 (getCurrentLanguage 는 아래 줄에서 이미 가져온다)
import { uiManager } from '../ui/UIManager.js';
import { detectCrisis } from '../safety.js';
import { getCurrentLanguage } from '../lib/i18n.js';

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

// R5-7: the session-history query was dropped from this fan-out. #sessionHistoryList does not
// exist in the shell, so its result was fetched over the network and then thrown away.
// loadSessionHistoryFromDB / renderSessionHistoryList are kept for whenever the DOM returns.
async function loadMypageDataFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) { renderMyMemoriesEmpty(); return } try { const [memoriesResult, statsResult] = await Promise.all([loadMyMemoriesFromDB(), loadUserStatsFromDB()]); renderMyMemoriesList(memoriesResult); updateMypageStats(statsResult); await renderReceivedNotes() } catch (e) { console.error('loadMypageDataFromDB error:', e); renderMyMemoriesEmpty() } }
async function loadSessionHistoryFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) return []; try { const result = await networkService.getUserSessionHistory(state.currentUser.id, 50); if (!result.ok) return []; return result.data || [] } catch (e) { console.error('loadSessionHistoryFromDB error:', e); return [] } }
async function loadMyMemoriesFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return [];
    const userId = state.currentUser.id;
    try {
        const client = networkService._getClient ? networkService._getClient() : null;
        if (!client) return [];
        const { data, error } = await client
            .from('memories')
            .select('*')
            .eq('curator_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        return (!error && data) ? data : [];
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
function renderMyMemoriesEmpty() { const listEl = document.getElementById('myMemoriesList'); if (listEl) { listEl.innerHTML = ''; const d = document.createElement('div'); d.className = 'mp-empty'; d.textContent = t('profile.empty.mine'); listEl.appendChild(d) } }
function renderSessionHistoryList(sessions) { const listEl = document.getElementById('sessionHistoryList'); if (!listEl) { return } if (!sessions || sessions.length === 0) { renderSessionHistoryEmpty(); return } const currentUser = appStore.getState().currentUser; listEl.innerHTML = ''; sessions.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.style.borderRadius = '4px'; sessionItem.style.cursor = 'pointer'; sessionItem.style.transition = 'all .3s'; sessionItem.onmouseenter = () => { sessionItem.style.borderColor = 'var(--accent-memory)'; sessionItem.style.transform = 'translateX(4px)' }; sessionItem.onmouseleave = () => { sessionItem.style.borderColor = 'rgba(196,168,130,.1)'; sessionItem.style.transform = 'translateX(0)' }; const date = session.created_at ? new Date(session.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = session.narrator_id === currentUser?.id ? '화자' : session.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = session.ended_at ? 'Complete' : '진행중'; const alignment = session.alignment ? Math.round(session.alignment * 100) + '%' : '0%'; const fate = session.memory_fate === 'preserve' ? 'Preserve' : session.memory_fate === 'dilute' ? 'Natural Dissolution' : session.memory_fate === 'anonymous' ? 'Full Anonymity' : '—'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${date}</strong> <span style="color:var(--accent-memory);font-size:.75rem">[${session.session_code || '—'}]</span></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">Role: ${role} | Status: ${status}<br>Alignment: ${alignment} | Fate: ${fate}</div>`; sessionItem.onclick = () => { showSessionDetail(session.id) }; listEl.appendChild(sessionItem) }) }
// 261123 PROFILE 재단장: 한 줄 = 제목 · 날짜 · 걸음 수 → 기억 만들기(record-space)로 만든 기억은 우주 무대로, 나머지는 옛 지형으로
function renderMyMemoriesList(memories) {
    const listEl = document.getElementById('myMemoriesList'); if (!listEl) { return }
    if (!memories || memories.length === 0) { renderMyMemoriesEmpty(); return }
    listEl.innerHTML = '';
    const lang = getCurrentLanguage() === 'en' ? 'en' : 'ko', locale = lang === 'en' ? 'en-US' : 'ko-KR';
    memories.forEach(memory => {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'mp-row';
        const isSpace = !!(memory.meta && memory.meta.space_record);
        const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        const depth = Number(memory.cont_depth) || 0;
        const title = document.createElement('span'); title.className = 'mp-row-title'; title.textContent = memory.title || memory.code || t('profile.untitled');
        const meta = document.createElement('span'); meta.className = 'mp-row-meta'; meta.textContent = date + ' · ' + t('profile.walks').replace('{n}', String(depth)) + (memory.is_public === false ? ' · ' + t('profile.private') : '');
        const go = document.createElement('span'); go.className = 'mp-row-go'; go.textContent = isSpace ? t('profile.go.space') : t('profile.go.terrain');
        row.appendChild(title); row.appendChild(meta); row.appendChild(go);
        row.onclick = () => { closeMypage(); if (isSpace) { window.location.href = `space-play.html?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(lang)}`; return } viewMemoryFromArchive(memory.id) };
        listEl.appendChild(row);
    });
}
function updateMypageStats(stats) { document.getElementById('displayMemories').textContent = stats.memories || 0; document.getElementById('displayInterpretations').textContent = stats.interpretations || 0 }
// True ending note UI
function showTrueEndingNoteUI(authorNote, authorId, memoryId) { const endContent = document.getElementById('endContent'); if (!endContent) return; const endButtons = endContent.querySelector('.end-buttons'); if (!endButtons) return; const existingNoteSection = endContent.querySelector('.note-section'); if (existingNoteSection) existingNoteSection.remove(); const noteSection = document.createElement('div'); noteSection.className = 'note-section'; noteSection.innerHTML = (authorNote ? `<div class="author-note-box"><p class="note-label">Note from the experiencer</p><p class="note-content">${authorNote}</p></div>` : '') + `<div class="reply-section"><p class="reply-label">You can leave a message for the memory author</p><textarea class="reply-input" id="replyInput" maxlength="100" placeholder="Please write within 100 characters..."></textarea><div class="reply-counter"><span id="replyCount">0</span>/100</div><div class="reply-buttons"><button class="reply-submit-btn" id="replySubmitBtn">Send Note</button><button class="reply-skip-btn" id="replySkipBtn">건너뛰기</button></div></div>`; endContent.insertBefore(noteSection, endButtons); const replyInput = document.getElementById('replyInput'); const replyCount = document.getElementById('replyCount'); if (replyInput && replyCount) { replyInput.addEventListener('input', () => { replyCount.textContent = replyInput.value.length }) } const replySubmitBtn = document.getElementById('replySubmitBtn'); if (replySubmitBtn) { replySubmitBtn.addEventListener('click', async () => { const message = replyInput.value.trim(); if (!message) { alert('메시지를 입력 please.'); return } const safetyResult = detectCrisis(message); if (safetyResult.level === 'high') { window.handleCrisis('high', replyInput); return } await sendNoteToAuthor(authorId, memoryId, message) }) } const replySkipBtn = document.getElementById('replySkipBtn'); if (replySkipBtn) { replySkipBtn.addEventListener('click', () => { noteSection.remove() }) } }
async function sendNoteToAuthor(authorId, memoryId, message) { try { const client = networkService.getClient(); if (!client) { alert('Supabase client not initialized.'); return } const { data: { user } } = await client.auth.getUser(); if (!user) { alert('Login required to send a note.'); return } const result = await networkService.sendNote({ memory_id: memoryId, sender_id: user.id, recipient_id: authorId, message: message, note_type: 'player_to_author' }); if (!result.ok) { console.error('쪽지 전송 error:', result.error); alert('Note send failed.'); return } const noteSection = document.querySelector('.note-section'); if (noteSection) { noteSection.innerHTML = '<div class="note-sent-message"><p>Delivered to the memory author.</p></div>' } console.log('=== Note sent ===') } catch (e) { console.error('sendNoteToAuthor error:', e); alert('An error occurred while sending the note.') } }
async function loadReceivedNotes() { try { const client = networkService.getClient(); if (!client) return []; const { data: { user } } = await client.auth.getUser(); if (!user) return []; const result = await networkService.loadReceivedNotes(user.id); if (!result.ok) { console.error('쪽지 로드 error:', result.error); return [] } return result.data || [] } catch (e) { console.error('loadReceivedNotes error:', e); return [] } }
// 261123 PROFILE 재단장: 받은 말 — 어느 기억에서 · 말 · 날짜 (읽지 않은 것은 밝게; 누르면 읽음으로)
async function renderReceivedNotes() {
    const notes = await loadReceivedNotes(); const container = document.getElementById('mypageNotesList'); if (!container) return;
    container.innerHTML = '';
    if (notes.length === 0) { const d = document.createElement('div'); d.className = 'mp-empty'; d.textContent = t('profile.empty.notes'); container.appendChild(d); return }
    const locale = getCurrentLanguage() === 'en' ? 'en-US' : 'ko-KR';
    notes.forEach(note => {
        const card = document.createElement('div'); card.className = 'mp-note ' + (note.is_read ? 'read' : 'unread'); card.dataset.noteId = note.id;
        const from = document.createElement('p'); from.className = 'mp-note-from'; from.textContent = t('profile.note.from') + ' · ' + (note.memories?.title || '—');
        if (!note.is_read) { const n = document.createElement('span'); n.className = 'mp-new'; n.textContent = t('profile.note.new'); from.appendChild(n) }
        const msg = document.createElement('p'); msg.className = 'mp-note-text'; msg.textContent = note.message || '';
        const date = document.createElement('p'); date.className = 'mp-note-date'; date.textContent = new Date(note.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
        card.appendChild(from); card.appendChild(msg); card.appendChild(date);
        if (!note.is_read) card.addEventListener('click', async () => { try { const result = await networkService.markNoteAsRead(note.id); if (result.ok) { card.classList.remove('unread'); card.classList.add('read'); const badge = card.querySelector('.mp-new'); if (badge) badge.remove() } } catch (e) { console.error('쪽지 읽음 처리 error:', e) } });
        container.appendChild(card);
    });
}
function viewMemoryFromArchive(memoryId) {
    if (!memoryId) return;
    const lang = getCurrentLanguage();
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
