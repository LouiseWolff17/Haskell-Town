// Shared game state and small helpers.
import { CHALLENGES } from '../content/index.ts';
import type { AssistMode, Challenge } from '../content/index.ts';
import type { ReviewState } from './schedule.ts';

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

/** Everything saved in localStorage. Fields after `welcomed` are added as the game goes on. */
export interface GameState {
  /** Solved challenges, by id. */
  done: Record<string, boolean>;
  /** Editor contents, by challenge id, `errand:<id>`, or `workshop`. */
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
  /** DEV panel: days the clock has been moved forward, and an hour override. */
  devDays?: number;
  devHour?: number;
}

const fresh = (mode: AssistMode, welcomed: boolean): GameState =>
  ({ done: {}, code: {}, hints: {}, attempts: {}, mode, welcomed });

// The player's progress, saved in localStorage. Always mutate this object; never replace it.
export const state: GameState = fresh('guided', false);
try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && s.done) Object.assign(state, s); } catch {}
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
