# Edge Function 배포 가이드

## 1. Supabase CLI 설치 확인

```bash
supabase --version
```

설치되어 있지 않다면:
```bash
npm install -g supabase
```

## 2. Supabase 로그인

```bash
supabase login
```

## 3. 프로젝트 연결

```bash
supabase link --project-ref bxmppaxpzbkwebfbgpsm
```

## 4. Edge Function 배포

**장면 생성 (고백):**
```bash
supabase functions deploy generate-scene-from-ritual
```

**오염 텍스트 (Admin 재생성, Gemini):**
```bash
supabase functions deploy contaminate-text
```

## 5. 배포 확인

- generate-scene-from-ritual: `https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/generate-scene-from-ritual`
- contaminate-text: `https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/contaminate-text`

## 6. 환경 변수 (Secrets) 확인

Supabase Dashboard > **Edge Functions** > **Secrets**에서 설정:
- `ANTHROPIC_API_KEY` 또는 `CLAUDE_API_KEY` — generate-scene-from-ritual용
- **`GEMINI_API_KEY`** — contaminate-text용 (Admin 오염 재생성)

## 7. 로그 확인

```bash
supabase functions logs generate-scene-from-ritual
```

## 문제 해결

### 배포 실패 시
1. Supabase CLI가 최신 버전인지 확인
2. 로그인 상태 확인: `supabase projects list`
3. 프로젝트 연결 확인: `supabase status`

### 400 에러 발생 시
1. Edge Function 로그 확인
2. 요청 body 형식 확인 (flowData 구조)
3. 환경 변수 설정 확인


