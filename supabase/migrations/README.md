# Supabase 마이그레이션 가이드

## void_info 컬럼 추가 마이그레이션

### 문제
`admin.html` 실행 시 다음 에러가 발생:
```
Could not find the 'void_info' column of 'scenes' in the schema cache
```

### 해결 방법

#### 방법 1: Supabase Dashboard에서 직접 실행 (권장)

1. Supabase Dashboard 접속: https://supabase.com/dashboard
2. 프로젝트 선택
3. SQL Editor 메뉴로 이동
4. 아래 SQL을 실행:

```sql
-- Add void_info column to scenes table
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS void_info JSONB DEFAULT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

#### 방법 2: Supabase CLI 사용

```bash
# Supabase CLI가 설치되어 있다면
supabase db push

# 또는 마이그레이션 파일 직접 실행
supabase migration up
```

#### 방법 3: psql 또는 다른 PostgreSQL 클라이언트 사용

```bash
psql -h [your-db-host] -U postgres -d postgres -f supabase/migrations/20250101000000_add_void_info_to_scenes.sql
```

### 확인 방법

마이그레이션 실행 후, Supabase Dashboard의 Table Editor에서 `scenes` 테이블을 확인하여 `void_info` 컬럼이 추가되었는지 확인하세요.

### 주의사항

- `void_info` 컬럼은 **nullable**입니다 (NULL 허용)
- 기본값은 **NULL**입니다
- **NOT NULL 제약조건을 추가하지 마세요**
- 기존 데이터는 자동으로 NULL로 설정됩니다

### 스키마 정보

- **테이블**: `scenes`
- **컬럼**: `void_info`
- **타입**: `JSONB`
- **Nullable**: `true`
- **Default**: `NULL`

### 저장되는 데이터 형식

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

---

## original_emotion, original_reason, original_choice 컬럼 추가 마이그레이션

### 문제
`admin.html` 실행 시 다음 에러가 발생:
```
Could not find the 'original_emotion' column of 'scenes' in the schema cache
```

### 해결 방법

#### 방법 1: Supabase Dashboard에서 직접 실행 (권장)

1. Supabase Dashboard 접속: https://supabase.com/dashboard
2. 프로젝트 선택
3. SQL Editor 메뉴로 이동
4. 아래 SQL을 실행:

```sql
-- Add original_emotion, original_reason, and original_choice columns to scenes table
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS original_emotion JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_choice INTEGER DEFAULT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

#### 방법 2: Supabase CLI 사용

```bash
# Supabase CLI가 설치되어 있다면
supabase db push

# 또는 마이그레이션 파일 직접 실행
supabase migration up
```

#### 방법 3: psql 또는 다른 PostgreSQL 클라이언트 사용

```bash
psql -h [your-db-host] -U postgres -d postgres -f supabase/migrations/20250102000000_add_original_fields_to_scenes.sql
```

### 확인 방법

마이그레이션 실행 후, Supabase Dashboard의 Table Editor에서 `scenes` 테이블을 확인하여 다음 컬럼들이 추가되었는지 확인하세요:
- `original_emotion` (JSONB)
- `original_reason` (TEXT)
- `original_choice` (INTEGER)

### 주의사항

- 모든 컬럼은 **nullable**입니다 (NULL 허용)
- 기본값은 **NULL**입니다
- **NOT NULL 제약조건을 추가하지 마세요**
- 기존 데이터는 자동으로 NULL로 설정됩니다

### 스키마 정보

- **테이블**: `scenes`
- **컬럼들**:
  - `original_emotion`: JSONB 타입, nullable
  - `original_reason`: TEXT 타입, nullable
  - `original_choice`: INTEGER 타입, nullable

### 저장되는 데이터 형식

**original_emotion** (JSONB):
```json
{
  "fear": 0.7,
  "guilt": 0.3
}
```

**original_reason** (TEXT):
```
내가 살릴 수 있었는데...
```

**original_choice** (INTEGER):
```
0  (선택지 인덱스)
```


