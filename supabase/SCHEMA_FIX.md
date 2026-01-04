# Supabase void_info 컬럼 추가 가이드

## 문제
`admin.html` 실행 시 다음 에러 발생:
```
Could not find the 'void_info' column of 'scenes' in the schema cache
```

## 해결 방법

### 방법 1: Supabase Dashboard에서 직접 실행 (가장 간단)

1. **Supabase Dashboard 접속**
   - https://supabase.com/dashboard
   - 프로젝트 선택

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 클릭

3. **아래 SQL 실행**:

```sql
-- scenes 테이블에 void_info 컬럼 추가
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS void_info JSONB DEFAULT NULL;

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
```

4. **확인**
   - 왼쪽 메뉴에서 "Table Editor" 클릭
   - `scenes` 테이블 선택
   - 컬럼 목록에서 `void_info` 확인

### 방법 2: 스키마 확인 후 추가

더 안전한 방법으로, 먼저 현재 상태를 확인하고 추가:

1. **SQL Editor에서 실행**:

```sql
-- 현재 scenes 테이블의 모든 컬럼 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'scenes'
ORDER BY ordinal_position;
```

2. **void_info가 없으면** 위의 방법 1 실행

### 방법 3: 파일 사용

프로젝트에 포함된 SQL 파일 사용:

1. `supabase/add_void_info_simple.sql` 파일 내용을 복사
2. Supabase Dashboard → SQL Editor에 붙여넣기
3. 실행

## 확인 방법

### 1. Table Editor에서 확인
- Supabase Dashboard → Table Editor → `scenes` 테이블
- 컬럼 목록에 `void_info` (JSONB) 확인

### 2. SQL로 확인
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scenes' 
AND column_name = 'void_info';
```

결과가 나오면 성공!

### 3. admin.html에서 테스트
- `admin.html` 열기
- 기억 편집 → 저장 시도
- 콘솔에서 에러가 사라졌는지 확인

## 중요 사항

- ✅ `void_info`는 **nullable** (NULL 허용)
- ✅ 기본값은 **NULL**
- ✅ 타입은 **JSONB**
- ❌ **NOT NULL 제약조건 추가하지 마세요**
- ❌ 기본값을 다른 값으로 설정하지 마세요

## 저장되는 데이터 형식

```json
{
  "sceneVoid": false,
  "emotionVoid": false,
  "reasonVoid": false,
  "voidLevel": "low"
}
```

또는

```json
{
  "sceneVoid": true,
  "emotionVoid": true,
  "reasonVoid": false,
  "voidLevel": "high"
}
```

## 문제 해결

### 에러가 계속 발생하는 경우

1. **스키마 캐시 리로드 확인**
   - `NOTIFY pgrst, 'reload schema';` 실행했는지 확인
   - 몇 분 기다린 후 다시 시도

2. **브라우저 캐시 클리어**
   - `admin.html` 새로고침 (Ctrl+F5)
   - 브라우저 개발자 도구 → Network 탭 → "Disable cache" 체크

3. **Supabase 프로젝트 재연결**
   - Supabase Dashboard에서 프로젝트 상태 확인
   - API 키가 올바른지 확인


