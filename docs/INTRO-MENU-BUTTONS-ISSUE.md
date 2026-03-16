# 메인 화면(인트로) 버튼 미동작 문제 — 상황 정리

## 0. 사용자 진단 요약 (실제 코드와 불일치 가능성)

- **진단 문서에는** `initIntroMenu()`, `renderIntroMenu()`, `INTRO_MENU_ITEMS`, `dispatchIntroMenuAction`이 `js/index.js`에 있다고 되어 있으나, **실제 사용 중인 코드베이스에는 이 블록이 없을 수 있음** (다른 브랜치, 빌드 결과, 미반영 버전 등).
- **.intro-menu-item이 5개 존재**한다면 메뉴 DOM은 다음 중 하나로 만들어졌을 수 있음:
  - **다른 JS 파일**에서 `#introMenuList`를 채우거나 `.intro-menu-item`을 생성하는 코드
  - **HTML에** 메뉴 5개가 정적으로 작성되어 있는 경우 (현재 `index.html`에는 `#introMenuList`만 있고 내부는 비어 있음)
- **`window.enterArchive = enterArchive`**가 모듈 최상위에 있는데, **`typeof window.enterArchive === 'undefined'`**라면 **모듈 평가가 그 할당 줄까지 도달하지 못한 것**일 수 있음. 즉:
  - 그 줄 **이전**에서 예외가 나서 스크립트 실행이 중단되었거나
  - 해당 할당이 있는 **블록이 실제로 실행되지 않는** 경로일 수 있음.
- 따라서 아래 “관련 코드”는 **이 리포지터리 기준**이며, 실제 환경에서는 **위치·존재 여부를 반드시 다시 확인**해야 함.

---

## 1. 문제 현상

- **증상**: 메인 화면(인트로)에서 **어떤 메뉴 버튼을 눌러도 진입이 되지 않음** (ARCHIVE, RECORD, PROFILE, ABOUT, 하위 메뉴 등 전부 동작하지 않음).
- **기대**: 메뉴 클릭 시 각각 ARCHIVE 화면, RECORD(Confession Hub), PROFILE(Mypage), ABOUT/하위(포트폴리오·about·concept) 등으로 이동해야 함.

---

## 2. 관련 코드 위치 및 흐름

### 2.1 화면 구조 (index.html)

인트로 화면은 `#introScreen` 하나로 이루어져 있고, 그 안에 **사이드바 메뉴**가 `#introMenuList`에 동적으로 채워짐.

```html
<!-- index.html (26~72행 부근) -->
<div class="intro-screen" id="introScreen">
    <div class="intro-container">
        <div class="intro-bg-image" aria-hidden="true"></div>
        <div class="intro-left-gradient" aria-hidden="true"></div>
        <div class="intro-grid-lines" aria-hidden="true">...</div>
        <div class="intro-content">
            <div class="intro-sidebar">
                <div class="intro-header">...</div>
                <div class="intro-menu-list" id="introMenuList"></div>
                <div class="intro-description" id="introDescriptionArea"></div>
            </div>
            <div class="intro-right-content">...</div>
        </div>
        <div class="intro-bokeh-flare" id="introBokehFlare" aria-hidden="true">...</div>
    </div>
    <div class="intro-center-wrapper">
        <div class="npc-intro-dialogue" id="npcIntroDialogue"></div>
    </div>
</div>
```

- `#introMenuList`는 **비어 있는 상태**로 두고, JS에서 `INTRO_MENU_ITEMS` 기준으로 메뉴 DOM을 만들어 넣음.
- 버튼 동작은 전부 **JS에서 붙인 클릭 리스너**에 의존함.

---

### 2.2 앱 초기화 및 메뉴 렌더 시점 (js/index.js)

- 진입점: **DOMContentLoaded** 시 `initApp()` 한 번 실행.
- 그 안에서 `bindEvents()` 다음에 **`initIntroMenu()`** 호출 → 이때 `#introMenuList`에 메뉴가 그려지고, 각 항목에 `click` 리스너가 붙음.

```javascript
// js/index.js (235~247행 부근)
    bindEvents({
        store: appStore,
        engine: byeoriEngine,
        ui: uiManager,
        // ...
    });
    initIntroMenu();   // ← 여기서 메뉴 DOM 생성 + 클릭 리스너 부착
    if (fromDemo) {
        // ...
    }
}
```

