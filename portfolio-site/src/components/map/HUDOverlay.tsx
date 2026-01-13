'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { EASTER_EGGS } from '@/data/mapConfig';

interface HUDOverlayProps {
  loopCount: number;
  onResetScar: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
}

export function HUDOverlay({
  loopCount,
  onResetScar,
  showHelp,
  onToggleHelp,
}: HUDOverlayProps) {
  const [easterEgg, setEasterEgg] = useState<string | null>(null);

  // ============================================
  // CUSTOMIZATION POINT: Easter Eggs
  // Add/modify hidden messages in mapConfig.ts
  // ============================================
  useEffect(() => {
    if (EASTER_EGGS[loopCount]) {
      setEasterEgg(EASTER_EGGS[loopCount]);
      const timer = setTimeout(() => setEasterEgg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [loopCount]);

  return (
    <>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-between items-start p-4 md:p-6">
        {/* Left: Quick links */}
        <div className="flex gap-3">
          <Link
            href="/works"
            className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-stone-500 hover:text-stone-300 transition-colors px-3 py-1.5 border border-stone-700/50 hover:border-stone-600/50"
          >
            Enter Works
          </Link>
          <button
            onClick={onResetScar}
            className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-stone-600 hover:text-stone-400 transition-colors px-3 py-1.5 border border-stone-800/50 hover:border-stone-700/50"
          >
            Reset Scar
          </button>
        </div>

        {/* Right: Loop counter & help */}
        <div className="flex items-center gap-4">
          {loopCount > 0 && (
            <motion.div
              className="text-[10px] md:text-xs tracking-[0.3em] text-stone-600 tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
            >
              loop:{loopCount.toString().padStart(2, '0')}
            </motion.div>
          )}
          <button
            onClick={onToggleHelp}
            className="text-[10px] md:text-xs tracking-wider text-stone-600 hover:text-stone-400 transition-colors"
            aria-label="Toggle help"
          >
            [?]
          </button>
        </div>
      </div>

      {/* Help overlay */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggleHelp}
          >
            <motion.div
              className="max-w-md p-8 text-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-sm tracking-[0.3em] uppercase text-stone-400 mb-8">
                Controls
              </h2>
              
              <div className="space-y-4 text-stone-500 text-xs tracking-wide">
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span>Move</span>
                  <span className="text-stone-400">← → or A D</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span>Run</span>
                  <span className="text-stone-400">Hold Shift</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span>Enter Portal</span>
                  <span className="text-stone-400">↑ or Enter</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span>Close Help</span>
                  <span className="text-stone-400">Esc</span>
                </div>
              </div>

              <p className="mt-8 text-[10px] text-stone-600 leading-relaxed">
                Walk through the map. Approach portals to enter sections.
                <br />
                The map loops. Each loop leaves a scar.
              </p>

              <button
                onClick={onToggleHelp}
                className="mt-8 text-[10px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-300 transition-colors"
              >
                [close]
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Easter egg message */}
      <AnimatePresence>
        {easterEgg && (
          <motion.div
            className="fixed bottom-1/4 left-1/2 -translate-x-1/2 z-40 text-stone-500/50 text-xs tracking-[0.3em] italic"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.8 }}
          >
            {easterEgg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-time hint */}
      <AnimatePresence>
        {loopCount === 0 && (
          <motion.div
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-30 text-stone-600 text-[10px] tracking-[0.3em] hidden md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.6, 0] }}
            transition={{ duration: 6, times: [0, 0.2, 0.8, 1] }}
          >
            ← use arrow keys to move →
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
