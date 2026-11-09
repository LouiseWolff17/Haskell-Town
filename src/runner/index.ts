import { BrowserRunner } from './browser.ts';
import { WorkerRunner } from './worker-runner.ts';
import type { WorkerLike } from './worker-runner.ts';
import type { CodeRunner } from './types.ts';

export type * from './types.ts';
export { BrowserRunner, WorkerRunner };

// The runner the game uses: the interpreter in a Web Worker, so slow or endless
// code can be stopped without freezing the page. Falls back to running on the
// page itself where workers aren't available. A GHC runner (docs/runner-api.md)
// would be chosen here too.
export function createRunner(): CodeRunner {
  if (typeof Worker === 'undefined') return new BrowserRunner();
  // A real Worker fits WorkerLike; the cast is only because its handlers take full MessageEvents.
  const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  return new WorkerRunner(makeWorker);
}
