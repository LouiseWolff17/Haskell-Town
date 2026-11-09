// Rewards for errands, as pure functions (tests/rewards.test.ts).
//
// The rule from the design doc holds here too: a reward never depends on how much help was used.
// Every solved errand counts once, whether it was recalled first try, done with a peek, or relearned.
import type { Expansion } from '../content/types.ts';
import type { LogEntry } from './schedule.ts';

/** How many errands have been solved in total. */
export const errandsSolved = (log: LogEntry[]): number => log.length;

/** The expansions that are open after `solved` errands, in slot order. */
export function openExpansions(expansions: Expansion[], solved: number): Expansion[] {
  return expansions.filter(x => solved >= x.needs).sort((a, b) => a.slot - b.slot);
}

/** The next expansion to open, or null when everything is open. */
export function nextExpansion(expansions: Expansion[], solved: number): Expansion | null {
  return [...expansions].sort((a, b) => a.needs - b.needs).find(x => solved < x.needs) ?? null;
}

/** Expansions that opened between `before` and `after` errands solved. */
export function newlyOpened(expansions: Expansion[], before: number, after: number): Expansion[] {
  return expansions.filter(x => before < x.needs && after >= x.needs);
}

/** How many strips of land the map shows: every strip with an open slot. The other half of a strip shows as mist. */
export function stripsShown(expansions: Expansion[], solved: number): number {
  const open = openExpansions(expansions, solved);
  return open.length ? Math.max(...open.map(x => Math.floor(x.slot / 2))) + 1 : 0;
}

/** Journal stamps: how many times each errand has been solved, and the first day. */
export function errandStamps(log: LogEntry[]): Record<string, { times: number; first: number }> {
  const out: Record<string, { times: number; first: number }> = {};
  for (const e of log) {
    const s = out[e.errand];
    if (s) s.times++; else out[e.errand] = { times: 1, first: e.date };
  }
  return out;
}

/** The day each expansion opened, worked out from the log (the day of the errand that reached its `needs`). */
export function openedOn(expansions: Expansion[], log: LogEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of expansions) if (log.length >= x.needs) out[x.id] = log[x.needs - 1].date;
  return out;
}
