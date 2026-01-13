'use client';

import { useState, useCallback } from 'react';

interface TouchState {
  left: boolean;
  right: boolean;
  action: boolean;
}

export function useTouchInput() {
  const [touchState, setTouchState] = useState<TouchState>({
    left: false,
    right: false,
    action: false,
  });

  const handleLeftStart = useCallback(() => {
    setTouchState((prev) => ({ ...prev, left: true }));
  }, []);

  const handleLeftEnd = useCallback(() => {
    setTouchState((prev) => ({ ...prev, left: false }));
  }, []);

  const handleRightStart = useCallback(() => {
    setTouchState((prev) => ({ ...prev, right: true }));
  }, []);

  const handleRightEnd = useCallback(() => {
    setTouchState((prev) => ({ ...prev, right: false }));
  }, []);

  const handleAction = useCallback(() => {
    setTouchState((prev) => ({ ...prev, action: true }));
    // Auto-release after brief moment
    setTimeout(() => {
      setTouchState((prev) => ({ ...prev, action: false }));
    }, 100);
  }, []);

  return {
    touchState,
    handlers: {
      handleLeftStart,
      handleLeftEnd,
      handleRightStart,
      handleRightEnd,
      handleAction,
    },
  };
}
