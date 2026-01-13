'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MAP_CONFIG, MAP_NODES, MapNode } from '@/data/mapConfig';

interface GameState {
  playerX: number;
  cameraX: number;
  activeNode: MapNode | null;
  isMoving: boolean;
  facingRight: boolean;
}

interface UseGameLoopProps {
  keys: {
    left: boolean;
    right: boolean;
    up: boolean;
    enter: boolean;
    shift: boolean;
  };
  onEnterPortal: (route: string) => void;
  onLoopTrigger: () => void;
  reducedMotion: boolean;
}

export function useGameLoop({
  keys,
  onEnterPortal,
  onLoopTrigger,
  reducedMotion,
}: UseGameLoopProps) {
  const [gameState, setGameState] = useState<GameState>({
    playerX: 300,
    cameraX: 0,
    activeNode: null,
    isMoving: false,
    facingRight: true,
  });

  const rafRef = useRef<number | null>(null);
  const lastEnterRef = useRef(false);
  const viewportWidthRef = useRef(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  // Handle viewport resize
  useEffect(() => {
    const handleResize = () => {
      viewportWidthRef.current = window.innerWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main game loop
  useEffect(() => {
    const tick = () => {
      setGameState((prev) => {
        let { playerX, cameraX, facingRight } = prev;
        const { PLAYER_SPEED, PLAYER_RUN_MULTIPLIER, WORLD_WIDTH, LERP_FACTOR, TRIGGER_RADIUS, LOOP_THRESHOLD } = MAP_CONFIG;

        // Calculate movement
        let dx = 0;
        if (keys.left) dx -= 1;
        if (keys.right) dx += 1;

        const speed = keys.shift
          ? PLAYER_SPEED * PLAYER_RUN_MULTIPLIER
          : PLAYER_SPEED;

        const isMoving = dx !== 0;
        
        if (dx !== 0) {
          facingRight = dx > 0;
        }

        // Update player position
        playerX += dx * speed;

        // ============================================
        // CUSTOMIZATION POINT: Loop Detection
        // Modify this section to change loop behavior
        // ============================================
        // Check for loop trigger (reaching end of map)
        if (playerX > WORLD_WIDTH - LOOP_THRESHOLD) {
          // Wrap around to start
          playerX = LOOP_THRESHOLD + 50;
          onLoopTrigger();
        } else if (playerX < LOOP_THRESHOLD) {
          // Wrap around to end (going backwards)
          playerX = WORLD_WIDTH - LOOP_THRESHOLD - 50;
          onLoopTrigger();
        }

        // Clamp player position
        playerX = Math.max(50, Math.min(WORLD_WIDTH - 50, playerX));

        // Update camera with lerp
        const viewportWidth = viewportWidthRef.current;
        const targetCameraX = playerX - viewportWidth / 2;
        const clampedTarget = Math.max(
          0,
          Math.min(WORLD_WIDTH - viewportWidth, targetCameraX)
        );

        if (reducedMotion) {
          cameraX = clampedTarget;
        } else {
          cameraX = cameraX + (clampedTarget - cameraX) * LERP_FACTOR;
        }

        // Find active node (portal in range)
        let activeNode: MapNode | null = null;
        for (const node of MAP_NODES) {
          if (node.type === 'portal' || node.type === 'loop-gate') {
            const nodeCenter = node.x + node.width / 2;
            const distance = Math.abs(playerX - nodeCenter);
            if (distance < TRIGGER_RADIUS) {
              activeNode = node;
              break;
            }
          }
        }

        return {
          playerX,
          cameraX,
          activeNode,
          isMoving,
          facingRight,
        };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [keys, onLoopTrigger, reducedMotion]);

  // Handle portal entry
  useEffect(() => {
    const enterPressed = keys.enter || keys.up;
    
    // Only trigger on key down, not hold
    if (enterPressed && !lastEnterRef.current && gameState.activeNode?.route) {
      onEnterPortal(gameState.activeNode.route);
    }
    
    lastEnterRef.current = enterPressed;
  }, [keys.enter, keys.up, gameState.activeNode, onEnterPortal]);

  return gameState;
}
