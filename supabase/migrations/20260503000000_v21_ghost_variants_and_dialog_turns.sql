-- V2.1 SCOPE §4 V2-1: 유령 변주 풀 + 멀티턴 대화 누적
-- See: docs/LUMEN_DEMO_SCOPE-260429.md §0-A, §15-1
--
-- 추가 항목:
--   ghost_variants                 — memory_id 별 유령 drift 변주 + speciation 시드 풀
--   plays.dialog_turns             — 멀티턴 대화 누적 (turn 별 raw_text + fingerprint 스냅샷)
--
-- SeekerMatchEngine(매칭 엔진) 정합:
--   ghost_variants 컬럼 (emotion_vec / attribution / core_fear / modality / role / motif_tags)
--   = ghostVariantToCard 어댑터 기대 키. 작업 0 산출물 (js/core/SeekerMatchEngine.js).
--
-- memories 측 카드 슬롯 신규는 V3 이월 (V2.1 SCOPE 외). 기존 original_vector + motif_tags 만 의지.
-- V2.1 의 카드 매칭 정밀도는 *유령 변주 단위* 에서만 풀 발휘 — 작품 명제 (§15-1) 정합.

-- ============================================================================
-- ghost_variants
-- ============================================================================

CREATE TABLE IF NOT EXISTS ghost_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 소속
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- 분류
  kind TEXT NOT NULL DEFAULT 'drift'
    CHECK (kind IN ('drift', 'speciation')),
    -- drift = 같은 유령의 발화 변주 (점돌연변이). § 15-1 층1.
    -- speciation = 다른 path 가 만든 새 유령 시드 (분기). § 15-1 층2.

  parent_variant_id UUID REFERENCES ghost_variants(id) ON DELETE SET NULL,
    -- speciation 계보. parent = 분기 직전 유령. NULL = admin 시드 root 또는 drift.

  -- 매칭 카드 (SeekerMatchEngine.ghostVariantToCard 어댑터 입력)
  emotion_vec JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution TEXT CHECK (attribution IS NULL OR attribution IN
    ('self_blame', 'other_blame', 'fate_blame', 'unknown')),
  core_fear TEXT CHECK (core_fear IS NULL OR core_fear IN
    ('abandonment', 'death', 'rejection', 'failure', 'none')),
  modality TEXT CHECK (modality IS NULL OR modality IN
    ('visual', 'olfactory', 'auditory', 'somatic', 'narrative')),
  role TEXT CHECK (role IS NULL OR role IN
    ('actor', 'observer', 'victim')),
  motif_tags TEXT[] NOT NULL DEFAULT '{}',

  -- 콘텐츠
  utterance TEXT NOT NULL CHECK (char_length(utterance) BETWEEN 1 AND 1000),
    -- 변주 발화 본문. drift = a 변주 풀 sampling. speciation = 새 유령 시드.
  pose TEXT,
    -- 자세 메타 (선택). 예: 'crouched', 'turned_away'. V2-6 drift 발화 시스템에서 활용.

  -- 출처
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- admin = profiles.role='admin' 작가. anon speciation 자동 생성 = NULL.
  is_seed BOOLEAN NOT NULL DEFAULT true,
    -- true = V2-2 admin 도구 시드. false = V2-4 분기 트리거 자동 생성 (플레이어 contribution).

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ghost_variants IS
  'V2.1 §15-1 유령 단위 분기 풀. memory_id 별 drift 변주 + speciation 시드. SeekerMatchEngine.pickGhostVariant 입력.';
COMMENT ON COLUMN ghost_variants.kind IS
  'drift = 같은 유령 발화 변주. speciation = 다른 path 가 만든 새 유령 (V2-4 분기 트리거 결과).';
COMMENT ON COLUMN ghost_variants.parent_variant_id IS
  'speciation 계보 추적. NULL = admin 시드 root 또는 drift.';
COMMENT ON COLUMN ghost_variants.emotion_vec IS
  '감정 12축 0~1 점수. SeekerMatchEngine.emotionCosine 입력.';
COMMENT ON COLUMN ghost_variants.is_seed IS
  'true = V2-2 admin 도구 시드 입력. false = V2-4 분기 트리거 자동 생성 (β 메커니즘 — 후속 플레이어가 만남).';
COMMENT ON COLUMN ghost_variants.utterance IS
  '변주 발화 본문 1~1000자. drift 풀에서 sampling 하거나 speciation 새 유령 시드 발화.';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ghost_variants_memory
  ON ghost_variants (memory_id);
CREATE INDEX IF NOT EXISTS idx_ghost_variants_memory_kind
  ON ghost_variants (memory_id, kind);
CREATE INDEX IF NOT EXISTS idx_ghost_variants_parent
  ON ghost_variants (parent_variant_id)
  WHERE parent_variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghost_variants_motif
  ON ghost_variants USING GIN (motif_tags);
CREATE INDEX IF NOT EXISTS idx_ghost_variants_created_at
  ON ghost_variants (created_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE ghost_variants ENABLE ROW LEVEL SECURITY;

-- Read: anyone (anon + auth) can read all variants.
-- 게임 진입 시 클라이언트 매칭 (SeekerMatchEngine.pickGhostVariant) 에 풀 필요.
CREATE POLICY "Ghost variants readable by anyone"
  ON ghost_variants FOR SELECT
  USING (true);

-- Insert: admins only.
-- V2-4 분기 트리거의 anon 플레이어 자동 생성 (is_seed=false) 은
-- edge function 이 service_role key 로 우회. 직접 insert 경로 안 만듦.
CREATE POLICY "Admins can insert ghost variants"
  ON ghost_variants FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

-- Update: admins only.
CREATE POLICY "Admins can update ghost variants"
  ON ghost_variants FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

-- Delete: admins only.
CREATE POLICY "Admins can delete ghost variants"
  ON ghost_variants FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

-- ============================================================================
-- plays.dialog_turns
-- ============================================================================

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS dialog_turns JSONB DEFAULT '[]'::jsonb;

ALTER TABLE plays
  DROP CONSTRAINT IF EXISTS plays_dialog_turns_is_array_chk;
ALTER TABLE plays
  ADD CONSTRAINT plays_dialog_turns_is_array_chk
  CHECK (jsonb_typeof(dialog_turns) = 'array');

COMMENT ON COLUMN plays.dialog_turns IS
  'V2.1 §4 V2-1: 멀티턴 대화 누적. 각 turn = {turn:int, raw_text:string, fingerprint:object, ts:timestamptz}. 회차 끝 fingerprint 가 SeekerMatchEngine.pickTopMemory 입력.';

-- ============================================================================
NOTIFY pgrst, 'reload schema';
