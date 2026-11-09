// Rewards for errands: map growth and Journal stamps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSIONS, RESIDENTS } from '../src/content/index.ts';
import { errandStamps, errandsSolved, newlyOpened, nextExpansion, openExpansions, openedOn, stripsShown } from '../src/game/rewards.ts';
import type { LogEntry } from '../src/game/schedule.ts';

const entry = (date: number, errand: string, outcome: LogEntry['outcome'] = 'recalled'): LogEntry =>
  ({ date, topic: 't', errand, outcome, confidence: null, firstTry: outcome === 'recalled' });

test('expansions have unique ids and slots, known residents, and open in slot order', () => {
  assert.equal(new Set(EXPANSIONS.map(x => x.id)).size, EXPANSIONS.length);
  assert.equal(new Set(EXPANSIONS.map(x => x.slot)).size, EXPANSIONS.length);
  const bySlot = [...EXPANSIONS].sort((a, b) => a.slot - b.slot);
  bySlot.forEach((x, i) => {
    assert.equal(x.slot, i, 'slots should be 0, 1, 2, … with no gaps');
    assert.ok(RESIDENTS[x.resident], `${x.id}: unknown resident ${x.resident}`);
    assert.ok(x.needs > 0);
    if (i) assert.ok(x.needs > bySlot[i - 1].needs, `${x.id} should need more errands than ${bySlot[i - 1].id}`);
  });
});

test('every outcome counts the same towards growth', () => {
  const log = [entry(1, 'a', 'recalled'), entry(1, 'b', 'effortful'), entry(2, 'c', 'relearned')];
  assert.equal(errandsSolved(log), 3);
});

test('expansions open at their thresholds', () => {
  assert.deepEqual(openExpansions(EXPANSIONS, 0), []);
  const first = EXPANSIONS[0];
  assert.deepEqual(openExpansions(EXPANSIONS, first.needs - 1), []);
  assert.deepEqual(openExpansions(EXPANSIONS, first.needs).map(x => x.id), [first.id]);
  assert.equal(nextExpansion(EXPANSIONS, 0)?.id, first.id);
  assert.equal(nextExpansion(EXPANSIONS, 1000), null);
});

test('newlyOpened only reports the thresholds crossed', () => {
  const [a, b] = EXPANSIONS;
  assert.deepEqual(newlyOpened(EXPANSIONS, a.needs - 1, a.needs).map(x => x.id), [a.id]);
  assert.deepEqual(newlyOpened(EXPANSIONS, a.needs, a.needs + 1), []);
  assert.deepEqual(newlyOpened(EXPANSIONS, 0, b.needs).map(x => x.id), [a.id, b.id]);
});

test('the map shows a strip as soon as one of its two slots is open', () => {
  const need = (slot: number) => EXPANSIONS.find(x => x.slot === slot)!.needs;
  assert.equal(stripsShown(EXPANSIONS, 0), 0);
  assert.equal(stripsShown(EXPANSIONS, need(0)), 1);
  assert.equal(stripsShown(EXPANSIONS, need(1)), 1);
  assert.equal(stripsShown(EXPANSIONS, need(2)), 2);
});

test('stamps count each errand and remember the first day', () => {
  const s = errandStamps([entry(3, 'a'), entry(4, 'b'), entry(9, 'a', 'effortful')]);
  assert.deepEqual(s, { a: { times: 2, first: 3 }, b: { times: 1, first: 4 } });
});

test('openedOn uses the day of the errand that reached the threshold', () => {
  const first = EXPANSIONS[0];
  const log = Array.from({ length: first.needs }, (_, i) => entry(10 + i, 'e' + i));
  assert.deepEqual(openedOn(EXPANSIONS, log), { [first.id]: 10 + first.needs - 1 });
});

import { ERRANDS, FRIENDSHIP, HEARTS } from '../src/content/index.ts';
import { friendRewards, heartsByResident, newFriendRewards } from '../src/game/rewards.ts';

test('every resident has a friendship entry, and every errand-giver is one of them', () => {
  assert.deepEqual(FRIENDSHIP.map(f => f.resident).sort(), Object.keys(RESIDENTS).sort());
  for (const e of ERRANDS) assert.ok(FRIENDSHIP.some(f => f.resident === e.resident), `${e.id}: ${e.resident} has no friendship entry`);
  assert.ok(HEARTS.letter < HEARTS.gift && HEARTS.gift < HEARTS.change);
});

test('hearts come one per solved errand, whatever the outcome, capped', () => {
  const who = (id: string) => ({ a: 'hazel', b: 'wren' } as Record<string, string>)[id];
  const log = [entry(1, 'a', 'recalled'), entry(2, 'a', 'relearned'), entry(3, 'b', 'effortful'), entry(4, 'a')];
  assert.deepEqual(heartsByResident(log, who), { hazel: 3, wren: 1 });
  assert.deepEqual(heartsByResident(log, who, 2), { hazel: 2, wren: 1 });
});

test('friend rewards arrive at their heart counts, once', () => {
  assert.deepEqual(friendRewards(0, HEARTS), []);
  assert.deepEqual(friendRewards(HEARTS.gift, HEARTS), ['letter', 'gift']);
  assert.deepEqual(newFriendRewards(0, 1, HEARTS), ['letter']);
  assert.deepEqual(newFriendRewards(HEARTS.change, HEARTS.change + 1, HEARTS), []);
  assert.deepEqual(newFriendRewards(HEARTS.gift, HEARTS.change, HEARTS), ['change']);
});
