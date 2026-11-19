// Your garden plot (docs/gift-items-design.md, section 8b): a small fenced patch by Wren's cottage, there once you have seeds.
// A seed grows one stage a day on the player's own clock (seed → sprout → bud → ready) and then waits: nothing wilts.
// Seeds are mixed packets, so the garden decides what each one becomes when it's planted; you find out at the bud.
import type { Plant } from './types.ts';

/** How many beds the plot has. A bigger plot could be an upgrade one day. */
export const GARDEN_BEDS = 4;

export const PLANTS: Plant[] = [
  { id: 'daisy', icon: '🌼', name: 'a daisy', find: 'flower', look: 'flower', colour: '#fff2a8' },
  { id: 'rose', icon: '🌹', name: 'a rose', find: 'flower', look: 'flower', colour: '#d1495b' },
  { id: 'sweetpea', icon: '🌸', name: 'a sweet pea', find: 'flower', look: 'flower', colour: '#e8a0bf' },
  { id: 'carrot', icon: '🥕', name: 'carrots', find: 'vegetable', look: 'carrot', colour: '#e07a2f' },
  { id: 'cabbage', icon: '🥬', name: 'a cabbage', find: 'vegetable', look: 'cabbage', colour: '#7cb85e' },
  { id: 'pumpkin', icon: '🎃', name: 'a pumpkin', find: 'vegetable', look: 'pumpkin', colour: '#e0862f' },
];
