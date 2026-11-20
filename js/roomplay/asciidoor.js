/**
 * The ASCII door of the opening (js/app/confession.js buildDoor, phases 0 and 1), drawn onto a canvas.
 * Same glyphs, same panels, same knob, same colour — cropped to the door itself (19 x 31 cells).
 * Used by the room stage's doors (261120, author: "the door is the ASCII door of the TEM opening").
 */
const DW = 16, DH = 28;                 // = confession.js dw, dh
export const DOOR_COLS = DW + 3, DOOR_ROWS = DH + 3;
export const DOOR_ASPECT = (DOOR_COLS * 0.6) / DOOR_ROWS;   // width / height of the drawn door
const ease3 = (t) => 1 - Math.pow(1 - t, 3);

/** @param open 0 closed .. 1 open (the leaf folds toward its hinge, as in the opening) */
export function asciiDoorGrid(open) {
  const g = Array.from({ length: DOOR_ROWS }, () => Array(DOOR_COLS).fill(' '));
  const dl = 1, dr = dl + DW, dt = 1, db = dt + DH, cy = dt + (DH >> 1);
  const op = ease3(Math.max(0, Math.min(1, open || 0)));
  for (let y = dt - 1; y <= db + 1; y++) { g[y][dl - 1] = '║'; g[y][dr + 1] = '║'; }
  for (let x = dl - 1; x <= dr + 1; x++) { g[dt - 1][x] = '═'; g[db + 1][x] = '═'; }
  g[dt - 1][dl - 1] = '╔'; g[dt - 1][dr + 1] = '╗'; g[db + 1][dl - 1] = '╚'; g[db + 1][dr + 1] = '╝';
  const vw = Math.max(1, Math.round(DW * (1 - op * 0.9)));
  for (let y = dt; y <= db; y++) {
    for (let i = 0; i < vw; i++) {
      const x = dl + i;
      if (y === dt || y === db) g[y][x] = '─';
      else if (i === 0 || i === vw - 1) g[y][x] = '│';
      else {
        const py = y - dt, rh = db - dt;
        const p1t = Math.floor(rh * 0.12), p1b = Math.floor(rh * 0.42), p2t = Math.floor(rh * 0.52), p2b = Math.floor(rh * 0.88);
        const pl = 3, pr = vw - 4;
        if (i >= pl && i <= pr && (py === p1t || py === p1b || py === p2t || py === p2b)) g[y][x] = '─';
        else if (i >= pl && i <= pr && ((py > p1t && py < p1b) || (py > p2t && py < p2b)) && (i === pl || i === pr)) g[y][x] = '│';
        else g[y][x] = '░';
      }
    }
    const kx = dl + vw - 3;
    if (kx >= 0 && y === cy) g[y][kx] = '◉';
  }
  return g;
}

/**
 * Draw the door onto `canvas` (resized to fit). `px` = cell height in canvas pixels.
 * `tone: true` draws the shade glyph (░) as the even quarter-tone it stands for — a small or far door
 * would otherwise turn its dots into a moire.
 */
export function drawAsciiDoor(canvas, open, o) {
  const px = (o && o.px) || 28, cw = px * 0.6;
  const w = Math.round(DOOR_COLS * cw), h = DOOR_ROWS * px;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const c = canvas.getContext('2d'), g = asciiDoorGrid(open);
  c.clearRect(0, 0, w, h);
  c.font = px + 'px "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = (o && o.color) || 'rgba(196,168,130,0.9)';
  c.shadowColor = 'rgba(196,168,130,0.45)'; c.shadowBlur = px * 0.35;
  const tone = !!(o && o.tone);
  for (let y = 0; y < DOOR_ROWS; y++) for (let x = 0; x < DOOR_COLS; x++) {
    const ch = g[y][x]; if (ch === ' ') continue;
    if (ch === '░' && tone) { c.save(); c.shadowBlur = 0; c.globalAlpha = 0.2; c.fillRect(x * cw, y * px, cw + 0.5, px + 0.5); c.restore(); continue; }
    c.fillText(ch, (x + 0.5) * cw, (y + 0.5) * px);
  }
  return canvas;
}
