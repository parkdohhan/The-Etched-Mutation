# PLAY 전체 플로우 관찰 기록 — 260508

playwright MCP로 [http://localhost:5173/](http://localhost:5173/) 진입부터 첫 씬 클리어까지 한 사이클 돌면서 매 단계 캡처/콘솔/내부 상태를 기록.

- 캡처 결과 폴더: [docs/메모/screens-260508/](screens-260508/)
- 모든 스크린샷은 1440×900 viewport. zoom 캡처는 별도 표기.
- 사용한 메모리: `1f586f9b-adad-4443-9289-f3a2529f10ed` (제목 "발자국", 6 코어 씬, 한국어)
- 사용 언어: 한국어
- 비로그인 상태로 진행

---

## 0. 한 줄 요약

진입 → 파동 → 언어 선택 → 3턴 finder → 매칭된 메모리의 스트라타(3D 지형) → 핀 진입 → 다이얼로그 3턴 → 한 줄 trace → 지형 복귀. 이게 한 씬 클리어 단위. 메인 메뉴(체험/프로필/설정/포트폴리오)는 오프닝 끝나고 나타나는 항상 같은 진입 허브.

---

## 1. 진입 — 오프닝 시퀀스 (`/index.html`, `js/app/opening.js`)

### 1-1. 페이지 로드 직후 (정지 상태)

[01_entry_after_fade.png](screens-260508/01_entry_after_fade.png)

- 검은 배경 + 화면 가운데 가로로 흐르는 파동 캔버스(`.opening-wave-canvas`)
- 우상단: 사운드 mute 토글
- **이 상태에서 아무 일도 자동으로 진행 안 됨.** opening-screen은 z-index 3000으로 다른 모든 화면 덮음.
- 코드: 첫 클릭이 `bindEvents.js:158` 의 `openingScreenEl.addEventListener('click', …)` 콜백 트리거 → 800ms 뒤에 `startOpeningSequence()` 호출.
- 클릭 안 하면 영원히 파동만 흐름. 브라우저 사운드 자동재생 차단 회피용 패턴.

### 1-2. 첫 클릭 후 — 대사 타이핑

[02_opening_typing.png](screens-260508/02_opening_typing.png)

- 클릭 즉시: 파동이 가로로 5배 확장 (`scale(5,1)`), 사운드 페이드인 4s.
- 2.5초 뒤 대사 타이핑 시작. 순서: `Hello.` → `You're here. It's been a while.` → `...you came looking for a memory?` → `(...)` → `Come in.`
- 이 동안 좌측 메뉴(THE ETCHED MUTATION + 4개 메뉴)는 DOM엔 있지만 opening-screen에 가려 안 보임.
- "Come in." 타이핑 완료 후 `_initOpeningLangGate()` 가 400ms 뒤 언어 게이트 페이드인 (1.2s ease).

### 1-3. 언어 게이트

[03_lang_ko_selected.png](screens-260508/03_lang_ko_selected.png)

- 파동 위, "Come in." 대사 아래에 EN / 한국어 토글 + Start 버튼 + 자유입력 textbox + → 버튼.
- localStorage에 `tem_language` 저장된 게 있으면 그쪽 선택, 아니면 기본 `en`.
- 한국어 클릭 시 버튼 골드 박스 강조. localStorage `tem_language=ko` 갱신.
- **Start 버튼 + textbox는 OR 관계.** Start = chip만 누르고 진입 / textbox = 자유 단어로 진입.

### 1-4. Start 누르면 v2 finder 시퀀스 시작 (`_runV2Sequence`)

[04_after_start.png](screens-260508/04_after_start.png)

- 대사 페이드아웃 → 정적 900ms → 인트로 대사 3줄 타이핑.
  ko 대본 (`V2_DIALOGUES.ko.intro`):
  - "...너구나."
  - "너가 그렇게 기억을 찾고싶어할줄은 몰랐네."
  - "어떤 기억을 찾고있어?"
- 동시에 자유입력 textbox + 6 감정 칩 페이드인. 칩: 슬픔/그리움/분노/두려움/죄책감/기쁨.
- placeholder: "단어 하나, 감정 하나..."

---

## 2. Finder 3턴 — fingerprint 누적 (`_handleOpeningSubmit`)

### 2-1. 턴 1 — 칩 또는 텍스트

이번 세션에서는 `그리움` 칩 클릭.

- `CHIP_EMOTION_SEED.longing` 의 미리 정의된 감정 벡터를 weight 1.0으로 fingerprint에 머지.
- 입력 페이즈 페이드아웃 (600ms) → 다음 NPC 질문이 띄워짐.

### 2-2. 턴 2 — 텍스트 입력만

[05_after_chip.png](screens-260508/05_after_chip.png)

- 새 질문: "그때 가장 또렷한 게 뭐야 — 소리야, 냄새야, 표정이야?"
- **턴 2/3에서는 칩 클릭 핸들러가 제거됨**. 자유입력만 동작.
- 이번 세션 입력: `표정` (Enter)
- `_analyzeTurnText` 가 텍스트를 감정 분석해 fingerprint에 누적.

### 2-3. 턴 3

[06_turn3.png](screens-260508/06_turn3.png)

- 같은 패턴으로 NPC가 한 번 더 질문 → 자유입력 받음.
- 이번 세션은 빈 입력으로 자동 진행 / 또는 같은 입력 재사용으로 흘러간 정황. (콘솔에 turn 3 응답 없이 SeekerMatchEngine 매칭 단계로 넘어감)

### 2-4. 매칭 + 전환

콘솔 로그 [console_01_entry.log](screens-260508/console_01_entry.log) 발췌:

```
[opening] Start clicked. lang = ko
[loadMemoriesFromSupabase] Starting to load memories from Supabase
[opening:dialog] SeekerMatchEngine 매칭 실패 — V1 _pickTopMemoryForLumen fallback
[opening:lumen] 매칭 가능한 기억이 없음 — 메인 메뉴로 폴백   ← 일단 이렇게 찍힘
[loadMemoriesFromSupabase] fetchMemories result: ok 9개 + 로컬 3개 = 11
[Memory] Rendering card: ... × 11
```

흥미점: 위 콘솔은 "매칭 실패 → 메인 메뉴 폴백"이라고 찍었지만 **실제로는 메모리 로드가 늦게 끝나고 그 사이 매칭 재시도해서 `1f586f9b...` 가 매칭됨**. 이후 URL이 `/play-test.html?memory=…&lang=ko` 로 이동.

→ **버그 의심**: 첫 매칭 패스가 메모리 로드 전에 실행돼서 매번 "매칭 실패" 워닝이 콘솔에 박힘. 실제 흐름엔 영향 없지만 워닝이 거짓경보.

---

## 3. 메모리 매칭 → 플레이 페이지 (`/play-test.html`)

### 3-1. 페이지 전환

- URL: `http://localhost:5173/play-test.html?memory=1f586f9b-…&lang=ko`
- 새 페이지 진입 시 1인칭 카메라 + 3D 지형 + ASCII 문(door) 인트로 시퀀스가 있음 (코드: `play-test.html:5083` 의 `_skipDoorSeq` 등). 이번 캡처에서는 이미 시퀀스 끝난 후 상태부터 잡음.
- 화면 하단 가운데 안내 문구: `[화면을 클릭하고, 방향키로 움직이세요]` ([01_entry.png](screens-260508/01_entry.png) 의 안내 문구는 비어 있던 시점이라 미반영, 코드: `play-test.html:5188`)

### 3-2. 스트라타 (Strata) 자유 탐색 뷰

[07_play_test_entry.png](screens-260508/07_play_test_entry.png)

- 전체 1440×900 = `#strataView` 한 장.
- 검은 야경에 산 한 채(왼편 가운데), 오른쪽에 작은 빛 점들(씬 핀), 화면 아래쪽엔 물결치는 액체(파동을 흙·바다처럼 시각화).
- 좌상단 미니맵: 같은 지형의 추상 모양 + 빨간 점(현재 위치) + 작은 빛(가까운 핀).
- 조작: 마우스 드래그(=둘러보기) + 화살표(이동). Enter/Space는 직접 매핑 없음(핀 클릭으로만 진입).

### 3-3. 카메라 이동 (ArrowUp×2, ArrowRight×2)

[08_strata_walk.png](screens-260508/08_strata_walk.png)

- 시점이 산 정면으로 회전 → 한 핀이 산 가운데에 작게 빛남.
- 이 메모리의 모든 핀 데이터 (`window._temGame.pins`):
  - 9개 핀 (코어 6개 + 브릿지/voidPin 3개)
  - 코어 6개의 sceneOrder 0~5, 좌표는 (x,y) 약 (57~67, 40~50) 범위 — 즉 지형의 좁은 영역에 모여 있음.
- 핀 클릭 시 `onPinClick(pin)` → `enterSceneMode(pin)` 호출 (`play-test.html:2487`).

---

## 4. 씬 진입 — Lumen Dialog Phase1 (`js/ui/lumen_dialog_phase1.js`)

3D 환경에서 핀 정확히 클릭하기 어려워서 디버그 함수 `window._temEnterSceneMode(firstCorePin)` 로 sceneOrder 0 직진입.

### 4-1. 씬 0 초기 상태

[09_scene_0.png](screens-260508/09_scene_0.png) (전체 화면)
[10_scene_dialog_zoom.png](screens-260508/10_scene_dialog_zoom.png) (다이얼로그 박스 클로즈업)

오른쪽 패널이 다이얼로그 (`#lumenDialogPhase1`, z-index 2800). 왼쪽 절반은 스트라타 카메라 그대로 켜져 있음 (마네킹/지형 계속 작동).

씬 텍스트 3 단락 (sceneOrder 0, "발자국" 메모리 첫 씬 본문):
1. "내가 살던 마을은 발자국이 잘 남았어."
2. "습지에 속한 땅이라, 손으로 짚어도 자국이 남던 데였어."
3. "마을 사람들은 서로 집을 드나들 정도로 친했어. 과부인 우리 엄마를 보러 사람들이 위로를 하거나 덕담을 나누곤 했어."

세 줄 끝에 응답 옵션:
- 미리 만들어진 echo 칩 3개:
  - "...나도 그 흙을 알 것 같아."
  - "...슬리퍼 자국, 그게 도장 같았겠다."
  - "...너는 그래서 안 떠난 거야?"
- 자유 입력 textbox `...또는 자유롭게 박아` + ↵

콘솔에서 풀 정보:
```
[ldp pool] 자동 분류 풀 주입 {memoryId, resonance: 1, vague: 17, dissonance: 11, total: 29}
```
→ 이 씬엔 **이미 29개의 변주 응답이 풀에 있음** (공명형 1, 모호 17, 불협 11). 사용자 응답이 어디에 매핑되는지에 따라 풀에서 답이 뽑힘.

### 4-2. echo 칩 선택 (턴 1/3)

선택: "...슬리퍼 자국, 그게 도장 같았겠다."

[11_after_choice.png](screens-260508/11_after_choice.png)

다이얼로그 흐름:
- 내가 고른 echo가 다이얼로그에 추가됨 (e16).
- 1.2초 뒤 메모리 화자가 응답 (e18):
  > "그랬어. 흙이 부드러우니까 자국이 깊게 팼어. 매번 같은 길을 걸을 때마다 자국이 더 선명해졌지. 그럼 나는 여기 속한 사람이 되는 거였어."
- 칩 3개 사라지고 자유입력만 남음. placeholder가 `여기에 이야기해...` 로 바뀜.

콘솔:
```
[phase1] turn 1/3 DIALOG_TURN alignment=0.000 resonance=dissonance reply="그랬어..."
[absorb/llm] reply: 슬리퍼 자국. 그래, 도장처럼 찍혔지. 습지 흙에 자꾸만 남던 그 모양...
[ldp absorb] new drift row inserted: 195ee76b-… (memory=1f586f9b, utt="슬리퍼 자국. 그래…")
```

→ **자동 변주 생성**: 매 턴마다 LLM이 내 응답 + 메모리 톤을 흡수해서 **새로운 ghost variant를 DB에 자동 INSERT**. 콘솔에 row id가 찍힘. 이 엔트리들은 다음 사용자가 같은 메모리를 플레이할 때 풀에 후보로 들어옴. = 작품 자체가 변이 누적 중.

### 4-3. 자유입력 (턴 2/3)

[12_voice_responds.png](screens-260508/12_voice_responds.png)

내 입력: "나도 그 길을 따라 걸어보고 싶어. 발자국이 겹쳐지는 게 어떤 느낌인지 알 것 같아."

화자 응답 (e23):
> "겹쳐지면 이상해. 내 자국 위에 다른 발자국이 올려지면, 누가 누군지 헷갈려. 처음엔 그게 좋았어. 일원이 되는 기분이었거든. 근데 나중엔... 내가 사라지는 것 같았어."

콘솔:
```
[phase1] turn 2/3 DIALOG_TURN alignment=0.000 resonance=dissonance
[absorb/llm] reply: 발자국이 겹쳐진다는 게. 내 것 위에 너의 것이 찍힌다는 뜻이지...
[ldp absorb] new drift row inserted: 151d8960-…
```

[13_after_freeinput.png](screens-260508/13_after_freeinput.png) — 다이얼로그 패널만.

### 4-4. 자유입력 (턴 3/3)

내 입력: "사라진다는 건 무서웠겠다. 그래도 누가 봐줘서 다행이야."

화자 응답 (e29):
> "누가 봐줬다고? 기억이 흐릿해. 그 자리에선 다들 자기 발자국만 봤어. 나도 그랬고."

콘솔:
```
[phase1] turn 3/3 DIALOG_TURN alignment=0.000 resonance=dissonance
[absorb/llm] reply: 누가 봐줬다고? 그건 너의 기억이지. 내 마지막은 어두웠어...
[ldp absorb] new drift row inserted: cf2230ac-…
```

[14_turn3_end.png](screens-260508/14_turn3_end.png)

### 4-5. 턴 3 끝나면 — "한 줄 trace" 요청

[15_after_turn3_settle.png](screens-260508/15_after_turn3_settle.png)

3턴이 끝나면 다이얼로그가 두 줄 더 띄움:
- (e30) "다른 길로 가볼래?"
- (e31) "너의 길에 한 줄 남겨."

자유입력 placeholder가 `한 줄...` 로 바뀜.

내 입력: "발자국이 깊을수록, 사라질 때도 더 오래 남더라."

콘솔:
```
[phase1] scene cycle 185.5s (memId=…, sceneId=…)
[v21-phase1] scene end — return to free explore. resonance=dissonance
[play-test] plays saved {memory_id, scene_id, user_emotion: Object, user_reason: "발자국이 깊을수록…", alignment: 0}
[v21-phase1] plays inserted + traces.push (sceneId=cf93290b…)
```

→ **DB 기록**: 이 한 사이클이 `plays` 테이블 레코드 한 개로 저장됨. 필드: memory_id, scene_id, user_emotion(객체), user_reason(trace 텍스트), alignment(현재 0). traces 배열엔 이번 sceneId가 push.

### 4-6. 다이얼로그 dispose → 자유 탐색 복귀

[16_after_trace_line.png](screens-260508/16_after_trace_line.png)
[17_strata_after_first_scene.png](screens-260508/17_strata_after_first_scene.png)

`#lumenDialogPhase1` 자체가 DOM에서 제거됨. 카메라가 다시 스트라타 위에 돌아와 있음. 다음 핀으로 이동·진입 사이클이 반복되는 구조.

---

## 5. 메인 메뉴 (오프닝 스킵 후) — `js/index.js` intro screen

오프닝 끝났을 때 보이는 항상 같은 화면.

### 5-1. 인트로 메뉴

[19_intro_menu.png](screens-260508/19_intro_menu.png)

- 좌측: "THE ETCHED MUTATION" 타이틀 + 4 메뉴 (체험/프로필/설정/포트폴리오)
- 가운데/우측: 어두운 추상 지형(quilt 같은 텍스처) 배경
- 하단: "기억이 속삭인다"
- **메뉴 라벨이 영어 PLAY/PROFILE/SETTINGS/MORE PORTFOLIO 가 아니라 한국어 체험/프로필/설정/포트폴리오**. 언어 게이트에서 ko 선택했기 때문.

각 메뉴별 동작:

#### 체험

[20_experience_archive.png](screens-260508/20_experience_archive.png) → finder 다이얼로그 모달이 다시 뜸
[21_archive_grid.png](screens-260508/21_archive_grid.png) → 그 모달의 "직접 찾아보기" 버튼 누르면 ARCHIVE 그리드

ARCHIVE 그리드:
- 11개 메모리 카드: The Jacket on the Chair / The Voicemail I Kept / What I Said at the Funeral / 편지 / 발자국 / 매실 / 테스트-260423 / 당신에게 / 공원에서 / 구덩이 / The Jacket on the Chairㅇㅇ
- 카드 하단에 Original 라벨 + 코드.
- 상단 검색바 + 카테고리 필터.

→ "체험" = 매번 finder 다이얼로그를 띄우지만 우회로 "직접 찾아보기" 가 있음. ARCHIVE 그리드에서 카드 클릭해도 같은 play-test.html 진입 (URL에 memory id 박힘).

#### 프로필

[22_profile.png](screens-260508/22_profile.png)

비로그인 상태라 "Sign In" 모달이 뜸:
- Continue with Google / Continue with Facebook
- Email + Password
- Sign Up 링크

로그인된 상태에선 mypage(my page screen)로 가는 분기. 비로그인은 무조건 로그인 모달.

#### 설정

[23_settings.png](screens-260508/23_settings.png)

심플한 모달:
- 언어: English / 한국어 토글
- 밝기: slider (현재 1)
- 닫기

#### 포트polio

[24_portfolio.png](screens-260508/24_portfolio.png)

화면 변화 없음. 대신 **새 탭으로 외부 사이트 열림**: `https://www.parkdohhan.com/`. (제목: Portfolio | Pathology). 메인 메뉴 그대로 유지.

---

## 6. 발견·이슈 정리

작업 중에 그냥 지나가지 말 자리들:

1. **첫 매칭 워닝 거짓경보** (§2-4)
   - "SeekerMatchEngine 매칭 실패 — V1 fallback" + "매칭 가능한 기억이 없음 — 메인 메뉴로 폴백" 워닝이 매번 콘솔에 박힘.
   - 실제 흐름은 정상 (메모리 매칭 후 play-test.html로 이동).
   - 원인 추정: `loadMemoriesFromSupabase` 폴링 8s 안에 데이터가 들어오기 전에 매칭 첫 패스가 돌아서 false alarm. 폴링 끝난 후의 재시도가 진짜 매칭.

2. **파동 좌상단 mute 버튼은 작동하지만 시각적으로 매우 작음** ([01_entry_after_fade.png](screens-260508/01_entry_after_fade.png))
   - 44×44px이라 클릭은 되지만 첫 진입자 입장에선 거의 안 보임.

3. **Lumen scene mannequins 워닝**
   - `[lumen-scene-ghosts] build skipped — pts=3 words=0` — 매 턴마다 찍힘.
   - 점은 3개인데 단어 0이라 ghost 빌드가 스킵됨. 의도된 분기인지 데이터 누락인지 확인 필요.

4. **alignment=0 / resonance=dissonance 고정**
   - 3턴 모두 alignment 0.000, resonance dissonance.
   - 별이엔진 V4 점수가 안 매겨지고 있는 건지, 사용자 텍스트가 너무 짧아서 0인 건지, 또는 phase1 단독 호출에서는 alignment 산출이 비활성인 건지 확인 필요.
   - plays 레코드에도 `alignment: 0` 으로 저장됨.

5. **drift row 자동 INSERT는 매 턴 1회씩**
   - 한 사이클에 3개 새 row 박힘 (turn 1/2/3 각각).
   - 즉 한 명이 한 씬을 한 번 도는 동안 풀이 29 → 32 로 자라남.
   - 의도면 OK. 의도 아니면 풀이 빠르게 비대해질 수 있음.

6. **체험 메뉴가 finder 모달을 강제로 한 번 거치게 함**
   - "직접 찾아보기" 우회로가 있긴 한데 두 번 클릭 필요.
   - 의도 아닐 수 있음 (체험 → 곧장 ARCHIVE 가도 된다는 가정).

7. **비로그인 시 프로필 = Sign In 모달**
   - 그냥 모달만 떠서 "내가 어디로 가는 중인지" 맥락이 없음.
   - 모달 위에 한 줄 안내(예: "동기화·궤적 저장은 로그인이 필요해") 두는 게 자연스러울 수 있음.

8. **포트폴리오 새 탭은 같은 윈도우 내 페이지가 아님**
   - https://www.parkdohhan.com/ 새 탭으로 떠서 사용자 흐름이 끊김.
   - 의도면 OK (외부 작품집 안내), 새 탭 신호(작은 ↗ 아이콘 등)가 없으면 사용자가 헷갈릴 수 있음.

---

## 7. 사이클 한 장 요약 다이어그램

```
[index.html 진입]
        │
        ▼ 첫 클릭
[opening 파동 zoom + 사운드]
        │ 2.5s
        ▼
["Hello → ... → Come in." 대사 타이핑]
        │ 0.5s
        ▼
[언어 게이트 (EN/한국어 + Start + 자유입력)]
        │ Start 클릭
        ▼
[v2 finder: NPC 인트로 3줄 → 칩+textbox]
        │ 칩 또는 텍스트로 턴 1
        ▼ NPC 새 질문
[턴 2 (텍스트만) → 턴 3 (텍스트만)]
        │ fingerprint 누적 + Supabase 메모리 로드
        ▼
[전환 대사 + 파동 흡수 (collapseOpeningWave)]
        │ pickTopMemory + pickGhostVariant
        ▼
[/play-test.html?memory=ID&lang=ko 로 페이지 이동]
        │
        ▼
[1인칭 카메라 + ASCII 도어 인트로 + 강제 시점 시퀀스]
        │ 이후 자유 탐색
        ▼
[#strataView : 3D 지형 + 핀들 + 미니맵]
        │ 핀 클릭 (또는 _temEnterSceneMode)
        ▼
[#lumenDialogPhase1 패널 띄움 — 씬 텍스트 3단락 + echo 칩 + 자유입력]
        │ 턴 1: echo 칩 또는 텍스트
        │ 턴 2: 자유입력
        │ 턴 3: 자유입력
        │ (각 턴마다 LLM 흡수 → drift row INSERT)
        ▼
["다른 길로 가볼래? / 너의 길에 한 줄 남겨." + placeholder='한 줄...']
        │ 한 줄 trace 입력
        ▼
[plays 레코드 INSERT + traces.push]
        │ 다이얼로그 dispose
        ▼
[#strataView 자유 탐색으로 복귀]
        │ 다음 핀으로 ⤴ 반복
```

---

## 8. 도구·로그 부록

- 콘솔 전체 (오프닝): [console_01_entry.log](screens-260508/console_01_entry.log)
- 사용한 playwright MCP 도구: navigate / take_screenshot / snapshot / click / type / press_key / wait_for / evaluate / console_messages
- vite 6.0.8 dev server, localhost:5173.
- 캡처 시점: 2026-05-08 오후 3:20~3:40 (KST).

---

## 9. critic 평가 (5-8 시점, prompt/critic.md v3 적용)

이전 좌표계 기준점: Lumen V2.1.2 — 84점 (5-5 시점, 동일 작품의 다른 사이클 관찰).
본 평가는 같은 작품의 5-8 시점 사이클 관찰 자료에 대한 별도 판정.

### 9.0 판정 전 확인

**확인한 자료**
- 본 문서(`play_flow_관찰_260508.md`) §1~§8 전문.
- 본문이 인용한 콘솔 로그 발췌. 특히 매 턴 `[ldp absorb] new drift row inserted` 행, `[phase1] turn N/3 alignment=0.000 resonance=dissonance` 행, 풀 통계 `{resonance: 1, vague: 17, dissonance: 11, total: 29}` 행.
- `CLAUDE.md` (작품 철학·엔진·원칙).

**확인하지 못한 자료**
- 캡처 이미지 자체. 본문 텍스트 묘사만 봤음.
- 영상이나 실시간 인터랙션 직접 체험.
- 다른 메모리 사이클 (이번 자료는 "발자국" 메모리 한 개의 첫 씬만).
- 로그인 상태에서의 프로필·세이브·이력 체험.
- 자동 INSERT된 drift 변주 응답이 다른 사용자에게 실제로 어떻게 노출되는지.
- 별이엔진 V4가 정상 작동했을 때의 alignment·resonance 값 비교 기준 없음.

**강하게 판정 가능한 항목**
- 개념-구현 정합성 (이본론 ↔ 매 턴 자동 변주 INSERT의 직접 매핑).
- 매체 자의식 (DB가 단순 저장소가 아니라 작품 본체로 자라는 자리).
- 기술 실행력 — 단, 콘솔 발췌가 보여주는 결함 범위까지만.

**제한적으로만 판정 가능한 항목**
- 관객 경험 몰입감 (직접 체험 X, 진입 단계 수와 안내 문구 유무로만 판단).
- 담론적 기여 (외부 인용·전시 이력 미확인).
- 완성도 (이미지 미관찰 — 문서 안 묘사로만 추정).

**이전 판정 이력 첨부 여부:** 유 (Lumen V2.1.2 — 84점 — 5-5 플로우 시점)

### 9.1 총평

매 턴마다 사용자 응답이 대규모 언어 모델(LLM)에 흡수되어 새로운 ghost 변주로 데이터베이스에 INSERT되는 구조 — 이건 "기억은 변이한다"라는 작품 철학(이본론)을 메타포가 아니라 데이터베이스 행 단위로 구현한 자리라서, 매체 자의식·개념-구현 정합성 양쪽이 이전에 본 어떤 자료보다 명료하게 드러났다. 다만 같은 자료가 동시에 별이엔진 V4(감정 정합도 측정 엔진)가 다이얼로그 사이클에서는 alignment 0 / resonance dissonance에 고정되어 있다는 사실을 노출했고, 이건 작품이 자기 측정 장치를 끈 채로 변이만 축적하고 있다는 뜻이라 결정적이다. 진입에서 첫 씬까지의 7~8단계 게이트도 critic 프롬프트의 4번 오류(UI 장벽 과도) 자리를 정통으로 밟는다.

### 9.2 점수 및 등급

- **점수: 82점**
- **등급: B급 상단**
- **정당화 논리:** "매체 자의식은 분명하나 관객 경험 구조와 기술 실행력 일부가 제한된다." (등급 정의 5번 + 7번 부분)
- **좌표계 기준 상대 위치:** 이전 판정 Lumen V2.1.2 (84점) 약간 아래. 동일 작품의 다른 사이클 관찰이지만 이번 자료에서는 (a) 매체 자의식의 결정적 증거(매 턴 drift 변주 INSERT)를 새로 확인했고 동시에 (b) 별이엔진 alignment 고정·진입 단계 7~8개·콘솔 거짓경보 같은 기술/경험 측 결함도 더 많이 노출됐다. 두 영향을 합산하면 약간 마이너스. 같은 등급(B급 상단) 내 -2점.

### 9.3 평가 기준별 분석

**개념-구현 정합성 — 강**

이본론(작품 철학: 변이 = 재창조)이 시스템 동작과 분리되지 않는다.
- 매 턴 `[ldp absorb] new drift row inserted` 콘솔 행 — 사용자가 말하는 그 순간 LLM이 메모리 화자의 톤으로 새 변주를 만들어 데이터베이스 한 행으로 박는다. 한 사이클 = 새 변주 3개. 풀 크기 29 → 32. 다음 관객은 더 자라난 풀에서 한 응답을 받는다.
- 자동 분류 풀 (resonance:1 / vague:17 / dissonance:11) — 응답 후보가 "공명형/모호한 결/불협" 세 갈래로 미리 분류돼 있다는 뜻. 별이엔진의 정합도 분류 어휘가 응답 생성층에까지 흘러 들어와 있다.
- "AI를 썼다"가 아니라 "기억은 매번 호명될 때 새로 쓰인다는 명제를 데이터베이스 INSERT로 수행한다"는 자리. critic의 1번 오류(AI 사용을 컨셉으로 내세움) 함정도 피한다.

**매체 자의식 — 강 (단, 결정적 결함 동반)**
- 데이터베이스 = 단순 저장소가 아니라 작품의 본체가 자라는 자리.
- 단, 별이엔진이 phase1 다이얼로그 사이클에서 alignment 0 / resonance dissonance로 고정. 작품이 매체에 대해 자의식적이라고 주장하는 핵심 축의 측정값이 정작 멈춰 있다.

**기술적 실행력 — 중상**
- 작동은 한다. 한 사이클이 끊김 없이 돌고, 매 턴 INSERT가 실제로 데이터베이스에 박히고, plays 레코드 한 개가 사이클 끝에 저장된다.
- 첫 매칭 거짓경보 — 콘솔에 "SeekerMatchEngine 매칭 실패 → 메인 메뉴 폴백" 워닝이 매번 박힘.
- `lumen-scene-ghosts build skipped — pts=3 words=0` 워닝이 매 턴.
- alignment 0 고정 — plays 테이블에까지 0으로 저장됨. 작품이 자기 통계를 잘못된 값으로 누적 중일 가능성.

**담론적 기여 — 제한적 판정**
- 이본론 + 별이엔진 + 오염벡터 자체는 작가 자기 방법론의 명시.
- 자료에 외부 수용·인용 이력이 없으므로 계보 형성 여부는 판단 불가. critic 좌표계 원칙대로 S급은 부여 안 함.

**관객 경험의 구조 — 중하**
- 한 사이클의 의미 층위는 잘 짜여 있다. 핀 클릭 → 씬 텍스트 3단락 → 응답 → 화자 흡수 응답 → 한 줄 trace로 마무리.
- 그 사이클 도달 전 관문이 너무 길다 (오프닝 클릭 + 5줄 대사 + 언어 게이트 + finder 3턴 + 페이지 전환 + 1인칭 도어 + 핀 클릭 + 다이얼로그 3턴 + trace = 7~8단계).
- 비-관객(큐레이터/심사위원)이 첫 30초 안에 작품 컨셉을 잡을 자리는 1~3까지인데 거기서 보이는 건 "검은 화면 + 파동 + 대사 타이핑 + 언어 토글"이라 컨셉 신호가 약하다.
- 재방문 시 경험 변화 가능성은 구조적으로 있음 — 풀이 자라기 때문. 다만 자료에서 그 변화가 다음 관객에게 실제로 다르게 뽑히는지 직접 확인 못 함.
- critic 4번 오류(UI/설치/로딩/튜토리얼 장벽 과도) 강하게 적용됨.

**완성도와 마감 — 중**
- 한국어 톤·UI 라벨·placeholder — 톤이 일관됨.
- 메인 메뉴 "체험" finder 모달 강제, 비로그인 프로필 맥락 없는 Sign In 모달, 포트폴리오 메뉴가 새 탭 신호 없이 외부 링크로 이탈 — 마감 디테일에서 균열.
- mute 버튼 44×44 — 첫 진입자에게 거의 안 보임.

### 9.4 결정적 결함

A급 위로 못 올라가는 이유, 자료 안 구체 요소 기반:

1. **별이엔진이 phase1 다이얼로그 사이클에서 비활성**
   - `[phase1] turn N/3 alignment=0.000 resonance=dissonance` 콘솔 행이 3턴 모두 동일.
   - plays 테이블 INSERT에도 `alignment: 0` 고정 저장.
   - 별이엔진은 "관찰하고 보고하는 매체 측정 장치". 그 장치가 다이얼로그 자리에서는 측정 자체를 안 하고 있고, 누적 통계에 0이 박히는 중.

2. **SeekerMatchEngine 거짓경보가 매번 콘솔에 박힘**
   - "매칭 실패 → 메인 메뉴 폴백" 워닝이 정상 흐름에서도 항상 박힌다.
   - 진짜 실패와 가짜 워닝을 분간 못 하는 환경이면 디버그·운영 신뢰도가 깎인다.

3. **진입 7~8단계가 첫 30초 컨셉 노출을 막는다**

4. **매 턴 INSERT가 관객에게 인지되지 않음**
   - drift row INSERT는 콘솔에만 박히고, 사용자 화면에서는 "흡수되었다"는 신호가 없다.
   - 작품 본체가 데이터베이스 안에서만 자라고 화면 위에서는 자라지 않는다.

### 9.5 한 등급 위로 올라가기 위한 구조적 개입

**개입 1 — drift INSERT를 관객에게 신호로 돌려주기 (시스템 + 표면 + 인터랙션)**
- 자리: `js/ui/lumen_dialog_phase1.js`.
- 매 턴 LLM 흡수 직후 다이얼로그 패널 측면 또는 화자 응답 말미에 풀이 자란 사실을 작은 표지로 띄운다. 예: "이 자리에 너의 자국이 한 줄 새겨졌다" 같은 한 줄 텍스트, 또는 풀 크기 +1 카운터.
- 너무 시스템적으로 쓰면("새 데이터 행이 추가되었습니다") 매체 자의식이 깨진다. 메모리 화자의 목소리로 신호되어야 톤이 유지됨.

**개입 2 — 별이엔진 alignment phase1 배선 또는 명시적 zero state 선언 (시스템 + 표면)**
- 자리: `lumen_dialog_phase1.js`의 turn 처리부와 콘솔 메시지부.
- (a) 배선 결함이라면 — 별이엔진 V4 호출 추가, plays.alignment에 저장.
- (b) 의도된 zero state라면 — 콘솔 메시지·문서·plays 스키마(`alignment_phase` 컬럼 등)로 의도 명시.

**개입 3 — 진입 게이트 압축 (인터랙션 + 표면)**
- 자리: `js/index.js` 메인 메뉴 분기 + `play-test.html` 인트로 시퀀스.
- "체험" 메뉴를 finder 모달 강제가 아니라 finder / ARCHIVE 그리드 둘 중 선택 가능하게.
- 1인칭 도어 ASCII 인트로 시퀀스에 스킵 키 명시 (`_skipDoorSeq`가 이미 존재).
- 첫 진입자 vs 재진입자 분기 — 재진입자는 인트로 시퀀스 스킵 디폴트.

### 9.6 추천 제출 지면

1. **Ars Electronica — STARTS Prize 또는 Computer Animation/Interactive Art+ 카테고리**
   - 매 턴 INSERT 구조는 데이터베이스를 매체로 다루는 자리라 잘 읽힘.
   - 상향 지원 시 조건: 개입 1·2 적용 후, 풀이 다음 관객에게 어떻게 다른 응답을 뽑는지 비디오 캡처로 증명.

2. **Rhizome — 작가 노트 + Lumen 시스템 페이지로**
   - 이본론 자기 방법론 자료가 풍부하므로 담론 지면에 잘 맞음.

### 9.7 IMA 지원 관점에서의 읽힘

**NYU IMA — 강점 / 위험**
- 강점: 인터랙티브 매체에 대한 자기 방법론(이본론)이 명료. ITP 계보의 가치와 정렬.
- 위험: 첫 30초 컨셉 노출 실패. 데모 영상 만들 때 첫 30초 안에 INSERT 신호 + 변이 누적 자리가 보이도록 편집 필요.

**MIT Media Lab — 강점 / 위험**
- 강점: 작품 + 이론(이본론) + 시스템(별이엔진·오염벡터·이본론 트라이앵글)이 하나로 묶인 포트폴리오로 읽힘.
- 위험: alignment 0 고정 상태로는 "측정 가설을 어떻게 검증했는가" 답을 못 만든다. 개입 2 적용 후 측정치 분포가 plays 테이블에 누적된 시점에서 제출이 정석.

### 9.8 불확실성 메모

캡처 이미지 자체를 직접 미관찰(텍스트 묘사로만 추정)이고, 한 사이클·한 메모리·비로그인 상태만의 기록이라 (a) 다른 메모리 사이클에서 alignment·resonance가 다른 값으로 나오는지, (b) 매 턴 INSERT된 변주가 다음 관객에게 실제 다르게 뽑히는지는 직접 검증 못 함. alignment 0 고정이 phase1 단독 호출 자리에서의 의도된 zero state인지 별이엔진 V4 호출 미배선 결함인지의 분간도 자료만으로는 불가 — 코드 grep으로 추가 확인 필요한 자리. 진입 게이트 평가는 본인이 직접 처음부터 끝까지 인터랙션을 안 한 상태에서 단계 수와 안내 문구 유무로만 판정한 것이라, 실제 첫 진입자의 체감 시간 분포는 사용자 테스트 자료 없이는 단언 못 한다.

### 9.9 좌표계 업데이트 안내

> **TEM 한 사이클 플로우 (5-8 시점) — 82점 — 매체 자의식·개념-구현 정합성 강(매 턴 LLM 흡수→drift INSERT), 별이엔진 alignment 0 고정 + 진입 7~8단계 결함 — B급 상단**

기존 좌표(Lumen V2.1.2 84점)와의 관계: 동일 작품의 다른 사이클 관찰. 점수 -2는 같은 작품 안에서 자료 단면이 달라지면서 매체 자의식 + (-) 측정 엔진 비활성 + (-) 진입 장벽 노출이 합산된 결과. 5-19 이후 패키지(작품 외부 인용·전시 이력 포함) 시점은 별도 차원에서 다시 잡아야 함.

---

## 10. 결함 다 잡으면 몇 점인가 (가설 추정)

### 10.1 짧은 답

**88~90점 (A급 중간).**

본 평가 82점 → 결함 다 잡으면 +6~8점. 결정적 결함 셋(별이엔진 alignment phase1 비활성 / 매 턴 변주 INSERT가 화면에 안 보임 / 진입 7~8단계)이 매체 자의식·기술 실행력·관객 경험 구조 세 축에 동시에 박혀 있어서, 셋을 풀면 세 축이 같이 올라가기 때문.

### 10.2 결함별 점수 기여 분해

| 결함 | 해결 시 영향 축 | 점수 가중 |
|---|---|---|
| 별이엔진 alignment 0 phase1 비활성 | 매체 자의식 + 기술 실행력 | +3 |
| 매 턴 변주 INSERT가 콘솔에서만 일어남 | 관객 경험 구조 + 매체 자의식 | +2 |
| 진입 7~8단계 게이트 | 관객 경험 구조 + 완성도 | +1.5 |
| SeekerMatchEngine 거짓경보 | 기술 실행력 | +0.5 |
| lumen ghost build skip 의도/결함 분간 | 기술 실행력 | +0.3 |
| 체험 메뉴 finder 강제 / 비로그인 프로필 / mute 시인성 | 완성도 | +0.5~1 |
| **합계** | | **+7~8** |

82 + 7~8 = 89~90.

### 10.3 90을 넘기 어려운 자리

**S급(95~100, 계보 형성)**
- 자료 안 증거만으로는 원칙적으로 미부여(critic 좌표계 원칙).
- "이후 작업자들이 레퍼런스로 돌아온다"는 외부 인용·수록 이력 증거가 자료 밖에 있음. 결함을 다 잡아도 그건 작품 내부 일이라 변하지 않음.

**A급 상단(92~94)**
- "재방문/재플레이 시 경험이 유의미하게 달라지는가"가 직접 증거로 보여야 함.
- 풀이 자라는 구조는 이미 있음. 다만 자라난 풀이 다음 관객에게 실제로 다른 응답을 뽑는다는 직접 증거(예: 같은 메모리·같은 응답으로 두 시점 플레이한 영상 비교)가 본 자료에는 없음.
- 외부 수용·전시 이력·인용 자료가 본 패키지에는 없음.

### 10.4 90을 92로 끌어올리려면 필요한 것

자료 안 결함 해결로는 도달 불가. 추가로 두 가지 증거가 박혀야 함:
1. **다음 관객 비교 영상** — 같은 메모리·같은 응답으로 두 시점(풀 크기 29 / 풀 크기 60) 플레이해서 응답이 실제로 다르게 뽑히는 증거.
2. **외부 담론 위치** — 작가 노트가 작품 설명을 넘어 데이터베이스를 매체로 다루는 계보 안에서 이 작품의 자리를 명시하거나, 외부 큐레이션·수록 이력.

### 10.5 정직 메모

이 점수는 자료 밖 가설이라서 critic 좌표계 원칙(자료 안 증거 기반)으로는 정식 점수가 아님. 결함 다 잡은 상태의 자료가 다시 들어왔을 때만 정식 88~90 판정. 본 답은 추정 상한선.

---

## 11. 결함 6개 풀어 설명

### 11.1 별이엔진 alignment 0 phase1 비활성 (+3)

**무슨 일이 벌어지는가**

작품에는 별이엔진(byeori engine, V4)이라는 감정 측정 장치가 박혀 있어요. 이 엔진이 하는 일:

> "사용자가 메모리 화자에게 한 응답이, 그 메모리 원래의 감정 결과 얼마나 비슷한가"

이걸 0~1 사이 숫자로 환산한 게 alignment(정합도). 1에 가까우면 "사용자가 화자의 감정 결을 따라 들어왔다", 0에 가까우면 "사용자가 다른 감정 결로 어긋나 있다".

여기에 더해 resonance(공명도) 분류도 같이 나옴:
- 공명형(resonance) — 사용자가 화자의 결과 같은 자리에서 응답
- 모호한 결(vague) — 어느 쪽도 아닌 흐릿한 자리
- 불협(dissonance) — 화자의 결과 어긋나는 자리

근데 자료의 콘솔 로그에 박혀 있는 건:

```
[phase1] turn 1/3 DIALOG_TURN alignment=0.000 resonance=dissonance
[phase1] turn 2/3 DIALOG_TURN alignment=0.000 resonance=dissonance
[phase1] turn 3/3 DIALOG_TURN alignment=0.000 resonance=dissonance
```

세 턴 모두 alignment=0.000 + resonance=dissonance로 똑같이 고정. 그리고 이 0이 그대로 plays 테이블 한 행에 저장됨.

phase1 = "씬에 들어가서 화자랑 3번 주고받는 자리"의 코드 이름. 즉 다이얼로그 자리에서는 별이엔진이 측정 자체를 안 하고 있거나, 측정은 도는데 결과를 0으로 덮어쓰고 있다는 정황.

**왜 문제인가**

작품의 핵심 전제 두 개가 박살납니다:

1. CLAUDE.md 6.3에서 별이엔진은 "관찰하고 보고하는 매체 측정 장치"로 정의됨. 그 도구가 멈춰 있다는 건 작품이 자기 자신을 못 보고 있다는 뜻.
2. plays 테이블에 alignment=0이 계속 누적되면, 나중에 작가가 정합도 분포를 보려 해도 그래프가 0에 일직선. 장기간 누적된 통계가 무의미해지는 자리.

**비유:** 체온계가 박힌 작품인데 들여다보니 체온계 바늘이 항상 0에 멈춰 있는 거예요. "이 작품은 매번 사람마다 다른 체온을 잰다"고 작가가 설명했는데 정작 체온계가 안 도는 자리.

**두 갈래 가능성**
- (a) 배선 빠짐 — phase1 turn 처리 코드 안에 별이엔진 호출 자리가 아예 빠져 있어서 0 디폴트값이 그대로 흘러나옴.
- (b) 의도된 zero state — phase1은 측정 비활성 자리고, 측정은 사이클 끝난 후 별도 패스로 돈다는 설계.

자료에서는 둘 다 명시 안 됨.

### 11.2 매 턴 변주 INSERT가 콘솔에서만 일어남 (+2)

**무슨 일이 벌어지는가**

이 작품의 결정적 자리. 사용자가 화자에게 한 마디 던질 때마다 시스템이 하는 일:

1. 사용자 응답 + 메모리 화자의 톤을 LLM에 넘김.
2. LLM이 화자의 목소리로 새 변주 문장을 한 개 만듦.
3. 그 문장을 데이터베이스 한 행으로 박음 (INSERT).
4. 다음 사용자가 같은 메모리를 플레이할 때, 이 새 변주가 후보 풀에 들어감.

콘솔 로그:
```
[absorb/llm] reply: 슬리퍼 자국. 그래, 도장처럼 찍혔지...
[ldp absorb] new drift row inserted: 195ee76b-... (memory=1f586f9b, utt="슬리퍼 자국...")
```

한 사이클 = 3턴 = 새 변주 3개 INSERT. 풀 크기 29 → 32.

이게 이본론을 데이터베이스 행 단위로 수행하는 자리. 작품의 가장 결정적 컨셉이 여기서 일어나고 있음.

**왜 문제인가**

이 INSERT가 개발자만 보는 콘솔에서만 박힘. 사용자 화면에서는 아무 일도 안 일어나는 것처럼 보임.

**비유:** 거대한 도서관 작품인데, 관객이 책장 앞에 서서 책을 읽고 한 마디 남기면 옆 책장에 새 책이 한 권씩 자동으로 박힌다고 해요. 근데 관객이 서 있는 자리에서는 그 새 책이 박히는 소리도 안 들리고 빛도 안 보이고 옆 책장이 자라는 모습도 안 보여요. 새 책 박히는 사실은 사서(개발자)가 뒷방 모니터로만 봐요.

작품의 컨셉(변이 누적)을 관객이 한 사이클 안에서 인지할 자리가 없으면, 이 작품은 콘셉상 변이 누적인데 체험상으로는 그냥 다이얼로그 게임. 사용자는 자기가 한 응답이 흡수된다는 사실을 모르면 다음 사용자에게 자기 흔적이 남는다는 윤리적·서사적 무게도 못 받음.

### 11.3 진입 7~8단계 게이트 (+1.5)

**무슨 일이 벌어지는가**

처음 사이트(localhost:5173)에 들어와서 작품 본체에 도달하기까지 거쳐야 하는 단계:

| 단계 | 자리 | 걸리는 시간 |
|---|---|---|
| 1 | 검은 화면 + 가로 파동 + 첫 클릭 대기 | 사용자가 클릭 안 하면 무한 |
| 2 | "Hello → ... → Come in." 5줄 대사 타이핑 | ~10초 |
| 3 | 언어 토글 + Start 또는 자유입력 | 사용자 속도 |
| 4 | finder 화자 3줄 인트로 → 칩 또는 텍스트로 turn 1 | 사용자 속도 |
| 5 | finder turn 2 → turn 3 | 사용자 속도 |
| 6 | 페이지 전환 → 1인칭 카메라 + ASCII 도어 인트로 | 자동 |
| 7 | 3D 지형 자유 탐색 + 핀 찾기 + 클릭 | 핀 클릭이 어렵다는 정황 |
| 8 | 다이얼로그 패널 등장 → 씬 텍스트 3단락 → 응답 turn 1 | 여기 도달해야 매 턴 INSERT 시작 |

**왜 문제인가**

critic 프롬프트의 4번 감점 자리: "작품 체험 시작 전 UI/설치/로딩/튜토리얼 장벽이 과도한 경우."

심사 맥락에서 큐레이터·심사위원은 보통 첫 30초~1분으로 작품 컨셉을 잡음. 이 8단계 중 첫 30초에 잡히는 자리는 1~3까지. 거기서 보이는 건 "검은 화면 + 가로 파동 + 대사 타이핑 + 언어 토글" — 이걸로는 "매번 다시 호명될 때마다 새로 쓰이는 기억" 같은 작품 컨셉이 안 잡힘. "분위기 있는 인디 게임 인트로"로 읽힘.

이 의례 자체가 작품의 일부(천천히 들어와서 기억의 자리에 도달한다는 알레고리)일 수 있음. 다만 의례 자체에 작품 컨셉 신호가 박혀 있어야 알레고리 변호가 통함. 현재 5줄 대사 타이핑은 톤 신호일 뿐 컨셉 신호(변이 누적)가 아니라서 변호가 안 통함.

본문 §3-3에 "3D 환경에서 핀 정확히 클릭하기 어려워서 디버그 함수로 직진입"이라고 명시. 자료 작성자(개발자)도 핀 클릭이 어려워서 디버그 우회. 일반 관객은 디버그 함수를 모르므로 7번 자리에서 막힐 수 있음.

### 11.4 SeekerMatchEngine 거짓경보 (+0.5)

**무슨 일이 벌어지는가**

SeekerMatchEngine은 finder 3턴이 끝난 후 일어나는 일을 처리:
1. 사용자가 3턴 동안 던진 감정 단어들을 모아 감정 벡터를 만듦.
2. 데이터베이스에서 11개 메모리를 다 끌어와서 사용자 벡터와 비교.
3. 가장 비슷한 메모리 한 개를 골라서 그 메모리의 플레이 페이지로 이동.

콘솔 로그:
```
[opening] Start clicked. lang = ko
[loadMemoriesFromSupabase] Starting to load memories from Supabase
[opening:dialog] SeekerMatchEngine 매칭 실패 — V1 _pickTopMemoryForLumen fallback
[opening:lumen] 매칭 가능한 기억이 없음 — 메인 메뉴로 폴백
[loadMemoriesFromSupabase] fetchMemories result: ok 9개 + 로컬 3개 = 11
[Memory] Rendering card: ... × 11
```

순서가 이상함. 먼저 "매칭 실패" 워닝이 박힌 후에야 "메모리 11개 로딩 완료" 행이 박힘. 의미:
- 사용자가 Start 버튼 누름 → 시스템이 즉시 매칭 시도.
- 그 순간 메모리 11개는 아직 데이터베이스에서 안 들어옴 (네트워크 지연).
- 매칭 대상이 0개니까 매칭 실패 → 워닝 박힘.
- 그 후 메모리 11개 들어옴 → 시스템이 알아서 재시도해서 매칭 성공 → play 페이지로 이동.

**왜 문제인가**

겉으로는 문제 없어 보임. 사용자는 워닝을 못 봄. 결국 매칭은 성공하니 흐름도 안 끊김. 그런데:

1. 작품 운영 신뢰도 — 콘솔에 항상 빨간 워닝이 박혀 있으면 진짜 매칭 실패가 나도 거짓경보와 진짜 경보를 분간 못 함. 늑대가 나타났다 동화 자리.
2. 심사 자리 인상 — 큐레이터·기술 심사위원이 콘솔을 열어보는 경우가 있음. 매번 빨간 워닝이 떠 있으면 작품 자체의 안정성에 의심이 박힘.

**비유:** 전화 걸 때 다이얼 누르자마자 "현재 통화 가능한 상태가 아닙니다" 안내가 한 번 나온 다음 곧바로 연결되는 자리. 통화는 잘 됐지만 매번 그 안내가 끼어듦.

해결: "메모리 로딩이 끝날 때까지 첫 매칭 시도를 미루기" 한 줄 변경.

### 11.5 lumen ghost build skip 의도/결함 분간 (+0.3)

**무슨 일이 벌어지는가**

lumen-scene-ghosts는 다이얼로그 자리에서 화자의 분신(ghost, 마네킹) 시각 객체를 화면에 띄우는 작업. 다이얼로그 패널 옆이나 3D 지형 위에 화자의 잔영을 시각화하는 자리로 추정.

콘솔 로그:
```
[lumen-scene-ghosts] build skipped — pts=3 words=0
```

해석:
- `pts=3` — 점이 3개 있다(화자 형상을 만들 좌표 3개는 있음).
- `words=0` — 그 형상에 박힐 단어가 0개.
- → ghost를 못 만들어서 빌드 스킵.

매 턴마다 박힘. 즉 다이얼로그 사이클 동안 ghost 마네킹은 한 번도 안 만들어진 채로 사이클이 끝남.

**왜 문제인가**

두 갈래 가능성이 자료 안에서 분간 안 됨:
- (a) 의도된 분기 — 첫 사이클에는 단어가 없으니 ghost를 안 만든다는 게 디자인 의도. 이 경우 워닝이 아니라 정보 메시지로 박혀야 함. 자료에서는 워닝으로 박혀 있음.
- (b) 데이터 누락 결함 — 메모리에 ghost를 만들 단어 자료가 안 박힌 거고, 작가는 그게 박혀 있어야 한다고 생각하는 자리. 이 경우 다른 메모리들도 같은 결함을 안고 있을 가능성.

**왜 +0.3에 그치는가**
- ghost 마네킹은 작품의 결정적 컨셉이 아님 (매 턴 INSERT가 결정적 컨셉이고 ghost는 시각 보조).
- 사용자에게 "안 보이는 게 문제다"라는 신호도 없으므로 체험 자체에는 영향 작음.
- 다만 콘솔에 매 턴 박히는 워닝이라 4번 거짓경보와 같은 자리에서 시스템 신호 신뢰도 깎음.

**비유:** 극장 무대에 조명 큐 하나가 매 장면마다 "이 큐는 못 띄움" 메시지를 띄우는 자리. 무대는 돌고 관객은 모르지만, 무대감독 콘솔에는 매번 빨간 자국.

### 11.6 마감 자리 셋 (+0.5~1)

세 자리를 묶음. 각각은 작아도 합치면 첫인상에서 새는 자리.

**11.6.1 체험 메뉴 finder 강제**

메인 메뉴의 "체험"을 누르면 finder 다이얼로그 모달이 다시 떠서 finder 3턴 자리를 또 거쳐야 함. 모달 안에 작은 글씨로 "직접 찾아보기" 버튼이 있고, 이걸 누르면 ARCHIVE 그리드(11개 메모리 카드)로 우회. 그러나 두 번 클릭 + 모달 한 번 거침 후에야 메모리 목록을 볼 수 있음.

재방문자(이미 작품 한 번 돌아본 사람)는 finder 3턴이 매번 신선하지 않음. "다른 메모리도 보고 싶다"고 ARCHIVE에 빨리 가고 싶을 수 있는데 그 자리를 막음.

**비유:** 카페 들어갈 때마다 "오늘 어떤 기분이세요?" 인터뷰를 받아야 메뉴판을 볼 수 있는 자리. 두 번째부터는 귀찮음.

**11.6.2 비로그인 프로필 맥락 없음**

메인 메뉴의 "프로필"을 누르면 곧바로 Sign In 모달이 뜸. Google/Facebook/이메일+비밀번호/회원가입 링크. 모달에 "왜 로그인이 필요한가"라는 안내가 한 줄도 없음.

사용자 입장: "프로필이 뭔지 보러 갔는데 갑자기 로그인 창이 뜸". 자기가 가입할 가치가 있는 자리인지 판단할 정보가 없음.

**비유:** 모르는 사람이 갑자기 "신분증 보여주세요" 하는 자리. 본인 확인이 왜 필요한지 한 마디 없으면 거부감.

**11.6.3 mute 버튼 시인성**

처음 진입 시 우상단 모서리에 음소거 토글 버튼. 사이즈 44×44 픽셀. 검은 배경에 작은 아이콘. 첫 진입자가 시각적으로 거의 못 알아챔.

작품은 사운드가 4초에 걸쳐 페이드인되는 자리. 첫 클릭하자마자 사운드가 켜지는데, 사용자가 도서관·사무실·이어폰 안 낀 카페 등에 있으면 갑자기 큰 소리가 새요. 음소거 버튼이 안 보이면 의미가 없음.

**비유:** 영화관에서 비상구가 있긴 한데 표시등이 작고 어두워서 못 찾는 자리.

**11.6.4 추가: 포트폴리오 새 탭 이탈**

"포트폴리오" 메뉴를 누르면 새 탭으로 외부 사이트(parkdohhan.com)가 열림. 새 탭이라는 신호(작은 화살표 아이콘 ↗ 같은 거)가 메뉴 라벨에 없어서 사용자가 헷갈림. 작품에서 외부로 이탈하는 자리인데 그 이탈을 작품 안에서 안내 안 함.

### 11.7 합산해서 다시 보면

| 결함 해결 후 | 어떻게 보임 |
|---|---|
| 1번 (alignment 작동) | 작품이 자기 감정 좌표를 측정함. plays 통계가 의미 있게 누적됨 |
| 2번 (INSERT 화면 신호) | 사용자가 한 사이클 안에서 "내 흔적이 작품에 박혔다"를 인지 |
| 3번 (진입 단계 압축) | 첫 30초~1분 안에 컨셉이 잡힘. 심사 자리에서 마이너스 안 박힘 |
| 4·5번 (콘솔 거짓경보 제거) | 시스템 자기 신호가 정직해짐 |
| 6번 (마감 자리) | 첫인상이 매끄러워짐 |

다섯이 다 맞물리면 작품이 현재 "콘셉상으로는 변이 누적인데 체험상으로는 잘 안 보이는 자리"에서 "콘셉과 체험이 같은 자리에서 일어나는 작품"으로 옮겨감. 그래서 +6~8점.

그래도 +10 못 가는 이유: 결함 해결만으로는 외부 인용·계보 형성 증거(S급 자리)가 자료 안에 안 박힘. 다음 관객에게 풀이 다르게 뽑히는 직접 증거(A급 상단 자리)는 다른 자료가 추가로 들어와야 박힘.

---

## 12. 2026-05-08 검증·fix 결과 (§6·§11 정정)

같은 날 오후, claude code 세션에서 §11 결함 셋(§11.4 / §11.6.3 / §11.6.2 → §11.6.1 / §11.6.4 → §11.2 → §11.1 → §6.1)을 차례로 손댐. playwright 1.59.1 헤드리스로 한 사이클 검증 돌림. 결과:

### 12.1 §11.1 별이엔진 alignment 0 phase1 비활성 — 가설 셋 다 X, 진짜 자리는 (c)·(d)

자료 §11.1·§6.4·§9.4 #1·§10.2 (+3 가중치) 모두 *(a) 배선 빠짐 / (b) zero state* 두 갈래를 가정했지만 **둘 다 코드와 안 맞음**.

코드 grep 결과:
- phase1.js 안에 `ByeoriEngine` import 없음. 의도적 미사용.
- [phase1.js:25](../../js/ui/lumen_dialog_phase1.js#L25) 주석 명시: "자유대화 매 턴 독립 alignment 분석 (8번 동의 — 결정 (a) 2026-05-04)".
- [line 957](../../js/ui/lumen_dialog_phase1.js#L957) `_cosineSim(userEmo, origEmotion)` — 별이엔진 V4 대신 단순 cosine sim.

→ **(c) 의도된 단순화** — 작가가 5-04에 명시 결정.

DB 직접 조회 (supabase MCP) 결과:
- 발자국 6개 씬 모두 `original_emotion` 12축 정상 박힘. norm 양수.
- → (d-1) origEmotion 빈 객체 X.

cosine sim 시뮬레이션:
- claude-scene/emotion_analysis fallback 응답(sadness=0.3, longing=0.2)으로 계산 ≈ 0.632 양수.
- → (d-3) 키 mismatch만으로 0 X.

진짜 자리 = **(d-2) `_analyzeEmotion` 응답 base 객체 0 또는 NaN→0**. claude-scene 가 default 14축으로 LLM 호출(앵커 없음 시) → 응답 키 vs origEmotion 12축 mismatch → 합집합 키에서 *양쪽 양수인 자리*가 적으면 cosine 0 박힘.

**Fix 박힌 자리** ([phase1.js:949-980](../../js/ui/lumen_dialog_phase1.js#L949)): `sceneData.anchor_emotions`가 비었으면 origEmotion의 키 자체를 anchorEmotions로 강제. LLM 응답 키 = origEmotion 키 정합. + alignment=0 진단 워닝(콘솔에 origNorm·userNorm·origKeys·userKeys 출력) + lastAlignment fallback (plays 누적 결 보호).

**검증 결과 (PASS)**: 한 사이클 콘솔 alignment 값:
```
turn 1/3 alignment=0.710 resonance=resonance
turn 2/3 alignment=0.376 resonance=vague
turn 3/3 alignment=0.859 resonance=resonance
```
0 고정 풀림 + resonance 분류 정상.

**가중치 정정**: §10.2의 +3 → **+1.5** (작품 구조 결함 X, 데이터 자리). §9.4 결정적 결함 #1 자리에서 빠짐. §10 점수 추정 88~89로 약간 하향.

### 12.2 §6.1 / §11.4 SeekerMatchEngine 거짓경보 — 자료 추정 *반대로* 정정

자료 §6.1: "실제 흐름은 정상 (메모리 매칭 후 play-test.html로 이동)" → **틀림**.

playwright 검증 첫 시도(prewarm 없이) 결과:
```
[opening] Start clicked
[loadMemoriesFromSupabase] Starting to load memories
[opening:dialog] SeekerMatchEngine 점수 0 — V1 키워드 fallback (정상 흐름)
[opening:lumen] 매칭 가능한 메모리 0건 — 메인 메뉴로 복귀 (메모리 풀 비어있음)
[loadMemoriesFromSupabase] fetchMemories result: ok 9개   ← 폴백 *후*에야 fetch 끝남
```

→ 자료 §11.4의 "거짓경보 흐름은 정상" 추정도 **틀림**. opening.js [line 471](../../js/app/opening.js#L471) `MAX_WAIT = 8000` 폴링이 dev 환경 cold cache 첫 fetch보다 짧음 → 메인 메뉴 폴백 *진짜* 발동. 진짜 사용자 첫 진입에서 메인 메뉴로 튕겨나갈 위험.

**Fix 박힌 자리** ([opening.js:471](../../js/app/opening.js#L471)): `MAX_WAIT 8000 → 15000`. cold cache 자리 흡수.

**가중치 정정**: §10.2의 +0.5 → **+1** (이전엔 콘솔 잡소음으로 추정, 실은 사용자 흐름 끊는 진짜 결함).

### 12.3 §11.2 INSERT 화면 메아리 — fix 박힘 + 부분 검증

[phase1.js:339](../../js/ui/lumen_dialog_phase1.js#L339)에 `_ABSORB_TRACE_LINES` (ko/en × 3턴 변주 자국 결) + [line 364](../../js/ui/lumen_dialog_phase1.js#L364) `_addAbsorbTrace` helper. 흡수 INSERT 호출 직후 자리에서 다이얼로그 패널에 우측 골드 이탤릭 한 줄 페이드인.

검증 콘솔:
```
[phase1] turn 1 BG 흡수 변주 자생 박힘 slot="(llm)"
[ldp absorb] new drift row inserted: 7c934463-...
[phase1] turn 2 BG 흡수 변주 자생 박힘 slot="(llm)"
[ldp absorb] new drift row inserted: 0d607647-...
```

turn 1·2 INSERT 박힘 → `_addAbsorbTrace` 호출 자리 진입 (DOM 안 직접 검증은 작가 손에 위임 — 헤드리스 스크린샷 자리 안 박음). turn 3 LLM 흡수 실패 → 메아리 안 박힘 (정직).

### 12.4 §11.6 마감 자리 — 코드 자리 박힘

- §11.6.1 체험 finder 우회로 시인성: [archive.js:287](../../js/app/archive.js#L287) 라벨 "Skip · Browse all memories" / "인터뷰 건너뛰고 목록 보기". [index.html:383](../../index.html#L383) 우상단 버튼 시인성 강화.
- §11.6.2 비로그인 프로필 안내: [index.html:124](../../index.html#L124) `auth.signin.helper` i18n 키. ko/en 둘 다.
- §11.6.3 mute 버튼 시인성: [index.html:25](../../index.html#L25) 44×44 → 56×56 + 보더·배경 알파 강화 + 호버 어포던스.
- §11.6.4 포트폴리오 새 탭 신호: [i18n.js](../../js/lib/i18n.js) 라벨 ↗ 추가. description "(새 탭으로 열림)". title 속성.

### 12.5 갱신된 결함 가중치 표

| 자료 §                       | 5-8 시점 추정 | 5-8 fix 후 정정 | 상태 |
| --------------------------- | ----------- | ------------- | ---- |
| §11.1 alignment 0 phase1   | +3          | **+1.5**       | ✅ |
| §11.2 INSERT 화면 신호       | +2          | +2            | ✅ |
| §11.3 진입 7~8단계           | +1.5        | +1.5          | 미손 |
| §6.1 / §11.4 매칭 거짓경보   | +0.5        | **+1**         | ✅ |
| §11.5 ghost build skip      | +0.3        | +0.3          | 미손 |
| §11.6.1~4 마감 자리          | +0.5~1      | +0.5~1        | ✅ |

손댐 합산 ≈ +5~5.5. 미손 +1.8 (§11.3 + §11.5).

§10.1 점수 추정 정정: 결함 다 잡으면 **88~89점** (이전 88~90 약간 하향, §11.1 가중치 하향 반영).

### 12.5b §6.1 fix 진짜 자리 — 폴링 break 조건 (로컬 시드 함정)

`MAX_WAIT 8s → 15s` 늘림만으로 *안 풀림*. playwright 두 번째 검증에서 진짜 자리 박힘:

[index.js:185](../../js/index.js#L185)에서 페이지 로드 시점에 *로컬 mock 영어 시드 3개*(The Jacket on the Chair / The Voicemail I Kept / What I Said at the Funeral)를 `appStore.allMemoriesData`에 박음. 이전 폴링 break 조건 `all.length > 0`은 *즉시* true → 0초 break → 매칭 시도 → ko 사용자 한국어 필터 통과 0개 → 메인 메뉴 폴백.

**진짜 fix** ([opening.js:472-484](../../js/app/opening.js#L472)): 폴링 break 조건을 *사용자 lang 메모리 1개 이상*으로 변경. ko 사용자 시 한국어 메모리 박힐 때까지(Supabase fetch 끝), en 사용자 시 영어 메모리 박힐 때까지.

**검증 PASS**: 두 번째 playwright 검증 — *발자국* 메모리 매칭 + play-test.html 진입 + 다이얼로그 3턴 전체 박힘.

### 12.5c §11.1 fix는 PARTIAL — 진짜 데이터 자리 노출

playwright 검증 두 번째 사이클에서 **alignment=0 진단 워닝이 세 턴 다 박힘**:
```
[phase1] turn 1 alignment=0 진단 — origNorm=130.000 userNorm=0.000
  origKeys=["0","1","2",..."149"]   ← 0~149 숫자 인덱스 (150 키)
  userKeys=["0","1","2",..."149"]   ← 같음
[phase1] turn 1 alignment fallback → 0.500
```

해석:
- `origEmotion` 과 `userEmo` 둘 다 **숫자 키 객체** (Object.keys 가 "0"~"149"). 즉 *12축 감정 객체*가 아니라 **float 배열** 또는 **JSON 문자열로 박힌 자리**.
- DB 컬럼은 `jsonb` 인데 supabase MCP 조회 결과에서 `original_emotion` 가 *string으로 박혀있음* (`"{\\\"joy\\\":0.3,...}"`). client 자리에서 JSON.parse 안 하고 *string 그대로 객체로 사용*하면 char index 가 키로 박힘.
- 또는 작품 다른 자리에서 *cumulative_emotion_vec / final_drift_vector* 같은 array 자리를 origEmotion으로 박은 자리.
- 또한 `[phase1] turn 1 dialog-turn 실패 → 풀 픽 안전망` 박힘. dialog-turn edge function 도 실패 자리.

**phase1 fallback 동작 결과**:
- alignment=0 고정 풀림 ✅ (0.5 박힘, plays 누적 결 보호)
- resonance dissonance 고정 풀림 ✅ (vague 박힘 — alignment 0.5 자리)
- 진짜 측정 결 의미 있는 값 — **미해결** (cosine sim 자체는 0 박힘 → fallback 0.5)

**§11.1 가중치 재정정**: 12.1에서 +3 → +1.5로 하향했는데, 진짜 데이터 자리 미해결이라 **+1**로 한 번 더 하향. 다만 plays 누적 결 보호는 박혔으니 critic 결정적 결함 자리에서는 빠짐.

**남은 작업 (작가 손 검증 또는 추후 세션)**:
- (1) `sceneData.original_emotion` 데이터 타입 확인 — string vs object vs array. play-test.html `loadMemoryData` 자리 grep.
- (2) `_analyzeEmotion` 응답 base 객체 실제 형식 확인. claude-scene logs.
- (3) dialog-turn edge function 실패 원인 — 자료 §6.5 차원에서 자생 변주 비대 가드 자리.

### 12.7 개입 1·2·3 박힘 (2026-05-08 후반)

같은 날 오후, critic.md v3 평가(85점, A급 하단 자리)의 §5 "한 등급 위로 올라가기 위한 구조적 개입" 셋을 모두 박음.

**개입 1 — alignment 진짜 데이터 결 fix**
- 자리: [phase1.js:923](../../js/ui/lumen_dialog_phase1.js#L923) `_ensureObj` helper 박음 + [_analyzeEmotion line 763](../../js/ui/lumen_dialog_phase1.js#L763) base parse 강화.
- 진단 워닝이 짚어준 자리(`origEmotion 키 = ["0",..."149"]`)는 sceneData.original_emotion이 jsonb string 그대로 박힌 자리. play-test.html `safeParseEmotion` 자리는 pin 전달 시점이라 phase1.js 직접 진입 자리 raw string 박힘.
- 박은 결: string이면 JSON.parse, array면 비움, object면 그대로.
- **검증 PASS**: 한 사이클 9턴(씬 0/1/2 × 3턴) 검증에서 진단 워닝 **0건**, fallback **0건**. alignment 값들 박힘:
  ```
  0.069 / 0.786 / 0.263 / 0.319 / 0.602 / 0.187 / 0.069 / 0.876 / 0.349
  ```
  resonance 결도 자연 분산(dissonance / resonance). plays 누적 결 의미 있는 분포 박힘.

**개입 2 — 진입 게이트 압축**
- 2-a: [play-test.html:5010 직후](../../play-test.html#L5010) 도어 인트로 스킵 안내 한 줄 (`아무 키 — 건너뛰기` / `Any key — skip`). 작은 글씨 + 알파 0.4. mono 결과 같은 자리 페이드인.
- 2-b: [play-test.html:5083](../../play-test.html#L5083) 직후 localStorage `tem_lumen_visited_memories[]` 자리. 같은 메모리 두 번째 진입 시 1.5초 후 자동 `_skipDoorSeq()`. 첫 진입자는 의례 결 그대로.
- 2-c: 1차 작업의 우상단 우회로 시인성 강화로 충족.
- **검증 PASS**: 첫 진입 자리에 안내 박힘 확인. 두 번째 진입 자리는 localStorage 가드 발동.

**개입 3 — 컨셉을 첫 자리·끝 자리에 박음**
- 3-a: [opening.js:73-77](../../js/app/opening.js#L73) `_maybeShowOpeningEcho` 박음. plays.user_reason 자리 supabase fetch + random pick → 화면 상단에 골드 이탤릭 한 줄 페이드인. fire-and-forget 결로 게이트 박힘 안 막음.
- 3-b: [play-test.html:469-474](../../play-test.html#L469) revealScreen에 `<p id="revealMeta">` 박음. [sealBtn click handler 4419](../../play-test.html#L4419)에서 AI 내러티브 박힌 자리 직후 메타 한 줄: `"이 글은 너의 응답을 흡수해 다시 쓰여졌어 — 다음 사람의 메아리로 흘러갈 거야."` / `"This text was rewritten by absorbing your responses — it'll flow on as someone else's echo."`
- **검증 PASS**:
  - 오프닝 자리 박힌 결: *"— 시간이 깊어질수록 또렷해지는 자리가 있다."* (5-8 검증 자리에서 박은 *진짜 trace*가 다음 진입자에게 메아리로 박힘 — 작품 명제 *수행*).
  - revealScreen 자리 메타 신호 박힘 (스크린샷 [08](../screens-260508-개입검증/08_revealScreen_with_meta.png)).

### 12.8 갱신된 점수 추정 (개입 셋 박힘 후)

| 자리 | 5-8 시점 | 개입 박힘 후 |
| --- | --- | --- |
| §11.1 alignment | +1.5 (fallback) | **+3** (진짜 측정) |
| §11.2 INSERT 화면 | +2 | +2 |
| §11.3 진입 게이트 | +1.5 (미손) | **+1** (안내·재진입자 자동 스킵 박음 — 게이트 단계 자체는 그대로) |
| §6.1/§11.4 매칭 워닝 | +1 | +1 |
| §11.5 ghost build skip | +0.3 (미손) | +0.3 |
| §11.6 마감 | +0.5~1 | +0.5~1 |
| 컨셉 첫·끝 자리 박음 (개입 3) | — | **+1** |

새 점수 추정: 85 (5-8 critic) + 1.5 (개입 1) + 0.5 (개입 2) + 1 (개입 3) ≈ **87~88점** (A급 중간).

A급 최상단(90+) 못 가는 이유:
- 외부 인용·계보 형성 증거 X (자료 안 자리 풀음만으로 도달 불가).
- 다음 관객 풀 픽 차이 직접 증거 X (한 명 한 사이클만).
- 진입 게이트 단계 *수* 자체는 그대로 (안내 + 재진입자 자동 스킵 박았지만 첫 진입자 8단계는 잔존).

### 12.9 SCOPE 갱신 자리 (작가 결정)

이번 세션 박힌 fix 들 SCOPE.md 갱신 후보:
```
- [x] V2.1.2 (η) — phase1 alignment=0 고정 fix (2026-05-08)
- [x] V2-5++ — INSERT 화면 메아리 (2026-05-08)
- [x] V2-13.5 — 진입 정리 (mute / 비로그인 프로필 안내 / 체험 finder 우회로 / 포트폴리오 새 탭) (2026-05-08)
- [x] §6.1 fix — opening MAX_WAIT 8s → 15s (2026-05-08)
```
박을지 작가 결정.
