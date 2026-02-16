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

```bash
supabase functions deploy generate-scene-from-ritual
```

## 5. 배포 확인

배포 후 다음 URL로 테스트:
```
https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/generate-scene-from-ritual
```

## 6. 환경 변수 확인

Supabase Dashboard > Project Settings > Edge Functions > Secrets에서 다음 변수가 설정되어 있는지 확인:
- `ANTHROPIC_API_KEY` 또는 `CLAUDE_API_KEY`

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

