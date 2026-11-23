# tools/layer-proofs — 층 모델 정리의 검산

문서: `docs/층모델_정리와_증명_v0.1-261123.md`

| 파일 | 무엇 |
|---|---|
| `verify_numeric.mjs` | 숫자 확인. 실제 엔진(`../sheaf-c2/sheaf.mjs`)에 무작위 자료와 UNDW-001 실 37가닥을 넣어 정리의 진술과 계산이 맞는지 본다. 증명이 아니다. `node tools/layer-proofs/verify_numeric.mjs` → PASS 24. |
| `lean/` | 기계 검산. Lean 4 + Mathlib 소스. `cd lean && lake exe cache get && lake build` (내려받기 약 8GB). `Audit.lean` 이 정리 21개의 공리 의존을 찍는다 — 표준 셋 이내, `sorryAx` 없음이어야 한다. |

`lean/.lake/` 는 빌드 산출물이라 저장소에 넣지 않는다(.gitignore).
