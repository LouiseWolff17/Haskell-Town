// Decorate mode (docs/gift-items-design.md, section 8a): decorations from Bram's store, set down anywhere on open ground.
// This file keeps the decorations (state.decor), the mode itself, its tray under the map and the pixel art. The map side
// (what counts as open ground, the ghost that follows the mouse, clicks and keys) is in town.ts; the rules are in decor-rules.ts.
// In Decorate mode clicks move things instead of walking or opening places, so placing never gets mixed up with playing.
import { DECORATIONS } from '../content/index.ts';
import { $, esc, save, state } from './state.ts';
import { GRID } from './decor-rules.ts';
import type { Box } from './decor-rules.ts';
import type { Decoration } from '../content/index.ts';
import type { Rect } from './player.ts';

export const decoKind = (id: string): Decoration | undefined => DECORATIONS.find(d => d.id === id);
/** One decoration you own, by its place in state.decor. */
export interface Owned { i: number; deco: Decoration; x?: number; y?: number }
const owned = (): Owned[] => (state.decor || []).flatMap((d, i) => { const deco = decoKind(d.kind); return deco ? [{ i, deco, x: d.x, y: d.y }] : []; });
/** Decorations set down on the map (not the one in your hand while it's being moved). */
export const placedDecor = (): (Owned & { x: number; y: number })[] =>
  owned().filter((d): d is Owned & { x: number; y: number } => d.x != null && d.y != null && d.i !== held?.i);
/** Decorations waiting in the Satchel, by kind in shelf order, with how many of each. */
export const keptDecor = (): { deco: Decoration; n: number }[] =>
  DECORATIONS.map(deco => ({ deco, n: owned().filter(d => d.deco === deco && d.x == null && d.i !== held?.i).length })).filter(k => k.n > 0);
/** A decoration's footprint in map pixels, at a top-left position. */
export const footprint = (deco: Decoration, x: number, y: number): Box => ({ x, y, w: deco.w * GRID, h: deco.h * GRID });
/** How far a decoration's art reaches above its footprint (for clicking it, and drawing it in front of the character). */
export const TALL: Record<string, number> = { lamp: 20, sign: 12, well: 8, birdbath: 4, pot: 3, bench: 2, fence: 1, stones: 0 };

// ---------- The mode ----------
let on = false;
/** The decoration in your hand: a new one from the Satchel (no `from`), or one picked up off the map (where it was). */
let held: { i: number; from: [x: number, y: number] | null } | null = null;
/** Where the held decoration would go (the top-left of its footprint), set by the map as the mouse or keys move it. */
let ghost: [x: number, y: number] | null = null;

export const decorating = (): boolean => on;
export const heldDecor = (): Decoration | null => held ? decoKind(state.decor![held.i].kind) ?? null : null;
export const ghostAt = (): [x: number, y: number] | null => ghost;
export function moveGhost(x: number, y: number): void { ghost = [x, y]; }

/** Decorate mode is there once you own a decoration. */
const hasDecor = (): boolean => owned().length > 0;

/** Into Decorate mode, with a decoration of `kind` from the Satchel already in hand if one's given. */
export function startDecorating(kind?: string): void {
  if (!hasDecor()) return;
  beforeStart();
  on = true; document.body.classList.add('decorating');
  if (kind) holdNew(kind); else renderDecor();
}
/** Out of Decorate mode: a decoration still in your hand goes back where it came from. */
export function stopDecorating(): void {
  if (!on) return;
  cancelHold();
  on = false; document.body.classList.remove('decorating');
  renderDecor();
}
/** Take a decoration of `kind` out of the Satchel. The map puts it on the nearest free spot until the mouse or keys move it. */
export function holdNew(kind: string): void {
  const i = (state.decor || []).findIndex((d, k) => d.kind === kind && d.x == null && k !== held?.i);
  if (i < 0) return;
  cancelHold();
  held = { i, from: null }; ghost = null;
  renderDecor();
}
/** Pick up a decoration off the map, to move it. */
export function pickUp(i: number): void {
  const d = state.decor?.[i]; if (!d || d.x == null || d.y == null) return;
  cancelHold();
  held = { i, from: [d.x, d.y] }; ghost = [d.x, d.y];
  renderDecor();
}
/** Set the held decoration down at (x, y). The map has already checked the ground is open. */
export function setDown(x: number, y: number): void {
  if (!held) return;
  Object.assign(state.decor![held.i], { x, y }); save();
  held = null; ghost = null;
  renderDecor();
}
/** Put the held decoration back in the Satchel (from the map too). */
export function keepHeld(): void {
  if (!held) return;
  const d = state.decor![held.i]; delete d.x; delete d.y; save();
  held = null; ghost = null;
  renderDecor();
}
/** Drop what's in hand without changing anything: a new one stays in the Satchel, a moved one stays where it was. */
export function cancelHold(): void {
  if (!held) return;
  held = null; ghost = null;
  renderDecor();
}

