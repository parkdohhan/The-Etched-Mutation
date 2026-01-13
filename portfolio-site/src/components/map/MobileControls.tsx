'use client';

import { ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';

interface MobileControlsProps {
  onLeftStart: () => void;
  onLeftEnd: () => void;
  onRightStart: () => void;
  onRightEnd: () => void;
  onAction: () => void;
  showAction: boolean;
}

export function MobileControls({
  onLeftStart,
  onLeftEnd,
  onRightStart,
  onRightEnd,
  onAction,
  showAction,
}: MobileControlsProps) {
  return (
    <div className="fixed bottom-8 left-0 right-0 z-50 flex justify-between items-end px-6 md:hidden">
      {/* Left/Right controls */}
      <div className="flex gap-2">
        <button
          className="w-14 h-14 rounded-full border border-stone-600/50 bg-stone-900/80 flex items-center justify-center active:bg-stone-800 touch-none"
          onTouchStart={onLeftStart}
          onTouchEnd={onLeftEnd}
          onTouchCancel={onLeftEnd}
          aria-label="Move left"
        >
          <ChevronLeft className="w-6 h-6 text-stone-400" />
        </button>
        <button
          className="w-14 h-14 rounded-full border border-stone-600/50 bg-stone-900/80 flex items-center justify-center active:bg-stone-800 touch-none"
          onTouchStart={onRightStart}
          onTouchEnd={onRightEnd}
          onTouchCancel={onRightEnd}
          aria-label="Move right"
        >
          <ChevronRight className="w-6 h-6 text-stone-400" />
        </button>
      </div>

      {/* Action button */}
      {showAction && (
        <button
          className="w-14 h-14 rounded-full border border-stone-400/50 bg-stone-900/80 flex items-center justify-center active:bg-stone-800 touch-none animate-pulse"
          onTouchStart={onAction}
          aria-label="Enter portal"
        >
          <ArrowUp className="w-6 h-6 text-stone-300" />
        </button>
      )}
    </div>
  );
}
