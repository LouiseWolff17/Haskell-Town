// Things you find (docs/gift-items-design.md, section 7): they wait in the Satchel until you sell them.
// Bram's store buys every kind at the fair standard price below, the whole satchel in one go.
// (Each find's own resident will pay a little more for it; that comes with the places you find them.)
import type { Find } from './types.ts';

export const FINDS: Find[] = [
  { id: 'shell', icon: '🐚', name: 'shell', plural: 'shells', price: 2 },
  { id: 'honey', icon: '🍯', name: 'jar of honey', plural: 'jars of honey', price: 4 },
  { id: 'fish', icon: '🐟', name: 'fish', plural: 'fish', price: 3 },
  { id: 'flower', icon: '🌼', name: 'flower', plural: 'flowers', price: 2 },
  { id: 'vegetable', icon: '🥕', name: 'vegetable', plural: 'vegetables', price: 3 },
];