/** Called after something changes (bought, placed, mode toggled): the button and tray follow along. Satchel refreshes too. */
let onChange: () => void = () => {}, beforeStart: () => void = () => {};
export function renderDecor(): void {
  const btn = $('#decorBtn'), tray = $('#decorTray');
  btn.hidden = !hasDecor();
  btn.textContent = on ? '✓ Done decorating' : '🪴 Decorate';
  btn.title = on ? 'Back to walking around town' : 'Set down, move or put away your decorations';
  btn.setAttribute('aria-pressed', String(on));
  tray.hidden = !on;
  if (on) {
    const h = heldDecor(), kept = keptDecor();
    tray.innerHTML = h
      ? `<p><b>${h.icon} The ${esc(h.name)}</b> is in your hand. Click open ground to set it down, or use <kbd>←↑↓→</kbd> and <kbd>Enter</kbd>.</p>
        <div class="decor-row"><button class="btn-soft" data-keep>🎒 Put in satchel</button><button class="btn-soft" data-cancel>${held!.from ? 'Leave it where it was' : 'Not now'}</button></div>`
      : `<p><b>🪴 Decorating.</b> ${kept.length ? 'Pick something to set down, or click' : 'Click'} a decoration on the map to move it.</p>
        ${kept.length ? `<div class="decor-row">${kept.map(({ deco: d, n }) => `<button class="btn-soft" data-hold="${d.id}" aria-label="Set down the ${esc(d.name)}${n > 1 ? ` (${n} in your satchel)` : ''}">${d.icon} ${esc(d.name)}${n > 1 ? ` <small>× ${n}</small>` : ''}</button>`).join('')}</div>` : ''}`;
    tray.querySelectorAll<HTMLElement>('[data-hold]').forEach(b => b.onclick = () => holdNew(b.dataset.hold!));
    tray.querySelector<HTMLElement>('[data-keep]')?.addEventListener('click', keepHeld);
    tray.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', cancelHold);
  }
  onChange();
}
/** `changed` runs after every change; `starting` just before Decorate mode starts (a gift in hand goes back in the Satchel). */
export function initDecor(changed: () => void, starting: () => void): void {
  onChange = changed; beforeStart = starting;
  $('#decorBtn').onclick = () => { if (on) stopDecorating(); else startDecorating(); };
  renderDecor();
}

