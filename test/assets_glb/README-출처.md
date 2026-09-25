# test/assets_glb — 조각 B 방 규모 GLB 표본 (2026-09-23)

`test/glb-room-test.html` 이 읽는 다운로드 산물. **커밋 금지 · .gitignore 는 손대지 않음** (git 에 안 올리고 이 폴더째 두기만 한다. 지우면 페이지 안 `표본` 드롭다운의 셋이 로드 실패로 뜨고, 합성 방만 남는다).

장치(260923 검토 반영): `.gitignore` 대신 저장소 로컬 제외 파일 `.git/info/exclude` 에 `test/assets_glb/*.glb` 한 줄을 넣어 두었다 — `git add -A` 를 해도 GLB 셋은 안 실린다(이 README 만 추적 대상). 저장소를 새로 클론하면 그 줄은 따라오지 않으니, 커밋 전 `git status` 로 `test/assets_glb` 가 안 뜨는지 확인한다.

| 파일 | 크기 | 출처 | 라이선스 | 내용 |
|---|---|---|---|---|
| LittlestTokyo.glb | 3.94 MB | https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/LittlestTokyo.glb | CC-BY 4.0 (Glen Fox, Sketchfab) | 건물 한 채 디오라마. KHR_draco_mesh_compression **필수**. 메시 71 · 삼각형 약 14.2만 · 텍스처 4 · 애니 1. 파일 단위 cm 급(545 × 434 × 552) |
| LightsPunctualLamp.glb | 4.14 MB | https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb | Khronos glTF-Sample-Assets (Wayfair 제공, CC-BY 4.0) | KHR_lights_punctual 점광 5개(1.5~180 cd) + KHR_materials_transmission. 메시 3 · 삼각형 6천 · 텍스처 7. 1.13 × 1.86 × 0.72 m |
| VC.glb | 2.94 MB | https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/VC/glTF-Binary/VC.glb | CC-BY 4.0 (Virtual City, COLLADA2GLTF) | 확장 0. 메시 135(노드 234) · 재질 167 · 텍스처 28 · 애니 1. 하늘 상자 + 도시. 166 × 98 × 169 단위 |

내려받기(다시 필요하면):

```
curl -L -o LittlestTokyo.glb      https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/LittlestTokyo.glb
curl -L -o LightsPunctualLamp.glb https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb
curl -L -o VC.glb                 https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/VC/glTF-Binary/VC.glb
```

진짜 "실내 방" 공개 표본은 못 구했다(Khronos Sponza 는 glTF 분리형 60MB 초과, ABeautifulGame 은 jsdelivr 403). 그래서 페이지 안에 **합성 방**(GLTFExporter 왕복: 바닥·벽 3·사물 6·점광 2·텍스처 1)을 넷째 표본으로 넣었다.
