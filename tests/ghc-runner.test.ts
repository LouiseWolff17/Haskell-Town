// GhcRunner without a server: what it sends, and what it does when the service is slow,
// stopped, unreachable or busy. (The contract test runs it against real GHC.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GhcRunner } from '../src/runner/ghc-runner.ts';
import { BrowserRunner } from '../src/runner/browser.ts';
import { CHALLENGES } from '../src/content/index.ts';

const house = CHALLENGES.find(c => c.id === 'house')!;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that records requests and answers with `reply`, or waits until aborted. */
function fakeFetch(reply?: (path: string, body: any) => Response | Promise<Response>) {
  const calls: { path: string; body: any }[] = [];
  const f = ((url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(String(init.body));
    calls.push({ path, body });
    if (reply) return Promise.resolve(reply(path, body));
    return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('check sends only the challenge id and the source, and returns what the service says', async () => {
  const result = { status: 'missing-function', fn: 'add' };
  const { f, calls } = fakeFetch(() => json(200, result));
  const r = await new GhcRunner({ url: 'http://ghc.test/', fetch: f }).check(house, 'x = 1');
  assert.deepEqual(r, result);
  assert.deepEqual(calls, [{ path: '/check', body: { challengeId: 'house', source: 'x = 1' } }]);
});

test('the Workshop calls map to /compile, /run and /evaluate', async () => {
  const { f, calls } = fakeFetch(() => json(200, { status: 'ok' }));
  const g = new GhcRunner({ url: 'http://ghc.test', fetch: f });
  await g.compile('a');
  await g.runMain('b', 'in');
  await g.evaluate('c', 'take 2 xs', 'in2');
  assert.deepEqual(calls, [
    { path: '/compile', body: { source: 'a' } },
    { path: '/run', body: { source: 'b', input: 'in' } },
    { path: '/evaluate', body: { source: 'c', expr: 'take 2 xs', input: 'in2' } },
  ]);
});

test('cancel() stops every running call', async () => {
  const { f } = fakeFetch();
  const g = new GhcRunner({ url: 'http://ghc.test', fetch: f });
  const a = g.check(house, 'x'), b = g.compile('y');
  g.cancel();
  for (const r of await Promise.all([a, b])) assert.equal(r.status === 'stopped' && r.reason, 'cancelled');
});

test('a call that takes too long is stopped with a timeout', async () => {
  const { f } = fakeFetch();
  const r = await new GhcRunner({ url: 'http://ghc.test', fetch: f, timeoutMs: 30 }).compile('x');
  assert.deepEqual(r, { status: 'stopped', reason: 'timeout', seconds: 0.03 });
});

test('without the service, the fallback runner answers', async () => {
  const down = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
  const r = await new GhcRunner({ url: 'http://ghc.test', fetch: down, fallback: new BrowserRunner() }).check(house, house.solution);
  assert.ok(r.status === 'tested' && r.passed);
});

test('without the service or a fallback, the player is told what happened', async () => {
  const down = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
  const r = await new GhcRunner({ url: 'http://ghc.test', fetch: down }).compile('x = 1');
  assert.equal(r.status, 'compile-error');
  if (r.status === 'compile-error') {
    assert.equal(r.error.kind, 'internal');
    assert.match(r.error.message, /Couldn't reach the GHC server/);
  }
});

test('a busy service or an unknown challenge goes to the fallback; a bad request does not', async () => {
  const { f: busy } = fakeFetch(() => json(503, { error: 'busy' }));
  const viaFallback = await new GhcRunner({ url: 'http://ghc.test', fetch: busy, fallback: new BrowserRunner() }).compile('x = 1');
  assert.equal(viaFallback.status, 'ok');
  const { f: bad } = fakeFetch(() => json(400, { error: '`source` must be a string' }));
  const refused = await new GhcRunner({ url: 'http://ghc.test', fetch: bad, fallback: new BrowserRunner() }).compile('x = 1');
  assert.ok(refused.status === 'compile-error' && /must be a string/.test(refused.error.message));
});
