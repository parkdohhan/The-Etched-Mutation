// js/core/store.js
// Simple Store - global state manage

/**
 * createStore - 간단 state manage 스토어 create
 * 
 * @param {Object} initialState - 초기 state object
 * @returns {Object} { getState, setState, subscribe }
 */
export function createStore(initialState = {}) {
  let state = { ...initialState };
  let listeners = [];

  /**
 * 현재 state return
 * @returns {Object} 현재 state copy본
   */
  function getState() {
    return { ...state };
  }

  /**
 * state 업데 트 (shallow merge)
 * @param {Object} partial - 업데 트 부분 state
   */
  function setState(partial) {
    if (!partial || typeof partial !== 'object') {
      console.warn('[Store] setState: partial must be an object');
      return;
    }
    
    const prevState = { ...state };
    state = { ...state, ...partial };
    
 // subscribe자들 게 변경 notification
    listeners.forEach(listener => {
      try {
        listener(state, prevState);
      } catch (error) {
        console.error('[Store] Listener error:', error);
      }
    });
  }

  /**
 * state 변경 subscribe
 * @param {Function} fn - state 변경 시 call될 function (newState, prevState) => {}
 * @returns {Function} unsubscribe function
   */
  function subscribe(fn) {
    if (typeof fn !== 'function') {
      console.warn('[Store] subscribe: fn must be a function');
      return () => {};
    }
    
    listeners.push(fn);
    
 // unsubscribe function return
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
