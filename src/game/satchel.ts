// The Satchel (docs/gift-items-design.md, section 1): a button on the map once the first gift arrives,
// listing the gifts that haven't been used yet. Pick one and the place it belongs glows on the map.
// Click there to use it. Click anywhere else and you get a gentle line, and the item goes back in the
// Satchel. Nothing is lost. The map side (the glow, where a target is, clicks) is in town.ts.
import { FRIENDSHIP, HEARTS, ITEMS, RESIDENTS } from '../content/index.ts';
import { $, save, state } from './state.ts';
import { hearts, today } from './errands.ts';
import { toast } from './notebook.ts';
import { goInside, plotLabel, targetBox } from './town.ts';
import { hasInterior } from './interiors.ts';
import type { GiftItem } from '../content/index.ts';

const giftOf = (rid: string) => FRIENDSHIP.find(f => f.resident === rid)!.gift;
/** "A spare key" → "the spare key", for sentences. */
const the = (rid: string): string => giftOf(rid).name.replace(/^(A|An|The)\s+/, 'the ');

/** A gift's Journal note, with its extra line once it has been used (Fern's key). */
export function giftNote(rid: string): string {
  const g = giftOf(rid);
  return g.afterUse && state.used?.[rid] ? `${g.note} ${g.afterUse}` : g.note;
}

/** Gifts you've been given and haven't used yet, in the order of the Friends panel. */
export function satchelItems(): GiftItem[] {
  const h = hearts();
  return ITEMS.filter(i => (h[i.resident] || 0) >= HEARTS.gift && !state.used?.[i.resident]);
}
/** The Satchel appears with the first gift and stays after that. */
const hasSatchel = (): boolean => Object.values(hearts()).some(n => n >= HEARTS.gift);

let held: GiftItem | null = null;
/** The item picked from the Satchel, waiting to be used on the map. */
export const heldItem = (): GiftItem | null => held;

export function holdLabel(): string {
  return held ? `🎒 <b>${giftOf(held.resident).icon} ${cap(the(held.resident))}</b> is in your hand. Click the place that glows to use it, or press <kbd>Esc</kbd> to put it back.` : '';
}
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Put the held item back in the Satchel, with an optional line saying why. */
export function putBack(line?: string): void {
  if (!held) return;
  if (line) toast(`${giftOf(held.resident).icon} ${line} <span class="toast-aside">${cap(the(held.resident))} is back in your satchel.</span>`);
  held = null; document.body.classList.remove('holding'); $('#hoverLabel').innerHTML = plotLabel(null);
  renderSatchel();
}

/** A click (or E) on the map while holding an item: use it if `hit` is its place, otherwise put it back. */
export function useHeld(hit: boolean): void {
  const it = held; if (!it) return;
  if (!hit) { putBack(it.wrong); return; }
  held = null; document.body.classList.remove('holding');
  (state.used ||= {})[it.resident] = today(); save();
  toast(`${giftOf(it.resident).icon} ${it.used}<br><code class="use-code">use ${it.id} ${it.target!.name}</code>`);
  $('#hoverLabel').innerHTML = plotLabel(null);
  renderSatchel();
  // a building you can go into: in you go, through its front door. The other places can be visited from now on.
  if (hasInterior(it.resident)) goInside(it.resident);
}

function pick(rid: string): void {
  const it = ITEMS.find(i => i.resident === rid)!;
  closeList();
  if (!it.target || !targetBox(it.target)) { toast(`${giftOf(rid).icon} ${it.notYet}`); return; }
  held = it; document.body.classList.add('holding');
  $('#hoverLabel').innerHTML = holdLabel();
  renderSatchel();
}

/** Places opened with a gift, still on the map: each can be visited again (from the map, or the Satchel's list). */
export function openDoors(): GiftItem[] {
  return ITEMS.filter(i => state.used?.[i.resident] && i.target && i.place && targetBox(i.target));
}
/** Visit a place opened with a gift. The five town buildings are rooms you walk into through their front
 *  door (interiors.ts); the other places are a small card for now (docs/gift-items-design.md section 4). */
