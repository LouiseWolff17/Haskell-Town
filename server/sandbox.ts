// Running GHC and the player's compiled program with limits.
//
// Inside the container (server/compose.yaml) the service runs as root with only the
// SETUID, SETGID and KILL capabilities, and every process it starts here runs as the
// unprivileged sandbox user, in its own process group, with rlimits from `prlimit`
// (CPU seconds, file size, open files), a wall-clock limit, a cap on how much output is
// kept, and a nearly empty environment. Outside a container (local development) the same
// code runs everything as the current user.

import { spawn, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SandboxConfig {
  /** Run processes as this user (needs CAP_SETUID/CAP_SETGID). */
  uid?: number;
  gid?: number;
  /** Path of util-linux `prlimit`, or null to skip rlimits. */
  prlimit: string | null;
  /** Where job directories go. */
  tmpDir: string;
}

export interface RunOptions {
  cwd: string;
  stdin?: string;
  wallMs: number;
  cpuSeconds: number;
  /** Bytes of stdout (and of stderr) to keep; more than that stops the process. */
  maxOutput?: number;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  tooMuchOutput: boolean;
  cancelled: boolean;
  ms: number;
}

const MAX_FILE = 128 * 1024 * 1024; // the inspector and GHC's object files, the linked program

export function findPrlimit(): string | null {
  const r = spawnSync('prlimit', ['--version'], { stdio: 'ignore' });
  return r.status === 0 ? 'prlimit' : null;
}

export function run(sb: SandboxConfig, cmd: string, args: string[], o: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const limits = sb.prlimit
    ? [sb.prlimit, `--cpu=${o.cpuSeconds}`, `--fsize=${MAX_FILE}`, '--nofile=256', '--core=0', '--']
    : [];
  const argv = [...limits, cmd, ...args];
  const maxOutput = o.maxOutput ?? 1024 * 1024;
  return new Promise(resolve => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: o.cwd,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: o.cwd, TMPDIR: o.cwd, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      uid: sb.uid,
      gid: sb.gid,
      detached: true, // its own process group, so everything it starts can be stopped together
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [], err: Buffer[] = [];
    let outBytes = 0, errBytes = 0;
    let timedOut = false, tooMuchOutput = false, cancelled = false, done = false;
    const kill = () => {
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, o.wallMs);
    const onAbort = () => { cancelled = true; kill(); };
    o.signal?.addEventListener('abort', onAbort, { once: true });
    if (o.signal?.aborted) onAbort();
    const collect = (chunks: Buffer[], which: 'out' | 'err') => (b: Buffer) => {
      const n = which === 'out' ? (outBytes += b.length) : (errBytes += b.length);
      if (n <= maxOutput) chunks.push(b);
      else if (!tooMuchOutput) { tooMuchOutput = true; kill(); }
    };
    child.stdout.on('data', collect(out, 'out'));
    child.stderr.on('data', collect(err, 'err'));
    child.stdin.on('error', () => { /* the program didn't read all its input */ });
    child.stdin.end(o.stdin ?? '');
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      kill(); // anything it left behind in its process group
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut, tooMuchOutput, cancelled,
        ms: Date.now() - started,
      });
    };
    child.on('error', e => { err.push(Buffer.from(String(e))); finish(null); });
    child.on('close', code => finish(code));
  });
}

/** A fresh directory for one request. The sandbox user can write in it; nobody else can see it. */
export class JobDir {
  readonly path: string;
  private readonly sb: SandboxConfig;
  private constructor(path: string, sb: SandboxConfig) { this.path = path; this.sb = sb; }

  static async create(sb: SandboxConfig): Promise<JobDir> {
    const parent = join(sb.tmpDir, 'haskell-town-jobs');
    // The parent can't be listed by the sandbox user, so a job can't find the others.
    await mkdir(parent, { recursive: true, mode: 0o711 });
    const path = await mkdtemp(join(parent, 'job-'));
    // Owned by the service, writable by the sandbox user, sticky: the player's code can add
    // files but can't change or replace the ones the service wrote.
    if (sb.uid !== undefined) await chmod(path, 0o1777);
    return new JobDir(path, sb);
  }

  file(name: string) { return join(this.path, name); }

  async write(name: string, text: string) {
    await rm(this.file(name), { force: true });
    await writeFile(this.file(name), text, { flag: 'wx' }); // never follow a link left in the directory
  }

  /** A copy of a file the sandbox user made, owned by the service, that the sandbox user can run but not change. */
  async seal(from: string, to: string) {
    await rm(this.file(to), { force: true });
    await copyFile(this.file(from), this.file(to));
    await chmod(this.file(to), 0o555);
  }

  async remove() {
    // The sandbox user removes what it made, then we remove the (empty) directory.
    if (this.sb.uid !== undefined) await run(this.sb, 'rm', ['-rf', '--', this.path], { cwd: this.sb.tmpDir, wallMs: 30_000, cpuSeconds: 30 });
    await rm(this.path, { recursive: true, force: true }).catch(() => undefined);
  }
}
