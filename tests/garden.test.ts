// Your garden plot: what grows, how it grows over days, and that nothing ever wilts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDS, GARDEN_BEDS, PLANTS } from '../src/content/index.ts';
import { DAYS_TO_READY, bedsOf, daysLeft, plantFor, stageOf } from '../src/game/garden-rules.ts';

test('every plant has a unique id and becomes a find Bram buys', () => {
  assert.equal(new Set(PLANTS.map(p => p.id)).size, PLANTS.length);
  for (const p of PLANTS) assert.ok(FINDS.some(f => f.id === p.find), `${p.id} → ${p.find}`);
  assert.ok(PLANTS.some(p => p.find === 'flower') && PLANTS.some(p => p.find === 'vegetable'), 'flowers and vegetables both grow');
  assert.ok(GARDEN_BEDS >= 1);
});

test('a seed grows one stage a day, then waits: nothing wilts', () => {
  const bed = { plant: 'daisy', day: 100 };
  assert.deepEqual([100, 101, 102, 103].map(d => stageOf(bed, d)), ['seed', 'sprout', 'bud', 'ready']);
  assert.equal(DAYS_TO_READY, 3);
  for (const later of [104, 130, 100 + 3650]) assert.equal(stageOf(bed, later), 'ready');
  assert.deepEqual([100, 101, 102, 103, 200].map(d => daysLeft(bed, d)), [3, 2, 1, 0, 0]);
});

test('an empty bed is empty, and a clock that went backwards keeps a seed a seed', () => {
  assert.equal(stageOf(null, 5), 'empty');
  assert.equal(stageOf(undefined, 5), 'empty');
  assert.equal(stageOf({ plant: 'rose', day: 10 }, 7), 'seed');
  assert.equal(daysLeft({ plant: 'rose', day: 10 }, 7), 3);
});

test('the plot always has its beds, keeping what was planted', () => {
  assert.deepEqual(bedsOf(undefined, 4), [null, null, null, null]);
  const b = { plant: 'carrot', day: 3 };
  assert.deepEqual(bedsOf([b], 4), [b, null, null, null]);
  assert.deepEqual(bedsOf([null, b, null, null, b], 4), [null, b, null, null]);
});

test('a mixed packet can grow into anything, and always into something', () => {
  const seen = new Set<string>();
  for (let i = 0; i < PLANTS.length; i++) seen.add(plantFor(PLANTS, (i + 0.5) / PLANTS.length).id);
  assert.equal(seen.size, PLANTS.length);
  assert.equal(plantFor(PLANTS, 0), PLANTS[0]);
  assert.equal(plantFor(PLANTS, 0.999999), PLANTS.at(-1));
  assert.equal(plantFor(PLANTS, 1), PLANTS.at(-1));
});
