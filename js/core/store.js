// js/core/store.js
// Simple Store - 전역 상태 관리

/**
 * createStore - 간단한 상태 관리 스토어 생성
 * 
 * @param {Object} initialState - 초기 상태 객체
 * @returns {Object} { getState, setState, subscribe }
 */
export function createStore(initialState = {}) {
  let state = { ...initialState };
  let listeners = [];

  /**
   * 현재 상태 반환
   * @returns {Object} 현재 상태의 복사본
   */
  function getState() {
    return { ...state };
  }

  /**
   * 상태 업데이트 (shallow merge)
   * @param {Object} partial - 업데이트할 부분 상태
   */
  function setState(partial) {
    if (!partial || typeof partial !== 'object') {
      console.warn('[Store] setState: partial must be an object');
      return;
    }
    
    const prevState = { ...state };
    state = { ...state, ...partial };
    
    // 구독자들에게 변경 알림
    listeners.forEach(listener => {
      try {
        listener(state, prevState);
      } catch (error) {
        console.error('[Store] Listener error:', error);
      }
    });
  }

  /**
   * 상태 변경 구독
   * @param {Function} fn - 상태 변경 시 호출될 함수 (newState, prevState) => {}
   * @returns {Function} unsubscribe 함수
   */
  function subscribe(fn) {
    if (typeof fn !== 'function') {
      console.warn('[Store] subscribe: fn must be a function');
      return () => {};
    }
    
    listeners.push(fn);
    
    // unsubscribe 함수 반환
    return function unsubscribe() {
      const index = listeners.indexOf(fn);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  return {
    getState,
    setState,
    subscribe
  };
}