- 스크립트는 **type="module"** 로 로드되며, `window.*` 전역 노출은 **같은 index.js 하단**(약 3273~3318행, 그리고 `showConfessionHub`는 5828행 부근)에서 이뤄짐.
- 따라서 “메뉴는 그려지는데, 클릭 시 호출되는 `window.enterArchive` 등이 아직 없어서” 실패할 가능성은 낮고, **클릭 자체가 메뉴에 전달되지 않거나**, **initIntroMenu 실행 자체가 스킵되는지**를 의심할 수 있음.

---

### 2.3 메뉴 정의 및 액션 디스패치 (js/index.js)

- 메뉴 항목 정의:

```javascript
// js/index.js (2980~2992행 부근)
const INTRO_MENU_ITEMS = [
    { id: 'archive', label: 'ARCHIVE', subLabel: '...', description: '...' },
    { id: 'record', label: 'RECORD', description: '...' },
    { id: 'profile', label: 'PROFILE', description: '...' },
    { id: 'settings', label: 'SETTINGS', description: '...' },
    { id: 'about', label: 'ABOUT', description: '...', children: [
        { id: 'credits', label: 'CREDITS' },
        { id: 'concept', label: 'CONCEPT' },
        { id: 'more-portfolio', label: 'MORE PORTFOLIO' }
    ] }
];
```

- 클릭 시 **`dispatchIntroMenuAction(id)`** 가 호출되고, 여기서 `window`에 붙어 있는 함수들을 호출:

```javascript
// js/index.js (3029~3042행 부근)
function dispatchIntroMenuAction(id) {
    switch (id) {
        case 'archive': if (typeof window.enterArchive === 'function') window.enterArchive(); break;
        case 'record': if (typeof window.showConfessionHub === 'function') window.showConfessionHub(); break;
        case 'profile': if (typeof window.openMypage === 'function') window.openMypage(); break;
        case 'settings': if (typeof window.showNotification === 'function') window.showNotification('Coming soon'); break;
        case 'about': if (typeof window.openAbout === 'function') window.openAbout(); break;
        case 'credits': if (typeof window.showNotification === 'function') window.showNotification('Coming soon'); break;
        case 'concept': if (typeof window.openConcept === 'function') window.openConcept(); break;
        case 'more-portfolio': if (typeof window.openPortfolio === 'function') window.openPortfolio(); break;
        default: if (typeof window.showNotification === 'function') window.showNotification('Coming soon');
    }
}
```

- 즉, **“어떤 것도 안 된다”**면 다음 중 하나일 가능성이 큼:
  1. 메뉴 항목에 **클릭 이벤트가 도달하지 않음** (다른 레이어가 가리거나, 리스너가 안 붙음).
  2. **`initIntroMenu()`가 실행되지 않음** (그 전에 에러로 initApp 중단).
  3. **인트로가 “메인 화면”으로 보이지 않는 상태**에서 클릭하고 있음 (예: 아직 오프닝 화면이 위에 있음).

---

### 2.4 메뉴 렌더링 및 클릭 리스너 부착 (js/index.js)

- `renderIntroMenu()`에서 `#introMenuList`를 비운 뒤, `INTRO_MENU_ITEMS`마다 `div.intro-menu-item` 등을 만들고, **각 메뉴 아이템에 `click` 리스너를 직접 부착**:

```javascript
// js/index.js (3057~3126행 부근)
function renderIntroMenu() {
    const menuList = document.getElementById('introMenuList');
    if (!menuList) return;
    // ...
    menuList.innerHTML = '';

    INTRO_MENU_ITEMS.forEach(item => {
        // ...
        const menuItem = document.createElement('div');
        menuItem.className = `intro-menu-item ${isDecorated ? 'active' : 'inactive'}`;
        menuItem.dataset.introMenuId = item.id;
        // ...
        menuItem.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.id;
            introMenuActiveId = targetId;
            dispatchIntroMenuAction(targetId);
            renderIntroMenu();
            renderIntroDescriptions();
            updateIntroBokehFlare();
        });
        // ...
        if (item.children) {
            // 하위 메뉴도 각 subItem에 click 리스너 부착, 내부에서 dispatchIntroMenuAction(child.id) 호출
        }
        menuList.appendChild(itemWrapper);
    });
}
```

