'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoopTransitionProps {
  trigger: number; // Changes when loop occurs
}

export function LoopTransition({ trigger }: LoopTransitionProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger > 0) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Flash effect */}
          <motion.div
            className="absolute inset-0 bg-stone-200"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.1, 0] }}
            transition={{ duration: 0.4 }}
          />
          
          {/* Horizontal scan line */}
          <motion.div
            className="absolute left-0 right-0 h-px bg-stone-400"
            initial={{ top: '0%', opacity: 0 }}
            animate={{ top: '100%', opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
          
          {/* Noise burst */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.15, 0] }}
            transition={{ duration: 0.5 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
