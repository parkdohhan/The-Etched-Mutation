'use client';

import { motion } from 'framer-motion';
import { MapNode } from '@/data/mapConfig';

interface MapNodeComponentProps {
  node: MapNode;
  cameraX: number;
  isActive: boolean;
  loopCount: number;
}

export function MapNodeComponent({
  node,
  cameraX,
  isActive,
  loopCount,
}: MapNodeComponentProps) {
  const screenX = node.x - cameraX;

  // Don't render if off-screen (with buffer)
  if (screenX < -300 || screenX > window.innerWidth + 300) {
    return null;
  }

  return (
    <div
      className="absolute bottom-0 z-20"
      style={{
        left: screenX,
        width: node.width,
      }}
    >
      {node.type === 'wheelchair' && (
        <WheelchairNode label={node.label} loopCount={loopCount} />
      )}
      {node.type === 'portal' && (
        <PortalNode label={node.label} isActive={isActive} />
      )}
      {node.type === 'monolith' && (
        <MonolithNode text={node.text} loopCount={loopCount} />
      )}
      {node.type === 'return' && (
        <ReturnNode label={node.label} loopCount={loopCount} />
      )}
      {node.type === 'loop-gate' && (
        <LoopGateNode loopCount={loopCount} />
      )}
      {node.type === 'corridor' && (
        <CorridorNode width={node.width} />
      )}
    </div>
  );
}

// ============================================
// CUSTOMIZATION POINT: Node Visual Components
// Modify these to change the appearance of each node type
// ============================================

