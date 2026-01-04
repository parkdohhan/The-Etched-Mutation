import { getSupabaseClient } from './lib/supabaseClient.js';
import { SUPABASE_ANON_KEY } from './lib/config.js';

let supabaseClient;
let storyData;
let allMemoriesData=[];let currentMode=null,currentRole=null,sessionCode=null,currentMemory=null,currentScene=0,userChoices=[],userReasons=[],currentAlignment=0,waveAnimationId=null,liveWaveAnimationId=null,liveSceneNum=1,liveFragments=0,liveMatches=0,isLoggedIn=false,currentUser=null,currentSessionId=null,currentSceneOrder=1;let currentSort='all';let currentCategory='all';
const USE_LIVE_INTERPRETATIONS_TABLE=false;

// DOMContentLoaded 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    const memoriesDataArray = window.memoriesData || memoriesData || [];
    storyData = memoriesDataArray[0];
    window.currentStoryData = storyData;
    allMemoriesData = [...memoriesDataArray.map(m=>({...m,live_session_id:null,is_live:false}))];
    if(document.getElementById('memoryList')) renderMemoryCards();
}
function openPortfolio(){
    // Next.js 개발 서버 사용 (포트 3000)
    const portfolioUrl = 'http://localhost:3000';
    const portfolioWindow = window.open(portfolioUrl, '_blank');
    
    // 서버가 실행 중이 아닐 경우를 대비
    if (portfolioWindow) {
        setTimeout(() => {
            try {
                // 새 창이 여전히 열려있는지 확인
                if (portfolioWindow.closed) {
                    return;
                }
                // 서버가 실행 중인지 확인하기 위해 fetch 시도
                fetch(portfolioUrl)
                    .catch(() => {
                        alert('포트폴리오 서버가 실행 중이 아닙니다.\n\n터미널에서 다음 명령어를 실행해주세요:\n\ncd portfolio-site\nnpm run dev\n\n또는 start-portfolio-server.sh 스크립트를 실행하세요.');
                    });
            } catch (e) {
                // CORS 등의 이유로 실패할 수 있지만 무시
            }
        }, 2000);
    }
}
function openMypage(){if(!isLoggedIn){const loginModal=document.getElementById('loginModal');if(loginModal){loginModal.classList.add('active');loginModal.style.cssText='display:flex !important;z-index:2100 !important'}document.getElementById('loginUsername').focus()}else{showMypage()}}
async function showMypage(){if(!isLoggedIn)return;if(pendingSaveAction==='save')return;const introScreen=document.getElementById('introScreen');if(introScreen){introScreen.classList.add('hidden');introScreen.style.cssText='display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important'}['modeSelection','sessionSetup','liveContainer','archiveContainer','endScreen','loginModal','signupModal'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('active');el.style.display='none'}});const mypageScreen=document.getElementById('mypageScreen');if(mypageScreen){mypageScreen.classList.add('active');mypageScreen.style.cssText='display:flex !important;z-index:2100 !important'}if(currentUser){document.getElementById('displayUsername').textContent=currentUser.username;document.getElementById('displayEmail').textContent=currentUser.email||'—';document.getElementById('displayJoinDate').textContent=currentUser.joinDate||'—';if(currentUser.loginMethod){document.getElementById('displayLoginMethod').style.display='block';const methodText=currentUser.loginMethod==='google'?'구글':currentUser.loginMethod==='facebook'?'페이스북':'일반';document.getElementById('loginMethodText').textContent=methodText}else{document.getElementById('displayLoginMethod').style.display='none'}await loadMypageDataFromDB()}}
function closeMypage(){const mypageScreen=document.getElementById('mypageScreen');if(mypageScreen){mypageScreen.classList.remove('active');mypageScreen.style.display='none'}const introScreen=document.getElementById('introScreen');if(introScreen){introScreen.classList.remove('hidden');introScreen.classList.add('visible');introScreen.style.cssText='display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important'}}
async function handleLogin(){const email=document.getElementById('loginUsername').value.trim();const password=document.getElementById('loginPassword').value.trim();if(!email||!password){showNotification('이메일과 비밀번호를 입력해주세요');return}supabaseClient = getSupabaseClient(); if(!supabaseClient){showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}const{data,error}=await supabaseClient.auth.signInWithPassword({email:email,password:password});if(error){showNotification('로그인 실패: '+error.message);return}isLoggedIn=true;currentUser={id:data.user.id,username:data.user.user_metadata?.username||email.split('@')[0],email:email,joinDate:new Date(data.user.created_at).toLocaleDateString('ko-KR'),liveSessions:0,memories:0,interpretations:0,visitedMemories:[],sessionHistory:[]};const loginModal=document.getElementById('loginModal');if(loginModal){loginModal.classList.remove('active');loginModal.style.display='none'}document.getElementById('loginUsername').value='';document.getElementById('loginPassword').value='';showNotification('로그인되었습니다');if(pendingSaveAction==='save'){pendingSaveAction=null;setTimeout(()=>{saveMemory()},300)}else{showMypage()}}
function closeLogin(){const loginModal=document.getElementById('loginModal');if(loginModal){loginModal.classList.remove('active');loginModal.style.display='none'}document.getElementById('loginUsername').value='';document.getElementById('loginPassword').value='';pendingSaveAction=null}
function switchToSignup(){const loginModal=document.getElementById('loginModal');if(loginModal){loginModal.classList.remove('active');loginModal.style.display='none'}const signupModal=document.getElementById('signupModal');if(signupModal){signupModal.classList.add('active');signupModal.style.cssText='display:flex !important;z-index:2100 !important'}document.getElementById('signupUsername').focus()}
function switchToLogin(){const signupModal=document.getElementById('signupModal');if(signupModal){signupModal.classList.remove('active');signupModal.style.display='none'}const loginModal=document.getElementById('loginModal');if(loginModal){loginModal.classList.add('active');loginModal.style.cssText='display:flex !important;z-index:2100 !important'}document.getElementById('loginUsername').focus()}
async function handleSignup(){const username=document.getElementById('signupUsername').value.trim();const email=document.getElementById('signupEmail').value.trim();const password=document.getElementById('signupPassword').value.trim();const passwordConfirm=document.getElementById('signupPasswordConfirm').value.trim();if(!username||!email||!password||!passwordConfirm){showNotification('모든 항목을 입력해주세요');return}if(password!==passwordConfirm){showNotification('비밀번호가 일치하지 않습니다');return}if(password.length<6){showNotification('비밀번호는 최소 6자 이상이어야 합니다');return}supabaseClient = getSupabaseClient(); if(!supabaseClient){showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}const{data,error}=await supabaseClient.auth.signUp({email:email,password:password,options:{data:{username:username}}});if(error){showNotification('회원가입 실패: '+error.message);return}isLoggedIn=true;currentUser={id:data.user.id,username:username,email:email,joinDate:new Date().toLocaleDateString('ko-KR'),liveSessions:0,memories:0,interpretations:0,visitedMemories:[],sessionHistory:[]};const signupModal=document.getElementById('signupModal');if(signupModal){signupModal.classList.remove('active');signupModal.style.display='none'}document.getElementById('signupUsername').value='';document.getElementById('signupEmail').value='';document.getElementById('signupPassword').value='';document.getElementById('signupPasswordConfirm').value='';showNotification('회원가입이 완료되었습니다');if(pendingSaveAction==='save'){pendingSaveAction=null;setTimeout(()=>{saveMemory()},300)}else{showMypage()}}
function closeSignup(){const signupModal=document.getElementById('signupModal');if(signupModal){signupModal.classList.remove('active');signupModal.style.display='none'}document.getElementById('signupUsername').value='';document.getElementById('signupEmail').value='';document.getElementById('signupPassword').value='';document.getElementById('signupPasswordConfirm').value=''}
async function handleSocialLogin(provider){if(provider==='google'){supabaseClient = getSupabaseClient(); if(!supabaseClient){showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}const{data,error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});if(error){showNotification('구글 로그인 실패: '+error.message)}}else{showNotification('준비 중입니다')}}
async function handleLogout(){if(confirm('로그아웃하시겠습니까?')){supabaseClient = getSupabaseClient(); if(!supabaseClient){showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}await supabaseClient.auth.signOut();isLoggedIn=false;currentUser=null;closeMypage();showNotification('로그아웃되었습니다')}}
function updateUserStats(type,value=1){if(!isLoggedIn||!currentUser)return;if(type==='liveSession'){currentUser.liveSessions=(currentUser.liveSessions||0)+value}else if(type==='memory'){if(!currentUser.visitedMemories)currentUser.visitedMemories=[];if(!currentUser.visitedMemories.includes(value)){currentUser.visitedMemories.push(value);currentUser.memories=(currentUser.memories||0)+1}}else if(type==='interpretation'){currentUser.interpretations=(currentUser.interpretations||0)+value}if(document.getElementById('mypageScreen')&&document.getElementById('mypageScreen').classList.contains('active')){showMypage()}}
function showModeSelection(){const introScreen=document.getElementById('introScreen');const matchingSelection=document.getElementById('matchingSelection');if(introScreen){introScreen.classList.add('hidden');introScreen.style.cssText='display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important'}if(matchingSelection){matchingSelection.classList.add('active');matchingSelection.style.cssText='display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important'}}
function selectMatching(type){if(type==='session'){const matchingSelection=document.getElementById('matchingSelection');const modeSelection=document.getElementById('modeSelection');if(matchingSelection){matchingSelection.classList.remove('active');matchingSelection.style.display='none'}if(modeSelection){modeSelection.classList.add('active');modeSelection.style.cssText='display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important'}}else{showNotification('곧 만나요')}}
function backToMatchingSelection(){const matchingSelection=document.getElementById('matchingSelection');const modeSelection=document.getElementById('modeSelection');if(modeSelection){modeSelection.classList.remove('active');modeSelection.style.display='none'}if(matchingSelection){matchingSelection.classList.add('active');matchingSelection.style.cssText='display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important'}}
function backToIntro(){const introScreen=document.getElementById('introScreen');if(introScreen){introScreen.classList.remove('hidden');introScreen.classList.add('visible');introScreen.style.cssText='display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important'}['matchingSelection','modeSelection','sessionSetup','liveContainer','archiveContainer','endScreen','mypageScreen','loginModal','signupModal'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('active');el.style.display='none'}});const footer=document.querySelector('.footer');if(footer)footer.classList.remove('visible');stopAllAnimations()}
function backToModeSelection(){const sessionSetupEl=document.getElementById('sessionSetup');if(sessionSetupEl){sessionSetupEl.classList.remove('active');sessionSetupEl.style.display='none'}const modeSelectionEl=document.getElementById('modeSelection');if(modeSelectionEl){modeSelectionEl.classList.add('active');modeSelectionEl.style.cssText='display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important'}}
async function enterArchive(){const introScreen=document.getElementById('introScreen');const archiveContainer=document.getElementById('archiveContainer');if(introScreen){introScreen.classList.add('hidden');introScreen.style.cssText='display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important'}['modeSelection','endScreen','liveContainer','sceneViewer'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('active');el.style.display='none'}});if(archiveContainer){archiveContainer.classList.add('active');archiveContainer.style.cssText='display:block !important;z-index:1900 !important'}const memoryListEl=document.getElementById('memoryList');if(memoryListEl)memoryListEl.style.display='grid';const archiveControlsEl=document.getElementById('archiveControls');if(archiveControlsEl)archiveControlsEl.style.display='flex';const archiveHeaderEl=document.querySelector('.archive-header');if(archiveHeaderEl)archiveHeaderEl.style.display='block';currentMode='archive';stopAllAnimations();await loadMemoriesFromSupabase();setTimeout(()=>showNpcDialogue("여기는 아카이브야. 한 번 상연된 기억 위에, 다른 사람들의 해석이 지층처럼 쌓여 있어.",5000),1000);const archiveSearchEl=document.getElementById('archiveSearch');if(archiveSearchEl)archiveSearchEl.value='';renderMemoryCards();sortMemories('all');const footer=document.querySelector('.footer');if(footer)footer.classList.add('visible')}
function filterByCategory(category,btnElement){if(!category)return;currentCategory=category;const categoryBtns=document.querySelectorAll('.category-btn');categoryBtns.forEach(btn=>btn.classList.remove('active'));if(btnElement)btnElement.classList.add('active');renderMemoryCards()}
async function loadMemoriesFromSupabase(){try{supabaseClient = getSupabaseClient(); if(!supabaseClient){console.log('[loadMemoriesFromSupabase] Supabase 클라이언트가 아직 초기화되지 않았습니다');return}console.log('[loadMemoriesFromSupabase] Supabase에서 기억 불러오기 시작');const{data:memoriesDataSupabase,error:memoriesError}=await supabaseClient.from('memories').select('*').eq('is_public',true).order('id',{ascending:true});if(memoriesError){console.error('[loadMemoriesFromSupabase] memories 조회 실패',memoriesError);return}if(!memoriesDataSupabase||memoriesDataSupabase.length===0){console.log('[loadMemoriesFromSupabase] Supabase에 공개된 기억이 없습니다');allMemoriesData=[];return}console.log(`[loadMemoriesFromSupabase] ${memoriesDataSupabase.length}개의 메모리 발견`);const supabaseMemories=await Promise.all(memoriesDataSupabase.map(async(memory)=>{const{data:scenesData,error:scenesError}=await supabaseClient.from('scenes').select('*').eq('memory_id',memory.id).order('scene_order',{ascending:true});if(scenesError){console.error(`[loadMemoriesFromSupabase] Memory ${memory.id} scenes 조회 실패`,scenesError);return null}const scenes=await Promise.all((scenesData||[]).map(async(scene)=>{const{data:choicesData,error:choicesError}=await supabaseClient.from('choices').select('*').eq('scene_id',scene.id).order('choice_order',{ascending:true});if(choicesError){console.error(`[loadMemoriesFromSupabase] Scene ${scene.id} choices 조회 실패`,choicesError);return null}const echoWords=Array.isArray(scene.echo_words)?scene.echo_words:(typeof scene.echo_words==='string'?JSON.parse(scene.echo_words):[]);const emotionDist=scene.emotion_dist||{};return{id:scene.id,text:scene.text||'',sceneType:scene.scene_type||'normal',echoWords:echoWords,choices:(choicesData||[]).map(choice=>({text:choice.text||'',emotion:choice.emotion||'fear',intensity:choice.intensity||5,nextScene:choice.nextScene||'end',percentage:0})),emotionDist:emotionDist,voidInfo:scene.void_info||null,originalChoice:scene.original_choice!==undefined?scene.original_choice:0,originalReason:scene.original_reason||'',originalEmotion:scene.original_emotion?(typeof scene.original_emotion==='string'?JSON.parse(scene.original_emotion):scene.original_emotion):null,originalReasonVector:scene.original_reason_vector||null}}));const validScenes=scenes.filter(s=>s!==null);const isLive=!!memory.live_session_id;return{id:memory.id,code:memory.code||'',title:memory.title||'',layers:memory.layers||0,dilution:memory.dilution||50,recentRank:memory.id||0,scenes:validScenes,live_session_id:memory.live_session_id,is_live:isLive}}));const validSupabaseMemories=supabaseMemories.filter(m=>m!==null);allMemoriesData=validSupabaseMemories||[];console.log(`[loadMemoriesFromSupabase] Supabase에서 ${allMemoriesData.length}개의 기억을 로드했습니다`)}catch(error){console.error('[loadMemoriesFromSupabase] 에러 발생',error);allMemoriesData=[]}}
function renderMemoryCards(){const list=document.getElementById('memoryList');if(!list)return;if(!allMemoriesData||allMemoriesData.length===0){list.innerHTML='<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">기억이 없습니다.</div>';return}let filteredMemories=[...allMemoriesData];if(currentCategory==='live'){filteredMemories=filteredMemories.filter(m=>(m.live_session_id||m.is_live))}else if(currentCategory==='archive'){filteredMemories=filteredMemories.filter(m=>(!m.live_session_id&&!m.is_live))}let sortedMemories;if(currentSort==='all'){sortedMemories=filteredMemories}else if(currentSort==='popular'){sortedMemories=[...filteredMemories].sort((a,b)=>(b.layers||0)-(a.layers||0))}else if(currentSort==='recent'){sortedMemories=[...filteredMemories].sort((a,b)=>(b.recentRank||0)-(a.recentRank||0))}list.innerHTML='';if(sortedMemories.length===0){list.innerHTML='<div class="mypage-info" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:2rem">해당 카테고리의 기억이 없습니다.</div>';return}sortedMemories.forEach((memory,index)=>{const originalIndex=allMemoriesData.findIndex(m=>m.id===memory.id);const card=document.createElement('div');card.className='memory-card';card.setAttribute('data-code',memory.code||'');card.setAttribute('data-layers',memory.layers||0);card.setAttribute('data-recent',memory.recentRank||0);const isLive=!!(memory.live_session_id||memory.is_live);card.setAttribute('data-category',isLive?'live':'archive');card.setAttribute('onclick',`selectMemory(${originalIndex>=0?originalIndex:index})`);const categoryLabel=isLive?'<span class="memory-category-badge live">라이브</span>':'<span class="memory-category-badge archive">아카이브</span>';card.innerHTML=`${categoryLabel}<h3 class="memory-card-title">${memory.title||'제목 없음'}</h3><p class="memory-card-meta">원본: ${memory.code||'—'} · 해석 레이어: ${memory.layers||0}개</p><div class="memory-card-dilution"><span>원본</span><div class="dilution-bar"><div class="dilution-fill" style="width:${memory.dilution||50}%"></div></div><span>${memory.dilution||50}%</span></div>`;list.appendChild(card)});filterMemories()}
function filterMemories(){const searchValue=document.getElementById('archiveSearch').value.toUpperCase().trim();const cards=document.querySelectorAll('.memory-card');cards.forEach(card=>{const code=card.getAttribute('data-code')||'';const category=card.getAttribute('data-category')||'archive';let shouldShow=true;if(currentCategory==='live'&&category!=='live')shouldShow=false;else if(currentCategory==='archive'&&category!=='archive')shouldShow=false;if(shouldShow&&(searchValue===''||code.includes(searchValue))){card.classList.remove('hidden');card.style.display='block';if(searchValue!==''&&code===searchValue){setTimeout(()=>{card.scrollIntoView({behavior:'smooth',block:'center'});card.style.transform='scale(1.05)';setTimeout(()=>card.style.transform='',500)},100)}}else{card.classList.add('hidden');card.style.display='none'}})}
function sortMemories(sortType,btnElement){currentSort=sortType;const filterBtns=document.querySelectorAll('.filter-btn');filterBtns.forEach(btn=>btn.classList.remove('active'));if(btnElement)btnElement.classList.add('active');renderMemoryCards()}
function selectRole(role){try{currentRole=role;currentMode='live';const modeSelectionEl=document.getElementById('modeSelection');if(modeSelectionEl){modeSelectionEl.classList.remove('active');modeSelectionEl.style.display='none'}const sessionSetupEl=document.getElementById('sessionSetup');if(sessionSetupEl){sessionSetupEl.classList.add('active');sessionSetupEl.style.cssText='display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important'}if(role==='A'){const narratorSetupEl=document.getElementById('narratorSetup');const experiencerSetupEl=document.getElementById('experiencerSetup');if(narratorSetupEl)narratorSetupEl.style.display='block';if(experiencerSetupEl)experiencerSetupEl.style.display='none';generateSessionCode()}else{const narratorSetupEl=document.getElementById('narratorSetup');const experiencerSetupEl=document.getElementById('experiencerSetup');if(narratorSetupEl)narratorSetupEl.style.display='none';if(experiencerSetupEl)experiencerSetupEl.style.display='block'}}catch(e){console.error('selectRole error:',e);showNotification('역할을 선택하는 중 오류가 발생했습니다')}}
function generateSessionCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<5;i++)code+=chars.charAt(Math.floor(Math.random()*chars.length));sessionCode=code;document.getElementById('sessionCode').textContent=code;document.getElementById('waitingForB').classList.add('active');createLiveSession()}
function copySessionCode(){navigator.clipboard.writeText(sessionCode);showNotification('코드가 복사되었습니다')}
function joinSession(){joinLiveSession()}
async function createLiveSession(){
    console.log('=== createLiveSession 시작 ===');
    console.log('sessionCode:', sessionCode);
    console.log('currentRole:', currentRole);
    
    // Supabase 클라이언트 초기화 대기
    let retryCount = 0;
    const maxRetries = 20; // 최대 10초 대기 (20 * 500ms)
    
    while(retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if(supabaseClient) {
            console.log('Supabase 클라이언트 초기화 완료');
            break;
        }
        console.log(`Supabase 클라이언트 대기 중... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }
    
    if(!supabaseClient){
        console.error('supabaseClient가 초기화되지 않음 (최대 대기 시간 초과)');
        console.error('window.supabase 존재 여부:', typeof window.supabase !== 'undefined');
        showNotification('Supabase 연결에 실패했습니다. 네트워크 연결을 확인해주세요.');
        return null;
    }
    
    if(currentRole!=='A'){
        console.warn('화자가 아닙니다');
        return null;
    }
    
    let userId;
    if(currentUser){
        userId=currentUser.id;
    }else{
        if(!window.anonymousUserId){
            window.anonymousUserId=crypto.randomUUID();
        }
        userId=window.anonymousUserId;
    }
    
    console.log('userId:', userId);
    
    try{
        // 네트워크 연결 확인
        console.log('네트워크 연결 확인 중...');
        try {
            const testResponse = await fetch('https://bxmppaxpzbkwebfbgpsm.supabase.co/rest/v1/', {
                method: 'HEAD',
                mode: 'no-cors' // CORS 오류 무시하고 연결만 확인
            });
            console.log('네트워크 연결 확인 완료');
        } catch (networkError) {
            console.warn('네트워크 연결 확인 실패 (계속 진행):', networkError);
        }
        
        const sessionData={
            session_code:sessionCode,
            narrator_id:userId,
            experiencer_id:null,
            alignment:0
        };
        
        console.log('세션 데이터 삽입 시도:', sessionData);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);
        
        let data, error;
        try {
            const result = await supabaseClient
                .from('live_sessions')
                .insert(sessionData)
                .select()
                .single();
            data = result.data;
            error = result.error;
        } catch (fetchError) {
            console.error('Fetch 오류 발생:', fetchError);
            console.error('Fetch 오류 타입:', fetchError.constructor.name);
            console.error('Fetch 오류 메시지:', fetchError.message);
            
            // DNS 해석 실패 또는 네트워크 오류
            if (fetchError.message && (
                fetchError.message.includes('Failed to fetch') ||
                fetchError.message.includes('ERR_NAME_NOT_RESOLVED') ||
                fetchError.message.includes('ERR_INTERNET_DISCONNECTED')
            )) {
                const errorMsg = '인터넷 연결을 확인할 수 없습니다.\n\n' +
                    '확인 사항:\n' +
                    '1. 인터넷 연결 상태 확인\n' +
                    '2. 방화벽/프록시 설정 확인\n' +
                    '3. DNS 서버 설정 확인\n' +
                    '4. Supabase 서비스 상태 확인';
                showNotification(errorMsg);
                throw new Error(errorMsg);
            }
            throw fetchError;
        }
        
        if(error){
            console.error('세션 생성 DB 오류:', error);
            console.error('DB 오류 코드:', error.code);
            console.error('DB 오류 메시지:', error.message);
            console.error('DB 오류 상세:', error.details);
            throw error;
        }
        
        if(!data){
            console.error('세션이 생성되지 않았습니다 (data가 null)');
            showNotification('세션 생성에 실패했습니다: 데이터가 반환되지 않았습니다');
            return null;
        }
        
        console.log('Session created successfully:', data);
        console.log('Session ID:', data.id);
        console.log('Session Code:', data.session_code);
        
        // 생성된 세션이 실제로 DB에 있는지 확인
        const{data:verifyData,error:verifyError}=await supabaseClient
            .from('live_sessions')
            .select('*')
            .eq('id', data.id)
            .single();
        
        if(verifyError || !verifyData){
            console.error('세션 검증 실패:', verifyError);
            showNotification('세션이 생성되었지만 검증에 실패했습니다');
            return null;
        }
        
        console.log('세션 검증 성공:', verifyData);
        
        currentSessionId=data.id;
        subscribeToSessionJoin();
        subscribeToExperiencerChoices();
        
        showNotification('세션이 생성되었습니다. 코드: ' + sessionCode);
        
        return data.id;
    }catch(e){
        console.error('createLiveSession error:', e);
        console.error('Error details:', JSON.stringify(e, null, 2));
        showNotification('세션 생성에 실패했습니다: ' + (e.message || '알 수 없는 오류'));
        return null;
    }
}
function subscribeToSessionJoin(){if(!supabaseClient||!currentSessionId){console.log('구독 실패: supabaseClient 또는 currentSessionId 없음',{supabaseClient:!!supabaseClient,currentSessionId});return}console.log('구독 시작, 세션 ID:',currentSessionId);const channel=supabaseClient.channel('session-join-'+currentSessionId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'live_sessions',filter:`id=eq.${currentSessionId}`},(payload)=>{console.log('이벤트 수신:',payload);if(payload.new.experiencer_id){console.log('체험자 참여 감지!',payload.new.experiencer_id);showNotification('체험자가 참여했습니다!');const sessionSetupEl=document.getElementById('sessionSetup');if(sessionSetupEl){sessionSetupEl.classList.remove('active');sessionSetupEl.style.display='none'}setTimeout(()=>startLiveSession(),500)}}).subscribe((status)=>{console.log('구독 상태:',status);if(status==='SUBSCRIBED'){console.log('구독 성공, 폴링 시작');checkExperiencerJoin()}});window.sessionJoinChannel=channel;console.log('구독 채널 생성 완료:',channel);checkExperiencerJoin()}
async function checkExperiencerJoin(){if(!supabaseClient||!currentSessionId||currentRole!=='A')return;if(window.experiencerCheckInterval){clearInterval(window.experiencerCheckInterval)}window.experiencerCheckInterval=setInterval(async()=>{try{const{data:session,error}=await supabaseClient.from('live_sessions').select('experiencer_id').eq('id',currentSessionId).single();if(error){console.error('세션 조회 오류:',error);return}if(session&&session.experiencer_id){console.log('폴링으로 체험자 참여 감지!',session.experiencer_id);clearInterval(window.experiencerCheckInterval);window.experiencerCheckInterval=null;showNotification('체험자가 참여했습니다!');const sessionSetupEl=document.getElementById('sessionSetup');if(sessionSetupEl){sessionSetupEl.classList.remove('active');sessionSetupEl.style.display='none'}setTimeout(()=>startLiveSession(),500)}}catch(e){console.error('checkExperiencerJoin error:',e)}},2000);setTimeout(()=>{if(window.experiencerCheckInterval){clearInterval(window.experiencerCheckInterval);window.experiencerCheckInterval=null;console.log('폴링 종료 (30초 경과)')}},30000)}
function subscribeToLiveScenes(){
    if(!supabaseClient||!currentSessionId){return}
    console.log('live_scenes 구독 시작, 세션 ID:',currentSessionId);
    const channel=supabaseClient.channel('live-scenes-'+currentSessionId).on('postgres_changes',{
        event:'INSERT',
        schema:'public',
        table:'live_scenes',
        filter:`session_id=eq.${currentSessionId}`
    },(payload)=>{
        console.log('새 장면 수신:',payload);
        if(currentRole==='B'){
            const sceneText=payload.new.scene_text;
            if(sceneText){
                const expSceneText=document.getElementById('expSceneText');
                if(expSceneText){
                    expSceneText.textContent=sceneText;
                    switchExpGeneratedTab('scene');
                    expCurrentPhase='interpret';
                    const emotionCueMsg=window.lastSceneData?.emotionCue||'이 장면에서 어떤 감정이 느껴져?';
                    addExpChatMessage('ai','화자의 기억이 도착했어. '+emotionCueMsg);
                    const expTextInput=document.getElementById('expTextInput');
                    if(expTextInput){
                        expTextInput.value='';
                        expTextInput.focus();
                    }
                }
            }
        }
    }).subscribe((status)=>{if(status==='SUBSCRIBED'){console.log('live_scenes 구독 성공')}else if(status==='CHANNEL_ERROR'){console.log('live_scenes 구독 실패 (무시됨)')}});
    window.liveScenesChannel=channel;
}
function subscribeToLiveInterpretations(){
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    return;
}
function displayExperiencerEmotionForNarrator(interpretation){console.log('displayExperiencerEmotionForNarrator 호출:',interpretation);if(!interpretation||!interpretation.emotion_vector){console.error('해석 데이터 또는 감정 벡터가 없습니다');return}const emotionVector=interpretation.emotion_vector;console.log('화자 화면에 체험자 감정 표시:',emotionVector);window.experiencerEmotionVector=emotionVector;const experiencerWave=computeWaveFromEmotion({base:emotionVector});window.currentExperiencerWave=experiencerWave;updateAlignmentWave();showNotification('체험자가 감정을 입력했습니다');console.log('체험자 감정 파동 업데이트 완료')}
function subscribeToExperiencerChoices(){supabaseClient = getSupabaseClient(); if(!supabaseClient){console.error('subscribeToExperiencerChoices: supabaseClient 없음');return}if(!currentSessionId){console.error('subscribeToExperiencerChoices: currentSessionId 없음');return}console.log('체험자 감정 구독 시작, 세션:',currentSessionId);const channel=supabaseClient.channel('choices-'+currentSessionId).on('postgres_changes',{event:'INSERT',schema:'public',table:'choices',filter:`live_session_id=eq.${currentSessionId}`},(payload)=>{console.log('체험자 감정 수신 (choices 테이블):',payload);console.log('payload.new:',payload.new);if(payload.new&&payload.new.emotion_vector){onExperiencerChoiceReceived(payload.new)}else{console.error('payload.new 또는 emotion_vector가 없습니다')}}).subscribe((status)=>{if(status==='SUBSCRIBED'){console.log('choices 테이블 구독 성공!')}else if(status==='CHANNEL_ERROR'){console.log('choices 테이블 구독 실패 (무시됨)')}});window.experiencerChoicesChannel=channel;console.log('choices 채널 생성 완료:',channel)}
function onExperiencerChoiceReceived(choice){console.log('체험자 감정 도착 (choices 테이블):',choice);console.log('emotion_vector:',choice.emotion_vector);if(!choice||!choice.emotion_vector){console.error('choice 또는 emotion_vector가 없습니다');return}const emotionVector=choice.emotion_vector;console.log('화자 화면에 체험자 감정 반영 시작:',emotionVector);window.experiencerEmotionVector=emotionVector;const experiencerWave=computeWaveFromEmotion({base:emotionVector});window.currentExperiencerWave=experiencerWave;updateAlignmentWave();if(window.narratorEmotionVector){const similarity=cosineSimilarity(window.narratorEmotionVector,emotionVector);const alignment=Math.max(0,Math.min(1,similarity));currentAlignment=alignment;updateLiveAlignment(0);console.log('정렬도 계산 완료 (choices):',alignment)}showNotification('체험자가 감정을 입력했습니다 (choices)');console.log('체험자 감정 파동 업데이트 완료 (choices)')}
function subscribeToScenes(){supabaseClient = getSupabaseClient(); if(!supabaseClient){console.error('subscribeToScenes: supabaseClient 없음');return}if(!currentSessionId){console.error('subscribeToScenes: currentSessionId 없음');return}console.log('장면 구독 시작, 세션 ID:',currentSessionId);const channel=supabaseClient.channel('scenes-'+currentSessionId).on('postgres_changes',{event:'INSERT',schema:'public',table:'scenes',filter:`live_session_id=eq.${currentSessionId}`},(payload)=>{console.log('새 장면 수신 (scenes 테이블):',payload);console.log('payload.new:',payload.new);if(payload.new){displaySceneForExperiencer(payload.new)}else{console.error('payload.new가 없습니다')}}).subscribe((status)=>{if(status==='SUBSCRIBED'){console.log('scenes 테이블 구독 성공!')}else if(status==='CHANNEL_ERROR'){console.log('scenes 테이블 구독 실패 (무시됨)')}});window.scenesChannel=channel;console.log('scenes 채널 생성 완료:',channel)}
function displaySceneForExperiencer(scene){console.log('displaySceneForExperiencer 호출:',scene);if(!scene){console.error('장면 객체가 없습니다');return}if(!scene.text){console.error('장면 텍스트가 없습니다. scene:',JSON.stringify(scene));return}console.log('체험자 화면에 장면 표시 시작:',scene.text);const expSceneText=document.getElementById('expSceneText');if(expSceneText){expSceneText.textContent=scene.text;console.log('장면 텍스트 업데이트 완료');switchExpGeneratedTab('scene');expCurrentPhase='interpret';window.currentSceneId=scene.id||null;const expChatMessages=document.getElementById('expChatMessages');if(expChatMessages){expChatMessages.style.display='block';expChatMessages.innerHTML=''}const emotionCueMsg=window.lastSceneData?.emotionCue||'이 장면에서 어떤 감정이 느껴져?';addExpChatMessage('ai','화자의 기억이 도착했어.');addExpChatMessage('ai',emotionCueMsg);const expTextInput=document.getElementById('expTextInput');if(expTextInput){expTextInput.value='';expTextInput.focus();expTextInput.placeholder='감정을 입력하세요...'}showNotification('새 장면이 도착했습니다')}else{console.error('expSceneText 요소를 찾을 수 없습니다')}}
function cosineSimilarity(vec1,vec2){if(!vec1||!vec2)return 0;const keys=['fear','sadness','anger','joy','longing','guilt','isolation','numbness','shame','moral_pain'];let dotProduct=0;let mag1=0;let mag2=0;keys.forEach(key=>{const v1=vec1[key]||0;const v2=vec2[key]||0;dotProduct+=v1*v2;mag1+=v1*v1;mag2+=v2*v2});mag1=Math.sqrt(mag1);mag2=Math.sqrt(mag2);if(mag1===0||mag2===0)return 0;return dotProduct/(mag1*mag2)}
function calculateComplexAlignment(userVector,originalVector){if(!userVector||!originalVector)return 0;const emotionScore=cosineSimilarity(userVector.base,originalVector.base||originalVector);let reasonScore=0;const userReason=userVector.reason_analysis||{};const origReason=originalVector.reason_analysis||{};if(userReason.attribution&&userReason.attribution===origReason.attribution){reasonScore+=0.5}if(userReason.core_fear&&userReason.core_fear===origReason.core_fear){reasonScore+=0.5}let voidScore=0;if(!!userReason.is_void===!!origReason.is_void){voidScore=1.0}const totalAlignment=(emotionScore*0.4)+(reasonScore*0.4)+(voidScore*0.2);console.log('=== 정렬도 계산 상세 ===');console.log(`감정: ${(emotionScore*0.4).toFixed(2)}, 이유: ${(reasonScore*0.4).toFixed(2)}, VOID: ${(voidScore*0.2).toFixed(2)}`);console.log(`최종: ${totalAlignment.toFixed(2)}`);return totalAlignment}
function updateAlignmentDisplay(){const alignmentValueEl=document.getElementById('alignmentValue');const alignmentFillEl=document.getElementById('alignmentFill');if(alignmentValueEl){alignmentValueEl.textContent=currentAlignment.toFixed(2)}if(alignmentFillEl){alignmentFillEl.style.width=(currentAlignment*100)+'%'}}
function renderArchiveEmotionWave(emotionVector){if(!emotionVector)return;const canvas=document.getElementById('waveCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');const width=canvas.width/2;const height=canvas.height/2;const centerY=height/2;ctx.fillStyle='rgba(18,18,26,0.1)';ctx.fillRect(0,0,width,height);const waveData=computeWaveFromEmotion({base:emotionVector,intensity:0.5,confidence:0.8});ctx.beginPath();ctx.strokeStyle=waveData.color||'rgba(196,168,130,0.6)';ctx.lineWidth=1.5;let time=Date.now()*0.001;for(let x=0;x<width;x++){const y=centerY+Math.sin(x*waveData.frequency+time)*waveData.amplitude*20;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();console.log('Archive emotion wave rendered:',waveData)}
async function saveArchiveEmotionToPlays(userEmotionVector,userReason,scene,currentData,sceneAlignment,reasonVector=null){try{supabaseClient = getSupabaseClient(); if(!supabaseClient){console.warn('Supabase 클라이언트가 없어 plays 테이블에 저장하지 않습니다');return}const memoryId=currentData.id||(allMemoriesData[currentMemory]&&allMemoriesData[currentMemory].id);if(!memoryId){console.warn('memory_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');return}const sceneId=scene.id;if(!sceneId){console.warn('scene_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');return}const sceneText=scene.text||'';const voidLevel=scene.voidInfo?.voidLevel||'low';const waveData=computeArchiveWaveData(userEmotionVector,sceneText.length,voidLevel);const insertData={memory_id:memoryId,scene_id:sceneId,user_emotion:userEmotionVector,user_reason:userReason,wave_data:waveData,layer_id:0,alignment:sceneAlignment!==undefined?sceneAlignment:null,reason_vector:reasonVector};console.log('Archive plays 저장 시도:',insertData);const{data,error}=await supabaseClient.from('plays').insert(insertData).select().single();if(error){console.error('Archive plays 저장 실패:',error);return}console.log('Archive plays 저장 성공:',data)}catch(e){console.error('saveArchiveEmotionToPlays error:',e)}}
function computeArchiveWaveData(emotionVector,sceneTextLength,voidLevel){const totalEmotion=Object.values(emotionVector).reduce((sum,val)=>sum+(val||0),0);const normalizedEmotion=totalEmotion>0?Object.keys(emotionVector).reduce((acc,key)=>{acc[key]=(emotionVector[key]||0)/totalEmotion;return acc},{}):emotionVector;const intensity=Math.min(1,Math.max(0.3,totalEmotion/8));const wavePoints=[];const width=Math.max(100,Math.min(500,sceneTextLength*10));for(let i=0;i<width;i++){const x=i/width;const baseY=0.5;const amplitude=voidLevel==='high'?0.15:0.25;const frequency=0.02+intensity*0.01;const y=baseY+Math.sin(x*Math.PI*2*frequency*10)*amplitude;wavePoints.push({x,y})}const dominantEmotion=Object.keys(normalizedEmotion).reduce((a,b)=>normalizedEmotion[a]>normalizedEmotion[b]?a:b,'fear');const emotionColors={'fear':'rgba(74,144,217,0.8)','sadness':'rgba(90,122,154,0.8)','guilt':'rgba(139,115,85,0.8)','anger':'rgba(217,74,74,0.8)','longing':'rgba(196,168,130,0.8)','isolation':'rgba(74,74,90,0.8)','numbness':'rgba(106,106,106,0.8)','shame':'rgba(155,89,182,0.8)','moral_pain':'rgba(155,89,182,0.8)'};return{wavePoints,color:emotionColors[dominantEmotion]||'rgba(196,168,130,0.8)',intensity,voidLevel}}
async function checkAlignment(){
    if(!supabaseClient||!currentSessionId)return;
    if(window.narratorEmotionVector&&window.experiencerEmotionVector){
        const similarity=cosineSimilarity(window.narratorEmotionVector,window.experiencerEmotionVector);
        const alignment=Math.max(0,Math.min(1,similarity));
        currentAlignment=alignment;
        updateLiveAlignment(0);
        updateAlignmentWave();
        console.log('정렬도 계산 완료:',alignment);
        return;
    }
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    return;
}
function updateAlignmentWave(){const canvas=document.getElementById('alignmentWaveCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');if(!window.narratorEmotionVector||!window.experiencerEmotionVector)return;const narratorWave=computeWaveFromEmotion({base:window.narratorEmotionVector});const experiencerWave=computeWaveFromEmotion({base:window.experiencerEmotionVector});currentNarratorWave=narratorWave;window.currentExperiencerWave=experiencerWave;console.log('파동 업데이트:',{narrator:narratorWave,experiencer:experiencerWave})}
async function joinLiveSession(){
    console.log('=== joinLiveSession 시작 ===');
    
    // Supabase 클라이언트 초기화 대기
    let retryCount = 0;
    const maxRetries = 20; // 최대 10초 대기 (20 * 500ms)
    
    while(retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if(supabaseClient) {
            console.log('Supabase 클라이언트 초기화 완료');
            break;
        }
        console.log(`Supabase 클라이언트 대기 중... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }
    
    if(!supabaseClient){
        console.error('Supabase 클라이언트가 초기화되지 않음 (최대 대기 시간 초과)');
        console.error('window.supabase 존재 여부:', typeof window.supabase !== 'undefined');
        showNotification('Supabase 연결에 실패했습니다. 네트워크 연결을 확인해주세요.');
        return;
    }
    
    const code=document.getElementById('sessionCodeInput').value.trim().toUpperCase();
    console.log('입력된 코드:', code);
    
    if(!code||code.length!==5){
        console.warn('코드 형식 오류:', code);
        showNotification('올바른 코드를 입력하세요 (5자리)');
        return;
    }
    
    let userId;
    if(currentUser){
        userId=currentUser.id;
    }else{
        if(!window.anonymousUserId){
            window.anonymousUserId=crypto.randomUUID();
        }
        userId=window.anonymousUserId;
    }
    
    console.log('userId:', userId);
    
    try{
        console.log('세션 검색 시작, 코드:', code);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);
        
        let sessions, error;
        try {
            const result = await supabaseClient
                .from('live_sessions')
                .select('*')
                .eq('session_code',code)
                .limit(10);
            sessions = result.data;
            error = result.error;
        } catch (fetchError) {
            console.error('Fetch 오류 발생:', fetchError);
            console.error('Fetch 오류 타입:', fetchError.constructor.name);
            console.error('Fetch 오류 메시지:', fetchError.message);
            
            // DNS 해석 실패 또는 네트워크 오류
            if (fetchError.message && (
                fetchError.message.includes('Failed to fetch') ||
                fetchError.message.includes('ERR_NAME_NOT_RESOLVED') ||
                fetchError.message.includes('ERR_INTERNET_DISCONNECTED')
            )) {
                const errorMsg = '인터넷 연결을 확인할 수 없습니다.\n\n' +
                    '확인 사항:\n' +
                    '1. 인터넷 연결 상태 확인\n' +
                    '2. 방화벽/프록시 설정 확인\n' +
                    '3. DNS 서버 설정 확인\n' +
                    '4. Supabase 서비스 상태 확인';
                showNotification(errorMsg);
                return;
            }
            throw fetchError;
        }
        
        if(error){
            console.error('joinLiveSession query error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            showNotification('세션을 찾을 수 없습니다. 코드를 확인해주세요. (오류: ' + (error.message || '알 수 없는 오류') + ')');
            return;
        }
        
        console.log('검색된 세션들:', sessions);
        console.log('검색된 세션 수:', sessions?.length || 0);
        
        if(!sessions || sessions.length === 0){
            console.warn('세션을 찾을 수 없음 - 코드:', code);
            showNotification('세션을 찾을 수 없습니다. 코드를 확인해주세요.');
            return;
        }
        
        // 클라이언트 측에서 필터링
        const session=sessions.find(s=>
            s.session_code===code&&
            !s.experiencer_id&&
            !s.ended_at
        );
        
        console.log('필터링된 세션:', session);
        
        if(!session){
            console.warn('접속 가능한 세션 없음');
            console.log('세션 상태:', sessions.map(s => ({
                code: s.session_code,
                has_experiencer: !!s.experiencer_id,
                ended: !!s.ended_at
            })));
            showNotification('접속 가능한 세션이 없습니다. 이미 참여자가 있거나 종료된 세션일 수 있습니다.');
            return;
        }
        
        console.log('세션 참여 시도, 세션 ID:', session.id);
        
        const{data:updateData,error:updateError}=await supabaseClient
            .from('live_sessions')
            .update({experiencer_id:userId})
            .eq('id',session.id)
            .select()
            .single();
        
        if(updateError){
            console.error('참여 실패:', updateError);
            console.error('Error details:', JSON.stringify(updateError, null, 2));
            showNotification('세션 참여에 실패했습니다: ' + updateError.message);
            return;
        }
        
        console.log('세션 참여 성공:', updateData);
        
        sessionCode=code;
        currentSessionId=session.id;
        
        showNotification('세션에 접속했습니다!');
        subscribeToNarratorEmotion();
        setTimeout(()=>startLiveSession(),500);
    }catch(e){
        console.error('joinLiveSession error:', e);
        console.error('Error stack:', e.stack);
        showNotification('세션 참여 중 오류가 발생했습니다: ' + (e.message || '알 수 없는 오류'));
    }
}
function subscribeToNarratorEmotion(){if(!supabaseClient||!currentSessionId){console.error('subscribeToNarratorEmotion: supabaseClient 또는 currentSessionId 없음');return}console.log('화자 감정 구독 시작, 세션 ID:',currentSessionId);const channel=supabaseClient.channel('narrator-scenes-'+currentSessionId).on('postgres_changes',{event:'INSERT',schema:'public',table:'scenes',filter:`live_session_id=eq.${currentSessionId}`},(payload)=>{console.log('화자 장면/감정 수신:',payload.new);if(payload.new&&payload.new.emotion_vector){window.narratorEmotionVector=payload.new.emotion_vector;console.log('화자 감정 벡터 저장:',window.narratorEmotionVector);updateExperiencerAlignment()}}).subscribe((status)=>{console.log('화자 감정 구독 상태:',status);if(status==='SUBSCRIBED'){console.log('화자 감정 구독 성공!')}else if(status==='CHANNEL_ERROR'){console.error('화자 감정 구독 실패')}});window.narratorEmotionChannel=channel;console.log('화자 감정 채널 생성 완료:',channel)}
function updateExperiencerAlignment(){if(!window.narratorEmotionVector||!window.experiencerEmotionVector){console.log('정렬도 계산 불가: 감정 벡터 없음',{narrator:!!window.narratorEmotionVector,experiencer:!!window.experiencerEmotionVector});return}const similarity=cosineSimilarity(window.narratorEmotionVector,window.experiencerEmotionVector);const alignment=Math.max(0,Math.min(1,similarity));currentAlignment=alignment;const expAlignmentPercentage=document.getElementById('expAlignmentPercentage');if(expAlignmentPercentage){expAlignmentPercentage.textContent=String(Math.round(alignment*100)).padStart(2,'0')+'%'}updateAlignmentWave();console.log('체험자 화면 정렬도 업데이트:',alignment)}
async function saveLiveScene(sceneData){console.log('=== saveLiveScene 호출 ===');console.log('sceneData:',JSON.stringify(sceneData));console.log('currentSessionId:',currentSessionId);console.log('liveSceneNum:',liveSceneNum);console.log('currentGeneratedScene:',currentGeneratedScene);supabaseClient = getSupabaseClient(); if(!supabaseClient){console.error('supabaseClient가 없습니다!');showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}if(!currentSessionId){console.error('currentSessionId가 없습니다!');showNotification('세션이 없습니다');return}const sceneText=sceneData.text||currentGeneratedScene||pendingSceneText||'';if(!sceneText||sceneText==='(장면 없음)'){console.error('장면 텍스트가 없습니다!');showNotification('저장할 장면이 없습니다');return}const insertData={session_id:currentSessionId,scene_index:liveSceneNum,scene_text:sceneText,emotion_raw:sceneData.emotionRaw||'',reason_raw:sceneData.reasonRaw||'',generated_emotion:sceneData.generatedEmotion||'',emotion_vector:sceneData.emotionAnalysis?.base||{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},intensity:sceneData.emotionAnalysis?.intensity||0.5,confidence:sceneData.emotionAnalysis?.confidence||0.5,void_scene:sceneData.voidInfo?.sceneVoid||false,void_emotion:sceneData.voidInfo?.emotionVoid||false,void_reason:sceneData.voidInfo?.reasonVoid||false};console.log('insertData:',JSON.stringify(insertData));try{const{data,error}=await supabaseClient.from('live_scenes').insert(insertData).select();if(error){console.error('live_scenes INSERT error:',error);throw error}console.log('live_scenes 저장 성공:',data);await saveSceneToLiveSession({text:sceneText,emotion_vector:sceneData.emotionAnalysis?.base||{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0}});showNotification('장면이 체험자에게 전송되었습니다')}catch(e){console.error('saveLiveScene error:',e);showNotification('장면 저장 실패: '+e.message)}}
async function saveSceneToLiveSession(sceneData){console.log('=== saveSceneToLiveSession 호출 ===');console.log('sceneData:',JSON.stringify(sceneData));console.log('currentSessionId:',currentSessionId);console.log('currentSceneOrder:',currentSceneOrder);supabaseClient = getSupabaseClient(); if(!supabaseClient){console.error('supabaseClient가 없습니다!');showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}if(!currentSessionId){console.error('currentSessionId가 없습니다!');showNotification('세션이 없습니다');return}const sceneText=sceneData.text||'';if(!sceneText){console.error('장면 텍스트가 없습니다!');showNotification('저장할 장면이 없습니다');return}try{const insertData={live_session_id:currentSessionId,scene_order:currentSceneOrder,text:sceneText,emotion_vector:sceneData.emotion_vector||{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},created_at:new Date().toISOString()};console.log('scenes INSERT 데이터:',JSON.stringify(insertData));const{data,error}=await supabaseClient.from('scenes').insert(insertData).select().single();if(error){console.error('scenes INSERT error:',error);console.error('에러 상세:',JSON.stringify(error));throw error}console.log('scenes 저장 완료:',data);currentSceneOrder++;showNotification('장면이 scenes 테이블에 저장되었습니다')}catch(e){console.error('saveSceneToLiveSession error:',e);showNotification('scenes 테이블 저장 실패: '+e.message)}}
async function endLiveSession(){if(!supabaseClient||!currentSessionId)return;try{await supabaseClient.from('live_sessions').update({ended_at:new Date().toISOString(),alignment:currentAlignment}).eq('id',currentSessionId);console.log('Session ended')}catch(e){console.error('endLiveSession error:',e)}}
async function startLiveSession(){try{if(!currentSessionId&&currentRole==='B'){console.warn('체험자 세션 ID가 없습니다');return}if(!currentSessionId&&currentRole==='A'){currentSessionId=await createLiveSession();if(!currentSessionId){console.warn('세션 생성 실패, 계속 진행합니다')}}subscribeToLiveScenes();subscribeToScenes();currentSceneOrder=1;window.currentStoryData=storyData;currentScene=0;userChoices=[];userReasons=[];conversationHistory=[];currentGeneratedSceneObj=null;currentGeneratedEmotion=null;currentAlignment=0;currentPhase='scene';pendingSceneText='';pendingEmotionText='';currentGeneratedScene='';finalSceneObject=null;isEditMode=false;const sceneContent=document.querySelector('#generatedSceneContent .generated-text');if(sceneContent)sceneContent.textContent='';const emotionContent=document.querySelector('#generatedEmotionContent .generated-text');if(emotionContent)emotionContent.textContent='';const chatMessages=document.getElementById('chatMessages');if(chatMessages){chatMessages.innerHTML='<div class="chat-message ai"><div class="chat-message-label">또다른 나</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>'}const editBtn=document.querySelector('.edit-toggle-btn');if(editBtn){editBtn.textContent='수정';editBtn.classList.remove('active')}const sceneTextarea=document.getElementById('editSceneTextarea');if(sceneTextarea){sceneTextarea.style.display='none';sceneTextarea.value=''}const emotionTextarea=document.getElementById('editEmotionTextarea');if(emotionTextarea){emotionTextarea.style.display='none';emotionTextarea.value=''}const sceneTextEl=document.querySelector('#generatedSceneContent .generated-text');if(sceneTextEl)sceneTextEl.style.display='block';switchGeneratedTab('scene');updateUserStats('liveSession',1);const sessionSetupEl=document.getElementById('sessionSetup');if(sessionSetupEl){sessionSetupEl.classList.remove('active');sessionSetupEl.style.display='none'}const liveContainerEl=document.getElementById('liveContainer');if(liveContainerEl){liveContainerEl.classList.add('active');liveContainerEl.style.cssText='display:block !important'}const liveContentEl=document.querySelector('.live-content');if(liveContentEl){if(currentRole==='A'){liveContentEl.classList.add('narrator-mode')}else{liveContentEl.classList.remove('narrator-mode')}};const narratorLastChoiceSection=document.getElementById('narratorLastChoiceSection');if(narratorLastChoiceSection)narratorLastChoiceSection.style.display='none';const liveProgressSection=document.getElementById('liveProgressSection');if(liveProgressSection)liveProgressSection.style.display=currentRole==='A'?'block':'none';const traceLabel=document.getElementById('traceLabel');if(traceLabel)traceLabel.textContent=currentRole==='A'?'해석의 흔적':'기억의 흔적';if(currentRole==='A'){const narratorPanelEl=document.getElementById('narratorPanel');if(narratorPanelEl)narratorPanelEl.classList.add('active');const interpretationTrace=document.getElementById('interpretationTrace');const traceContent=document.getElementById('traceContent');if(interpretationTrace&&traceContent){interpretationTrace.style.display='block';traceContent.textContent='체험자가 장면을 기다리고있습니다...'}showNpcDialogue("당신의 기억을 불러오세요. 지금 입력하는 장면이 이 기억의 원본 음각이 됩니다.",4000)}else{const experiencerPanelEl=document.getElementById('experiencerPanel');if(experiencerPanelEl){experiencerPanelEl.classList.add('active');expCurrentPhase='waiting';expPendingEmotion='';expGeneratedEmotion='';expFinalObject=null;const expSceneText=document.getElementById('expSceneText');if(expSceneText)expSceneText.innerHTML='화자가 기억을 불러오고 있습니다<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';const expEmotionText=document.getElementById('expEmotionText');if(expEmotionText)expEmotionText.textContent='';const sceneDisplay=document.getElementById('expGeneratedSceneContent');if(sceneDisplay)sceneDisplay.style.display='block';const emotionDisplay=document.getElementById('expGeneratedEmotionContent');if(emotionDisplay)emotionDisplay.style.display='none';showNpcDialogue("곧 누군가의 원본 기억이 열릴 거야. 그 안에서 네 감정을 솔직하게 남겨줘.",4000)}else{showNotification('체험자 패널을 찾을 수 없습니다')}}startAlignmentWaveAnimation();setTimeout(()=>{startVoiceWaveLiveAnimation()},300);const footer=document.querySelector('.footer');if(footer)footer.classList.add('visible')}catch(e){console.error('startLiveSession error:',e);showNotification('세션을 시작하는 중 오류가 발생했습니다: '+e.message)}}
async function sendNarratorInput(){console.log('sendNarratorInput called');const input=document.getElementById('narratorInput');if(!input||!input.value.trim()){showNotification('기억을 입력해주세요');return}const inputText=input.value.trim();const sendBtn=document.querySelector('.narrator-send-btn');if(sendBtn)sendBtn.disabled=true;if(sendBtn)sendBtn.textContent='AI가 장면을 변환 중...';showNotification('AI가 장면을 변환하고 있습니다...');try{const convertedScene=await generateSceneAI(inputText);const liveSceneContent=document.getElementById('liveSceneContent');if(liveSceneContent){liveSceneContent.textContent=convertedScene}const experiencerPanel=document.getElementById('experiencerPanel');if(experiencerPanel){experiencerPanel.classList.add('active')}const traceContent=document.getElementById('traceContent');if(traceContent){traceContent.textContent='장면이 체험자에게 전송되었습니다'}showNotification('장면이 체험자에게 전송되었습니다');input.value='';const reasonInput=document.getElementById('narratorReason');if(reasonInput)reasonInput.value='';updateLiveAlignment(0.15);liveSceneNum++;const liveSceneNumEl=document.getElementById('liveSceneNum');if(liveSceneNumEl)liveSceneNumEl.textContent=liveSceneNum}catch(error){console.error('sendNarratorInput error:',error);showNotification('장면 변환 중 오류가 발생했습니다: '+error.message);const liveSceneContent=document.getElementById('liveSceneContent');if(liveSceneContent){liveSceneContent.textContent=inputText}}finally{if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='전송'}}}
let inputPhase='scene';let currentSceneText='';let isVoiceMode=false;
async function handleUnifiedSubmit(providedText){console.log('handleUnifiedSubmit called');console.log('=== handleUnifiedSubmit ===');console.log('currentPhase:',currentPhase);let inputText='';if(providedText){inputText=providedText.trim()}else{const input=document.getElementById('unifiedInput');if(!input||!input.value.trim()){showNotification('입력을 입력해주세요');return}inputText=input.value.trim();input.value=''}console.log('inputText:',inputText);if(currentPhase==='scene'){pendingSceneText=inputText;addChatMessage('user',inputText);try{const aiScene=await generateSceneAI(inputText);currentGeneratedScene=aiScene;console.log('currentGeneratedScene (after AI):',currentGeneratedScene);const sceneContent=document.querySelector('#generatedSceneContent .generated-text');if(sceneContent)sceneContent.textContent=aiScene;switchGeneratedTab('scene');addChatMessageWithConfirm('ai','이 기억이 맞아?');}catch(error){console.error('generateSceneAI error:',error);showNotification('장면 생성 중 오류가 발생했습니다');currentGeneratedScene=inputText;const sceneContent=document.querySelector('#generatedSceneContent .generated-text');if(sceneContent)sceneContent.textContent=inputText;switchGeneratedTab('scene');addChatMessageWithConfirm('ai','이 기억이 맞아?')}return}if(currentPhase==='emotion'){console.log('=== EMOTION PHASE ===');console.log('inputText:',inputText);addChatMessage('user',inputText);let emotionResult=null;try{showNotification('AI가 감정을 분석하고 변환하고 있습니다...');emotionResult=await analyzeEmotionWithVector(inputText,'');console.log('emotionResult (raw):',JSON.stringify(emotionResult))}catch(e){console.error('Emotion analysis failed:',e);showNotification('감정 분석 실패: '+e.message)}if(!emotionResult||!emotionResult.generatedEmotion||emotionResult.generatedEmotion===inputText){console.warn('AI 감정 변환 실패, 원본 텍스트 사용');emotionResult={generatedEmotion:inputText,analysis:emotionResult?.analysis||{base:{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},detailed:[],intensity:0.5,confidence:0.3}}}console.log('최종 emotionResult:',emotionResult);const emotionContent=document.querySelector('#generatedEmotionContent .generated-text');if(emotionContent){emotionContent.textContent=emotionResult.generatedEmotion;console.log('생성된 감정 표시:',emotionResult.generatedEmotion)}switchGeneratedTab('emotion');const parsed=parseEmotionInput(inputText);const sceneText=currentGeneratedScene||pendingSceneText||'';console.log('sceneText for finalSceneObject:',sceneText);console.log('currentGeneratedScene:',currentGeneratedScene);console.log('pendingSceneText:',pendingSceneText);const voidInfo={sceneVoid:!sceneText||sceneText.includes('기억 안 나'),emotionVoid:!parsed.emotion,reasonVoid:!parsed.reason};finalSceneObject={text:sceneText,emotionRaw:parsed.emotion||inputText,reasonRaw:parsed.reason||'',generatedEmotion:emotionResult.generatedEmotion,emotionAnalysis:emotionResult.analysis,voidInfo:voidInfo};console.log('finalSceneObject 생성:',JSON.stringify(finalSceneObject));addChatMessageWithConfirm('ai','이 감정이 맞아?');return}}
let recognition=null;let audioContext=null;let analyser=null;let microphone=null;let voiceAnimationId=null;let recognizedText='';
const SUPABASE_FUNCTION_URL='https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene';
async function generateSceneAI(inputText){try{const response=await fetch(SUPABASE_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${SUPABASE_ANON_KEY}`},body:JSON.stringify({text:inputText})});if(!response.ok){const error=await response.json();throw new Error(error.error||error.details||'API 호출 실패')}const data=await response.json();console.log('generateSceneAI response:',data);if(data.scene){window.lastSceneData={scene:data.scene,voidHint:data.voidHint||'',emotionCue:data.emotionCue||''};return data.scene}else{throw new Error(data.error||'장면 변환 실패')}}catch(error){console.error('generateSceneAI error:',error);throw error}}
async function analyzeEmotionWithVector(emotionText,reasonText){console.log('analyzeEmotionWithVector 호출:',{emotionText,reasonText});try{const requestBody={type:'emotion_analysis',emotion:emotionText||'',reason:reasonText||''};console.log('API 요청 body:',JSON.stringify(requestBody));const response=await fetch(SUPABASE_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${SUPABASE_ANON_KEY}`},body:JSON.stringify(requestBody)});console.log('API 응답 status:',response.status);if(!response.ok){const errorText=await response.text();console.error('API 오류 응답:',errorText);throw new Error('API 호출 실패: '+response.status)}const data=await response.json();console.log('API 응답 data:',JSON.stringify(data));if(!data.generatedEmotion){console.warn('generatedEmotion이 응답에 없음')}return data}catch(error){console.error('analyzeEmotionWithVector error:',error);return{generatedEmotion:null,analysis:{base:{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},detailed:[],intensity:0.5,confidence:0.3}}}}
function startVoiceMode(){document.getElementById('voiceStartPrompt').style.display='none';document.getElementById('textInputContainer').style.display='none';document.getElementById('voiceWaveContainer').style.display='flex';isVoiceMode=true;startSpeechRecognition();startVoiceVisualization()}
function switchToTextMode(){if(recognition){recognition.stop()}stopVoiceVisualization();document.getElementById('voiceStartPrompt').style.display='none';document.getElementById('voiceWaveContainer').style.display='none';document.getElementById('textInputContainer').style.display='block';isVoiceMode=false;if(recognizedText){document.getElementById('sceneTextInput').value=recognizedText}}
function startSpeechRecognition(){if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){showNotification('이 브라우저는 음성 인식을 지원하지 않습니다');switchToTextMode();return}const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;recognition=new SpeechRecognition();recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;recognition.onresult=function(event){let interim='';let final='';for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal){final+=event.results[i][0].transcript}else{interim+=event.results[i][0].transcript}}if(final){recognizedText+=final+' '}};recognition.onerror=function(event){console.error('Speech recognition error:',event.error);if(event.error==='not-allowed'){showNotification('마이크 권한이 필요합니다')}};recognition.onend=function(){if(isVoiceMode){recognition.start()}};recognition.start();showNotification('음성 인식이 시작되었습니다')}
function startVoiceVisualization(){navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){audioContext=new(window.AudioContext||window.webkitAudioContext)();analyser=audioContext.createAnalyser();microphone=audioContext.createMediaStreamSource(stream);microphone.connect(analyser);analyser.fftSize=256;const bufferLength=analyser.frequencyBinCount;const dataArray=new Uint8Array(bufferLength);const canvas=document.getElementById('voiceWaveCanvas');const ctx=canvas.getContext('2d');canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight;function draw(){voiceAnimationId=requestAnimationFrame(draw);analyser.getByteFrequencyData(dataArray);ctx.fillStyle='rgba(18,18,26,0.3)';ctx.fillRect(0,0,canvas.width,canvas.height);const barWidth=(canvas.width/bufferLength)*2.5;let x=0;for(let i=0;i<bufferLength;i++){const barHeight=(dataArray[i]/255)*canvas.height*0.8;const gradient=ctx.createLinearGradient(0,canvas.height-barHeight,0,canvas.height);gradient.addColorStop(0,'rgba(196,168,130,0.8)');gradient.addColorStop(1,'rgba(196,168,130,0.4)');ctx.fillStyle=gradient;ctx.fillRect(x,canvas.height-barHeight,barWidth-1,barHeight);x+=barWidth}}draw()}).catch(function(err){console.error('Microphone access denied:',err);showNotification('마이크 접근이 거부되었습니다')})}
function stopVoiceVisualization(){if(voiceAnimationId){cancelAnimationFrame(voiceAnimationId)}if(audioContext){audioContext.close()}audioContext=null;analyser=null;microphone=null}
async function submitScene(){console.log('submitScene called');const input=document.getElementById('sceneTextInput');const submitBtn=document.querySelector('.scene-submit-btn');if(!input.value.trim()){showNotification('장면을 입력해주세요');return}currentSceneText=input.value.trim();submitBtn.disabled=true;submitBtn.textContent='AI가 장면을 변환 중...';try{const aiScene=await generateSceneAI(currentSceneText);const liveSceneContent=document.getElementById('liveSceneContent');if(liveSceneContent){liveSceneContent.textContent=aiScene}const traceContent=document.getElementById('traceContent');if(traceContent){traceContent.textContent='장면이 체험자에게 전송되었습니다'}showNotification('AI가 장면을 변환하여 전송했습니다')}catch(err){console.error('AI scene generation error:',err);showNotification('장면 변환 중 오류가 발생했습니다');const traceContent=document.getElementById('traceContent');if(traceContent){traceContent.textContent=currentSceneText}}input.value='';currentSceneText='';recognizedText='';submitBtn.disabled=false;submitBtn.textContent='제출';const voiceStartPrompt=document.getElementById('voiceStartPrompt');if(voiceStartPrompt)voiceStartPrompt.style.display='flex';const textInputContainer=document.getElementById('textInputContainer');if(textInputContainer)textInputContainer.style.display='none';updateLiveAlignment(0.15)}
function simulateNarratorInput(sceneText){
    try{
        const experiencerPanelEl=document.getElementById('experiencerPanel');
        if(!experiencerPanelEl||!experiencerPanelEl.classList.contains('active')){
            if(sceneText){
                setTimeout(()=>simulateNarratorInput(sceneText),100);
                return;
            }else{
                setTimeout(()=>simulateNarratorInput(),100);
                return;
            }
        }
        let textToDisplay='';
        if(sceneText){
            textToDisplay=sceneText;
        }else{
            if(currentMode==='live'){
                return;
            }
            const currentData=window.currentStoryData||storyData;
            if(!currentData||!currentData.scenes||currentScene>=currentData.scenes.length||!currentData.scenes[currentScene]){
                showNotification('장면 데이터를 불러올 수 없습니다');
                return;
            }
            const scene=currentData.scenes[currentScene];
            if(!scene||!scene.text){
                showNotification('장면 텍스트를 불러올 수 없습니다');
                return;
            }
            textToDisplay=scene.text;
        }
        const expSceneText=document.getElementById('expSceneText');
        if(expSceneText){
            expSceneText.textContent=textToDisplay;
        }
        switchExpGeneratedTab('scene');
        expCurrentPhase='interpret';
        const emotionCueMsg=window.lastSceneData?.emotionCue||'이 장면에서 어떤 감정이 느껴져?';
        addExpChatMessage('ai','화자의 기억이 도착했어. '+emotionCueMsg);
        const expTextInput=document.getElementById('expTextInput');
        if(expTextInput){
            expTextInput.value='';
            expTextInput.focus();
        }
    }catch(e){
        console.error('simulateNarratorInput error:',e);
        showNotification('장면을 불러오는 중 오류가 발생했습니다');
    }
}
function renderLiveChoices(choices){const container=document.getElementById('liveChoices');if(!container)return;container.innerHTML='';if(!choices||!Array.isArray(choices))return;choices.forEach((choice,i)=>{const btn=document.createElement('button');btn.className='choice-btn';btn.textContent=choice.text;btn.onclick=function(){makeLiveChoice(i)};container.appendChild(btn)})}
function renderLiveEchoLayer(words){const layer=document.getElementById('liveEchoLayer');if(!layer)return;layer.innerHTML='';if(!words||!Array.isArray(words))return;words.forEach(word=>{const span=document.createElement('span');span.className='echo-word';span.textContent=word;span.style.top=(20+Math.random()*60)+'%';span.style.left=(10+Math.random()*80)+'%';layer.appendChild(span)})}
function makeLiveChoice(choiceIndex){try{userChoices.push(choiceIndex);const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면 데이터를 불러올 수 없습니다');return}const scene=currentData.scenes[currentScene];if(choiceIndex===scene.originalChoice){liveMatches++;const matchesEl=document.getElementById('liveMatches');if(matchesEl)matchesEl.textContent=liveMatches}liveFragments++;const fragmentsEl=document.getElementById('liveFragments');if(fragmentsEl)fragmentsEl.textContent=liveFragments;const sceneType=scene.sceneType||'normal';if(sceneType==='branch'||sceneType==='ending'){const questionEl=document.getElementById('emotionQuestion');if(questionEl)questionEl.textContent=currentScene===0?"왜 그렇게 했어?":"지금 어떤 감정이 들어?";const modalEl=document.getElementById('emotionModal');if(modalEl)modalEl.classList.add('active');const inputEl=document.getElementById('emotionInputField');if(inputEl)inputEl.focus()}else{proceedToNextSceneLive()}}catch(e){console.error('makeLiveChoice error:',e);showNotification('오류가 발생했습니다')}}
function submitExperiencerFeeling(){try{const feelingInput=document.getElementById('experiencerFeelingInput');if(!feelingInput){showNotification('입력 필드를 찾을 수 없습니다');return}const feeling=feelingInput.value.trim();if(!feeling){showNotification('화자가 어떻게 느꼈을지 적어주세요');return}userReasons.push(feeling);liveFragments++;const fragmentsEl=document.getElementById('liveFragments');if(fragmentsEl)fragmentsEl.textContent=liveFragments;updateLiveAlignment(0.1+Math.random()*0.15);showNotification('감정이 기록되었습니다');feelingInput.value='';setTimeout(()=>{proceedToNextSceneLive()},1000)}catch(e){console.error('submitExperiencerFeeling error:',e);showNotification('오류가 발생했습니다')}}
function updateLiveAlignment(delta){currentAlignment=Math.min(1,currentAlignment+delta);const liveAlignmentValue=document.getElementById('liveAlignmentValue');if(liveAlignmentValue){liveAlignmentValue.textContent=currentAlignment.toFixed(2);if(currentAlignment>=0.8)liveAlignmentValue.classList.add('high')}const liveAlignmentFill=document.getElementById('liveAlignmentFill');if(liveAlignmentFill)liveAlignmentFill.style.width=(currentAlignment*100)+'%';const alignmentPercentage=document.getElementById('alignmentPercentage');if(alignmentPercentage)alignmentPercentage.textContent=String(Math.round(currentAlignment*100)).padStart(2,'0')+'%';const expAlignmentPercentage=document.getElementById('expAlignmentPercentage');if(expAlignmentPercentage)expAlignmentPercentage.textContent=String(Math.round(currentAlignment*100)).padStart(2,'0')+'%'}
let currentNarratorWave=null;
let alignmentWaveTime=0;
let alignmentMouseX=0,alignmentMouseY=0;
let alignmentIsMouseDown=false;
function lerp(a,b,t){return a+(b-a)*t}
function lerpColor(a,b,t){return{r:lerp(a.r,b.r,t),g:lerp(a.g,b.g,t),b:lerp(a.b,b.b,t)}}
function noise(x,y,z){const n=Math.sin(x*12.9898+y*78.233+(z||0)*37.719)*43758.5453;return n-Math.floor(n)}
function emotionVectorToWaveStyle(emotionVector){if(!emotionVector)return{color:{r:100,g:140,b:180},speed:0.3,amplitude:30,frequency:0.008,chaos:0.1,lineCount:8,trailOpacity:0.15};const intensity=Object.values(emotionVector).reduce((a,b)=>a+b,0)/6;const dominant=Object.entries(emotionVector).sort((a,b)=>b[1]-a[1])[0];const colors={fear:{r:100,g:80,b:180},sadness:{r:80,g:100,b:160},anger:{r:200,g:80,b:80},joy:{r:200,g:180,b:100},longing:{r:80,g:180,b:180},guilt:{r:150,g:130,b:100}};const baseColor=colors[dominant[0]]||colors.sadness;return{color:baseColor,speed:0.3+intensity*0.9,amplitude:30+intensity*50,frequency:0.008+intensity*0.012,chaos:0.1+intensity*0.7,lineCount:Math.max(4,Math.min(20,6+Math.floor(intensity*14))),trailOpacity:0.15-intensity*0.07}}
function getDominantEmotionColor(base){const entries=Object.entries(base||{});if(entries.length===0)return'rgba(196,168,130,';const dominant=entries.sort((a,b)=>b[1]-a[1])[0];const colorMap={fear:'rgba(100,80,180,',sadness:'rgba(70,130,200,',anger:'rgba(200,80,80,',joy:'rgba(220,180,60,',longing:'rgba(80,180,180,',guilt:'rgba(150,130,100,'};return colorMap[dominant[0]]||'rgba(196,168,130,'}
function getEmotionComplexity(base){if(!base)return 1;return Object.values(base).filter(v=>v>=0.2).length||1}
function computeWaveFromEmotion(emotionAnalysis){if(!emotionAnalysis){return{amplitude:0.5,frequency:0.015,color:'rgba(196,168,130,'}}return{amplitude:emotionAnalysis.intensity||0.5,frequency:0.01+getEmotionComplexity(emotionAnalysis.base)*0.005,color:getDominantEmotionColor(emotionAnalysis.base)}}
function updateNarratorWave(emotionAnalysis){currentNarratorWave=computeWaveFromEmotion(emotionAnalysis);console.log('화자 파동 업데이트:',currentNarratorWave)}
function stopAllLiveSubscriptions(){if(window.sessionJoinChannel){window.sessionJoinChannel.unsubscribe();window.sessionJoinChannel=null}if(window.liveScenesChannel){window.liveScenesChannel.unsubscribe();window.liveScenesChannel=null}if(window.liveInterpretationsChannel){window.liveInterpretationsChannel.unsubscribe();window.liveInterpretationsChannel=null}if(window.experiencerChoicesChannel){window.experiencerChoicesChannel.unsubscribe();window.experiencerChoicesChannel=null}if(window.scenesChannel){window.scenesChannel.unsubscribe();window.scenesChannel=null}if(window.narratorEmotionChannel){window.narratorEmotionChannel.unsubscribe();window.narratorEmotionChannel=null}if(window.experiencerCheckInterval){clearInterval(window.experiencerCheckInterval);window.experiencerCheckInterval=null}}
async function exitLive(){if(confirm('세션을 종료하시겠습니까?')){const wasRoleA=currentRole==='A';const wasFirstScene=liveSceneNum===1;stopAllLiveSubscriptions();stopAllAnimations();await endLiveSession();const liveContainerEl=document.getElementById('liveContainer');if(liveContainerEl){liveContainerEl.classList.remove('active');liveContainerEl.style.display='none'}currentSessionId=null;currentRole=null;sessionCode=null;if(wasRoleA&&wasFirstScene){restart()}else{showEndScreen()}}}
function drawAlignmentWave(canvas,offsetY,opacity,timeOffset,emotionVector){
    if(!canvas||!emotionVector)return;
    const ctx=canvas.getContext('2d');
    const width=canvas.width/2;
    const height=canvas.height/2;
    const t=alignmentWaveTime+timeOffset;
    const waveStyle=emotionVectorToWaveStyle(emotionVector);
    const points=[];
    const segments=100;
    for(let i=0;i<=segments;i++){
        const x=(i/segments)*width;
        const normalizedX=x/width;
        let y=Math.sin(x*waveStyle.frequency+t*waveStyle.speed)*waveStyle.amplitude;
        y+=Math.sin(x*waveStyle.frequency*2.3+t*waveStyle.speed*0.7)*(waveStyle.amplitude*0.4);
        y+=Math.sin(x*waveStyle.frequency*0.4+t*waveStyle.speed*0.3)*(waveStyle.amplitude*0.6);
        const chaosAmount=waveStyle.chaos*15;
        y+=(noise(x*0.01,t*0.1,0)-0.5)*chaosAmount;
        if(alignmentIsMouseDown){
            const rect=canvas.getBoundingClientRect();
            const canvasMouseX=alignmentMouseX-rect.left;
            const canvasMouseY=alignmentMouseY-rect.top;
            const dx=x-canvasMouseX;
            const dy=offsetY-canvasMouseY;
            const dist=Math.sqrt(dx*dx+dy*dy);
            const influence=Math.max(0,1-dist/300);
            y+=Math.sin(dist*0.02-t*2)*influence*80;
        }
        const edgeFade=Math.sin(normalizedX*Math.PI);
        y*=edgeFade;
        points.push({x,y:offsetY+y});
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length-2;i++){
        const xc=(points[i].x+points[i+1].x)/2;
        const yc=(points[i].y+points[i+1].y)/2;
        ctx.quadraticCurveTo(points[i].x,points[i].y,xc,yc);
    }
    const color=waveStyle.color;
    ctx.strokeStyle=`rgba(${color.r},${color.g},${color.b},${opacity})`;
    ctx.lineWidth=2;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.stroke();
}
function startAlignmentWaveAnimation(){
    const narratorCanvas=document.getElementById('alignmentWaveCanvas');
    const experiencerCanvas=document.getElementById('expAlignmentWaveCanvas');
    let narratorInitialized=false;
    let experiencerInitialized=false;
    function initializeCanvas(canvas){
        if(!canvas)return false;
        if(canvas.offsetWidth===0||canvas.offsetHeight===0)return false;
        try{
            const ctx=canvas.getContext('2d');
            canvas.width=canvas.offsetWidth*2;
            canvas.height=canvas.offsetHeight*2;
            ctx.scale(2,2);
            canvas.addEventListener('mousedown',(e)=>{alignmentIsMouseDown=true;const rect=canvas.getBoundingClientRect();alignmentMouseX=e.clientX;alignmentMouseY=e.clientY});
            canvas.addEventListener('mousemove',(e)=>{alignmentMouseX=e.clientX;alignmentMouseY=e.clientY});
            canvas.addEventListener('mouseup',()=>{alignmentIsMouseDown=false});
            canvas.addEventListener('mouseleave',()=>{alignmentIsMouseDown=false});
            return true;
        }catch(e){
            return false;
        }
    }
    function animateWave(canvas){
        if(!canvas)return;
        try{
            const ctx=canvas.getContext('2d');
            const width=canvas.width/2;
            const height=canvas.height/2;
            const alignmentValue=currentAlignment||0;
            const alignmentPercent=Math.round(alignmentValue*100);
            const percentageEl=document.getElementById('alignmentPercentage');
            if(percentageEl)percentageEl.textContent=String(alignmentPercent).padStart(2,'0')+'%';
            const expPercentageEl=document.getElementById('expAlignmentPercentage');
            if(expPercentageEl)expPercentageEl.textContent=String(alignmentPercent).padStart(2,'0')+'%';
            ctx.fillStyle='rgba(10,10,12,0.85)';
            ctx.fillRect(0,0,width,height);
            if(window.narratorEmotionVector){
                const narratorY=height*0.3;
                drawAlignmentWave(canvas,narratorY,0.7,0,window.narratorEmotionVector);
            }
            if(window.experiencerEmotionVector){
                const experiencerY=height*0.7;
                drawAlignmentWave(canvas,experiencerY,0.7,50,window.experiencerEmotionVector);
            }
        }catch(e){
            console.error('Alignment wave animation error:',e);
        }
    }
    function animate(){
        if(narratorCanvas){
            if(!narratorInitialized){
                narratorInitialized=initializeCanvas(narratorCanvas);
            }
            if(narratorInitialized){
                animateWave(narratorCanvas);
            }
        }
        if(experiencerCanvas){
            if(!experiencerInitialized){
                experiencerInitialized=initializeCanvas(experiencerCanvas);
            }
            if(experiencerInitialized){
                animateWave(experiencerCanvas);
            }else if(experiencerCanvas.offsetWidth>0&&experiencerCanvas.offsetHeight>0){
                experiencerInitialized=initializeCanvas(experiencerCanvas);
            }
        }
        alignmentWaveTime+=0.016;
        alignmentWaveAnimationId=requestAnimationFrame(animate);
    }
    animate();
}
function stopAlignmentWaveAnimation(){if(alignmentWaveAnimationId){cancelAnimationFrame(alignmentWaveAnimationId);alignmentWaveAnimationId=null}}
function switchGeneratedTab(tab){document.querySelectorAll('.generated-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.generated-tab-content').forEach(c=>c.style.display='none');if(tab==='scene'){document.querySelectorAll('.generated-tab')[0].classList.add('active');document.getElementById('generatedSceneContent').style.display='block'}else if(tab==='emotion'){document.querySelectorAll('.generated-tab')[1].classList.add('active');document.getElementById('generatedEmotionContent').style.display='block'}}
let expCurrentPhase='waiting';let expPendingEmotion='';let expGeneratedEmotion='';let expFinalObject=null;let expConversationHistory=[];
function switchExpGeneratedTab(tab){const sceneDisplay=document.getElementById('expGeneratedSceneContent');const emotionDisplay=document.getElementById('expGeneratedEmotionContent');if(tab==='scene'){if(sceneDisplay)sceneDisplay.style.display='block';if(emotionDisplay)emotionDisplay.style.display='none'}else if(tab==='emotion'){if(sceneDisplay)sceneDisplay.style.display='none';if(emotionDisplay)emotionDisplay.style.display='block'}}
function addExpChatMessage(role,content){const messagesContainer=document.getElementById('expChatMessages');if(!messagesContainer)return;const messageDiv=document.createElement('div');messageDiv.className='chat-message '+role;const label=role==='user'?'나':'또다른 나';messageDiv.innerHTML='<div class="chat-message-label">'+label+'</div><div class="chat-message-content">'+content.replace(/\n/g,'<br>')+'</div>';messagesContainer.appendChild(messageDiv);messagesContainer.scrollTop=messagesContainer.scrollHeight}
function addExpChatMessageWithConfirm(role,content){const messagesContainer=document.getElementById('expChatMessages');if(!messagesContainer)return;const messageDiv=document.createElement('div');messageDiv.className='chat-message '+role;const label=role==='user'?'나':'또다른 나';messageDiv.innerHTML='<div class="chat-message-label">'+label+'</div><div class="chat-message-content">'+content.replace(/\n/g,'<br>')+'</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleExpConfirm(\'yes\')">예</button><button class="confirm-btn no" onclick="handleExpConfirm(\'no\')">아니오</button></div>';messagesContainer.appendChild(messageDiv);messagesContainer.scrollTop=messagesContainer.scrollHeight}
function removeExpConfirmButtons(){const panel=document.getElementById('experiencerPanel');if(!panel)return;const buttons=panel.querySelectorAll('.confirm-buttons');buttons.forEach(btn=>btn.remove())}
async function sendExpChatMessage(){const input=document.getElementById('expTextInput');if(!input||!input.value.trim()){showNotification('메시지를 입력해주세요');return}const userMessage=input.value.trim();input.value='';addExpChatMessage('user',userMessage);if(expCurrentPhase==='interpret'){expPendingEmotion=userMessage;addExpChatMessage('ai','감정을 분석하고 있습니다...');let emotionResult=null;try{emotionResult=await analyzeEmotionWithVector(userMessage,'');console.log('Exp emotionResult (raw):',JSON.stringify(emotionResult))}catch(e){console.error('Exp emotion analysis failed:',e);addExpChatMessage('ai','감정 분석에 실패했습니다. 다시 시도해주세요.');return}if(!emotionResult||!emotionResult.generatedEmotion||emotionResult.generatedEmotion===userMessage){console.warn('AI 감정 변환 실패 (체험자)');emotionResult={generatedEmotion:userMessage,analysis:emotionResult?.analysis||{base:{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},detailed:[],intensity:0.5,confidence:0.3}}}const parsed=parseEmotionInput(userMessage);const emotionText=document.getElementById('expEmotionText');if(emotionText)emotionText.textContent=emotionResult.generatedEmotion;switchExpGeneratedTab('emotion');expFinalObject={emotion:parsed.emotion,reason:parsed.reason,generatedEmotion:emotionResult.generatedEmotion,emotionAnalysis:emotionResult.analysis};const emotionDisplay=formatEmotionVector(emotionResult.analysis?.base||{});addExpChatMessage('ai','당신의 감정: '+emotionDisplay);addExpChatMessageWithConfirm('ai','이 감정이 맞아?')}else{addExpChatMessage('ai','화자의 기억이 도착하면, 그 안에서 네가 느끼는 걸 말해줘.')}}
function formatEmotionVector(emotionVector){if(!emotionVector)return'감정 없음';const emotions=[];if(emotionVector.fear>0.1)emotions.push(`두려움 ${Math.round(emotionVector.fear*100)}%`);if(emotionVector.sadness>0.1)emotions.push(`슬픔 ${Math.round(emotionVector.sadness*100)}%`);if(emotionVector.anger>0.1)emotions.push(`분노 ${Math.round(emotionVector.anger*100)}%`);if(emotionVector.joy>0.1)emotions.push(`기쁨 ${Math.round(emotionVector.joy*100)}%`);if(emotionVector.longing>0.1)emotions.push(`그리움 ${Math.round(emotionVector.longing*100)}%`);if(emotionVector.guilt>0.1)emotions.push(`죄책감 ${Math.round(emotionVector.guilt*100)}%`);return emotions.length>0?emotions.join(', '):'감정 없음'}
function renderExperiencerWave(emotionAnalysis){console.log('체험자 파동 렌더링:',emotionAnalysis);if(!emotionAnalysis||!emotionAnalysis.base){console.error('emotionAnalysis 또는 base가 없습니다');return}const emotionVector=emotionAnalysis.base;window.experiencerEmotionVector=emotionVector;const experiencerWave=computeWaveFromEmotion(emotionAnalysis);window.currentExperiencerWave=experiencerWave;updateAlignmentWave();console.log('체험자 파동 렌더링 완료:',experiencerWave)}
async function handleExpConfirm(answer){removeExpConfirmButtons();if(answer==='yes'){addExpChatMessage('user','예');if(expFinalObject){addExpChatMessage('ai','감정을 파동으로 변환합니다...');await saveExpInterpretation(expFinalObject);if(expFinalObject.emotionAnalysis&&currentSessionId){await saveExperiencerChoice(expFinalObject.emotionAnalysis.base)}if(expFinalObject.emotionAnalysis){window.experiencerEmotionVector=expFinalObject.emotionAnalysis.base;const experiencerWave=computeWaveFromEmotion(expFinalObject.emotionAnalysis);window.currentExperiencerWave=experiencerWave;updateAlignmentWave();renderExperiencerWave(expFinalObject.emotionAnalysis);updateExperiencerAlignment()}setTimeout(()=>checkAlignment(),1000)}addExpChatMessage('ai','감정이 전송되었습니다.');expCurrentPhase='waiting';expPendingEmotion='';expGeneratedEmotion='';expFinalObject=null;const emotionText=document.getElementById('expEmotionText');if(emotionText)emotionText.textContent='';switchExpGeneratedTab('scene');addExpChatMessage('ai','다음 기억을 기다리고 있어.')}else{addExpChatMessage('user','아니오');addExpChatMessage('ai','다시 감정을 입력해주세요.');const expTextInput=document.getElementById('expTextInput');if(expTextInput){expTextInput.focus()}}}
async function saveExpInterpretation(data){
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    return;
}
async function saveExperiencerChoice(emotionVector){console.log('=== saveExperiencerChoice 호출 ===');console.log('emotionVector:',JSON.stringify(emotionVector));console.log('currentSessionId:',currentSessionId);console.log('liveSceneNum:',liveSceneNum);if(!currentSessionId){console.error('currentSessionId가 없습니다!');return}supabaseClient = getSupabaseClient(); if(!supabaseClient){console.error('supabaseClient가 없습니다!');return}let userId;if(currentUser){userId=currentUser.id}else{if(!window.anonymousUserId){window.anonymousUserId=crypto.randomUUID()}userId=window.anonymousUserId}const insertData={live_session_id:currentSessionId,scene_id:null,user_id:userId,emotion_vector:emotionVector||{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},created_at:new Date().toISOString()};console.log('choices INSERT 데이터:',JSON.stringify(insertData));try{const{data,error}=await supabaseClient.from('choices').insert(insertData).select().single();if(error){console.error('choices INSERT error:',error);throw error}console.log('체험자 감정 저장 완료:',data);showNotification('감정이 choices 테이블에 저장되었습니다')}catch(e){console.error('saveExperiencerChoice error:',e);showNotification('choices 테이블 저장 실패: '+e.message)}}
function switchExpToTextInput(){if(isExpRecording){if(expMediaRecorder&&expMediaRecorder.state!=='inactive'){expMediaRecorder.stop();isExpRecording=false}}const waveSection=document.getElementById('expVoiceWaveSection');const switchBtn=document.querySelector('.experiencer-panel .text-switch-btn');if(waveSection&&switchBtn){waveSection.style.display='none';const textInputContainer=document.createElement('div');textInputContainer.className='text-input-container-live';textInputContainer.style.width='100%';textInputContainer.innerHTML=`<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="expTextInput" placeholder="감정을 입력하세요..." rows="3"></textarea><button class="chat-send-btn" id="expChatSendBtn" onclick="sendExpChatMessage()">전송</button></div>`;switchBtn.parentElement.insertBefore(textInputContainer,switchBtn);switchBtn.textContent='음성으로 전환';switchBtn.onclick=function(){switchExpToVoiceInput()};const input=document.getElementById('expTextInput');if(input){input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendExpChatMessage()}});input.focus()}}}
function switchExpToVoiceInput(){const textContainer=document.querySelector('.experiencer-panel .text-input-container-live');const switchBtn=document.querySelector('.experiencer-panel .text-switch-btn');const waveSection=document.getElementById('expVoiceWaveSection');if(textContainer){textContainer.remove()}if(waveSection){waveSection.style.display='block'}if(switchBtn){switchBtn.textContent='텍스트로 전환';switchBtn.onclick=function(){switchExpToTextInput()}}}
let isEditMode=false;
function toggleEditMode(){const editBtn=document.querySelector('.edit-toggle-btn');let textEl,textarea,confirmMsg;if(currentPhase==='scene'||currentPhase==='complete'){textEl=document.querySelector('#generatedSceneContent .generated-text');textarea=document.getElementById('editSceneTextarea');confirmMsg='이 기억이 맞아?'}else if(currentPhase==='emotion'){textEl=document.querySelector('#generatedEmotionContent .generated-text');textarea=document.getElementById('editEmotionTextarea');confirmMsg='이렇게 느꼈던 게 맞아?'}if(!textEl||!textarea)return;isEditMode=!isEditMode;if(isEditMode){textarea.value=textEl.textContent;textEl.style.display='none';textarea.style.display='block';editBtn.textContent='저장';editBtn.classList.add('active')}else{textEl.textContent=textarea.value;textEl.style.display='block';textarea.style.display='none';editBtn.textContent='수정';editBtn.classList.remove('active');showNotification('수정되었습니다');if(currentPhase!=='complete'){addChatMessageWithConfirm('ai',confirmMsg)}}}
let experiencerStatusPosition='left';
function updateExperiencerStatus(status){const floatEl=document.getElementById('experiencerStatusFloat');if(!floatEl)return;floatEl.style.display='block';floatEl.textContent=status;experiencerStatusPosition=experiencerStatusPosition==='left'?'right':'left';floatEl.classList.remove('left','right');floatEl.classList.add(experiencerStatusPosition)}
function saveEditedScene(){const textarea=document.getElementById('editSceneTextarea');if(!textarea||!textarea.value.trim()){showNotification('수정할 내용을 입력해주세요');return}if(currentGeneratedSceneObj){currentGeneratedSceneObj.text=textarea.value.trim()}currentGeneratedScene=textarea.value.trim();const sceneContent=document.getElementById('generatedSceneContent').querySelector('.generated-text');if(sceneContent)sceneContent.textContent=textarea.value.trim();showNotification('장면이 수정되었습니다')}
function switchToTextInput(){const waveSection=document.querySelector('.voice-wave-section');const switchBtn=document.querySelector('.text-switch-btn');if(waveSection&&switchBtn){waveSection.style.display='none';const textInputContainer=document.createElement('div');textInputContainer.className='text-input-container-live';textInputContainer.style.width='100%';textInputContainer.innerHTML=`<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="liveTextInput" placeholder="기억을 이야기해주세요..." rows="3"></textarea><button class="chat-send-btn" id="chatSendBtn" onclick="sendChatMessage()">전송</button></div>`;switchBtn.parentElement.insertBefore(textInputContainer,switchBtn);switchBtn.textContent='음성으로 전환';switchBtn.onclick=function(){switchToVoiceInput()};const input=document.getElementById('liveTextInput');if(input){input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendChatMessage()}});input.focus()}}}
function switchToVoiceInput(){const textContainer=document.querySelector('.text-input-container-live');const switchBtn=document.querySelector('.text-switch-btn');const waveSection=document.querySelector('.voice-wave-section');if(textContainer){textContainer.remove()}if(waveSection){waveSection.style.display='block'}if(switchBtn){switchBtn.textContent='텍스트로 전환';switchBtn.onclick=function(){switchToTextInput()}}}
let conversationHistory=[];let currentGeneratedSceneObj=null;let currentGeneratedEmotion=null;
let currentPhase='scene';let pendingSceneText='';let pendingEmotionText='';
let currentGeneratedScene='';let finalSceneObject=null;
const AI_SYSTEM_PROMPT=`너는 "또다른 나"야. 상대방의 기억을 함께 꺼내는 존재야.

성격:
- 짧고 담담한 말투
- 절대 판단하지 않음
- 감정 단어 직접 사용 금지 (슬프다, 외롭다 X)
- 미화 금지. 있는 그대로.

역할:
- 상대방이 기억을 이야기하면, 상황과 감각을 물어봐
- 필요한 정보: 누가, 무엇이, 어디서 일어났는지
- "거기 어디였어?", "누가 있었어?", "그때 뭐가 보였어?", "몸은 어땠어?" 같은 질문
- 해석이나 분석 금지. 상황과 감각만 묻기.
- 충분히 들었으면 기억 변환 요청

감정 종류: fear, sadness, anger, joy, longing, guilt

응답 형식:
- 일반 대화: 짧게 묻고, 상황과 감각에 집중
- 기억이 충분하면: "기억을 변환할게." 라고만 말하기`;
async function sendChatMessage(){console.log('sendChatMessage called');console.log('sendChatMessage currentPhase:',currentPhase);const input=document.getElementById('liveTextInput');if(!input||!input.value.trim()){showNotification('메시지를 입력해주세요');return}const userMessage=input.value.trim();if(currentPhase==='emotion'){console.log('emotion phase detected, calling handleUnifiedSubmit');await handleUnifiedSubmit(userMessage);input.value='';const sendBtn=document.getElementById('chatSendBtn');if(sendBtn)sendBtn.disabled=false;if(input)input.focus();return}input.value='';const sendBtn=document.getElementById('chatSendBtn');if(sendBtn)sendBtn.disabled=true;addChatMessage('user',userMessage);conversationHistory.push({role:'user',content:userMessage});if(currentPhase==='scene'){updateExperiencerStatus('체험자가 장면을 기다리고 있습니다...');try{const aiResponse=await callClaudeAPI(userMessage);conversationHistory.push({role:'assistant',content:aiResponse});const generatedText=extractGeneratedText(aiResponse);pendingSceneText=generatedText;const sceneContent=document.querySelector('#generatedSceneContent .generated-text');if(sceneContent)sceneContent.textContent=generatedText;switchGeneratedTab('scene');addChatMessageWithConfirm('ai','이 기억이 맞아?');updateExperiencerStatus('체험자가 장면을 읽고 있습니다...')}catch(error){console.error('AI API error:',error);addChatMessage('ai','죄송해, 잠시 문제가 생겼어. 다시 말해줄 수 있어?');showNotification('AI 응답 중 오류가 발생했습니다')}}if(sendBtn)sendBtn.disabled=false;if(input)input.focus()}
function extractGeneratedText(aiResponse){if(aiResponse.includes('[SCENE_READY]')){try{const jsonStr=aiResponse.substring(aiResponse.indexOf('[SCENE_READY]')+'[SCENE_READY]'.length).trim();const data=JSON.parse(jsonStr);if(currentPhase==='scene'&&data.scene)return data.scene.text||data.scene;if(currentPhase==='emotion'&&data.emotion)return data.emotion.text||data.emotion}catch(e){}}return aiResponse.replace(/\[SCENE_READY\].*$/,'').trim()||aiResponse}
function parseEmotionInput(text){const parts=text.split(/[,.]/).map(s=>s.trim()).filter(Boolean);return{emotion:parts[0]||null,reason:parts[1]||null}}
function addChatMessageWithConfirm(role,content){const messagesContainer=document.getElementById('chatMessages');if(!messagesContainer)return;const messageDiv=document.createElement('div');messageDiv.className=`chat-message ${role}`;const label=role==='user'?'나':'또다른 나';messageDiv.innerHTML=`<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g,'<br>')}</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleConfirm('yes')">예</button><button class="confirm-btn no" onclick="handleConfirm('no')">아니오</button></div>`;messagesContainer.appendChild(messageDiv);messagesContainer.scrollTop=messagesContainer.scrollHeight}
async function handleConfirm(answer){
    removeConfirmButtons();
    if(currentPhase==='scene'){
        if(answer==='yes'){
            const sceneText=currentGeneratedScene||pendingSceneText||'';
            console.log('handleConfirm - scene yes clicked, sceneText:',sceneText);
            console.log('currentGeneratedScene:',currentGeneratedScene);
            console.log('pendingSceneText:',pendingSceneText);
            console.log('currentSessionId:',currentSessionId);
            if(!sceneText){
                console.error('장면 텍스트가 없습니다!');
                addChatMessage('ai','장면이 없습니다. 다시 입력해주세요.');
                return;
            }
            if(currentSessionId){
                console.log('saveLiveScene 호출 시작');
                await saveLiveScene({
                    text:sceneText,
                    emotionRaw:'',
                    reasonRaw:'',
                    generatedEmotion:'',
                    emotionAnalysis:{base:{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0},intensity:0,confidence:0},
                    voidInfo:{sceneVoid:false,emotionVoid:true,reasonVoid:true}
                });
                console.log('saveLiveScene 호출 완료');
            }else{
                console.warn('currentSessionId가 없어서 저장하지 않습니다');
            }
            currentPhase='emotion';
            addChatMessage('ai','그때 어떤 마음이었어?');
            return;
        }else{
            addChatMessage('ai','다시 이야기해줘.');
            return;
        }
    }
    if(currentPhase==='emotion'){
        if(answer==='yes'){
            console.log('=== EMOTION CONFIRM ===');
            console.log('finalSceneObject:',finalSceneObject);
            console.log('currentGeneratedScene:',currentGeneratedScene);
            console.log('pendingSceneText:',pendingSceneText);
            if(!finalSceneObject){
                console.error('finalSceneObject is null!');
                addChatMessage('ai','다시 감정을 입력해줘.');
                return;
            }
            if(!finalSceneObject.text&&currentGeneratedScene){
                finalSceneObject.text=currentGeneratedScene;
                console.log('finalSceneObject.text 복구:',currentGeneratedScene);
            }
            if(!finalSceneObject.text&&pendingSceneText){
                finalSceneObject.text=pendingSceneText;
                console.log('pendingSceneText로 복구:',pendingSceneText);
            }
            console.log('저장할 finalSceneObject:',JSON.stringify(finalSceneObject));
            await saveLiveScene(finalSceneObject);
            if(finalSceneObject?.emotionAnalysis){
                updateNarratorWave(finalSceneObject.emotionAnalysis);
                window.narratorEmotionVector=finalSceneObject.emotionAnalysis?.base||{fear:0,sadness:0,anger:0,joy:0,longing:0,guilt:0};
                console.log('화자 감정 벡터 저장:',window.narratorEmotionVector);
                if(supabaseClient&&currentSessionId){
                    try{
                        // live_interpretations 테이블이 없으므로 완전히 비활성화
                        // await supabaseClient.from('live_interpretations').insert({...});
                        console.log('화자 감정 해석 저장 완료 (live_interpretations 테이블 비활성화)');
                        setTimeout(()=>checkAlignment(),1000);
                    }catch(e){
                        console.error('화자 감정 해석 저장 실패:',e);
                    }
                }
            }
            simulateNarratorInput(finalSceneObject?.text||currentGeneratedScene);
            showNotification('장면이 전송되었습니다.');
            updateLiveAlignment(0.1+Math.random()*0.15);
            liveSceneNum++;
            const liveSceneNumEl=document.getElementById('liveSceneNum');
            if(liveSceneNumEl)liveSceneNumEl.textContent=liveSceneNum;
            currentPhase='scene';
            pendingSceneText='';
            currentGeneratedScene='';
            finalSceneObject=null;
            const sceneContent=document.querySelector('#generatedSceneContent .generated-text');
            if(sceneContent)sceneContent.textContent='';
            const emotionContent=document.querySelector('#generatedEmotionContent .generated-text');
            if(emotionContent)emotionContent.textContent='';
            switchGeneratedTab('scene');
            addChatMessage('ai','다음 기억을 이야기해줘.');
            console.log('=== EMOTION CONFIRM DONE ===');
            return;
        }else{
            addChatMessage('ai','다시 감정을 이야기해줘.');
            return;
        }
    }
}
function removeConfirmButtons(){const buttons=document.querySelectorAll('.confirm-buttons');buttons.forEach(btn=>btn.remove())}
function addChatMessage(role,content){const messagesContainer=document.getElementById('chatMessages');if(!messagesContainer)return;const messageDiv=document.createElement('div');messageDiv.className=`chat-message ${role}`;const label=role==='user'?'나':'또다른 나';messageDiv.innerHTML=`<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g,'<br>')}</div>`;messagesContainer.appendChild(messageDiv);messagesContainer.scrollTop=messagesContainer.scrollHeight}
async function callClaudeAPI(userMessage){try{const messages=conversationHistory.length>0?conversationHistory:[{role:'user',content:userMessage}];if(conversationHistory.length===0||conversationHistory[conversationHistory.length-1].role!=='user'){messages.push({role:'user',content:userMessage})}const response=await fetch(SUPABASE_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${SUPABASE_ANON_KEY}`},body:JSON.stringify({text:userMessage,conversationHistory:messages,systemPrompt:AI_SYSTEM_PROMPT})});if(!response.ok){const error=await response.json();throw new Error(error.error||error.details||'API 호출 실패')}const data=await response.json();if(data.scene){return data.scene}else if(data.response){return data.response}else{throw new Error(data.error||'응답을 받을 수 없습니다')}}catch(error){console.error('callClaudeAPI error:',error);throw error}}
function parseAndGenerateScene(aiResponse){try{const sceneReadyIndex=aiResponse.indexOf('[SCENE_READY]');if(sceneReadyIndex===-1)return;const jsonStr=aiResponse.substring(sceneReadyIndex+'[SCENE_READY]'.length).trim();const sceneData=JSON.parse(jsonStr);currentGeneratedSceneObj=sceneData.scene;currentGeneratedEmotion=sceneData.emotion;if(sceneData.scene&&sceneData.scene.text){currentGeneratedScene=sceneData.scene.text}updateGeneratedTabs(sceneData);updateAlignmentFromScene(sceneData);showNotification('장면이 생성되었습니다')}catch(error){console.error('Scene parsing error:',error);showNotification('장면 생성 중 오류가 발생했습니다')}}
function updateGeneratedTabs(sceneData){if(sceneData.scene&&sceneData.scene.text){const sceneContent=document.getElementById('generatedSceneContent').querySelector('.generated-text');if(sceneContent){sceneContent.textContent=sceneData.scene.text;sceneContent.classList.remove('void-scene')}const editTextarea=document.getElementById('editSceneTextarea');if(editTextarea)editTextarea.value=sceneData.scene.text}if(sceneData.emotion&&sceneData.emotion.text){const emotionContent=document.getElementById('generatedEmotionContent').querySelector('.generated-text');if(emotionContent){emotionContent.textContent=sceneData.emotion.text;emotionContent.classList.remove('void-reason')}}if(sceneData.voidInfo){const sceneContent=document.getElementById('generatedSceneContent').querySelector('.generated-text');const emotionContent=document.getElementById('generatedEmotionContent').querySelector('.generated-text');if(sceneData.voidInfo.sceneVoid&&sceneContent){sceneContent.classList.add('void-scene')}if(sceneData.voidInfo.reasonVoid&&emotionContent){emotionContent.classList.add('void-reason')}}}
function updateAlignmentFromScene(sceneData){if(!sceneData)return;let emotionObj=null;if(typeof sceneData.emotion==='string'){emotionObj={intensity:5,text:sceneData.emotion}}else if(sceneData.emotion){emotionObj=sceneData.emotion}if(!emotionObj)return;const intensity=emotionObj.intensity||5;const alignmentIncrease=Math.min(0.15,intensity/10*0.15);currentAlignment=Math.min(0.95,currentAlignment+alignmentIncrease);const percentageEl=document.getElementById('alignmentPercentage');if(percentageEl)percentageEl.textContent=String(Math.round(currentAlignment*100)).padStart(2,'0')+'%';showNotification(`정렬도가 ${Math.round(alignmentIncrease*100)}% 증가했습니다`)}
let liveVoiceRecognition=null;let liveVoiceContext=null;let liveVoiceAnalyser=null;let liveVoiceMicrophone=null;let liveVoiceAnimationId=null;let liveRecognizedText='';
function startLiveVoiceInput(){if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){showNotification('이 브라우저는 음성 인식을 지원하지 않습니다');return}const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;liveVoiceRecognition=new SpeechRecognition();liveVoiceRecognition.lang='ko-KR';liveVoiceRecognition.continuous=true;liveVoiceRecognition.interimResults=true;liveRecognizedText='';liveVoiceRecognition.onresult=function(event){let interim='';let final='';for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal){final+=event.results[i][0].transcript}else{interim+=event.results[i][0].transcript}}if(final){liveRecognizedText+=final+' '}};liveVoiceRecognition.onerror=function(event){console.error('Speech recognition error:',event.error);if(event.error==='not-allowed'){showNotification('마이크 권한이 필요합니다');stopLiveVoiceInput()}};liveVoiceRecognition.onend=function(){if(isLiveVoiceRecording&&liveVoiceRecognition){liveVoiceRecognition.start()}};liveVoiceRecognition.start();navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){liveVoiceContext=new(window.AudioContext||window.webkitAudioContext)();liveVoiceAnalyser=liveVoiceContext.createAnalyser();liveVoiceMicrophone=liveVoiceContext.createMediaStreamSource(stream);liveVoiceMicrophone.connect(liveVoiceAnalyser);liveVoiceAnalyser.fftSize=256;const bufferLength=liveVoiceAnalyser.frequencyBinCount;const dataArray=new Uint8Array(bufferLength);const canvas=document.getElementById('voiceWaveCanvasLive');const ctx=canvas.getContext('2d');canvas.width=canvas.offsetWidth*2;canvas.height=canvas.offsetHeight*2;ctx.scale(2,2);function draw(){if(!isLiveVoiceRecording)return;liveVoiceAnimationId=requestAnimationFrame(draw);liveVoiceAnalyser.getByteFrequencyData(dataArray);ctx.fillStyle='rgba(10,10,12,0.9)';ctx.fillRect(0,0,canvas.width/2,canvas.height/2);const barWidth=(canvas.width/2/bufferLength)*2.5;let x=0;for(let i=0;i<bufferLength;i++){const barHeight=(dataArray[i]/255)*canvas.height*0.9;const gradient=ctx.createLinearGradient(0,canvas.height/2-barHeight,0,canvas.height/2);gradient.addColorStop(0,'rgba(122,154,122,0.9)');gradient.addColorStop(1,'rgba(74,144,217,0.5)');ctx.fillStyle=gradient;ctx.fillRect(x,canvas.height/2-barHeight,barWidth-1,barHeight*2);x+=barWidth}}draw()}).catch(function(err){console.error('Microphone access denied:',err);showNotification('마이크 접근이 거부되었습니다');stopLiveVoiceInput()});isLiveVoiceRecording=true;const waveSection=document.querySelector('.voice-wave-section');if(waveSection)waveSection.style.border='2px solid rgba(122,154,122,0.5)';showNotification('음성 입력이 시작되었습니다. 말한 내용은 자동으로 전송됩니다.')}
function stopLiveVoiceInput(){if(!isLiveVoiceRecording&&!liveVoiceRecognition)return;isLiveVoiceRecording=false;if(liveVoiceRecognition){liveVoiceRecognition.stop();liveVoiceRecognition=null}if(liveVoiceAnimationId){cancelAnimationFrame(liveVoiceAnimationId);liveVoiceAnimationId=null}if(liveVoiceContext){liveVoiceContext.close();liveVoiceContext=null}liveVoiceAnalyser=null;liveVoiceMicrophone=null;if(liveRecognizedText.trim()){const input=document.getElementById('liveTextInput');if(input){input.value=liveRecognizedText.trim();sendChatMessage();liveRecognizedText=''}else{addChatMessage('user',liveRecognizedText.trim());conversationHistory.push({role:'user',content:liveRecognizedText.trim()});callClaudeAPI(liveRecognizedText.trim()).then(aiResponse=>{addChatMessage('ai',aiResponse);conversationHistory.push({role:'assistant',content:aiResponse});if(aiResponse.includes('[SCENE_READY]')){parseAndGenerateScene(aiResponse)}}).catch(error=>{console.error('AI API error:',error);addChatMessage('ai','죄송해, 잠시 문제가 생겼어. 다시 말해줄 수 있어?')});liveRecognizedText=''}}const waveSection=document.querySelector('.voice-wave-section');if(waveSection)waveSection.style.border='none';startVoiceWaveLiveAnimation();showNotification('음성 입력이 중지되었습니다')}
let isLiveVoiceRecording=false;
let mediaRecorder=null;let audioChunks=[];let isRecording=false;
let expMediaRecorder=null;let expAudioChunks=[];let isExpRecording=false;
async function toggleRecording(e){if(e)e.stopPropagation();const btn=document.getElementById('voiceBtn');if(!btn)return;if(!isRecording){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});mediaRecorder=new MediaRecorder(stream);audioChunks=[];mediaRecorder.ondataavailable=(e)=>{audioChunks.push(e.data)};mediaRecorder.onstop=async()=>{if(audioChunks.length===0){btn.textContent='🎤 음성 입력';showNotification('녹음된 내용이 없습니다');mediaRecorder.stream.getTracks().forEach(track=>track.stop());return}const audioBlob=new Blob(audioChunks,{type:'audio/webm'});btn.textContent='⏳ 변환 중...';const text=await transcribeAudio(audioBlob);if(text){const sceneInput=document.getElementById('liveTextInput');if(sceneInput){sceneInput.value=text;sceneInput.focus();setTimeout(()=>{sendChatMessage()},100)}else{const unifiedInput=document.getElementById('unifiedInput');if(unifiedInput){unifiedInput.value=text;unifiedInput.focus();setTimeout(()=>{handleUnifiedSubmit(text)},100)}else{showNotification('입력 필드를 찾을 수 없습니다')}}}else{showNotification('음성 변환에 실패했습니다')}btn.textContent='🎤 음성 입력';mediaRecorder.stream.getTracks().forEach(track=>track.stop())};mediaRecorder.start();isRecording=true;btn.textContent='⏹️ 녹음 중지';showNotification('녹음이 시작되었습니다')}catch(err){console.error('녹음 시작 오류:',err);alert('마이크 권한이 필요합니다');btn.textContent='🎤 음성 입력'}}else{if(mediaRecorder&&mediaRecorder.state!=='inactive'){mediaRecorder.stop();isRecording=false}}}
async function transcribeAudio(audioBlob){try{supabaseClient = getSupabaseClient(); if(!supabaseClient){throw new Error('Supabase 클라이언트가 초기화되지 않았습니다')}if(!audioBlob||audioBlob.size===0){throw new Error('녹음 데이터가 없습니다')}const formData=new FormData();formData.append('audio',audioBlob,'audio.webm');const{data,error}=await supabaseClient.functions.invoke('transcribe-audio',{body:formData});if(error){console.error('Supabase Edge Function 오류:',error);throw error}if(!data||!data.text){console.error('응답 데이터 형식 오류:',data);throw new Error('응답 데이터 형식이 올바르지 않습니다')}const text=data.text;let sceneInput=document.getElementById('liveTextInput');if(!sceneInput){const switchBtn=document.querySelector('.text-switch-btn');if(switchBtn&&typeof switchToTextInput==='function'){switchToTextInput();sceneInput=document.getElementById('liveTextInput')}}if(sceneInput){sceneInput.value=text;sceneInput.focus()}return text}catch(err){console.error('음성 변환 에러:',err);const errorMsg=err.message||'음성 변환에 실패했습니다';showNotification(errorMsg);return null}}
async function transcribeExpAudio(audioBlob){try{supabaseClient = getSupabaseClient(); if(!supabaseClient){throw new Error('Supabase 클라이언트가 초기화되지 않았습니다')}if(!audioBlob||audioBlob.size===0){throw new Error('녹음 데이터가 없습니다')}const formData=new FormData();formData.append('audio',audioBlob,'audio.webm');const{data,error}=await supabaseClient.functions.invoke('transcribe-audio',{body:formData});if(error){console.error('Supabase Edge Function 오류:',error);throw error}if(!data||!data.text){console.error('응답 데이터 형식 오류:',data);throw new Error('응답 데이터 형식이 올바르지 않습니다')}const text=data.text;let expInput=document.getElementById('expTextInput');if(!expInput){showNotification('입력 필드를 찾을 수 없습니다');return null}expInput.value=text;expInput.focus();setTimeout(()=>{sendExpChatMessage()},100);return text}catch(err){console.error('음성 변환 에러:',err);const errorMsg=err.message||'음성 변환에 실패했습니다';showNotification(errorMsg);return null}}
async function toggleExpRecording(e){if(e)e.stopPropagation();const btn=document.getElementById('expVoiceBtn');if(!btn)return;if(!isExpRecording){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});expMediaRecorder=new MediaRecorder(stream);expAudioChunks=[];expMediaRecorder.ondataavailable=(e)=>{expAudioChunks.push(e.data)};expMediaRecorder.onstop=async()=>{if(expAudioChunks.length===0){btn.textContent='🎤 음성 입력';showNotification('녹음된 내용이 없습니다');expMediaRecorder.stream.getTracks().forEach(track=>track.stop());return}const audioBlob=new Blob(expAudioChunks,{type:'audio/webm'});btn.textContent='⏳ 변환 중...';const text=await transcribeExpAudio(audioBlob);if(text){showNotification('음성 입력이 완료되었습니다')}else{showNotification('음성 변환에 실패했습니다')}btn.textContent='🎤 음성 입력';expMediaRecorder.stream.getTracks().forEach(track=>track.stop())};expMediaRecorder.start();isExpRecording=true;btn.textContent='⏹️ 녹음 중지';showNotification('녹음이 시작되었습니다')}catch(err){console.error('녹음 시작 오류:',err);alert('마이크 권한이 필요합니다');btn.textContent='🎤 음성 입력'}}else{if(expMediaRecorder&&expMediaRecorder.state!=='inactive'){expMediaRecorder.stop();isExpRecording=false}}}
function startVoiceWaveLiveAnimation(){
    let time=0;
    let narratorInitialized=false;
    let experiencerInitialized=false;
    function initializeCanvas(canvas){
        if(!canvas)return false;
        if(canvas.offsetWidth===0||canvas.offsetHeight===0)return false;
        try{
            const ctx=canvas.getContext('2d');
            canvas.width=canvas.offsetWidth*2;
            canvas.height=canvas.offsetHeight*2;
            ctx.scale(2,2);
            return true;
        }catch(e){
            console.error('Canvas initialization error:',e);
            return false;
        }
    }
    function animateWave(canvas,isExperiencer){
        if(!canvas)return;
        try{
            const ctx=canvas.getContext('2d');
            const width=canvas.width/2;
            const height=canvas.height/2;
            const centerY=height/2;
            const baseAmplitude=isLiveVoiceRecording||isRecording?50:25;
            const amplitude=baseAmplitude+Math.sin(time*0.1)*8;
            ctx.fillStyle='rgba(10,10,12,0.9)';
            ctx.fillRect(0,0,width,height);
            ctx.beginPath();
            ctx.strokeStyle=isLiveVoiceRecording||isRecording?'rgba(122,154,122,0.9)':'rgba(74,144,217,0.8)';
            ctx.lineWidth=3;
            for(let x=0;x<width;x++){
                const y=centerY+Math.sin(x*0.03+time*0.08)*amplitude+Math.sin(x*0.015+time*0.05)*(amplitude*0.6);
                if(x===0)ctx.moveTo(x,y);
                else ctx.lineTo(x,y);
            }
            ctx.stroke();
        }catch(e){
            console.error('Wave animation error:',e);
        }
    }
    function animate(){
        const narratorCanvas=document.getElementById('voiceWaveCanvasLive');
        const experiencerCanvas=document.getElementById('expVoiceWaveCanvas');
        if(narratorCanvas){
            if(!narratorInitialized){
                narratorInitialized=initializeCanvas(narratorCanvas);
            }
            if(narratorInitialized){
                animateWave(narratorCanvas,false);
            }
        }
        if(experiencerCanvas){
            if(experiencerCanvas.offsetWidth>0&&experiencerCanvas.offsetHeight>0){
                if(!experiencerInitialized){
                    experiencerInitialized=initializeCanvas(experiencerCanvas);
                }
                if(experiencerInitialized){
                    animateWave(experiencerCanvas,true);
                }
            }
        }
        time++;
        voiceWaveLiveAnimationId=requestAnimationFrame(animate);
    }
    animate();
    const narratorWaveSection=document.querySelector('#voiceWaveSection');
    if(narratorWaveSection&&!narratorWaveSection.hasAttribute('data-listener-added')){
        narratorWaveSection.setAttribute('data-listener-added','true');
        narratorWaveSection.addEventListener('click',function(e){
            if(e.target.id==='voiceBtn'||e.target.closest('#voiceBtn')){return}
            if(!isLiveVoiceRecording){startLiveVoiceInput()}else{stopLiveVoiceInput()}
        });
    }
}
function stopVoiceWaveLiveAnimation(){if(voiceWaveLiveAnimationId){cancelAnimationFrame(voiceWaveLiveAnimationId);voiceWaveLiveAnimationId=null}}
let alignmentWaveAnimationId=null;let voiceWaveLiveAnimationId=null;let comparisonWaveAnimationId=null;let comparisonWaveTime=0;
function selectMemory(index){try{currentMemory=index;currentScene=0;userChoices=[];userReasons=[];currentAlignment=0;updateUserStats('memory',index);const selectedMemory=allMemoriesData[index]||allMemoriesData[0];if(!selectedMemory){showNotification('기억을 불러올 수 없습니다');return}window.currentStoryData=selectedMemory;const archiveContainerEl=document.getElementById('archiveContainer');if(archiveContainerEl&&!archiveContainerEl.classList.contains('active')){archiveContainerEl.classList.add('active')}const memoryListEl=document.getElementById('memoryList');if(memoryListEl)memoryListEl.style.display='none';const archiveControlsEl=document.getElementById('archiveControls');if(archiveControlsEl)archiveControlsEl.style.display='none';const archiveHeaderEl=document.querySelector('.archive-header');if(archiveHeaderEl)archiveHeaderEl.style.display='none';const sceneViewerEl=document.getElementById('sceneViewer');if(sceneViewerEl){sceneViewerEl.classList.add('active');sceneViewerEl.style.cssText='display:block !important;opacity:1 !important';setTimeout(()=>{initProgressDots();renderScene();startWaveAnimation();setTimeout(()=>showNpcDialogue("이 기억의 주인은 아래층에, 다른 사람들의 해석은 위층에 쌓여 있어. 천천히 그 지층을 따라가 봐.",4000),100)},100)}else{showNotification('장면 뷰어를 찾을 수 없습니다')}}catch(e){console.error('selectMemory error:',e);console.error('Error details:',{index,memoriesDataLength:memoriesData.length,selectedMemory:memoriesData[index]});showNotification('기억을 불러오는 중 오류가 발생했습니다')}}
function backToList(){document.getElementById('memoryList').style.display='grid';const sceneViewerEl=document.getElementById('sceneViewer');if(sceneViewerEl){sceneViewerEl.classList.remove('active');sceneViewerEl.style.display='none'}const archiveControlsEl=document.getElementById('archiveControls');if(archiveControlsEl)archiveControlsEl.style.display='flex';const archiveHeaderEl=document.querySelector('.archive-header');if(archiveHeaderEl)archiveHeaderEl.style.display='block';stopWaveAnimation()}
function initProgressDots(){const currentData=window.currentStoryData||storyData;const dotsContainer=document.getElementById('progressDots');if(!dotsContainer)return;dotsContainer.innerHTML='';if(!currentData||!currentData.scenes)return;for(let i=0;i<currentData.scenes.length;i++){const dot=document.createElement('div');dot.className='progress-dot'+(i===0?' active':'');dot.onclick=function(){goToScene(i)};dotsContainer.appendChild(dot)}}
function goToScene(index){if(index<=currentScene){currentScene=index;renderScene()}}
function renderScene(){try{const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면을 불러올 수 없습니다');return}const scene=currentData.scenes[currentScene];if(!scene||!scene.text){showNotification('장면 텍스트를 불러올 수 없습니다');return}const sceneTextEl=document.getElementById('sceneText');if(sceneTextEl)sceneTextEl.textContent=scene.text;if(scene.echoWords)renderEchoLayer(scene.echoWords);if(scene.choices)renderChoices(scene.choices);if(scene.emotionDist)updateEmotionDist(scene.emotionDist);const sceneCounterEl=document.getElementById('sceneCounter');if(sceneCounterEl)sceneCounterEl.textContent=(currentScene+1)+'/'+currentData.scenes.length;const dots=document.querySelectorAll('#progressDots .progress-dot');dots.forEach((dot,i)=>{dot.className='progress-dot';if(i<currentScene)dot.classList.add('visited');if(i===currentScene)dot.classList.add('active')});const alignmentValueEl=document.getElementById('alignmentValue');if(alignmentValueEl)alignmentValueEl.textContent=currentAlignment.toFixed(2);const alignmentFillEl=document.getElementById('alignmentFill');if(alignmentFillEl)alignmentFillEl.style.width=(currentAlignment*100)+'%'}catch(e){console.error('renderScene error:',e);showNotification('장면을 렌더링하는 중 오류가 발생했습니다')}}
function renderEchoLayer(words){const layer=document.getElementById('echoLayer');if(!layer)return;layer.innerHTML='';if(!words||!Array.isArray(words))return;words.forEach(word=>{const span=document.createElement('span');span.className='echo-word';span.textContent=word;span.style.top=(20+Math.random()*60)+'%';span.style.left=(10+Math.random()*80)+'%';layer.appendChild(span)})}
function renderChoices(choices){const container=document.getElementById('choicesContainer');if(!container)return;container.innerHTML='';if(!choices||!Array.isArray(choices))return;choices.forEach((choice,i)=>{const btn=document.createElement('button');btn.className='choice-btn';btn.textContent=choice.text;btn.onclick=function(){makeChoice(i)};container.appendChild(btn)})}
function makeChoice(choiceIndex){try{userChoices.push(choiceIndex);const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면 데이터를 불러올 수 없습니다');return}const scene=currentData.scenes[currentScene];const sceneType=scene.sceneType||'normal';if(sceneType==='branch'||sceneType==='ending'){const questionEl=document.getElementById('emotionQuestion');if(questionEl)questionEl.textContent=currentScene===0?"왜 그렇게 했어?":"왜 그런 선택을 했어?";const modalEl=document.getElementById('emotionModal');if(modalEl)modalEl.classList.add('active');const inputEl=document.getElementById('emotionInputField');if(inputEl)inputEl.focus()}else{proceedToNextScene()}}catch(e){console.error('makeChoice error:',e);showNotification('오류가 발생했습니다')}}
function proceedToNextScene(){try{const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면 데이터를 불러올 수 없습니다');return}if(currentScene<currentData.scenes.length-1){currentScene++;renderScene()}else{showEndScreen()}}catch(e){console.error('proceedToNextScene error:',e);showNotification('오류가 발생했습니다')}}
function proceedToNextSceneLive(){try{const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면 데이터를 불러올 수 없습니다');return}if(currentScene<currentData.scenes.length-1){currentScene++;simulateNarratorInput()}else{showEndScreen()}}catch(e){console.error('proceedToNextSceneLive error:',e);showNotification('오류가 발생했습니다')}}
async function submitEmotion(){try{const reason=document.getElementById('emotionInputField').value||"말하고 싶지 않아";userReasons.push(reason);updateUserStats('interpretation',1);const modalEl=document.getElementById('emotionModal');if(modalEl)modalEl.classList.remove('active');const inputEl=document.getElementById('emotionInputField');if(inputEl)inputEl.value='';const currentData=window.currentStoryData||storyData;if(!currentData||!currentData.scenes||!currentData.scenes[currentScene]){showNotification('장면 데이터를 불러올 수 없습니다');return}const scene=currentData.scenes[currentScene];let userEmotionVector=null;let sceneAlignment=null;if(currentMode==='archive'&&(scene.sceneType==='branch'||scene.sceneType==='ending')){showNotification('감정을 분석하고 있습니다...');try{const emotionResult=await analyzeEmotionWithVector('',reason);console.log('Archive emotion analysis result:',emotionResult);if(emotionResult&&emotionResult.analysis&&emotionResult.analysis.base){userEmotionVector=emotionResult.analysis.base;const reasonVector=emotionResult.reason_analysis||null;if(!window.archiveUserEmotions){window.archiveUserEmotions=[]}window.archiveUserEmotions[currentScene]={emotion:userEmotionVector,reason:reason,sceneId:scene.id||currentScene};if(scene.originalEmotion&&typeof scene.originalEmotion==='object'){let originalVectorCombined={base:scene.originalEmotion,reason_analysis:scene.originalReasonVector||{attribution:'unknown',core_fear:'unknown',is_void:false}};let userVectorCombined={base:userEmotionVector,reason_analysis:reasonVector};sceneAlignment=calculateComplexAlignment(userVectorCombined,originalVectorCombined);console.log('Archive scene alignment:',sceneAlignment);if(!window.archiveSceneAlignments){window.archiveSceneAlignments=[]}window.archiveSceneAlignments[currentScene]=sceneAlignment;updateAlignmentDisplay();renderArchiveEmotionWave(userEmotionVector);showNotification(`장면 정렬도: ${(sceneAlignment*100).toFixed(0)}%`)}else{console.warn('원본 감정이 없어 정렬도를 계산할 수 없습니다');sceneAlignment=null}await saveArchiveEmotionToPlays(userEmotionVector,reason,scene,currentData,sceneAlignment,reasonVector)}else{console.warn('감정 분석 결과가 올바르지 않습니다');if(userEmotionVector){await saveArchiveEmotionToPlays(userEmotionVector,reason,scene,currentData,null,null)}}}catch(e){console.error('Archive emotion analysis error:',e);showNotification('감정 분석 중 오류가 발생했습니다');if(userEmotionVector){await saveArchiveEmotionToPlays(userEmotionVector,reason,scene,currentData,null,null)}}}if(userChoices[currentScene]===scene.originalChoice)showNpcDialogue("같은 선택... 하지만 이유도 같을까?",3000);else showNpcDialogue("다른 길을 걸었네. 그것도 하나의 해석이야.",3000);setTimeout(async()=>{if(currentScene<currentData.scenes.length-1){currentScene++;if(currentMode==='archive')renderScene();else simulateNarratorInput()}else{if(currentMode==='archive'){const alignmentResult=await calculateAverageAlignment();showEndScreen(alignmentResult)}else{showEndScreen()}}},1500)}catch(e){console.error('submitEmotion error:',e);showNotification('감정을 제출하는 중 오류가 발생했습니다')}}
function updateStrata(){const originalPercent=70-(currentScene*10),interpretPercent=30+(currentScene*10);document.getElementById('strataOriginal').style.height=originalPercent+'%';document.getElementById('strataInterpretation').style.height=interpretPercent+'%';document.getElementById('strataInterpretation').style.bottom=originalPercent+'%'}
function updateEmotionDist(dist){document.getElementById('emotionFear').style.width=(dist.fear||0)+'%';document.getElementById('emotionFearVal').textContent=(dist.fear||0)+'%';document.getElementById('emotionSadness').style.width=(dist.sadness||0)+'%';document.getElementById('emotionSadnessVal').textContent=(dist.sadness||0)+'%';document.getElementById('emotionGuilt').style.width=(dist.guilt||0)+'%';document.getElementById('emotionGuiltVal').textContent=(dist.guilt||0)+'%';document.getElementById('emotionAnger').style.width=(dist.anger||0)+'%';document.getElementById('emotionAngerVal').textContent=(dist.anger||0)+'%';document.getElementById('emotionLonging').style.width=(dist.longing||0)+'%';document.getElementById('emotionLongingVal').textContent=(dist.longing||0)+'%';document.getElementById('emotionIsolation').style.width=(dist.isolation||0)+'%';document.getElementById('emotionIsolationVal').textContent=(dist.isolation||0)+'%';document.getElementById('emotionNumbness').style.width=(dist.numbness||0)+'%';document.getElementById('emotionNumbnessVal').textContent=(dist.numbness||0)+'%';document.getElementById('emotionMoralPain').style.width=(dist.moralPain||0)+'%';document.getElementById('emotionMoralPainVal').textContent=(dist.moralPain||0)+'%'}
function startWaveAnimation(){const canvas=document.getElementById('waveCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');canvas.width=canvas.offsetWidth*2;canvas.height=canvas.offsetHeight*2;ctx.scale(2,2);let time=0;function animate(){ctx.fillStyle='rgba(18,18,26,0.1)';ctx.fillRect(0,0,canvas.width/2,canvas.height/2);const width=canvas.width/2,height=canvas.height/2,centerY=height/2;ctx.beginPath();ctx.strokeStyle='rgba(196,168,130,0.6)';ctx.lineWidth=1.5;for(let x=0;x<width;x++){const y=centerY+Math.sin(x*0.02+time*0.05)*15+Math.sin(x*0.01+time*0.03)*10;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.beginPath();ctx.strokeStyle='rgba(123,143,168,0.6)';ctx.lineWidth=1.5;const offset=(1-currentAlignment)*30;for(let x=0;x<width;x++){const y=centerY+Math.sin(x*0.02+time*0.05+offset)*15+Math.sin(x*0.01+time*0.03+offset*0.5)*10;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();time++;waveAnimationId=requestAnimationFrame(animate)}animate()}
function startLiveWaveAnimation(){const canvas=document.getElementById('liveWaveCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');canvas.width=canvas.offsetWidth*2;canvas.height=canvas.offsetHeight*2;ctx.scale(2,2);let time=0;function animate(){ctx.fillStyle='rgba(18,18,26,0.15)';ctx.fillRect(0,0,canvas.width/2,canvas.height/2);const width=canvas.width/2,height=canvas.height/2,centerY=height/2;ctx.beginPath();ctx.strokeStyle='rgba(196,168,130,0.7)';ctx.lineWidth=1.5;for(let x=0;x<width;x++){const y=centerY+Math.sin(x*0.025+time*0.04)*12+Math.sin(x*0.015+time*0.025)*8;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.beginPath();ctx.strokeStyle='rgba(123,143,168,0.7)';ctx.lineWidth=1.5;const offset=(1-currentAlignment)*25;for(let x=0;x<width;x++){const y=centerY+Math.sin(x*0.025+time*0.04+offset)*12+Math.sin(x*0.015+time*0.025+offset*0.6)*8;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();time++;liveWaveAnimationId=requestAnimationFrame(animate)}animate()}
function stopWaveAnimation(){if(waveAnimationId){cancelAnimationFrame(waveAnimationId);waveAnimationId=null}}
function stopLiveWaveAnimation(){if(liveWaveAnimationId){cancelAnimationFrame(liveWaveAnimationId);liveWaveAnimationId=null}}
function stopAllAnimations(){stopWaveAnimation();stopLiveWaveAnimation();stopAlignmentWaveAnimation();stopVoiceWaveLiveAnimation();stopLiveVoiceInput()}
async function showEndScreen(alignmentResult,forceEndScreen=false){stopAllAnimations();const liveContainerEl=document.getElementById('liveContainer');if(liveContainerEl){liveContainerEl.classList.remove('active');liveContainerEl.style.display='none'}const archiveContainerEl=document.getElementById('archiveContainer');if(archiveContainerEl){archiveContainerEl.classList.remove('active');archiveContainerEl.style.display='none'}const sceneViewerEl=document.getElementById('sceneViewer');if(sceneViewerEl){sceneViewerEl.classList.remove('active');sceneViewerEl.style.display='none'}if(currentMode==='archive'&&!forceEndScreen){if(!alignmentResult){alignmentResult=await calculateAverageAlignment()}window.archiveAlignmentResult=alignmentResult;showComparisonView();return}let finalAlignment=currentAlignment;let isTrueEnding=false;if(alignmentResult){finalAlignment=alignmentResult.averageAlignment;isTrueEnding=alignmentResult.isTrueEnding}else if(currentMode==='archive'){const calculated=await calculateAverageAlignment();finalAlignment=calculated.averageAlignment;isTrueEnding=calculated.isTrueEnding}const endScreenEl=document.getElementById('endScreen');if(endScreenEl){endScreenEl.classList.add('active');endScreenEl.style.cssText='display:flex !important'}const currentData=window.currentStoryData||storyData;const lastScene=currentData.scenes[currentData.scenes.length-1];const lastChoiceIndex=userChoices.length>0?userChoices[userChoices.length-1]:0;const lastReason=userReasons.length>0?userReasons[userReasons.length-1]:"—";document.getElementById('yourChoice').textContent=lastScene.choices[lastChoiceIndex]?lastScene.choices[lastChoiceIndex].text:"—";document.getElementById('yourReason').textContent='"'+lastReason+'"';document.getElementById('theirChoice').textContent=lastScene.choices[lastScene.originalChoice].text;document.getElementById('theirReason').textContent='"'+lastScene.originalReason+'"';document.getElementById('finalAlignment').textContent='감정 구조 정렬도: '+finalAlignment.toFixed(2);if(isTrueEnding){const trueBadge=document.getElementById('trueEndingBadge');const normalBadge=document.getElementById('normalEndingBadge');const subtitle=document.getElementById('endSubtitle');if(trueBadge)trueBadge.classList.add('active');if(normalBadge)normalBadge.classList.remove('active');if(subtitle)subtitle.style.display='none';document.getElementById('endTitle').textContent='음각에 닿다';document.getElementById('finalMessage').innerHTML='<strong>트루엔딩에 도달했습니다.</strong><br><br>당신은 그 사람의 감정 구조에 거의 겹쳐졌습니다.<br>이 일치는 원본 지층에 깊게 새겨질 거예요.'}else{const trueBadge=document.getElementById('trueEndingBadge');const normalBadge=document.getElementById('normalEndingBadge');const subtitle=document.getElementById('endSubtitle');if(trueBadge)trueBadge.classList.remove('active');if(normalBadge)normalBadge.classList.add('active');if(subtitle){subtitle.style.display='block';subtitle.textContent='다른 결로 느끼다'}document.getElementById('endTitle').textContent='ENDING';document.getElementById('finalMessage').innerHTML='당신은 이 기억을 다른 방식으로 체험했습니다.<br>같은 장면, 다른 감정.<br>그것도 하나의 해석입니다.'}startEndStrataAnimation();setTimeout(()=>{if(currentMode==='live'){showNpcDialogue("이제 이 기억은 Live에서 Archive로 넘겨질 거야. 당신의 해석도 함께.",6000)}else{showNpcDialogue("이 기억의 지층 어딘가에, 방금 너의 선택과 이유가 얇은 층으로 남았어.",6000)}},2000);const footer=document.querySelector('.footer');if(footer)footer.classList.add('visible')}
function startEndStrataAnimation(){const container=document.getElementById('endStrataContainer');const messageEl=document.getElementById('endStrataMessage');const contentEl=document.getElementById('endContent');const animationEl=document.getElementById('endStrataAnimation');if(!container||!messageEl||!contentEl||!animationEl)return;container.innerHTML='';const totalHeight=400;const layerHeight=totalHeight/6;const previousLayers=[{emotion:'fear',height:layerHeight},{emotion:'anger',height:layerHeight},{emotion:'shame',height:layerHeight},{emotion:'joy',height:layerHeight}];let currentBottom=totalHeight;const originalLayer=document.createElement('div');originalLayer.className='end-strata-layer end-strata-layer-original';originalLayer.style.height=layerHeight*2+'px';originalLayer.style.bottom=(currentBottom-layerHeight*2)+'px';container.appendChild(originalLayer);currentBottom-=layerHeight*2;previousLayers.forEach((layer,idx)=>{const layerEl=document.createElement('div');layerEl.className='end-strata-layer end-strata-layer-interpretation '+layer.emotion;layerEl.style.height=layer.height+'px';layerEl.style.bottom=(currentBottom-layer.height)+'px';layerEl.style.opacity='0';container.appendChild(layerEl);setTimeout(()=>{layerEl.style.opacity='1'},100*idx);currentBottom-=layer.height});const userEmotion=getUserDominantEmotion();const newLayer=document.createElement('div');newLayer.className='end-strata-layer end-strata-layer-new '+userEmotion;newLayer.style.height=layerHeight+'px';newLayer.style.bottom=totalHeight+'px';container.appendChild(newLayer);setTimeout(()=>{newLayer.style.transform='translateY(0)';newLayer.style.opacity='1';messageEl.classList.add('visible')},500);setTimeout(()=>{animationEl.style.transform='translate(-50%,-50%) scale(0.3)';animationEl.style.top='10%';animationEl.style.transition='all 1s ease-out';contentEl.style.opacity='1'},1500)}
function getUserDominantEmotion(){const emotions=['fear','sadness','guilt','anger','longing','isolation','numbness','moralPain'];const lastScene=window.currentStoryData?.scenes?.[window.currentStoryData.scenes.length-1];if(lastScene&&lastScene.emotionDist){const dist=lastScene.emotionDist;let max=0,dominant='fear';if((dist.fear||0)>max){max=dist.fear;dominant='fear'}if((dist.sadness||0)>max){max=dist.sadness;dominant='sadness'}if((dist.guilt||0)>max){max=dist.guilt;dominant='guilt'}if((dist.anger||0)>max){max=dist.anger;dominant='anger'}if((dist.longing||0)>max){max=dist.longing;dominant='longing'}if((dist.isolation||0)>max){max=dist.isolation;dominant='isolation'}if((dist.numbness||0)>max){max=dist.numbness;dominant='numbness'}if((dist.moralPain||0)>max){max=dist.moralPain;dominant='moralPain'}return dominant}return emotions[Math.floor(Math.random()*emotions.length)]}
function restart(){currentMode=null;currentRole=null;sessionCode=null;currentMemory=null;currentScene=0;userChoices=[];userReasons=[];currentAlignment=0;liveSceneNum=1;liveFragments=0;liveMatches=0;const endScreenEl=document.getElementById('endScreen');if(endScreenEl){endScreenEl.classList.remove('active');endScreenEl.style.display='none'}const liveContainerEl=document.getElementById('liveContainer');if(liveContainerEl){liveContainerEl.classList.remove('active');liveContainerEl.style.display='none'}const archiveContainerEl=document.getElementById('archiveContainer');if(archiveContainerEl){archiveContainerEl.classList.remove('active');archiveContainerEl.style.display='none'}const memoryListEl=document.getElementById('memoryList');if(memoryListEl)memoryListEl.style.display='grid';const sceneViewerEl=document.getElementById('sceneViewer');if(sceneViewerEl){sceneViewerEl.classList.remove('active');sceneViewerEl.style.display='none'}const introScreen=document.getElementById('introScreen');if(introScreen){introScreen.classList.remove('hidden');introScreen.classList.add('visible');introScreen.style.cssText='display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important'}const narratorPanelEl=document.getElementById('narratorPanel');if(narratorPanelEl)narratorPanelEl.classList.remove('active');const experiencerPanelEl=document.getElementById('experiencerPanel');if(experiencerPanelEl)experiencerPanelEl.classList.remove('active');const interpretationTraceEl=document.getElementById('interpretationTrace');if(interpretationTraceEl)interpretationTraceEl.style.display='none';const liveSceneContentEl=document.getElementById('liveSceneContent');if(liveSceneContentEl)liveSceneContentEl.textContent='화자가 기억을 불러오고 있습니다...';const feelingInput=document.getElementById('experiencerFeelingInput');if(feelingInput)feelingInput.value='';const memoryTraceContent=document.getElementById('memoryTraceContent');if(memoryTraceContent)memoryTraceContent.textContent='—';const liveAlignmentValueEl=document.getElementById('liveAlignmentValue');if(liveAlignmentValueEl){liveAlignmentValueEl.textContent='0.00';liveAlignmentValueEl.classList.remove('high')}const liveAlignmentFillEl=document.getElementById('liveAlignmentFill');if(liveAlignmentFillEl)liveAlignmentFillEl.style.width='0%';const liveSceneNumEl=document.getElementById('liveSceneNum');if(liveSceneNumEl)liveSceneNumEl.textContent='1';const liveFragmentsEl=document.getElementById('liveFragments');if(liveFragmentsEl)liveFragmentsEl.textContent='0';const liveMatchesEl=document.getElementById('liveMatches');if(liveMatchesEl)liveMatchesEl.textContent='0';const footer=document.querySelector('.footer');if(footer)footer.classList.remove('visible')}
let pendingSaveAction=null;
function saveMemory(){
    console.log('saveMemory 호출:', {isLoggedIn, currentMode, currentRole, currentSessionId});
    if(!isLoggedIn){
        if(confirm('로그인이 필요합니다. 로그인하시겠습니까?')){
            pendingSaveAction='save';
            const loginModal=document.getElementById('loginModal');
            if(loginModal){
                loginModal.classList.add('active');
                loginModal.style.cssText='display:flex !important;z-index:3000 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
                const usernameInput=document.getElementById('loginUsername');
                if(usernameInput)usernameInput.focus();
            }
            return;
        }else{
            return;
        }
    }
    console.log('saveMemory 조건 확인:', {currentMode, currentRole});
    if(currentMode==='live'){
        if(currentRole==='A'){
            console.log('showMemoryFateModal 호출');
            showMemoryFateModal();
        }else{
            proceedSaveMemory();
        }
    }else{
        proceedSaveMemory();
    }
}
function proceedSaveMemory(){if(currentMode==='live'){saveSessionRecord()}enterArchive()}
function goToIntro(){if(confirm('기억을 저장하지 않으면 기억이 사라집니다. 괜찮으신가요?')){restart()}}
function showMemoryFateModal(){
    console.log('showMemoryFateModal 호출');
    const modalEl=document.getElementById('memoryFateModal');
    if(modalEl){
        console.log('모달 요소 찾음, 표시 중');
        modalEl.classList.add('active');
        modalEl.style.cssText='display:flex !important;z-index:3000 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
        console.log('모달 표시 완료');
    }else{
        console.error('memoryFateModal 요소를 찾을 수 없습니다!');
    }
}
async function selectMemoryFate(fate){const modalEl=document.getElementById('memoryFateModal');if(modalEl)modalEl.classList.remove('active');window.selectedMemoryFate=fate;if(supabaseClient&&currentSessionId){try{await supabaseClient.from('live_sessions').update({memory_fate:fate}).eq('id',currentSessionId);console.log('Memory fate saved:',fate)}catch(e){console.error('Memory fate save error:',e)}}await saveLiveToArchive(fate);setTimeout(()=>{proceedSaveMemory()},500)}
async function saveLiveToArchive(fate){if(!supabaseClient||!currentSessionId){console.log('No session to save to archive');return}try{const{data:sessionData}=await supabaseClient.from('live_sessions').select('*').eq('id',currentSessionId).single();if(!sessionData){console.error('Session not found');return}const{data:scenesData}=await supabaseClient.from('live_scenes').select('*').eq('session_id',currentSessionId).order('scene_index',{ascending:true});if(!scenesData||scenesData.length===0){console.log('No scenes to save');return}const memoryCode='L-'+sessionData.session_code;const memoryTitle='라이브 기억 #'+sessionData.session_code;const dilutionValue=fate==='preserve'?100:fate==='dilute'?50:0;const{data:newMemory,error:memoryError}=await supabaseClient.from('memories').insert({code:memoryCode,title:memoryTitle,layers:1,dilution:dilutionValue,is_public:true,source_type:'live',source_session_id:currentSessionId,memory_fate:fate}).select().single();if(memoryError){console.error('Memory insert error:',memoryError);return}for(let i=0;i<scenesData.length;i++){const scene=scenesData[i];const emotionVector=scene.emotion_vector||{};const dominantEmotion=getDominantEmotion(emotionVector);const{data:newScene}=await supabaseClient.from('scenes').insert({memory_id:newMemory.id,scene_order:scene.scene_index||i+1,text:scene.scene_text||'',scene_type:'normal',echo_words:[],emotion_dist:emotionVector}).select().single();if(newScene){await supabaseClient.from('choices').insert({scene_id:newScene.id,choice_order:0,text:scene.generated_emotion||'느껴진 감정',emotion:dominantEmotion,intensity:Math.round((scene.intensity||0.5)*10)})}}console.log('Live session saved to archive');showNotification('기억이 아카이브에 저장되었습니다')}catch(e){console.error('saveLiveToArchive error:',e)}}
function getDominantEmotion(vector){if(!vector||typeof vector!=='object')return'sadness';const entries=Object.entries(vector);if(entries.length===0)return'sadness';return entries.sort((a,b)=>(b[1]||0)-(a[1]||0))[0][0]}
function saveSessionRecord(){if(!isLoggedIn||!currentUser)return;if(!currentUser.sessionHistory)currentUser.sessionHistory=[];const sessionRecord={id:Date.now(),date:new Date().toLocaleString('ko-KR'),role:currentRole||'—',memoryFate:window.selectedMemoryFate||'—',alignment:currentAlignment.toFixed(2),scenes:liveSceneNum||currentScene+1,fragments:liveFragments||0,matches:liveMatches||0};currentUser.sessionHistory.unshift(sessionRecord);if(currentUser.sessionHistory.length>50)currentUser.sessionHistory=currentUser.sessionHistory.slice(0,50)}
async function loadMypageDataFromDB(){if(!supabaseClient||!currentUser?.id){renderSessionHistoryEmpty();renderMyMemoriesEmpty();return}try{const[sessionsResult,memoriesResult,statsResult]=await Promise.all([loadSessionHistoryFromDB(),loadMyMemoriesFromDB(),loadUserStatsFromDB()]);renderSessionHistoryList(sessionsResult);renderMyMemoriesList(memoriesResult);updateMypageStats(statsResult)}catch(e){console.error('loadMypageDataFromDB error:',e);renderSessionHistoryEmpty();renderMyMemoriesEmpty()}}
async function loadSessionHistoryFromDB(){if(!supabaseClient||!currentUser?.id)return[];try{const{data,error}=await supabaseClient.from('live_sessions').select('*').or(`narrator_id.eq.${currentUser.id},experiencer_id.eq.${currentUser.id}`).order('created_at',{ascending:false}).limit(50);if(error)throw error;return data||[]}catch(e){console.error('loadSessionHistoryFromDB error:',e);return[]}}
async function loadMyMemoriesFromDB(){
    if(!supabaseClient||!currentUser?.id)return[];
    try{
        // JOIN 쿼리의 or 연산자 문법 문제로 인해 fallback 로직만 사용
        const{data:sessionIds}=await supabaseClient.from('live_sessions').select('id').or(`narrator_id.eq.${currentUser.id},experiencer_id.eq.${currentUser.id}`);
        if(sessionIds&&sessionIds.length>0){
            const ids=sessionIds.map(s=>s.id);
            const{data:fallbackData}=await supabaseClient.from('memories').select('*').in('source_session_id',ids).order('created_at',{ascending:false}).limit(50);
            return fallbackData||[];
        }
        return[];
    }catch(e){
        console.error('loadMyMemoriesFromDB error:',e);
        return[];
    }
}
async function loadUserStatsFromDB(){
    if(!supabaseClient||!currentUser?.id)return{sessions:0,memories:0,interpretations:0};
    try{
        const{data:sessionsData}=await supabaseClient.from('live_sessions').select('id').or(`narrator_id.eq.${currentUser.id},experiencer_id.eq.${currentUser.id}`);
        const sessionIds=(sessionsData||[]).map(s=>s.id);
        let memoriesCount=0;
        if(sessionIds.length>0){
            const{data:memoriesData}=await supabaseClient.from('memories').select('id').in('source_session_id',sessionIds);
            memoriesCount=memoriesData?.length||0;
        }
        // live_interpretations 테이블이 없으므로 interpretationsCount는 항상 0
        const interpretationsCount=0;
        return{sessions:sessionsData?.length||0,memories:memoriesCount,interpretations:interpretationsCount};
    }catch(e){
        console.error('loadUserStatsFromDB error:',e);
        return{sessions:0,memories:0,interpretations:0};
    }
}
function renderSessionHistoryEmpty(){const listEl=document.getElementById('sessionHistoryList');if(listEl)listEl.innerHTML='<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">저장된 세션이 없습니다.</div>'}
function renderMyMemoriesEmpty(){const listEl=document.getElementById('myMemoriesList');if(listEl)listEl.innerHTML='<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">아직 공유한 기억이 없습니다.</div>'}
function renderSessionHistoryList(sessions){const listEl=document.getElementById('sessionHistoryList');if(!listEl){return}if(!sessions||sessions.length===0){renderSessionHistoryEmpty();return}listEl.innerHTML='';sessions.forEach(session=>{const sessionItem=document.createElement('div');sessionItem.style.padding='.8rem';sessionItem.style.marginBottom='.5rem';sessionItem.style.background='var(--bg-surface)';sessionItem.style.border='1px solid rgba(196,168,130,.1)';sessionItem.style.borderRadius='4px';sessionItem.style.cursor='pointer';sessionItem.style.transition='all .3s';sessionItem.onmouseenter=()=>{sessionItem.style.borderColor='var(--accent-memory)';sessionItem.style.transform='translateX(4px)'};sessionItem.onmouseleave=()=>{sessionItem.style.borderColor='rgba(196,168,130,.1)';sessionItem.style.transform='translateX(0)'};const date=session.created_at?new Date(session.created_at).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';const role=session.narrator_id===currentUser?.id?'화자':session.experiencer_id===currentUser?.id?'체험자':'—';const status=session.ended_at?'완료':'진행중';const alignment=session.alignment?Math.round(session.alignment*100)+'%':'0%';const fate=session.memory_fate==='preserve'?'보존':session.memory_fate==='dilute'?'자연 소멸':session.memory_fate==='anonymous'?'완전 익명':'—';sessionItem.innerHTML=`<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${date}</strong> <span style="color:var(--accent-memory);font-size:.75rem">[${session.session_code||'—'}]</span></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">역할: ${role} | 상태: ${status}<br>정렬도: ${alignment} | 운명: ${fate}</div>`;sessionItem.onclick=()=>{showSessionDetail(session.id)};listEl.appendChild(sessionItem)})}
function renderMyMemoriesList(memories){const listEl=document.getElementById('myMemoriesList');if(!listEl){return}if(!memories||memories.length===0){renderMyMemoriesEmpty();return}listEl.innerHTML='';memories.forEach(memory=>{const memoryItem=document.createElement('div');memoryItem.style.padding='.8rem';memoryItem.style.marginBottom='.5rem';memoryItem.style.background='var(--bg-surface)';memoryItem.style.border='1px solid rgba(196,168,130,.1)';memoryItem.style.borderRadius='4px';memoryItem.style.cursor='pointer';const date=memory.created_at?new Date(memory.created_at).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'}):'—';const title=memory.title||memory.code||'무제';const dilution=memory.dilution!==undefined?memory.dilution+'%':'—';const fate=memory.memory_fate==='preserve'?'보존':memory.memory_fate==='dilute'?'자연 소멸':memory.memory_fate==='anonymous'?'완전 익명':'—';memoryItem.innerHTML=`<div style="font-size:.9rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${title}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">${date} | 희석도: ${dilution} | 운명: ${fate}</div>`;memoryItem.onclick=()=>{closeMypage();viewMemoryFromArchive(memory.id)};listEl.appendChild(memoryItem)})}
function updateMypageStats(stats){document.getElementById('displayLiveSessions').textContent=stats.sessions||0;document.getElementById('displayMemories').textContent=stats.memories||0;document.getElementById('displayInterpretations').textContent=stats.interpretations||0}
function viewMemoryFromArchive(memoryId){enterArchive();setTimeout(()=>{const memory=allMemoriesData.find(m=>m.id===memoryId);if(memory){selectMemory(memory)}},500)}
async function showSessionDetail(sessionId){supabaseClient = getSupabaseClient(); if(!supabaseClient){showNotification('Supabase 클라이언트가 초기화되지 않았습니다');return}const modal=document.getElementById('sessionDetailModal');const body=document.getElementById('sessionDetailBody');if(!modal||!body){return}modal.classList.add('active');body.innerHTML='<div style="text-align:center;padding:2rem;color:var(--text-muted)">불러오는 중...</div>';try{const{data:sessionData,error:sessionError}=await supabaseClient.from('live_sessions').select('*').eq('id',sessionId).single();if(sessionError)throw sessionError;const{data:scenesData,error:scenesError}=await supabaseClient.from('live_scenes').select('*').eq('session_id',sessionId).order('scene_index',{ascending:true});if(scenesError)throw scenesError;const date=sessionData.created_at?new Date(sessionData.created_at).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';const endDate=sessionData.ended_at?new Date(sessionData.ended_at).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';const role=sessionData.narrator_id===currentUser?.id?'화자':sessionData.experiencer_id===currentUser?.id?'체험자':'—';const status=sessionData.ended_at?'완료':'진행중';const alignment=sessionData.alignment?Math.round(sessionData.alignment*100)+'%':'0%';const fate=sessionData.memory_fate==='preserve'?'보존':sessionData.memory_fate==='dilute'?'자연 소멸':sessionData.memory_fate==='anonymous'?'완전 익명':'미정';document.getElementById('sessionDetailTitle').textContent=sessionData.session_code||'세션 정보';let scenesHtml='';if(scenesData&&scenesData.length>0){scenesHtml='<div class="session-detail-scenes"><h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.3rem;color:var(--accent-memory);margin-bottom:1rem;letter-spacing:.1em">장면 목록</h3>';scenesData.forEach((scene,index)=>{const sceneText=scene.text||'[텍스트 없음]';const sceneType=scene.scene_type||'normal';const voidInfo=scene.void_info;scenesHtml+=`<div class="session-detail-scene-item"><div class="session-detail-scene-header">장면 ${index+1}${sceneType==='void'?' (기억의 공백)':''}</div><div class="session-detail-scene-text">${sceneText}</div>${voidInfo&&voidInfo.reason?`<div style="font-size:.85rem;color:var(--text-muted);font-style:italic;margin-top:.5rem">공백 이유: ${voidInfo.reason}</div>`:''}</div>`});scenesHtml+='</div>'}else{scenesHtml='<div style="text-align:center;padding:2rem;color:var(--text-muted);font-style:italic">저장된 장면이 없습니다.</div>'}body.innerHTML=`<div class="session-detail-info-item"><div class="session-detail-info-label">세션 코드</div><div class="session-detail-info-value">${sessionData.session_code||'—'}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">시작일시</div><div class="session-detail-info-value">${date}</div></div>${sessionData.ended_at?`<div class="session-detail-info-item"><div class="session-detail-info-label">종료일시</div><div class="session-detail-info-value">${endDate}</div></div>`:''}<div class="session-detail-info-item"><div class="session-detail-info-label">역할</div><div class="session-detail-info-value">${role}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">상태</div><div class="session-detail-info-value">${status}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">정렬도</div><div class="session-detail-info-value">${alignment}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">운명</div><div class="session-detail-info-value">${fate}</div></div>${scenesHtml}`}catch(e){console.error('showSessionDetail error:',e);body.innerHTML='<div style="text-align:center;padding:2rem;color:var(--text-muted)">세션 정보를 불러오는 중 오류가 발생했습니다.</div>';showNotification('세션 정보를 불러오는 중 오류가 발생했습니다')}}
function closeSessionDetail(){const modal=document.getElementById('sessionDetailModal');if(modal){modal.classList.remove('active')}}
function renderSessionHistory_DEPRECATED(){const listEl=document.getElementById('sessionHistoryList');if(!listEl||!currentUser||!currentUser.sessionHistory||currentUser.sessionHistory.length===0){if(listEl)listEl.innerHTML='<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">저장된 세션이 없습니다.</div>';return}listEl.innerHTML='';currentUser.sessionHistory.forEach(session=>{const sessionItem=document.createElement('div');sessionItem.style.padding='.8rem';sessionItem.style.marginBottom='.5rem';sessionItem.style.background='var(--bg-surface)';sessionItem.style.border='1px solid rgba(196,168,130,.1)';sessionItem.innerHTML=`<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${session.date}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">역할: ${session.role} | 운명: ${session.memoryFate==='preserve'?'보존':session.memoryFate==='dilute'?'자연 소멸':session.memoryFate==='anonymous'?'완전 익명':'—'}<br>정렬도: ${session.alignment} | 장면: ${session.scenes} | 조각: ${session.fragments} | 일치: ${session.matches}</div>`;listEl.appendChild(sessionItem)})}
function showNpcDialogue(text,duration=4000){const dialogue=document.getElementById('npcDialogue');if(dialogue){document.getElementById('npcText').textContent=text;dialogue.classList.add('visible');setTimeout(()=>{dialogue.classList.remove('visible')},duration)}}
function showNotification(text){const notification=document.getElementById('notification');if(notification){notification.textContent=text;notification.classList.add('visible');setTimeout(()=>{notification.classList.remove('visible')},3000)}}
const freeInputEl=document.getElementById('freeInput');if(freeInputEl){freeInputEl.addEventListener('keypress',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();const customAction=this.value.trim();if(customAction){this.value='';userChoices.push(-1);showNpcDialogue('"'+customAction+'"... 흥미로운 선택이야.',3000);document.getElementById('emotionQuestion').textContent="왜 그런 선택을 했어?";document.getElementById('emotionModal').classList.add('active');document.getElementById('emotionInputField').focus()}}})}
const experiencerFeelingInputEl=document.getElementById('experiencerFeelingInput');if(experiencerFeelingInputEl){experiencerFeelingInputEl.addEventListener('keypress',function(e){if(e.key==='Enter'&&e.ctrlKey&&!e.isComposing){e.preventDefault();submitExperiencerFeeling()}})}
const emotionInputFieldEl=document.getElementById('emotionInputField');if(emotionInputFieldEl){emotionInputFieldEl.addEventListener('keypress',function(e){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();submitEmotion()}})}
const sessionCodeInputEl=document.getElementById('sessionCodeInput');if(sessionCodeInputEl){sessionCodeInputEl.addEventListener('input',function(e){this.value=this.value.toUpperCase()})}
const loginPasswordEl=document.getElementById('loginPassword');if(loginPasswordEl){loginPasswordEl.addEventListener('keypress',function(e){if(e.key==='Enter'){handleLogin()}})}
const loginUsernameEl=document.getElementById('loginUsername');if(loginUsernameEl){loginUsernameEl.addEventListener('keypress',function(e){if(e.key==='Enter'){document.getElementById('loginPassword').focus()}})}
const signupPasswordConfirmEl=document.getElementById('signupPasswordConfirm');if(signupPasswordConfirmEl){signupPasswordConfirmEl.addEventListener('keypress',function(e){if(e.key==='Enter'){handleSignup()}})}
const signupPasswordEl=document.getElementById('signupPassword');if(signupPasswordEl){signupPasswordEl.addEventListener('keypress',function(e){if(e.key==='Enter'){document.getElementById('signupPasswordConfirm').focus()}})}
const signupEmailEl=document.getElementById('signupEmail');if(signupEmailEl){signupEmailEl.addEventListener('keypress',function(e){if(e.key==='Enter'){document.getElementById('signupPassword').focus()}})}
const signupUsernameEl=document.getElementById('signupUsername');if(signupUsernameEl){signupUsernameEl.addEventListener('keypress',function(e){if(e.key==='Enter'&&!e.isComposing){document.getElementById('signupEmail').focus()}})}
function typeText(element,text,callback){let index=0;element.textContent='';element.classList.add('typing');function typeChar(){if(index<text.length){element.textContent+=text.charAt(index);index++;setTimeout(typeChar,50)}else{element.classList.remove('typing');if(callback)callback()}}typeChar()}
function typeTextAsync(element,text,speed=80){return new Promise(resolve=>{element.classList.add('typing');let i=0;element.textContent='';const timer=setInterval(()=>{if(i<text.length){element.textContent+=text.charAt(i);i++}else{clearInterval(timer);element.classList.remove('typing');resolve()}},speed)})}
async function playNpcIntro(){const centerWrapper=document.querySelector('.intro-center-wrapper');const dialogue=document.getElementById('npcIntroDialogue');if(!centerWrapper||!dialogue)return;await new Promise(r=>setTimeout(r,2000));centerWrapper.classList.add('lifted');await new Promise(r=>setTimeout(r,1000));dialogue.classList.add('visible');await typeTextAsync(dialogue,'처음이야?',100);await new Promise(r=>setTimeout(r,1500));dialogue.textContent='';await typeTextAsync(dialogue,'내가 필요하면 언제든 불러.',80);await new Promise(r=>setTimeout(r,2000));dialogue.classList.remove('visible');await new Promise(r=>setTimeout(r,500));centerWrapper.classList.remove('lifted')}
let openingSkipped=false;let openingWaveAnimationId=null;let openingMouseX=-100;let openingMouseY=-100;let hasZoomedIn=false;let openingSequenceStarted=false;let openingSound=null;let fadeOutAnimationId=null;let fadeOutInterval=null;let crossfadeTimeUpdateHandler=null;let crossfadeEndedHandler=null;
function fadeInSound(audio,targetVolume=0.6,duration=4000){if(!audio){console.error('fadeInSound: audio 요소가 없습니다');return}audio.volume=0;const playPromise=audio.play();if(playPromise!==undefined){playPromise.then(()=>{console.log('오프닝 사운드 재생 시작');const steps=60;const step=targetVolume/steps;const interval=duration/steps;let currentStep=0;const fade=setInterval(()=>{currentStep++;if(currentStep<steps){audio.volume=Math.min(1,Math.max(0,Math.min(step*currentStep,targetVolume)))}else{audio.volume=Math.min(1,Math.max(0,targetVolume));clearInterval(fade)}},interval)}).catch(e=>{console.error('오프닝 사운드 재생 실패:',e);console.error('오디오 상태:',{readyState:audio.readyState,networkState:audio.networkState,error:audio.error})})}}
function fadeOutSound(audio,duration=3000){if(!audio)return;if(fadeOutAnimationId){cancelAnimationFrame(fadeOutAnimationId);fadeOutAnimationId=null}if(crossfadeTimeUpdateHandler&&audio){audio.removeEventListener('timeupdate',crossfadeTimeUpdateHandler);crossfadeTimeUpdateHandler=null}if(crossfadeEndedHandler&&audio){audio.removeEventListener('ended',crossfadeEndedHandler);crossfadeEndedHandler=null}const startVolume=Math.max(audio.volume||0,0.01);if(startVolume<=0){audio.pause();audio.currentTime=0;return}if(audio.paused){audio.play().catch(()=>{})}const startTime=performance.now();let lastVolume=startVolume;let pauseCheckInterval=setInterval(()=>{if(audio&&audio.paused&&lastVolume>0.01){audio.play().catch(()=>{})}},50);function animateFadeOut(currentTime){if(!audio){if(fadeOutAnimationId){cancelAnimationFrame(fadeOutAnimationId);fadeOutAnimationId=null}if(pauseCheckInterval){clearInterval(pauseCheckInterval);pauseCheckInterval=null}return}if(audio.paused&&lastVolume>0.01){audio.play().catch(()=>{})}const elapsed=currentTime-startTime;const progress=Math.min(elapsed/duration,1);const newVolume=Math.max(startVolume*(1-progress),0);lastVolume=newVolume;try{if(audio){audio.volume=Math.min(1,Math.max(0.001,Math.max(newVolume,0.001)))}}catch(e){console.error('Volume update error:',e)}if(progress>=1||newVolume<=0.01){if(pauseCheckInterval){clearInterval(pauseCheckInterval);pauseCheckInterval=null}setTimeout(()=>{try{if(audio){audio.volume=0;audio.pause();audio.currentTime=0}}catch(e){console.error('Audio pause error:',e)}if(fadeOutAnimationId){cancelAnimationFrame(fadeOutAnimationId);fadeOutAnimationId=null}},200)}else{fadeOutAnimationId=requestAnimationFrame(animateFadeOut)}}fadeOutAnimationId=requestAnimationFrame(animateFadeOut)}
function setupLoopWithCrossfade(audio,targetVolume=0.6,fadeDuration=2){if(!audio)return;if(crossfadeTimeUpdateHandler){audio.removeEventListener('timeupdate',crossfadeTimeUpdateHandler)}if(crossfadeEndedHandler){audio.removeEventListener('ended',crossfadeEndedHandler)}crossfadeTimeUpdateHandler=function(){if(fadeOutInterval)return;const timeLeft=audio.duration-audio.currentTime;if(timeLeft<=fadeDuration&&timeLeft>0){audio.volume=Math.min(1,Math.max(0,targetVolume*(timeLeft/fadeDuration)))}};crossfadeEndedHandler=function(){if(fadeOutInterval)return;audio.currentTime=0;fadeInSound(audio,targetVolume,fadeDuration*1000)};audio.addEventListener('timeupdate',crossfadeTimeUpdateHandler);audio.addEventListener('ended',crossfadeEndedHandler)}
function skipToIntro(){openingSequenceStarted=true;skipOpening()}
function showContinueButton(){if(openingSkipped)return;const startHint=document.getElementById('openingStartHint');if(startHint){startHint.style.opacity='';startHint.classList.add('visible')}}
function showFourthText(dialogue){if(openingSkipped)return;typeText(dialogue,'\n아니면… 누군가의 기억을 먼저 들여다볼래?',function(){if(openingSkipped)return;setTimeout(showContinueButton,500)})}
function showThirdText(dialogue){if(openingSkipped)return;typeText(dialogue,'\n무슨 기억을 남기고 싶어?',function(){if(openingSkipped)return;setTimeout(function(){showFourthText(dialogue)},800)})}
function showSecondText(dialogue){if(openingSkipped)return;typeText(dialogue,'\n나는 또다른 너야.',function(){if(openingSkipped)return;setTimeout(function(){showThirdText(dialogue)},800)})}
function showFirstText(dialogue){if(openingSkipped)return;typeText(dialogue,'\n안녕.',function(){if(openingSkipped)return;setTimeout(function(){showSecondText(dialogue)},800)})}
function startOpeningWaveAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    // 커서 호버 효과를 위한 이벤트 리스너
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        openingMouseX = (e.clientX - rect.left) * 2;
        openingMouseY = (e.clientY - rect.top) * 2;
    });
    canvas.addEventListener('mouseleave', function() {
        openingMouseX = -100;
        openingMouseY = -100;
    });
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    
    const waves = [
        { color: 'rgba(100,130,150,', baseOpacity: 0.10, speed: 0.008, amplitude: 55, phase: 0, freq: 0.006 },
        { color: 'rgba(120,150,170,', baseOpacity: 0.15, speed: 0.012, amplitude: 45, phase: 0.6, freq: 0.009 },
        { color: 'rgba(130,155,175,', baseOpacity: 0.20, speed: 0.016, amplitude: 38, phase: 1.2, freq: 0.012 },
        { color: 'rgba(140,165,185,', baseOpacity: 0.26, speed: 0.020, amplitude: 30, phase: 1.9, freq: 0.015 },
        { color: 'rgba(155,175,195,', baseOpacity: 0.33, speed: 0.024, amplitude: 24, phase: 2.6, freq: 0.018 },
        { color: 'rgba(170,190,205,', baseOpacity: 0.42, speed: 0.028, amplitude: 18, phase: 3.3, freq: 0.021 },
        { color: 'rgba(190,205,215,', baseOpacity: 0.52, speed: 0.032, amplitude: 13, phase: 4.0, freq: 0.024 },
    ];
    
    let time = 0;
    
    function animate() {
        // 잔상 효과 (화면 배경색과 동일: #0a0a0c)
        ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
        ctx.fillRect(0, 0, width, height);
        
        const centerY = height / 2;
        
        waves.forEach((wave) => {
            ctx.beginPath();
            ctx.lineWidth = 1.2;
            
            for (let x = 0; x < width; x++) {
                // 커서 반응 (openingMouseX, openingMouseY 전역변수 사용)
                const dist = Math.sqrt(Math.pow(x - openingMouseX, 2) + Math.pow(centerY - openingMouseY, 2));
                const influence = Math.max(0, 1 - dist / 180);
                
                const amp = wave.amplitude * (1 + influence * 1.65);
                
                // 복합 사인파
                const y = centerY 
                    + Math.sin(x * wave.freq + time * wave.speed + wave.phase) * amp
                    + Math.sin(x * wave.freq * 0.5 + time * wave.speed * 0.6 + wave.phase * 1.4) * (amp * 0.4)
                    + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.3) * (amp * 0.15);
                
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            
            ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
            ctx.stroke();
        });
        
        time += 0.5;
        if (!openingSkipped) {
            openingWaveAnimationId = requestAnimationFrame(animate);
        }
    }
    
    animate();
}
function startOpeningSequence(){if(openingSkipped)return;const waveContainer=document.getElementById('openingWaveContainer');if(waveContainer){waveContainer.style.transform='scale(1)';waveContainer.style.opacity='1';waveContainer.classList.add('visible')}const canvas=document.getElementById('openingWaveCanvas');if(canvas)startOpeningWaveAnimation(canvas);setTimeout(function(){if(openingSkipped)return;const dialogue=document.getElementById('openingDialogue');if(dialogue)showFirstText(dialogue)},2500)}
function skipOpening(){if(openingSkipped)return;openingSkipped=true;if(openingWaveAnimationId){cancelAnimationFrame(openingWaveAnimationId);openingWaveAnimationId=null}if(openingSound){if(crossfadeTimeUpdateHandler&&openingSound){openingSound.removeEventListener('timeupdate',crossfadeTimeUpdateHandler);crossfadeTimeUpdateHandler=null}if(crossfadeEndedHandler&&openingSound){openingSound.removeEventListener('ended',crossfadeEndedHandler);crossfadeEndedHandler=null}fadeOutSound(openingSound,500);setTimeout(()=>{finishOpeningSequence()},600)}else{finishOpeningSequence()}}
function handleOpeningKeydown(e){if(!openingSkipped){e.preventDefault();skipOpening()}}
function finishOpeningSequence(){const openingScreen=document.getElementById('openingScreen');const introScreen=document.getElementById('introScreen');if(openingScreen){openingScreen.removeEventListener('click',skipOpening);openingScreen.style.cssText='display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important';openingScreen.classList.add('hidden')}document.removeEventListener('keydown',handleOpeningKeydown);if(introScreen){introScreen.style.cssText='display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important';introScreen.classList.add('visible');introScreen.classList.remove('hidden')}playNpcIntro()}
document.addEventListener('DOMContentLoaded',function(){openingSound=document.getElementById('openingSound');if(openingSound){openingSound.addEventListener('error',function(e){console.error('오프닝 사운드 로드 실패:',e);const error=openingSound.error;if(error){console.error('오디오 에러 코드:',error.code,'메시지:',error.message)}});openingSound.addEventListener('canplaythrough',function(){console.log('오프닝 사운드 로드 완료')});openingSound.load()}const openingScreen=document.getElementById('openingScreen');if(openingScreen){openingScreen.style.cssText='display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:3000 !important'}const waveContainer=document.getElementById('openingWaveContainer');if(waveContainer){waveContainer.classList.add('visible');const canvas=document.getElementById('openingWaveCanvas');if(canvas)startOpeningWaveAnimation(canvas)}const hint=document.getElementById('openingStartHint');if(hint){hint.style.opacity='1';hint.classList.add('visible')}});
const openingScreenEl=document.getElementById('openingScreen');if(openingScreenEl){openingScreenEl.addEventListener('click',function(e){if(hasZoomedIn){skipToIntro();return}hasZoomedIn=true;const waveContainer=document.getElementById('openingWaveContainer');if(waveContainer){waveContainer.style.transform='scale(1)';waveContainer.style.opacity='1'}if(openingSound){setupLoopWithCrossfade(openingSound,0.6,2);fadeInSound(openingSound,0.6,4000)}const hint=document.getElementById('openingStartHint');if(hint)hint.style.opacity='0';setTimeout(()=>{if(!openingSequenceStarted){openingSequenceStarted=true;startOpeningSequence()}},800)})}document.addEventListener('keydown',handleOpeningKeydown);
async function checkSession(){supabaseClient = getSupabaseClient(); if(!supabaseClient)return;const{data:{session}}=await supabaseClient.auth.getSession();if(session){isLoggedIn=true;currentUser={id:session.user.id,username:session.user.user_metadata?.username||session.user.email.split('@')[0],email:session.user.email,joinDate:new Date(session.user.created_at).toLocaleDateString('ko-KR'),liveSessions:0,memories:0,interpretations:0,visitedMemories:[],sessionHistory:[]}}}
(async function(){await checkSession()})();

