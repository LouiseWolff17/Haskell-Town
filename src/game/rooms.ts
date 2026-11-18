// The town interiors as pixel-art rooms, drawn like the town map: a top-down room with a back wall, a floor
// and furniture, the resident who lives there, and you. Going through a building's door turns the map
// into its room (town.ts draws it with drawRoom), and the doormat inside takes you back out. Brine's little
// boat works the same way, with a deck instead of a floor and a gangplank down to the pier instead of a door,
// and so do the three beehives in the meadow (Rowan's tulip): you shrink to bee size and step inside, and a
// tulip petal by the entrance takes you back out. Brine's conch at the Duck Pond leads to the magical beach: a wave
// washes you there, and the conch on the sand takes you back.
// Walk with the arrow keys / WASD or by clicking. Things you can look at glow when you're close or the
// mouse is over them; click them or press E. What they do is up to interiors.ts (the `onSpot` callback).
import { RESIDENTS } from '../content/index.ts';
import { drawPlayer, drawPrompt, drawResident, steer, walkTo } from './player.ts';
import { hourNow, nightOn } from './town.ts';
import { nightness } from './rewards.ts';
import type { Dir, Rect, Walker } from './player.ts';

/** A room is 176×150 room pixels, drawn at 2× in the middle of the map. */
export const RW = 176, RH = 150;
/** How far the bottom of a room is below where it was first drawn (things by the front wall use it). */
const LOW = RH - 108;
interface Box { x: number; y: number; w: number; h: number }
/** Something in the room to look at: where it is drawn, and where you stand to look at it. */
export interface Spot { id: string; label: string; box: Box; stand: [x: number, y: number] }
/** What changes how a room looks (letters pinned up, folds of the dough, …), set by interiors.ts. */
export type View = Record<string, number | boolean | undefined>;
interface Room {
  /** The resident whose gift opens it, when that isn't its key in ROOMS (the three hives are all Rowan's tulip). */
  gift?: string;
  /** What it's called, when it isn't the gift's place ("the nursery hive" rather than "By the beehives"). */
  name?: string;
  /** Who's there, when it isn't the resident whose gift opened it (Juniper's star opens Brine's boat). */
  who?: string;
  /** Who talks in the dialogue box when nobody lives there (the bees): their portrait. */
  voice?(size: number): HTMLCanvasElement;
  /** Where you can stand, when it isn't the whole floor (the boat: its deck, the gangplank and the pier). */
  walk?(x: number, y: number, v: View): boolean;
  /** The way back out isn't a doormat: "Aboard" or "Inside", what the way out is called, the hint under the map,
   *  and how to get out (for screen readers). */
  away?: { where: string; exit: string; hint(v: View): string; out(v: View): string };
  /** A cut-scene playing (the boat sailing out or home): how far along it is, 0 to 1, or null. Nobody walks during one. */
  scene?(v: View, t: number): number | null;
  /** Drawn over everything during a cut-scene, instead of the cinema bars (shrinking down into a hive). */
  cover?(R: Rect, k: number, t: number): void;
  /** Spots that aren't there right now (the way ashore, out at sea). */
  gone?(id: string, v: View): boolean;
  /** Where the resident stands (top-left of their 8×14 sprite), if somebody lives there. */
  resident?: [x: number, y: number];
  /** Furniture you can't walk through, as floor footprints. */
  solids: Box[];
  spots: Spot[];
  /** Everything but the people: walls, floor, furniture. */
  draw(R: Rect, t: number, v: View): void;
}

const INK = '#3b2a2a', WHITE = '#fffaf0';
/** Dark outside: the night cycle is on (the Observatory is built) and it's past dusk on the clock. */
const dark = (): boolean => nightOn() && nightness(hourNow()) >= 0.5;
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
// a seeded random, so the bookshelves look the same on every visit
const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;

// ---------- Shared pieces ----------
type Floor = (R: Rect) => void;
const planks = (a: string, seam: string): Floor => R => {
  R(4, 37, RW - 8, RH - 41, a);
  for (let y = 41, row = 0; y < RH - 4; y += 5, row++) {
    R(4, y, RW - 8, 1, seam);
    for (let x = 4 + (row % 2 ? 11 : 27); x < RW - 4; x += 32) R(x, y - 4, 1, 4, seam);
  }
};
const tiles = (a: string, b: string): Floor => R => {
  for (let y = 37; y < RH - 4; y += 6) for (let x = 4; x < RW - 4; x += 6) R(x, y, 6, 6, ((x + y) / 6) % 2 < 1 ? a : b);
};
/** The room's shell: dark outline, back wall with its trim, the floor, and the door gap with a mat. */
function shell(R: Rect, wall: string, trim: string, floor: Floor): void {
  R(0, 0, RW, RH, INK);
  R(4, 4, RW - 8, 30, wall);
  floor(R);
  R(4, 33, RW - 8, 3, trim); R(4, 36, RW - 8, 1, 'rgba(0,0,0,.18)');
  R(RW / 2 - 9, RH - 4, 18, 4, '#5a3a24'); R(RW / 2 - 8, RH - 9, 16, 5, '#9a6b4a'); R(RW / 2 - 7, RH - 8, 14, 3, '#b8835a');
}
/** A window on the back wall: sky by day, stars by night (once the Observatory is up). */
function windowAt(R: Rect, x: number, y: number, w: number, h: number, t: number, curtain?: string): void {
  const night = dark();
  R(x - 1, y - 1, w + 2, h + 2, '#6b4429');
  R(x, y, w, h, night ? '#2c3550' : '#a8dbe8');
  if (night) [[3, 3], [w - 6, 5], [w / 2, 2], [6, h - 6]].forEach(([a, b], i) => R(x + a, y + b, 1, 1, (Math.floor(t / 600) + i) % 4 ? '#fff2a8' : '#8890b0'));
  else { R(x + 4 + ((t / 900) % (w - 10)), y + 4, 6, 2, WHITE); R(x + 5 + ((t / 900) % (w - 10)), y + 3, 3, 1, WHITE); }
  R(x + w / 2, y, 1, h, '#6b4429'); R(x, y + h / 2, w, 1, '#6b4429');
  R(x - 2, y + h + 1, w + 4, 2, '#8a5a3b');
  if (curtain) { R(x - 2, y - 2, 4, h + 2, curtain); R(x + w - 2, y - 2, 4, h + 2, curtain); R(x - 3, y - 3, w + 6, 2, '#6b4429'); }
}
const shadow = (R: Rect, x: number, y: number, w: number): void => R(x, y, w, 2, 'rgba(0,0,0,.15)');
function plant(R: Rect, x: number, y: number): void {
  shadow(R, x, y + 12, 10);
  R(x + 1, y + 7, 8, 6, '#b8533a'); R(x, y + 7, 10, 2, '#d9694a');
  R(x + 2, y, 6, 7, '#4f7f64'); R(x, y + 2, 3, 4, '#6f9e83'); R(x + 7, y + 1, 3, 5, '#6f9e83'); R(x + 4, y - 2, 2, 3, '#6f9e83');
}

// ---------- Brine's boat: the hull's shape, which is also where the deck is ----------
/** The middle of the boat, from bow to stern. */
const CY = 76;
/** Half the hull's height at x: rounded at the stern (left), pointed at the bow (right), -1 where there's only sea. */
function hull(x: number): number {
  if (x < 10 || x > 168) return -1;
  if (x < 18) return 32 + Math.sqrt(64 - (18 - x) ** 2);
  if (x > 128) return 40 * (1 - ((x - 128) / 40) ** 2);
  return 40;
}
/** How long the boat takes to sail out, or home again (the cut-scene), in ms. */
export const SAIL_MS = 4200;
const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
const ease = (k: number): number => k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2;
/** How far out the boat is: 0 moored at the pier, 1 out at sea, in between while it sails (`p` is the cut-scene's progress).
 *  interiors.ts sets `out` (where it's headed) and `since` (when it set off). */
function voyage(v: View, t: number): { k: number; p: number } {
  const p = clamp01((t - (Number(v.since) || -Infinity)) / SAIL_MS);
  return { p, k: v.out ? p : 1 - p };
}
/** How far the sea has scrolled past: it drifts gently at the pier and streams by under way. */
let seaX = 0, seaT = 0;
/** The paddle wheels, one on each side, just ahead of the wheelhouse: where along the hull, and how wide. */
const PADDLE_X = 56, PADDLE_W = 22;
/** How far round the paddle wheels have turned (kept frame to frame, like the sea). */
let paddleA = 0;
/** One paddle wheel seen from above, sticking out past the rail on the top side (dir -1) or the bottom (dir 1): the paddle box,
 *  the red boards turning past (the top of the wheel moves towards the bow), and white water churned up behind while it turns. */
function paddleWheel(R: Rect, dir: -1 | 1, t: number, power: number): void {
  const x = PADDLE_X, w = PADDLE_W, y = dir < 0 ? CY - 49 : CY + 39, outer = dir < 0 ? y : y + 9;
  if (dir > 0) shadow(R, x, y + 10, w);
  // churned water trailing off towards the stern, and spray thrown off the paddles
  if (power > 0) for (let i = 0; i < 6; i++) {
    const ph = (t / 380 + i / 6) % 1, a = (0.75 * (1 - ph) * power).toFixed(2);
    R(x - 2 - ph * 18, outer + dir * (1 + (i % 3) + ph * 3), 2 + (i % 2), 1, `rgba(255,255,255,${a})`);
    if (i % 2 === 0) R(x + 3 + ((i * 7) % (w - 6)), outer + dir * (1 + ph * 2), 1, 1, `rgba(255,255,255,${a})`);
  }
  // the paddle box: a wooden frame, open so you can see the wheel, with a white trim along its outer edge
  R(x, y, w, 10, '#6b4429'); R(x + 2, y + 1, w - 4, 8, '#2f4a63');
  R(x, outer, w, 1, '#fffaf0');
  // the axle, then the rims, then the boards (brightest at the top of the wheel, in the middle of the box)
  R(x + 2, y + 4, w - 4, 2, '#4e3020');
  R(x + 2, y + 1, w - 4, 1, '#8a5a3b'); R(x + 2, y + 8, w - 4, 1, '#8a5a3b');
  const span = w - 6, mid = x + 2 + span / 2;
  for (let i = 0; i < span; i += 4) {
    const bx = x + 2 + ((((i + paddleA) % span) + span) % span);
    R(bx, y + 1, 2, 8, Math.abs(bx + 1 - mid) < 5 ? '#e0604f' : '#a8382c'); R(bx, y + 1, 2, 1, '#f08a7a');
  }
}

// ---------- Inside the beehives (Rowan's tulip): honeycomb walls, warm light, bees as big as you ----------
const WAX = '#c88a2c', WAX2 = '#e0a840', DEEP = '#8a5418', HONEY = '#f0a21c', GLINT = '#ffd35a', CAP = '#f4d27e', BROOD = '#f6e8c4';
/** How long shrinking down through the tulip takes (a little cut-scene as you step into a hive), in ms. */
export const SHRINK_MS = 1300;
/** A stable random number for cell `n`, so the comb looks the same every frame and every visit. */
const cellRand = (n: number, k = 0): number => { const v = Math.sin(n * 91.7 + k * 47.3) * 43758.5453; return v - Math.floor(v); };
/** One cell of honeycomb: a little hexagon, 8 wide and 6 tall (they tile in rows 6 apart, every other row shifted by 4). */
function cell(R: Rect, x: number, y: number, c: string): void { R(x + 2, y, 4, 1, c); R(x + 1, y + 1, 6, 4, c); R(x + 2, y + 5, 4, 1, c); }
/** A curled-up larva in a cell. */
function larva(R: Rect, x: number, y: number): void { R(x + 2, y + 2, 4, 1, WHITE); R(x + 2, y + 3, 1, 1, WHITE); R(x + 2, y + 4, 3, 1, WHITE); R(x + 5, y + 2, 1, 1, '#e8d8b0'); }
/** A cell capped with wax, with a little sheen. */
function capped(R: Rect, x: number, y: number, c = CAP): void { cell(R, x, y, c); R(x + 2, y + 1, 3, 1, 'rgba(255,255,255,.45)'); }
/** A cell full of honey, with a glint that comes and goes. */
function honeyCell(R: Rect, x: number, y: number, t: number, n: number): void {
  cell(R, x, y, HONEY); R(x + 2, y + 1, 2, 1, GLINT);
  if ((Math.floor(t / 450) + n * 7) % 23 === 0) R(x + 4, y + 2, 1, 1, WHITE);
}
/** The inside of a hive: the back wall of open comb (`fill` puts something in cell `n` at x, y), a floor of capped
 *  comb, warm light coming in at the entrance, and the tulip petal there: the way back out. */
