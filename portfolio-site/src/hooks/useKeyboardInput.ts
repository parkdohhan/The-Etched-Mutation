'use client';

import { useState, useEffect, useCallback } from 'react';

interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  enter: boolean;
  shift: boolean;
  escape: boolean;
}

export function useKeyboardInput() {
  const [keys, setKeys] = useState<KeyState>({
    left: false,
    right: false,
    up: false,
    enter: false,
    shift: false,
    escape: false,
  });

  const [hasInteracted, setHasInteracted] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Mark first interaction for audio unlock
    if (!hasInteracted) {
      setHasInteracted(true);
    }

    const key = e.key.toLowerCase();
    
    // Prevent default for game controls
    if (['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', 'enter', ' '].includes(key)) {
      e.preventDefault();
    }

    setKeys((prev) => {
      const next = { ...prev };
      
      if (key === 'arrowleft' || key === 'a') next.left = true;
      if (key === 'arrowright' || key === 'd') next.right = true;
      if (key === 'arrowup' || key === 'w') next.up = true;
      if (key === 'enter' || key === ' ') next.enter = true;
      if (key === 'shift') next.shift = true;
      if (key === 'escape') next.escape = true;
      
      return next;
    });
  }, [hasInteracted]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();

    setKeys((prev) => {
      const next = { ...prev };
      
      if (key === 'arrowleft' || key === 'a') next.left = false;
      if (key === 'arrowright' || key === 'd') next.right = false;
      if (key === 'arrowup' || key === 'w') next.up = false;
      if (key === 'enter' || key === ' ') next.enter = false;
      if (key === 'shift') next.shift = false;
      if (key === 'escape') next.escape = false;
      
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Reset enter key after single press detection
  const consumeEnter = useCallback(() => {
    setKeys((prev) => ({ ...prev, enter: false }));
  }, []);

  const consumeEscape = useCallback(() => {
    setKeys((prev) => ({ ...prev, escape: false }));
  }, []);

  return {
    keys,
    hasInteracted,
    consumeEnter,
    consumeEscape,
  };
}
