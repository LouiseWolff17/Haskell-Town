// Docker health check: `node server/healthcheck.ts /path/to/ghc.sock` or `… http://host:port`.
import { get } from 'node:http';

const target = process.argv[2] ?? 'http://127.0.0.1:8080';
const opts = target.startsWith('/') ? { socketPath: target, path: '/health' } : new URL('/health', target);
get(opts, res => process.exit(res.statusCode === 200 ? 0 : 1))
  .on('error', () => process.exit(1))
  .setTimeout(4000, () => process.exit(1));
