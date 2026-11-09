// WorkerRunner: stopping slow code, recovering, and keeping calls in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerRunner } from '../src/runner/worker-runner.ts';
import type { WorkerLike } from '../src/runner/worker-runner.ts';
import { CHALLENGES } from '../src/content/index.ts';
import { InProcessWorker, StuckWorker } from './helpers/fake-worker.ts';

const house = CHALLENGES[0];

/** A factory that hands out the given workers in order (then in-process ones), and remembers them. */
function factory(...first: WorkerLike[]) {
  const made: WorkerLike[] = [];
  const make = () => { const w = first.shift() ?? new InProcessWorker(); made.push(w); return w; };
  return { make, made };
}

test('results come back from the worker unchanged', async () => {
  const runner = new WorkerRunner(() => new InProcessWorker());
  const r = await runner.check(house, house.solution);
  assert.ok(r.status === 'tested' && r.passed);
});

test('code that runs too long is stopped, and the next call gets a fresh worker', async () => {
  const stuck = new StuckWorker();
  const f = factory(stuck);
  const runner = new WorkerRunner(f.make, 50);
  const r = await runner.check(house, house.solution);
  assert.deepEqual(r, { status: 'stopped', reason: 'timeout', seconds: 0.05 });
  assert.ok(stuck.terminated, 'the stuck worker is terminated');
  const next = await runner.check(house, house.solution);
  assert.ok(next.status === 'tested' && next.passed, 'a new worker answers the next call');
  assert.equal(f.made.length, 2);
});

test('cancel() stops the running call right away', async () => {
  const stuck = new StuckWorker();
  const runner = new WorkerRunner(factory(stuck).make, 60_000);
  const pending = runner.evaluate('x :: Int\nx = 1\n', 'x', '');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(runner.busy, true);
  runner.cancel();
  const r = await pending;
  assert.equal(r.status, 'stopped');
  assert.ok(r.status === 'stopped' && r.reason === 'cancelled');
  assert.ok(stuck.terminated);
  assert.equal(runner.busy, false);
});

test('cancel() with nothing running does nothing', () => {
  const f = factory();
  const runner = new WorkerRunner(f.make);
  runner.cancel();
  assert.equal(f.made.length, 1);
});

test('calls run one at a time, in order, and a timeout only stops its own call', async () => {
  const stuck = new StuckWorker();
  const runner = new WorkerRunner(factory(stuck).make, 50);
  const a = runner.evaluate('x :: Int\nx = 1\n', 'x', '');
  const b = runner.evaluate('x :: Int\nx = 2\n', 'x', '');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(stuck.received.length, 1, 'the second call waits for the first');
  assert.equal((await a).status, 'stopped');
  const rb = await b;
  assert.ok(rb.status === 'evaluated' && rb.value === '2');
});

test('the timeout counts from when a call starts, not when it was queued', async () => {
  const runner = new WorkerRunner(() => new InProcessWorker(), 300);
  const slow = 'fib :: Int -> Int\nfib 0 = 0\nfib 1 = 1\nfib n = fib (n - 1) + fib (n - 2)\n';
  const results = await Promise.all([1, 2, 3].map(() => runner.evaluate(slow, 'fib 18', '')));
  assert.ok(results.every(r => r.status === 'evaluated' && r.value === '2584'), JSON.stringify(results.map(r => r.status)));
});

test('a crashed worker gives a friendly internal error and is replaced', async () => {
  const crashing: WorkerLike = {
    onmessage: null, onerror: null, terminate() {},
    postMessage() { setTimeout(() => this.onerror?.({ message: 'boom' }), 0); },
  };
  const f = factory(crashing);
  const runner = new WorkerRunner(f.make);
  const r = await runner.check(house, house.solution);
  assert.ok(r.status === 'compile-error' && r.error.kind === 'internal' && r.error.message.includes('boom'));
  const next = await runner.check(house, house.solution);
  assert.ok(next.status === 'tested' && next.passed);
});

test('a late reply from a stopped worker is ignored', async () => {
  let late: WorkerLike | null = null;
  const slowWorker: WorkerLike = {
    onmessage: null, onerror: null, terminate() {},
    postMessage(m) { late = this; setTimeout(() => this.onmessage?.({ data: { id: m.id, result: { status: 'compile-error', error: { kind: 'parse', message: 'late', line: 1 } } } }), 80); },
  };
  const runner = new WorkerRunner(factory(slowWorker).make, 20);
  const r = await runner.compile('x = 1\n');
  assert.equal(r.status, 'stopped');
  const next = await runner.compile('x :: Int\nx = 1\n');
  assert.equal(next.status, 'ok');
  await new Promise(res => setTimeout(res, 100));
  assert.ok(late);
});
