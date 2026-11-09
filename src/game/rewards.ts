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

// ---------- Friendship ----------

/** Hearts per resident: one for each of their errands you've solved, up to `max`. */
export function heartsByResident(log: LogEntry[], residentOf: (errandId: string) => string | undefined, max = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of log) { const r = residentOf(e.errand); if (r) out[r] = Math.min(max, (out[r] || 0) + 1); }
  return out;
}

export type FriendReward = 'letter' | 'gift' | 'change';
/** The rewards a resident has at this many hearts. */
export function friendRewards(hearts: number, at: Record<FriendReward, number>): FriendReward[] {
  return (Object.keys(at) as FriendReward[]).filter(k => hearts >= at[k]);
}
/** The rewards reached going from `before` to `after` hearts. */
export function newFriendRewards(before: number, after: number, at: Record<FriendReward, number>): FriendReward[] {
  return (Object.keys(at) as FriendReward[]).filter(k => before < at[k] && after >= at[k]);
}

// ---------- Life in town ----------

/** Topics with at least one solved errand. Log entries from before a topic was split count for every topic it became. */
export function topicsPractised(log: LogEntry[], legacy: Record<string, string[]> = {}): Set<string> {
  const out = new Set<string>();
  for (const e of log) for (const t of legacy[e.topic] ?? [e.topic]) out.add(t);
  return out;
}

/** How dark the map is at this hour (0 = day, up to 1 = deep night), for the day/night cycle. */
export function nightness(hours: number): number {
  if (hours >= 7 && hours < 17) return 0;
  if (hours >= 17 && hours < 20) return (hours - 17) / 3;
  if (hours >= 5 && hours < 7) return (7 - hours) / 2;
  return 1;
}
