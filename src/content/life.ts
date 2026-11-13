import type { LifeTouch } from './types.ts';

// Life in town: the first errand you solve on each topic brings one moving detail to the map.
// Drawn in src/game/town.ts (LIFE_ART), keyed by topic.
export const LIFE: LifeTouch[] = [
  { topic: 'functions', title: 'A sleepy cat', note: "A cat has taken up napping on the road outside Wren's cottage." },
  { topic: 'patterns', title: 'The bread bike', note: "Hazel's delivery bike now rides up and down the main road with a basket of loaves." },
  { topic: 'map', title: 'Birds', note: "Birds have found Moss's garden. Now and then a little flock flies over the town." },
  { topic: 'filter', title: 'A shopper', note: "Bram has a regular: a shopper pops in and out of the general store." },
  { topic: 'recursion', title: 'A reader', note: "Someone is reading on the library bench, turning page after page." },
  { topic: 'data', title: 'Playtime', note: 'Two children chase each other round and round near the school.' },
  { topic: 'io', title: 'An evening stroll', note: 'A neighbour strolls along the south lane, saying hello to everyone.' },
  { topic: 'maybe', title: 'A dog', note: "A happy dog trots along the lane. Dr. Sorrel says it's perfectly healthy, just bouncy." },
  { topic: 'hof', title: 'Passengers', note: 'Passengers wait on the platform for the next train.' },
  { topic: 'classes', title: 'A kite', note: 'Someone is flying a kite over the park.' },
  { topic: 'functor', title: 'Gulls', note: 'Gulls circle over the harbour, hoping for a crate of fish.' },
  { topic: 'monoid', title: 'Market shoppers', note: "Shoppers browse Marigold's stalls." },
  { topic: 'lazy', title: 'Shooting stars', note: 'Now and then a shooting star streaks across the sky. Orla is keeping count.' },
];
