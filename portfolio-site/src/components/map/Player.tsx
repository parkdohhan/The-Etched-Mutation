'use client';

import { motion } from 'framer-motion';

interface PlayerProps {
  x: number;
  cameraX: number;
  isMoving: boolean;
  facingRight: boolean;
}

export function Player({ x, cameraX, isMoving, facingRight }: PlayerProps) {
  const screenX = x - cameraX;

  return (
    <motion.div
      className="absolute bottom-24 z-30 pointer-events-none"
      style={{ left: screenX }}
      animate={{
        scale: isMoving ? [1, 0.95, 1] : 1,
      }}
      transition={{
        duration: 0.3,
        repeat: isMoving ? Infinity : 0,
      }}
    >
      {/* Player - minimal cursor/shadow presence */}
      <div
        className="relative flex flex-col items-center"
        style={{
          transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
        }}
      >
        {/* Shadow/reflection */}
        <div className="absolute -bottom-1 w-8 h-2 bg-stone-900/30 rounded-full blur-sm" />
        
        {/* Main form - a small, etched presence */}
        <div className="relative">
          {/* Core point */}
          <div className="w-3 h-3 bg-stone-300 rounded-full opacity-80" />
          
          {/* Subtle glow ring */}
          <motion.div
            className="absolute -inset-1 border border-stone-400/30 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.1, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          
          {/* Movement trail */}
          {isMoving && (
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-6 h-px bg-gradient-to-l from-stone-400/50 to-transparent"
              style={{
                left: facingRight ? 'auto' : '100%',
                right: facingRight ? '100%' : 'auto',
              }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 0.5, scaleX: 1 }}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
