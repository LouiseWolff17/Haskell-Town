// The purse (docs/gift-items-design.md, section 7): 🪙 coins, shown next to the Satchel on the map.
// One purse, shared between Haskell Town and Glaschu. Every errand solved brings a fixed amount (COINS.errand),
// whatever the outcome, like the hearts; those coins are worked out from the errand log, so they're never lost.
// Selling finds and buying things go through `earn` and `spend`; Bram's store (interiors.ts) does both.
import { COINS, DECORATIONS, FINDS, SATCHEL_SLOTS, STORE, USEFUL } from '../content/index.ts';
import { $, save, state } from './state.ts';
import { purseCoins, roomFor, saleTotal, slotsUsed, tenOff } from './rewards.ts';

/** The coins in the purse right now. */
export const coins = (): number => purseCoins(state.reviews?.log || [], COINS.errand, state.purse);
/** "1 coin", "35 coins". */
export const coinWord = (n: number): string => `${n} coin${n === 1 ? '' : 's'}`;

/** Put coins in the purse (selling a find). */
export function earn(n: number): void {
  (state.purse ||= { earned: 0, spent: 0 }).earned += n; save(); renderPurse();
}
/** Pay coins out of the purse, if there are enough. Returns whether it was paid. */
export function spend(n: number): boolean {
  if (n > coins()) return false;
  (state.purse ||= { earned: 0, spent: 0 }).spent += n; save(); renderPurse();
  return true;
}

// ---------- Satchel slots (docs/gift-items-design.md, section 1) ----------
// Finds, shelf things, seed packets and decorations waiting in the Satchel take a slot each; gifts, the rod and the
// bigger satchel never do, so a full satchel never blocks progress. Only new things are turned away when it's full:
// selling finds or setting decorations down makes room, and putting a decoration back is always allowed.

/** How many things the Satchel holds: more with the bigger satchel. */
export const satchelSlots = (): number => state.useful?.satchel ? SATCHEL_SLOTS.bigger : SATCHEL_SLOTS.base;
/** The slots taken right now. */
export function satchelUsed(): number {
  const seeds = Object.fromEntries(USEFUL.filter(u => !u.once).map(u => [u.id, state.useful?.[u.id] || 0]));
  const decor = { kept: (state.decor || []).filter(d => d.x == null).length };
  return slotsUsed(state.finds || {}, state.bought || {}, seeds, decor);
}
/** How many of `n` new things fit in the Satchel. */
export const satchelRoom = (n = 1): number => roomFor(satchelUsed(), satchelSlots(), n);

// ---------- Finds and bought things (they wait in the Satchel) ----------

/** Why a purchase didn't happen: not enough coins, or no room in the Satchel. Nothing is spent either way. */
export type Bought = 'ok' | 'coins' | 'full' | 'have';
/** Pay for one thing that takes a slot (or none, `slot = false`), then `get` it. */
function purchase(price: number, get: () => void, slot = true): Bought {
  if (slot && !satchelRoom()) return 'full';
  if (!spend(price)) return 'coins';
  get(); save();
  return 'ok';
}

/** What a shelf item costs with Bram's card. You can only get into the store with the card, so it always applies. */
export const cardPrice = (name: string): number => tenOff(STORE.shelf.find(s => s.name === name)?.price ?? 0);
/** Buy one of a shelf item, with 10% off. */
export function buy(name: string): Bought {
  if (!STORE.shelf.some(s => s.name === name)) return 'coins';
  return purchase(cardPrice(name), () => { const b = (state.bought ||= {}); b[name] = (b[name] || 0) + 1; });
}

/** What a decoration costs with Bram's card. */
export const decorPrice = (kind: string): number => tenOff(DECORATIONS.find(d => d.id === kind)?.price ?? 0);
/** Buy a decoration, with 10% off. It waits in the Satchel until it's set down in Decorate mode. */
export function buyDecoration(kind: string): Bought {
  if (!DECORATIONS.some(d => d.id === kind)) return 'coins';
  return purchase(decorPrice(kind), () => { (state.decor ||= []).push({ kind }); });
}

/** What a useful thing costs with Bram's card. */
export const usefulPrice = (id: string): number => tenOff(USEFUL.find(u => u.id === id)?.price ?? 0);
/** How many of a useful thing you have (the rod and the bigger satchel: 1 once bought). */
export const haveUseful = (id: string): number => state.useful?.[id] || 0;
/** Buy a useful thing, with 10% off: another seed packet (it takes a slot), or the rod or the bigger satchel (once, no slot). */
export function buyUseful(id: string): Bought {
  const u = USEFUL.find(x => x.id === id);
  if (!u) return 'coins';
  if (u.once && haveUseful(id)) return 'have';
  return purchase(usefulPrice(id), () => { const h = (state.useful ||= {}); h[id] = (h[id] || 0) + 1; }, !u.once);
}

/** The finds in the Satchel, in FINDS order, with how many of each. */
export const heldFinds = () => FINDS.filter(f => (state.finds?.[f.id] || 0) > 0).map(f => ({ find: f, n: state.finds![f.id] }));
/** Put finds in the Satchel, as many as there's room for (the beach, the hives, the sea and the garden will call this;
 *  so can the DEV panel). Returns how many went in: fewer than `n` means the Satchel is full. */
export function addFind(id: string, n = 1): number {
  if (!FINDS.some(f => f.id === id) || n <= 0) return 0;
  const fit = satchelRoom(n);
  if (fit) { const f = (state.finds ||= {}); f[id] = (f[id] || 0) + fit; save(); }
  return fit;
}
const PRICES = Object.fromEntries(FINDS.map(f => [f.id, f.price]));
/** What Bram would pay for everything you've found. */
export const findsValue = (): number => saleTotal(state.finds || {}, PRICES);
/** Sell every find to Bram at the standard price. Returns the coins it brought. */
export function sellAll(): number {
  const total = findsValue();
  if (!total) return 0;
  state.finds = {};
  earn(total); // saves
  return total;
}

let shown = -1;
/** The counter appears with the first coin and stays after that. It gives a little hop when the amount changes. */
export function renderPurse(): void {
  const el = $('#purse'), n = coins();
  el.hidden = !state.reviews?.log.length && !state.purse;
  el.textContent = `🪙 ${n}`;
  el.title = `${coinWord(n)} in your purse. Every errand brings ${COINS.errand}. The purse is shared with Glaschu.`;
  if (shown >= 0 && n !== shown) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  shown = n;
}