- **`#introMenuList`가 null이면** 메뉴가 전혀 그려지지 않고, 클릭할 요소가 없음.
- **`initIntroMenu()`가 한 번도 호출되지 않으면** 위 코드가 실행되지 않으므로, 역시 버튼이 없거나 동작하지 않음.

---

### 2.5 오프닝 → 인트로 전환

- 사용자가 “메인 화면”에서 클릭한다고 할 때, 실제로 보이는 게 **오프닝**인지 **인트로**인지에 따라 다름.
- 오프닝 화면은 **z-index: 3000**, 인트로는 **z-index: 2000**으로 설정됨. 그래서 **오프닝이 떠 있는 동안에는 인트로 메뉴를 눌러도 이벤트가 오프닝으로 갈 수 있음**.

```javascript
// js/app/bindEvents.js (77~80행) — 오프닝 표시
const openingScreen = document.getElementById('openingScreen');
if (openingScreen) {
    openingScreen.style.cssText = 'display:flex !important;...;z-index:3000 !important';
}
```

- 오프닝 클릭 시 `skipToIntro()` → `skipOpening()` → `finishOpeningSequence()` 에서 인트로를 보이게 함:

```javascript
// js/index.js (2944~2946행 부근)
function skipOpening() { /* ... */ finishOpeningSequence() }
function finishOpeningSequence() {
    const openingScreen = document.getElementById('openingScreen');
    const introScreen = document.getElementById('introScreen');
    if (openingScreen) { /* 숨김, pointer-events 제거 */ }
    if (introScreen) {
        introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important';
        introScreen.classList.add('visible');
        introScreen.classList.remove('hidden');
    }
    playNpcIntro();
}
```

- 즉, **오프닝을 건너뛴 뒤에야** 인트로가 “메인 화면”으로 활성화됨. 사용자가 오프닝에서 “아무 버튼이나 눌렀는데 진입이 안 된다”고 느낄 수 있음.

---

### 2.6 인트로 / 오프닝 CSS (css/index.css)

- 인트로가 **숨겨진 상태**일 때는 클릭을 받지 않도록 되어 있음:

```css
/* css/index.css (156~161행) */
.intro-screen.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  display: none;
}
```

- 인트로가 **보일 때**:

```css
/* css/index.css (163~168행) */
.intro-screen.visible {
  opacity: 1;
  visibility: visible;
  display: flex;
  pointer-events: auto;
}
```

- 레이아웃 구조:
  - `.intro-screen .intro-container` → `z-index: 2`, `pointer-events: auto`
  - `.intro-screen .intro-content` → `z-index: 20`, `pointer-events: auto` (사이드바 포함)
  - `.intro-screen .intro-center-wrapper` → `position: absolute; inset: 0`, `z-index: 1`, **`pointer-events: none`**
  - `.intro-screen .intro-center-wrapper .npc-intro-dialogue` → **`pointer-events: auto`** (대사만 클릭 가능)

즉, **중앙 wrapper는 클릭을 막지 않고**, 사이드바(`.intro-content`)가 더 위(z-index 20)에 있어서 메뉴가 클릭을 받아야 정상임.  
다만 **다른 스타일이나 동적 요소**가 나중에 인트로 위에 덮어서 `pointer-events`를 가로막을 가능성은 있음.

---

### 2.7 전역 함수 노출 (js/index.js)

- 메뉴에서 호출하는 함수들은 **같은 파일 하단**에서 `window`에 붙음:

```javascript
// js/index.js (3273~3318행 부근)
window.openPortfolio = openPortfolio;
window.openAbout = openAbout;
window.openConcept = openConcept;
window.openMypage = openMypage;
window.showModeSelection = showModeSelection;
window.enterArchive = enterArchive;
// ...
window.showConfessionHub = showConfessionHub;  // 5828행 부근
```

- 모듈이 한 번에 평가되므로, **DOMContentLoaded 시점에는 이미** 위 할당이 끝나 있음. 따라서 “전역이 안 붙어서” 동작이 안 되는 경우는 가능성이 낮음.

---

## 3. 가능한 원인 정리

