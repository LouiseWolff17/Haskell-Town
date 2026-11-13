// The player's character: walks around the town with the arrow keys / WASD, or to wherever the map is clicked.
// town.ts tells it what is solid (solidAt) and what is close enough to talk to; this file only moves and draws it.
import { save, state } from './state.ts';

const SPEED = 55;          // map pixels per second
const CELL = 4;            // the pathfinding grid, in map pixels
export type Dir = 'up' | 'down' | 'left' | 'right';
/** Is the map solid at this map pixel? */
export type SolidAt = (x: number, y: number) => boolean;
/** Draw a filled rectangle in map pixels. */
export type Rect = (x: number, y: number, w: number, h: number, color: string) => void;
type Point = [x: number, y: number];

const START: { x: number; y: number; dir: Dir } = { x: 70, y: 111, dir: 'down' };

export const player: { x: number; y: number; dir: Dir; moving: boolean; path: Point[] | null; onArrive: (() => void) | null } =
  { x: START.x, y: START.y, dir: START.dir, moving: false, path: null, onArrive: null };
if (state.player && Number.isFinite(state.player.x) && Number.isFinite(state.player.y)) Object.assign(player, { x: state.player.x, y: state.player.y });
export function savePlayer(): void { state.player = { x: Math.round(player.x), y: Math.round(player.y) }; save(); }
export function resetPlayer(): void { Object.assign(player, START, { path: null, onArrive: null }); }

// ---------- Keyboard ----------
const KEYS: Record<string, Dir> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const held = new Set<Dir>();
/** Keys only steer the character when the player isn't typing and no window (notebook, welcome…) is open. */
const typing = (ev: KeyboardEvent): boolean => { const el = ev.target as Element | null; return document.body.classList.contains('modal-open') || !!el?.closest?.('input, textarea, select, [contenteditable]'); };
export function initPlayerKeys(interact: () => boolean): void {
  document.addEventListener('keydown', ev => {
    if (typing(ev) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const d = KEYS[ev.code];
    if (d) { held.add(d); player.path = null; player.onArrive = null; ev.preventDefault(); return; }
    if ((ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat && !(ev.target as Element | null)?.closest?.('button, a')) { if (interact()) ev.preventDefault(); }
  });
  document.addEventListener('keyup', ev => { const d = KEYS[ev.code]; if (d) held.delete(d); });
  window.addEventListener('blur', () => held.clear());
  window.addEventListener('pagehide', savePlayer);
}

// ---------- Moving ----------
// the feet are a small box around (x, y): solid if any corner is
const FEET: Point[] = [[-3, -2], [3, -2], [-3, 0], [3, 0]];
const blockedAt = (solidAt: SolidAt, x: number, y: number): boolean => FEET.some(([dx, dy]) => solidAt(x + dx, y + dy));

/** Advance the character by dt milliseconds. */
export function updatePlayer(dt: number, solidAt: SolidAt): void {
  if (document.body.classList.contains('modal-open')) { held.clear(); player.moving = false; return; }
  // a building went up right where the character stood: step out to the nearest open spot (preferring south, the street side)
  if (blockedAt(solidAt, player.x, player.y)) {
    for (let rad = 2; rad < 120; rad += 2) {
      const spot = ([[0, rad], [rad, 0], [-rad, 0], [0, -rad]] as Point[]).find(([a, b]) => !blockedAt(solidAt, player.x + a, player.y + b));
      if (spot) { player.x += spot[0]; player.y += spot[1]; break; }
    }
    player.path = null;
  }
  let dx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), dy = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
  if (!dx && !dy && player.path?.length) {
    const [tx, ty] = player.path[0], ex = tx - player.x, ey = ty - player.y, d = Math.hypot(ex, ey);
    if (d < 1.2) { player.path.shift(); if (!player.path.length) arrive(); return updatePlayer(0, solidAt); }
    dx = ex / d; dy = ey / d;
  } else if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  player.moving = !!(dx || dy);
  if (!player.moving) return;
  player.dir = Math.abs(dx) > Math.abs(dy) + 0.01 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  const step = SPEED * dt / 1000;
  // move along each axis separately, so the character slides along walls instead of sticking
  const ox = player.x, oy = player.y;
  const nx = player.x + dx * step; if (!blockedAt(solidAt, nx, player.y)) player.x = nx;
  const ny = player.y + dy * step; if (!blockedAt(solidAt, player.x, ny)) player.y = ny;
  // following a path but rounding left it brushing a wall: hop to the waypoint (pathfinding only picks open ones)
  if (player.path?.length && step > 0 && player.x === ox && player.y === oy) {
    const [tx, ty] = player.path[0];
    if (!blockedAt(solidAt, tx, ty) && Math.hypot(tx - ox, ty - oy) < 6) { player.x = tx; player.y = ty; } else arrive();
  }
}
function arrive(): void { player.path = null; const f = player.onArrive; player.onArrive = null; f?.(); }

/** Walk to (x, y) along the shortest open route, then call onArrive. Returns false if there is no way there. */
export function walkTo(x: number, y: number, solidAt: SolidAt, cols: number, rows: number, onArrive: (() => void) | null = null): boolean {
  const free = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && !blockedAt(solidAt, c * CELL + CELL / 2, r * CELL + CELL / 2);
  const cell = (px: number, py: number): Point => [Math.max(0, Math.min(cols - 1, Math.floor(px / CELL))), Math.max(0, Math.min(rows - 1, Math.floor(py / CELL)))];
  let [gc, gr] = cell(x, y);
  // a target inside a building or a tree: the nearest open cell instead
  if (!free(gc, gr)) {
    let best: Point | null = null;
    for (let rad = 1; rad < 20 && !best; rad++) for (let r = gr - rad; r <= gr + rad; r++) for (let c = gc - rad; c <= gc + rad; c++)
      if (free(c, r) && (!best || Math.hypot(c - gc, r - gr) < Math.hypot(best[0] - gc, best[1] - gr))) best = [c, r];
    if (!best) return false; [gc, gr] = best; x = gc * CELL + CELL / 2; y = gr * CELL + CELL / 2;
  }
  const [sc, sr] = cell(player.x, player.y), prev = new Int32Array(cols * rows).fill(-1), start = sr * cols + sc, goal = gr * cols + gc;
  prev[start] = start; const queue = [start];
  const DIRS: Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < queue.length && prev[goal] < 0; i++) {
    const c = queue[i] % cols, r = (queue[i] / cols) | 0;
    for (const [a, b] of DIRS) {
      const nc = c + a, nr = r + b, k = nr * cols + nc;
      if (!free(nc, nr) || prev[k] >= 0) continue;
      if (a && b && (!free(c + a, r) || !free(c, r + b))) continue; // no cutting corners
      prev[k] = queue[i]; queue.push(k);
    }
  }
  if (prev[goal] < 0) return false;
  const pts: Point[] = [[x, y]];
  for (let k = prev[goal]; k !== start; k = prev[k]) pts.unshift([(k % cols) * CELL + CELL / 2, ((k / cols) | 0) * CELL + CELL / 2]);
  player.path = pts; player.onArrive = onArrive;
  return true;
}