function hiveShell(R: Rect, t: number, fill: (x: number, y: number, n: number) => void): void {
  R(0, 0, RW, RH, '#3a2412');
  R(4, 4, RW - 8, 30, '#a86a20');
  for (let row = 0, y = 4; y < 33; row++, y += 6) for (let x = row % 2 ? 0 : -4, n = row * 32; x < RW; x += 8, n++) { cell(R, x, y, DEEP); fill(x, y, n); }
  R(4, 37, RW - 8, RH - 41, '#e2aa4a');
  for (let row = 0, y = 37; y < RH - 4; row++, y += 6) for (let x = row % 2 ? 0 : -4; x < RW; x += 8) cell(R, x, y, '#e9b858');
  R(4, 33, RW - 8, 3, WAX); R(4, 33, RW - 8, 1, WAX2); R(4, 36, RW - 8, 1, 'rgba(0,0,0,.18)');
  // daylight through the entrance, spilling up the floor
  for (let i = 0; i < 6; i++) R(RW / 2 - 12 - i * 5, RH - 10 - i * 7, 24 + i * 10, 7, `rgba(255,244,200,${(0.16 - i * 0.025).toFixed(3)})`);
  // the walls of the hive, all round (over any cell that ran past the edge)
  R(0, 0, RW, 4, '#3a2412'); R(0, 0, 4, RH, '#3a2412'); R(RW - 4, 0, 4, RH, '#3a2412');
  R(0, RH - 4, RW / 2 - 10, 4, '#3a2412'); R(RW / 2 + 10, RH - 4, RW / 2 - 10, 4, '#3a2412');
  R(RW / 2 - 10, RH - 4, 20, 4, '#fff4c8'); R(RW / 2 - 8, RH - 2, 16, 2, '#9ccf7a');
  // the tulip petal, which takes you back out to the meadow
  const sway = Math.round(Math.sin(t / 900) * 0.6);
  R(RW / 2 - 7 + sway, RH - 10, 14, 6, '#e87a9a'); R(RW / 2 - 8 + sway, RH - 9, 16, 4, '#e87a9a');
  R(RW / 2 - 5 + sway, RH - 9, 9, 2, '#f7a8c0'); R(RW / 2 - 3 + sway, RH - 9, 4, 1, '#ffd6e2'); R(RW / 2 + sway, RH - 7, 6, 1, '#c85a7a');
}
/** A bee, 10×7 from (x, y), facing right (dir 1) or left (-1), wings beating (a blur when `fast`). */
function bee(R: Rect, x: number, y: number, t: number, dir = 1, fast = false): void {
  x = Math.round(x); y = Math.round(y);
  const X = (dx: number, w = 1): number => dir > 0 ? x + dx : x + 10 - dx - w, up = Math.floor(t / (fast ? 35 : 80) + x) % 2;
  R(X(1, 7), y + 2, 7, 4, '#f2c230'); R(X(2, 5), y + 6, 5, 1, '#d9a420');
  R(X(3), y + 2, 1, 4, INK); R(X(5), y + 2, 1, 4, INK); R(X(0), y + 4, 1, 1, INK);
  R(X(8, 2), y + 2, 2, 3, INK); R(X(9), y + 3, 1, 1, WHITE); R(X(9), y + 1, 1, 1, INK);
  if (fast) R(X(2, 6), y - 1, 6, 3, 'rgba(255,255,255,.55)');
  else { R(X(3, 2), y + up, 2, 2, 'rgba(255,255,255,.9)'); R(X(5, 2), y + up, 2, 2, 'rgba(225,238,255,.85)'); }
}
/** A bee flying about inside `b`, never quite the same path twice, with its shadow on the floor. */
function flyer(R: Rect, b: Box, t: number, i: number): void {
  const a = t / (2300 + i * 310) + i * 2.1, x = b.x + (Math.sin(a) * 0.5 + 0.5) * b.w, y = b.y + (Math.sin(t / (1300 + i * 170) + i) * 0.5 + 0.5) * b.h;
  R(Math.round(x) + 2, Math.round(y) + 12, 6, 1, 'rgba(0,0,0,.12)');
  bee(R, x, y, t, Math.cos(a) > 0 ? 1 : -1);
}
/** The bees' portrait in the dialogue box (a crown for the queen's hive). */
export function beePortrait(size: number, crown = false): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 10; c.height = 10; c.className = 'portrait'; c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d')!, P: Rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  P(0, 0, 10, 10, '#f2e3c4');
  P(3, 2, 2, 3, WHITE); P(5, 1, 2, 3, '#e1eeff');
  P(1, 4, 6, 4, '#f2c230'); P(3, 4, 1, 4, INK); P(5, 4, 1, 4, INK); P(0, 6, 1, 1, INK);
  P(7, 4, 3, 4, INK); P(8, 5, 1, 1, WHITE); P(8, 3, 1, 1, INK); P(9, 2, 1, 1, INK);
  if (crown) { P(7, 1, 3, 1, '#ffd84a'); P(7, 0, 1, 1, '#ffd84a'); P(9, 0, 1, 1, '#ffd84a'); P(8, 2, 1, 1, '#ffd84a'); }
  return c;
}
/** Shrinking down as you step in: the hive opens out from where you stand, ringed with golden sparkles. */
function shrinkCover(R: Rect, k: number): void {
  const e = ease(k), r = e * 178, cx = RW / 2, cy = RH - 8, D = '#1e1614';
  for (let y = 0; y < RH; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) >= r) { R(0, y, RW, 1, D); continue; }
    const hw = Math.sqrt(r * r - dy * dy); R(0, y, Math.max(0, cx - hw), 1, D); R(cx + hw, y, RW, 1, D);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + k * 7, sx = cx + Math.cos(a) * (r + 2), sy = cy + Math.sin(a) * (r + 2);
    if (sx > 0 && sx < RW && sy > 0 && sy < RH) { R(sx, sy - 1, 1, 3, '#ffe08a'); R(sx - 1, sy, 3, 1, '#ffe08a'); }
  }
}
/** What every hive shares: Rowan's tulip opens it, there's nobody living there but bees, and the tulip petal leads out. */
function hive(name: string, crown = false): Pick<Room, 'gift' | 'name' | 'voice' | 'away' | 'scene' | 'cover'> {
  return {
    gift: 'rowan', name, voice: size => beePortrait(size, crown),
    away: { where: 'Inside', exit: '🌷 The tulip petal', hint: () => 'The tulip petal by the entrance takes you back to the meadow.', out: () => 'go back out by the tulip petal' },
    // interiors.ts sets `since` when you step in
    scene: (v, t) => { const k = (t - (Number(v.since) || -Infinity)) / SHRINK_MS; return k >= 0 && k < 1 ? k : null; },
    cover: shrinkCover,
  };
}
/** The big cell in the honey store, filling with nectar: `drops` of 6, capped with wax when it's full. */
function nectarCell(R: Rect, x: number, y: number, drops: number): void {
  const H = 22, W = 26, inset = (dy: number): number => Math.max(0, Math.round((Math.abs(dy - (H - 1) / 2) - 4.5) * 1.15));
  for (let dy = -2; dy < H + 2; dy++) { const i = inset(Math.max(0, Math.min(H - 1, dy))); R(x + i - 2, y + dy, W - 2 * i + 4, 1, '#a86a20'); }
  const level = H - Math.round((H * drops) / 6);
  for (let dy = 0; dy < H; dy++) { const i = inset(dy); R(x + i, y + dy, W - 2 * i, 1, dy >= level ? HONEY : '#6a3a10'); }
  if (drops > 0 && drops < 6) { const i = inset(level); R(x + i + 2, y + level, W - 2 * i - 4, 1, GLINT); }
  if (drops >= 6) { for (let dy = 0; dy < H; dy++) { const i = inset(dy); R(x + i, y + dy, W - 2 * i, 1, CAP); } R(x + 7, y + 4, 8, 2, 'rgba(255,255,255,.5)'); R(x + 5, y + 7, 3, 1, 'rgba(255,255,255,.4)'); }
}

// ---------- The magical beach (Brine's conch at the Duck Pond): warm sea, endless waves, shells washing up ----------
/** How long the wave that carries you through the conch takes to draw back out to sea (the cut-scene as you arrive), in ms. */
export const WASH_MS = 1300;
const FOAM = '#f4fbf6';
/** The beach's colours, by day and by (moonlit) night. */
const shore = (night: boolean) => night
  ? { deep: '#25305a', sea: '#2f4472', shallow: '#4a6a98', wet: '#8a7e6a', sand: '#b4a688', speck: '#9a8e74' }
  : { deep: '#2a8fa6', sea: '#38a9b8', shallow: '#7fd6d0', wet: '#d9b77a', sand: '#f1d9a4', speck: '#dcc08a' };
