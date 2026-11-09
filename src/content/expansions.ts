import type { Expansion } from './types.ts';

// Land that opens south of the railway once the village is built, as errands are solved.
// Every solved errand counts the same, however it went: from memory, with a peek, or relearned.
// Errands are limited per day, so these open every few days rather than all at once.
// To add one: give it the next slot and a larger `needs`, and a drawing in src/game/town.js (EXPANSION_ART).
export const EXPANSIONS: Expansion[] = [
  { id: 'meadow', title: 'Wildflower Meadow', needs: 3, slot: 0, resident: 'moss',
    note: 'The mist south of the railway has lifted. Moss has put out beehives, and a few sheep have wandered in.' },
  { id: 'orchard', title: 'Apple Orchard', needs: 8, slot: 1, resident: 'hazel',
    note: 'An old orchard was hiding in the fog. Hazel is already planning apple pies.' },
  { id: 'pond', title: 'Duck Pond', needs: 15, slot: 2, resident: 'rowan',
    note: 'A new strip of land has opened, with a pond, reeds and a family of ducks. Rowan built a little jetty.' },
  { id: 'windmill', title: 'Windmill Hill', needs: 25, slot: 3, resident: 'bram',
    note: 'The windmill on the hill is turning again. Bram will grind flour for the bakery.' },
];
