// The pixel-art town map: background, buildings, residents, animation and clicks.
import { CHALLENGES, EXPANSIONS, HEARTS, RESIDENTS } from '../content/index.ts';
import { $, byId, save, state, status } from './state.js';
import { openChallenge } from './notebook.js';
import { hearts, practised, solvedErrands, unreadLetters, villageBuilt, waitingResidents } from './errands.js';
import { openLetters } from './journal.js';
import { musicPlaying, startMusic, stopMusic } from './music.js';
import { nextExpansion, nightness, stripsShown } from './rewards.ts';

const cv = $('#town'), ctx = cv.getContext('2d');
// The village is 400×340. Once errands start opening new land, strips of STRIP px are added below the railway.
const W = 400, H = 340, STRIP = 72;
const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const C = { grass: '#93c47d', grass2: '#86b870', grass3: '#a4d18c', road: '#e2c596', road2: '#cfae7b', dirt: '#c69c6d', dirt2: '#a97f55', wood: '#8a5a3b', wood2: '#6b4429', ink: '#3b2a2a', wall: '#f6e7cf', wall2: '#e3cfae', glass: '#a8dbe8', glass2: '#7cc0d4', door: '#7a4a2c', skin: '#f2c9a0', white: '#fffaf0' };

// Plots: where each building stands. stand = where its resident waits with a request; road = which street its path joins.
const PLOTS = {
  house:   { x: 30, y: 36, w: 48, h: 50, door: 54, road: 'main', stand: [50, 100], art: (p, t) => house(p.x, p.y, t) },
  mailbox: { x: 84, y: 66, w: 12, h: 22, small: true, stand: [82, 88], art: p => mailbox(p.x, p.y) },
  bakery:  { x: 114, y: 22, w: 64, h: 66, door: 160, road: 'main', stand: [144, 100], art: (p, t) => bakery(p.x, p.y, t) },
  store:   { x: 210, y: 22, w: 64, h: 66, door: 248, road: 'main', stand: [234, 100], art: p => store(p.x, p.y) },
  garden:  { x: 36, y: 136, w: 84, h: 44, door: 78, road: 'up', stand: [74, 122], art: (p, t) => garden(p.x, p.y - 2, t) },
  library: { x: 190, y: 136, w: 76, h: 46, door: 228, road: 'up', stand: [224, 122], art: (p, t) => library(p.x, p.y, t), deco: (p, t) => libraryDeco(p.x, p.y, t) },
  school:  { x: 22, y: 194, w: 72, h: 56, door: 58, road: 'lane', stand: [54, 252], art: (p, t) => school(p.x, p.y, t), deco: (p, t) => schoolDeco(p.x, p.y, t) },
  hall:    { x: 176, y: 192, w: 104, h: 58, door: 216, road: 'lane', stand: [212, 252], art: (p, t) => hall(p.x, p.y, t), deco: (p, t) => hallDeco(p.x, p.y, t) },
  clinic:  { x: 24, y: 272, w: 70, h: 48, door: 59, road: 'down', stand: [72, 252], art: (p, t) => clinic(p.x, p.y, t), deco: (p, t) => clinicDeco(p.x, p.y, t) },
  railway: { x: 180, y: 270, w: 96, h: 48, door: 228, road: 'down', stand: [238, 252], art: (p, t) => station(p.x, p.y, t), deco: (p, t) => stationDeco(p.x, p.y, t) },
  park:    { x: 302, y: 18, w: 90, h: 72, door: 347, road: 'main', stand: [342, 100], art: (p, t) => park(p.x, p.y, t), deco: (p, t) => parkDeco(p.x, p.y, t) },
  harbour: { x: 288, y: 188, w: 64, h: 60, door: 318, road: 'lane', stand: [318, 252], art: (p, t) => harbour(p.x, p.y, t), deco: (p, t) => harbourDeco(p.x, p.y, t) },
  observatory: { x: 316, y: 268, w: 64, h: 52, door: 348, road: 'down', stand: [296, 252], art: (p, t) => observatory(p.x, p.y, t), deco: (p, t) => observatoryDeco(p.x, p.y, t) },
  market:  { x: 280, y: 134, w: 68, h: 50, door: 314, road: 'up', pathEnd: 42, stand: [300, 121], art: (p, t) => market(p.x, p.y, t), deco: (p, t) => marketDeco(p.x, p.y, t) },
};
const HOMES = { wren: [60, 93], hazel: [174, 93], moss: [26, 116], bram: [262, 93], iris: [270, 116], juniper: [100, 245], fern: [168, 266], sorrel: [112, 266], pip: [292, 300], rowan: [378, 93], brine: [372, 252], marigold: [340, 116], orla: [388, 296] };
const TREES = [[4, 4], [8, 64], [96, 10], [98, 44], [186, 4], [188, 50], [282, 4], [284, 66], [6, 150], [126, 128], [124, 164], [170, 140], [104, 196], [122, 222], [0, 186], [110, 280], [132, 296], [290, 270], [2, 296]];
const plotChallenges = pid => CHALLENGES.filter(c => (c.plot || c.id) === pid);
const mainOf = pid => plotChallenges(pid).find(c => !c.upgrade);
const upgradeOf = pid => plotChallenges(pid).find(c => c.upgrade);
// Stages: the map only shows the plots (and the roads they need) up to the player's current stage,
// i.e. the furthest stage with a challenge that is open or done.
const stageNum = c => Number(/Stage (\d+)/.exec(c.stage)?.[1] ?? 1);
const currentStage = () => Math.max(1, ...CHALLENGES.filter(c => status(c) !== 'locked').map(stageNum));
const visiblePlots = () => { const s = currentStage(); return Object.entries(PLOTS).filter(([pid]) => stageNum(mainOf(pid)) <= s); };

