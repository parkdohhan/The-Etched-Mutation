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
        'menu.portfolio':  'PORTFOLIO',
        'menu.settings':   'SETTINGS',

        'menu.desc.play':      'Start a play session and traverse memory terrain.',
        'menu.desc.archive':   'Archive list view. Browse every memory and jump into play.',
        'menu.desc.record':    'Document new memories and leave traces of mutation.',
        'menu.desc.profile':   'Manage personal profile and synchronization settings.',
        'menu.desc.portfolio': 'Explore the origin and architect of The Etched Mutation.',

        // ── Archive ───────────────────────────────────────────────
        'archive.title':        'Memory Archive',
        'archive.filter.all':   'All',
        'archive.filter.recent':'Recent',
        'archive.sort.layers':  'By Layers',
        'archive.empty':        'Nothing surfaces here yet.',

        // ── Scene viewer ──────────────────────────────────────────
        'scene.next':           'Next',
        'scene.emotion.prompt': 'What do you feel?',
        'scene.emotion.submit': 'Leave it here',
        'scene.emotion.skip':   'I feel nothing',

        // ── End screen ────────────────────────────────────────────
        'end.title':       'The memory settles.',
        'end.alignment':   'Alignment',
        'end.seal':        'Seal',
        'end.restart':     'Again',
        'end.save':        'Keep this',
        'end.return':      'Return',

        // ── Record ────────────────────────────────────────────────
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
        'notify.emotion.analyzing': 'Reading the residue…',
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
        'settings.close':       'Close',

        // ── NPC / inner voice ─────────────────────────────────────
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
        // Another Me — post-submit
        'anotherme.post.weak':   '…something shifted, but only slightly.',
        'anotherme.post.medium': 'The shape of it changed when you touched it.',
        'anotherme.post.strong': 'This isn\'t the same memory anymore. That\'s not wrong.',
    },

    ko: {
        // ── Opening / Menu ────────────────────────────────────────
        'menu.play':      '체험',
        'menu.archive':   '아카이브',
        'menu.record':    '기록',
        'menu.profile':   '프로필',
        'menu.portfolio': '포트폴리오',
        'menu.settings':  '설정',

        'menu.desc.play':      '플레이 세션을 시작하고 기억의 지형을 탐색한다.',
        'menu.desc.archive':   '아카이브 목록. 모든 기억을 탐색하고 체험을 시작한다.',
        'menu.desc.record':    '새 기억을 기록하고 변이의 흔적을 남긴다.',
        'menu.desc.profile':   '프로필과 동기화 설정을 관리한다.',
        'menu.desc.portfolio': 'The Etched Mutation의 기원과 제작자를 탐색한다.',

        // ── Archive ───────────────────────────────────────────────
        'archive.title':         '기억 아카이브',
        'archive.filter.all':    '전체',
        'archive.filter.recent': '최근',
        'archive.sort.layers':   '레이어순',
        'archive.empty':         '아직 아무것도 떠오르지 않는다.',

        // ── Scene viewer ──────────────────────────────────────────
        'scene.next':           '다음',
        'scene.emotion.prompt': '무엇이 느껴지나요?',
        'scene.emotion.submit': '여기 남기다',
        'scene.emotion.skip':   '아무것도 느끼지 못했다',

        // ── End screen ────────────────────────────────────────────
        'end.title':   '기억이 가라앉는다.',
        'end.alignment': '정렬도',
        'end.seal':    '봉인',
        'end.restart': '다시',
        'end.save':    '남기다',
        'end.return':  '돌아가기',

        // ── Record ────────────────────────────────────────────────
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
        'notify.emotion.analyzing': '잔여를 읽는 중…',
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
        'settings.close':       '닫기',

        // ── NPC / inner voice ─────────────────────────────────────
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
        // 또다른 나 — post-submit
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
