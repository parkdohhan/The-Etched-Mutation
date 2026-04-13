# 이거 어떻게 하는 건데 (유치원생용)

순서대로 따라만 하면 된다. 중간에 이해 안 가면 다음 줄로 넘어가지 말고 멈춰라.

---

## 0단계: 이 창을 열어둔 채로, 새 터미널을 열어라

- Windows: **Win + R → cmd → 엔터** 또는 VS Code 터미널 쓰면 됨

---

## 1단계: 작업 폴더로 이동

터미널에 **이 한 줄**을 그대로 복사해서 붙여넣고 엔터:

```bash
cd "d:/The Etched Mutation/tools/persona-sim"
```

성공이면 아무 메시지 없이 프롬프트만 나온다.

---

## 2단계: 필요한 것들 설치 (1번만 하면 됨)

터미널에 이거 붙여넣고 엔터:

```bash
npm install
```

- 1~2분 걸린다. 초록/노랑 메시지 나와도 정상이다.
- **빨간색 `ERR!`가 나오면 멈추고 나한테 말해라.**
- 끝나면 `added 42 packages` 비슷한 메시지가 나온다.

---

## 3단계: 비밀키 파일 만들기

```bash
cp .env.example .env
```

이러면 `.env`라는 파일이 생긴다.

그 다음 `.env` 파일을 VS Code나 메모장으로 열어라. 안에 이런 게 보일 거다:

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://bxmppaxpzbkwebfbgpsm.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
TARGET_MEMORY_ID=<기억 UUID — Supabase memories 테이블에서 확인>
```

> **`TARGET_MEMORY_ID`**: 시뮬레이션할 기억의 UUID. admin에서 기억 선택 후 브라우저 주소창에 `?memory=UUID` 형태로 보인다. 기억마다 다르니 바꿔가며 쓴다.

### 3-1. `ANTHROPIC_API_KEY` 채우기

1. 브라우저에서 https://console.anthropic.com 열기
2. 로그인
3. 왼쪽 메뉴에서 **"API Keys"** 클릭
4. **"Create Key"** 버튼 누르기
5. 이름 아무거나 (예: `tem-persona-sim`)
6. **"Create"** 누르면 `sk-ant-`로 시작하는 긴 문자열이 한 번만 보인다. **바로 복사해라.**
7. `.env` 파일에서 `ANTHROPIC_API_KEY=sk-ant-...` 줄의 `sk-ant-...` 부분을 지우고 방금 복사한 키를 붙여넣어라
8. 키 양 끝에 공백이나 따옴표 넣지 마라. `=` 뒤에 바로 붙어야 한다

결과 예시 (이건 예시일 뿐, 내 키 아님):
```
ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf1234567890...
```

### 3-2. `SUPABASE_SERVICE_KEY` 채우기

1. 브라우저에서 https://supabase.com/dashboard 열기
2. 로그인 → **"The Etched Mutation"** 프로젝트 선택
3. 왼쪽 맨 아래 **톱니바퀴 아이콘** (Settings) 클릭
4. **"API"** 탭 클릭
5. 스크롤 내려서 **"Project API keys"** 섹션 찾기
6. **`service_role`** 이라고 적힌 행의 **"Reveal"** 버튼 누르고 키 복사
   - ⚠ **`anon`가 아니라 `service_role`이다.** 잘못 고르면 작동 안 한다.
7. `.env` 파일의 `SUPABASE_SERVICE_KEY=eyJ...` 줄의 `eyJ...` 부분을 지우고 방금 복사한 키를 붙여넣어라

### 3-3. 저장

**⌘ + S** 로 저장하고 편집기 창 닫아라. `.env` 끝.

---

## 4단계: 페르소나 15명 서사 만들기 (5분, $2)

터미널에 이거 붙여넣고 엔터:

```bash
npm run generate-personas
```

- Claude Opus가 15명의 인물 서사를 하나씩 써준다
- 한 줄씩 `[2/gen] p01 already done, skipping` 또는 `[2/gen] ✓ 김유나, 28세` 같은 로그가 뜬다
- 전부 완료되면 `✓ Wrote 15 personas` 메시지가 나온다

### 완료 후 직접 검사

생성된 페르소나는 `data/{기억코드}_personas.json`에 저장됨. VS Code에서 열어보면 됨.

15명의 배경/경험/읽기 렌즈가 **서로 확실히 달라야 한다.** 만약 3~4명이 비슷비슷하면 나한테 말해라 — 프롬프트를 고쳐줄 거다.

> **중요**: 같은 기억으로 다시 돌리면 기존 파일에 이어쓴다 (중복 skip). 다른 기억으로 바꾸면 `TARGET_MEMORY_ID`만 수정하면 됨.

---

## 5단계: Play 시뮬레이션 (10분, $3)

터미널에 이거 붙여넣고 엔터:

```bash
npm run simulate-plays
```

- 각 페르소나가 장면을 읽고 감정 반응을 만든다
- 한 줄씩 `[3/sim] p01 v1 s3 al=0.72 mm=-` 같은 로그가 뜬다
- 약 250~400개 생성될 거다
- 중간에 멈춰도 괜찮다 — 다시 실행하면 이어서 한다
- 다 끝나면 `✓ N plays written` 메시지

---

## 6단계: 데이터베이스에 넣기

터미널에 이거 붙여넣고 엔터:

```bash
npm run insert-db -- --wipe
```

- `--wipe`는 "해당 기억의 기존 plays 다 지우고 새로 넣어라"는 뜻이다
- 끝나면 `✓ N plays now in DB for memory ...` 메시지

---

## 7단계: 나한테 말해라

"다 끝났어" 라고 말해라. 그러면 내가 SQL로:
- alignment 분산
- mismatch 분포  
- Jacket on the Chair와의 비교

를 바로 돌려서 결과 알려줄 거다.

---

## 8단계: 시각적 확인

브라우저에서 admin.html 열고 → 로그인 → 해당 기억 선택 → Canvas 탭에서 씬 노드 확인.

유기적인 지형과 오염 자국이 보여야 한다.

---

## 에러 나면

에러 메시지 **그대로 전체 복사**해서 나한테 붙여넣어라. 추측하지 말고 그냥 전체 복사.

특히 이런 거:

- `Error: ANTHROPIC_API_KEY` → 3-1 단계 다시 해라
- `401 Unauthorized` → 키가 잘못 붙었거나 anon key를 쓴 거다
- `rate_limit` → 1분 기다리고 다시 실행 (이어서 한다)
- `ENOTFOUND` → 와이파이 끊김

---

## 비용 안심

- 2단계부터 6단계까지 전부 합쳐 **약 $5** (7000원)
- 이 금액 이상 나오면 어딘가 무한루프다. 바로 Ctrl+C 눌러서 멈춰라