export function visit(rid: string): void {
  const it = ITEMS.find(i => i.resident === rid); if (!it?.place) return;
  closeList();
  if (hasInterior(rid)) { goInside(rid); return; }
  const g = giftOf(rid), card = $('#visit');
  card.querySelector('.visit-icon')!.textContent = g.icon;
  card.querySelector('h2')!.textContent = it.place;
  card.querySelector('.visit-text')!.textContent = it.visit ?? '';
  card.querySelector('.visit-from')!.textContent = `Opened with ${the(rid)} from ${RESIDENTS[rid].name}.`;
  card.hidden = false; document.body.classList.add('modal-open');
  setTimeout(() => card.querySelector<HTMLElement>('.btn-build')?.focus(), 50);
}
function closeVisit(): void { $('#visit').hidden = true; document.body.classList.remove('modal-open'); }

const closeList = (): void => { $('#satchel').hidden = true; $('#satchelBtn').setAttribute('aria-expanded', 'false'); };

export function renderSatchel(): void {
  const btn = $('#satchelBtn'), items = satchelItems();
  btn.hidden = !hasSatchel();
  btn.innerHTML = held ? `🎒 Put ${giftOf(held.resident).icon} back` : `🎒 Satchel${items.length ? ` <span class="satchel-n">${items.length}</span>` : ''}`;
  btn.title = held ? 'Put the item back in your satchel' : 'Gifts from your friends, to use around town';
  const list = $('#satchel');
  list.innerHTML = `<div class="satchel-h">Your satchel</div>` + (items.length
    ? items.map(i => { const g = giftOf(i.resident), ready = !!i.target && !!targetBox(i.target);
      return `<button class="satchel-item${ready ? '' : ' waiting'}" data-item="${i.resident}"><span class="satchel-icon">${g.icon}</span><span><b>${g.name}</b><small>From ${RESIDENTS[i.resident].name}${ready ? '' : ' · keep it for now'}</small></span></button>`; }).join('')
    : `<p class="board-small">Empty for now. Every gift has found its place.</p>`);
  const doors = openDoors();
  if (doors.length) list.innerHTML += `<div class="satchel-h satchel-h2">🚪 Open doors</div>` + doors.map(i =>
    `<button class="satchel-item" data-door="${i.resident}"><span class="satchel-icon">${giftOf(i.resident).icon}</span><span><b>${i.place}</b><small>Pop in again</small></span></button>`).join('');
  list.querySelectorAll<HTMLElement>('[data-item]').forEach(b => b.onclick = () => pick(b.dataset.item!));
  list.querySelectorAll<HTMLElement>('[data-door]').forEach(b => b.onclick = () => visit(b.dataset.door!));
}

export function initSatchel(): void {
  $('#satchelBtn').onclick = () => {
    if (held) { putBack(); return; }
    const list = $('#satchel'); renderSatchel(); list.hidden = !list.hidden;
    $('#satchelBtn').setAttribute('aria-expanded', String(!list.hidden));
    if (!list.hidden) list.querySelector<HTMLElement>('button')?.focus();
  };
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#visit').hidden) closeVisit(); else if (held) putBack(); else if (!$('#satchel').hidden) { closeList(); $('#satchelBtn').focus(); }
  });
  $('#visit').querySelectorAll<HTMLElement>('.btn-build, .x').forEach(b => b.onclick = closeVisit);
  $('#visit').addEventListener('click', e => { if (e.target === e.currentTarget) closeVisit(); });
  // a click outside the open list closes it
  document.addEventListener('pointerdown', e => { const t = e.target as Element | null; if (!$('#satchel').hidden && !t?.closest?.('#satchel, #satchelBtn')) closeList(); });
  renderSatchel();
}
