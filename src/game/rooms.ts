// The town interiors as pixel-art rooms, drawn like the town map: a top-down room with a back wall, a floor
// and furniture, the resident who lives there, and you. Going through a building's door turns the map
// into its room (town.ts draws it with drawRoom), and the doormat inside takes you back out.
// Walk with the arrow keys / WASD or by clicking. Things you can look at glow when you're close or the
// mouse is over them; click them or press E. What they do is up to interiors.ts (the `onSpot` callback).
import { RESIDENTS } from '../content/index.ts';
import { drawPlayer, drawPrompt, drawResident, steer, walkTo } from './player.ts';
import { nightOn } from './town.ts';
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
  /** Where the resident stands (top-left of their 8×14 sprite). */
  resident: [x: number, y: number];
  /** Furniture you can't walk through, as floor footprints. */
  solids: Box[];
  spots: Spot[];
  /** Everything but the people: walls, floor, furniture. */
  draw(R: Rect, t: number, v: View): void;
}

const INK = '#3b2a2a', WHITE = '#fffaf0';
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
  const night = nightOn();
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

// ---------- The five rooms, by the resident whose gift opens them ----------
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
};

// ---------- Being inside ----------
/** The doormat: every room's way back to town. */
export const DOOR: Spot = { id: 'leave', label: '🚪 Back to town', box: { x: RW / 2 - 9, y: RH - 10, w: 18, h: 10 }, stand: [RW / 2, RH - 8] };
const roomSpots = (rid: string): Spot[] => [...ROOMS[rid].spots, DOOR];

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
  const room = ROOMS[rid], [rx, ry] = room.resident;
  here = {
    rid, room, view, onSpot, onWalk, hover: null, spots: roomSpots(rid),
    solids: [...room.solids, { x: rx, y: ry + 8, w: 8, h: 6 }],
    me: { x: DOOR.stand[0], y: DOOR.stand[1], dir: 'up', moving: false, path: null, onArrive: null },
  };
}
export function exitRoom(): void { here = null; }

const inBounds = (x: number, y: number): boolean => x >= 7 && x <= RW - 7 && y >= 40 && y <= RH - 4;
const solidAt = (x: number, y: number): boolean => !here || !inBounds(x, y) || here.solids.some(b => inBox(b, x, y));
/** The spot you're standing at, close enough to look at. */
const nearSpot = (h: Here): Spot | null => h.me.moving ? null : h.spots.find(s => Math.hypot(s.stand[0] - h.me.x, s.stand[1] - h.me.y) < 10) ?? null;
function face(h: Here, s: Spot): void {
  if (s === DOOR) { h.me.dir = 'down'; return; }
  const dx = s.box.x + s.box.w / 2 - h.me.x, dy = s.box.y + s.box.h / 2 - h.me.y;
  h.me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
function walkToSpot(h: Here, s: Spot): void {
  const arrived = () => { face(h, s); h.onSpot(s.id); };
  if (Math.hypot(s.stand[0] - h.me.x, s.stand[1] - h.me.y) < 3) { h.me.path = null; arrived(); return; }
  if (!walkTo(s.stand[0], s.stand[1], solidAt, RW / 4, Math.ceil(RH / 4), arrived, h.me)) arrived();
}
/** Walk to something in the room, then look at it (the buttons under the map use this). */
export function approach(id: string): void { const s = here?.spots.find(s => s.id === id); if (here && s) walkToSpot(here, s); }

/** Where the room sits on the map canvas: as big as fits in whole pixels, in the middle. */
function placement(W: number, H: number): { s: number; ox: number; oy: number } {
  const s = Math.max(1, Math.floor(Math.min(W / RW, H / RH)));
  return { s, ox: Math.floor((W - RW * s) / 2), oy: Math.floor((H - RH * s) / 2) };
}
const toRoom = (mx: number, my: number, W: number, H: number): [number, number] => { const p = placement(W, H); return [(mx - p.ox) / p.s, (my - p.oy) / p.s]; };
const spotAt = (h: Here, x: number, y: number): Spot | null => h.spots.find(s => inBox(s.box, x, y)) ?? null;

/** The mouse moved over the map (in map pixels): what it's over, if anything. */
export function roomHover(mx: number, my: number, W: number, H: number): Spot | null {
  if (!here) return null;
  return here.hover = spotAt(here, ...toRoom(mx, my, W, H));
}
/** A click on the map: walk there, and look at what was clicked. */
export function roomClick(mx: number, my: number, W: number, H: number): void {
  if (!here) return;
  const [x, y] = toRoom(mx, my, W, H), s = spotAt(here, x, y);
  if (s) walkToSpot(here, s); else if (inBounds(x, y)) walkTo(x, y, solidAt, RW / 4, Math.ceil(RH / 4), null, here.me);
}
/** E: look at what you're standing at. False if there's nothing there. */
export function roomInteract(): boolean {
  const s = here && nearSpot(here); if (!here || !s) return false;
  face(here, s); here.onSpot(s.id); return true;
}

let off: HTMLCanvasElement | null = null;
/** Move and draw one frame of the room onto the map's canvas (W×H map pixels). */
export function drawRoom(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dt: number, keys: ReadonlySet<Dir>): void {
  const h = here; if (!h) return;
  const was = h.me.moving;
  steer(h.me, keys, dt, solidAt);
  if (h.me.moving && !was) h.onWalk();
  if (!off) { off = document.createElement('canvas'); off.width = RW; off.height = RH; }
  const g = off.getContext('2d')!;
  const R: Rect = (x, y, w, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, hh); };
  h.room.draw(R, t, h.view);
  const near = nearSpot(h), lit = h.hover ?? near;
  if (lit) { const b = lit.box, c = '#fff2a8'; R(b.x - 1, b.y - 1, b.w + 2, 1, c); R(b.x - 1, b.y + b.h, b.w + 2, 1, c); R(b.x - 1, b.y, 1, b.h, c); R(b.x + b.w, b.y, 1, b.h, c); }
  // people, back to front
  const [rx, ry] = h.room.resident;
  const people: [number, () => void][] = [[ry + 13, () => drawResident(R, rx, ry, RESIDENTS[h.rid], t, true)], [h.me.y, () => drawPlayer(R, t, h.me)]];
  people.sort((a, b) => a[0] - b[0]).forEach(([, d]) => d());
  if (near) drawPrompt(R, t, h.me);
  // the room in the middle of the map, with the dark around it
  const p = placement(W, H);
  ctx.fillStyle = '#1e1614'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, p.ox, p.oy, RW * p.s, RH * p.s);
}