// seeded RNG for static background
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
function paintBackground() {
  const b = bg.getContext('2d'); const S = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
  S(0, 0, W, H, C.grass);
  for (let i = 0; i < 700; i++) S(Math.floor(rnd() * W), Math.floor(rnd() * H), 1 + (rnd() < .3 ? 1 : 0), 1, rnd() < .5 ? C.grass2 : C.grass3);
  for (let i = 0; i < 90; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); S(x, y, 1, 2, C.grass2); S(x + 2, y + 1, 1, 2, C.grass2); }
  // the sea along the east coast
  // sand beach on the north, west and south shores, with the water inset inside it (rounded corners)
  S(352, 122, 48, 128, '#e8d7a8');
  S(360, 128, 40, 116, '#5aa0c0'); S(358, 130, 2, 112, '#5aa0c0');
  // surf line just inside the shoreline
  S(360, 128, 40, 1, '#7fb9d2'); S(360, 243, 40, 1, '#7fb9d2'); S(358, 130, 1, 112, '#7fb9d2');
  S(359, 129, 1, 1, '#7fb9d2'); S(359, 242, 1, 1, '#7fb9d2');
  for (let i = 0; i < 40; i++) { const x = 362 + Math.floor(rnd() * 35), y = 131 + Math.floor(rnd() * 110); S(x, y, 3, 1, '#86c1d8'); }
  S(380, 160, 14, 8, '#8d8a84'); S(378, 164, 18, 6, '#77746e'); S(382, 159, 8, 2, '#a5a29c');
  const fl = ['#f7c6d0', '#fff2a8', '#ffffff', '#e8a0bf'];
  for (let i = 0; i < 60; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); if ((x >= 352 && y >= 122 && y < 250) || (y > 92 && y < 128) || (y > 248 && y < 268) || (y > 318 && y < 336)) continue; S(x, y, 1, 1, fl[i % 4]); }
}
function roadLayer(plots) {
  R(0, 98, W, 22, C.road); R(0, 98, W, 1, C.road2); R(0, 119, W, 1, C.road2);
  for (let x = 6; x < W; x += 23) { R(x, 104, 3, 1, C.road2); R(x + 11, 113, 2, 1, C.road2); }
  // south lane and the crossing path that joins it to the main road, once a visible plot needs it
  if (!plots.some(([, p]) => p.road === 'lane' || p.road === 'down')) return;
  R(146, 120, 10, 130, C.road); R(145, 120, 1, 130, C.road2); R(156, 120, 1, 130, C.road2);
  R(0, 250, W, 14, C.road); R(0, 250, 145, 1, C.road2); R(157, 250, W - 157, 1, C.road2); R(0, 263, W, 1, C.road2);
  for (let x = 10; x < W; x += 29) R(x, 256, 3, 1, C.road2);
  R(140, 258, 22, 1, C.road2);
  // railway tracks along the bottom of town, once the station's plot is visible
  if (!plots.some(([pid]) => pid === 'railway')) return;
  for (let x = 0; x < W; x += 6) R(x, 323, 3, 10, '#8a5a3b');
  R(0, 325, W, 1, '#7d7468'); R(0, 330, W, 1, '#7d7468');
}
function path(x, y1, y2) { R(x - 4, y1, 8, y2 - y1, C.road); R(x - 5, y1, 1, y2 - y1, C.road2); R(x + 4, y1, 1, y2 - y1, C.road2); }
function tree(x, y) { R(x + 6, y + 13, 4, 7, C.wood2); R(x + 2, y + 2, 12, 11, '#4f8a4a'); R(x, y + 5, 16, 6, '#4f8a4a'); R(x + 4, y, 8, 3, '#4f8a4a'); R(x + 4, y + 3, 4, 3, '#6aa85e'); R(x + 2, y + 6, 3, 2, '#6aa85e'); R(x + 3, y + 12, 10, 1, '#3e7039'); }
function lot(p, sign) {
  R(p.x + 4, p.y + p.h - 34, p.w - 8, 30, C.dirt); R(p.x + 4, p.y + p.h - 34, p.w - 8, 2, C.dirt2);
  for (let i = 0; i < 6; i++) R(p.x + 10 + i * ((p.w - 24) / 5), p.y + p.h - 26 + (i % 2) * 8, 3, 1, C.dirt2);
  [[p.x + 4, p.y + p.h - 38], [p.x + p.w - 6, p.y + p.h - 38], [p.x + 4, p.y + p.h - 8], [p.x + p.w - 6, p.y + p.h - 8]].forEach(([x, y]) => R(x, y, 2, 6, C.wood));
  if (sign) { R(p.x + p.w / 2 - 1, p.y + p.h - 16, 2, 10, C.wood2); R(p.x + p.w / 2 - 7, p.y + p.h - 22, 14, 8, C.wood); R(p.x + p.w / 2 - 5, p.y + p.h - 20, 10, 1, '#c49a6c'); R(p.x + p.w / 2 - 5, p.y + p.h - 18, 7, 1, '#c49a6c'); }
}
function smallLot(p) { R(p.x + 2, p.y + 10, 8, 12, C.dirt); R(p.x + 5, p.y + 6, 2, 16, C.wood); }
function roofSteps(x, y, w, rows, c, c2) { for (let i = 0; i < rows; i++) { const ww = Math.round(8 + (w - 8) * i / (rows - 1)); R(x + (w - ww) / 2, y + i * 2, ww, 2, i === rows - 1 ? c2 : c); } }
function house(x, y, t) {
  R(x + 34, y + 2, 6, 12, '#9c5b4a'); R(x + 33, y + 1, 8, 2, '#7d463a');
  for (let i = 0; i < 3; i++) { const k = ((t / 1400) + i / 3) % 1; ctx.globalAlpha = 0.55 * (1 - k); R(x + 35 + Math.sin(k * 6 + i) * 2, y - k * 16, 3 + k * 3, 3 + k * 2, '#f2efe9'); ctx.globalAlpha = 1; }
  roofSteps(x, y + 4, 48, 11, '#c8553d', '#9b3d2a');
  R(x + 4, y + 26, 40, 24, C.wall); R(x + 4, y + 48, 40, 2, C.wall2);
  R(x + 20, y + 33, 9, 17, C.door); R(x + 26, y + 41, 1, 2, '#f2cc8f');
  [x + 8, x + 33].forEach(wx => { R(wx, y + 31, 8, 8, C.glass); R(wx, y + 31, 8, 1, C.ink); R(wx + 3, y + 31, 1, 8, C.glass2); R(wx, y + 34, 8, 1, C.glass2); R(wx - 1, y + 39, 10, 2, '#9c6b4a'); R(wx, y + 38, 2, 1, '#e8a0bf'); R(wx + 5, y + 38, 2, 1, '#fff2a8'); });
}
function mailbox(x, y) { R(x + 5, y + 10, 2, 12, C.wood); R(x + 1, y + 4, 10, 7, '#4a7fa7'); R(x + 1, y + 4, 10, 2, '#5f97c2'); R(x + 1, y + 10, 10, 1, '#365f7f'); R(x + 10, y + 1, 1, 7, '#c8553d'); R(x + 10, y + 1, 3, 3, '#c8553d'); }
function bakery(x, y, t) {
  roofSteps(x, y + 2, 64, 13, '#d9934d', '#a86a32');
  R(x + 26, y + 6, 12, 8, '#f6e7cf'); R(x + 28, y + 9, 8, 3, '#c58a4a'); R(x + 29, y + 8, 6, 1, '#d9a35f');
  R(x + 4, y + 28, 56, 38, C.wall); R(x + 4, y + 64, 56, 2, C.wall2);
  for (let i = 0; i < 7; i++) { R(x + 3 + i * 8, y + 30, 8, 7, i % 2 ? '#fff4e0' : '#e07a5f'); R(x + 5 + i * 8, y + 37, 4, 2, i % 2 ? '#fff4e0' : '#e07a5f'); }
  R(x + 8, y + 42, 24, 16, C.glass); R(x + 8, y + 42, 24, 1, C.ink); R(x + 7, y + 58, 26, 2, '#9c6b4a');
  [[x + 10, y + 52], [x + 17, y + 53], [x + 24, y + 52]].forEach(([bx, by]) => { R(bx, by, 6, 4, '#c58a4a'); R(bx + 1, by, 4, 1, '#e0b070'); });
  R(x + 40, y + 44, 12, 22, C.door); R(x + 42, y + 46, 8, 6, C.glass2); R(x + 49, y + 56, 1, 2, '#f2cc8f');
  const k = (t / 1800) % 1; ctx.globalAlpha = 0.4 * (1 - k); R(x + 30, y + 4 - k * 10, 3, 2, '#fff'); ctx.globalAlpha = 1;
}
function store(x, y) {
  roofSteps(x, y + 2, 64, 13, '#4f8a8b', '#356566');
  R(x + 4, y + 28, 56, 38, '#f1e4cc'); R(x + 4, y + 64, 56, 2, C.wall2);
  R(x + 14, y + 26, 36, 7, C.wood); R(x + 16, y + 28, 32, 3, '#f2cc8f'); [18, 24, 30, 36, 42].forEach(o => R(x + o, y + 29, 3, 1, C.wood2));
  for (let i = 0; i < 7; i++) { R(x + 3 + i * 8, y + 34, 8, 6, i % 2 ? '#fffaf0' : '#81b29a'); }
  R(x + 8, y + 44, 18, 14, C.glass); R(x + 8, y + 44, 18, 1, C.ink); R(x + 16, y + 44, 1, 14, C.glass2);
  R(x + 32, y + 44, 12, 22, C.door); R(x + 34, y + 46, 8, 6, C.glass2);
  R(x + 47, y + 56, 11, 9, C.wood); R(x + 47, y + 56, 11, 1, C.wood2); [[49, 54], [52, 53], [55, 54]].forEach(([a, b]) => R(x + a, y + b, 3, 3, '#d1495b'));
}
function garden(x, y, t) {
  R(x + 2, y + 6, 80, 36, '#9a7350');
  for (let r = 0; r < 3; r++) {
    R(x + 6, y + 10 + r * 11, 72, 6, '#7d5a3c');
    for (let i = 0; i < 9; i++) {
      const px = x + 9 + i * 8, py = y + 9 + r * 11, sw = Math.round(Math.sin(t / 700 + i + r) * 0.8);
      R(px + sw, py - 2, 1, 5, '#4f8a4a'); R(px - 1 + sw, py - 1, 1, 1, '#6aa85e'); R(px + 1 + sw, py, 1, 1, '#6aa85e');
      R(px + sw, py - 3, 1, 1, ['#f7c6d0', '#fff2a8', '#e07a5f'][(i + r) % 3]);
    }
  }
  for (let i = 0; i <= 10; i++) { R(x + i * 8, y + 2, 2, 7, C.wood); R(x + i * 8, y + 38, 2, 7, C.wood); }
  R(x, y + 4, 82, 1, C.wood2); R(x, y + 40, 82, 1, C.wood2); R(x + 38, y + 38, 8, 7, '#9a7350');
  R(x + 70, y + 30, 6, 5, '#5f97c2'); R(x + 76, y + 31, 3, 1, '#5f97c2');
}
function library(x, y) {
  roofSteps(x, y + 2, 76, 8, '#5c6b8a', '#46536e');
  R(x + 4, y + 18, 68, 28, '#ece4d4'); R(x + 4, y + 18, 68, 2, '#cfc5b0'); R(x + 2, y + 44, 72, 2, '#bfb6a4');
  [10, 22, 50, 62].forEach(o => { R(x + o, y + 20, 4, 24, '#fbf7ee'); R(x + o + 3, y + 20, 1, 24, '#d6cdb9'); R(x + o - 1, y + 20, 6, 1, '#d6cdb9'); });
  R(x + 32, y + 28, 12, 16, C.door); R(x + 33, y + 29, 10, 3, '#9c6b4a'); R(x + 41, y + 36, 1, 2, '#f2cc8f');
  [[x + 15, y + 26], [x + 55, y + 26]].forEach(([wx, wy]) => { R(wx, wy, 6, 12, '#6b4429'); ['#c8553d', '#4a7fa7', '#e0b040', '#6a994e'].forEach((col, i) => R(wx + 1 + (i % 2) * 2, wy + 1 + Math.floor(i / 2) * 6, 2, 5, col)); });
  R(x + 30, y + 8, 16, 6, '#46536e'); R(x + 32, y + 10, 12, 2, '#f2cc8f');
}
function libraryDeco(x, y, t) {
  const glow = 0.6 + Math.sin(t / 400) * 0.2;
  [x + 26, x + 48].forEach(lx => { R(lx, y + 30, 1, 16, '#3b2a2a'); R(lx - 1, y + 27, 3, 4, '#3b2a2a'); ctx.globalAlpha = glow; R(lx - 1, y + 28, 3, 2, '#ffe08a'); ctx.globalAlpha = 1; });
  R(x + 58, y + 40, 14, 2, C.wood); R(x + 58, y + 37, 14, 2, C.wood); R(x + 59, y + 42, 1, 4, C.wood2); R(x + 70, y + 42, 1, 4, C.wood2);
  R(x + 62, y + 38, 3, 2, '#c8553d');
}
function school(x, y, t) {
  R(x + 31, y + 2, 10, 10, '#e9dcc4'); roofSteps(x + 29, y - 4, 14, 3, '#7d2c22', '#5f2019'); R(x + 34, y + 4, 4, 4, '#e0b040'); R(x + 35, y + 8, 2, 1, '#a07a20');
  roofSteps(x, y + 10, 72, 11, '#a33b2e', '#7d2c22');
  R(x + 4, y + 30, 64, 26, '#c8644a'); for (let k = 0; k < 6; k++) R(x + 4, y + 33 + k * 4, 64, 1, '#b35640');
  R(x + 4, y + 54, 64, 2, '#9c4a36');
  [x + 9, x + 51].forEach(wx => { R(wx, y + 36, 12, 10, C.glass); R(wx, y + 36, 12, 1, C.ink); R(wx + 5, y + 36, 1, 10, C.glass2); R(wx - 1, y + 46, 14, 2, '#f1e4cc'); });
  R(x + 31, y + 40, 10, 16, C.door); R(x + 32, y + 41, 8, 4, C.glass2);
  R(x + 25, y + 32, 22, 6, '#f2cc8f'); R(x + 28, y + 34, 3, 2, '#c8553d'); R(x + 33, y + 34, 3, 2, '#4a7fa7'); R(x + 38, y + 34, 3, 2, '#6a994e');
}
function schoolDeco(x, y, t) {
  R(x + 69, y + 10, 1, 46, '#8d8d8d'); R(x + 68, y + 9, 3, 1, '#e0b040');
  const f = Math.floor(t / 300) % 2;
  R(x + 70, y + 11, 8, 2, '#81b29a'); R(x + 70, y + 13, 7 + f, 2, '#f2cc8f'); R(x + 70, y + 15, 8 - f, 1, '#81b29a');
  R(x - 8, y + 36, 1, 20, C.wood2); R(x + 2, y + 36, 1, 20, C.wood2); R(x - 9, y + 35, 13, 2, C.wood);
  const sw = Math.round(Math.sin(t / 500) * 2);
  R(x - 5 + sw, y + 37, 1, 11, '#7a7a7a'); R(x - 1 + sw, y + 37, 1, 11, '#7a7a7a'); R(x - 6 + sw, y + 48, 7, 2, '#c8553d');
}
function hall(x, y, t) {
  R(x + 2, y + 22, 80, 36, '#f1e9d6');
  roofSteps(x, y + 12, 84, 6, '#3d5a80', '#2c4360');
  R(x + 34, y + 3, 16, 14, '#efe6d2'); roofSteps(x + 32, y - 4, 20, 4, '#3d5a80', '#2c4360');
  R(x + 37, y + 5, 10, 9, '#fffaf0'); R(x + 37, y + 5, 10, 1, '#9a8f80'); R(x + 37, y + 13, 10, 1, '#9a8f80');
  const hh = Math.floor(t / 1000) % 4; R(x + 41, y + 7, 2, 4, C.ink); R(x + 42, y + 10, [3, 1, 3, 1][hh], 1, C.ink);
  R(x + 2, y + 24, 80, 2, '#e07a5f');
  for (let i = 0; i < 6; i++) { const cx = x + 8 + i * 13 + (i >= 3 ? 4 : 0); R(cx, y + 28, 4, 26, '#fffaf0'); R(cx + 3, y + 28, 1, 26, '#ddd3bf'); }
  R(x + 36, y + 38, 12, 20, '#5a3a24'); R(x + 41, y + 38, 1, 20, '#3b2a2a'); R(x + 39, y + 48, 1, 2, '#f2cc8f'); R(x + 44, y + 48, 1, 2, '#f2cc8f');
  R(x + 30, y + 56, 24, 2, '#d8ccb4');
}
function hallDeco(x, y, t) {
  const fx = x + 86, fy = y + 38;
  R(fx, fy + 10, 18, 8, '#9aa8b2'); R(fx + 1, fy + 10, 16, 1, '#c4ced5'); R(fx + 2, fy + 11, 14, 4, '#6fb3c9');
  R(fx + 8, fy + 2, 2, 9, '#9aa8b2');
  for (let i = 0; i < 4; i++) { const k = ((t / 600) + i / 4) % 1; R(fx + 9 + (i % 2 ? 1 : -1) * (2 + k * 5), fy + 1 + k * 10 - Math.sin(k * 3.14) * 4, 1, 1, '#a5d8e6'); }
  R(x + 2, y + 18, 3, 6, '#e07a5f'); R(x + 79, y + 18, 3, 6, '#e07a5f');
}
function clinic(x, y) {
  roofSteps(x, y + 2, 70, 8, '#5fa8a0', '#3f7f78');
  R(x + 4, y + 18, 62, 30, '#fbfbf7'); R(x + 4, y + 46, 62, 2, '#d8d8cf'); R(x + 4, y + 18, 62, 1, '#e3e3da');
  R(x + 29, y + 6, 12, 10, '#ffffff'); R(x + 34, y + 7, 2, 8, '#d1495b'); R(x + 31, y + 10, 8, 2, '#d1495b');
  [x + 10, x + 48].forEach(wx => { R(wx, y + 25, 12, 10, C.glass); R(wx, y + 25, 12, 1, C.ink); R(wx + 5, y + 25, 1, 10, C.glass2); R(wx - 1, y + 35, 14, 2, '#d8d8cf'); });
  R(x + 30, y + 30, 10, 18, '#5fa8a0'); R(x + 31, y + 32, 8, 5, C.glass2); R(x + 38, y + 40, 1, 2, '#f2cc8f');
}
function clinicDeco(x, y, t) {
  [x - 2, x + 58].forEach((bx, j) => {
    R(bx, y + 40, 14, 7, C.wood); R(bx, y + 40, 14, 1, C.wood2);
    for (let i = 0; i < 4; i++) { const sw = Math.round(Math.sin(t / 650 + i + j) * 0.6); R(bx + 2 + i * 3 + sw, y + 35, 1, 5, '#4f8a4a'); R(bx + 1 + i * 3 + sw, y + 36, 1, 1, '#6aa85e'); R(bx + 2 + i * 3 + sw, y + 34, 1, 1, ['#b48ad1', '#fff2a8', '#f7c6d0', '#ffffff'][i]); }
  });
}
function station(x, y, t) {
  roofSteps(x + 16, y, 64, 7, '#4a3b5c', '#352a43');
  R(x + 20, y + 14, 56, 28, '#c0704e'); for (let k = 0; k < 6; k++) R(x + 20, y + 17 + k * 4, 56, 1, '#ab6044');
  R(x + 43, y + 15, 10, 10, '#fffaf0'); R(x + 43, y + 15, 10, 1, '#9a8f80'); const hh = Math.floor(t / 1000) % 4; R(x + 47, y + 17, 2, 4, C.ink); R(x + 48, y + 20, [3, 1, 3, 1][hh], 1, C.ink);
  R(x + 26, y + 29, 10, 8, C.glass); R(x + 60, y + 29, 10, 8, C.glass); R(x + 26, y + 29, 10, 1, C.ink); R(x + 60, y + 29, 10, 1, C.ink);
  R(x + 42, y + 28, 12, 14, C.door); R(x + 43, y + 29, 10, 4, C.glass2);
  for (let i = 0; i < 12; i++) R(x + i * 8, y + 25, 8, 3, i % 2 ? '#fff4e0' : '#e0a458');
  R(x, y + 24, 96, 1, '#a86a32'); R(x + 2, y + 28, 2, 14, '#6b4429'); R(x + 92, y + 28, 2, 14, '#6b4429');
  R(x, y + 42, 96, 4, '#b8ad9a'); R(x, y + 42, 96, 1, '#d6ccb8'); R(x, y + 46, 96, 1, '#9a8f80');
}
function stationDeco(x, y, t) {
  // signal post
  R(x + 86, y + 30, 1, 12, '#3b2a2a'); R(x + 84, y + 26, 5, 5, '#3b2a2a');
  const period = 16000, ph = (t % period) / period;
  R(x + 85, y + 27, 3, 3, ph > 0.15 && ph < 0.75 ? '#81d18a' : '#e85a4f');
}
// the train: drawn separately, after the trees, so it rides on top of them
function train(t, heartOnFront) {
  const period = 16000, ph = (t % period) / period;
  const len = 76, px = Math.round(ph * (W + len + 40)) - len - 20, ty = 313;
  const car = (cx, col) => { R(cx, ty + 2, 22, 9, col); R(cx, ty + 2, 22, 1, 'rgba(255,255,255,.35)'); for (let w = 0; w < 3; w++) R(cx + 3 + w * 6, ty + 4, 4, 3, '#fff2c8'); R(cx + 3, ty + 11, 3, 3, '#2b2b2b'); R(cx + 16, ty + 11, 3, 3, '#2b2b2b'); };
  car(px, '#4a7fa7'); car(px + 24, '#e0a458');
  const lx = px + 48;
  R(lx, ty + 3, 22, 8, '#c8553d'); R(lx + 2, ty - 2, 8, 6, '#9b3d2a'); R(lx + 3, ty - 1, 6, 3, '#fff2c8');
  R(lx + 15, ty - 3, 4, 6, '#3b2a2a'); R(lx + 20, ty + 6, 4, 4, '#3b2a2a'); R(lx + 22, ty + 4, 2, 2, '#ffe08a');
  [3, 9, 16].forEach(o => R(lx + o, ty + 11, 4, 3, '#2b2b2b'));
  if (heartOnFront) heart(lx + 12, ty + 5, '#ffd1dc'); R(px + 22, ty + 7, 2, 1, '#3b2a2a'); R(px + 46, ty + 7, 2, 1, '#3b2a2a');
  for (let i = 0; i < 4; i++) { const k = ((t / 500) + i / 4) % 1; ctx.globalAlpha = 0.6 * (1 - k); R(lx + 16 - k * 14, ty - 6 - k * 10, 3 + k * 3, 3 + k * 2, '#f2efe9'); ctx.globalAlpha = 1; }
}
function park(x, y, t) {
  R(x, y, 90, 72, '#79b866');
  for (let i = 0; i < 90; i += 6) { R(x + i, y, 6, 4, '#3f7a3a'); R(x + i, y + 68, 6, 4, '#3f7a3a'); } R(x, y, 4, 72, '#3f7a3a'); R(x + 86, y, 4, 72, '#3f7a3a');
  R(x + 41, y + 50, 8, 22, '#e2c596'); R(x + 20, y + 44, 50, 6, '#e2c596');
  // bandstand
  R(x + 31, y + 30, 28, 14, '#f6efe2'); R(x + 31, y + 42, 28, 2, '#c9bca2'); [32, 44, 56].forEach(o => R(x + o, y + 24, 2, 18, '#fbf7ee'));
  roofSteps(x + 27, y + 12, 36, 6, '#d1495b', '#a83a49'); R(x + 44, y + 9, 2, 3, '#e0b040');
  // trees, pond, flower beds
  [[x + 6, y + 6], [x + 70, y + 8]].forEach(([tx, ty]) => { R(tx + 5, ty + 12, 3, 6, C.wood2); R(tx + 1, ty + 2, 11, 10, '#4f8a4a'); R(tx + 3, ty, 7, 3, '#4f8a4a'); R(tx + 3, ty + 3, 3, 3, '#6aa85e'); });
  R(x + 66, y + 34, 16, 10, '#6fb3c9'); R(x + 64, y + 36, 20, 6, '#6fb3c9'); const k = Math.floor(t / 600) % 3; R(x + 68 + k * 3, y + 37, 3, 1, '#a5d8e6');
  R(x + 6, y + 30, 16, 10, '#9a7350'); for (let i = 0; i < 4; i++) { R(x + 8 + i * 4, y + 31, 2, 2, ['#f7c6d0', '#fff2a8', '#e07a5f', '#b48ad1'][i]); R(x + 8 + i * 4, y + 35, 2, 2, ['#fff2a8', '#e07a5f', '#b48ad1', '#f7c6d0'][i]); }
  R(x + 8, y + 54, 14, 2, C.wood); R(x + 8, y + 51, 14, 2, C.wood); R(x + 9, y + 56, 1, 3, C.wood2); R(x + 20, y + 56, 1, 3, C.wood2);
}
function parkDeco(x, y, t) {
  // bunting across the bandstand and prize flowers
  for (let i = 0; i < 9; i++) { const fx = x + 20 + i * 6, fy = y + 22 + Math.round(Math.sin(i / 8 * 3.14) * 3); R(fx, fy, 3, 3, ['#e07a5f', '#f2cc8f', '#81b29a', '#4a7fa7'][i % 4]); }
  [[x + 64, y + 52], [x + 74, y + 54], [x + 28, y + 56]].forEach(([fx, fy], i) => {
    R(fx, fy + 4, 6, 5, '#b5603f'); R(fx + 2, fy, 1, 4, '#4f8a4a');
    const pulse = Math.round(Math.sin(t / 500 + i) * 0.5);
    R(fx, fy - 3 - pulse, 6, 4, ['#e8a0bf', '#fff2a8', '#e07a5f'][i]); R(fx + 2, fy - 2 - pulse, 2, 2, '#f2cc8f');
  });
  R(x + 76, y + 22, 7, 7, '#e0b040'); R(x + 78, y + 24, 3, 3, '#d1495b'); R(x + 77, y + 29, 2, 4, '#4a7fa7'); R(x + 80, y + 29, 2, 4, '#4a7fa7');
}
function harbour(x, y, t) {
  // pier and moored boat
  R(x + 56, y + 32, 46, 6, '#a0764e'); R(x + 56, y + 32, 46, 1, '#c49a6c'); for (let i = 0; i < 46; i += 9) R(x + 58 + i, y + 38, 2, 6, '#6b4429');
  const bob = Math.round(Math.sin(t / 700) * 1);
  R(x + 76, y + 42 + bob, 20, 5, '#c8553d'); R(x + 78, y + 47 + bob, 16, 2, '#9b3d2a'); R(x + 85, y + 30 + bob, 1, 12, '#6b4429'); R(x + 86, y + 31 + bob, 6, 8, '#fffaf0');
  // warehouse
  roofSteps(x, y + 2, 58, 9, '#7a3b2e', '#5c2b21');
  R(x + 4, y + 20, 50, 40, '#a0764e'); for (let k = 0; k < 9; k++) R(x + 4, y + 23 + k * 4, 50, 1, '#8a6240');
  R(x + 18, y + 34, 22, 26, '#6b4429'); R(x + 28, y + 34, 1, 26, '#4b2f1c'); R(x + 18, y + 34, 22, 2, '#4b2f1c');
  R(x + 8, y + 26, 8, 6, C.glass); R(x + 42, y + 26, 8, 6, C.glass);
  R(x + 20, y + 8, 18, 6, '#fffaf0'); R(x + 23, y + 10, 4, 2, '#1f4e79'); R(x + 30, y + 10, 5, 2, '#1f4e79');
  [[x - 2, y + 50], [x + 6, y + 50], [x + 2, y + 44]].forEach(([cx, cy]) => { R(cx, cy, 8, 8, '#c49a6c'); R(cx, cy, 8, 1, '#8a6240'); R(cx + 3, cy, 1, 8, '#8a6240'); });
}
function harbourDeco(x, y, t) {
  const lx = 383, ly = 128;
  R(lx, ly + 12, 8, 24, '#fffaf0'); R(lx, ly + 18, 8, 4, '#d1495b'); R(lx, ly + 28, 8, 4, '#d1495b'); R(lx - 1, ly + 35, 10, 2, '#8d8a84');
  R(lx - 1, ly + 10, 10, 2, '#3b2a2a'); R(lx + 1, ly + 5, 6, 5, '#ffe08a'); R(lx, ly + 3, 8, 2, '#3b2a2a');
  const a = (t / 900) % (Math.PI * 2), on = Math.cos(a) > 0;
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff2a8';
  ctx.beginPath(); ctx.moveTo(lx + 4, ly + 7); ctx.lineTo(lx + 4 + Math.cos(a) * 40, ly + 7 + Math.sin(a) * 12 - 4); ctx.lineTo(lx + 4 + Math.cos(a) * 40, ly + 7 + Math.sin(a) * 12 + 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; if (on) R(lx + 2, ly + 6, 4, 3, '#ffffff');
}
function dome(cx, top, r, col) { for (let i = 0; i < r; i++) { const w = Math.round(2 * Math.sqrt(r * r - (r - i - 0.5) ** 2)); R(cx - w / 2, top + i, w, 1, col); } }
function observatory(x, y, t) {
  // stone tower
  R(x + 12, y + 22, 40, 30, '#d8d2c4'); for (let k = 0; k < 7; k++) R(x + 12, y + 25 + k * 4, 40, 1, '#c2bba9');
  for (let k = 0; k < 7; k++) R(x + 14 + (k % 2) * 6 + Math.floor(k / 2) * 12, y + 27 + (k % 3) * 8, 1, 3, '#c2bba9');
  R(x + 10, y + 20, 44, 3, '#9b9484');
  // dome with its shutter (closed by day)
  dome(x + 32, y + 2, 19, '#6f8fb0'); dome(x + 32, y + 4, 15, '#7fa0c2');
  R(x + 29, y + 3, 6, 18, '#4c6a8a'); R(x + 30, y + 3, 4, 18, '#5b7b9c');
  R(x + 31, y, 2, 3, '#e0b040');
  // door and round windows
  R(x + 27, y + 36, 10, 16, C.door); R(x + 28, y + 37, 8, 1, '#5a3420'); R(x + 34, y + 44, 1, 2, '#f2cc8f');
  [[x + 17, y + 31], [x + 43, y + 31]].forEach(([wx, wy]) => { R(wx, wy, 5, 5, '#3b3f63'); R(wx + 1, wy + 1, 1, 1, '#fff2a8'); R(wx + 3, wy + 3, 1, 1, '#ffffff'); });
  // a little star flag
  R(x + 54, y + 10, 1, 14, C.wood2); R(x + 55, y + 10, 8, 6, '#3b3f63'); R(x + 58, y + 12, 2, 2, '#fff2a8');
}
function observatoryDeco(x, y, t) {
  // the shutter opens and a telescope slowly sweeps the sky
  R(x + 29, y + 3, 6, 18, '#23263d');
  const a = -1.15 + Math.sin(t / 2600) * 0.25;
  for (let k = 0; k < 16; k++) R(x + 32 + Math.cos(a) * k - 1, y + 14 + Math.sin(a) * k - 1, 3, 3, k > 13 ? '#e0b040' : '#c8c8d0');
  // stars that twinkle over the dome
  [[x + 6, y + 4], [x + 52, y + 2], [x + 60, y + 18], [x + 2, y + 16]].forEach(([sx, sy], i) => {
    const on = Math.sin(t / 400 + i * 1.7) > 0.2; R(sx, sy, 1, 1, '#fff2a8');
    if (on) { R(sx - 1, sy, 3, 1, '#fff2a8'); R(sx, sy - 1, 1, 3, '#fff2a8'); }
  });
}
function market(x, y, t) {
  // cobbled square
  R(x + 2, y + 40, 64, 10, '#dccaa4'); for (let i = 0; i < 13; i++) R(x + 4 + i * 5, y + 42 + (i % 2) * 4, 3, 1, '#c4b08a');
  // string of bunting over the square
  R(x + 2, y + 2, 64, 1, C.wood2);
  for (let i = 0; i < 8; i++) { R(x + 4 + i * 8, y + 3, 4, 2, ['#e07a5f', '#f2cc8f', '#81b29a', '#4a7fa7'][i % 4]); R(x + 5 + i * 8, y + 5, 2, 1, ['#e07a5f', '#f2cc8f', '#81b29a', '#4a7fa7'][i % 4]); }
  // two stalls with striped awnings
  [[x + 3, '#d1495b', ['#b48ad1', '#e8a0bf', '#f2cc8f']], [x + 35, '#4a7fa7', ['#e07a5f', '#f2cc8f', '#81b29a']]].forEach(([sx, col, goods], k) => {
    R(sx + 2, y + 15, 2, 26, C.wood2); R(sx + 26, y + 15, 2, 26, C.wood2);
    R(sx, y + 8, 30, 1, C.wood);
    for (let i = 0; i < 6; i++) { R(sx + i * 5, y + 9, 5, 6, i % 2 ? C.white : col); R(sx + i * 5 + 1, y + 15, 3, 2, i % 2 ? C.white : col); }
    for (let i = 0; i < 6; i++) { R(sx + 3 + i * 4, y + 27, 3, 3, goods[i % 3]); R(sx + 3 + i * 4, y + 27, 1, 1, 'rgba(255,255,255,.5)'); }
    R(sx + 1, y + 30, 28, 10, C.wood); R(sx + 1, y + 30, 28, 2, '#a0764e'); R(sx + 1, y + 39, 28, 1, C.wood2);
    // a coin that glints now and then
    if (Math.floor(t / 900 + k * 2) % 4 === 0) R(sx + 22, y + 26, 2, 1, '#fff2a8');
    R(sx + 21, y + 27, 3, 2, '#e0b040');
  });
}
function marketDeco(x, y, t) {
  // a little pyramid of crates (a tree of crates!) in the square
  [[x + 28, y + 44], [x + 35, y + 44], [x + 31, y + 39]].forEach(([cx, cy]) => { R(cx, cy, 6, 5, '#c49a6c'); R(cx, cy, 6, 1, '#8a6240'); R(cx + 2, cy, 1, 5, '#8a6240'); });
  // a hanging scale beside the market, its pans gently tipping
  const sx = x - 11, sy = y + 14, tip = Math.round(Math.sin(t / 800) * 1.5);
  R(sx + 5, sy, 2, 32, C.wood2); R(sx + 3, sy + 31, 6, 2, C.wood);
  R(sx, sy + 3 - tip, 6, 1, '#8d8a84'); R(sx + 6, sy + 3 + tip, 6, 1, '#8d8a84'); R(sx + 5, sy + 2, 2, 2, '#e0b040');
  R(sx, sy + 4 - tip, 1, 5, '#8d8a84'); R(sx + 11, sy + 4 + tip, 1, 5, '#8d8a84');
  R(sx - 2, sy + 9 - tip, 5, 2, '#e0b040'); R(sx + 9, sy + 9 + tip, 5, 2, '#e0b040'); R(sx - 1, sy + 7 - tip, 3, 2, '#e07a5f');
}
function person(x, y, r, t, bob) {
  const dy = bob ? Math.round(Math.sin(t / 380) * 0.6) : 0; y += dy;
  R(x + 1, y + 13, 6, 1, 'rgba(0,0,0,.15)');
  R(x + 1, y, 6, 3, r.hair); R(x + 1, y + 2, 6, 4, C.skin); R(x, y + 1, 1, 3, r.hair); R(x + 7, y + 1, 1, 3, r.hair);
  R(x + 2, y + 3, 1, 1, C.ink); R(x + 5, y + 3, 1, 1, C.ink); R(x + 2, y + 5, 1, 1, '#f0a0a0'); R(x + 5, y + 5, 1, 1, '#f0a0a0');
  R(x + 1, y + 6, 6, 5, r.shirt); R(x, y + 7, 1, 3, r.shirt); R(x + 7, y + 7, 1, 3, r.shirt);
  R(x + 2, y + 11, 1, 2, '#5a4636'); R(x + 5, y + 11, 1, 2, '#5a4636');
}
// a blue ? for a resident who has pinned an errand to the Notice Board
function errandBubble(x, y, t) {
  const by = y + Math.round(Math.sin(t / 300) * 1.5);
  R(x, by, 9, 9, C.ink); R(x + 1, by - 1, 7, 11, C.ink); R(x + 1, by, 7, 9, C.white); R(x + 3, by + 9, 2, 2, C.ink);
  R(x + 3, by + 2, 3, 1, '#4a7fa7'); R(x + 5, by + 3, 1, 1, '#4a7fa7'); R(x + 4, by + 4, 1, 1, '#4a7fa7'); R(x + 4, by + 7, 1, 1, '#4a7fa7');
}
function bubble(x, y, t) {
  const by = y + Math.round(Math.sin(t / 260) * 1.5);
  R(x, by, 9, 9, C.ink); R(x + 1, by - 1, 7, 11, C.ink); R(x + 1, by, 7, 9, C.white); R(x + 3, by + 9, 2, 2, C.ink);
  R(x + 4, by + 2, 1, 4, '#e07a5f'); R(x + 4, by + 7, 1, 1, '#e07a5f');
}
const butterflies = [{ x: 140, y: 150, c: '#fff2a8', s: 0 }, { x: 60, y: 30, c: '#f7c6d0', s: 2 }, { x: 240, y: 230, c: '#ffffff', s: 4 }];
export const buildAnim = {};
let hover = null;

function withReveal(key, p, t, drawFn, under) {
  const anim = buildAnim[key]; const k = anim ? Math.min(1, (t - anim) / 900) : 1;
  if (k < 1) { if (under) under(); ctx.save(); ctx.beginPath(); ctx.rect(p.x - 12, p.y - 12 + (p.h + 14) * (1 - k), p.w + 26, (p.h + 14) * k + 4); ctx.clip(); }
  drawFn();
  if (k < 1) { ctx.restore(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; ctx.globalAlpha = 1 - k; R(p.x + p.w / 2 + Math.cos(a) * (p.w / 2) * k, p.y + p.h - 4 + Math.sin(a) * 6 * k, 3, 2, '#f2efe9'); ctx.globalAlpha = 1; } }
  else if (anim && t - anim < 2600) { const kk = (t - anim - 900) / 1700; for (let i = 0; i < 5; i++) { ctx.globalAlpha = Math.max(0, 1 - kk); R(p.x + 6 + i * (p.w / 5), p.y + 10 - kk * 14 + (i % 2) * 6, 2, 2, '#fff2a8'); } ctx.globalAlpha = 1; }
}
function draw(t) {
  const plots = visiblePlots();
  syncSize();
  ctx.drawImage(bg, 0, 0); roadLayer(plots);
  drawStrips(t);
  for (const [pid, p] of plots) {
    const m = mainOf(pid); if (!m || !state.done[m.id] || p.small) continue;
    if (p.road === 'up') path(p.door, 120, p.y + (p.pathEnd ?? 6)); else if (p.road === 'down') path(p.door, 264, p.y + 6); else if (p.road === 'lane') path(p.door, p.y + p.h, 250); else path(p.door, p.y + p.h, 98);
  }
  TREES.forEach(([x, y]) => { if (y < 120) tree(x, y); });
  for (const [pid, p] of plots) {
    const m = mainOf(pid), u = upgradeOf(pid);
    if (m && state.done[m.id]) {
      withReveal(pid, p, t, () => p.art(p, t), () => p.small ? smallLot(p) : lot(p, false));
      if (u && state.done[u.id] && p.deco) withReveal(pid + '-deco', p, t, () => p.deco(p, t));
    } else if (p.small) { if (status(m) === 'open') smallLot(p); }
    else lot(p, status(m) === 'locked');
  }
  drawFriends(t);
  TREES.forEach(([x, y]) => { if (y >= 120) tree(x, y); });
  const shown = new Set();
  for (const c of CHALLENGES) {
    if (status(c) !== 'open' || shown.has(c.resident)) continue;
    shown.add(c.resident);
    const [fx, fy] = PLOTS[c.plot || c.id].stand;
    person(fx, fy, RESIDENTS[c.resident], t, true); bubble(fx - 1, fy - 13, t);
  }
  const waiting = waitingResidents();
  for (const [rid, pos] of Object.entries(HOMES)) {
    if (shown.has(rid)) continue;
    if (CHALLENGES.some(c => c.resident === rid && state.done[c.id])) {
      person(pos[0], pos[1], RESIDENTS[rid], t + pos[0] * 50, waiting.has(rid));
      if (waiting.has(rid)) errandBubble(pos[0] - 1, pos[1] - 13, t);
    }
  }
  drawLife(t);
  if (musicPlaying() && state.done.market) musician(t);
  butterflies.forEach(b => { const bx = b.x + Math.sin(t / 1900 + b.s) * 30, by = b.y + Math.sin(t / 700 + b.s) * 6 + Math.cos(t / 1300) * 4; const f = Math.floor(t / 140) % 2; R(bx, by, 1, 1, '#5a4636'); R(bx - 1 - f, by - f, 1 + f, 1, b.c); R(bx + 1, by - f, 1 + f, 1, b.c); });
  { const m = mainOf('railway'), u = upgradeOf('railway'), a = buildAnim['railway-deco'];
    if (m && u && state.done[m.id] && state.done[u.id] && !(a && t - a < 900)) train(t, friendsWith('pip')); }
  drawNight(t);
  if (hover && hover.includes(':')) { const r = slotRect(EXPANSIONS.find(x => x.id === hover.split(':')[1]).slot); ctx.strokeStyle = 'rgba(255,250,240,.9)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.setLineDash([]); }
  if (hover && PLOTS[hover]) { const p = PLOTS[hover]; ctx.strokeStyle = 'rgba(255,250,240,.9)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeRect(p.x - 1.5, p.y - 1.5, p.w + 3, p.h + 3); ctx.setLineDash([]); }
  requestAnimationFrame(draw);
}

function plotAt(ev) {
  const r = cv.getBoundingClientRect(); const x = (ev.clientX - r.left) * W / r.width, y = (ev.clientY - r.top) * cv.height / r.height;
  if (y >= H) { const x0 = EXPANSIONS.find(e => { const r = slotRect(e.slot); return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }); return x0 && Math.floor(x0.slot / 2) < stripsShown(EXPANSIONS, solvedErrands()) ? (isOpenExp(x0) ? 'exp:' : 'fog:') + x0.id : null; }
  for (const [id, p] of visiblePlots()) { const [sx, sy] = p.stand; if ((x >= p.x - 4 && x <= p.x + p.w + 4 && y >= p.y - 8 && y <= p.y + p.h + 4) || (x >= sx - 4 && x <= sx + 12 && y >= sy - 14 && y <= sy + 14)) return id; }
  return null;
}
// which challenge a click on a plot should open: the open one, else the last one solved
function challengeForPlot(pid) { if (pid.includes(':')) return null; const cs = plotChallenges(pid); return cs.find(c => status(c) === 'open') || [...cs].reverse().find(c => state.done[c.id]) || null; }
export function plotLabel(id) {
  if (!id) return villageBuilt() ? 'The village is built! Residents with a <b>?</b> have pinned an errand to the Notice Board (the Errands tab).' : 'Hover over a lot to see what is happening. Residents with a <b>!</b> need your help.';
  if (id === 'mailbox' && unreadLetters().length) { const n = unreadLetters().length; return `📬 <b>You've got mail!</b> ${n} letter${n === 1 ? '' : 's'} waiting. Click the mailbox to read.`; }
  if (id.startsWith('exp:') || id.startsWith('fog:')) {
    const x = EXPANSIONS.find(e => e.id === id.slice(4)), n = solvedErrands();
    if (id.startsWith('exp:')) return `<b>${x.title}</b> ✓ — opened by solving errands. ${RESIDENTS[x.resident].name} looks after it.`;
    const next = nextExpansion(EXPANSIONS, n), left = x.needs - n;
    return `Misty land. ${next && next.id === x.id ? `<b>${left} more errand${left === 1 ? '' : 's'}</b> from the Notice Board and the mist lifts.` : 'Keep solving errands and it will open one day.'}`;
  }
  const cs = plotChallenges(id), open = cs.find(c => status(c) === 'open');
  if (open) return `<b>${RESIDENTS[open.resident].name}</b> has a request: “${open.title}” · ${open.concept}. Click to help!`;
  const m = mainOf(id);
  if (state.done[m.id]) { const u = upgradeOf(id); return `<b>${m.reward}</b> ✓${u && state.done[u.id] ? ` with ${u.reward.replace(/ for the .*$/, '').toLowerCase()}` : ''} — click to revisit.`; }
  return `An empty lot. Help ${m.requires.map(q => RESIDENTS[byId(q).resident].name).filter((v, i, a) => a.indexOf(v) === i).join(' & ')} first to unlock it.`;
}

// mini portrait canvases
export function portrait(rid, size = 40) {
  const c = document.createElement('canvas'); c.width = 10; c.height = 10; c.className = 'portrait'; c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); const r = RESIDENTS[rid]; const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  P(0, 0, 10, 10, '#f2e3c4'); P(2, 1, 6, 3, r.hair); P(1, 2, 1, 4, r.hair); P(8, 2, 1, 4, r.hair); P(2, 3, 6, 4, C.skin); P(3, 4, 1, 1, C.ink); P(6, 4, 1, 1, C.ink); P(3, 6, 1, 1, '#f0a0a0'); P(6, 6, 1, 1, '#f0a0a0'); P(1, 7, 8, 3, r.shirt);
  return c;
}

export function initTown() {
  paintBackground(); requestAnimationFrame(draw);
  $('#nightBtn').onclick = () => { state.clockOff = !state.clockOff; save(); renderNightBtn(); };
  // the button follows what's actually playing, so it always does what it says
  $('#musicBtn').onclick = () => { if (musicPlaying()) stopMusic(); else startMusic(); state.music = musicPlaying(); save(); renderNightBtn(); };
  // browsers only play sound after a click, so music that was left on starts at the first click (unless that click is the music button)
  if (state.music) document.addEventListener('pointerdown', ev => { if (state.music && state.done.market && !ev.target.closest?.('#musicBtn')) { startMusic(); renderNightBtn(); } }, { once: true });
  renderNightBtn();
  cv.addEventListener('mousemove', ev => { const id = plotAt(ev); if (id !== hover) { hover = id; $('#hoverLabel').innerHTML = plotLabel(id); } cv.style.cursor = id && (challengeForPlot(id) || (id === 'mailbox' && unreadLetters().length)) ? 'pointer' : 'default'; });
  cv.addEventListener('mouseleave', () => { hover = null; $('#hoverLabel').innerHTML = plotLabel(null); });
  cv.addEventListener('click', ev => { const id = plotAt(ev); if (!id) return;
    if (id === 'mailbox' && unreadLetters().length) { openLetters(); return; } const c = challengeForPlot(id); if (c) openChallenge(c.id); else $('#hoverLabel').innerHTML = plotLabel(id); });
}


// ---------- New land south of the railway, opened by errands (src/content/expansions.ts) ----------
const isOpenExp = x => solvedErrands() >= x.needs;
/** The rectangle of an expansion slot: even slots are west of the path, odd slots east of it. */
function slotRect(slot) {
  const y = H + Math.floor(slot / 2) * STRIP;
  return slot % 2 ? { x: 157, y, w: W - 157, h: STRIP } : { x: 0, y, w: 145, h: STRIP };
}
/** Grow the canvas when a new strip of land is shown. The CSS keeps the same width and scales the height. */
function syncSize() {
  const h = H + stripsShown(EXPANSIONS, solvedErrands()) * STRIP;
  if (cv.height !== h) { cv.height = h; cv.style.aspectRatio = `${W} / ${h}`; }
}
// a stable pseudo-random number for (i, k), so the art doesn't flicker frame to frame
const hsh = (i, k = 0) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
const stripBg = [];
function stripBackground(i) {
  if (stripBg[i]) return stripBg[i];
  const c = document.createElement('canvas'); c.width = W; c.height = STRIP; const b = c.getContext('2d');
  const S = (x, y, w, h, col) => { b.fillStyle = col; b.fillRect(x, y, w, h); };
  S(0, 0, W, STRIP, C.grass);
  for (let n = 0; n < 160; n++) S(Math.floor(hsh(n, i + 1) * W), Math.floor(hsh(n, i + 7) * STRIP), 1 + (hsh(n, i + 3) < .3 ? 1 : 0), 1, hsh(n, i + 5) < .5 ? C.grass2 : C.grass3);
  return (stripBg[i] = c);
}
function mist(r, t) {
  ctx.globalAlpha = 0.82; R(r.x, r.y, r.w, r.h, '#dfe6da'); ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i++) {
    const px = r.x + ((hsh(i, 2) * r.w + t / (60 + i * 9)) % (r.w + 30)) - 20, py = r.y + 6 + hsh(i, 4) * (r.h - 16);
    ctx.globalAlpha = 0.55; R(px, py, 22, 5, '#f4f7f1'); R(px + 4, py - 2, 12, 2, '#f4f7f1'); ctx.globalAlpha = 1;
  }
  // a little signpost with a ?
  const sx = r.x + r.w / 2 - 6, sy = r.y + r.h / 2 - 8;
  R(sx + 5, sy + 8, 2, 10, C.wood2); R(sx, sy, 12, 9, C.wood); R(sx + 4, sy + 2, 3, 1, C.white); R(sx + 6, sy + 3, 1, 1, C.white); R(sx + 5, sy + 4, 1, 1, C.white); R(sx + 5, sy + 6, 1, 1, C.white);
}
function drawStrips(t) {
  const n = stripsShown(EXPANSIONS, solvedErrands()); if (!n) return;
  for (let i = 0; i < n; i++) ctx.drawImage(stripBackground(i), 0, H + i * STRIP);
  // a path from the south lane over the railway (a level crossing) down through the new land
  const end = H + n * STRIP;
  R(146, 264, 10, end - 264, C.road); R(145, 264, 1, end - 264, C.road2); R(156, 264, 1, end - 264, C.road2);
  for (let y = 323; y < 334; y += 3) R(145, y, 12, 2, '#c49a6c');
  for (const x of EXPANSIONS) {
    if (Math.floor(x.slot / 2) >= n) continue;
    const r = slotRect(x.slot);
    if (isOpenExp(x)) withReveal('exp-' + x.id, r, t, () => EXPANSION_ART[x.id]?.(r.x, r.y, r.w, r.h, t), () => mist(r, t));
    else mist(r, t);
  }
}
function fence(x, y, w) { R(x, y + 2, w, 1, C.wood); R(x, y + 5, w, 1, C.wood); for (let i = 0; i <= w; i += 8) R(x + i, y, 2, 8, C.wood2); }
function sheep(x, y, t, i) {
  const dx = Math.round(Math.sin(t / 4000 + i * 2) * 10), f = Math.floor(t / 600 + i) % 2;
  x += dx;
  R(x + 1, y + 7, 2, 3, '#3b2a2a'); R(x + 7, y + 7, 2, 3, '#3b2a2a');
  R(x, y + 1, 10, 7, '#f6f2ea'); R(x + 1, y, 8, 1, '#f6f2ea'); R(x, y + 7, 10, 1, '#ddd6c8');
  const hx = Math.sin(t / 4000 + i * 2 + 0.1) * 10 > dx ? x + 9 : x - 3; R(hx, y + 2 + f, 4, 4, '#3b2a2a'); R(hx + 1, y + 3 + f, 1, 1, C.white);
}
function beehive(x, y, t, i) {
  R(x, y + 14, 12, 2, C.wood2); R(x + 1, y + 2, 10, 12, '#e0b040'); for (let k = 0; k < 3; k++) R(x + 1, y + 5 + k * 3, 10, 1, '#c4952c');
  R(x, y, 12, 3, '#a86a32'); R(x + 5, y + 11, 2, 2, '#3b2a2a');
  for (let b = 0; b < 3; b++) { const a = t / (500 + b * 90) + b * 2 + i; R(x + 6 + Math.cos(a) * (8 + b * 2), y + 4 + Math.sin(a * 1.3) * 5, 1, 1, '#3b2a2a'); R(x + 6 + Math.cos(a) * (8 + b * 2), y + 3 + Math.sin(a * 1.3) * 5, 1, 1, '#fff2a8'); }
}
const EXPANSION_ART = {
  meadow(x, y, w, h, t) {
    const fl = ['#f7c6d0', '#fff2a8', '#ffffff', '#e8a0bf', '#b48ad1', '#e07a5f'];
    for (let i = 0; i < 70; i++) { const fx = x + 4 + hsh(i, 11) * (w - 8), fy = y + 4 + hsh(i, 13) * (h - 8), sw = Math.round(Math.sin(t / 800 + i) * 0.6); R(fx, fy + 1, 1, 2, '#4f8a4a'); R(fx + sw, fy, 1, 1, fl[i % fl.length]); }
    fence(x + 4, y + 4, 60);
    beehive(x + 12, y + 20, t, 0); beehive(x + 30, y + 22, t, 1);
    sheep(x + 80, y + 18, t, 0); sheep(x + 110, y + 34, t, 1); sheep(x + 70, y + 46, t, 2);
  },
  orchard(x, y, w, h, t) {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const tx = x + 10 + c * 36 + (r % 2) * 14, ty = y + 4 + r * 32;
      R(tx + 7, ty + 15, 4, 9, C.wood2); R(tx + 1, ty + 3, 16, 12, '#5d9a52'); R(tx + 3, ty, 12, 4, '#5d9a52'); R(tx + 4, ty + 3, 5, 3, '#77b56a');
      for (let a = 0; a < 4; a++) R(tx + 3 + hsh(a, r * 6 + c) * 11, ty + 4 + hsh(a + 9, r * 6 + c) * 9, 2, 2, '#d1495b');
    }
    // a ladder, a basket of apples, and now and then an apple falls
    R(x + 46, y + 10, 1, 18, C.wood); R(x + 50, y + 10, 1, 18, C.wood); for (let k = 0; k < 5; k++) R(x + 46, y + 12 + k * 4, 5, 1, C.wood);
    R(x + 196, y + 56, 12, 7, '#a86a32'); R(x + 196, y + 56, 12, 1, '#8a5a3b'); [[198, 54], [201, 53], [204, 54]].forEach(([a, b]) => R(x + a, y + b, 3, 3, '#d1495b'));
    const k = (t % 7000) / 7000; if (k < 0.12) R(x + 120, y + 14 + k / 0.12 * 12, 2, 2, '#d1495b'); else R(x + 120, y + 26, 2, 2, '#d1495b');
  },
  pond(x, y, w, h, t) {
    const cx = x + 72, cy = y + 36, rx = 52, ry = 22;
    for (let i = -ry; i <= ry; i++) { const half = Math.round(rx * Math.sqrt(1 - (i / ry) ** 2)); R(cx - half - 2, cy + i, half * 2 + 4, 1, '#e8d7a8'); }
    for (let i = -ry + 2; i <= ry - 2; i++) { const half = Math.round((rx - 3) * Math.sqrt(1 - (i / (ry - 2)) ** 2)); R(cx - half, cy + i, half * 2, 1, '#5aa0c0'); }
    for (let i = 0; i < 8; i++) { const wx = cx - 36 + hsh(i, 21) * 72 + Math.sin(t / 900 + i) * 2, wy = cy - 12 + hsh(i, 23) * 24; R(wx, wy, 4, 1, '#86c1d8'); }
    [[cx - 30, cy + 6], [cx + 24, cy - 8], [cx + 8, cy + 12]].forEach(([lx, ly]) => { R(lx, ly, 5, 3, '#6aa85e'); R(lx + 2, ly - 1, 1, 1, '#f7c6d0'); });
    // reeds on the west bank, a jetty on the east
    for (let i = 0; i < 7; i++) { const sw = Math.round(Math.sin(t / 700 + i) * 0.7); R(x + 14 + i * 3 + sw, y + 22 + (i % 3) * 3, 1, 9, '#4f8a4a'); R(x + 14 + i * 3 + sw, y + 21 + (i % 3) * 3, 1, 3, '#8a5a3b'); }
    R(cx + 30, cy - 2, 28, 5, '#a0764e'); R(cx + 30, cy - 2, 28, 1, '#c49a6c'); for (let i = 0; i < 28; i += 9) R(cx + 32 + i, cy + 3, 2, 4, '#6b4429');
    // a duck family paddling round
    for (let d = 0; d < 3; d++) {
      const a = t / 5200 - d * 0.22, dx = cx + Math.cos(a) * 30, dy = cy + Math.sin(a) * 11, s = d ? 0 : 1;
      R(dx, dy, 5 + s, 3 + s, d ? '#f2cc8f' : '#fffaf0'); R(dx + (Math.sin(a) > 0 ? -2 : 4 + s), dy - 2, 3, 3, d ? '#f2cc8f' : '#3f7a3a'); R(dx + (Math.sin(a) > 0 ? -3 : 7 + s), dy - 1, 1, 1, '#e0a458');
    }
  },
  windmill(x, y, w, h, t) {
    // a little hill, the mill and its turning sails
    for (let i = 0; i < 24; i++) { const half = Math.round(70 * Math.sqrt(1 - ((24 - i) / 24) ** 2)); R(x + 120 - half, y + 48 + i, half * 2, 1, i < 2 ? '#bfe0a6' : '#a6d28e'); }
    const mx = x + 110, my = y + 18;
    for (let i = 0; i < 34; i++) { const ww = 14 + Math.round(i / 3); R(mx + 10 - ww / 2, my + i, ww, 1, i % 6 === 0 ? '#e3cfae' : C.wall); }
    roofSteps(mx - 2, my - 8, 24, 5, '#9b3d2a', '#7d2c22');
    R(mx + 6, my + 24, 8, 10, C.door); R(mx + 7, my + 10, 5, 5, C.glass); R(mx + 7, my + 10, 5, 1, C.ink);
    const hx = mx + 10, hy = my + 2, a0 = t / 1400;
    for (let s = 0; s < 4; s++) {
      const a = a0 + s * Math.PI / 2;
      for (let k = 3; k < 28; k++) { R(hx + Math.cos(a) * k, hy + Math.sin(a) * k, 1, 1, C.wood2); if (k > 8) R(hx + Math.cos(a) * k + Math.cos(a + 1.57) * 3, hy + Math.sin(a) * k + Math.sin(a + 1.57) * 3, 2, 2, '#fffaf0'); }
    }
    R(hx - 1, hy - 1, 3, 3, C.ink);
    // flour sacks, and a cart waiting to take them to the bakery
    [[mx - 18, my + 30], [mx - 12, my + 31]].forEach(([sx, sy]) => { R(sx, sy, 6, 7, '#efe6d2'); R(sx + 1, sy - 1, 4, 1, '#d8ccb4'); });
    R(x + 30, y + 52, 26, 8, C.wood); R(x + 30, y + 52, 26, 1, '#a0764e'); R(x + 33, y + 60, 5, 5, '#3b2a2a'); R(x + 48, y + 60, 5, 5, '#3b2a2a'); R(x + 34, y + 49, 6, 4, '#efe6d2'); R(x + 42, y + 49, 6, 4, '#efe6d2');
    for (let i = 0; i < 3; i++) { const fx = x + 180 + i * 14, fy = y + 20 + i * 9; R(fx, fy, 1, 2, '#4f8a4a'); R(fx, fy - 1, 1, 1, ['#fff2a8', '#f7c6d0', '#ffffff'][i]); }
  },
};


