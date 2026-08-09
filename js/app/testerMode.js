// js/app/testerMode.js
// 테스터 모드 스위치 (2026-08-02) — 데모 테스터에게 보여줄 최소 경로.
//
// 왜 별도 파일인가: opening.js(오프닝 흐름)와 bindEvents.js(오프닝을 띄울지 말지 판단)
// 두 곳이 같은 스위치를 봐야 하는데, 서로 import 하면 얽힌다. 스위치만 떼어둔다.
//
// 260809 사용자 결정: **기본값 = 켜짐.** 배포 주소를 맨몸으로 열어도 테스터 오프닝이 나온다.
// 끄기: ?tester=0 (그 브라우저에 저장) / 다시 켜기: ?tester=1
// 전체 설명·되돌리기 절차: docs/오프닝_테스터모드-260802.md

export const TESTER_FLAG_KEY = 'tem_tester_mode';
export const TESTER_MEMORY_CODE = 'UNDW-001';                          // 대표 기억 (사용자 결정 2026-08-02)
export const TESTER_MEMORY_ID = '1835926d-5acc-4d43-afd7-273ed853bca4'; // code 조회 실패 시 폴백

// 260806: 영어 사본 대표 기억. 260805 에 UNDW-001-EN 을 만들어 두고도 테스터 모드가
//   한국어판 코드 하나만 보고 있어, 언어를 영어로 고르고 들어와도 한국어판이 나왔다.
export const TESTER_MEMORY_CODE_EN = 'UNDW-001-EN';
export const TESTER_MEMORY_ID_EN = '3f8e2a71-9c4b-4d2e-8f6a-1b5c9d7e3a20';

/** 언어에 맞는 대표 기억의 { code, id }. 'en' 이 아니면 한국어판. */
export function testerMemoryFor(lang) {
  return String(lang || '').toLowerCase().slice(0, 2) === 'en'
    ? { code: TESTER_MEMORY_CODE_EN, id: TESTER_MEMORY_ID_EN }
    : { code: TESTER_MEMORY_CODE, id: TESTER_MEMORY_ID };
}

export function isTesterMode() {
  try {
    const q = new URLSearchParams(location.search).get('tester');
    if (q === '1' || q === 'true') {
      localStorage.setItem(TESTER_FLAG_KEY, '1');
      return true;
    }
    if (q === '0' || q === 'false') {
      // 260809 기본값 ON 전환에 맞춰 "끔"도 저장한다 (예전엔 키 삭제 = 기본 꺼짐이었음).
      localStorage.setItem(TESTER_FLAG_KEY, '0');
      return false;
    }
    // 저장값 없으면 켜짐 — 명시적으로 '0'(?tester=0)을 저장한 브라우저만 풀버전.
    return localStorage.getItem(TESTER_FLAG_KEY) !== '0';
  } catch (_) {
    return true;
  }
}
