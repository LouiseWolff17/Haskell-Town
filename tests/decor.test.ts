// Decorations: the shelf of them, and the rules for where they can go (snapping to the grid, open ground only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECORATIONS, STORE } from '../src/content/index.ts';
import { GRID, cellFor, nearestFree, overlaps, snap, whyNot } from '../src/game/decor-rules.ts';
import { tenOff } from '../src/game/rewards.ts';

const BOUNDS = { x: 0, y: 0, w: 80, h: 80 };

test('decorations have unique ids, prices, and footprints of whole cells', () => {
  assert.equal(new Set(DECORATIONS.map(d => d.id)).size, DECORATIONS.length);
  for (const d of DECORATIONS) {
    assert.ok(d.price > 0 && Number.isInteger(d.price), d.id);
    assert.ok(Number.isInteger(d.w) && d.w >= 1 && Number.isInteger(d.h) && d.h >= 1, d.id);
    assert.ok(d.icon && d.name && d.note, d.id);
    assert.ok(!STORE.shelf.some(s => s.name === d.name), `${d.id} shouldn't share a name with the shelf`);
  }
  assert.ok(DECORATIONS.some(d => d.light), 'lamp posts light up at night');
  assert.deepEqual(DECORATIONS.map(d => tenOff(d.price)), [14, 11, 6, 8, 13, 9, 23, 5]);
});

test('positions snap to the grid, and a footprint is centred on the mouse', () => {
  assert.equal(GRID, 8);
  assert.deepEqual([snap(0), snap(3), snap(4), snap(11), snap(12), snap(-3)], [0, 0, 8, 8, 16, 0]);
  assert.deepEqual(cellFor(132, 204, 8, 8), [128, 200]);
  assert.deepEqual(cellFor(130, 204, 16, 16), [120, 200]);
  for (const [x, y] of [cellFor(17.3, 41.9, 24, 8), cellFor(0, 0, 16, 8)]) assert.ok(x % GRID === 0 && y % GRID === 0);
});

test('boxes that only touch along an edge do not overlap', () => {
  const a = { x: 0, y: 0, w: 8, h: 8 };
  assert.ok(overlaps(a, { x: 7, y: 7, w: 8, h: 8 }));
  assert.ok(!overlaps(a, { x: 8, y: 0, w: 8, h: 8 }));
  assert.ok(!overlaps(a, { x: 0, y: 8, w: 8, h: 8 }));
  assert.ok(overlaps(a, { x: 2, y: 2, w: 2, h: 2 }), 'inside counts');
});

test('a decoration goes on open ground on the grid, and says why not otherwise', () => {
  const road = { x: 0, y: 40, w: 80, h: 8, why: 'road' }, tree = { x: 32, y: 8, w: 16, h: 16, why: 'tree' };
  assert.equal(whyNot({ x: 8, y: 8, w: 8, h: 8 }, [road, tree], BOUNDS), null);
  assert.equal(whyNot({ x: 8, y: 32, w: 8, h: 8 }, [road, tree], BOUNDS), null, 'right up against the road is fine');
  assert.equal(whyNot({ x: 8, y: 40, w: 8, h: 8 }, [road, tree], BOUNDS), 'road');
  assert.equal(whyNot({ x: 24, y: 8, w: 16, h: 8 }, [road, tree], BOUNDS), 'tree', 'any part of the footprint counts');
  assert.equal(whyNot({ x: 4, y: 8, w: 8, h: 8 }, [], BOUNDS), 'It has to sit on the grid.');
  assert.equal(whyNot({ x: 80, y: 8, w: 8, h: 8 }, [], BOUNDS, 'off'), 'off');
  assert.equal(whyNot({ x: 72, y: 72, w: 16, h: 8 }, [], BOUNDS, 'off'), 'off', 'the whole footprint has to fit');
});

test('the keyboard starts a decoration on the nearest free spot', () => {
  const zones = [{ x: 0, y: 0, w: 80, h: 32, why: 'busy' }];
  assert.deepEqual(nearestFree(12, 12, 8, 8, zones, BOUNDS), [8, 32]);
  assert.deepEqual(nearestFree(44, 60, 8, 8, zones, BOUNDS), [40, 56], 'already free: right there');
  assert.equal(nearestFree(12, 12, 8, 8, [{ ...BOUNDS, why: 'full' }], BOUNDS), null);
});
