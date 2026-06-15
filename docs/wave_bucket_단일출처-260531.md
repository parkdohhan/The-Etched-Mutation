# wave bucket 단일 출처 정합성 수정 (2026-05-31)

## 문제 (발견)

PLAY 화면 중앙 파동(wave)이 별이엔진의 `alignment_bucket`을 무시하고
**플레이어가 타이핑한 감정 단어 룩업**으로 색을 정하고 있었다.

- 엔진의 진짜 bucket(`getBucket`, math.js)은 NPC 대사 · 시스템 메시지 ·
  사운드스케이프(`setBucket`)로는 정확히 흘렀으나, **파동에만 도달하지 않았다.**
- 결과: 같은 턴에 NPC/소리는 "HIGH(동기화 안정)"라는데 파동은 LOW(빨간 글리치)로
  부서지는 자기모순 가능.

### 부수 문제
1. **원칙 #3 위반** — 타이핑 룩업이 `numbness/isolation` 단어 하나로 즉시
   `FIXATED`(고착 비네트)를 띄움. FIXATED는 다중-턴 누적 신호(`fixLevel>=0.85`)여야 함.
2. **임계값 4중 분기** — 같은 HIGH/MID/LOW가 파일마다 다른 점수에서 켜짐:
   - `math.js getBucket` (정본): HIGH≥0.50 / LOW<0.10 (+히스테리시스 +FIXATED)
   - `index.js getAlignmentLevel`: HIGH≥0.55 / MID≥0.35
   - `index.js` strata inline: HIGH≥0.55 / LOW<0.35
   - `expInterview.js fallbackAlignment`: HIGH≥0.55 / LOW<0.30
3. `index.js startWaveAnimation`의 FIXATED 파동 렌더 분기는 `getAlignmentLevel`이
   FIXATED를 못 내서 사실상 죽은 코드였음.

## 수정 (적용)

| 파일 | 변경 |
|---|---|
| `js/app/archive.js` (applyEngineResult) | 제출 시 `updateWaveBucket(newBucket)` 추가 — 엔진 bucket으로 파동 확정 |
| `js/app/archive.js` (타이핑 oninput 룩업) | `numbness/isolation`을 FIXATED→MID로 이동. 미리보기는 HIGH/MID/LOW만 |
| `js/index.js getAlignmentLevel` | 본체를 `getBucket(alignment)`로 교체 (정본 단일 출처) |
| `js/index.js` strata inline bucket | `getBucket(avgAlignment)`로 교체 |

## 결과

- 제출 순간 파동 = NPC = 소리 = 엔진 bucket (정합).
- 타이핑 중에는 단어 기반 라이브 미리보기 유지(HIGH/MID/LOW), FIXATED는 엔진만 점등.
- HIGH/MID/LOW 임계값은 `getBucket` 한 곳으로 수렴.

## 알려진 미해결 (의도적 보류)

- `js/expInterview.js fallbackAlignment`(~650행)의 0.55/0.30 임계값은 **그대로 둠.**
  이 함수는 엔진의 alignment(level×shape×void 곱)와 **다른 양(raw 코사인 유사도)**을
  계산하므로, 정본 임계값을 강제하면 오히려 오분류 위험. 별도 fallback 경로로 유지.