// ---------- The pixel art. (x, y) is the top-left of the footprint; tall things reach up above it ----------
const IRON = '#3b3f46', WOOD = '#8a5a3b', WOOD2 = '#6b4429', STONE = '#b8b2a6', STONE2 = '#9a948a';
/** Draw a decoration. `lit` is for lamp posts after dark (the glow itself is drawn with the night, in town.ts). */
export function drawDeco(R: Rect, kind: string, x: number, y: number, t: number, lit = false): void {
  switch (kind) {
    case 'lamp':
      R(x + 1, y + 7, 6, 1, 'rgba(0,0,0,.15)'); R(x + 2, y + 5, 4, 3, IRON); R(x + 3, y - 14, 2, 19, IRON);
      R(x + 1, y - 19, 6, 5, IRON); R(x + 2, y - 18, 4, 3, lit ? '#fff2a8' : '#d8e4ea'); R(x + 2, y - 20, 4, 1, IRON); R(x + 3, y - 21, 2, 1, IRON);
      break;
    case 'bench':
      R(x + 1, y + 7, 14, 1, 'rgba(0,0,0,.15)'); R(x + 1, y - 2, 14, 2, WOOD); R(x + 2, y, 1, 2, WOOD2); R(x + 13, y, 1, 2, WOOD2);
      R(x + 1, y + 2, 14, 2, WOOD); R(x + 1, y + 3, 14, 1, WOOD2); R(x + 2, y + 4, 1, 3, WOOD2); R(x + 13, y + 4, 1, 3, WOOD2);
      break;
    case 'pot': {
      const sw = Math.round(Math.sin(t / 700 + x) * 0.6);
      R(x + 3 + sw, y - 2, 1, 5, '#4f8a4a'); R(x + 5, y - 1, 1, 4, '#4f8a4a'); R(x + 1, y, 1, 3, '#4f8a4a');
      R(x + 2 + sw, y - 3, 3, 2, '#e8a0bf'); R(x + 5, y - 2, 2, 2, '#fff2a8'); R(x, y - 1, 2, 2, '#e07a5f');
      R(x, y + 3, 8, 1, '#c8714f'); R(x + 1, y + 4, 6, 4, '#b5603f'); R(x + 2, y + 7, 4, 1, '#9b4f33');
      break;
    }
    case 'fence':
      R(x, y + 2, 24, 1, WOOD); R(x, y + 5, 24, 1, WOOD);
      for (let i = 0; i < 24; i += 8) R(x + i + 1, y - 1, 2, 9, WOOD2);
      R(x + 22, y - 1, 2, 9, WOOD2);
      break;
    case 'birdbath': {
      R(x + 3, y + 7, 10, 1, 'rgba(0,0,0,.15)'); R(x + 6, y + 1, 4, 6, STONE2); R(x + 4, y + 6, 8, 2, STONE2);
      R(x + 1, y - 3, 14, 4, STONE); R(x + 2, y - 3, 12, 2, '#6fb3c9'); R(x + 3 + Math.floor(t / 500) % 8, y - 3, 2, 1, '#a5d8e6');
      // a bird drops in now and then for a splash
      if (Math.floor(t / 4000 + x) % 3 === 0) { const hop = Math.floor(t / 250) % 2; R(x + 11, y - 6 - hop, 4, 3, '#7d5a3c'); R(x + 14, y - 7 - hop, 2, 2, '#7d5a3c'); R(x + 16, y - 6 - hop, 1, 1, '#e0a458'); }
      break;
    }
    case 'sign':
      R(x + 2, y + 7, 5, 1, 'rgba(0,0,0,.15)'); R(x + 3, y - 10, 2, 18, WOOD2);
      R(x - 1, y - 11, 10, 6, WOOD); R(x + 9, y - 10, 1, 4, WOOD); R(x + 10, y - 9, 1, 2, WOOD);
      R(x + 1, y - 9, 6, 1, '#c49a6c'); R(x + 1, y - 7, 4, 1, '#c49a6c');
      break;
    case 'well': {
      R(x - 1, y - 8, 18, 2, '#9b3d2a'); R(x, y - 9, 16, 1, '#c8553d'); R(x + 1, y - 6, 2, 13, WOOD2); R(x + 13, y - 6, 2, 13, WOOD2);
      R(x + 3, y - 4, 10, 1, WOOD); const b = Math.round(Math.sin(t / 900) * 1); R(x + 7, y - 3, 1, 3 + b, '#9a8f80'); R(x + 6, y + b, 3, 3, '#a0764e');
      R(x + 1, y + 5, 14, 10, STONE2); R(x + 1, y + 5, 14, 2, STONE); R(x + 3, y + 6, 10, 2, '#2f4f6a');
      for (let k = 0; k < 3; k++) R(x + 2 + k * 5, y + 10 + (k % 2) * 2, 3, 1, '#857f75');
      R(x + 1, y + 15, 14, 1, 'rgba(0,0,0,.15)');
      break;
    }
    case 'stones':
      [[1, 3, 5], [7, 0, 4], [11, 4, 4]].forEach(([dx, dy, w]) => { R(x + dx, y + dy + 1, w, 2, STONE); R(x + dx + 1, y + dy, w - 2, 1, '#cfc9bd'); R(x + dx, y + dy + 3, w, 1, STONE2); });
      break;
  }
}
