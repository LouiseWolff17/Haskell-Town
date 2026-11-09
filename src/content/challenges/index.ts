import type { Challenge } from '../types.ts';
import house from './01-house.ts';
import mailbox from './02-mailbox.ts';
import bakery from './03-bakery.ts';
import garden from './04-garden.ts';
import store from './05-store.ts';
import library from './06-library.ts';
import school from './07-school.ts';
import hall from './08-hall.ts';
import clinic from './09-clinic.ts';
import railway from './10-railway.ts';
import park from './11-park.ts';
import harbour from './12-harbour.ts';
import market from './13-market.ts';
import observatory from './14-observatory.ts';

// Every challenge in the game, in the order they appear in the Requests list.
// To add a building: add a file here, import it, and put it in this list.
export const CHALLENGES: Challenge[] = [
  ...house,
  ...mailbox,
  ...bakery,
  ...garden,
  ...store,
  ...library,
  ...school,
  ...hall,
  ...clinic,
  ...railway,
  ...park,
  ...harbour,
  ...market,
  ...observatory,
];
