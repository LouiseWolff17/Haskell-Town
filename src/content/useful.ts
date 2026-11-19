// Useful things (docs/gift-items-design.md, section 8b): on Bram's shelf next to the decorations, at the card price.
// Seeds are bought by the packet and wait in the Satchel for your garden plot by Wren's cottage (ROADMAP: the garden).
// The rod and the bigger satchel are bought once and kept for good. Neither one takes a slot.
import type { Useful } from './types.ts';

/** How many finds and bought things the Satchel holds, before and after the bigger satchel. Gifts never take a slot. */
export const SATCHEL_SLOTS = { base: 20, bigger: 40 };

export const USEFUL: Useful[] = [
  { id: 'seeds', icon: '🌱', name: 'seeds', price: 8, note: 'A packet of mixed seeds. Bram won\'t say what they\'ll be: "That\'s half the fun."' },
  { id: 'rod', icon: '🎣', name: 'fishing rod', price: 40, once: true, note: 'A springy rod with a smooth reel: more kinds of fish, and now and then a rare one. Brine\'s old line still catches all the common ones.' },
  { id: 'satchel', icon: '🎒', name: 'bigger satchel', price: 30, once: true, note: `Room for ${SATCHEL_SLOTS.bigger} finds and bought things instead of ${SATCHEL_SLOTS.base}. Gifts never take up room.` },
];