/** Where the water reaches at x: the waves wash up and draw back, never past y 56. */
const waterline = (x: number, t: number): number => Math.round(49 + Math.sin(x / 13 + t / 1700) * 2 + Math.sin(t / 2300) * 4.5);
/** Where the shells wash up on the tideline, newest last (the six most recent are lying there). */
const SHELL_AT: [number, number][] = [[22, 61], [36, 63], [50, 60], [64, 62], [78, 61], [92, 63]];
/** One shell, about 5×4 from (x, y): a cowrie, a scallop, a whelk, a cockle or a moon snail (the order of BEACH.shells). */
function seashell(R: Rect, x: number, y: number, kind: number): void {
  R(x, y + 4, 5, 1, 'rgba(0,0,0,.12)');
  if (kind === 0) { R(x + 1, y, 3, 1, '#f2e6d0'); R(x, y + 1, 5, 2, '#f2e6d0'); R(x + 1, y + 3, 3, 1, '#f2e6d0'); R(x + 1, y + 1, 1, 1, '#b88a5a'); R(x + 3, y + 2, 1, 1, '#b88a5a'); }
  else if (kind === 1) { R(x + 1, y, 3, 1, '#f2a8b4'); R(x, y + 1, 5, 2, '#f2a8b4'); R(x + 2, y + 3, 1, 1, '#d8788a'); R(x + 1, y + 1, 1, 2, '#d8788a'); R(x + 3, y + 1, 1, 2, '#d8788a'); }
  else if (kind === 2) { R(x, y + 1, 3, 2, '#e8c8a0'); R(x + 3, y + 1, 1, 1, '#e8c8a0'); R(x + 4, y, 1, 1, '#c8a070'); R(x + 1, y + 2, 2, 1, '#b8885a'); R(x, y + 3, 2, 1, '#e8c8a0'); }
  else if (kind === 3) { R(x + 1, y, 3, 1, '#d8b890'); R(x, y + 1, 5, 2, '#d8b890'); R(x + 1, y + 1, 1, 2, '#a88660'); R(x + 3, y + 1, 1, 2, '#a88660'); R(x + 2, y + 3, 1, 1, '#a88660'); }
  else { R(x + 1, y, 3, 1, '#e8e0f0'); R(x, y + 1, 5, 2, '#e8e0f0'); R(x + 1, y + 3, 3, 1, '#e8e0f0'); R(x + 2, y + 1, 1, 1, '#8a7a9a'); R(x + 3, y + 2, 1, 1, '#b8acc8'); }
}
/** The hermit crab, 10×8 from (x, y), in its borrowed whelk shell, scuttling sideways. */
function hermitCrab(R: Rect, x: number, y: number, t: number, dir: number): void {
  x = Math.round(x); y = Math.round(y);
  const X = (dx: number, w = 1): number => dir > 0 ? x + dx : x + 10 - dx - w, step = Math.floor(t / 140) % 2;
  R(x + 1, y + 8, 9, 1, 'rgba(0,0,0,.15)');
  for (const lx of [3, 5, 7]) R(X(lx), y + 6 + ((lx + step) % 2), 1, 2, '#c8482a');
  R(X(1, 6), y, 6, 6, '#e8c8a0'); R(X(0), y + 2, 1, 3, '#e8c8a0'); R(X(2, 3), y + 1, 3, 1, '#b8885a'); R(X(1, 3), y + 3, 3, 1, '#b8885a'); R(X(3), y + 4, 1, 1, '#b8885a');
  R(X(6, 3), y + 3, 3, 3, '#e0603a'); R(X(9), y + 4, 1, 2, '#e0603a');
  R(X(7), y + 1, 1, 2, '#e0603a'); R(X(9), y + 1, 1, 2, '#e0603a'); R(X(7), y, 1, 1, INK); R(X(9), y, 1, 1, INK);
}
/** The hermit crab's portrait, for the dialogue box (nobody lives on the beach, so the crab does the talking). */
export function crabPortrait(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 10; c.height = 10; c.className = 'portrait'; c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d')!, P: Rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  P(0, 0, 10, 10, '#f1d9a4');
  P(0, 3, 6, 6, '#e8c8a0'); P(1, 4, 3, 1, '#b8885a'); P(1, 6, 3, 1, '#b8885a'); P(2, 7, 1, 1, '#b8885a');
  P(5, 5, 4, 4, '#e0603a'); P(9, 6, 1, 2, '#e0603a'); P(6, 2, 1, 3, '#e0603a'); P(8, 2, 1, 3, '#e0603a'); P(6, 1, 1, 1, INK); P(8, 1, 1, 1, INK);
  return c;
}
/** Arriving: the wave that carried you through the conch draws back up the beach and out to sea. */
function washCover(R: Rect, k: number, t: number): void {
  const edge = RH * (1 - ease(k)), c = shore(dark());
  for (let x = 0; x < RW; x++) {
    const e = Math.round(edge + Math.sin(x / 9 + t / 200) * 3); if (e <= 0) continue;
    R(x, 0, 1, e, c.sea); R(x, Math.max(0, e - 3), 1, 3, c.shallow); R(x, e, 1, 1, FOAM);
  }
  for (let i = 0; i < 12; i++) { const bx = (i * 37) % RW, by = RH - ((i * 53 + t / 5) % RH); if (by < edge - 4) R(bx, by, 1, 1, 'rgba(255,255,255,.6)'); }
}
// ---------- The rooms, by the resident whose gift opens them (or by hive, or the beach) ----------
export const ROOMS: Record<string, Room> = {
  // Wren's cottage: the stove and kettle, a tea table on a rug, the cat on a chair, her letters pinned up, a patchwork bed.
  wren: {
    resident: [36, 37],
    solids: [{ x: 8, y: 37, w: 24, h: 9 }, { x: 72, y: 56, w: 32, h: 14 }, { x: 62, y: 58, w: 9, h: 10 }, { x: 105, y: 58, w: 9, h: 10 }, { x: 134, y: 37, w: 34, h: 27 }, { x: 8, y: 84 + LOW, w: 12, h: 14 }, { x: 150, y: 96, w: 18, h: 14 }],
    spots: [
      { id: 'tea', label: '🫖 Tea with Wren', box: { x: 8, y: 7, w: 24, h: 38 }, stand: [28, 58] },
      { id: 'cat', label: '🐈 The cat', box: { x: 103, y: 51, w: 14, h: 14 }, stand: [112, 80] },
      { id: 'letters', label: '✉️ The letters', box: { x: 108, y: 7, w: 40, h: 22 }, stand: [124, 50] },
    ],
    draw(R, t, v) {
      shell(R, '#f3dfc1', '#a0683f', planks('#c8915e', '#b07b4b'));
      for (let y = 8; y < 31; y += 7) for (let x = 8 + (y % 2 ? 4 : 0); x < RW - 6; x += 8) R(x, y, 1, 1, '#dcc29c');
      windowAt(R, 62, 9, 28, 18, t, '#e8a0bf');
      // the cork board, with one letter per letter read
      R(108, 8, 40, 20, '#8a5a3b'); R(109, 9, 38, 18, '#c99a5e');
      for (let i = 0; i < Math.min(Number(v.letters) || 0, 8); i++) {
        const lx = 111 + (i % 4) * 9, ly = 11 + Math.floor(i / 4) * 8;
        R(lx, ly, 7, 6, WHITE); R(lx + 1, ly + 2, 5, 1, '#c8b8a0'); R(lx + 1, ly + 4, 3, 1, '#c8b8a0'); R(lx + 3, ly, 1, 1, '#d9694a');
      }
      // the stove, the kettle and its steam
      shadow(R, 8, 45, 24);
      R(28, 4, 3, 13, '#3a3640'); R(8, 16, 24, 29, '#4a4650'); R(8, 16, 24, 3, '#6a6672'); R(11, 24, 18, 13, '#3a3640');
      R(13, 28, 14, 7, Math.sin(t / 160) > 0 ? '#d9694a' : '#e88a50'); R(13, 28, 14, 1, '#2a2630'); R(10, 40, 20, 2, '#6a6672');
      R(14, 11, 10, 5, '#5aa0a0'); R(15, 10, 8, 1, '#5aa0a0'); R(18, 8, 2, 2, INK); R(24, 12, 2, 1, '#5aa0a0'); R(25, 11, 1, 1, '#5aa0a0'); R(15, 12, 8, 1, '#7cc0c0');
      for (let k = 0; k < 3; k++) {
        const ph = (t / 1100 + k / 3) % 1;
        R(26 + Math.sin(t / 300 + k * 2) * 1.5, 9 - ph * 9, 2, 2, `rgba(255,255,255,${(0.75 * (1 - ph)).toFixed(2)})`);
      }
      // rug, table, tea things, chairs, and the cat
      R(56, 50, 64, 30, '#e8c08a'); R(58, 52, 60, 26, '#c86a5a');
      for (let x = 62; x < 116; x += 8) R(x, 76, 4, 1, '#e8c08a');
      shadow(R, 72, 69, 32);
      R(72, 56, 32, 11, '#a0683f'); R(72, 56, 32, 2, '#b87c50'); R(72, 65, 32, 3, '#7a4a2c'); R(74, 68, 2, 3, '#6b4429'); R(100, 68, 2, 3, '#6b4429');
      R(84, 52, 7, 6, WHITE); R(86, 51, 3, 1, WHITE); R(91, 54, 2, 1, WHITE); R(82, 53, 2, 3, WHITE); R(84, 55, 7, 1, '#e8a0bf');
      R(76, 59, 5, 3, WHITE); R(77, 59, 3, 1, '#a0683f'); R(95, 59, 5, 3, WHITE); R(96, 59, 3, 1, '#a0683f');
      for (const cx of [62, 105]) { R(cx, 50, 9, 9, '#7a4a2c'); R(cx + 1, 51, 7, 1, '#a0683f'); R(cx, 59, 9, 5, '#a0683f'); R(cx, 64, 1, 4, '#6b4429'); R(cx + 8, 64, 1, 4, '#6b4429'); }
      const sway = Math.round(Math.sin(t / 420) * 1.5);
      R(103, 58 + sway, 3, 1, '#e0a050'); R(102, 57 + sway, 1, 1, '#e0a050');
      R(106, 56, 8, 5, '#e0a050'); R(108, 56, 1, 4, '#c07830'); R(110, 56, 1, 4, '#c07830');
      R(111, 53, 5, 4, '#e0a050'); R(111, 52, 1, 1, '#e0a050'); R(115, 52, 1, 1, '#e0a050'); R(112, 55, 1, 1, INK); R(114, 55, 1, 1, INK);
      // the bed, under the letters
      shadow(R, 134, 63, 34);
      R(134, 29, 34, 9, '#7a4a2c'); R(135, 30, 32, 1, '#a0683f'); R(135, 37, 32, 26, WHITE); R(138, 38, 12, 6, '#ffffff'); R(138, 43, 12, 1, '#e3cfae');
      for (let y = 46; y < 62; y += 4) for (let x = 135; x < 167; x += 4) R(x, y, 4, 4, ((x + y) / 4) % 3 < 1 ? '#e8a0bf' : ((x + y) / 4) % 3 < 2 ? '#6f9e83' : '#93c47d');
      R(135, 62, 32, 1, '#4f7f64');
      plant(R, 8, 84 + LOW);
      // a round rug by the door, and a dresser with a vase of flowers
      R(66, 116, 44, 18, '#6f9e83'); R(68, 114, 40, 22, '#6f9e83'); R(70, 118, 36, 14, '#93c47d'); R(72, 116, 32, 18, '#93c47d');
      for (let x = 74; x < 104; x += 6) R(x, 125, 3, 1, '#fff2a8');
      shadow(R, 150, 110, 18);
      R(150, 88, 18, 22, '#a0683f'); R(150, 88, 18, 2, '#b87c50');
      for (const y of [92, 99, 105]) { R(151, y + 4, 16, 1, '#7a4a2c'); R(158, y + 1, 2, 1, '#e0b040'); }
      R(155, 82, 6, 6, '#a8dbe8'); R(156, 79, 1, 3, '#4f7f64'); R(159, 79, 1, 3, '#4f7f64'); R(155, 77, 2, 2, '#e8a0bf'); R(158, 76, 2, 2, '#f2c94c'); R(160, 78, 2, 2, '#e8a0bf');
    },
  },

  // The bakery kitchen: a tiled wall with loaves on the shelves, Hazel's recipe pinned up, the brick oven, and the counter with the dough.
  hazel: {
    resident: [38, 38],
    solids: [{ x: 50, y: 50, w: 68, h: 16 }, { x: 124, y: 37, w: 44, h: 9 }, { x: 8, y: 60, w: 22, h: 17 }, { x: 136, y: 96, w: 30, h: 17 }, { x: 10, y: 102, w: 14, h: 14 }, { x: 38, y: 112, w: 26, h: 12 }],
    spots: [
      { id: 'dough', label: '🧈 The dough', box: { x: 62, y: 47, w: 36, h: 12 }, stand: [80, 74] },
      { id: 'recipe', label: "📜 Hazel's recipe", box: { x: 68, y: 7, w: 20, h: 22 }, stand: [60, 74] },
      { id: 'oven', label: '🔥 The oven', box: { x: 124, y: 4, w: 44, h: 41 }, stand: [146, 54] },
    ],
    draw(R, t, v) {
      shell(R, '#f4efe6', '#c88a64', tiles('#e2b48a', '#d9a07a'));
      for (let x = 10; x < RW - 4; x += 6) R(x, 4, 1, 29, '#e6dccb');
      for (let y = 10; y < 33; y += 6) R(4, y, RW - 8, 1, '#e6dccb');
      // shelves: loaves on top, jars below
      R(8, 15, 52, 2, '#8a5a3b'); R(8, 27, 52, 2, '#8a5a3b');
      for (let i = 0; i < 5; i++) { R(10 + i * 10, 11, 8, 4, '#c98a4a'); R(11 + i * 10, 10, 6, 1, '#e0a860'); R(12 + i * 10, 12, 1, 2, '#a06a30'); R(15 + i * 10, 12, 1, 2, '#a06a30'); }
      ['#f2cc8f', '#c8402e', WHITE, '#6f9e83', '#f2cc8f'].forEach((c, i) => { R(10 + i * 10, 21, 6, 6, c); R(10 + i * 10, 20, 6, 1, '#8a5a3b'); R(11 + i * 10, 23, 4, 2, 'rgba(255,255,255,.4)'); });
      // the recipe, pinned up
      R(70, 9, 16, 19, WHITE); R(70, 27, 16, 1, '#e3cfae'); R(77, 8, 2, 2, '#d9694a');
      for (let y = 12; y < 20; y += 2) R(72, y, y === 12 ? 8 : 12, 1, '#a89a88');
      R(73, 22, 9, 3, '#d9a05a'); R(72, 23, 1, 1, '#d9a05a'); R(82, 23, 1, 1, '#d9a05a'); R(75, 22, 1, 2, '#b07830'); R(78, 22, 1, 2, '#b07830');
      // the brick oven, fire flickering
      shadow(R, 124, 45, 44);
      R(124, 4, 44, 41, '#b8533a');
      for (let y = 4, row = 0; y < 41; y += 4, row++) { R(124, y + 3, 44, 1, '#8a3a28'); for (let x = 124 + (row % 2 ? 4 : 0); x < 168; x += 8) R(x, y, 1, 3, '#8a3a28'); }
      R(136, 20, 20, 3, '#2a1a14'); R(134, 23, 24, 15, '#2a1a14'); R(138, 18, 16, 2, '#2a1a14');
      const f = Math.round(Math.sin(t / 110) + Math.sin(t / 170));
      R(137, 32, 18, 6, '#d9694a'); R(139 + f, 29, 14, 5, '#f2b04a'); R(143 - f, 28, 6, 4, '#fff2a8'); R(140, 37, 12, 1, '#6b4429');
      R(122, 38, 48, 7, '#9a8a7a'); R(122, 38, 48, 1, '#b8aa9a');
      // flour sacks
      shadow(R, 8, 76, 22);
      R(9, 62, 11, 14, '#e8dcc4'); R(11, 60, 7, 3, '#c8b89a'); R(12, 68, 5, 3, '#c8b89a');
      R(19, 66, 10, 10, '#ded0b4'); R(21, 64, 6, 3, '#c8b89a');
      // the counter, the dough (more stripes with every fold), the rolling pin
      shadow(R, 50, 65, 68);
      R(50, 50, 68, 8, '#d8b07a'); R(50, 50, 68, 1, '#ecc898'); R(50, 58, 68, 7, '#a0683f');
      for (let x = 66; x < 118; x += 17) R(x, 58, 1, 7, '#7a4a2c');
      const folds = Number(v.folds) || 0;
      R(64, 51, 32, 5, '#fff3d6'); R(64, 56, 32, 2, '#ecd8a8');
      // the dough's edge: one butter line after the first fold, then finer and finer stripes
      if (folds === 1) R(64, 53, 32, 1, '#f2c45a');
      if (folds >= 2) for (let y = 51; y < 56; y += folds >= 4 ? 1 : 2) R(64, y, 32, 1, '#f2c45a');
      if (folds >= 4) for (let y = 52; y < 56; y += 2) R(64, y, 32, 1, '#fff3d6');
      R(100, 52, 12, 3, '#c98a4a'); R(98, 53, 2, 1, '#8a5a3b'); R(112, 53, 2, 1, '#8a5a3b');
      // a water barrel, the cooling table with loaves, and a little table for tasting
      shadow(R, 10, 116, 14);
      R(10, 100, 14, 16, '#8a5a3b'); R(10, 103, 14, 1, '#5a3a24'); R(10, 112, 14, 1, '#5a3a24'); R(11, 100, 12, 3, '#7cc0d4'); R(12, 100, 4, 1, '#a8dbe8');
      shadow(R, 136, 112, 30);
      R(136, 96, 30, 6, '#d8b07a'); R(136, 96, 30, 1, '#ecc898'); R(136, 102, 30, 10, '#a0683f'); R(137, 106, 28, 1, '#7a4a2c');
      for (let i = 0; i < 4; i++) { R(138 + i * 7, 93, 6, 4, '#c98a4a'); R(139 + i * 7, 92, 4, 1, '#e0a860'); R(140 + i * 7, 94, 1, 2, '#a06a30'); }
      shadow(R, 38, 124, 26);
      R(42, 112, 18, 8, '#a0683f'); R(42, 112, 18, 1, '#b87c50'); R(43, 120, 2, 4, '#6b4429'); R(57, 120, 2, 4, '#6b4429');
      R(47, 113, 8, 3, WHITE); R(49, 113, 4, 2, '#d9a05a'); R(48, 114, 1, 1, '#d9a05a'); R(53, 114, 1, 1, '#d9a05a');
      for (const sx of [36, 62]) { R(sx, 114, 5, 4, '#c98a4a'); R(sx + 1, 118, 1, 4, '#6b4429'); R(sx + 3, 118, 1, 4, '#6b4429'); }
      if (v.baked) { R(52, 51, 10, 6, '#9a9a9a'); for (const cx of [53, 57]) { R(cx, 52, 4, 2, '#d9a05a'); R(cx, 54, 1, 1, '#d9a05a'); R(cx + 3, 54, 1, 1, '#d9a05a'); R(cx + 1, 52, 1, 2, '#b07830'); } }
    },
  },

  // The library reading room: bookshelves (yours on the right, with the sunflower), a window, an armchair with a lamp, a reading table.
  moss: {
    resident: [62, 38],
    solids: [{ x: 8, y: 37, w: 52, h: 4 }, { x: 116, y: 37, w: 52, h: 4 }, { x: 70, y: 55, w: 36, h: 13 }, { x: 14, y: 52, w: 20, h: 21 }, { x: 36, y: 62, w: 5, h: 6 }, { x: 8, y: 100, w: 14, h: 20 }, { x: 150, y: 106, w: 14, h: 8 }, { x: 8, y: 128, w: 12, h: 14 }],
    spots: [
      { id: 'shelf', label: '📚 Your section', box: { x: 116, y: 4, w: 52, h: 34 }, stand: [142, 50] },
      { id: 'book', label: '🌻 The open book', box: { x: 78, y: 49, w: 22, h: 10 }, stand: [88, 80] },
      { id: 'chair', label: '🛋️ The armchair', box: { x: 13, y: 49, w: 22, h: 24 }, stand: [24, 82] },
    ],
    draw(R, t) {
      shell(R, '#e9dcc0', '#6b4429', planks('#9a6a44', '#845838'));
      R(4, 22, RW - 8, 11, '#8a5a3b'); R(4, 21, RW - 8, 1, '#a0683f');
      for (let x = 8; x < RW - 8; x += 12) R(x, 24, 9, 7, '#7a4f33');
      windowAt(R, 74, 7, 28, 18, t);
      for (const [x, s] of [[8, 11], [116, 23]] as const) {
        const rnd = seeded(s);
        R(x, 4, 52, 34, '#6b4429'); R(x + 2, 6, 48, 31, '#3e2a1c');
        for (let r = 0; r < 4; r++) {
          const by = 6 + r * 8;
          R(x + 1, by + 7, 50, 1, '#8a5a3b');
          for (let bx = x + 3; bx < x + 47;) {
            const bw = 2 + Math.floor(rnd() * 2), bh = 4 + Math.floor(rnd() * 3);
            R(bx, by + 7 - bh, bw, bh, ['#c8553d', '#4a7fa7', '#6f9e83', '#f2cc8f', '#8a6aa7', '#e8a0bf', '#d9a05a'][Math.floor(rnd() * 7)]);
            bx += bw + (rnd() < 0.15 ? 2 : 0);
          }
        }
        shadow(R, x, 38, 52);
      }
      // your section: a brass plaque, and the sunflower sticking out of a book
      R(134, 2, 16, 3, '#e0b040'); R(136, 3, 12, 1, '#b88a20');
      R(156, 11, 1, 5, '#4f7f64'); R(155, 8, 3, 3, '#f2c94c'); R(154, 9, 1, 1, '#f2c94c'); R(158, 9, 1, 1, '#f2c94c'); R(156, 9, 1, 1, '#7a4a2c');
      // rug, armchair and lamp
      R(62, 50, 52, 26, '#2c5282'); R(64, 52, 48, 22, '#4a7fa7');
      for (let x = 66; x < 110; x += 6) R(x, 63, 3, 1, '#a8dbe8');
      shadow(R, 14, 72, 20);
      R(14, 50, 20, 9, '#4f7f64'); R(15, 51, 18, 1, '#6f9e83'); R(14, 58, 4, 14, '#4f7f64'); R(30, 58, 4, 14, '#4f7f64'); R(18, 60, 12, 9, '#6f9e83'); R(18, 60, 12, 1, '#93c47d');
      R(38, 43, 1, 24, INK); R(36, 66, 5, 2, INK); R(35, 40, 7, 4, '#f2cc8f'); R(36, 39, 5, 1, '#e0b040');
      const glow = `rgba(255,230,150,${(0.22 + Math.sin(t / 700) * 0.05).toFixed(3)})`;
      R(32, 67, 13, 2, glow); R(34, 66, 9, 4, glow);
      // the reading table: the open book with your sunflower, and a candle
      shadow(R, 70, 67, 36);
      R(70, 55, 36, 9, '#8a5a3b'); R(70, 55, 36, 1, '#a0683f'); R(70, 64, 36, 3, '#6b4429');
      R(80, 54, 16, 7, WHITE); R(87, 54, 2, 7, '#e3cfae'); for (let y = 56; y < 60; y += 2) { R(81, y, 5, 1, '#a89a88'); R(90, y, 5, 1, '#a89a88'); }
      R(92, 51, 1, 5, '#4f7f64'); R(91, 49, 3, 3, '#f2c94c'); R(92, 50, 1, 1, '#7a4a2c');
      R(100, 51, 3, 5, WHITE); R(101, 49 + (Math.sin(t / 150) > 0.6 ? 1 : 0), 1, 2, '#f2b04a'); R(101, 49, 1, 1, '#fff2a8');
      // a low bookcase on the side wall, a globe, a plant
      const rnd = seeded(5);
      shadow(R, 8, 120, 14);
      R(8, 88, 14, 32, '#6b4429'); R(10, 90, 10, 29, '#3e2a1c');
      for (let by = 90; by < 118; by += 7) { R(9, by + 6, 12, 1, '#8a5a3b'); for (let bx = 11; bx < 19; bx += 2) R(bx, by + 6 - 4 - Math.floor(rnd() * 2), 2, 4 + Math.floor(rnd() * 2), ['#c8553d', '#4a7fa7', '#6f9e83', '#f2cc8f'][Math.floor(rnd() * 4)]); }
      shadow(R, 150, 114, 14);
      R(156, 104, 2, 8, '#6b4429'); R(152, 112, 10, 2, '#6b4429');
      R(151, 92, 12, 12, '#4a7fa7'); R(153, 90, 8, 16, '#4a7fa7'); R(153, 94, 4, 3, '#6f9e83'); R(157, 98, 4, 4, '#6f9e83'); R(152, 96, 2, 2, '#93c47d');
      R(150, 91, 1, 14, '#e0b040');
      plant(R, 8, 128);
    },
  },

  // Bram's store: shelves of jam, teapots, candles, seed packets and lanterns, the counter with the till, crates of apples.
  bram: {
    resident: [152, 30],
    solids: [{ x: 8, y: 37, w: 88, h: 4 }, { x: 112, y: 44, w: 56, h: 16 }, { x: 9, y: 74 + LOW, w: 32, h: 17 }, { x: 156, y: 86 + LOW, w: 12, h: 14 }, { x: 56, y: 82, w: 44, h: 16 }],
    spots: [
      { id: 'shelf', label: '🧺 The shelf', box: { x: 8, y: 5, w: 88, h: 33 }, stand: [52, 52] },
      { id: 'till', label: "🧾 Bram's till", box: { x: 122, y: 33, w: 18, h: 15 }, stand: [130, 70] },
      { id: 'bram', label: '👋 Bram', box: { x: 150, y: 28, w: 12, h: 16 }, stand: [156, 70] },
    ],
    draw(R, t) {
      shell(R, '#e8d6b4', '#8a5a3b', planks('#c8915e', '#b07b4b'));
      for (let x = 8; x < RW - 6; x += 10) R(x, 4, 4, 29, '#e0caa2');
      // the shelf
      R(8, 5, 88, 33, '#6b4429'); R(10, 7, 84, 30, '#8a5a3b');
      for (const by of [16, 26, 36]) R(8, by, 88, 2, '#6b4429');
      for (let i = 0; i < 6; i++) { R(11 + i * 8, 10, 5, 6, '#c8402e'); R(11 + i * 8, 9, 5, 1, WHITE); R(12 + i * 8, 12, 3, 2, WHITE); }
      for (let i = 0; i < 3; i++) { const x = 62 + i * 11; R(x, 11, 7, 5, '#6f9e83'); R(x + 2, 10, 3, 1, '#6f9e83'); R(x + 3, 9, 1, 1, '#4f7f64'); R(x + 7, 12, 2, 1, '#6f9e83'); R(x - 1, 12, 1, 2, '#4f7f64'); }
      for (let i = 0; i < 7; i++) { R(11 + i * 5, 20, 3, 6, WHITE); R(12 + i * 5, 19, 1, 1, Math.sin(t / 140 + i) > 0 ? '#f2b04a' : '#fff2a8'); }
      ['#93c47d', '#e8a0bf', '#f2cc8f', '#a8dbe8', '#d9694a', '#93c47d'].forEach((c, i) => { R(50 + i * 7, 19, 5, 7, c); R(51 + i * 7, 21, 3, 3, WHITE); R(52 + i * 7, 22, 1, 1, '#4f7f64'); });
      for (let i = 0; i < 7; i++) { const x = 12 + i * 12; R(x, 29, 7, 7, INK); R(x + 1, 30, 5, 5, '#f2cc8f'); R(x + 2, 27, 3, 2, INK); R(x + 3, 26, 1, 1, INK); }
      shadow(R, 8, 38, 88);
      // Bram's gold star on the wall
      R(158, 10, 1, 1, '#f2c94c'); R(156, 12, 5, 2, '#f2c94c'); R(157, 11, 3, 5, '#f2c94c'); R(156, 16, 1, 1, '#f2c94c'); R(160, 16, 1, 1, '#f2c94c');
      windowAt(R, 112, 9, 24, 16, t, '#d9694a');
      // the counter, the discount sign and the till
      shadow(R, 112, 59, 56);
      R(112, 44, 56, 5, '#d8b07a'); R(112, 44, 56, 1, '#ecc898'); R(112, 49, 56, 10, '#a0683f');
      for (let x = 126; x < 168; x += 14) R(x, 49, 1, 10, '#7a4a2c');
      R(113, 38, 8, 7, WHITE); R(114, 39, 1, 1, '#c8402e'); R(119, 43, 1, 1, '#c8402e'); for (let k = 0; k < 5; k++) R(119 - k, 39 + k, 1, 1, '#c8402e');
      R(124, 36, 16, 9, '#7a8a96'); R(124, 36, 16, 1, '#9aaab6'); R(126, 33, 9, 3, INK); R(127, 34, 7, 1, '#93c47d');
      for (let k = 0; k < 4; k++) { R(126 + k * 3, 38, 2, 1, WHITE); R(126 + k * 3, 40, 2, 1, WHITE); }
      R(124, 43, 16, 2, '#5a6a76');
      // crates of apples and a barrel, by the front wall
      const b = LOW;
      shadow(R, 9, 90 + b, 32);
      R(10, 76 + b, 18, 14, '#a0683f'); R(10, 80 + b, 18, 1, '#7a4a2c'); R(10, 85 + b, 18, 1, '#7a4a2c');
      for (let k = 0; k < 4; k++) { R(12 + k * 4, 74 + b, 3, 3, '#c8402e'); R(13 + k * 4, 73 + b, 1, 1, '#4f7f64'); }
      R(30, 78 + b, 10, 12, '#8a5a3b'); R(30, 80 + b, 10, 1, '#5a3a24'); R(30, 87 + b, 10, 1, '#5a3a24'); R(31, 77 + b, 8, 1, '#a0683f');
      plant(R, 156, 84 + b);
      // a display table: pumpkins, a basket of bread, a stack of jars
      shadow(R, 56, 98, 44);
      R(56, 82, 44, 8, '#d8b07a'); R(56, 82, 44, 1, '#ecc898'); R(56, 90, 44, 8, '#a0683f'); R(58, 90, 1, 8, '#7a4a2c'); R(97, 90, 1, 8, '#7a4a2c');
      for (const px of [59, 66]) { R(px, 78, 6, 5, '#e88a3a'); R(px + 2, 78, 1, 5, '#c86a2a'); R(px + 2, 77, 2, 1, '#4f7f64'); }
      R(74, 79, 12, 4, '#c98a4a'); R(75, 77, 4, 3, '#e0a860'); R(80, 77, 4, 3, '#d9a05a'); R(74, 79, 12, 1, '#a06a30');
      for (let k = 0; k < 3; k++) { R(89 + k * 3, 79, 3, 4, '#c8402e'); R(89 + k * 3, 78, 3, 1, WHITE); } R(90, 75, 3, 4, '#f2cc8f'); R(90, 74, 3, 1, WHITE);
    },
  },

  // City Hall: pilasters and wainscot, the town seal between two banners, the records cabinet, the notice board
  // with the proposed holiday, Fern's big desk on a red carpet, and the visitors' book by the door.
  fern: {
    resident: [84, 28],
    solids: [{ x: 10, y: 37, w: 18, h: 9 }, { x: 60, y: 42, w: 56, h: 14 }, { x: 50, y: 82 + LOW, w: 11, h: 10 }, { x: 8, y: 86 + LOW, w: 12, h: 14 }, { x: 156, y: 86 + LOW, w: 12, h: 14 }, { x: 10, y: 84, w: 30, h: 8 }, { x: 136, y: 84, w: 30, h: 8 }],
    spots: [
      { id: 'records', label: '🗄️ The town records', box: { x: 9, y: 17, w: 20, h: 29 }, stand: [20, 58] },
      { id: 'proposal', label: '📜 The notice board', box: { x: 135, y: 5, w: 32, h: 23 }, stand: [150, 50] },
      { id: 'book', label: "🖋️ The visitors' book", box: { x: 48, y: 77 + LOW, w: 15, h: 15 }, stand: [70, 88 + LOW] },
      { id: 'fern', label: '👋 Fern', box: { x: 82, y: 26, w: 12, h: 16 }, stand: [88, 66] },
    ],
    draw(R, t) {
      shell(R, '#c9d6df', '#6b4429', planks('#8a5a3b', '#74492f'));
      R(4, 22, RW - 8, 11, '#6b4429'); R(4, 21, RW - 8, 1, '#a0683f');
      for (let x = 8; x < RW - 8; x += 16) R(x, 24, 12, 7, '#7a4f33');
      for (const x of [38, 134 - 6]) { R(x, 4, 6, 17, '#eef2f4'); R(x - 1, 4, 8, 2, WHITE); R(x + 2, 6, 1, 15, '#d6dfe5'); }
      // banners and the town seal
      for (const [x, c] of [[62, '#4f7f64'], [106, '#d9694a']] as const) { R(x, 5, 8, 13, c); R(x, 18, 3, 2, c); R(x + 5, 18, 3, 2, c); R(x + 3, 9, 2, 4, '#f2cc8f'); R(x - 1, 4, 10, 1, '#e0b040'); }
      R(79, 5, 18, 16, '#e0b040'); R(81, 4, 14, 18, '#e0b040'); R(81, 7, 14, 12, '#4f7f64'); R(83, 6, 10, 14, '#4f7f64');
      R(84, 12, 8, 6, WHITE); R(85, 10, 6, 2, '#d9694a'); R(86, 9, 4, 1, '#d9694a'); R(87, 15, 2, 3, '#a0683f');
      // records cabinet
      shadow(R, 10, 45, 18);
      R(10, 17, 18, 28, '#7a8a96'); R(10, 17, 18, 1, '#9aaab6');
      for (let y = 21; y < 44; y += 7) { R(11, y, 16, 1, '#5a6a76'); R(17, y + 3, 4, 1, '#e0b040'); R(14, y + 2, 2, 2, WHITE); }
      // the notice board, with the proposal and its red seal
      R(135, 5, 32, 22, '#8a5a3b'); R(136, 6, 30, 20, '#c99a5e');
      R(138, 8, 14, 16, WHITE); for (let y = 10; y < 20; y += 2) R(140, y, 10, 1, '#a89a88'); R(147, 20, 3, 3, '#c8402e');
      R(154, 9, 9, 7, '#fff2a8'); R(155, 11, 6, 1, '#a89a88'); R(156, 18, 8, 6, '#e8a0bf');
      // the red carpet, Fern's desk
      R(80, 40, 16, RH - 49, '#b8533a'); R(80, 40, 1, RH - 49, '#e0b040'); R(95, 40, 1, RH - 49, '#e0b040');
      shadow(R, 60, 55, 56);
      R(60, 42, 56, 6, '#6b4429'); R(60, 42, 56, 1, '#8a5a3b'); R(60, 48, 56, 7, '#4e3020'); R(62, 49, 1, 5, '#3a2416'); R(113, 49, 1, 5, '#3a2416');
      R(66, 43, 9, 4, WHITE); R(68, 42, 9, 4, '#f6e7cf'); R(98, 43, 6, 3, '#e8a0bf'); R(104, 43, 3, 3, '#2a2a3a'); R(107, 39, 1, 5, WHITE); R(108, 38, 1, 3, WHITE);
      R(84, 50, 9, 3, '#e0b040');
      // the visitors' book by the door, and two plants
      const b = LOW;
      shadow(R, 50, 91 + b, 11);
      R(54, 84 + b, 3, 7, '#6b4429'); R(51, 90 + b, 9, 1, '#6b4429'); R(49, 80 + b, 13, 5, '#8a5a3b');
      R(50, 78 + b, 11, 3, WHITE); R(55, 78 + b, 1, 3, '#e3cfae'); R(57, 76 + b + (Math.sin(t / 500) > 0 ? 0 : 1), 1, 3, WHITE);
      plant(R, 8, 86 + b); plant(R, 156, 86 + b);
      // benches for visitors waiting to see the council
      for (const bx of [10, 136]) {
        shadow(R, bx, 92, 30);
        R(bx, 78, 30, 4, '#6b4429'); R(bx, 82, 30, 5, '#8a5a3b'); R(bx, 82, 30, 1, '#a0683f'); R(bx + 2, 87, 2, 4, '#4e3020'); R(bx + 26, 87, 2, 4, '#4e3020');
      }
    },
  },
  // Brine's little boat, moored at the pier: the wheelhouse at the stern, the wheel, a paddle wheel on each side,
  // the funnel amidships, a lobster pot, Brine coiling rope at the bow, a line out over the side, and Juniper's gold star on the rail.
  juniper: {
    who: 'brine',
    away: {
      where: 'Aboard', exit: '⚓ Back ashore',
      hint: v => v.out ? 'Out at sea. Talk to Brine to sail home.' : 'Talk to Brine to sail out to sea. The gangplank takes you back ashore.',
      out: v => v.out ? 'talk to Brine to sail home' : 'go back ashore by the gangplank',
    },
    // the deck always; the gangplank and the pier only while moored
    walk: (x, y, v) => (x >= 16 && x <= 160 && Math.abs(y - CY) < hull(x) - 5)
      || (voyage(v, performance.now()).k === 0 && ((x >= 81 && x < 95 && y >= 104 && y < 136) || (x >= 7 && x <= RW - 7 && y >= 132 && y <= RH - 4))),
    scene: (v, t) => { const { p } = voyage(v, t); return p < 1 ? p : null; },
    gone: (id, v) => id === 'leave' && voyage(v, performance.now()).k > 0,
    resident: [130, 80],
    solids: [{ x: 22, y: 50, w: 32, h: 50 }, { x: 60, y: 68, w: 8, h: 8 }, { x: 83, y: 66, w: 12, h: 12 }, { x: 142, y: 86, w: 12, h: 10 }, { x: 100, y: 96, w: 20, h: 10 }],
    spots: [
      { id: 'brine', label: '👋 Brine', box: { x: 128, y: 78, w: 12, h: 16 }, stand: [120, 93] },
      { id: 'star', label: "⭐ Juniper's star", box: { x: 106, y: 32, w: 12, h: 12 }, stand: [112, 50] },
      { id: 'rod', label: '🎣 The line', box: { x: 124, y: 12, w: 36, h: 34 }, stand: [128, 54] },
      { id: 'wheel', label: '☸️ The wheel', box: { x: 56, y: 63, w: 14, h: 14 }, stand: [63, 88] },
      { id: 'paddles', label: '🛞 The paddle wheels', box: { x: PADDLE_X, y: CY - 50, w: PADDLE_W, h: 12 }, stand: [67, 48] },
    ],
    draw(R, t, v) {
      const night = dark(), sea = night ? '#2c3f5c' : '#5b93bf', glint = night ? '#4a5f80' : '#8fbde0';
      // the voyage: the gangplank comes up first, then the paddle wheels start turning and the pier slides away behind
      const { k } = voyage(v, t), plank = clamp01(1 - k / 0.2), away = ease(clamp01((k - 0.2) / 0.8)), power = ease(clamp01((k - 0.1) / 0.5));
      const ox = -Math.round(away * (RW + 10)), dt = Math.min(50, Math.max(0, t - seaT)); seaT = t;
      seaX += dt * (1 / 90 - away * (1 / 90 + 1 / 28));
      paddleA += dt * power / 22;
      R(0, 0, RW, RH, INK); R(4, 4, RW - 8, RH - 8, sea);
      // little waves, drifting (streaming past under way); stars on the water at night
      const span = RW - 18, mod = (n: number) => ((n % span) + span) % span;
      for (let i = 0; i < 46; i++) {
        const wx = 6 + mod(i * 37 + seaX), wy = 6 + ((i * 53) % (RH - 30));
        if (Math.abs(wy - CY) < hull(wx) + 3 || Math.abs(wy - CY) < hull(wx + 4) + 3) continue;
        if (wx + 4 >= PADDLE_X - 2 && wx <= PADDLE_X + PADDLE_W && Math.abs(wy - CY) < 52) continue;
        R(wx, wy, 4, 1, (Math.floor(t / 700) + i) % 5 ? glint : WHITE);
        if (night && i % 6 === 0) R(wx + 2, wy + 3, 1, 1, (Math.floor(t / 600) + i) % 4 ? '#fff2a8' : '#8890b0');
      }
      // the pier, its posts, a bollard with the mooring rope (cast off as you leave), and a gull keeping watch
      if (ox > -RW) {
        const P: Rect = (x, y, w, h, c) => R(x + ox, y, w, h, c);
        P(4, 128, RW - 8, 22, '#a0764e'); P(4, 128, RW - 8, 1, '#c49a6c'); P(4, 129, RW - 8, 1, 'rgba(0,0,0,.15)');
        for (let x = 10; x < RW - 4; x += 7) P(x, 130, 1, 20, '#8a6240');
        for (const px of [8, 46, 126, 164]) { P(px, 125, 4, 5, '#6b4429'); P(px, 125, 4, 1, '#8a5a3b'); }
        P(66, 133, 6, 5, '#5a5a62'); P(67, 132, 4, 1, '#7a7a84');
        if (k === 0) { P(69, 116, 1, 17, '#c8a870'); P(70, 120, 1, 4, '#c8a870'); } else P(68, 131, 3, 2, '#c8a870');
        P(165, 121, 4, 3, WHITE); P(164, 120, 2, 2, WHITE); P(163, 121, 1, 1, '#f2b04a'); P(166, 121, 3, 1, '#b8c0c8'); P(165, 124, 1, 1, '#f2b04a'); P(167, 124, 1, 1, '#f2b04a');
      }
      // out at sea: now and then a dolphin leaps alongside
      if (away > 0.9) {
        const q = (t % 6500) / 1500;
        if (q < 1) { const dx = 150 - q * 50, dy = 126 - Math.sin(q * Math.PI) * 9; R(dx, dy, 7, 2, '#6a7f99'); R(dx + 1, dy - 1, 4, 1, '#8a9fb9'); R(dx + 3, dy - 2, 2, 1, '#6a7f99'); R(dx + 7, dy + 1, 2, 2, '#6a7f99'); }
        if (q >= 1 && q < 1.3) R(100 - (q - 1) * 10, 127, 8, 1, 'rgba(255,255,255,.6)');
      }
      // the hull: blue sides, a wooden rail, a planked deck (rounded at the stern, pointed at the bow)
      for (let x = 10; x <= 168; x++) {
        const h = Math.floor(hull(x + 0.5)); if (h <= 0) continue;
        R(x, CY + h, 1, 2, 'rgba(0,0,0,.18)');
        if ((x + Math.floor(t / (140 - 100 * away))) % 9 < 2 + away * 3) { R(x, CY + h + 2, 1, 1, 'rgba(255,255,255,.55)'); if (away > 0.5) R(x, CY - h - 2, 1, 1, 'rgba(255,255,255,.45)'); }
        R(x, CY - h, 1, 2 * h, '#4a7fa7'); R(x, CY - h, 1, 1, '#7aa8cc'); R(x, CY + h - 2, 1, 2, '#365f7f');
        if (h > 2) R(x, CY - h + 2, 1, 2 * h - 4, '#8a5a3b');
        const d = h - 4; if (d <= 0) continue;
        R(x, CY - d, 1, 2 * d, '#c49a6c');
        for (let y = CY - 36, row = 0; y < CY + 36; y += 6, row++) {
          if (Math.abs(y - CY) >= d) continue;
          R(x, y, 1, 1, '#a0764e');
          if ((x + (row % 2 ? 14 : 0)) % 28 === 0) R(x, y, 1, Math.min(6, CY + d - y), '#a0764e');
        }
      }
      // the gangplank down to the pier, pulled aboard when Brine casts off
      if (plank > 0) {
        const len = Math.round(26 * plank);
        R(81, 106, 14, len, '#8a5a3b'); R(82, 106, 12, len, '#b08458');
        for (let y = 109; y < 106 + len; y += 4) R(82, y, 12, 1, '#8a6240');
        R(81, 106 + len, 14, 2, 'rgba(0,0,0,.18)');
      }
      // the paddle wheels, one on each side
      paddleWheel(R, -1, t, power); paddleWheel(R, 1, t, power);
      // spray off the bow under way
      if (away > 0.3) for (let i = 0; i < 4; i++) { const ph = (t / 500 + i / 4) % 1; R(168 + ph * 5, CY - 3 + (i % 2 ? -1 : 1) * ph * 8, 1, 1, `rgba(255,255,255,${(0.8 * (1 - ph) * away).toFixed(2)})`); }
      // the wheelhouse: white roof, a stovepipe puffing, a lifebuoy, and windows that glow at night
      shadow(R, 22, 100, 32);
      R(22, 50, 32, 50, '#c8c0b0'); R(23, 51, 30, 48, '#fffaf0');
      for (let y = 57; y < 99; y += 6) R(23, y, 30, 1, '#ece4d4');
      R(52, 55, 2, 40, night ? '#f2cc8f' : '#a8dbe8'); R(52, 74, 2, 2, '#c8c0b0');
      if (night) R(54, 55, 3, 40, 'rgba(255,230,150,.18)');
      R(29, 59, 5, 5, '#3a3640'); R(30, 60, 3, 3, '#2a2630');
      for (let k = 0; k < 3; k++) {
        const ph = (t / 1300 + k / 3) % 1;
        R(31 + Math.sin(t / 340 + k * 2) * 1.5, 57 - ph * 12, 2, 2, `rgba(255,255,255,${(0.7 * (1 - ph)).toFixed(2)})`);
      }
      R(37, 78, 6, 8, '#d1495b'); R(36, 79, 8, 6, '#d1495b'); R(39, 80, 2, 4, '#fffaf0'); R(38, 81, 4, 2, '#fffaf0');
      R(39, 78, 2, 1, WHITE); R(39, 85, 2, 1, WHITE); R(36, 81, 1, 2, WHITE); R(43, 81, 1, 2, WHITE);
      // the wheel
      shadow(R, 59, 76, 10);
      R(62, 72, 3, 4, '#6b4429');
      R(60, 65, 7, 1, '#a0683f'); R(60, 73, 7, 1, '#a0683f'); R(58, 67, 1, 5, '#a0683f'); R(68, 67, 1, 5, '#a0683f');
      R(59, 66, 1, 1, '#a0683f'); R(67, 66, 1, 1, '#a0683f'); R(59, 72, 1, 1, '#a0683f'); R(67, 72, 1, 1, '#a0683f');
      R(63, 64, 1, 11, '#8a5a3b'); R(57, 69, 13, 1, '#8a5a3b'); R(62, 68, 3, 3, '#e0b040');
      // the funnel amidships, seen from above: red, with a black rim, puffing harder (and the smoke streaming aft) under way
      shadow(R, 83, 78, 12);
      R(84, 67, 10, 10, '#d1495b'); R(83, 68, 12, 8, '#d1495b'); R(85, 66, 8, 12, '#d1495b');
      R(85, 68, 8, 8, '#2a2630'); R(86, 67, 6, 10, '#2a2630'); R(84, 69, 10, 6, '#2a2630');
      R(86, 69, 6, 6, '#1a1820'); R(85, 66, 3, 1, '#e8798a'); R(84, 67, 1, 2, '#e8798a');
      for (let i = 0, n = 3 + Math.round(power * 3); i < n; i++) {
        const ph = (t / (1500 - power * 900) + i / n) % 1, sx = 88 - ph * (3 + power * 34) + Math.sin(t / 300 + i * 2) * (1 - power), sy = 71 - ph * (13 - power * 9);
        R(sx, sy, 3, 3, `rgba(${night ? '200,205,215' : '235,235,240'},${(0.75 * (1 - ph)).toFixed(2)})`);
      }
      // a lantern hung on the funnel's front, glowing at night
      R(95, 70, 3, 4, '#3a2416'); R(95, 71, 3, 2, night ? '#ffe08a' : '#e0b040');
      if (night) { const g = `rgba(255,230,150,${(0.25 + Math.sin(t / 600) * 0.06).toFixed(3)})`; R(92, 67, 9, 9, g); R(90, 69, 13, 5, g); }
      // the lobster pot and its float
      shadow(R, 100, 106, 14);
      R(100, 96, 14, 10, '#8a6a40'); for (let k = 0; k < 6; k++) R(101 + k * 2, 97, 1, 8, '#b89060'); R(100, 100, 14, 1, '#b89060');
      R(115, 100, 5, 5, '#d1495b'); R(116, 99, 3, 1, '#d1495b'); R(116, 102, 3, 1, WHITE);
      // the coil of rope Brine is working on
      shadow(R, 142, 96, 12);
      R(142, 86, 12, 10, '#c8a870'); R(143, 85, 10, 12, '#c8a870'); R(144, 88, 8, 6, '#a8885a'); R(146, 89, 4, 4, '#c8a870'); R(147, 90, 2, 2, '#8a6a40');
      R(138, 90, 4, 1, '#c8a870');
      // the line out over the side: rod, reel, and a float bobbing on the water
      for (let i = 0; i <= 26; i++) R(126 + i, 44 - Math.round(i * 30 / 26), 1, 1, i > 20 ? '#a0683f' : '#6b4429');
      R(127, 41, 3, 3, '#7a8a96');
      const bob = Math.round(Math.sin(t / 380));
      for (let y = 15; y < 25 + bob; y++) R(152 + Math.floor((y - 15) / 3), y, 1, 1, 'rgba(255,255,255,.6)');
      R(155, 25 + bob, 3, 2, '#d1495b'); R(155, 27 + bob, 3, 1, WHITE);
      const rip = (t / 1600) % 1; R(156 - rip * 6, 29, 1 + rip * 12, 1, `rgba(255,255,255,${(0.5 * (1 - rip)).toFixed(2)})`);
      // Juniper's gold star on the rail, a little crooked, catching the light now and then
      const S = (dx: number, dy: number, w: number, c = '#f2c94c') => R(109 + dx, 35 + dy, w, 1, c);
      S(3, 0, 1); S(3, 1, 1); S(0, 2, 7); S(1, 3, 5); S(2, 4, 3); S(1, 5, 2); S(4, 5, 2); S(0, 6, 2); S(5, 6, 2);
      S(3, 3, 1, '#fff2a8');
      if (Math.sin(t / 700) > 0.92) { R(118, 31, 1, 3, WHITE); R(117, 32, 3, 1, WHITE); }
      // a gull, passing over
      const gx = 4 + ((t / 55) % (RW + 30)) - 15, gy = 18 + Math.sin(t / 500) * 3, fl = Math.sin(t / 120) > 0 ? 0 : 1;
      if (gx > 4 && gx < RW - 10) { R(gx, gy + fl, 2, 1, WHITE); R(gx + 2, gy + 1, 1, 1, WHITE); R(gx + 3, gy + fl, 2, 1, WHITE); }
      // the frame again, over anything that slid past its edge
      R(0, 0, RW, 4, INK); R(0, RH - 4, RW, 4, INK); R(0, 0, 4, RH, INK); R(RW - 4, 0, 4, RH, INK);
    },
  },
  // ---------- The three beehives in the meadow (Rowan's tulip). You're as small as a bee in here. ----------
  // The nursery hive: brood cells on the back wall, a cradle comb where a nurse bee hums to the larvae, the bee bread.
  nursery: {
    ...hive('the nursery hive'),
    solids: [{ x: 112, y: 44, w: 44, h: 30 }, { x: 12, y: 94, w: 32, h: 12 }],
    spots: [
      { id: 'cells', label: '🐛 The brood cells', box: { x: 8, y: 4, w: 84, h: 29 }, stand: [48, 46] },
      { id: 'nurse', label: '🐝 The nurse bee', box: { x: 110, y: 26, w: 48, h: 48 }, stand: [134, 84] },
      { id: 'bread', label: '🌼 The bee bread', box: { x: 10, y: 86, w: 36, h: 21 }, stand: [54, 100] },
    ],
    draw(R, t) {
      const pollen = ['#f2b23a', '#e07a2a', '#b48ad1', '#f6d24a'];
      hiveShell(R, t, (x, y, n) => {
        const p = cellRand(n);
        // brood to the left: larvae, capped cells (bees on the way), an egg here and there; pollen and honey to the right
        if (x < 96) { if (p < 0.45) { cell(R, x, y, BROOD); larva(R, x, y); } else if (p < 0.8) capped(R, x, y, '#d9a456'); else { cell(R, x, y, BROOD); R(x + 4, y + 2, 1, 2, WHITE); } }
        else if (p < 0.5) cell(R, x, y, pollen[Math.floor(cellRand(n, 1) * 4)]);
        else if (p < 0.75) honeyCell(R, x, y, t, n);
      });
      // the cradle comb, a larva in every cell
      shadow(R, 112, 74, 44);
      R(112, 44, 44, 30, '#a86a20'); R(112, 44, 44, 1, WAX2);
      for (let row = 0, y = 46; y < 70; row++, y += 6) for (let x = 112 + (row % 2 ? 4 : 0); x + 8 <= 156; x += 8) { cell(R, x, y, BROOD); larva(R, x, y); }
      R(112, 72, 44, 2, '#7a4a16');
      // the nurse bee hovering over it, humming a lullaby (the notes drift up and fade)
      const nx = 126 + Math.sin(t / 1500) * 12, ny = 32 + Math.sin(t / 400) * 1.5;
      bee(R, nx, ny, t, Math.cos(t / 1500) > 0 ? 1 : -1);
      for (let k = 0; k < 2; k++) {
        const ph = (t / 2200 + k / 2) % 1, mx = 140 + k * 8 + Math.sin(t / 500 + k) * 2, my = 30 - ph * 22;
        const c = `rgba(90,52,18,${(0.8 * (1 - ph)).toFixed(2)})`;
        R(mx, my, 1, 4, c); R(mx - 2, my + 3, 2, 2, c); R(mx + 1, my, 2, 1, c);
      }
      // the bee bread: pollen packed into a low comb, and a forager kicking off her pollen baskets
      shadow(R, 12, 106, 32);
      R(12, 92, 32, 14, '#a86a20'); R(12, 92, 32, 1, WAX2);
      for (let row = 0, y = 93; y < 104; row++, y += 6) for (let x = 12 + (row % 2 ? 4 : 0), n = 0; x + 8 <= 44; x += 8, n++) cell(R, x, y, pollen[(n + row * 2) % 4]);
      const fx = 22 + Math.round(Math.sin(t / 700) * 2);
      bee(R, fx, 83, t); R(fx + 3, 90, 2, 2, '#e07a2a'); R(fx + 6, 90, 2, 2, '#f2b23a');
      // nurse bees flying about
      flyer(R, { x: 16, y: 40, w: 70, h: 14 }, t, 0);
      flyer(R, { x: 60, y: 60, w: 40, h: 40 }, t, 1);
    },
  },
  // The honey store: shelves of capped comb glowing gold, the big cell the foragers are filling with nectar
  // (a Monoid: every flower combined with <>), and the fanners drying it into honey by the far wall.
  honey: {
    ...hive('the honey-store hive'),
    solids: [{ x: 10, y: 44, w: 20, h: 40 }, { x: 36, y: 44, w: 20, h: 40 }, { x: 74, y: 56, w: 30, h: 18 }, { x: 126, y: 52, w: 40, h: 18 }],
    spots: [
      { id: 'comb', label: '🍯 The honey shelves', box: { x: 8, y: 42, w: 50, h: 44 }, stand: [44, 94] },
      { id: 'nectar', label: '🌸 The nectar cell', box: { x: 70, y: 42, w: 36, h: 32 }, stand: [88, 86] },
      { id: 'fanners', label: '💨 The fanners', box: { x: 124, y: 42, w: 44, h: 30 }, stand: [144, 82] },
    ],
    draw(R, t, v) {
      hiveShell(R, t, (x, y, n) => { if (cellRand(n) < 0.55) capped(R, x, y); else honeyCell(R, x, y, t, n); });
      // two shelves of capped comb, glowing
      const glow = (0.1 + Math.sin(t / 900) * 0.05).toFixed(3);
      for (const fx of [10, 36]) {
        shadow(R, fx, 84, 20);
        R(fx, 44, 20, 40, '#7a4a16'); R(fx + 1, 45, 18, 38, '#a86a20'); R(fx, 44, 20, 1, WAX2);
        for (let row = 0, y = 46; y + 6 <= 83; row++, y += 6) for (let x = fx + 1 + (row % 2 ? 4 : 0); x + 8 <= fx + 20; x += 8) {
          const n = fx * 10 + row * 3 + x; if (cellRand(n) < 0.7) capped(R, x, y); else honeyCell(R, x, y, t, n);
        }
        R(fx - 2, 42, 24, 44, `rgba(255,214,90,${glow})`);
      }
      // the nectar cell, and a drop falling in just after a forager pours
      shadow(R, 74, 74, 30);
      nectarCell(R, 76, 50, Number(v.drops) || 0);
      const since = t - (Number(v.poured) || -Infinity);
      if (since < 500) R(88, 40 + (since / 500) * 14, 2, 2, GLINT);
      bee(R, 84 + Math.sin(t / 600) * 6, 34 + Math.sin(t / 300), t, Math.cos(t / 600) > 0 ? 1 : -1);
      // the fanners in a row, wings a blur, the breeze streaming past
      for (let i = 0; i < 3; i++) bee(R, 128 + i * 13, 56 + (i % 2) * 4, t + i * 40, -1, true);
      for (let i = 0; i < 4; i++) { const ph = (t / 700 + i / 4) % 1; R(122 - ph * 30, 52 + i * 5, 6, 1, `rgba(255,250,240,${(0.5 * (1 - ph)).toFixed(2)})`); }
      // foragers coming and going
      flyer(R, { x: 60, y: 90, w: 60, h: 30 }, t, 2);
      flyer(R, { x: 100, y: 80, w: 56, h: 30 }, t, 3);
    },
  },
  // The queen's hive: the queen on her comb with her attendants round her, the waggle dance on the floor,
  // and the royal cells hanging from the back wall.
  queen: {
    ...hive("the queen's hive", true),
    solids: [{ x: 70, y: 48, w: 36, h: 20 }, { x: 18, y: 62, w: 36, h: 22 }],
    spots: [
      { id: 'queen', label: '👑 The queen', box: { x: 68, y: 36, w: 40, h: 32 }, stand: [88, 82] },
      { id: 'dance', label: '💃 The waggle dance', box: { x: 14, y: 52, w: 44, h: 36 }, stand: [36, 98] },
      { id: 'royal', label: '🥜 The royal cells', box: { x: 126, y: 4, w: 42, h: 30 }, stand: [146, 48] },
    ],
    draw(R, t) {
      hiveShell(R, t, (x, y, n) => {
        if (x >= 124) return; // the royal cells hang there
        const p = cellRand(n); if (p < 0.4) honeyCell(R, x, y, t, n); else if (p < 0.7) capped(R, x, y, '#d9a456'); else if (p < 0.85) { cell(R, x, y, BROOD); larva(R, x, y); }
      });
      // the royal cells: big, lumpy, like peanuts hanging down
      for (const [x, y, h] of [[130, 6, 17], [143, 5, 21], [156, 7, 16]]) {
        for (let k = 0; k < h; k++) { const hw = Math.round(2.5 + Math.sin((k / h) * Math.PI) * 1.6 + (k % 6 < 3 ? 0.4 : 0)); R(x + 4 - hw, y + k, hw * 2, 1, '#d9a456'); }
        R(x + 3, y + h, 2, 1, '#b97a2a');
        for (let k = 2; k < h - 1; k += 3) R(x + 2 + (k % 2) * 3, y + k, 1, 1, '#b97a2a');
        R(x + 3, y + 2, 1, h - 5, 'rgba(255,255,255,.3)');
      }
      // the queen's comb, a raised platform, and the queen on it
      shadow(R, 70, 68, 36);
      R(70, 52, 36, 16, '#a86a20'); R(72, 48, 32, 5, WAX2); R(70, 52, 36, 1, '#f0c060');
      for (let x = 72; x + 8 <= 104; x += 8) cell(R, x, 55, WAX2);
      R(70, 66, 36, 2, '#7a4a16');
      const qx = 80, qy = 41 + Math.round(Math.sin(t / 1200)), up = Math.floor(t / 120) % 2;
      R(qx + 6, qy + up, 3, 3, 'rgba(255,255,255,.9)'); R(qx + 9, qy + up, 3, 3, 'rgba(225,238,255,.85)');
      R(qx + 1, qy + 3, 12, 5, '#e8a828'); R(qx, qy + 4, 1, 3, '#e8a828'); R(qx + 2, qy + 8, 10, 1, '#c88a20');
      for (const s of [3, 6, 9]) R(qx + s, qy + 3, 1, 5, '#5a3412');
      R(qx + 13, qy + 3, 3, 5, INK); R(qx + 14, qy + 4, 1, 1, WHITE); R(qx + 15, qy + 2, 1, 1, INK);
      R(qx + 13, qy + 1, 3, 1, '#ffd84a'); R(qx + 13, qy, 1, 1, '#ffd84a'); R(qx + 15, qy, 1, 1, '#ffd84a');
      if (Math.sin(t / 650) > 0.9) { R(qx + 17, qy - 2, 1, 3, WHITE); R(qx + 16, qy - 1, 3, 1, WHITE); }
      // her attendants, all facing her
      for (const [ax, ay] of [[58, 44], [62, 56], [108, 42], [110, 56]]) bee(R, ax, ay + Math.round(Math.sin(t / 700 + ax)), t + ax * 13, ax < 88 ? 1 : -1);
      // the waggle dance: a run with a wiggle, then a loop round, over and over, with bees watching
      shadow(R, 18, 84, 36);
      R(18, 64, 36, 20, 'rgba(168,106,32,.35)');
      const s = t / 1100, dx = 31 + Math.sin(s) * 12 + (Math.cos(s) > 0.7 ? Math.sin(t / 40) : 0), dy = 70 + Math.sin(2 * s) * 5;
      bee(R, dx, dy, t, Math.cos(s) > 0 ? 1 : -1);
      for (const [wx, wy, d] of [[12, 66, 1], [14, 78, 1], [52, 64, -1], [50, 78, -1]] as const) bee(R, wx, wy, t + wx * 31, d);
      flyer(R, { x: 110, y: 74, w: 50, h: 40 }, t, 4);
      flyer(R, { x: 56, y: 92, w: 60, h: 30 }, t, 5);
    },
  },
  // ---------- The magical beach (Brine's conch at the Duck Pond). Somewhere warm, not on any map. ----------
  // The sea along the top with the waves rolling in, the tideline where shells wash up forever (`cycle`), a rock pool,
  // a hermit crab shell-shopping, a palm, and the conch on the sand: the way back to the pond.
  brine: {
    name: 'the magical beach', voice: crabPortrait,
    away: { where: 'On', exit: '🐚 The conch', hint: () => 'The conch on the sand takes you back to the Duck Pond.', out: () => 'go back to the Duck Pond by the conch' },
    // the sand, below where the waves reach
    walk: (x, y) => x >= 7 && x <= RW - 7 && y >= 66 && y <= RH - 4,
    // interiors.ts sets `since` when you arrive
    scene: (v, t) => { const k = (t - (Number(v.since) || -Infinity)) / WASH_MS; return k >= 0 && k < 1 ? k : null; },
    cover: washCover,
    solids: [{ x: 124, y: 88, w: 42, h: 24 }, { x: 12, y: 130, w: 8, h: 6 }],
    spots: [
      { id: 'waves', label: '🌊 The waves', box: { x: 4, y: 4, w: 168, h: 44 }, stand: [124, 70] },
      { id: 'tideline', label: '🐚 The tideline', box: { x: 16, y: 56, w: 86, h: 12 }, stand: [58, 74] },
      { id: 'crab', label: '🦀 The hermit crab', box: { x: 40, y: 90, w: 56, h: 18 }, stand: [68, 116] },
      { id: 'pool', label: '⭐ The rock pool', box: { x: 122, y: 82, w: 46, h: 34 }, stand: [144, 124] },
    ],
    draw(R, t, v) {
      const night = dark(), c = shore(night);
      R(0, 0, RW, RH, INK); R(4, 4, RW - 8, RH - 8, c.sand);
      const rnd = seeded(11);
      for (let i = 0; i < 80; i++) R(5 + Math.floor(rnd() * (RW - 12)), 64 + Math.floor(rnd() * (RH - 70)), 1, 1, c.speck);
      // the sea, the shallows and the foam, washing up and drawing back; the sand it leaves behind is wet
      for (let x = 4; x < RW - 4; x++) {
        const w = waterline(x, t);
        R(x, 4, 1, 59 + Math.round(Math.sin(x / 9)) - 4, c.wet);
        R(x, 4, 1, w - 4, c.sea); R(x, 4, 1, 12 + Math.round(Math.sin(x / 21 + 1) * 3), c.deep);
        R(x, w - 6, 1, 5, c.shallow); R(x, w - 1, 1, 1, 'rgba(255,255,255,.55)'); R(x, w, 1, 1, FOAM);
      }
      // waves rolling in towards the shore, fading as they come
      for (let i = 0; i < 4; i++) {
        const ph = (t / 2600 + i / 4) % 1, y = 8 + ph * 34, a = (0.45 * (1 - ph)).toFixed(2);
        for (let x = 6 + ((i * 17) % 13); x < RW - 10; x += 19) if (y < waterline(x, t) - 4) R(x, Math.round(y + Math.sin(x / 7) * 1.5), 7, 1, `rgba(255,255,255,${a})`);
      }
      // the magic: sparkles twinkling on the water, pink and gold (stars on it at night)
      for (let i = 0; i < 16; i++) {
        const sx = 8 + ((i * 47) % (RW - 18)), sy = 6 + ((i * 29) % 34), on = (Math.floor(t / 380) + i * 5) % 9;
        if (on < 3 && sy < waterline(sx, t) - 5) { const col = night ? '#fff2a8' : i % 2 ? '#ffd6e2' : '#fff2a8'; R(sx, sy, 1, 1, col); if (on === 1) { R(sx - 1, sy, 3, 1, col); R(sx, sy - 1, 1, 3, col); } }
      }
      // the shells on the tideline: the six most recent, and the newest riding in on the foam
      const n = Number(v.shells) || 0, since = t - (Number(v.washed) || -Infinity);
      if (!n && Math.sin(t / 500) > 0.6) { R(52, 61, 1, 3, WHITE); R(51, 62, 3, 1, WHITE); }
      for (let k = Math.max(1, n - SHELL_AT.length + 1); k <= n; k++) {
        const [sx, sy] = SHELL_AT[(k - 1) % SHELL_AT.length], p = k === n && since < 800 ? ease(since / 800) : 1;
        seashell(R, sx, Math.round(48 + (sy - 48) * p), (k - 1) % 5);
        if (k === n && since < 1400 && since > 800 && Math.sin(t / 90) > 0) { R(sx + 6, sy - 2, 1, 3, WHITE); R(sx + 5, sy - 1, 3, 1, WHITE); }
      }
      // the rock pool: rocks round a little pool, a starfish, two anemones and a fish swimming round
      shadow(R, 124, 112, 42);
      R(126, 86, 38, 26, '#7a7a84'); R(124, 89, 42, 20, '#7a7a84'); R(127, 86, 36, 1, '#9a9aa6'); R(124, 89, 2, 1, '#9a9aa6'); R(164, 89, 2, 1, '#9a9aa6');
      R(130, 90, 30, 18, '#5a5a64'); R(131, 91, 28, 16, night ? '#2f4472' : '#3fa8b0'); R(133, 90, 24, 1, '#5a5a64');
      R(134, 92, 8, 1, 'rgba(255,255,255,.35)');
      const SF = '#e87a3a'; R(135, 100, 5, 1, SF); R(137, 98, 1, 5, SF); R(136, 99, 3, 3, SF); R(134, 102, 1, 1, SF); R(140, 102, 1, 1, SF);
      for (const [ax, ay] of [[151, 93], [154, 101]]) { const sw = Math.round(Math.sin(t / 600 + ax)); R(ax, ay + 1, 3, 2, '#d8788a'); R(ax + sw, ay, 1, 1, '#f2a8b4'); R(ax + 2 + sw, ay, 1, 1, '#f2a8b4'); }
      const fa = t / 1100, fx = 145 + Math.cos(fa) * 9, fy = 99 + Math.sin(fa) * 4;
      R(fx, fy, 2, 1, '#f2c94c'); R(fx + (Math.sin(fa) > 0 ? 2 : -1), fy, 1, 1, '#e0a020');
      // the hermit crab, shell-shopping along the sand
      const ca = t / 2600, cx = 64 + Math.sin(ca) * 22;
      hermitCrab(R, cx, 96, t, Math.cos(ca) > 0 ? 1 : -1);
      // a palm leaning over the sand, its fronds swaying, coconuts at the top
      shadow(R, 10, 136, 12);
      for (let i = 0; i < 34; i++) { const tx = 14 + Math.round((i / 34) ** 2 * 10); R(tx, 135 - i, 4, 1, i % 4 ? '#a0764e' : '#8a6240'); }
      const sway = Math.sin(t / 1100) * 1.2;
      for (const [a, len] of [[-2.7, 13], [-2.1, 12], [-1.2, 9], [-0.5, 12], [0.2, 13], [0.8, 10]] as const) {
        for (let s = 1; s <= len; s++) { const fx2 = 26 + Math.cos(a) * s + sway * (s / len), fy2 = 101 + Math.sin(a) * s * 0.6 + (s / len) ** 2 * 6; R(fx2, fy2, 2, 1, s > len - 3 ? '#6aa85e' : '#4f8a4a'); }
      }
      R(24, 102, 3, 3, '#6b4429'); R(27, 103, 3, 3, '#5a3a24');
      // a little magic drifting up off the sand
      for (let i = 0; i < 5; i++) {
        const ph = (t / 3200 + i / 5) % 1, mx = 30 + ((i * 41) % 120) + Math.sin(t / 600 + i) * 2, my = 140 - ph * 70;
        R(mx, my, 1, 1, `rgba(255,${i % 2 ? 214 : 242},${i % 2 ? 226 : 168},${(0.8 * Math.sin(ph * Math.PI)).toFixed(2)})`);
      }
      // the conch, lying on the sand where you arrived: the way back to the pond, glowing faintly
      const glow = (0.14 + Math.sin(t / 700) * 0.08).toFixed(3);
      R(80, 137, 16, 10, `rgba(255,214,226,${glow})`);
      R(81, 146, 14, 1, 'rgba(0,0,0,.15)');
      R(84, 139, 8, 6, '#f4c6c0'); R(82, 141, 12, 3, '#f4c6c0'); R(92, 139, 2, 2, '#e8a8a8'); R(94, 138, 1, 1, '#e8a8a8');
      R(83, 142, 4, 2, '#e87a8a'); R(87, 140, 1, 4, '#d88a8a'); R(90, 140, 1, 4, '#d88a8a'); R(85, 139, 3, 1, '#fff0ec');
      // the frame again, over anything that ran past its edge
      R(0, 0, RW, 4, INK); R(0, RH - 4, RW, 4, INK); R(0, 0, 4, RH, INK); R(RW - 4, 0, 4, RH, INK);
    },
  },
};