function WheelchairNode({ label, loopCount }: { label?: string; loopCount: number }) {
  const opacity = Math.min(0.3 + loopCount * 0.05, 0.8);
  
  return (
    <div className="relative h-48 flex flex-col items-center justify-end pb-8">
      {/* Wheelchair silhouette - abstract, minimal */}
      <div className="relative">
        {/* Wheel */}
        <motion.div
          className="w-16 h-16 border border-stone-500 rounded-full"
          style={{ opacity }}
          animate={{
            rotate: loopCount > 0 ? 360 : 0,
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          <div className="absolute inset-2 border border-stone-600/30 rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-stone-500/30" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-stone-500/30" />
          </div>
        </motion.div>
        
        {/* Frame hint */}
        <div 
          className="absolute -top-6 left-1/2 -translate-x-1/2 w-px h-8 bg-stone-500"
          style={{ opacity: opacity * 0.5 }}
        />
      </div>
      
      {/* Label */}
      {label && (
        <motion.span
          className="mt-4 text-[10px] tracking-[0.3em] uppercase text-stone-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 + loopCount * 0.05 }}
        >
          {label}
        </motion.span>
      )}
    </div>
  );
}

function PortalNode({ label, isActive }: { label?: string; isActive: boolean }) {
  return (
    <div className="relative h-64 flex flex-col items-center justify-end pb-8">
      {/* Portal frame */}
      <motion.div
        className="relative w-20 h-32"
        animate={{
          scale: isActive ? 1.05 : 1,
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Outer frame */}
        <motion.div
          className="absolute inset-0 border rounded-t-full"
          style={{
            borderColor: isActive ? 'rgb(168, 162, 158)' : 'rgb(87, 83, 78)',
          }}
          animate={{
            boxShadow: isActive
              ? '0 0 20px rgba(168, 162, 158, 0.3), inset 0 0 20px rgba(168, 162, 158, 0.1)'
              : 'none',
          }}
        />
        
        {/* Inner glow when active */}
        {isActive && (
          <motion.div
            className="absolute inset-2 bg-stone-400/10 rounded-t-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        
        {/* Center line */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-8 bg-stone-500/50" />
      </motion.div>
      
      {/* Label */}
      {label && (
        <motion.div
          className="mt-3 flex flex-col items-center"
          animate={{
            opacity: isActive ? 1 : 0.5,
          }}
        >
          <span className="text-xs tracking-[0.2em] uppercase text-stone-400">
            {label}
          </span>
          
          {/* Enter hint */}
          {isActive && (
            <motion.span
              className="mt-2 text-[9px] tracking-wider text-stone-500"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ↑ ENTER
            </motion.span>
          )}
        </motion.div>
      )}
    </div>
  );
}

function MonolithNode({ text, loopCount }: { text?: string; loopCount: number }) {
  // Text becomes clearer with more loops
  const clarity = Math.min(0.3 + loopCount * 0.1, 1);
  
  return (
    <div className="relative h-72 flex flex-col items-center justify-end pb-8">
      {/* Monolith stone */}
      <div className="relative">
        <div className="w-48 h-56 bg-stone-900/80 border border-stone-700/50 flex items-center justify-center p-4">
          {/* Etched text */}
          {text && (
            <p
              className="text-[10px] leading-relaxed text-center tracking-wide text-stone-400 font-light"
              style={{ opacity: clarity }}
            >
              {text}
            </p>
          )}
          
          {/* Surface texture */}
          <div className="absolute inset-0 opacity-10">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute w-full h-px bg-stone-500"
                style={{ top: `${20 + i * 15}%` }}
              />
            ))}
          </div>
        </div>
        
        {/* Base */}
        <div className="w-52 h-2 bg-stone-800 mx-auto -mt-px" />
      </div>
    </div>
  );
}

function ReturnNode({ label, loopCount }: { label?: string; loopCount: number }) {
  const intensity = Math.min(0.3 + loopCount * 0.1, 0.9);
  
  return (
    <div className="relative h-48 flex flex-col items-center justify-end pb-8">
      {/* Hand reaching / grasping symbol */}
      <div className="relative">
        {/* Circle with reaching lines */}
        <motion.div
          className="w-16 h-16 border border-stone-500 rounded-full relative"
          style={{ opacity: intensity }}
          animate={{
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
          }}
        >
          {/* Converging lines - like fingers reaching */}
          {[0, 72, 144, 216, 288].map((angle) => (
            <div
              key={angle}
              className="absolute w-px h-4 bg-stone-500 origin-bottom"
              style={{
                left: '50%',
                bottom: '50%',
                transform: `translateX(-50%) rotate(${angle}deg)`,
                opacity: 0.6,
              }}
            />
          ))}
          
          {/* Center point */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-stone-400 rounded-full" />
          </div>
        </motion.div>
      </div>
      
      {/* Label */}
      {label && (
        <span
          className="mt-4 text-[10px] tracking-[0.3em] uppercase text-stone-500"
          style={{ opacity: intensity }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function LoopGateNode({ loopCount }: { loopCount: number }) {
  return (
    <div className="relative h-64 flex flex-col items-center justify-end pb-8">
      {/* Gate/threshold */}
      <div className="relative w-32 h-48">
        {/* Vertical pillars */}
        <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-stone-600 to-transparent" />
        <div className="absolute right-0 top-0 w-1 h-full bg-gradient-to-b from-stone-600 to-transparent" />
        
        {/* Threshold line */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-px bg-stone-500"
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        />
        
        {/* Loop count marks */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1">
          {[...Array(Math.min(loopCount, 10))].map((_, i) => (
            <div
              key={i}
              className="w-px h-3 bg-stone-500"
              style={{ opacity: 0.3 + i * 0.05 }}
            />
          ))}
        </div>
        
        {/* Infinity hint when many loops */}
        {loopCount > 5 && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-500/30 text-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.2 }}
          >
            ∞
          </motion.div>
        )}
      </div>
    </div>
  );
}

function CorridorNode({ width }: { width: number }) {
  return (
    <div className="h-4 opacity-20" style={{ width }}>
      {/* Subtle floor markers */}
      <div className="flex justify-between px-8 h-full items-end">
        {[...Array(Math.floor(width / 100))].map((_, i) => (
          <div key={i} className="w-8 h-px bg-stone-600" />
        ))}
      </div>
    </div>
  );
}
