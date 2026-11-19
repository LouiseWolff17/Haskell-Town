// The Satchel (docs/gift-items-design.md, section 1): a button on the map once the first gift arrives,
// listing the gifts that haven't been used yet. Pick one and the place it belongs glows on the map.
// Click there to use it. Click anywhere else and you get a gentle line, and the item goes back in the
// Satchel. Nothing is lost. The map side (the glow, where a target is, clicks) is in town.ts.
import { FRIENDSHIP, HEARTS, ITEMS, RESIDENTS, STORE } from '../content/index.ts';
import { $, dateOf, save, state } from './state.ts';
import { hearts, today } from './errands.ts';
import { toast } from './notebook.ts';
import { goInside, plotLabel, targetBox } from './town.ts';
import { beachNote, hasInterior, hivesNote, placeOf } from './interiors.ts';
import { giftFor, roomsOf } from './rooms.ts';
import { heldFinds } from './purse.ts';
import { keptDecor, startDecorating, stopDecorating } from './decor.ts';
import type { GiftItem } from '../content/index.ts';

const giftOf = (rid: string) => FRIENDSHIP.find(f => f.resident === rid)!.gift;
/** "A spare key" → "the spare key", for sentences. */
const the = (rid: string): string => giftOf(rid).name.replace(/^(A|An|The)\s+/, 'the ');

/** A gift's Journal note, with its extra line once it has been used (Fern's key), the hives you've been inside (Rowan's tulip),
 *  the shells you've found on the beach (Brine's conch), and who it went to once given away (the Glaschu items). */
export function giftNote(rid: string): string {
  const g = giftOf(rid), note = g.afterUse && state.used?.[rid] ? `${g.note} ${g.afterUse}` : g.note;
  return [note, hivesNote(rid), beachNote(rid), givenNote(rid)].filter(Boolean).join(' ');
}

/** Gifts given away on your travels (the Glaschu items), with the day: they leave the Satchel but stay in the Journal as a memory. */
export function givenAway(): { item: GiftItem; gift: ReturnType<typeof giftOf>; day: number }[] {
  return ITEMS.filter(i => i.givenTo && state.used?.[i.resident] != null)
    .map(i => ({ item: i, gift: giftOf(i.resident), day: state.used![i.resident] }));
}
function givenNote(rid: string): string {
  const it = ITEMS.find(i => i.resident === rid), day = state.used?.[rid];
  return it?.givenTo && day != null ? `<i>Given to ${it.givenTo}, ${dateOf(day)}.</i>` : '';
}
/** Give a travel gift to the person it was meant for (Glaschu will call this; the DEV panel can too).
 *  It leaves the Satchel and becomes a memory in the Journal. */
export function giveAway(rid: string): void {
  const it = ITEMS.find(i => i.resident === rid);
  if (!it?.givenTo || state.used?.[rid] != null) return;
  (state.used ||= {})[rid] = today(); save();
  toast(`${giftOf(rid).icon} You gave ${the(rid)} to ${it.givenTo}. <span class="toast-aside">It's in your Journal now, as a memory.</span>`);
  renderSatchel();
}

/** Gifts you've been given and haven't used yet, in the order of the Friends panel. */
export function satchelItems(): GiftItem[] {
  const h = hearts();
  return ITEMS.filter(i => (h[i.resident] || 0) >= HEARTS.gift && !state.used?.[i.resident]);
}
/** Things bought at Bram's store, in shelf order, with how many of each. */
const boughtItems = () => STORE.shelf.filter(s => (state.bought?.[s.name] || 0) > 0).map(s => ({ item: s, n: state.bought![s.name] }));
/** The Satchel appears with the first gift (or the first find or purchase) and stays after that. */
const hasSatchel = (): boolean => Object.values(hearts()).some(n => n >= HEARTS.gift) || heldFinds().length > 0 || boughtItems().length > 0 || !!state.decor?.length;

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
  // a building you can go into: in you go, through its front door (the hives: you're walked over to pick one).
  // The other places can be visited from now on.
  if (hasInterior(it.resident)) goInside(it.resident);
}

function pick(rid: string): void {
  const it = ITEMS.find(i => i.resident === rid)!;
  closeList(); stopDecorating();
  if (!it.target || !targetBox(it.target)) { toast(`${giftOf(rid).icon} ${it.notYet}`); return; }
  held = it; document.body.classList.add('holding');
  $('#hoverLabel').innerHTML = holdLabel();
  renderSatchel();
}

/** Places opened with a gift, still on the map: each can be visited again (from the map, or the Satchel's list). */
export function openDoors(): GiftItem[] {
  return ITEMS.filter(i => state.used?.[i.resident] && i.target && i.place && targetBox(i.target));
}
/** Visit a place opened with a gift (`rid` is the gift's resident, or one of the rooms it opens: a hive). The five town
 *  buildings, Brine's boat and the hives are rooms you walk into (interiors.ts); the other places are a small card for
 *  now (docs/gift-items-design.md section 4). */
export function visit(rid: string): void {
  const it = ITEMS.find(i => i.resident === giftFor(rid)); if (!it?.place) return;
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
  // finds wait to be sold at Bram's till; bought things wait for their place (they're not used on the map yet)
  const finds = heldFinds(), bought = boughtItems();
  if (finds.length) list.innerHTML += `<div class="satchel-h satchel-h2">🧺 Finds</div>` + finds.map(({ find: f, n }) =>
    `<div class="satchel-item"><span class="satchel-icon">${f.icon}</span><span><b>${n} ${n === 1 ? f.name : f.plural}</b><small>Bram buys these at his till</small></span></div>`).join('');
  if (bought.length) list.innerHTML += `<div class="satchel-h satchel-h2">🛍️ From Bram's store</div>` + bought.map(({ item: b, n }) =>
    `<div class="satchel-item"><span class="satchel-icon">${b.icon}</span><span><b>${n > 1 ? `${n} × ` : ''}${b.name}</b><small>${b.note}</small></span></div>`).join('');
  // decorations wait to be set down on the map, in Decorate mode
  const decor = keptDecor();
  if (decor.length) list.innerHTML += `<div class="satchel-h satchel-h2">🪴 Decorations</div>` + decor.map(({ deco: d, n }) =>
    `<button class="satchel-item" data-decor="${d.id}"><span class="satchel-icon">${d.icon}</span><span><b>${n > 1 ? `${n} × ` : ''}${d.name}</b><small>Set it down anywhere on open ground</small></span></button>`).join('');
  // a gift that opens several rooms (Rowan's tulip: three hives) lists each of them
  const doors = openDoors().flatMap(i => { const rs = roomsOf(i.resident); return rs.length > 1 ? rs.map(r => ({ i, id: r, name: cap(placeOf(r)) })) : [{ i, id: i.resident, name: i.place! }]; });
  if (doors.length) list.innerHTML += `<div class="satchel-h satchel-h2">🚪 Open doors</div>` + doors.map(({ i, id, name }) =>
    `<button class="satchel-item" data-door="${id}"><span class="satchel-icon">${giftOf(i.resident).icon}</span><span><b>${name}</b><small>Pop in again</small></span></button>`).join('');
  list.querySelectorAll<HTMLElement>('[data-item]').forEach(b => b.onclick = () => pick(b.dataset.item!));
  list.querySelectorAll<HTMLElement>('[data-door]').forEach(b => b.onclick = () => visit(b.dataset.door!));
  list.querySelectorAll<HTMLElement>('[data-decor]').forEach(b => b.onclick = () => { closeList(); startDecorating(b.dataset.decor!); });
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
