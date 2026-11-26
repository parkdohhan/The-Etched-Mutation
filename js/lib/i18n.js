// js/lib/i18n.js
// TEM i18n — single source of truth for all UI strings.
//
// Rules:
//   - Memory content (scene text, narration, emotion labels) is NOT here.
//     Only UI chrome and system-facing strings belong here.
//   - All notification strings must pass the "Another Me" test:
//     if it sounds like a server talking, it shouldn't exist.
//   - t(key) falls back to English, then returns the key bare.

const STRINGS = {
    en: {
        // ── Opening / Menu ────────────────────────────────────────
        'menu.play':       'PLAY',
        'menu.archive':    'ARCHIVE',
        'menu.record':     'RECORD',
        'menu.profile':    'PROFILE',
        'menu.portfolio':  'MORE PORTFOLIO ↗',
        'menu.settings':   'SETTINGS',

        'menu.desc.play':      'Look for another memory.',
        'menu.desc.archive':   'The people whose memories you have walked.',
        'menu.desc.record':    'A place to set down a memory — make one.',
        'menu.desc.profile':   'Manage personal profile and synchronization settings.',
        'menu.desc.portfolio': 'Explore the origin and architect of The Etched Mutation. (Opens in a new tab)',

        // ── Profile (261123 restyle; markup in index.html #mypageScreen, rows in js/app/auth.js) ──
        'profile.back':        '← back',
        'profile.kicker':      'what stays here',
        'profile.joined':      'first came',
        'profile.memories':    'memories walked',
        'profile.steps':       'steps left',
        'profile.passedOn':    'walks passed on',
        'profile.mine':        'memories I made',
        'profile.notes':       'words received',
        'profile.signout':     'sign out',
        'profile.empty.mine':  'no memory made yet.',
        'profile.empty.notes': 'no words yet.',
        'profile.go.space':    'into the space →',
        'profile.go.terrain':  'into the terrain →',
        'profile.walks':       '{n} walks',
        'profile.private':     'unlisted',
        'profile.untitled':    'untitled',
        'profile.note.from':   'from the memory',
        'profile.note.new':    'new',

        // ── Auth ──────────────────────────────────────────────────
        'auth.signin.helper': 'Signing in lets your traces stay with this memory. You can keep wandering without it.',
        // 261124: sign-in with ID or email, sign-up with ID + email (js/app/auth.js)
        'auth.title.signin':     'Sign in',
        'auth.title.signup':     'Sign up',
        'auth.btn.signin':       'Sign in',
        'auth.btn.signup':       'Sign up',
        'auth.btn.cancel':       'Close',
        'auth.to.signup':        'First time here? Sign up',
        'auth.to.signin':        'Already have an ID? Sign in',
        'auth.ph.idOrEmail':     'ID or email',
        'auth.ph.password':      'Password',
        'auth.ph.id':            'ID (3–20 letters, numbers or _)',
        'auth.ph.email':         'Email',
        'auth.ph.newPassword':   'Password (7+ letters or numbers)',
        'auth.ph.passwordAgain': 'Password again',
        'auth.msg.fillLogin':    'Enter your ID (or email) and password.',
        'auth.msg.loginFail':    'The ID or password does not match.',
        'auth.msg.tooMany':      'Too many tries. Wait 15 minutes and try again.',
        'auth.msg.loginOk':      'Signed in.',
        'auth.msg.fillAll':      'Fill in every field.',
        'auth.msg.badId':        'ID: 3–20 letters, numbers or _.',
        'auth.msg.badEmail':     'The email does not look right.',
        'auth.msg.badPassword':  'Password: 7 or more letters or numbers (no spaces or symbols).',
        'auth.msg.mismatch':     'The two passwords differ.',
        'auth.msg.idTaken':      'That ID is taken.',
        'auth.msg.emailTaken':   'That email already has an account. Sign in instead.',
        'auth.msg.signupFail':   'Sign-up did not go through. Try again in a moment.',
        'auth.msg.signupOk':     'Welcome.',
        'auth.msg.signupCheck':  'Signed up. Please sign in.',
        'auth.msg.noClient':     'Cannot reach the server right now.',

        // ── Archive ───────────────────────────────────────────────
        'archive.title':        'Memory Archive',
        'archive.filter.all':   'All',
        'archive.filter.english':'English',
        'archive.filter.korean':'Korean',
        'archive.filter.recent':'Recent',
        'archive.subtitle':     'The self as terrain, etched by others.',
        'archive.enterNotice':  'My memory is no longer mine. Interpretation covers it like strata.',
        'archive.sort.layers':  'By Layers',
        'archive.empty':        'Nothing surfaces here yet.',
        'archive.searchPlaceholder': 'Search by title',

        // ── Scene viewer ──────────────────────────────────────────
        'scene.next':           'Next',
        'scene.emotion.prompt': 'What do you feel?',
        'scene.emotion.submit': 'Leave it here',
        'scene.emotion.skip':   'I feel nothing',
        'scene.emotion.why':    'Why did you do that?',
        'scene.emotion.now':    'What are you feeling right now?',

        // ── End screen ────────────────────────────────────────────
        'end.title':       'The memory settles.',
        'end.alignment':   'Alignment',
        'end.seal':        'Seal',
        'end.restart':     'Again',
        'end.save':        'Keep this',
        'end.return':      'Return',

        // ── Record / Door screen ──────────────────────────────────
        'record.door.subtitle':  'Will you open the door to a day you carry?',
        'record.door.desc':      'This is where you record your memory',
        'record.door.hint':      '— click to enter —',
        'record.start':       'Begin',
        'record.placeholder': 'Tell me.',
        'record.send':        'Send',

        // ── Auth ──────────────────────────────────────────────────
        'auth.login':    'Enter',
        'auth.signup':   'First time',
        'auth.logout':   'Leave',
        'auth.email':    'Email',
        'auth.password': 'Password',
        'auth.username': 'Name',

        // ── Notifications — Another Me voice, never system ────────
        'notify.saved':             'Etched.',
        'notify.error':             '…something slipped.',
        'notify.error.load':        'The memory won\'t surface.',
        'notify.error.network':     '…the connection frayed.',
        'notify.error.save':        'It wouldn\'t hold.',
        'notify.connecting':        '…surfacing.',
        'notify.session.start':     'The memory opens.',
        'notify.session.end':       'The memory closes.',
        'notify.copied':            'Held.',
        'notify.scene.generating':  'Another Me is listening…',
        'notify.scene.error':       'The scene won\'t come through.',
        'notify.scene.text.error':  'The text won\'t surface.',
        'notify.render.error':      'Something in the memory broke.',
        'notify.scene.data.error':  'Scene data is missing.',

        // ── Settings ──────────────────────────────────────────────
        'settings.title':       'Settings',
        'settings.language':    'Language',
        'settings.language.en': 'English',
        'settings.language.ko': '한국어',
        'settings.brightness':  'Brightness',
        'settings.volume':      'Volume',
        'settings.close':       'Close',

        // ── NPC / inner voice ─────────────────────────────────────
        'npc.label':    'the memory whispers',
        'npc.waiting':  'Waiting for the next one to surface…',
        'npc.sealed':   'Sealed.',
        'npc.fallback': 'A fragment pulls from somewhere.',

        // ── Contamination monologues ──────────────────────────────
        // biased_inclination × emotion × band
        'monologue.biased.anger.weak':      '…was it this hot?',
        'monologue.biased.anger.medium':    'Was I shaking this much back then. I\'m not sure.',
        'monologue.biased.anger.strong':    'I thought I was angry, but this feels like something else.',
        'monologue.biased.sadness.weak':    '…maybe it was heavier.',
        'monologue.biased.sadness.medium':  'Did I cry? I don\'t think so.',
        'monologue.biased.sadness.strong':  'I don\'t know if this weight was always here.',
        'monologue.biased.excitement.weak':   '…was it this bright?',
        'monologue.biased.excitement.medium': 'Was I smiling then? The memory keeps sliding.',
        'monologue.biased.excitement.strong': 'This feels like too much. It wasn\'t this much.',
        'monologue.biased.calm.weak':       '…too quiet.',
        'monologue.biased.calm.medium':     'I don\'t think it was this still.',
        'monologue.biased.calm.strong':     'Something was underneath this silence. I can\'t hear it now.',
        'monologue.biased.neutral.weak':    '…something.',
        'monologue.biased.neutral.medium':  'Something\'s different. I can\'t tell what.',
        'monologue.biased.neutral.strong':  'This doesn\'t feel like the time I knew.',
        // hypercompletion
        'monologue.hyper.weak':   '…strangely clear.',
        'monologue.hyper.medium': 'This can\'t be this sharp.',
        'monologue.hyper.strong': 'I remember it perfectly. That\'s what\'s wrong.',
        // void
        'monologue.void.weak':   '…here.',
        'monologue.void.medium': 'There was something here.',
        'monologue.void.strong': 'Something was definitely here. I just can\'t reach it.',
        // ── Another Me ────────────────────────────────────────────
        'anotherme.label':       'Another Me',
        'anotherme.intro':       'Tell me your memory. Slowly, in your own way.',
        'anotherme.post.weak':   '…something shifted, but only slightly.',
        'anotherme.post.medium': 'The shape of it changed when you touched it.',
        'anotherme.post.strong': 'This isn\'t the same memory anymore. That\'s not wrong.',
    },

    ko: {
        // ── Opening / Menu ────────────────────────────────────────
        // 261124 작가: 메뉴 이름은 풀어 쓰지 않고 영어 이름을 한글로 ("나의 기억" 말고 "아카이브")
        'menu.play':      '플레이',
        'menu.archive':   '아카이브',
        'menu.record':    '레코드',
        'menu.profile':   '프로필',
        'menu.portfolio': '포트폴리오 ↗',
        'menu.settings':  '세팅',

        'menu.desc.play':      '다른 기억을 찾아서 — 새 결을 만난다.',
        'menu.desc.archive':   '걸어 본 기억의 주인들.',
        'menu.desc.record':    '한 기억을 놓아 두는 자리 — 기억 만들기.',
        'menu.desc.profile':   '프로필과 동기화 설정을 관리한다.',
        'menu.desc.portfolio': 'The Etched Mutation의 기원과 제작자를 탐색한다. (새 탭으로 열림)',

        // ── Profile (261123 재단장) ──
        'profile.back':        '← 돌아가기',
        'profile.kicker':      '이 자리에 남은 것',
        'profile.joined':      '처음 온 날',
        'profile.memories':    '걸은 기억',
        'profile.steps':       '남긴 걸음',
        'profile.passedOn':    '건네진 걸음',
        'profile.mine':        '내가 만든 기억',
        'profile.notes':       '받은 말',
        'profile.signout':     '나가기',
        'profile.empty.mine':  '아직 만든 기억이 없다.',
        'profile.empty.notes': '아직 받은 말이 없다.',
        'profile.go.space':    '우주로 →',
        'profile.go.terrain':  '지형으로 →',
        'profile.walks':       '걸음 {n}',
        'profile.private':     '비공개',
        'profile.untitled':    '제목 없음',
        'profile.note.from':   '어느 기억에서',
        'profile.note.new':    '새',

        // ── Auth ──────────────────────────────────────────────────
        'auth.signin.helper': '당신의 흔적을 이 기억에 잇기 위해서야. 로그인 안 해도 작품은 둘러볼 수 있어.',
        // 261124: 아이디 또는 이메일로 들어가기, 아이디 + 이메일로 가입 (js/app/auth.js)
        'auth.title.signin':     '들어가기',
        'auth.title.signup':     '처음 왔어',
        'auth.btn.signin':       '들어가기',
        'auth.btn.signup':       '가입하기',
        'auth.btn.cancel':       '닫기',
        'auth.to.signup':        '처음이야? 가입하기',
        'auth.to.signin':        '아이디가 있어? 들어가기',
        'auth.ph.idOrEmail':     '아이디 또는 이메일',
        'auth.ph.password':      '비밀번호',
        'auth.ph.id':            '아이디 (영어·숫자·_ 3~20자)',
        'auth.ph.email':         '이메일',
        'auth.ph.newPassword':   '비밀번호 (영어·숫자 7자 이상)',
        'auth.ph.passwordAgain': '비밀번호 한 번 더',
        'auth.msg.fillLogin':    '아이디(또는 이메일)와 비밀번호를 넣어 줘.',
        'auth.msg.loginFail':    '아이디나 비밀번호가 맞지 않아.',
        'auth.msg.tooMany':      '너무 여러 번 틀렸어. 15분 뒤에 다시 해 줘.',
        'auth.msg.loginOk':      '들어왔어.',
        'auth.msg.fillAll':      '빈칸을 다 채워 줘.',
        'auth.msg.badId':        '아이디는 영어·숫자·_ 로 3~20자.',
        'auth.msg.badEmail':     '이메일 모양이 아니야.',
        'auth.msg.badPassword':  '비밀번호는 영어·숫자로 7자 이상 (띄어쓰기·기호 없이).',
        'auth.msg.mismatch':     '두 비밀번호가 달라.',
        'auth.msg.idTaken':      '이미 있는 아이디야.',
        'auth.msg.emailTaken':   '이미 가입된 이메일이야. 들어가기로 해 줘.',
        'auth.msg.signupFail':   '가입이 안 됐어. 잠시 뒤에 다시.',
        'auth.msg.signupOk':     '어서 와.',
        'auth.msg.signupCheck':  '가입됐어. 들어가기를 해 줘.',
        'auth.msg.noClient':     '지금은 서버에 닿지 않아.',

        // ── Archive ───────────────────────────────────────────────
        'archive.title':         '기억 아카이브',
        'archive.filter.all':    '전체',
        'archive.filter.english':'영어',
        'archive.filter.korean': '한국어',
        'archive.filter.recent': '최근',
        'archive.subtitle':      '타자의 잔상으로 빚어진 자기의 지형',
        'archive.enterNotice':   '내 기억은 이제 내 것이 아니야. 해석이 지층처럼 덮여 있어.',
        'archive.sort.layers':   '레이어순',
        'archive.empty':         '아직 아무것도 떠오르지 않는다.',
        'archive.searchPlaceholder': '제목으로 검색',

        // ── Scene viewer ──────────────────────────────────────────
        'scene.next':           '다음',
        'scene.emotion.prompt': '무엇이 느껴지나요?',
        'scene.emotion.submit': '여기 남기다',
        'scene.emotion.skip':   '아무것도 느끼지 못했다',
        'scene.emotion.why':    '왜 그렇게 했어?',
        'scene.emotion.now':    '지금 어떤 감정이 들어?',

        // ── End screen ────────────────────────────────────────────
        'end.title':   '기억이 가라앉는다.',
        'end.alignment': '정렬도',
        'end.seal':    '봉인',
        'end.restart': '다시',
        'end.save':    '남기다',
        'end.return':  '돌아가기',

        // ── Record / Door screen ──────────────────────────────────
        'record.door.subtitle': '기억하고 싶은 하루의 문을 열겠습니까?',
        'record.door.desc':     '당신의 기억을 기록하는 공간입니다',
        'record.door.hint':     '— 클릭하여 입장 —',
        'record.start':       '시작',
        'record.placeholder': '말해줘.',
        'record.send':        '전송',

        // ── Auth ──────────────────────────────────────────────────
        'auth.login':    '들어가기',
        'auth.signup':   '처음이야',
        'auth.logout':   '나가기',
        'auth.email':    '이메일',
        'auth.password': '비밀번호',
        'auth.username': '이름',

        // ── Notifications ─────────────────────────────────────────
        'notify.saved':             '새겨졌다.',
        'notify.error':             '…뭔가 빠졌다.',
        'notify.error.load':        '기억이 떠오르지 않는다.',
        'notify.error.network':     '…연결이 흐려졌다.',
        'notify.error.save':        '붙잡히지 않았다.',
        'notify.connecting':        '…떠오르는 중.',
        'notify.session.start':     '기억이 열린다.',
        'notify.session.end':       '기억이 닫힌다.',
        'notify.copied':            '남았다.',
        'notify.scene.generating':  '또 다른 내가 듣고 있어…',
        'notify.scene.error':       '장면이 닿지 않는다.',
        'notify.scene.text.error':  '텍스트가 떠오르지 않는다.',
        'notify.render.error':      '기억 안에서 뭔가 끊겼다.',
        'notify.scene.data.error':  '장면 데이터가 없다.',

        // ── Settings ──────────────────────────────────────────────
        'settings.title':       '설정',
        'settings.language':    '언어',
        'settings.language.en': 'English',
        'settings.language.ko': '한국어',
        'settings.brightness':  '밝기',
        'settings.volume':      '소리',
        'settings.close':       '닫기',

        // ── NPC / inner voice ─────────────────────────────────────
        'npc.label':    '기억이 속삭인다',
        'npc.waiting':  '다음 기억이 떠오르길 기다리는 중…',
        'npc.sealed':   '봉인되었다.',
        'npc.fallback': '어딘가에서 파편이 끌려온다.',

        // ── Contamination monologues ──────────────────────────────
        'monologue.biased.anger.weak':      '…이게 이렇게 뜨거웠었나.',
        'monologue.biased.anger.medium':    '그때 나 이만큼 떨렸었나. 잘 모르겠다.',
        'monologue.biased.anger.strong':    '화가 났었다고 생각했는데, 이건 좀 다른 것 같기도.',
        'monologue.biased.sadness.weak':    '…좀 더 무거웠던 것 같기도 하고.',
        'monologue.biased.sadness.medium':  '울었었나. 아닌 것 같은데.',
        'monologue.biased.sadness.strong':  '이 무게가 원래 여기 있었는지 모르겠어.',
        'monologue.biased.excitement.weak':   '…이렇게 밝았었나.',
        'monologue.biased.excitement.medium': '이때 웃었었나? 기억이 자꾸 미끄러진다.',
        'monologue.biased.excitement.strong': '이건 좀 과한 것 같아. 이만큼은 아니었어.',
        'monologue.biased.calm.weak':       '…너무 조용하다.',
        'monologue.biased.calm.medium':     '이렇게 담담하진 않았던 것 같은데.',
        'monologue.biased.calm.strong':     '이 고요함 밑에 뭔가 있었는데. 지금은 안 들려.',
        'monologue.biased.neutral.weak':    '…뭔가.',
        'monologue.biased.neutral.medium':  '뭔가 달라. 근데 뭔지 모르겠어.',
        'monologue.biased.neutral.strong':  '이건 내가 아는 그때가 아닌 것 같은데.',
        'monologue.hyper.weak':   '…이상하게 또렷하다.',
        'monologue.hyper.medium': '이렇게 선명할 리가 없는데.',
        'monologue.hyper.strong': '너무 잘 기억나. 그래서 이상해.',
        'monologue.void.weak':    '…여기.',
        'monologue.void.medium':  '여기에 뭔가 있었는데.',
        'monologue.void.strong':  '분명히 있었는데. 그게 뭐였는지만 안 떠올라.',
        // ── 또다른 나 ────────────────────────────────────────────
        'anotherme.label':       '또다른 나',
        'anotherme.intro':       '기억을 이야기해줘. 천천히, 편하게.',
        'anotherme.post.weak':   '…뭔가 조금 달라졌어.',
        'anotherme.post.medium': '네가 만지니까 모양이 바뀌었어.',
        'anotherme.post.strong': '이건 이제 같은 기억이 아니야. 그게 틀린 건 아니야.',
    },
};

