// WorkerRunner: the in-browser interpreter, run in a Web Worker so the page never freezes.
//
// Calls go to the worker one at a time. If one runs longer than `timeoutMs`, or
// cancel() is called, the worker is terminated (the only way to stop JavaScript
// mid-loop), the call resolves with a `stopped` result, and a fresh worker starts.

import type { Checkable } from '../content/types.ts';
import type {
  CheckResult, CodeRunner, CompileResult, EvalResult, RunMainResult, Stopped,
} from './types.ts';

export type WorkerRequest = {
  id: number;
  request:
    | { method: 'check'; challenge: Checkable; source: string }
    | { method: 'compile'; source: string }
    | { method: 'runMain'; source: string; input: string }
    | { method: 'evaluate'; source: string; expr: string; input: string };
};
export type WorkerResponse = { id: number; result: unknown } | { id: number; error: string };

/** The parts of a Web Worker this runner uses (so tests can pass a fake). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

type AnyResult = CheckResult | CompileResult | RunMainResult | EvalResult;
interface Running {
  id: number;
  started: number;
  finish(result: AnyResult): void;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export class WorkerRunner implements CodeRunner {
  readonly name = 'browser-worker';
  private worker: WorkerLike | null = null;
  private running: Running | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 0;

  private readonly makeWorker: () => WorkerLike;
  private readonly timeoutMs: number;

  constructor(makeWorker: () => WorkerLike, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.worker = this.spawn(); // start loading the interpreter right away
  }

  check(challenge: Checkable, source: string) {
    return this.call<CheckResult>({ method: 'check', challenge, source });
  }
  compile(source: string) {
    return this.call<CompileResult>({ method: 'compile', source });
  }
  runMain(source: string, input: string) {
    return this.call<RunMainResult>({ method: 'runMain', source, input });
  }
  evaluate(source: string, expr: string, input: string) {
    return this.call<EvalResult>({ method: 'evaluate', source, expr, input });
  }

  /** Stop the call that is running now. Calls waiting behind it still run. */
  cancel() {
    const r = this.running;
    if (!r) return;
    this.restart();
    r.finish(this.stopped('cancelled', r.started));
  }

  /** True while a call is running or waiting. */
  get busy() {
    return this.running !== null;
  }

  private call<R extends AnyResult>(request: WorkerRequest['request']): Promise<R> {
    const run = () =>
      new Promise<R>(resolve => {
        const id = ++this.nextId;
        const started = Date.now();
        const timer = setTimeout(() => {
          this.restart();
          finish(this.stopped('timeout', started));
        }, this.timeoutMs);
        const finish = (result: AnyResult) => {
          if (this.running?.id !== id) return; // already finished (e.g. timed out, then a late reply)
          clearTimeout(timer);
          this.running = null;
          resolve(result as R);
        };
        this.running = { id, started, finish };
        this.worker ??= this.spawn();
        this.worker.postMessage({ id, request });
      });
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private spawn(): WorkerLike {
    const w = this.makeWorker();
    w.onmessage = ({ data }) => {
      const r = this.running;
      if (!r || data.id !== r.id) return;
      r.finish('error' in data ? this.crashed(data.error) : (data.result as AnyResult));
    };
    w.onerror = e => {
      const r = this.running;
      this.restart();
      if (r) r.finish(this.crashed(e.message || 'the worker stopped unexpectedly'));
    };
    return w;
  }

  private restart() {
    this.worker?.terminate();
    this.worker = this.spawn();
  }

  private stopped(reason: Stopped['reason'], started: number): Stopped {
    const seconds = reason === 'timeout' ? this.timeoutMs / 1000 : Math.round((Date.now() - started) / 100) / 10;
    return { status: 'stopped', reason, seconds };
  }

  private crashed(message: string): AnyResult {
    return {
      status: 'compile-error',
      error: { kind: 'internal', message: 'Something went wrong inside the interpreter: ' + message, line: null },
    };
  }
}
