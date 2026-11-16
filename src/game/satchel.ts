// The Satchel (docs/gift-items-design.md, section 1): a button on the map once the first gift arrives,
// listing the gifts that haven't been used yet. Pick one and the place it belongs glows on the map.
// Click there to use it. Click anywhere else and you get a gentle line, and the item goes back in the
// Satchel. Nothing is lost. The map side (the glow, where a target is, clicks) is in town.ts.
import { FRIENDSHIP, HEARTS, ITEMS, RESIDENTS } from '../content/index.ts';
import { $, save, state } from './state.ts';
import { hearts, today } from './errands.ts';
import { toast } from './notebook.ts';
import { plotLabel, targetBox } from './town.ts';
import type { GiftItem } from '../content/index.ts';

const giftOf = (rid: string) => FRIENDSHIP.find(f => f.resident === rid)!.gift;
/** "A spare key" → "the spare key", for sentences. */
const the = (rid: string): string => giftOf(rid).name.replace(/^(A|An|The)\s+/, 'the ');

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
}

function pick(rid: string): void {
  const it = ITEMS.find(i => i.resident === rid)!;
  closeList();
  if (!it.target || !targetBox(it.target)) { toast(`${giftOf(rid).icon} ${it.notYet}`); return; }
  held = it; document.body.classList.add('holding');
  $('#hoverLabel').innerHTML = holdLabel();
  renderSatchel();
}

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
  list.querySelectorAll<HTMLElement>('[data-item]').forEach(b => b.onclick = () => pick(b.dataset.item!));
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
    if (held) putBack(); else if (!$('#satchel').hidden) { closeList(); $('#satchelBtn').focus(); }
  });
  // a click outside the open list closes it
  document.addEventListener('pointerdown', e => { const t = e.target as Element | null; if (!$('#satchel').hidden && !t?.closest?.('#satchel, #satchelBtn')) closeList(); });
  renderSatchel();
}
