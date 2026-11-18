// Checks that the game's content fits together: ids, unlock order, residents, hints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, RESIDENTS, WORKSHOP_EXAMPLES, NOT_SUPPORTED, ERRANDS, REVIEW_TOPICS, KITCHEN, STORE, HALL } from '../src/content/index.ts';
import { BrowserRunner } from '../src/runner/browser.ts';

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

test('errand ids are unique and do not clash with challenge ids', () => {
  const ids = ERRANDS.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(!CHALLENGES.some(c => c.id === id), `errand ${id} shares an id with a challenge`);
});

test('every review topic has at least two errands, and its cue cards exist', () => {
  for (const t of REVIEW_TOPICS) {
    assert.ok(RESIDENTS[t.resident], `${t.id}: unknown resident ${t.resident}`);
    assert.ok(ERRANDS.filter(e => e.topic === t.id).length >= 2, `${t.id}: needs at least two errands so reviews can vary`);
    for (const c of t.from) assert.ok(CHALLENGES.some(x => x.id === c), `${t.id}: unknown challenge ${c}`);
  }
});

test('every errand belongs to a topic, has a resident, examples, tests and a solution', () => {
  for (const e of ERRANDS) {
    assert.ok(REVIEW_TOPICS.some(t => t.id === e.topic), `${e.id}: unknown topic ${e.topic}`);
    assert.ok(RESIDENTS[e.resident], `${e.id}: unknown resident ${e.resident}`);
    assert.ok(e.examples?.length || e.ioExamples?.length, `${e.id}: examples`);
    assert.ok(e.tests.length > 0 && e.solution.trim() && e.explanation.trim(), `${e.id}: tests, solution, explanation`);
    if (e.fn) assert.ok(e.sig?.startsWith(e.fn + ' ::'), `${e.id}: sig should start with "${e.fn} ::"`);
    if (e.mix) assert.ok(e.mix !== e.topic && REVIEW_TOPICS.some(t => t.id === e.mix), `${e.id}: mix should be another topic`);
  }
});

test('every topic has at least three plain errands and one that mixes it with another topic', () => {
  for (const t of REVIEW_TOPICS) {
    const mine = ERRANDS.filter(e => e.topic === t.id);
    assert.ok(mine.filter(e => !e.mix).length >= 3, `${t.id}: needs three plain errands`);
    assert.ok(mine.some(e => e.mix), `${t.id}: needs a mixed errand`);
  }
});

test('every errand\'s model answer passes its own tests, and its starter does not', async () => {
  const r = new BrowserRunner();
  for (const e of ERRANDS) {
    const ok = await r.check(e, e.solution);
    assert.ok(ok.status === 'tested' && ok.passed && !ok.ruleBreak, `${e.id}: solution should pass, got ${JSON.stringify(ok).slice(0, 400)}`);
    const starter = await r.check(e, e.starter);
    assert.ok(!(starter.status === 'tested' && starter.passed), `${e.id}: the starter alone should not pass`);
  }
});

test('every gift is a Satchel item that points somewhere real', async () => {
  const { FRIENDSHIP, ITEMS, EXPANSIONS } = await import('../src/content/index.ts');
  assert.deepEqual(ITEMS.map(i => i.resident).sort(), FRIENDSHIP.map(f => f.resident).sort());
  assert.equal(new Set(ITEMS.map(i => i.id)).size, ITEMS.length, 'item names are unique');
  const plots = new Set(CHALLENGES.map(c => c.plot || c.id));
  for (const i of ITEMS) {
    assert.match(i.id, /^[a-z][A-Za-z]*$/, `${i.id} reads as a Haskell name`);
    assert.ok(i.notYet && i.wrong, `${i.id} has its gentle lines`);
    if (i.givenTo) assert.ok(i.memory && !i.target, `${i.id} is given away, so it has a memory for the Journal and no place on the map`);
    const t = i.target; if (!t) continue;
    assert.ok(i.used, `${i.id} says what happens when it's used`);
    assert.ok(i.place && i.visit, `${i.id} opens a place you can visit again`);
    assert.match(t.name, /^[a-z][A-Za-z]*$/, `${t.name} reads as a Haskell name`);
    assert.ok(!!t.plot !== !!t.land, `${i.id} targets a plot or a piece of land`);
    if (t.plot) assert.ok(plots.has(t.plot), `${i.id}: no plot ${t.plot}`);
    if (t.land) assert.ok(EXPANSIONS.some(x => x.id === t.land), `${i.id}: no land ${t.land}`);
    if (t.friend) assert.ok(RESIDENTS[t.friend], `${i.id}: no resident ${t.friend}`);
  }
});

test('the town interiors\' Haskell runs: the kitchen puzzle, the till and the hall\'s greeting', async () => {
  const r = new BrowserRunner();
  // Hazel's recipe passes, the starter still has its blank, and 3 ^ n is sent back for recursion
  const baked = await r.check(KITCHEN.puzzle, 'layers :: Int -> Int\nlayers 0 = 1\nlayers n = 3 * layers (n - 1)\n');
  assert.ok(baked.status === 'tested' && baked.passed);
  const starter = await r.check(KITCHEN.puzzle, KITCHEN.starter);
  assert.ok(starter.status === 'tested' && !starter.passed);
  const power = await r.check(KITCHEN.puzzle, 'layers :: Int -> Int\nlayers n = 3 ^ n\n');
  assert.ok(power.status === 'tested' && power.ruleBreak?.rule === 'recursion');
  // the toy counts folds the same way the puzzle does
  for (const [expr, want] of KITCHEN.puzzle.tests) assert.equal(String(3 ** Number(expr.split(' ')[1])), want);
  // every suggested question for the till works, and the shelf matches the source
  for (const expr of STORE.tries) assert.equal((await r.evaluate(STORE.source, expr, '')).status, 'evaluated', expr);
  const prices = await r.evaluate(STORE.source, 'prices', '');
  assert.ok(prices.status === 'evaluated' && prices.value === `[${STORE.shelf.map(s => s.price).join(',')}]`);
  const names = await r.evaluate(STORE.source, 'shelf', '');
  assert.ok(names.status === 'evaluated' && names.value === JSON.stringify(STORE.shelf.map(s => s.name)));
  const hall = await r.runMain(HALL.program, 'Wren');
  assert.ok(hall.status === 'ran' && hall.output.out === 'Who goes there?\nWelcome to City Hall, Wren!\n');
});
