// The public side of the GHC service: takes HTTP requests and passes them to the service
// (server/main.ts) over a Unix socket, so the container that runs the player's code needs
// no network at all. It adds CORS for the game's page, a request size limit and a simple
// per-address rate limit.
//
//   PORT=8080 UPSTREAM_SOCKET=/run/haskell-town/ghc.sock ALLOWED_ORIGINS=https://you.github.io node server/gateway.ts

import { createServer, request } from 'node:http';

const env = process.env;
const socketPath = env.UPSTREAM_SOCKET ?? '/run/haskell-town/ghc.sock';
const origins = (env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);
const perMinute = Number(env.RATE_PER_MINUTE ?? 120);
const MAX_BODY = 256 * 1024;
const ROUTES: Record<string, string> = { '/check': 'POST', '/compile': 'POST', '/run': 'POST', '/evaluate': 'POST', '/health': 'GET' };

// A token bucket per client address.
const buckets = new Map<string, { tokens: number; at: number }>();
function allow(addr: string): boolean {
  const now = Date.now();
  const b = buckets.get(addr) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  buckets.set(addr, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
setInterval(() => { const old = Date.now() - 120_000; for (const [k, b] of buckets) if (b.at < old) buckets.delete(k); }, 60_000).unref();

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  const cors: Record<string, string> = { vary: 'Origin' };
  if (origin && (origins.includes('*') || origins.includes(origin))) {
    cors['access-control-allow-origin'] = origins.includes('*') ? '*' : origin;
    cors['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    cors['access-control-allow-headers'] = 'content-type';
    cors['access-control-max-age'] = '600';
  }
  const fail = (status: number, error: string) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(status, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error }));
  };
  const path = (req.url ?? '/').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (ROUTES[path] !== req.method) return fail(404, 'not found');
  if (path !== '/health' && !allow(req.socket.remoteAddress ?? '?')) return fail(429, 'Too many requests. Wait a moment and try again.');
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return fail(413, 'request too large');

  const up = request({ socketPath, path, method: req.method, headers: { 'content-type': 'application/json' } }, upRes => {
    res.writeHead(upRes.statusCode ?? 502, { ...cors, 'content-type': upRes.headers['content-type'] ?? 'application/json', 'cache-control': 'no-store' });
    upRes.pipe(res);
  });
  up.on('error', () => fail(502, "The GHC service isn't answering."));
  // If the player presses Stop (the browser drops the request), stop the job too.
  res.on('close', () => { if (!res.writableEnded) up.destroy(); });
  let size = 0;
  req.on('data', (b: Buffer) => {
    size += b.length;
    if (size > MAX_BODY) { up.destroy(); fail(413, 'request too large'); req.destroy(); }
  });
  req.pipe(up);
});
server.requestTimeout = 0;
const port = Number(env.PORT ?? 8080);
server.listen(port, env.HOST ?? '0.0.0.0', () => console.log(`gateway on :${port} → ${socketPath}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
