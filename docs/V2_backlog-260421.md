# TEM V2 백로그

Lumen 2026 이후 작업 리스트.
Lumen V1 스코프 밖으로 연기된 항목들이 여기 쌓인다.
새 아이디어는 발생 시점에 날짜와 함께 추가.

---

## 카테고리 1: 음성·청각 V2
- TTS 자기 목소리 유령 (Web Speech API)
  - 관객 첫 입력 → 귀환 중 유령 whisper에 mix-in
  - 리스크: 한국어 voice 품질 편차
  - 대안: 저장된 generic whisper + pitch shift
- Reverb (ConvolverNode)
- 숨소리
- 유령 근접 whisper 3 레이어 (현재 depth drone 1 레이어만)
- 지형 오염 noise floor 확장

## 카테고리 2: 이동·오염 확장
- 오염 3축 중 convergence / divergence 이동 제어
  - 현재 Plan B는 연출에만 사용
  - V2에서 이동 제어 실험
- 화면 가장자리 왜곡 shader

## 카테고리 3: Admin UI 확장
- Canvas 탭 지형 모드 (동심원 overlay)
- 운영 탭 plays 필터 (귀환/미귀환/void)
- 페르소나 재생 시 공간 궤적 선 렌더
- 유령 응결점 마커 + 임계값 게이지
- layer_radii 슬라이더
- center_void 좌표 입력

## 카테고리 4: 이본론·집합 구조
- trajectory_bridges 수동 생성/편집
- 개인 아바타 유령 (공명 도달자의 궤적이 다음 세션 유령 재료로)
- ghost_presets DB화 (현재 static 상수)

## 카테고리 5: 연출 레이어
- 연출 레이어 L (포트 경향성)
- 연출 레이어 M (유령 경로)
- 직연출 Step 2 이후

## 카테고리 6: 이론·논문
- 기억유전학 v0.4 확장
- 집단유전학 논문 Track B 분리
- Mnemonic Genetics ↔ CompTIES 비교 분석 심화

## 카테고리 7: 레거시 정리
- SoundscapeBeta + sound_map 전면 제거 (17파일)
- MM23L 자유 키 감정 모델 재설계
- memories.original_vector UI 재설계

## 카테고리 8: 실험·검증
- 실제 피험자 n ≥ 30 실험 (IEEE TAC 수준)
- 음성 V2 (실시간 음성 톤·숨·침묵 감지)
- Tone.js 도입
- Three.js 셰이더 강화
- GSAP 본격 도입

---

## 작업 중 추가된 아이디어

### 2026-04-__
(여기부터 작업하면서 떠오르는 것들이 쌓임)
