# tools/stage-bake — 걸음 밀도 지형 굽기 (datashader) + 구슬 굴리기 (mujoco) 확인 (2026-11-08)

사용자 질문 "위상 모형을 3D→2D로 바꾸며 픽셀 안에 들어오는 수로 모양을 그리는 컨셉이 되나"를 실제 자료로 확인한 기록.

- `ds_walks.py <undw_piece.json> <out.png>` — 37회차 걸음을 3D 위상 조각 좌표(x,y = 힘 배치, z = 장부 높이)에서 2D로 투영해 datashader `line` + `count`로 픽셀별 '밟힌 횟수'를 굽는다. 판 넷: 위에서 본 2D / 3D→2D 투영 / 픽셀별 정렬도 평균(색) / 관 표면 점구름 밀도(입체 모양). 부산물: `*_count_iso.npy`(밟힌 횟수 배열, 미커밋), `*_heightmap_iso.png`(높이맵).
  - 환경: Python 3.9 venv에 `pip install datashader pandas xarray pillow numpy` (datashader 0.17).
- `mj_balls.py <count_iso.npy> <out.png> [번짐]` — 밟힌 횟수 지도를 뒤집어(많이 밟힌 길 = 골짜기) MuJoCo hfield로 넣고 구슬 24개를 6초 굴린다. 번짐 0이면 골이 너무 좁아 구슬이 거의 안 움직임(2/24), 번짐 1.5면 16/24가 밟힌 골로 모임 → 밀도 지도는 침식 커널(번짐)을 거쳐야 끌개가 된다(W1 시뮬과 같은 결론).
  - 환경: Python 3.12 필요(mujoco 4.0). 이 컴퓨터는 3.9라 uv로 3.12를 스크래치에 받아 씀. `pip install mujoco numpy pillow`.
- 결론: 컨셉은 성립. 단 밀도 지도는 무대·아카이브의 그림이지 정의가 아님(고리·교차를 못 가름). 3D→2D 투영은 사용자가 정해야 함.
