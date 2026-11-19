// Your garden plot's rules, as pure functions (tests/garden.test.ts). The plot itself is in garden.ts, its art in town.ts.
// Days are the player's own calendar days (errands.ts `today`), so a seed planted tonight is a sprout tomorrow morning.

export type Stage = 'empty' | 'seed' | 'sprout' | 'bud' | 'ready';
/** A planted bed: what it will be (a PLANTS id) and the day it went in. */
export interface Bed { plant: string; day: number }
/** The stages a seed goes through, one a day. */
export const GROWING: Stage[] = ['seed', 'sprout', 'bud', 'ready'];
/** Days from planting to ready. */
export const DAYS_TO_READY = GROWING.length - 1;

/** How a bed looks on day `today`: one stage further each new day, then ready for good. Nothing wilts, and a clock that
 *  went backwards (the DEV panel) just keeps it a seed. */
export function stageOf(bed: Bed | null | undefined, today: number): Stage {
  if (!bed) return 'empty';
  return GROWING[Math.min(DAYS_TO_READY, Math.max(0, today - bed.day))];
}
/** Days until a bed is ready (0 once it is). */
export const daysLeft = (bed: Bed, today: number): number => Math.max(0, DAYS_TO_READY - Math.max(0, today - bed.day));
/** The beds, always `n` of them: a saved plot with fewer (or no) beds gets empty ones. */
export const bedsOf = (saved: (Bed | null)[] | undefined, n: number): (Bed | null)[] =>
  Array.from({ length: n }, (_, i) => saved?.[i] ?? null);
/** What a new seed becomes: a mixed packet, so the garden decides. `r` is a random number in [0, 1). */
export const plantFor = <T>(plants: readonly T[], r: number): T => plants[Math.min(plants.length - 1, Math.floor(r * plants.length))];
