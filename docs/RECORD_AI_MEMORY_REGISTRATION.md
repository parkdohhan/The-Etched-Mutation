# Record 모드 — “AI와 대화하며 쌓고 장면화” 코드 위치

## 결론: 전용 파일 없음

- `js/` 아래 **`record*.js`**, **`registration*.js`** 같은 이름의 파일은 **없습니다**.
- 해당 로직은 **`js/index.js` 한 파일**에 모여 있고, UI 이벤트는 **`js/app/bindEvents.js`**의 **`bindMemoryRegistrationEvents`**에서 연결됩니다.
- AI 응답·장면 JSON 추출은 **Supabase Edge** **`supabase/functions/collect-memory/index.ts`**에서 수행됩니다.
- 최종 DB 저장은 **`js/services/MemoryService.js`**의 **`MemoryService.saveMemory`** → 내부 `buildMemoryPayload` / `persistMemory` 경로입니다.

프롬프트에 지정할 때 예시:

- *「`js/index.js`의 `handleRegistrationInput`, `confirmScene`, `finishRegistration`를 재사용해」*
- *「`bindMemoryRegistrationEvents`와 동일한 방식으로 입력을 붙여」*
- *「`collect-memory` Edge와 동일한 SSE 페이로드 형식으로」*

---

## 1. 클라이언트 — `js/index.js` (대부분 여기)

| 대상 | 대략 줄 번호 | 설명 |
|------|----------------|------|
| `memoryRegistrationState` | **4142–4157** | 수집 중 메모리·현재 씬·대화 히스토리·phase (`collecting` / `reviewing` / `complete`) |
| `memoryCollectionSystemPrompt` | **4159–4190** | Edge에 같이 넘기는 시스템 프롬프트 (한 턴씩 질문, `[SCENE_COMPLETE]`, JSON 형식 안내) |
| `startMemoryRegistration` | **4192–4202** | 등록 시작, 화면 표시, 대화 시드 |
| `showRegistrationScreen` | **4204–4210** | `#memory-registration-screen` 표시 |
| `closeRegistrationScreen` | **4212–4222** | 닫고 `showConfessionHub()` |
| `startConversation` | **4224–4230** | NPC 대사 + `conversationHistory` 초기 assistant 메시지 |
| `addRegistrationNpcDialogue` | **4232–4237** | `.registration-npc-dialogue` 텍스트 갱신 |
| **`handleRegistrationInput`** | **4239–4402** | **핵심**: 유저 메시지 push → `fetch(.../functions/v1/collect-memory)` 스트리밍 → chunk 표시 → `done` 시 `extractedScene`이면 `currentScene` 채우고 **`showReviewPhase()`** |
| `parseEmotionFromText` | **4404–4424** | Edge가 준 감정 문자열을 키워드로 벡터(0.7 등)로 거칠게 매핑 |
| `showReviewPhase` | **4426–4437** | phase `reviewing`, 대화 숨기고 리뷰 패널 표시 |
| `populateReviewForm` | **4439–4479** | 텍스트/이유/선택지/슬라이더 채움 |
| `collectReviewFormData` | **4481–4511** | 폼 → 씬 객체 (감정 슬라이더, `reason_vector` 등) |
| **`confirmScene`** | **4513–4543** | 리뷰 확정 → `currentMemory.scenes.push` → 다시 수집 UI, 히스토리를 씬 완료 NPC 대사로 리셋 |
| `updateSceneCount` | **4545–4561** | 씬 개수·완료 버튼 표시 |
| **`finishRegistration`** | **4563–4592** | 제목 prompt → **`saveMemoryToDB(memory)`** |
| **`saveMemoryToDB`** | **4599–4610** | **`MemoryService.saveMemory`** 호출 |

`window`에 명시적으로 노출되는 것(같은 파일 **4614** 근처): **`window.startMemoryRegistration`**.

> **주의:** `index.html`은 `js/index.js`를 **`type="module"`**로 로드합니다.  
> `bindEvents.js`는 `window.handleRegistrationInput`, `window.finishRegistration`, `window.confirmScene`, `window.closeRegistrationScreen`, `window.memoryRegistrationState`를 참조하는데, **`index.js`에서 이들을 `window`에 붙이지 않으면** 등록 화면 전송/완료 버튼이 동작하지 않을 수 있습니다. 재사용 시에는 **명시적으로 `window`에 할당하거나 import/export로 연결**하세요.

---

## 2. 클라이언트 — `js/app/bindEvents.js`

| 함수 | 대략 줄 | 역할 |
|------|---------|------|
| **`bindMemoryRegistrationEvents`** | **254–~390** | `#registrationSendBtn` → `window.handleRegistrationInput`, Enter 전송, `#registrationVoiceBtn` (Web Speech API), `finishRegistration`, `closeRegistrationScreen`, `confirmScene`, 리뷰 뒤로가기, 선택지 추가 |

호출 순서: `bindEvents()` 안에서 **`bindMemoryRegistrationEvents()`** 가 **`bindConfessionEvents()`** 보다 먼저 호출됩니다 (**49 → 52**행).

---

## 3. 서버 — `supabase/functions/collect-memory/index.ts`

- 요청 본문: `{ conversation, systemPrompt }` (클라이언트가 `memoryRegistrationState.conversationHistory` + `memoryCollectionSystemPrompt` 전송).
- 인증: `verifyAuth` (주석상 로그인 필요).
- 스트림: SSE 형태 (`data: {JSON}`), Claude 호출 후 분석 프롬프트로 장면 JSON/`[SCENE_COMPLETE]` 처리 (파일 후반부에 스트리밍 조립 로직).

장면 “완성” 판정과 `extractedScene` 구조는 **이 Edge 구현과 클라이언트 `finalData.sceneComplete` 분기**가 쌍을 이룹니다.

---

## 4. 저장 — `js/services/MemoryService.js`

- **`MemoryService.saveMemory({ memory, curator_id })`** (**~171**): `buildMemoryPayload` → `validateMemoryPayload` → **`persistMemory`** (내부에서 NetworkService / Supabase).

---

## 5. HTML (참고만)

- 등록 UI: `index.html` 내 **`#memory-registration-screen`** 및 `registrationTextInput`, `registrationSendBtn`, `registration-review`, `reviewConfirmBtn` 등 (`bindMemoryRegistrationEvents`와 id가 맞아야 함).

---

## 한 줄 요약

| 질문 | 답 |
|------|----|
| record 전용 `js` 파일 이름? | **없음** |
| AI 대화 + 장면화 로직은? | **`js/index.js`** (`memoryRegistrationState` ~ `saveMemoryToDB`) |
| 버튼/입력 연결은? | **`js/app/bindEvents.js`** → `bindMemoryRegistrationEvents` |
| 모델/스트리밍 실제 호출은? | **`supabase/functions/collect-memory/index.ts`** |
| DB 저장은? | **`js/services/MemoryService.js`** → `saveMemory` |
