# TEM 오염 시스템 — 적용 가이드 (적용 완료 요약)

## 적용된 내용

### 1. 클라이언트 (js/index.js)
- `saveConfessionToDB()`에서 장면 저장 시 `text_stage_1`, `text_stage_2`, `text_stage_3`를 함께 저장하도록 수정됨.
- Edge Function `generate-scene-from-ritual`이 이 필드를 반환하면 그대로 DB에 저장됨.

### 2. Edge Function `contaminate-text` (신규)
- **경로**: `supabase/functions/contaminate-text/index.ts`
- **역할**: Gemini Flash로 Stage 1/2 오염 텍스트 생성 (Admin 재생성용).
- **입력**: `{ text: string, stage: 1|2, direction?: "default"|"emotion_mismatch"|"target_displacement"|"attribution_mismatch"|"void_mismatch" }`
- **출력**: `{ text_stage_1?: string }` 또는 `{ text_stage_2?: string }`

### 3. contamination.js (신규)
- **경로**: `js/contamination.js`
- **Stage 3**: `applyStage3(text, styleKey)` — Glitch, Redact, Dissolve 코드 생성.
- **Admin**: `regenerateStage1(sceneIndex)`, `regenerateStage2(sceneIndex)`, `generateStage3(sceneIndex)` 전역 노출.
- Admin에서 `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY` 사용 (admin.js에서 설정).

### 4. Admin UI
- **admin.js**: contamination 섹션에 오염 방향(드롭다운), Stage 1/2 재생성 버튼, Stage 3 스타일 선택 + 생성 버튼 추가.
- **admin.html**: `<script src="js/contamination.js"></script>` 추가.
- **admin.css**: `.contamination-*` 스타일 추가.
- **admin.js**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 `window`에 노출 (contamination.js 호출용).

---

## 배포 및 설정 (직접 수행)

### Step 1: Gemini API 키
1. https://aistudio.google.com → Get API key → Create API key (Create API key in new project 권장).
2. **Supabase Dashboard** → **Edge Functions** → **Secrets** 에서 추가:
   - Name: `GEMINI_API_KEY`
   - Value: `AIza...` (앞뒤 공백 없이, 한 줄만)
3. **API 키 제한 (403 나올 때):**
   - Google Cloud Console → APIs & Services → Credentials → 해당 API 키 클릭
   - **Application restrictions**: **None** 으로 두기 (HTTP referrers로 제한하면 Supabase 서버에서 호출 시 403)
   - **API restrictions**: "Don't restrict key" 또는 "Generative Language API"만 허용
4. 키 수정 후 Supabase Secrets 다시 저장하면, 다음 호출부터 적용됨 (재배포 불필요). 그래도 안 되면 재배포 한 번 하기.

### Step 2: Edge Function 배포
```bash
# contaminate-text 배포
supabase functions deploy contaminate-text

# (선택) generate-scene-from-ritual에 text_stage_1/2 반환 로직이 있는 버전으로 교체한 경우
supabase functions deploy generate-scene-from-ritual
```

### Step 3: output/ 파일로 교체하는 경우
가이드에 적힌 `output/` 디렉터리 파일이 있다면:
- `output/generate-scene-from-ritual_index.ts` → `supabase/functions/generate-scene-from-ritual/index.ts` 로 교체 후 배포.
- `output/contaminate-text_index.ts` → `output` 버전을 쓰려면 위 `contaminate-text/index.ts` 대신 교체 후 배포.

---

## 오염 방향 (direction) 매핑

| mismatch_type           | Stage 1 핵심 변형           | Stage 2 핵심 변형     |
|-------------------------|-----------------------------|------------------------|
| default                 | 1인칭→3인칭, 감각 흐림      | 문장 끊김, 대상 소거   |
| emotion_mismatch        | 감정 단어 변형              | 감정 표현 모호화       |
| target_displacement     | 대상/인물 모호화            | 대상 완전 소거        |
| attribution_mismatch    | 원인 귀속 변경              | 인과관계 모호화       |
| void_mismatch           | 여백 증가, 간소화           | 거의 끊긴 형태        |

## Stage 3 스타일 (코드 생성)

- **Glitch**: `░▒▓█▪▫` 유니코드 블록 문자로 일부 대체.
- **Redact**: 단어/구를 `████` 로 소거.
- **Dissolve**: 글자가 공백으로 소멸.
