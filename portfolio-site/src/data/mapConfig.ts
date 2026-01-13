// ============================================
// CUSTOMIZATION POINT: Map Configuration
// Adjust world dimensions, node positions,
// portal routes, and visual parameters here.
// ============================================

export interface MapNode {
  id: string;
  type: 'wheelchair' | 'corridor' | 'portal' | 'monolith' | 'return' | 'loop-gate';
  x: number; // World position (px from left)
  width: number;
  label?: string;
  route?: string; // For portals
  text?: string; // For monolith
}

// ============================================
// CUSTOMIZATION POINT: World Dimensions
// - WORLD_WIDTH: Total scrollable width
// - VIEWPORT_PADDING: Camera dead zone
// - PLAYER_SPEED: Movement speed (px/frame)
// - PLAYER_RUN_MULTIPLIER: Shift speed boost
// ============================================
export const MAP_CONFIG = {
  WORLD_WIDTH: 4000, // Total map width in pixels
  VIEWPORT_PADDING: 200, // Camera padding from edges
  PLAYER_SPEED: 4, // Base movement speed
  PLAYER_RUN_MULTIPLIER: 2.2, // Shift key speed boost
  LERP_FACTOR: 0.08, // Camera smoothing (0-1, lower = smoother)
  TRIGGER_RADIUS: 80, // Portal activation distance
  LOOP_THRESHOLD: 50, // Distance from edge to trigger loop
};

// ============================================
// CUSTOMIZATION POINT: Node Positions
// Adjust x coordinates and order of nodes.
// Types: wheelchair, corridor, portal, monolith, return, loop-gate
// ============================================
export const MAP_NODES: MapNode[] = [
  // 1. Wheelchair Node - Prologue object
  {
    id: 'wheelchair',
    type: 'wheelchair',
    x: 200,
    width: 120,
    label: 'abandoned',
  },
  
  // 2. Corridor Stretch - Walking space
  {
    id: 'corridor-1',
    type: 'corridor',
    x: 400,
    width: 600,
  },
  
  // 3. Portal Cluster - Main navigation
  {
    id: 'portal-interactive',
    type: 'portal',
    x: 1200,
    width: 100,
    label: 'Interactive',
    route: '/works?filter=interactive',
  },
  {
    id: 'portal-film',
    type: 'portal',
    x: 1450,
    width: 100,
    label: 'Film',
    route: '/film',
  },
  {
    id: 'portal-writing',
    type: 'portal',
    x: 1700,
    width: 100,
    label: 'Writing',
    route: '/writing',
  },
  {
    id: 'portal-about',
    type: 'portal',
    x: 1950,
    width: 100,
    label: 'About',
    route: '/about',
  },
  
  // 4. Note Monolith - Central statement
  {
    id: 'monolith',
    type: 'monolith',
    x: 2400,
    width: 200,
    text: 'Pathology is not an event but a repeating structure of choice.',
  },
  
  // 5. Return Node - Symbolic return
  {
    id: 'return',
    type: 'return',
    x: 3000,
    width: 120,
    label: 'grasp',
  },
  
  // 6. Loop Gate - Triggers loop
  {
    id: 'loop-gate',
    type: 'loop-gate',
    x: 3600,
    width: 200,
  },
];

// ============================================
// CUSTOMIZATION POINT: Scar Parameters
// Controls how visual noise/scars accumulate
// as loop count increases.
// ============================================
export const SCAR_CONFIG = {
  // Base noise opacity at loop 0
  BASE_NOISE: 0.02,
  // Additional noise per loop
  NOISE_PER_LOOP: 0.008,
  // Max noise opacity
  MAX_NOISE: 0.15,
  
  // Base line count
  BASE_LINES: 3,
  // Additional lines per loop
  LINES_PER_LOOP: 1,
  // Max lines
  MAX_LINES: 15,
  
  // Text ghost opacity multiplier
  GHOST_TEXT_BASE: 0,
  GHOST_TEXT_PER_LOOP: 0.03,
  MAX_GHOST_TEXT: 0.3,
};

// ============================================
// CUSTOMIZATION POINT: Easter Egg Messages
// Hidden messages that appear at specific loop counts
// ============================================
export const EASTER_EGGS: Record<number, string> = {
  3: 'you noticed.',
  7: 'still here?',
  12: 'the scar remembers.',
  20: '...',
  50: 'endless.',
};

// ============================================
// CUSTOMIZATION POINT: Background Layer Config
// Parallax layers for depth effect
// ============================================
export const PARALLAX_LAYERS = [
  { id: 'back', speed: 0.1, opacity: 0.3 },
  { id: 'mid', speed: 0.3, opacity: 0.5 },
  { id: 'front', speed: 0.6, opacity: 0.7 },
];
