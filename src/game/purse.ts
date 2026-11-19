// The purse (docs/gift-items-design.md, section 7): 🪙 coins, shown next to the Satchel on the map.
// One purse, shared between Haskell Town and Glaschu. Every errand solved brings a fixed amount (COINS.errand),
// whatever the outcome, like the hearts; those coins are worked out from the errand log, so they're never lost.
// Selling finds and buying things go through `earn` and `spend`; Bram's store (interiors.ts) does both.
import { COINS, FINDS, STORE } from '../content/index.ts';
import { $, save, state } from './state.ts';
import { purseCoins, saleTotal, tenOff } from './rewards.ts';

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

// ---------- Finds and bought things (they wait in the Satchel) ----------

/** What a shelf item costs with Bram's card. You can only get into the store with the card, so it always applies. */
export const cardPrice = (name: string): number => tenOff(STORE.shelf.find(s => s.name === name)?.price ?? 0);
/** Buy one of a shelf item, with 10% off. Returns whether there were enough coins. */
export function buy(name: string): boolean {
  if (!STORE.shelf.some(s => s.name === name) || !spend(cardPrice(name))) return false;
  const b = (state.bought ||= {}); b[name] = (b[name] || 0) + 1; save();
  return true;
}

/** The finds in the Satchel, in FINDS order, with how many of each. */
export const heldFinds = () => FINDS.filter(f => (state.finds?.[f.id] || 0) > 0).map(f => ({ find: f, n: state.finds![f.id] }));
/** Put a find in the Satchel (the beach, the hives, the sea and the garden will call this; so can the DEV panel). */
export function addFind(id: string, n = 1): void {
  if (!FINDS.some(f => f.id === id) || n <= 0) return;
  const f = (state.finds ||= {}); f[id] = (f[id] || 0) + n; save();
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