| 가능성 | 설명 |
|--------|------|
| **1. 오프닝이 위에 있음** | 사용자가 “메인 화면”이라고 생각한 게 오프닝일 수 있음. 오프닝에서는 메뉴가 없고, 인트로 메뉴는 가려져 있어서 클릭이 인트로까지 도달하지 않음. |
| **2. initIntroMenu() 미실행** | `initApp()` 실행 중 `bindEvents()` 또는 그 이전에서 예외가 나면 `initIntroMenu()`가 호출되지 않아, `#introMenuList`가 비어 있음. |
| **3. #introMenuList가 없음** | HTML 구조가 다르거나, 다른 템플릿/빌드 결과를 보고 있는 경우 `getElementById('introMenuList')`가 null일 수 있음. |
| **4. 인트로가 hidden 상태** | 인트로에 `.hidden`이 붙어 있고 `pointer-events: none`인 상태에서, 사용자가 다른 요소(예: npc 대사)를 클릭했다고 생각할 수 있음. |
| **5. 다른 레이어가 클릭 선점** | 인트로 위에 다른 고정/절대 위치 요소가 덮여 있고, 해당 요소가 `pointer-events: auto`로 클릭을 받아버리는 경우. |
| **6. 이벤트 리스너/기타 스크립트** | 다른 스크립트에서 document/body에 걸린 클릭 리스너가 `stopPropagation()` 또는 `preventDefault()`로 메뉴까지 전달을 막는 경우. |
| **7. 모듈 평가가 window 할당 전에 중단** | `typeof window.enterArchive === 'undefined'`인 경우, 모듈 최상위에서 **그 할당 줄 이전**에 예외가 나서 실행이 멈췄을 수 있음. `window.enterArchive` 등은 약 3274~3318행, `window.showConfessionHub`는 원래 5830행 근처에만 있어서, 3279~5830 사이에서 에러가 나면 `showConfessionHub`만 undefined가 됨. |

---

## 4. 디버깅 제안

- 아래를 **임시로** 추가해 보면 원인 좁히는 데 도움이 됨.

**1) initIntroMenu 실행 여부**

- `initIntroMenu()` 함수 맨 위에:
  - `console.log('[initIntroMenu] running', document.getElementById('introMenuList') ? 'introMenuList found' : 'introMenuList MISSING');`

**2) 메뉴 클릭 도달 여부**

- `renderIntroMenu()` 안의 `menuItem.addEventListener('click', ...)` 콜백 **맨 앞**에:
  - `console.log('[intro menu click]', item.id);`
- 클릭 시 콘솔에 로그가 찍히면 → 클릭은 도달하는 것이고, `dispatchIntroMenuAction` 또는 `window.*` 호출 쪽을 보면 됨.
- 로그가 안 찍히면 → 클릭이 메뉴 요소까지 오지 않는 것 (레이어/포커스/다른 리스너 문제).

**3) 인트로 표시 상태**

- 인트로가 보일 때 개발자 도구에서 `#introScreen` 요소의 class, `computed style`에서 `display`, `visibility`, `pointer-events`, `z-index` 확인.
- `.hidden`이 있으면 인트로는 “꺼진” 상태임.

**4) window 할당 도달 여부**

- 콘솔에서 `typeof window.enterArchive`, `typeof window.showConfessionHub` 확인.
- `'undefined'`이면 모듈이 해당 `window.xxx = ...` 줄까지 실행되지 않은 것. 스크립트 상단부터 그 줄 직전까지 **동기 실행되는 코드** 중 예외 원인 찾기 (예: `(async function () { await checkSession() })();` 등).

**5) 오프닝 건너뛰기**

- 테스트 시 `sessionStorage.setItem('skipOpening', '1')` 후 새로고침하면, `initApp`에서 `fromDemo = true`로 오프닝 없이 인트로만 보이게 할 수 있음 (이때 메뉴가 보이고 클릭 가능한지 확인).

---

## 5. 관련 파일 목록

