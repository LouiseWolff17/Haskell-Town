// GhcRunner: runs the player's code with real GHC, on the sandboxed GHC service in server/
// (see docs/runner-api.md for the HTTP API).
//
// Results come back exactly as the service sends them. Calls can run side by side;
// cancel() stops all of them (the service stops the job when the request is dropped).
// If the service can't be reached, is busy or doesn't know a challenge, the call goes to
// the `fallback` runner when there is one (the in-browser interpreter), and otherwise
// comes back as an `internal` compile error that says what went wrong.

import type { Checkable } from '../content/types.ts';
import type { CheckResult, CodeRunner, CompileResult, EvalResult, RunMainResult, Stopped } from './types.ts';

export interface GhcRunnerOptions {
  /** Where the service is, e.g. http://localhost:8080 */
  url: string;
  /** Used when the service can't take a call. */
  fallback?: CodeRunner;
  /** Give up on a call after this long. The service has its own, shorter limits. */
  timeoutMs?: number;
  /** For tests. */
  fetch?: typeof fetch;
}

type AnyResult = CheckResult | CompileResult | RunMainResult | EvalResult;
interface Call { controller: AbortController; started: number; why?: Stopped['reason'] }

export const DEFAULT_GHC_TIMEOUT_MS = 90_000;

export class GhcRunner implements CodeRunner {
  readonly name = 'ghc';
  private readonly url: string;
  private readonly fallback?: CodeRunner;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;
  private readonly calls = new Set<Call>();

  constructor(options: GhcRunnerOptions) {
    this.url = options.url.replace(/\/+$/, '');
    this.fallback = options.fallback;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GHC_TIMEOUT_MS;
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  check(challenge: Checkable, source: string): Promise<CheckResult> {
    // The service has its own copy of every challenge and errand, so it only needs the id.
    const id = (challenge as { id?: unknown }).id;
    const local = (f: CodeRunner) => f.check(challenge, source);
    if (typeof id !== 'string') return this.unavailable("This challenge has no id, so the GHC server can't check it.", local);
    return this.post('/check', { challengeId: id, source }, local);
  }

  compile(source: string): Promise<CompileResult> {
    return this.post('/compile', { source }, f => f.compile(source));
  }

  runMain(source: string, input: string): Promise<RunMainResult> {
    return this.post('/run', { source, input }, f => f.runMain(source, input));
  }

  evaluate(source: string, expr: string, input: string): Promise<EvalResult> {
    return this.post('/evaluate', { source, expr, input }, f => f.evaluate(source, expr, input));
  }

  /** Stop every call that is running now. They resolve with a `stopped` result. */
  cancel() {
    for (const call of this.calls) {
      call.why = 'cancelled';
      call.controller.abort();
    }
    this.fallback?.cancel?.();
  }

  private async post<R extends AnyResult>(path: string, body: unknown, local: (f: CodeRunner) => Promise<R>): Promise<R> {
    const call: Call = { controller: new AbortController(), started: Date.now() };
    const timer = setTimeout(() => { call.why = 'timeout'; call.controller.abort(); }, this.timeoutMs);
    this.calls.add(call);
    try {
      const res = await this.fetch(this.url + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: call.controller.signal,
      });
      if (res.ok) return (await res.json()) as R;
      const detail = await res.json().then(j => (j as { error?: unknown })?.error, () => undefined);
      // busy, overloaded or doesn't know this challenge: the browser can still answer
      if (res.status === 404 || res.status === 429 || res.status >= 500) {
        return await this.unavailable(`The GHC server couldn't take this (${typeof detail === 'string' ? detail : `HTTP ${res.status}`}).`, local);
      }
      return problem(`The GHC server didn't accept this: ${typeof detail === 'string' ? detail : `HTTP ${res.status}`}.`) as R;
    } catch (e) {
      if (call.why) return this.stopped(call) as R;
      return await this.unavailable(`Couldn't reach the GHC server at ${this.url}` + (e instanceof Error && e.message ? ` (${e.message}).` : '.'), local);
    } finally {
      clearTimeout(timer);
      this.calls.delete(call);
    }
  }

  private unavailable<R extends AnyResult>(why: string, local: (f: CodeRunner) => Promise<R>): Promise<R> {
    return this.fallback ? local(this.fallback) : Promise.resolve(problem(why) as R);
  }

  private stopped(call: Call): Stopped {
    const seconds = call.why === 'timeout' ? this.timeoutMs / 1000 : Math.round((Date.now() - call.started) / 100) / 10;
    return { status: 'stopped', reason: call.why!, seconds };
  }
}

/** Every result type has a compile-error case, which the game shows as a note. */
function problem(message: string): AnyResult {
  return { status: 'compile-error', error: { kind: 'internal', message, line: null } };
}