// 전역 스코프에 함수 노출 (onclick 속성에서 사용하기 위해)
window.openPortfolio = openPortfolio;
window.openMypage = openMypage;
window.showModeSelection = showModeSelection;
window.enterArchive = enterArchive;
window.handleSocialLogin = handleSocialLogin;
window.handleLogin = handleLogin;
window.closeLogin = closeLogin;
window.switchToSignup = switchToSignup;
window.handleSignup = handleSignup;
window.closeSignup = closeSignup;
window.switchToLogin = switchToLogin;
window.handleLogout = handleLogout;
window.closeMypage = closeMypage;
window.selectMatching = selectMatching;
window.backToIntro = backToIntro;
window.selectRole = selectRole;
window.copySessionCode = copySessionCode;
window.joinSession = joinSession;
window.filterByCategory = filterByCategory;
window.sortMemories = sortMemories;
window.backToMatchingSelection = backToMatchingSelection;
window.backToModeSelection = backToModeSelection;
window.exitLive = exitLive;
window.switchGeneratedTab = switchGeneratedTab;
window.toggleEditMode = toggleEditMode;
window.toggleRecording = toggleRecording;
window.switchToTextInput = switchToTextInput;
window.sendExpChatMessage = sendExpChatMessage;
window.toggleExpRecording = toggleExpRecording;
window.switchExpToTextInput = switchExpToTextInput;
window.backToList = backToList;
window.saveMemory = saveMemory;
window.goToIntro = goToIntro;
window.submitEmotion = submitEmotion;
window.selectMemoryFate = selectMemoryFate;
window.closeSessionDetail = closeSessionDetail;
window.sendChatMessage = sendChatMessage;
window.selectMemory = selectMemory;
window.handleConfirm = handleConfirm;
window.handleExpConfirm = handleExpConfirm;
window.filterMemories = filterMemories;
let comparisonScenes = [];
let comparisonCurrentIndex = 0;
async function calculateAverageAlignment() {
    try {
        const currentData = window.currentStoryData || storyData;
        if (!currentData || !currentData.scenes) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const memoryId = currentData.id || (allMemoriesData[currentMemory] && allMemoriesData[currentMemory].id);
        if (!memoryId) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const sceneAlignments = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
            if (scene.sceneType === 'branch' || scene.sceneType === 'ending') {
                let alignment = null;
                if (window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    alignment = window.archiveSceneAlignments[i];
                } else if (supabaseClient && scene.id) {
                    const { data: playData } = await supabaseClient
                        .from('plays')
                        .select('alignment, user_emotion')
                        .eq('scene_id', scene.id)
                        .eq('memory_id', memoryId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (playData) {
                        if (playData.alignment !== null && playData.alignment !== undefined) {
                            alignment = playData.alignment;
                        } else if (playData.user_emotion && scene.originalEmotion) {
                            alignment = cosineSimilarity(playData.user_emotion, scene.originalEmotion);
                        }
                    } else if (window.archiveUserEmotions && window.archiveUserEmotions[i] && scene.originalEmotion) {
                        alignment = cosineSimilarity(window.archiveUserEmotions[i].emotion, scene.originalEmotion);
                    }
                } else if (window.archiveUserEmotions && window.archiveUserEmotions[i] && scene.originalEmotion) {
                    alignment = cosineSimilarity(window.archiveUserEmotions[i].emotion, scene.originalEmotion);
                }
                if (alignment !== null && alignment !== undefined) {
                    sceneAlignments.push(alignment);
                }
            }
        }
        if (sceneAlignments.length === 0) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const averageAlignment = sceneAlignments.reduce((sum, val) => sum + val, 0) / sceneAlignments.length;
        const isTrueEnding = averageAlignment >= 0.65;
        console.log('평균 정렬도 계산:', { sceneAlignments, averageAlignment, isTrueEnding });
        return { averageAlignment, isTrueEnding };
    } catch (e) {
        console.error('calculateAverageAlignment error:', e);
        return { averageAlignment: 0, isTrueEnding: false };
    }
}
async function showComparisonView() {
    try {
        const currentData = window.currentStoryData || storyData;
        if (!currentData || !currentData.scenes) {
            console.error('비교 화면: 장면 데이터가 없습니다');
            return;
        }
        const memoryId = currentData.id || (allMemoriesData[currentMemory] && allMemoriesData[currentMemory].id);
        if (!memoryId) {
            console.error('비교 화면: memory_id를 찾을 수 없습니다');
            return;
        }
        const branchEndingScenes = currentData.scenes.filter((scene, index) => 
            (scene.sceneType === 'branch' || scene.sceneType === 'ending') && 
            window.archiveUserEmotions && window.archiveUserEmotions[index]
        );
        if (branchEndingScenes.length === 0) {
            console.log('비교 화면: 비교할 장면이 없습니다');
            const alignmentResult = await calculateAverageAlignment();
            showEndScreen(alignmentResult);
            return;
        }
        comparisonScenes = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
            if (scene.sceneType === 'branch' || scene.sceneType === 'ending') {
                const userEmotionData = window.archiveUserEmotions && window.archiveUserEmotions[i] ? window.archiveUserEmotions[i] : null;
                let playData = null;
                let sceneAlignment = null;
                if (supabaseClient && scene.id) {
                    const { data: playsData, error: playsError } = await supabaseClient
                        .from('plays')
                        .select('user_emotion, user_reason, alignment')
                        .eq('scene_id', scene.id)
                        .eq('memory_id', memoryId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (playsError) {
                        console.warn(`[비교 화면] Scene ${scene.id} plays 조회 실패:`, playsError);
                    }
                    if (playsData) {
                        playData = playsData;
                        sceneAlignment = playsData.alignment;
                    }
                }
                if (!playData && !userEmotionData) {
                    console.log(`[비교 화면] Scene ${i} (${scene.id}): plays 데이터와 archiveUserEmotions 모두 없음, 스킵`);
                    continue;
                }
                if (sceneAlignment === null && window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    sceneAlignment = window.archiveSceneAlignments[i];
                }
                let userEmotion = playData?.user_emotion || (userEmotionData ? userEmotionData.emotion : null);
                let originalEmotion = scene.originalEmotion;
                if (typeof userEmotion === 'string') {
                    try {
                        userEmotion = JSON.parse(userEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] user_emotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (typeof originalEmotion === 'string') {
                    try {
                        originalEmotion = JSON.parse(originalEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] originalEmotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (!userEmotion || !originalEmotion) {
                    console.warn(`[비교 화면] Scene ${i} (${scene.id}): 감정 벡터 누락`, {
                        hasUserEmotion: !!userEmotion,
                        hasOriginalEmotion: !!originalEmotion
                    });
                    continue;
                }
                console.log(`[비교 화면] Scene ${i} 데이터:`, {
                    sceneId: scene.id,
                    sceneType: scene.sceneType,
                    userEmotion: userEmotion,
                    originalEmotion: originalEmotion,
                    userEmotionType: typeof userEmotion,
                    originalEmotionType: typeof originalEmotion,
                    userEmotionKeys: userEmotion ? Object.keys(userEmotion) : null,
                    originalEmotionKeys: originalEmotion ? Object.keys(originalEmotion) : null
                });
                comparisonScenes.push({
                    scene: scene,
                    sceneIndex: i,
                    userEmotion: userEmotion,
                    userReason: playData?.user_reason || (userEmotionData ? userEmotionData.reason : ''),
                    originalEmotion: originalEmotion,
                    originalReason: scene.originalReason || '',
                    alignment: sceneAlignment
                });
            }
        }
        if (comparisonScenes.length === 0) {
            console.log('비교 화면: 비교할 장면이 없습니다');
            const alignmentResult = await calculateAverageAlignment();
            showEndScreen(alignmentResult);
            return;
        }
        comparisonCurrentIndex = 0;
        const alignmentResult = await calculateAverageAlignment();
        window.archiveAlignmentResult = alignmentResult;
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'flex';
            comparisonViewEl.style.zIndex = '2500';
        }
        renderComparisonView();
        setupComparisonSwipe();
    } catch (e) {
        console.error('showComparisonView error:', e);
        showEndScreen();
    }
}
function renderComparisonView() {
    if (comparisonScenes.length === 0) return;
    const container = document.getElementById('comparisonScenesContainer');
    const dotsContainer = document.getElementById('comparisonDots');
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (!container || !dotsContainer || !counterEl) return;
    container.innerHTML = '';
    dotsContainer.innerHTML = '';
    comparisonScenes.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = 'comparison-scene-slide';
        slide.innerHTML = `
            <div class="comparison-scene-text">${item.scene.text || ''}</div>
            <div class="comparison-waves-container">
                <div class="comparison-wave-item">
                    <div class="comparison-wave-label user">체험자 (B)의 감정</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="user" data-index="${index}"></canvas>
                        <div class="comparison-tooltip">${item.userReason || '이유 없음'}</div>
                    </div>
                </div>
                <div class="comparison-wave-item">
                    <div class="comparison-wave-label original">원본 (A)의 감정</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="original" data-index="${index}"></canvas>
                        <div class="comparison-tooltip">${item.originalReason || '이유 없음'}</div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(slide);
        const dot = document.createElement('div');
        dot.className = 'comparison-dot';
        if (index === 0) dot.classList.add('active');
        dot.onclick = () => navigateComparisonTo(index);
        dotsContainer.appendChild(dot);
    });
    counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    updateComparisonNavigation();
    renderComparisonWaves();
    updateComparisonAlignment();
    updateComparisonAverageAlignment();
}
function renderComparisonWaves() {
    console.log('[renderComparisonWaves] 시작, comparisonScenes:', comparisonScenes);
    stopComparisonWaveAnimation();
    startComparisonWaveAnimation();
}
function startComparisonWaveAnimation() {
    if (comparisonWaveAnimationId) {
        cancelAnimationFrame(comparisonWaveAnimationId);
    }
    comparisonWaveTime = 0;
    const initializedCanvases = new Map();
    function initializeCanvas(canvas) {
        if (!canvas) return false;
        if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return false;
        if (initializedCanvases.has(canvas)) return true;
        try {
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            ctx.scale(2, 2);
            initializedCanvases.set(canvas, true);
            return true;
        } catch (e) {
            console.error('Comparison canvas initialization error:', e);
            return false;
        }
    }
    function drawComparisonWave(canvas, emotionVector, timeOffset, type) {
        if (!canvas || !emotionVector) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        const t = comparisonWaveTime + timeOffset;
        const waveStyle = emotionVectorToWaveStyle(emotionVector);
        const points = [];
        const segments = 100;
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            const normalizedX = x / width;
            let y = Math.sin(x * waveStyle.frequency + t * waveStyle.speed) * waveStyle.amplitude;
            y += Math.sin(x * waveStyle.frequency * 2.3 + t * waveStyle.speed * 0.7) * (waveStyle.amplitude * 0.4);
            y += Math.sin(x * waveStyle.frequency * 0.4 + t * waveStyle.speed * 0.3) * (waveStyle.amplitude * 0.6);
            const chaosAmount = waveStyle.chaos * 15;
            y += (noise(x * 0.01, t * 0.1, 0) - 0.5) * chaosAmount;
            const edgeFade = Math.sin(normalizedX * Math.PI);
            y *= edgeFade;
            points.push({ x, y: centerY + y });
        }
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        const color = waveStyle.color;
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.8)`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
    function animate() {
        comparisonScenes.forEach((item, index) => {
            const userCanvas = document.querySelector(`canvas[data-type="user"][data-index="${index}"]`);
            const originalCanvas = document.querySelector(`canvas[data-type="original"][data-index="${index}"]`);
            if (userCanvas && item.userEmotion) {
                if (initializeCanvas(userCanvas)) {
                    const ctx = userCanvas.getContext('2d');
                    const width = userCanvas.width / 2;
                    const height = userCanvas.height / 2;
                    ctx.clearRect(0, 0, width, height);
                    ctx.fillStyle = 'rgba(18, 18, 26, 1)';
                    ctx.fillRect(0, 0, width, height);
                    drawComparisonWave(userCanvas, item.userEmotion, 0, 'user');
                }
            }
            if (originalCanvas && item.originalEmotion) {
                if (initializeCanvas(originalCanvas)) {
                    const ctx = originalCanvas.getContext('2d');
                    const width = originalCanvas.width / 2;
                    const height = originalCanvas.height / 2;
                    ctx.clearRect(0, 0, width, height);
                    ctx.fillStyle = 'rgba(18, 18, 26, 1)';
                    ctx.fillRect(0, 0, width, height);
                    drawComparisonWave(originalCanvas, item.originalEmotion, 50, 'original');
                }
            }
        });
        comparisonWaveTime += 0.016;
        comparisonWaveAnimationId = requestAnimationFrame(animate);
    }
    animate();
}
function stopComparisonWaveAnimation() {
    if (comparisonWaveAnimationId) {
        cancelAnimationFrame(comparisonWaveAnimationId);
        comparisonWaveAnimationId = null;
    }
}
function updateComparisonAlignment() {
    if (comparisonScenes.length === 0 || comparisonCurrentIndex >= comparisonScenes.length) {
        console.warn('[updateComparisonAlignment] 비교 장면이 없습니다');
        return;
    }
    const item = comparisonScenes[comparisonCurrentIndex];
    console.log(`[updateComparisonAlignment] Scene ${comparisonCurrentIndex}:`, {
        hasAlignment: item.alignment !== null && item.alignment !== undefined,
        alignment: item.alignment,
        hasUserEmotion: !!item.userEmotion,
        hasOriginalEmotion: !!item.originalEmotion,
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion
    });
    let alignment = null;
    if (item.alignment !== null && item.alignment !== undefined) {
        alignment = item.alignment;
        console.log(`[updateComparisonAlignment] 저장된 정렬도 사용: ${alignment}`);
    } else if (item.userEmotion && item.originalEmotion) {
        console.log(`[updateComparisonAlignment] 정렬도 계산 시작...`);
        alignment = cosineSimilarity(item.userEmotion, item.originalEmotion);
        console.log(`[updateComparisonAlignment] 계산된 정렬도: ${alignment}`);
    } else {
        console.warn(`[updateComparisonAlignment] 정렬도를 계산할 수 없습니다:`, {
            hasUserEmotion: !!item.userEmotion,
            hasOriginalEmotion: !!item.originalEmotion
        });
    }
    if (alignment === null) {
        console.warn('[updateComparisonAlignment] 정렬도가 null입니다');
        return;
    }
    const alignmentValueEl = document.getElementById('comparisonAlignmentValue');
    const alignmentFillEl = document.getElementById('comparisonAlignmentFill');
    if (alignmentValueEl) {
        alignmentValueEl.textContent = alignment.toFixed(2);
        console.log(`[updateComparisonAlignment] 정렬도 표시 업데이트: ${alignment.toFixed(2)}`);
    }
    if (alignmentFillEl) {
        alignmentFillEl.style.width = (alignment * 100) + '%';
    }
}
function updateComparisonAverageAlignment() {
    const alignmentResult = window.archiveAlignmentResult;
    if (!alignmentResult) return;
    const averageValueEl = document.getElementById('comparisonAverageAlignmentValue');
    const averageFillEl = document.getElementById('comparisonAverageAlignmentFill');
    const trueEndingBadge = document.getElementById('comparisonTrueEndingBadge');
    if (averageValueEl) {
        averageValueEl.textContent = alignmentResult.averageAlignment.toFixed(2);
    }
    if (averageFillEl) {
        averageFillEl.style.width = (alignmentResult.averageAlignment * 100) + '%';
    }
    if (trueEndingBadge) {
        if (alignmentResult.isTrueEnding) {
            trueEndingBadge.style.display = 'inline-block';
        } else {
            trueEndingBadge.style.display = 'none';
        }
    }
}
function navigateComparison(direction) {
    const newIndex = comparisonCurrentIndex + direction;
    if (newIndex < 0 || newIndex >= comparisonScenes.length) return;
    comparisonCurrentIndex = newIndex;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, index) => {
        if (index === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function navigateComparisonTo(index) {
    if (index < 0 || index >= comparisonScenes.length) return;
    comparisonCurrentIndex = index;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, idx) => {
        if (idx === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function updateComparisonNavigation() {
    const prevBtn = document.getElementById('comparisonPrevBtn');
    const nextBtn = document.getElementById('comparisonNextBtn');
    if (prevBtn) {
        prevBtn.disabled = comparisonCurrentIndex === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = comparisonCurrentIndex === comparisonScenes.length - 1;
    }
}
function setupComparisonSwipe() {
    const swiper = document.getElementById('comparisonSwiper');
    if (!swiper) return;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    swiper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    });
    swiper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    });
    swiper.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = startX - currentX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                navigateComparison(1);
            } else {
                navigateComparison(-1);
            }
        }
    });
}
function closeComparisonView() {
    stopComparisonWaveAnimation();
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
        comparisonViewEl.style.display = 'none';
    }
    const alignmentResult = window.archiveAlignmentResult || { averageAlignment: 0, isTrueEnding: false };
    showEndScreen(alignmentResult);
}
function endComparisonSession() {
    stopComparisonWaveAnimation();
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
        comparisonViewEl.style.display = 'none';
    }
    const alignmentResult = window.archiveAlignmentResult || { averageAlignment: 0, isTrueEnding: false };
    showEndScreen(alignmentResult, true);
}
window.navigateComparison = navigateComparison;
window.closeComparisonView = closeComparisonView;
window.endComparisonSession = endComparisonSession;

