// js/app/testerMode.js
// 테스터 모드 스위치 (2026-08-02) — 데모 테스터에게 보여줄 최소 경로.
//
// 왜 별도 파일인가: opening.js(오프닝 흐름)와 bindEvents.js(오프닝을 띄울지 말지 판단)
// 두 곳이 같은 스위치를 봐야 하는데, 서로 import 하면 얽힌다. 스위치만 떼어둔다.
//
// 켜기: ?tester=1  /  끄기: ?tester=0  (한 번 켜면 그 브라우저에 저장)
// 전체 설명·되돌리기 절차: docs/오프닝_테스터모드-260802.md

export const TESTER_FLAG_KEY = 'tem_tester_mode';
export const TESTER_MEMORY_CODE = 'UNDW-001';                          // 대표 기억 (사용자 결정 2026-08-02)
export const TESTER_MEMORY_ID = '1835926d-5acc-4d43-afd7-273ed853bca4'; // code 조회 실패 시 폴백

export function isTesterMode() {
  try {
    const q = new URLSearchParams(location.search).get('tester');
    if (q === '1' || q === 'true') {
      localStorage.setItem(TESTER_FLAG_KEY, '1');
      return true;
    }
    if (q === '0' || q === 'false') {
      localStorage.removeItem(TESTER_FLAG_KEY);
      return false;
    }
    return localStorage.getItem(TESTER_FLAG_KEY) === '1';
  } catch (_) {
    return false;
  }
}
