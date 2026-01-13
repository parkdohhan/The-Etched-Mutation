'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MAP_CONFIG, SCAR_CONFIG, PARALLAX_LAYERS } from '@/data/mapConfig';

interface BackgroundLayersProps {
  cameraX: number;
  loopCount: number;
  reducedMotion: boolean;
}

export function BackgroundLayers({
  cameraX,
  loopCount,
  reducedMotion,
}: BackgroundLayersProps) {
  // ============================================
  // CUSTOMIZATION POINT: Scar Intensity
  // Modify these calculations to change how
  // visual scars accumulate with loop count
  // ============================================
  const noiseOpacity = Math.min(
    SCAR_CONFIG.BASE_NOISE + loopCount * SCAR_CONFIG.NOISE_PER_LOOP,
    SCAR_CONFIG.MAX_NOISE
  );

  const lineCount = Math.min(
    SCAR_CONFIG.BASE_LINES + loopCount * SCAR_CONFIG.LINES_PER_LOOP,
    SCAR_CONFIG.MAX_LINES
  );

  const ghostTextOpacity = Math.min(
    SCAR_CONFIG.GHOST_TEXT_BASE + loopCount * SCAR_CONFIG.GHOST_TEXT_PER_LOOP,
    SCAR_CONFIG.MAX_GHOST_TEXT
  );

  // Generate strata lines based on loop count
  const strataLines = useMemo(() => {
    return [...Array(lineCount)].map((_, i) => ({
      id: i,
      y: 30 + (i * 50) / lineCount + Math.sin(i * 0.5) * 10,
      width: 60 + Math.random() * 30,
      opacity: 0.05 + (i / lineCount) * 0.1 + loopCount * 0.01,
    }));
  }, [lineCount, loopCount]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950" />

      {/* Parallax layers */}
      {PARALLAX_LAYERS.map((layer) => {
        const offset = reducedMotion ? 0 : -cameraX * layer.speed;
        return (
          <div
            key={layer.id}
            className="absolute inset-0"
            style={{
              transform: `translateX(${offset}px)`,
              opacity: layer.opacity * (0.5 + loopCount * 0.02),
            }}
          >
            {/* Dot pattern */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle, rgba(168, 162, 158, ${0.03 + loopCount * 0.005}) 1px, transparent 1px)`,
                backgroundSize: `${40 + layer.speed * 20}px ${40 + layer.speed * 20}px`,
              }}
            />
          </div>
        );
      })}

      {/* Strata/geological lines */}
      <div
        className="absolute inset-0"
        style={{
          transform: reducedMotion ? 'none' : `translateX(${-cameraX * 0.2}px)`,
        }}
      >
        {strataLines.map((line) => (
          <motion.div
            key={line.id}
            className="absolute h-px bg-stone-600"
            style={{
              top: `${line.y}%`,
              left: '-10%',
              width: `${line.width}%`,
              opacity: line.opacity,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, delay: line.id * 0.1 }}
          />
        ))}
      </div>

      {/* Noise/grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: noiseOpacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Ghost text residue - appears with more loops */}
      {loopCount > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            transform: reducedMotion ? 'none' : `translateX(${-cameraX * 0.05}px)`,
          }}
        >
          <div
            className="text-[200px] font-thin text-stone-500 select-none"
            style={{ opacity: ghostTextOpacity }}
          >
            {loopCount}
          </div>
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-stone-950/50" />

      {/* Ground line */}
      <div className="absolute bottom-24 left-0 right-0 h-px bg-stone-700/50" />
      <div className="absolute bottom-24 left-0 right-0 h-8 bg-gradient-to-t from-stone-900/50 to-transparent" />
    </div>
  );
}