/** The rooms a gift opens: one, or the three hives for Rowan's tulip. */
export const roomsOf = (rid: string): string[] => Object.keys(ROOMS).filter(k => (ROOMS[k].gift ?? k) === rid);
/** The resident whose gift opens a room. */
export const giftFor = (room: string): string => ROOMS[room]?.gift ?? room;

// ---------- Being inside ----------
/** The doormat: every room's way back to town. */
export const DOOR: Spot = { id: 'leave', label: '🚪 Back to town', box: { x: RW / 2 - 9, y: RH - 10, w: 18, h: 10 }, stand: [RW / 2, RH - 8] };
const roomSpots = (rid: string): Spot[] => { const r = ROOMS[rid]; return [...r.spots, r.away ? { ...DOOR, label: r.away.exit } : DOOR]; };

interface Here {
  rid: string; room: Room; spots: Spot[]; solids: Box[]; me: Walker; view: View; hover: Spot | null;
  onSpot: (id: string) => void;
  /** Called when you start walking (the dialogue box closes). */
  onWalk: () => void;
}
let here: Here | null = null;
/** The resident whose room you're in, or null in town. */
export const inRoom = (): string | null => here?.rid ?? null;

/** Step inside `rid`'s room, onto the doormat, facing in. */
export function enterRoom(rid: string, view: View, onSpot: (id: string) => void, onWalk: () => void): void {
  const room = ROOMS[rid], r = room.resident;
  here = {
    rid, room, view, onSpot, onWalk, hover: null, spots: roomSpots(rid),
    solids: r ? [...room.solids, { x: r[0], y: r[1] + 8, w: 8, h: 6 }] : room.solids,
    me: { x: DOOR.stand[0], y: DOOR.stand[1], dir: 'up', moving: false, path: null, onArrive: null },
  };
}
export function exitRoom(): void { here = null; }

