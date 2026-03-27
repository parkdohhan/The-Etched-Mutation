# Contamination vNext Notes

**문서 목적:** MVP에서 제외한 확장 항목 격리 보관  
**작성일:** 2026-03-27  
**상태:** 보류 아이디어 / 데이터 축적 후 검토

---

## 1) 포함 범위

이 문서는 아래 항목만 다룬다.

- heterogeneity 관련 구조
- Welford 분산 추적
- Stage 2(해석 병기)
- Stage 혼합 비율 렌더링
- recombination readiness
- 장기 시간 감쇠/배치 재계산
- contamination genealogy / memory genetics 확장
- 플레이 데이터 축적 후 튜닝 후보

---

## 2) heterogeneity / Welford

후보 필드:

- `cont_heterogeneity`
- `_cont_align_mean`
- `_cont_align_m2`

후보 계산:

- alignment 분산을 온라인( Welford )으로 누적
- 분산을 0~1 범위로 스케일하여 변이성 신호로 사용

보류 이유:

- MVP에서 drift/fixation만으로도 체감 루프를 만들 수 있음
- 초기 데이터가 적으면 분산 신호가 불안정함

---

## 3) Stage 2(해석 병기)

개념:

- 복수 해석이 동시 병기되는 상태

후보 지표:

- heterogeneity
- depth
- 해석 갈래 수

보류 이유:

- MVP의 dominant stage 단순성 유지가 우선
- UI/텍스트/사운드 모두 추가 설계 필요

---

## 4) Stage 혼합 비율

후보 구조:

```javascript
raw_1 = divergence * (1 - convergence)
raw_2 = heterogeneity * depthFactor
raw_3 = convergence * (1 - heterogeneity)
```

정규화 후 `stage_1/2/3` 동시 전달 가능.

보류 이유:

- 프론트 복잡도 급증
- 현재 MVP의 구현/튜닝 비용 대비 효율 낮음

---

## 5) recombination readiness

후보 함수:

```javascript
isRecombinationReady(memory) {
  return memory.cont_heterogeneity >= thresholdH
      && memory.cont_depth >= thresholdD;
}
```

보류 이유:

- recombination 자체가 vNext 기능
- threshold는 실데이터 분포 확인 후 결정 필요

---

## 6) 시간 감쇠 / 배치 재계산

후보:

- 야간 배치로 contamination 재스케일
- 오래된 세션 가중치 자동 감소

보류 이유:

- MVP는 세션 종료 증분 누적만으로 충분
- 운영 규모 증가 전까지는 비용 대비 효과 낮음

---

## 7) genealogy / memory genetics 확장

확장 후보:

- contamination 계보 추적
- 기억군 간 교차 영향 모델
- 기억유전학 6연산의 전면 반영

보류 이유:

- 이론 반영 범위가 크고 API/데이터 모델 재설계 필요

---

## 8) 데이터 축적 후 검토 항목

- 초기 1~2세션에서 drift 상승 속도
- stage 전환 빈도/진동 여부
- threshold 재튜닝 필요성
- stage 혼합 렌더링 도입 시점
- Stage 2 체감 설계 우선순위

---

## 9) 메모

- MVP 문서에는 본 문서 항목을 다시 포함하지 않는다.
- Presentation 문서에도 계산/확장 아이디어를 넣지 않는다.
