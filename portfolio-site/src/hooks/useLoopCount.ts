'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'portfolio_loop_count';

export function useLoopCount() {
  const [loopCount, setLoopCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
          setLoopCount(parsed);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage when loopCount changes
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, loopCount.toString());
    }
  }, [loopCount, isLoaded]);

  const incrementLoop = useCallback(() => {
    setLoopCount((prev) => prev + 1);
  }, []);

  const resetLoop = useCallback(() => {
    setLoopCount(0);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '0');
    }
  }, []);

  return {
    loopCount,
    incrementLoop,
    resetLoop,
    isLoaded,
  };
}
