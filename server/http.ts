// Small HTTP helpers shared by the service (main.ts) and the gateway.

import type { IncomingMessage } from 'node:http';

class BadJson extends Error {
  constructor(message: string) { super(message); this.name = 'BadJson'; }
}

/** Read a JSON object body of at most `limit` bytes. */
export function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (b: Buffer) => {
      size += b.length;
      if (size > limit) { reject(new BadJson('request too large')); req.destroy(); return; }
      chunks.push(b);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v);
        else reject(new BadJson('expected a JSON object'));
      } catch {
        reject(new BadJson('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** At most `size` jobs at once; up to `maxWaiting` more wait their turn, the rest are turned away. */
export class Slots {
  running = 0;
  private queue: (() => void)[] = [];
  private readonly size: number;
  private readonly maxWaiting: number;

  constructor(size: number, maxWaiting: number) {
    this.size = Math.max(1, size);
    this.maxWaiting = maxWaiting;
  }

  get waiting() { return this.queue.length; }

  /** Resolves with a release function, or null if the queue is full or `signal` aborts first. */
  acquire(signal?: AbortSignal): Promise<(() => void) | null> {
    const release = () => {
      this.running--;
      this.queue.shift()?.();
    };
    if (this.running < this.size) { this.running++; return Promise.resolve(release); }
    if (this.queue.length >= this.maxWaiting) return Promise.resolve(null);
    return new Promise(resolve => {
      const go = () => { signal?.removeEventListener('abort', giveUp); this.running++; resolve(release); };
      const giveUp = () => { this.queue = this.queue.filter(f => f !== go); resolve(null); };
      this.queue.push(go);
      signal?.addEventListener('abort', giveUp, { once: true });
    });
  }
}