// ---------- Friendship: letters in the mailbox and lasting changes around town (src/content/friendship.ts) ----------
const friendsWith = rid => (hearts()[rid] || 0) >= HEARTS.change;
function heart(x, y, c = '#e85a6f') { R(x + 1, y, 1, 1, c); R(x + 3, y, 1, 1, c); R(x, y + 1, 5, 1, c); R(x + 1, y + 2, 3, 1, c); R(x + 2, y + 3, 1, 1, c); }
function star(x, y, c) { R(x + 2, y, 1, 5, c); R(x, y + 2, 5, 1, c); R(x + 1, y + 1, 3, 3, c); }
function envelope(x, y, t) {
  const by = y + Math.round(Math.sin(t / 250) * 1.5);
  R(x, by, 10, 7, C.ink); R(x + 1, by + 1, 8, 5, C.white);
  for (let i = 0; i < 4; i++) { R(x + 1 + i, by + 1 + i, 1, 1, '#c9bca2'); R(x + 8 - i, by + 1 + i, 1, 1, '#c9bca2'); }
  R(x + 4, by + 4, 2, 2, '#e85a6f');
}
// keyed by resident; p is the plot of their building
const FRIEND_PLOT = { wren: 'house', hazel: 'bakery', moss: 'garden', bram: 'store', iris: 'library', juniper: 'school', fern: 'hall', sorrel: 'clinic', rowan: 'park', brine: 'harbour', marigold: 'market', orla: 'observatory' };
const FRIEND_ART = {
  wren(p) { const x = p.x + 21, y = p.y + 34; R(x, y, 7, 1, '#4f8a4a'); R(x, y + 5, 7, 1, '#4f8a4a'); R(x - 1, y + 1, 1, 4, '#4f8a4a'); R(x + 7, y + 1, 1, 4, '#4f8a4a'); R(x + 1, y + 1, 1, 1, '#6aa85e'); R(x + 5, y + 4, 1, 1, '#6aa85e'); R(x + 2, y + 5, 3, 2, '#d1495b'); },
  hazel(p) { const x = p.x + 38, y = p.y + 34; R(x + 2, y - 2, 1, 2, C.wood2); R(x + 13, y - 2, 1, 2, C.wood2); R(x, y, 16, 8, C.wood); R(x + 1, y + 1, 14, 6, '#fff4e0'); heart(x + 2, y + 2); R(x + 8, y + 3, 5, 1, '#c58a4a'); R(x + 8, y + 5, 4, 1, '#c58a4a'); },
  moss(p, t) { const x = p.x + 64, y = p.y + 2, sw = Math.round(Math.sin(t / 900)); R(x + 4, y + 8, 1, 16, C.wood2); R(x, y + 11, 9, 1, C.wood2); R(x + 2, y + 4, 5, 4, '#f2cc8f'); R(x + 3, y + 5, 1, 1, C.ink); R(x + 5, y + 5, 1, 1, C.ink); R(x + 1, y + 2, 7, 2, '#8a5a3b'); R(x + 2, y + 1, 5, 1, '#8a5a3b'); R(x + 2, y + 9, 5, 6, '#4a7fa7'); R(x - 1 + sw, y + 12, 2, 1, '#f2cc8f'); R(x + 8 + sw, y + 12, 2, 1, '#f2cc8f'); },
  bram(p, t) { star(p.x + 18, p.y + 47, Math.floor(t / 700) % 3 ? '#e0b040' : '#fff2a8'); },
  iris(p) { const x = p.x + 29, y = p.y + 19; R(x, y, 18, 1, C.wood2); R(x + 1, y + 1, 16, 7, '#8e6fb5'); R(x + 3, y + 8, 3, 2, '#8e6fb5'); R(x + 12, y + 8, 3, 2, '#8e6fb5'); heart(x + 2, y + 2, '#fff2a8'); R(x + 8, y + 3, 7, 1, '#e8dcf5'); R(x + 8, y + 5, 5, 1, '#e8dcf5'); },
  juniper(p, t) { const x = p.x + 52, y = p.y + 17; star(x, y, '#e0b040'); if (Math.floor(t / 500) % 4 === 0) R(x + 2, y + 2, 1, 1, '#fffaf0'); },
  fern(p, t) { const x = p.x + 76, y = p.y + 4, f = Math.floor(t / 350) % 2; R(x, y, 1, 12, '#3b2a2a'); R(x + 1, y, 9 + f, 6, '#2f6f73'); R(x + 3, y + 1, 1, 1, C.white); R(x + 4, y + 2, 1, 1, C.white); R(x + 5, y + 3, 1, 1, C.white); R(x + 3, y + 4, 1, 1, C.white); R(x + 6, y + 4, 1, 1, C.white); },
  sorrel(p) { heart(p.x + 14, p.y + 28, '#e85a6f'); heart(p.x + 52, p.y + 28, '#e85a6f'); },
  rowan(p, t) { const x = p.x + 40, y = p.y + 4; const fl = ['#e8a0bf', '#d1495b', '#f7c6d0'];
    [[1, 0], [3, 0], [7, 0], [9, 0], [0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [2, 4], [4, 4], [6, 4], [8, 4], [4, 6], [6, 6], [5, 8]].forEach(([a, b], i) => { R(x + a, y + b + 1, 2, 1, '#4f8a4a'); R(x + a, y + b, 2, 1, fl[(i + Math.floor(t / 900)) % 3]); }); },
  brine(p, t) { const bob = Math.round(Math.sin(t / 650 + 1)); const x = p.x + 74, y = p.y + 22 + bob; R(x, y + 4, 12, 3, '#4a7fa7'); R(x + 1, y + 7, 10, 1, '#365f7f'); R(x + 5, y - 4, 1, 8, '#6b4429'); R(x + 6, y - 3, 4, 5, '#fffaf0'); heart(x + 4, y + 4, '#fff2a8'); },
  marigold(p, t) { const x = p.x + 58, y = p.y + 6;
    [['#e85a6f', 0, 0], ['#f2cc8f', 5, -3], ['#81b29a', 9, 1]].forEach(([c, dx, dy], i) => { const sx = x + dx + Math.round(Math.sin(t / 900 + i)), sy = y + dy; R(sx, sy, 4, 5, c); R(sx + 1, sy - 1, 2, 1, c); R(sx + 1, sy + 1, 1, 1, 'rgba(255,255,255,.6)'); for (let k = 0; k < 12; k++) R(sx + 2 + Math.round((x + 4 - sx - 2) * k / 12), sy + 5 + k, 1, 1, '#9a8f80'); }); },
  orla(p, t) { const x = p.x + 8, y = p.y - 2, g = 0.4 + Math.sin(t / 500) * 0.3; ctx.globalAlpha = g; R(x - 2, y + 2, 9, 1, '#fff2a8'); R(x + 2, y - 2, 1, 9, '#fff2a8'); ctx.globalAlpha = 1; star(x, y, '#ffe08a'); R(x + 2, y + 2, 1, 1, C.white); },
};
function drawFriends(t) {
  const h = hearts();
  for (const [rid, pid] of Object.entries(FRIEND_PLOT)) {
    const p = PLOTS[pid], m = mainOf(pid);
    if ((h[rid] || 0) < HEARTS.change || !m || !state.done[m.id]) continue;
    withReveal('friend-' + rid, p, t, () => FRIEND_ART[rid](p, t));
  }
  if (unreadLetters().length && state.done.mailbox) envelope(PLOTS.mailbox.x + 1, PLOTS.mailbox.y - 9, t);
}


// ---------- Life in town: one moving detail per errand topic (src/content/life.ts) ----------
const FOLK = { hair: '#5a4636', shirt: '#b5603f' }, FOLK2 = { hair: '#e0b040', shirt: '#4a7fa7' }, FOLK3 = { hair: '#2f2a28', shirt: '#81b29a' }, KID = { hair: '#c98a3d', shirt: '#e07a5f' }, KID2 = { hair: '#3b2a2a', shirt: '#f2cc8f' };
/** A walker going back and forth between x0 and x1 along y, taking `period` ms each way. Returns [x, facingRight]. */
const pace = (t, x0, x1, period) => { const k = (t % (period * 2)) / period, f = k < 1 ? k : 2 - k; return [x0 + (x1 - x0) * f, k < 1]; };
function cat(x, y, t) {
  const tail = Math.round(Math.sin(t / 500) * 1.5);
  R(x, y + 2, 8, 4, '#e0a458'); R(x + 1, y + 3, 6, 1, '#c98a3d'); R(x + 7, y, 4, 4, '#e0a458'); R(x + 7, y - 1, 1, 1, '#e0a458'); R(x + 10, y - 1, 1, 1, '#e0a458');
  R(x + 8, y + 1, 1, 1, C.ink); R(x - 3, y + 3 + tail, 3, 1, '#e0a458');
  if (Math.floor(t / 1600) % 3 === 0) { const k = (t % 1600) / 1600; ctx.globalAlpha = 1 - k; R(x + 12 + k * 3, y - 3 - k * 6, 2, 1, C.white); R(x + 13 + k * 3, y - 4 - k * 6, 1, 1, C.white); ctx.globalAlpha = 1; }
}
function bike(x, y, t, right) {
  const s = right ? 1 : -1, cx = x + 6, spin = Math.floor(t / 120) % 2;
  [cx - 5 * s, cx + 5 * s].forEach(wx => { R(wx - 2, y + 8, 5, 1, C.ink); R(wx - 2, y + 12, 5, 1, C.ink); R(wx - 3, y + 9, 1, 3, C.ink); R(wx + 2, y + 9, 1, 3, C.ink); R(wx - 1 + spin, y + 10, 1, 1, '#8d8d8d'); });
  R(cx - 4, y + 9, 9, 1, '#c8553d'); R(cx + 5 * s - 1, y + 4, 4, 4, '#a86a32'); R(cx + 5 * s, y + 3, 2, 2, '#e0b070');
  person(cx - 4 - s, y - 6, { hair: '#b5452f', shirt: '#f4efe2' }, t, false);
}
function flock(t) {
  const period = 21000, k = (t % period) / period; if (k > 0.45) return;
  const bx = -20 + k / 0.45 * (W + 40), by = 60 + Math.sin(k * 9) * 8, f = Math.floor(t / 180) % 2;
  [[0, 0], [-7, -4], [-7, 4], [-14, -8], [-14, 8]].forEach(([dx, dy]) => { R(bx + dx, by + dy, 1, 1, C.ink); R(bx + dx - 2, by + dy - f, 2, 1, C.ink); R(bx + dx + 1, by + dy - f, 2, 1, C.ink); });
}
function gull(cx, cy, r, t, ph) { const a = t / 2200 + ph, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.5, f = Math.floor(t / 220 + ph) % 2; R(x, y, 1, 1, C.white); R(x - 3, y - f, 3, 1, C.white); R(x + 1, y - f, 3, 1, C.white); }
const LIFE_ART = {
  functions: t => cat(34, 112, t),
  patterns: t => { const [x, right] = pace(t, -10, W - 4, 13000); bike(x, 102, t, right); },
  map: t => {
    flock(t);
    [[52, 150], [96, 162], [70, 172]].forEach(([x, y], i) => { const hop = Math.floor(t / 400 + i * 3) % 5 === 0 ? 1 : 0; R(x, y - hop, 3, 2, '#7d5a3c'); R(x + 2, y - 1 - hop, 2, 2, '#7d5a3c'); R(x + 4, y - hop, 1, 1, '#e0a458'); });
  },
  filter: t => { const k = (t % 9000) / 9000; if (k > 0.8) return; const y = k < 0.4 ? 106 - k / 0.4 * 18 : 88 + (k - 0.4) / 0.4 * 18; person(244, y, FOLK2, t, true); },
  recursion: t => { const x = 260, y = 164; person(x, y, FOLK3, t, false); R(x + 1, y + 7, 6, 4, '#f6e7cf'); R(x + 4, y + 7, 1, 4, '#c9bca2'); if (Math.floor(t / 1800) % 2) R(x + 5, y + 6, 2, 1, '#f6e7cf'); },
  data: t => { [0, Math.PI].forEach((o, i) => { const a = t / 900 + o; person(98 + Math.cos(a) * 9, 226 + Math.sin(a) * 5, i ? KID2 : KID, t * 2, true); }); },
  io: t => { const [x] = pace(t, 8, 380, 30000); person(x, 249, FOLK, t, true); },
  maybe: t => {
    const [x, right] = pace(t + 4000, 20, 370, 17000), hop = Math.floor(t / 150) % 2, s = right ? 1 : -1;
    R(x, 257 - hop, 8, 4, '#f2efe9'); R(x + (right ? 7 : -2), 255 - hop, 3, 3, '#f2efe9'); R(x + (right ? 9 : -2), 256 - hop, 1, 1, C.ink); R(x + (right ? 8 : -1), 254 - hop, 1, 2, '#a86a32');
    R(x + (right ? -1 : 8), 256 - hop * 2, 1, 2, '#f2efe9'); R(x + 1, 261, 1, 2, '#f2efe9'); R(x + 6, 261 - hop, 1, 2, '#f2efe9'); R(x + 3 * s + 2, 258 - hop, 2, 1, '#e8a0bf');
  },
  hof: t => { person(192, 298, FOLK3, t, true); person(202, 299, KID, t + 500, true); R(212, 304, 6, 6, '#a0764e'); R(213, 304, 4, 1, '#c49a6c'); },
  classes: t => {
    const kx = 352 + Math.sin(t / 1500) * 6, ky = 22 + Math.sin(t / 900) * 3;
    for (let k = 0; k < 20; k++) R(kx + 3 + (340 - kx - 3) * k / 20, ky + 7 + (64 - ky - 7) * k / 20 + Math.sin(k / 3) , 1, 1, '#9a8f80');
    R(kx + 2, ky, 2, 1, '#d1495b'); R(kx + 1, ky + 1, 4, 2, '#d1495b'); R(kx + 2, ky + 3, 2, 3, '#e0b040'); R(kx + 3, ky + 6, 1, 1, '#e0b040');
    for (let k = 0; k < 3; k++) R(kx + 3 + Math.sin(t / 300 + k) , ky + 8 + k * 2, 2, 1, ['#4a7fa7', '#81b29a', '#e07a5f'][k]);
  },
  functor: t => { gull(378, 172, 14, t, 0); gull(372, 200, 10, t, 2.5); },
  monoid: t => { person(292, 168, FOLK, t, true); person(323, 169, FOLK2, t + 700, true); },
  lazy: t => {
    const period = 9000, k = (t % period) / period; if (k > 0.12) return;
    const p = k / 0.12, sx = 120 + p * 140, sy = 6 + p * 40;
    for (let i = 0; i < 10; i++) { ctx.globalAlpha = (1 - i / 10) * (1 - p * 0.6); R(sx - i * 3.5, sy - i, 2, 1, i ? '#fff2a8' : C.white); }
    ctx.globalAlpha = 1;
  },
};
function drawLife(t) {
  if (!state.reviews) return;
  for (const topic of practised()) LIFE_ART[topic]?.(t);
}

// ---------- Night: once the Observatory is built, the map follows the player's clock ----------
// windows that light up after dark, as [plot, x, y, w, h] relative to the plot
const WINDOWS = [
  ['house', 8, 31, 8, 8], ['house', 33, 31, 8, 8], ['bakery', 8, 42, 24, 16], ['store', 8, 44, 18, 14], ['library', 15, 26, 6, 12], ['library', 55, 26, 6, 12],
  ['school', 9, 36, 12, 10], ['school', 51, 36, 12, 10], ['hall', 37, 5, 10, 9], ['clinic', 10, 25, 12, 10], ['clinic', 48, 25, 12, 10],
  ['railway', 26, 29, 10, 8], ['railway', 60, 29, 10, 8], ['harbour', 8, 26, 8, 6], ['harbour', 42, 26, 8, 6], ['observatory', 17, 31, 5, 5], ['observatory', 43, 31, 5, 5],
];
/** The hour of day used for night, from the clock (the DEV panel can override it with state.devHour). */
export const hourNow = () => state.devHour ?? (new Date().getHours() + new Date().getMinutes() / 60);
export const nightOn = () => !!state.done.observatory && !state.clockOff;
function drawNight(t) {
  if (!nightOn()) return;
  const n = nightness(hourNow()); if (n <= 0) return;
  ctx.globalAlpha = 0.5 * n; ctx.fillStyle = n < 0.6 ? '#3a3a78' : '#1d2350'; ctx.fillRect(0, 0, W, cv.height);
  ctx.globalAlpha = 1;
  if (n < 0.35) return;
  const glow = Math.min(1, (n - 0.35) / 0.4);
  for (const [pid, dx, dy, w, h] of WINDOWS) {
    const p = PLOTS[pid], m = mainOf(pid); if (!m || !state.done[m.id]) continue;
    ctx.globalAlpha = 0.18 * glow; R(p.x + dx - 2, p.y + dy - 2, w + 4, h + 4, '#ffd970');
    ctx.globalAlpha = 0.85 * glow; R(p.x + dx, p.y + dy, w, h, '#ffd970');
  }
  // the lighthouse lamp and the windmill window
  ctx.globalAlpha = 0.9 * glow; if (state.done.harbour2) R(384, 133, 6, 5, '#fff2a8');
  // a few fireflies over the grass
  for (let i = 0; i < 10; i++) { const fx = (hsh(i, 41) * W + Math.sin(t / 1300 + i) * 8) | 0, fy = (hsh(i, 43) * cv.height + Math.cos(t / 1100 + i) * 6) | 0; ctx.globalAlpha = glow * (0.4 + 0.6 * Math.max(0, Math.sin(t / 400 + i * 2))); R(fx, fy, 1, 1, '#f6ff9a'); }
  ctx.globalAlpha = 1;
}

/** The buttons in the corner of the map: market music (once the Market is built) and night (once the Observatory is). */
export function renderNightBtn() {
  const m = $('#musicBtn');
  if (m) { m.hidden = !state.done.market; m.textContent = musicPlaying() ? '🎵 Music on' : '🔇 Music off'; m.title = musicPlaying() ? 'Stop the market music' : "Play Marigold's market music"; }
  const b = $('#nightBtn'); if (!b) return;
  b.hidden = !state.done.observatory;
  b.textContent = state.clockOff ? '☀️ Always day' : '🌙 Night follows your clock';
  b.title = state.clockOff ? 'Let the town get dark in the evening, like your clock' : 'Keep the town in daylight';
}

// a fiddler by the market while the music plays, with notes floating up
function musician(t) {
  const x = 344, y = 162, bow = Math.round(Math.sin(t / 160) * 2);
  person(x, y, { hair: '#e8a33d', shirt: '#7a3b6e' }, t, true);
  R(x + 6, y + 6, 4, 3, '#8a5a3b'); R(x + 9, y + 5, 2, 1, '#6b4429'); R(x + 3 + bow, y + 4, 1, 1, '#d6ccb8'); R(x + 4 + bow, y + 5, 6, 1, '#d6ccb8');
  for (let i = 0; i < 3; i++) {
    const k = ((t / 2200) + i / 3) % 1, nx = x + 8 + Math.sin(k * 6 + i) * 4, ny = y - 2 - k * 18;
    ctx.globalAlpha = 1 - k; R(nx, ny, 2, 2, C.ink); R(nx + 1, ny - 4, 1, 4, C.ink); R(nx + 2, ny - 4, 1, 1, C.ink); ctx.globalAlpha = 1;
  }
}
