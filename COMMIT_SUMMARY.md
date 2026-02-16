# Commit Summary

## 제목
Confession Flow V2 통합 및 Admin Strata 미리보기 추가

## 설명

### 주요 변경사항

#### 1. Confession Flow V2 통합
- **index.html**: confession-overlay 구조 변경
  - step-0 ~ step-result div 삭제
  - confession-flow div로 교체 (동적 플로우 렌더링)

- **css/index.css**: V2 Flow 스타일 추가
  - 기존 confession-step, confession-enter-btn, sensory-chips 등 삭제
  - flow-prompt, flow-chips, flow-text-input, flow-complete 등 V2 스타일 추가

- **js/index.js**: V2 Flow 엔진 구현
  - CHIP_DATA, BODY_LABELS, EMOTION_LABELS 상수 추가
  - CONFESSION_FLOW 배열 (13개 질문 정의)
  - flowState 객체 (데이터 수집)
  - renderPrompt(), answer(), onFlowComplete() 함수
  - extractOriginalVector(), extractVoidFlags() 함수
  - generateSceneFromRitual() 수정: flowState.data 사용, Edge Function 호출
  - renderSceneResult() 추가: 5장면 결과 표시
  - saveAndBury() 추가: DB 저장
  - startConfession(), endConfession() 수정: startFlow() 호출

- **js/app/bindEvents.js**: 불필요한 이벤트 바인딩 삭제
  - Step 0~5 관련 정적 이벤트 바인딩 제거 (V2는 동적 바인딩 사용)

#### 2. Edge Function V2 배포
- **supabase/functions/generate-scene-from-ritual/index.ts**: V2 버전으로 교체
  - 입력: flowData 구조 (하위 호환 convertLegacy 포함)
  - 출력: 5장면 JSON + originalVector + flowData + sealWord
  - 스트리밍 제거 → 일반 JSON 응답

#### 3. Admin 페이지 Strata 미리보기 추가
- **admin.html**: Archive 탭에 Strata 3D 지층 미리보기 섹션 추가
  - Three.js 및 strataView.js 스크립트 추가
  - Strata 뷰 컨테이너 및 HUD 요소 추가

- **js/admin.js**: loadStrataPreview() 함수 추가
  - window.showStrataView 사용하여 Strata 뷰 표시
  - admin 컨테이너에 맞게 canvas 크기 조정

#### 4. 버그 수정
- **js/index.js**: showEndScreen()에서 undefined.text 접근 오류 수정
  - lastScene.choices 안전 체크 추가

- **js/lib/repo.js**: sound_map 컬럼 없음 오류 임시 수정
  - sound_map 저장 부분 주석 처리 (마이그레이션 필요)

- **js/index.js**: generateSceneFromRitual, saveAndBury window 노출
  - 전역 함수로 접근 가능하도록 수정

### 플로우 변경

**이전 플로우:**
- Door open → Step 1~5 수동 입력 → generateSceneFromRitual() → 스트리밍 텍스트

**새 플로우:**
- Door open → startFlow()
- 13개 질문 대화 (동적 플로우)
- flowState.data 수집
- extractOriginalVector() → clientVector
- generateSceneFromRitual() → Edge Function V2
- 5장면 JSON + originalVector 반환
- renderSceneResult() → 결과 표시
- saveAndBury() → DB 저장

### 통계
- 10개 파일 변경
- +1707줄 추가, -725줄 삭제
- 순증가: +982줄

