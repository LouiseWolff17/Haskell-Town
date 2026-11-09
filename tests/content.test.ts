// Checks that the game's content fits together: ids, unlock order, residents, hints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, RESIDENTS, WORKSHOP_EXAMPLES, NOT_SUPPORTED } from '../src/content/index.ts';

test('there are 23 challenges, numbered 1..23 in list order', () => {
  assert.equal(CHALLENGES.length, 23);
  CHALLENGES.forEach((c, i) => assert.equal(c.num, i + 1, `${c.id} should be number ${i + 1}`));
});

test('challenge ids are unique', () => {
  const ids = CHALLENGES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every requirement is an earlier challenge', () => {
  const seen = new Set<string>();
  for (const c of CHALLENGES) {
    for (const r of c.requires) assert.ok(seen.has(r), `${c.id} requires ${r}, which must come before it`);
    seen.add(c.id);
  }
});

test('every challenge is reachable from the first one', () => {
  const done = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const c of CHALLENGES) {
      if (!done.has(c.id) && c.requires.every(r => done.has(r))) { done.add(c.id); progress = true; }
    }
  }
  assert.equal(done.size, CHALLENGES.length);
});

test('every resident exists, and upgrades point at a building', () => {
  const ids = new Set(CHALLENGES.map(c => c.id));
  for (const c of CHALLENGES) {
    assert.ok(RESIDENTS[c.resident], `${c.id}: unknown resident ${c.resident}`);
    if (c.upgrade) assert.ok(c.plot && ids.has(c.plot), `${c.id}: upgrade needs a plot that is a challenge id`);
  }
});

test('every challenge has four hints, starters for each mode, tests and a solution', () => {
  for (const c of CHALLENGES) {
    assert.equal(c.hints.length, 4, `${c.id}: hints`);
    for (const m of ['guided', 'balanced', 'independent'] as const) assert.equal(typeof c.starter[m], 'string', `${c.id}: starter.${m}`);
    assert.ok(c.tests.length > 0, `${c.id}: tests`);
    assert.ok(c.solution.trim(), `${c.id}: solution`);
    if (c.fn) assert.ok(c.sig?.startsWith(c.fn + ' ::'), `${c.id}: sig should start with "${c.fn} ::"`);
  }
});

test('workshop examples and the not-supported list are present', () => {
  assert.ok(WORKSHOP_EXAMPLES.length >= 9);
  assert.ok(NOT_SUPPORTED.length >= 10);
});