- `index.html` — 인트로/오프닝 마크업, `#introMenuList` 위치
- `js/index.js` — `initApp`, `initIntroMenu`, `renderIntroMenu`, `dispatchIntroMenuAction`, `INTRO_MENU_ITEMS`, 오프닝/인트로 전환, `window.*` 노출
- `js/app/bindEvents.js` — 오프닝 표시/클릭, `skipToIntro` 연결
- `css/index.css` — `.intro-screen`, `.intro-screen.hidden`, `.intro-screen.visible`, `.intro-content`, `.intro-center-wrapper`, `.intro-menu-list`, `.intro-menu-item` 등

---

## 6. 관련 코드 참조 (파일·행)

| 파일 | 행 범위 | 내용 |
|------|---------|------|
| `js/index.js` | 123~258 | `initApp()`, `initIntroMenu()` 호출, 오프닝 스킵 시 인트로 표시 |
| `js/index.js` | 259~281 | `openPortfolio`, `openAbout`, `openConcept`, `openMypage` |
| `js/index.js` | 303~310 | `enterArchive`, `backToIntro` 등 |
| `js/index.js` | 2971~3042 | `INTRO_MENU_ITEMS`, `dispatchIntroMenuAction` |
| `js/index.js` | 3057~3146 | `renderIntroMenu`, `initIntroMenu` |
| `js/index.js` | 2942~2946 | `skipOpening`, `finishOpeningSequence` |
| `js/index.js` | 3273~3318 | `window.enterArchive` 등 전역 노출 |
| `js/index.js` | 5358~5380 | `showConfessionHub` |
| `js/index.js` | 5828 | `window.showConfessionHub = showConfessionHub` |
| `js/index.js` | 5954~5959 | `DOMContentLoaded` → `initApp()` |
| `js/app/bindEvents.js` | 60~141 | `bindOpeningEvents`, 오프닝 클릭 시 `skipToIntro` |
| `index.html` | 16~72 | `openingScreen`, `introScreen`, `#introMenuList` |
| `css/index.css` | 141~168 | `.intro-screen`, `.intro-screen.hidden`, `.intro-screen.visible` |
| `css/index.css` | 547~645 | `.intro-container`, `.intro-content`, `.intro-sidebar`, `.intro-menu-list` |

---

## 7. 요약

- 메인 화면 버튼이 **전부** 동작하지 않는 상황은, **메뉴 클릭 이벤트가 메뉴 요소까지 도달하지 않거나**, **메뉴 DOM이 아예 그려지지 않았을 가능성**이 큼.
- 위 디버깅으로 “클릭은 오는지 / initIntroMenu는 실행되는지 / 인트로가 실제로 활성화된 화면인지”를 나눠 보면, 원인을 특정하는 데 도움이 됨.

---

## 부록: initIntroMenu / renderIntroMenu 전체 (복사용)

**initIntroMenu (js/index.js 3138~3146):**

```javascript
function initIntroMenu() {
    const menuList = document.getElementById('introMenuList');
    if (!menuList) return;
    renderIntroMenu();
    renderIntroDescriptions();
    updateIntroBokehFlare();
    window.addEventListener('resize', updateIntroBokehFlare);
}
```

**renderIntroMenu 클릭 리스너 부분 (js/index.js 3109~3116):**

```javascript
menuItem.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = item.id;
    introMenuActiveId = targetId;
    dispatchIntroMenuAction(targetId);
    renderIntroMenu();
    renderIntroDescriptions();
    updateIntroBokehFlare();
});
```

**dispatchIntroMenuAction 전체 (js/index.js 3029~3042):**

```javascript
function dispatchIntroMenuAction(id) {
    switch (id) {
        case 'archive': if (typeof window.enterArchive === 'function') window.enterArchive(); break;
        case 'record': if (typeof window.showConfessionHub === 'function') window.showConfessionHub(); break;
        case 'profile': if (typeof window.openMypage === 'function') window.openMypage(); break;
        case 'settings': if (typeof window.showNotification === 'function') window.showNotification('Coming soon'); break;
        case 'about': if (typeof window.openAbout === 'function') window.openAbout(); break;
        case 'credits': if (typeof window.showNotification === 'function') window.showNotification('Coming soon'); break;
        case 'concept': if (typeof window.openConcept === 'function') window.openConcept(); break;
        case 'more-portfolio': if (typeof window.openPortfolio === 'function') window.openPortfolio(); break;
        default: if (typeof window.showNotification === 'function') window.showNotification('Coming soon');
    }
}
```
