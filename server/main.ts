// The GHC service: the runner API over HTTP (docs/runner-api.md).
//
//   POST /check     { challengeId, source }   → CheckResult
//   POST /compile   { source }                → CompileResult
//   POST /run       { source, input }         → RunMainResult
//   POST /evaluate  { source, expr, input }   → EvalResult
//   GET  /health                              → { ok, ghc, running, waiting }
//
// The challenges come from src/content, so a client can't change the tests. It listens
// on SOCKET (a Unix socket, behind server/gateway.ts) or on PORT (local development).
// Run it with:  node server/main.ts   (see server/compose.yaml for the sandboxed setup)

import { spawnSync } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { availableParallelism, tmpdir } from 'node:os';
import { CHALLENGES, ERRANDS } from '../src/content/index.ts';
import type { Checkable } from '../src/content/types.ts';
import { GhcService } from './ghc.ts';
import { findPrlimit } from './sandbox.ts';
import { Slots, readJson } from './http.ts';

const env = process.env;
const ghc = env.GHC ?? 'ghc';
const ask = (args: string[]) => {
  const r = spawnSync(ghc, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`\`${ghc} ${args.join(' ')}\` failed: ${r.stderr || r.error}`);
  return r.stdout.trim();
};
const version = ask(['--numeric-version']);
const uid = env.SANDBOX_UID ? Number(env.SANDBOX_UID) : undefined;

const service = new GhcService({
  ghc,
  inspector: env.HTOWN_INSPECT ?? '/opt/haskell-town/bin/htown-inspect',
  libdir: ask(['--print-libdir']),
  sandbox: {
    uid,
    gid: env.SANDBOX_GID ? Number(env.SANDBOX_GID) : uid,
    prlimit: env.PRLIMIT === '0' ? null : findPrlimit(),
    tmpDir: env.TMPDIR ?? tmpdir(),
  },
  requestSeconds: Number(env.REQUEST_SECONDS ?? 60),
  testSeconds: Number(env.TEST_SECONDS ?? 2),
  runSeconds: Number(env.RUN_SECONDS ?? 10),
});
const slots = new Slots(Number(env.MAX_JOBS ?? availableParallelism()), Number(env.MAX_WAITING ?? 32));
const CHECKABLES = new Map<string, Checkable>([...CHALLENGES, ...ERRANDS].map(c => [c.id, c]));

const str = (v: unknown, name: string, optional = false): string => {
  if (typeof v === 'string') return v;
  if (optional && v === undefined) return '';
  throw new BadRequest(`\`${name}\` must be a string`);
};
class BadRequest extends Error {}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const started = Date.now();
  const send = (status: number, body: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const path = (req.url ?? '/').split('?')[0];
  try {
    if (req.method === 'GET' && path === '/health') return send(200, { ok: true, ghc: version, running: slots.running, waiting: slots.waiting });
    if (req.method !== 'POST' || !['/check', '/compile', '/run', '/evaluate'].includes(path)) return send(404, { error: 'not found' });
    const body = await readJson(req, 256 * 1024);
    // Stop the job if the client goes away (the Stop button, or a timeout on its side).
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const source = str(body.source, 'source');
    let call: () => Promise<unknown>;
    if (path === '/check') {
      const c = CHECKABLES.get(str(body.challengeId, 'challengeId'));
      if (!c) return send(404, { error: `no challenge or errand called ${JSON.stringify(body.challengeId)}` });
      call = () => service.check(c, source, abort.signal);
    } else if (path === '/compile') call = () => service.compile(source, abort.signal);
    else if (path === '/run') { const input = str(body.input, 'input', true); call = () => service.runMain(source, input, abort.signal); }
    else { const expr = str(body.expr, 'expr'), input = str(body.input, 'input', true); call = () => service.evaluate(source, expr, input, abort.signal); }

    const release = await slots.acquire(abort.signal);
    if (!release) return send(503, { error: 'The GHC server is busy. Try again in a moment.' });
    try {
      send(200, await call());
    } finally {
      release();
    }
  } catch (e) {
    if (e instanceof BadRequest || (e instanceof Error && e.name === 'BadJson')) return send(400, { error: e.message });
    console.error(e);
    send(500, { error: 'Something went wrong in the GHC server.' });
  } finally {
    console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
  }
}

const server = createServer((req, res) => void handle(req, res));
server.requestTimeout = 0; // a check can take a while; jobs have their own time limits
if (env.SOCKET) {
  rmSync(env.SOCKET, { force: true });
  server.listen(env.SOCKET, () => {
    chmodSync(env.SOCKET!, 0o666); // the gateway runs as another user
    console.log(`GHC ${version} service on ${env.SOCKET}`);
  });
} else {
  const port = Number(env.PORT ?? 8080);
  server.listen(port, env.HOST ?? '127.0.0.1', () => console.log(`GHC ${version} service on http://${env.HOST ?? '127.0.0.1'}:${port}`));
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