// ---------- Drawing ----------
const P = { straw: '#ecc96a', straw2: '#c99a3e', band: '#c8553d', hair: '#7a4a2c', skin: '#f2c9a0', ink: '#3b2a2a', shirt: '#f4efe2', overall: '#3d6ea8', overall2: '#2c5282', boot: '#5a3a24' };
/** The character in a straw hat and overalls, facing player.dir, with a two-step walk. */
export function drawPlayer(R: Rect, t: number): void {
  const x = Math.round(player.x) - 4, step = player.moving ? Math.floor(t / 140) % 4 : 0, y = Math.round(player.y) - 15 - (step % 2);
  const d = player.dir, side = d === 'left' || d === 'right', flip = d === 'left';
  const X = (o: number, w = 1): number => flip ? x + 8 - o - w : x + o; // mirror for facing left
  R(x, Math.round(player.y) - 1, 8, 2, 'rgba(0,0,0,.18)');
  // legs and boots: alternate steps
  const l = step === 1 ? 1 : 0, r = step === 3 ? 1 : 0;
  R(X(2), y + 12, 2, 3 - l, P.boot); R(X(4), y + 12, 2, 3 - r, P.boot);
  // body: shirt, overalls, swinging arms
  R(x + 1, y + 7, 6, 5, P.overall); R(x + 1, y + 7, 6, 1, P.shirt); R(x + 1, y + 11, 6, 1, P.overall2);
  if (d === 'down') { R(x + 2, y + 8, 1, 1, '#e0b040'); R(x + 5, y + 8, 1, 1, '#e0b040'); }
  const sw = player.moving ? (step === 1 ? -1 : step === 3 ? 1 : 0) : 0;
  if (side) R(X(3), y + 8 + sw, 2, 3, P.shirt);
  else { R(x, y + 7 + sw, 1, 4, P.shirt); R(x + 7, y + 7 - sw, 1, 4, P.shirt); R(x, y + 11 + sw, 1, 1, P.skin); R(x + 7, y + 11 - sw, 1, 1, P.skin); }
  // head
  if (d === 'up') { R(x + 1, y + 3, 6, 4, P.hair); R(x + 2, y + 6, 4, 1, P.skin); }
  else if (side) { R(x + 1, y + 3, 6, 4, P.skin); R(X(1), y + 3, 2, 3, P.hair); R(X(5), y + 4, 1, 1, P.ink); R(X(5), y + 6, 1, 1, '#f0a0a0'); }
  else { R(x + 1, y + 3, 6, 4, P.skin); R(x + 1, y + 3, 1, 2, P.hair); R(x + 6, y + 3, 1, 2, P.hair); R(x + 2, y + 4, 1, 1, P.ink); R(x + 5, y + 4, 1, 1, P.ink); R(x + 2, y + 6, 1, 1, '#f0a0a0'); R(x + 5, y + 6, 1, 1, '#f0a0a0'); }
  // straw hat with a red band
  R(x + 1, y, 6, 2, P.straw); R(x + 1, y + 1, 6, 1, P.band); R(x - 1, y + 2, 10, 1, P.straw2); R(x + 2, y - 1, 4, 1, P.straw);
}
/** A little "E" key bubble over the character's head when something is in reach. */
export function drawPrompt(R: Rect, t: number): void {
  const x = Math.round(player.x) - 5, by = Math.round(player.y) - 30 + Math.round(Math.sin(t / 260) * 1);
  R(x, by, 10, 9, P.ink); R(x + 1, by + 1, 8, 7, '#fffaf0'); R(x + 4, by + 9, 2, 1, P.ink);
  R(x + 3, by + 2, 1, 5, P.ink); R(x + 3, by + 2, 4, 1, P.ink); R(x + 3, by + 4, 3, 1, P.ink); R(x + 3, by + 6, 4, 1, P.ink);
}
