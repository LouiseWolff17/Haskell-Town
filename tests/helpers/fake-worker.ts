// Stand-ins for a Web Worker, for testing WorkerRunner in Node.
import { checkChallenge, compileProgram, evaluate, runMain } from '../../src/runner/browser.ts';
import type { WorkerLike, WorkerRequest, WorkerResponse } from '../../src/runner/worker-runner.ts';

/** Behaves like src/runner/worker.ts: answers asynchronously, with structured-cloned messages. */
export class InProcessWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  terminated = false;
  postMessage(message: WorkerRequest) {
    const { id, request } = structuredClone(message);
    setTimeout(() => {
      if (this.terminated) return;
      let data: WorkerResponse;
      try {
        const result =
          request.method === 'check' ? checkChallenge(request.challenge, request.source)
          : request.method === 'compile' ? compileProgram(request.source)
          : request.method === 'runMain' ? runMain(request.source, request.input)
          : evaluate(request.source, request.expr, request.input);
        data = { id, result: structuredClone(result) };
      } catch (e) {
        data = { id, error: String(e) };
      }
      this.onmessage?.({ data });
    }, 0);
  }
  terminate() { this.terminated = true; }
}

/** Never answers — like a worker stuck in an endless loop. */
export class StuckWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  terminated = false;
  received: WorkerRequest[] = [];
  postMessage(message: WorkerRequest) { this.received.push(message); }
  terminate() { this.terminated = true; }
}
