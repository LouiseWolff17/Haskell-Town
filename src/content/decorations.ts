// Decorations (docs/gift-items-design.md, section 8a): small things from Bram's store that make the town look like yours.
// They have no other effect. Bought ones wait in the Satchel; in Decorate mode on the map they're set down anywhere on
// open ground, snapping to an 8 px grid, and can be moved or put back in the Satchel at any time.
// `w` and `h` are the footprint in grid cells (what has to be free); the art may reach above it (a lamp post's head).
import type { Decoration } from './types.ts';

export const DECORATIONS: Decoration[] = [
  { id: 'lamp', icon: '🪔', name: 'lamp post', price: 15, w: 1, h: 1, solid: true, light: true, note: 'An iron lamp post. It lights itself when the town gets dark.' },
  { id: 'bench', icon: '🪑', name: 'bench', price: 12, w: 2, h: 1, solid: true, note: 'A wooden bench, for sitting and watching the town go by.' },
  { id: 'pot', icon: '🌷', name: 'flower pot', price: 6, w: 1, h: 1, solid: true, note: 'A clay pot of flowers. Moss says they never need watering, and won\'t say why.' },
  { id: 'fence', icon: '🪵', name: 'fence', price: 8, w: 3, h: 1, solid: true, note: 'Three lengths of garden fence.' },
  { id: 'birdbath', icon: '🐦', name: 'birdbath', price: 14, w: 2, h: 1, solid: true, note: 'A stone birdbath. The birds find it before you\'ve finished setting it down.' },
  { id: 'sign', icon: '🪧', name: 'signpost', price: 10, w: 1, h: 1, solid: true, note: 'A signpost pointing somewhere nice.' },
  { id: 'well', icon: '🪣', name: 'well', price: 25, w: 2, h: 2, solid: true, note: 'A little stone well with a bucket. Make a wish: `wish :: Coin -> IO ()`.' },
  { id: 'stones', icon: '🪨', name: 'stepping stones', price: 5, w: 2, h: 1, solid: false, note: 'Flat stepping stones. You can walk over these.' },
];
