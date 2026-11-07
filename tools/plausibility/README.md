# tools/plausibility — 개연성 P(i,k) 백테스트 (읽기 전용)

정본 = `docs/실험/개연성_사전등록_v1-261107.md`. 이 폴더는 그 문서를 코드로 옮긴 것이다. **식·영모형·판정 기준은 문서가 정하고, 코드는 따라간다.** 결과를 보고 코드를 고치지 않는다.

## 준비물 (다른 컴퓨터에서도 같음)
1. Node 20 이상 (`node --version`).
2. `tools/persona-sim/node_modules` — 없으면 `cd tools/persona-sim && npm install` (Supabase 클라이언트만 쓴다).
3. `tools/persona-sim/.env` — 두 줄: `SUPABASE_URL=...`, `SUPABASE_SERVICE_KEY=...` (gitignore. 없으면 사용자에게 이 파일만 요청).
4. 경로는 전부 이 폴더 기준 상대 경로라 저장소를 어디에 두든 된다.

## 순서 ("실험개시")
```
node --test tools/plausibility/test/models.test.mjs                       # 가짜 자료로 코드 검증. 전부 통과해야 다음
node tools/plausibility/pull.mjs                            # DB 읽기만 → out/raw-<날짜>.json (발화 원문 0자)
node tools/plausibility/run_backtest.mjs --raw tools/plausibility/out/raw-<날짜>.json
#  → out/metrics-<날짜>.json + docs/실험/개연성_백테스트_결과-<날짜>.md
```
선택 인자: `--reps 1000 --splits 500 --seed 261107 --rho 0.6` (기본값 = 사전 등록값. 바꾸면 사전 등록 밖 실행이므로 결과 문서에 표시된다 — 기본값으로 돌릴 것).

## 파일
- `lib/vec.mjs` 벡터 산술 · `lib/models.mjs` M1·M2·M3 + N1~N4·N6 · `lib/old_engine_replay.mjs` 옛 엔진 접근 집합 재생(play-test 규칙 사본, 판단 수학은 `js/shared/math.js` import) · `lib/metrics.mjs` 백분위·1등률·N5 교체·절반 안정성
- `pull.mjs` 추출 · `run_backtest.mjs` 실행기(사전 등록 상수 `PREREG`) · `test/` 가짜 자료 시험
- `out/raw-*.json` 은 커밋하지 않는다(.gitignore). `out/metrics-*.json` 과 결과 md 는 커밋.

## 끝나면
결과 md의 "0. 판정"을 사전 등록 문서 §10에 요약 추기 → 커밋 `실험: 개연성 백테스트 v1 결과 (<날짜>)` → 푸시 → 사용자에게 표 한 장 + 판정 한 줄 + 충실도 세 줄.
