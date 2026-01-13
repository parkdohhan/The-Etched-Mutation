'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MAP_NODES } from '@/data/mapConfig';
import { useLoopCount } from '@/hooks/useLoopCount';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { useTouchInput } from '@/hooks/useTouchInput';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGameLoop } from '@/hooks/useGameLoop';
import { BackgroundLayers } from './BackgroundLayers';
import { Player } from './Player';
import { MapNodeComponent } from './MapNodeComponent';
import { MobileControls } from './MobileControls';
import { HUDOverlay } from './HUDOverlay';
import { LoopTransition } from './LoopTransition';

export function GameMap() {
  const router = useRouter();
  const { loopCount, incrementLoop, resetLoop, isLoaded } = useLoopCount();
  const { keys, consumeEscape } = useKeyboardInput();
  const { touchState, handlers } = useTouchInput();
  const reducedMotion = useReducedMotion();
  
  const [showHelp, setShowHelp] = useState(false);
  const [loopTrigger, setLoopTrigger] = useState(0);

  // Combine keyboard and touch inputs
  const combinedKeys = {
    left: keys.left || touchState.left,
    right: keys.right || touchState.right,
    up: keys.up || touchState.action,
    enter: keys.enter || touchState.action,
    shift: keys.shift,
  };

  // Handle portal entry
  const handleEnterPortal = useCallback(
    (route: string) => {
      router.push(route);
    },
    [router]
  );

  // Handle loop trigger
  const handleLoopTrigger = useCallback(() => {
    incrementLoop();
    setLoopTrigger((prev) => prev + 1);
  }, [incrementLoop]);

  // Game loop
  const gameState = useGameLoop({
    keys: combinedKeys,
    onEnterPortal: handleEnterPortal,
    onLoopTrigger: handleLoopTrigger,
    reducedMotion,
  });

  // Handle escape key for help toggle
  useEffect(() => {
    if (keys.escape) {
      setShowHelp(false);
      consumeEscape();
    }
  }, [keys.escape, consumeEscape]);

  // Don't render until loop count is loaded from localStorage
  if (!isLoaded) {
    return (
      <div className="fixed inset-0 bg-stone-950 flex items-center justify-center">
        <div className="w-2 h-2 bg-stone-600 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-stone-950 overflow-hidden select-none">
      {/* Background */}
      <BackgroundLayers
        cameraX={gameState.cameraX}
        loopCount={loopCount}
        reducedMotion={reducedMotion}
      />

      {/* Map nodes */}
      {MAP_NODES.map((node) => (
        <MapNodeComponent
          key={node.id}
          node={node}
          cameraX={gameState.cameraX}
          isActive={gameState.activeNode?.id === node.id}
          loopCount={loopCount}
        />
      ))}

      {/* Player */}
      <Player
        x={gameState.playerX}
        cameraX={gameState.cameraX}
        isMoving={gameState.isMoving}
        facingRight={gameState.facingRight}
      />

      {/* Loop transition effect */}
      <LoopTransition trigger={loopTrigger} />

      {/* HUD */}
      <HUDOverlay
        loopCount={loopCount}
        onResetScar={resetLoop}
        showHelp={showHelp}
        onToggleHelp={() => setShowHelp(!showHelp)}
      />

      {/* Mobile controls */}
      <MobileControls
        onLeftStart={handlers.handleLeftStart}
        onLeftEnd={handlers.handleLeftEnd}
        onRightStart={handlers.handleRightStart}
        onRightEnd={handlers.handleRightEnd}
        onAction={handlers.handleAction}
        showAction={!!gameState.activeNode?.route}
      />
    </div>
  );
}