const inBounds = (x: number, y: number): boolean => here?.room.walk ? here.room.walk(x, y, here.view) : x >= 7 && x <= RW - 7 && y >= 40 && y <= RH - 4;
const solidAt = (x: number, y: number): boolean => !here || !inBounds(x, y) || here.solids.some(b => inBox(b, x, y));
/** The spot you're standing at, close enough to look at. */
/** The spots there right now (out at sea, there's no way ashore). */
const spotsNow = (h: Here): Spot[] => h.spots.filter(s => !h.room.gone?.(s.id, h.view));
/** A cut-scene is playing: nothing to click, nowhere to walk. */
const busy = (h: Here): boolean => h.room.scene?.(h.view, performance.now()) != null;
const nearSpot = (h: Here): Spot | null => h.me.moving ? null : spotsNow(h).find(s => Math.hypot(s.stand[0] - h.me.x, s.stand[1] - h.me.y) < 10) ?? null;
function face(h: Here, s: Spot): void {
  if (s.id === DOOR.id) { h.me.dir = 'down'; return; }
  const dx = s.box.x + s.box.w / 2 - h.me.x, dy = s.box.y + s.box.h / 2 - h.me.y;
  h.me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
function walkToSpot(h: Here, s: Spot): void {
  const arrived = () => { face(h, s); h.onSpot(s.id); };
  if (Math.hypot(s.stand[0] - h.me.x, s.stand[1] - h.me.y) < 3) { h.me.path = null; arrived(); return; }
  if (!walkTo(s.stand[0], s.stand[1], solidAt, RW / 4, Math.ceil(RH / 4), arrived, h.me)) arrived();
}

/** Where the room sits on the map canvas: as big as fits (in whole pixels when it's at least 2×), in the middle. */
function placement(W: number, H: number): { s: number; ox: number; oy: number } {
  const fit = Math.min(W / RW, H / RH), s = fit >= 2 ? Math.floor(fit) : fit;
  return { s, ox: Math.floor((W - RW * s) / 2), oy: Math.floor((H - RH * s) / 2) };
}
const toRoom = (mx: number, my: number, W: number, H: number): [number, number] => { const p = placement(W, H); return [(mx - p.ox) / p.s, (my - p.oy) / p.s]; };
const spotAt = (h: Here, x: number, y: number): Spot | null => busy(h) ? null : spotsNow(h).find(s => inBox(s.box, x, y)) ?? null;

/** The mouse moved over the map (in map pixels): what it's over, if anything. */
export function roomHover(mx: number, my: number, W: number, H: number): Spot | null {
  if (!here) return null;
  return here.hover = spotAt(here, ...toRoom(mx, my, W, H));
}
/** A click on the map: walk there, and look at what was clicked. */
export function roomClick(mx: number, my: number, W: number, H: number): void {
  if (!here || busy(here)) return;
  const [x, y] = toRoom(mx, my, W, H), s = spotAt(here, x, y);
  if (s) walkToSpot(here, s); else if (inBounds(x, y)) walkTo(x, y, solidAt, RW / 4, Math.ceil(RH / 4), null, here.me);
}
/** E: look at what you're standing at. False if there's nothing there. */
export function roomInteract(): boolean {
  const s = here && !busy(here) && nearSpot(here); if (!here || !s) return false;
  face(here, s); here.onSpot(s.id); return true;
}

let off: HTMLCanvasElement | null = null;
/** Move and draw one frame of the room onto the map's canvas (W×H map pixels). */
export function drawRoom(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dt: number, keys: ReadonlySet<Dir>): void {
  const h = here; if (!h) return;
  const was = h.me.moving, scene = h.room.scene?.(h.view, t) ?? null;
  // no walking while a pop-up is open, or during a cut-scene
  if (scene != null) h.me.path = null;
  steer(h.me, scene != null || document.body.classList.contains('modal-open') ? new Set() : keys, dt, solidAt);
  if (h.me.moving && !was) h.onWalk();
  if (!off) { off = document.createElement('canvas'); off.width = RW; off.height = RH; }
  const g = off.getContext('2d')!;
  const R: Rect = (x, y, w, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, hh); };
  h.room.draw(R, t, h.view);
  const near = scene == null ? nearSpot(h) : null, lit = scene == null ? h.hover ?? near : null;
  if (lit) { const b = lit.box, c = '#fff2a8'; R(b.x - 1, b.y - 1, b.w + 2, 1, c); R(b.x - 1, b.y + b.h, b.w + 2, 1, c); R(b.x - 1, b.y, 1, b.h, c); R(b.x + b.w, b.y, 1, b.h, c); }
  // people, back to front
  const people: [number, () => void][] = [[h.me.y, () => drawPlayer(R, t, h.me)]], r = h.room.resident;
  if (r) people.push([r[1] + 13, () => drawResident(R, r[0], r[1], RESIDENTS[h.room.who ?? h.rid], t, true)]);
  people.sort((a, b) => a[0] - b[0]).forEach(([, d]) => d());
  if (near) drawPrompt(R, t, h.me);
  // a cut-scene gets the cinema bars, sliding in and back out (or the room's own cover)
  if (scene != null) {
    if (h.room.cover) h.room.cover(R, scene, t);
    else { const b = Math.round(14 * Math.min(1, scene * 6, (1 - scene) * 6)); R(0, 0, RW, b, '#120c0a'); R(0, RH - b, RW, b, '#120c0a'); }
  }
  // the room in the middle of the map, with the dark around it
  const p = placement(W, H);
  ctx.fillStyle = '#1e1614'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, p.ox, p.oy, RW * p.s, RH * p.s);
}
