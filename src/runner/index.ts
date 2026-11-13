import { BrowserRunner } from './browser.ts';
import { GhcRunner } from './ghc-runner.ts';
import { WorkerRunner } from './worker-runner.ts';
import type { WorkerLike } from './worker-runner.ts';
import type { CodeRunner } from './types.ts';

export type * from './types.ts';
export { BrowserRunner, GhcRunner, WorkerRunner };

// The runner the game uses. With VITE_GHC_URL set at build time (the sandboxed GHC
// service in server/), that's real GHC, with the in-browser interpreter as the fallback
// when the service can't be reached. Otherwise it's the interpreter in a Web Worker, so
// slow or endless code can be stopped without freezing the page, or on the page itself
// where workers aren't available.
export function createRunner(): CodeRunner {
  const local = localRunner();
  const ghcUrl = import.meta.env?.VITE_GHC_URL;
  return ghcUrl ? new GhcRunner({ url: ghcUrl, fallback: local }) : local;
}

function localRunner(): CodeRunner {
  if (typeof Worker === 'undefined') return new BrowserRunner();
  // A real Worker fits WorkerLike; the cast is only because its handlers take full MessageEvents.
  const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  return new WorkerRunner(makeWorker);
}
