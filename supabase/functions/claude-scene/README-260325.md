# Claude Scene Conversion Edge Function

화자 입력 텍스트를 Claude API로 장면으로 변환하는 Supabase Edge Function입니다.

## 기능

- 화자가 입력한 텍스트를 받아서 Claude API로 전달
- Claude AI가 장면으로 변환하여 반환
- CORS 지원

## 환경 변수 설정

Supabase 대시보드에서 다음 환경 변수를 설정해야 합니다:

1. Supabase 대시보드 접속
2. Project Settings > Edge Functions > Secrets
3. `CLAUDE_API_KEY` 추가 (Claude API 키 값)

## 배포 방법

### 1. Supabase CLI 설치

```bash
npm install -g supabase
```

또는

```bash
brew install supabase/tap/supabase
```

### 2. Supabase 로그인

```bash
supabase login
```

### 3. 프로젝트 연결

```bash
supabase link --project-ref bxmppaxpzbkwebfbgpsm
```

### 4. Edge Function 배포

```bash
supabase functions deploy claude-scene
```

### 5. 환경 변수 설정 (대시보드에서)

Supabase 대시보드 > Project Settings > Edge Functions > Secrets에서:
- Key: `CLAUDE_API_KEY`
- Value: `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`

## API 사용 방법

### 요청

```javascript
const response = await fetch(
  'https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      text: '화자가 입력한 텍스트'
    })
  }
)

const data = await response.json()
console.log(data.scene) // 변환된 장면 텍스트
```

### 응답

성공 시:
```json
{
  "scene": "당신은 길을 걷고있었습니다. 습한 공기가 당신을 덮칩니다...",
  "success": true
}
```

에러 시:
```json
{
  "error": "에러 메시지",
  "details": "상세 정보"
}
```






