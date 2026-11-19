// Shared game state and small helpers.
import { CHALLENGES } from '../content/index.ts';
import type { AssistMode, Challenge } from '../content/index.ts';
import type { ReviewState } from './schedule.ts';
import type { ProjectProgress } from './project-rules.ts';

export const KEY = 'haskelltown-v1';
export const MODES: Record<AssistMode, { label: string; desc: string }> = {
  guided: { label: 'Guided', desc: 'Concept explained up front, code with ___ blanks to fill in, step-by-step hints.' },
  balanced: { label: 'Balanced', desc: 'You get the type signature and the tests. Hints whenever you ask.' },
  independent: { label: 'Independent', desc: 'Just the problem and an empty notebook. Hints are still there if you want them.' },
};
export const HINT_LEVELS = ['Concept', 'Direction', 'Structure', 'Almost there'];
export const byId = (id: string): Challenge | undefined => CHALLENGES.find(c => c.id === id);
/** The first element matching `s`. The game's markup is fixed, so callers can rely on it being there. */
export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, c => ESCAPES[c]);
/** A day number (see schedule.ts dayNumber) as a short date, e.g. "9 Nov". */
export const dateOf = (day: number): string => new Date(day * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Everything saved in localStorage. Fields after `welcomed` are added as the game goes on. */
export interface GameState {
  /** Solved challenges, by id. */
  done: Record<string, boolean>;
  /** Editor contents, by challenge id, `errand:<id>`, `project:<id>`, or `workshop`. */
  code: Record<string, string>;
  /** Hints shown, by challenge id. */
  hints: Record<string, number>;
  /** Runs, by challenge id. */
  attempts: Record<string, number>;
  mode: AssistMode;
  welcomed: boolean;
  /** The Notice Board, once the village is built. */
  reviews?: ReviewState;
  /** The code and day each building was finished, for the Journal. */
  journal?: Record<string, { code: string; day: number }>;
  /** The latest solving code for each errand, for its Journal stamp. */
  errandCode?: Record<string, string>;
  /** Residents whose letter has been read. */
  lettersRead?: Record<string, boolean>;
  /** Where the player stands on the map. */
  player?: { x: number; y: number };
  /** Keep the town in daylight instead of following the clock. */
  clockOff?: boolean;
  /** Market music was playing last time. */
  music?: boolean;
  /** Workshop expression and stdin boxes. */
  wsExpr?: string;
  wsInput?: string;
  /** Satchel items used on their place (or given away, the Glaschu items), by the resident who gave them: the day it was used. */
  used?: Record<string, number>;
  /** The town interiors: the day the croissants were first baked, the book the sunflower marks, the name the hall greets. */
  inside?: { baked?: number; bookmark?: string; name?: string; /** The hives you've been inside, and the day you first went in. */ hives?: Record<string, number>; /** The magical beach: the day you first went, and how many shells you've found there. */ beach?: number; shells?: number };
  /** The purse's coins other than from errands (those come from `reviews.log`): sold finds in, purchases out. Shared with Glaschu. */
  purse?: { earned: number; spent: number };
  /** Things you've found (a FINDS id → how many), waiting in the Satchel to be sold. */
  finds?: Record<string, number>;
  /** Things bought at Bram's store (a shelf name → how many), waiting in the Satchel. */
  bought?: Record<string, number>;
  /** Decorations from Bram's store: with a position (the top-left of its footprint, in map pixels, on the 8 px grid) once it's
   *  set down on the map, without one while it waits in the Satchel. */
  decor?: { kind: string; x?: number; y?: number }[];
  /** Useful things from Bram's store (a USEFUL id → how many): seed packets waiting in the Satchel, and the rod and the
   *  bigger satchel (1 once bought). */
  useful?: Record<string, number>;
  /** Your garden plot by Wren's cottage: each bed's plant (a PLANTS id) and the day it was planted, or null while it's
   *  empty; and how many things you've picked from it, for the Journal. */
  garden?: { beds: ({ plant: string; day: number } | null)[]; picked?: number };
  /** City Hall projects, by project id. Their code is in `code` under `project:<id>`. */
  projects?: Record<string, ProjectProgress>;
  /** DEV panel: days the clock has been moved forward, and an hour override. */
  devDays?: number;
  devHour?: number;
}

const fresh = (mode: AssistMode, welcomed: boolean): GameState =>
  ({ done: {}, code: {}, hints: {}, attempts: {}, mode, welcomed });

// The player's progress, saved in localStorage. Always mutate this object; never replace it.
export const state: GameState = fresh('guided', false);
try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && s.done) Object.assign(state, s); } catch {}
// Seeds used to be an ordinary shelf item; they're a useful thing now (waiting for the garden plot).
if (state.bought?.seeds) { (state.useful ||= {}).seeds = (state.useful.seeds || 0) + state.bought.seeds; delete state.bought.seeds; }
export function save(): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
// Start the town over, keeping the chosen learning-assistance mode.
export function resetProgress(): void {
  const mode = state.mode;
  for (const k of Object.keys(state) as (keyof GameState)[]) delete state[k];
  Object.assign(state, fresh(mode, true));
  save();
}
export const isUnlocked = (c: Challenge): boolean => c.requires.every(r => state.done[r]);
export type Status = 'done' | 'open' | 'locked';
export const status = (c: Challenge): Status => state.done[c.id] ? 'done' : isUnlocked(c) ? 'open' : 'locked';