// ─── Language state ───────────────────────────────────────────────

const STORAGE_KEY = 'tem_language';
const SUPPORTED = ['en', 'ko'];

function _detectDefault() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) {}
    return 'en';
}

let _current = _detectDefault();

// ─── Public API ───────────────────────────────────────────────────

export function getCurrentLanguage() {
    return _current;
}

export function setLanguage(lang) {
    if (!SUPPORTED.includes(lang)) return;
    _current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    refreshUI();
}

/**
 * Translate a key. Falls back: currentLang → 'en' → bare key.
 */
export function t(key) {
    return STRINGS[_current]?.[key] ?? STRINGS['en']?.[key] ?? key;
}

/**
 * Update all DOM nodes marked with data-i18n="key".
 * Also dispatches 'tem:languagechange' for modules that need to re-render.
 */
export function refreshUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const text = t(key);
        if (el.placeholder !== undefined && el.tagName === 'INPUT') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });
    document.dispatchEvent(new CustomEvent('tem:languagechange', { detail: { lang: _current } }));
}

// ─── Brightness ───────────────────────────────────────────────────

const BRIGHTNESS_KEY = 'tem_brightness';

export function getBrightness() {
    try {
        const v = parseFloat(localStorage.getItem(BRIGHTNESS_KEY));
        return isNaN(v) ? 1.0 : Math.max(0.5, Math.min(1.5, v));
    } catch (_) { return 1.0; }
}

export function setBrightness(value) {
    const v = Math.max(0.5, Math.min(1.5, parseFloat(value) || 1.0));
    document.documentElement.style.filter = v === 1.0 ? '' : `brightness(${v})`;
    try { localStorage.setItem(BRIGHTNESS_KEY, String(v)); } catch (_) {}
}

export function initI18n() {
    setBrightness(getBrightness());
    refreshUI();
}
