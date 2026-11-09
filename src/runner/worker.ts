// Runs inside a Web Worker: receives requests from WorkerRunner and answers with
// the same plain results BrowserRunner gives. Being in a worker means a slow or
// endless program can be stopped (by terminating the worker) without freezing the page.
import { checkChallenge, compileProgram, evaluate, runMain } from './browser.ts';
import type { WorkerRequest, WorkerResponse } from './worker-runner.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = ({ data }) => {
  const { id, request } = data;
  try {
    const result =
      request.method === 'check' ? checkChallenge(request.challenge, request.source)
      : request.method === 'compile' ? compileProgram(request.source)
      : request.method === 'runMain' ? runMain(request.source, request.input)
      : evaluate(request.source, request.expr, request.input);
    scope.postMessage({ id, result });
  } catch (e) {
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
