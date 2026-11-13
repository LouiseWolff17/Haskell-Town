// The four runner methods (check, compile, runMain, evaluate) done with real GHC. They give
// the same results as BrowserRunner (src/runner/browser.ts) for the same code;
// tests/runner-contract.test.ts checks that.
//
// One request is one job, in a fresh directory:
//  1. The player's module is type-checked by htown-inspect (GHC API, -fno-code, -XSafe),
//     which describes what it defines, its types, which names it uses and whether anything
//     is recursive. If GHC says a name is ambiguous between the program and one of the
//     imports we added, that name is hidden from our imports and it is checked again.
//  2. For a check: the challenge's signature is checked the same way, as
//     `htownSig' :: <sig>; htownSig' = <fn>`, so type variables must stay polymorphic.
//  3. The tests become bindings at the end of a copy of the module, a small Main runs
//     them (HTown.Harness), and GHC builds that with -fdefer-type-errors, so a test that
//     doesn't type-check fails on its own instead of stopping the rest.
//  4. The program runs as the sandbox user: each expression test under its own time limit,
//     and `main` once per IO test with the test's input on stdin.

import { readFile } from 'node:fs/promises';
import type { Checkable, ChallengeTest, IOTest } from '../src/content/types.ts';
import type {
  CheckResult, CompileResult, Diagnostic, EvalResult, MissingPart, ProgramSummary, RuleBreak,
  RunMainResult, RunOutput, Stopped, TestRow,
} from '../src/runner/types.ts';
import { compileDiagnostic, explainRuntime, firstError, parseMessages, prettyShow, runtimeDiagnostic, ambiguities } from './diagnostics.ts';
import type { GhcMessage } from './diagnostics.ts';
import { JobDir, run } from './sandbox.ts';
import type { RunResult, SandboxConfig } from './sandbox.ts';
import { buildModule, prepare, sigType } from './source.ts';
import type { BuiltModule, Program } from './source.ts';

export interface GhcConfig {
  /** The ghc executable. */
  ghc: string;
  /** The htown-inspect executable (server/haskell/Inspect.hs). */
  inspector: string;
  /** `ghc --print-libdir` */
  libdir: string;
  sandbox: SandboxConfig;
  /** A whole request is stopped after this long. */
  requestSeconds: number;
  /** Each expression test may run this long. */
  testSeconds: number;
  /** The player's main, or a Workshop expression, may run this long. */
  runSeconds: number;
}

const PACKAGES = ['-hide-all-packages', '-package', 'base', '-package', 'containers', '-package', 'htown-support'];
const COMMON = ['-XNoImplicitPrelude', '-w', '-fno-diagnostics-show-caret', '-fdiagnostics-color=never', ...PACKAGES];
const INSPECT_FLAGS = ['-fno-code', '-XSafe', ...COMMON];
const GHC_RTS = ['+RTS', '-M1g', '-RTS'];
const MAX_PROGRAM_OUTPUT = 64 * 1024;

const TOO_LONG = 'This took too long, so Haskell Town stopped it. It might be stuck in an endless loop: check that every recursive call gets closer to a base case.';
const TOO_MUCH_OUTPUT = 'Your program printed a LOT of output, so Haskell Town stopped it. Is there a loop that never ends?';

/** What htown-inspect found in a module that type-checks. */
interface ModuleInfo {
  ok: true;
  types: Record<string, string>;
  sigs: string[];
  datas: ProgramSummary['datas'];
  synonyms: string[];
  classes: ProgramSummary['classes'];
  instances: string[];
  fields: string[];
  defined: string[];
  uses: string[];
  recursive: boolean;
}
type Inspected = (ModuleInfo | { ok: false; phase: string }) & { messages: GhcMessage[]; output: string };

interface Analysis {
  info: ModuleInfo;
  /** Names to hide from our imports when more code is added to the module. */
  hideAll: { prelude: string[]; town: string[] };
}

/** The request ran out of time, or the player pressed Stop. */
class Stop extends Error {
  readonly reason: Stopped['reason'];
  constructor(reason: Stopped['reason']) { super(reason); this.reason = reason; }
}
/** Something went wrong on our side. */
class Internal extends Error {}

class Job {
  readonly dir: JobDir;
  private readonly cfg: GhcConfig;
  private readonly signal?: AbortSignal;
  private readonly started = Date.now();
  private runs = 0;

  constructor(dir: JobDir, cfg: GhcConfig, signal?: AbortSignal) {
    this.dir = dir; this.cfg = cfg; this.signal = signal;
  }

  seconds() { return Math.round((Date.now() - this.started) / 100) / 10; }
  next() { return ++this.runs; }

  /** Run a command in the job's directory. A step's own time limit is the caller's business;
   *  running out of the request's time, or being cancelled, stops the whole job. */
  async exec(cmd: string, args: string[], o: { stdin?: string; wallMs: number; maxOutput?: number }): Promise<RunResult> {
    const left = this.cfg.requestSeconds * 1000 - (Date.now() - this.started);
    if (left <= 0) throw new Stop('timeout');
    const wallMs = Math.min(o.wallMs, left);
    const r = await run(this.cfg.sandbox, cmd, args, {
      cwd: this.dir.path, stdin: o.stdin, wallMs, cpuSeconds: Math.ceil(wallMs / 1000) + 1, maxOutput: o.maxOutput, signal: this.signal,
    });
    if (r.cancelled) throw new Stop('cancelled');
    if (r.timedOut && wallMs < o.wallMs) throw new Stop('timeout');
    return r;
  }
}

export class GhcService {
  private readonly cfg: GhcConfig;
  constructor(cfg: GhcConfig) { this.cfg = cfg; }

  // ---------- the runner API ----------

  check(c: Checkable, source: string, signal?: AbortSignal): Promise<CheckResult> {
    return this.job<CheckResult>(signal, async job => {
      const pre = prepare(source);
      if (!pre.ok) return { status: 'compile-error', error: pre.error };
      const prog = pre.program;
      const a = await this.analyse(job, prog);
      if ('error' in a) return { status: 'compile-error', error: a.error };
      const { info } = a;

      if (c.fn && !Object.hasOwn(info.types, c.fn)) return { status: 'missing-function', fn: c.fn };
      const missing = missingParts(c, info);
      if (missing.length) return { status: 'missing-parts', missing };
      if (c.fn && c.sig) {
        const [sig] = await this.inspectMore(job, prog, a, 'PlayerSig', [`htownSig' :: ${sigType(c.sig)}`, `htownSig' = ${c.fn}`]);
        if (!sig.ok) return { status: 'signature-mismatch', message: signatureMessage(c.fn, c.sig, info.types[c.fn]) };
      }

      const tests = await this.runTests(job, prog, a, c.tests);
      let passed = tests.every(t => t.ok);
      let ruleBreak: RuleBreak | undefined;
      if (passed) {
        const used = (c.forbid || []).filter(f => info.uses.includes(f));
        if (used.length) ruleBreak = { rule: 'forbidden', used };
        else if (c.recursive && !info.recursive) ruleBreak = { rule: 'recursion' };
        if (ruleBreak) passed = false;
      }
      return {
        status: 'tested',
        passed,
        ...(c.fn
          ? { fnType: { fn: c.fn, type: info.types[c.fn], hasSignature: info.sigs.includes(c.fn) } }
          : { instances: [...info.instances] }),
        tests,
        ...(ruleBreak ? { ruleBreak } : {}),
      };
    });
  }

  compile(source: string, signal?: AbortSignal): Promise<CompileResult> {
    return this.job<CompileResult>(signal, async job => {
      const pre = prepare(source);
      if (!pre.ok) return { status: 'compile-error', error: pre.error };
      const a = await this.analyse(job, pre.program);
      if ('error' in a) return { status: 'compile-error', error: a.error };
      return { status: 'ok', summary: summarize(a.info) };
    });
  }

  runMain(source: string, input: string, signal?: AbortSignal): Promise<RunMainResult> {
    return this.job<RunMainResult>(signal, async job => {
      const pre = prepare(source);
      if (!pre.ok) return { status: 'compile-error', error: pre.error };
      const a = await this.analyse(job, pre.program);
      if ('error' in a) return { status: 'compile-error', error: a.error };
      const summary = summarize(a.info);
      if (!summary.hasMain) return { status: 'no-main', summary };
      const mod = buildModule(pre.program, { name: 'PlayerRun', hide: a.hideAll });
      const built = await this.build(job, mod, 'PlayerRun', harnessMain('PlayerRun', 'HTown.Harness.dispatch [] PlayerRun.main'), false);
      if ('error' in built) return { status: 'compile-error', error: built.error };
      const r = await this.runProgram(job, ['main'], input);
      return { status: 'ran', summary, output: programOutput(r) };
    });
  }

  evaluate(source: string, expr: string, input: string, signal?: AbortSignal): Promise<EvalResult> {
    return this.job<EvalResult>(signal, async job => {
      const pre = prepare(source);
      if (!pre.ok) return { status: 'compile-error', error: pre.error };
      const prog = pre.program;
      const a = await this.analyse(job, prog);
      if ('error' in a) return { status: 'compile-error', error: a.error };
      const summary = summarize(a.info);
      if (expr.length > 5000) return { status: 'expr-error', error: { kind: 'internal', message: 'That expression is too long.', line: null }, summary };

      const decl = `htownExpr' = ${parens(expr)}`;
      const [ex] = await this.inspectMore(job, prog, a, 'PlayerExpr', [decl]);
      if (!ex.ok) return { status: 'expr-error', error: compileDiagnostic(firstError(ex.messages), ex.phase, () => null, ex.output), summary };
      const type = ex.types["htownExpr'"] ?? '?';
      const isIO = /^IO\b/.test(type);

      const mod = buildModule(prog, { name: 'PlayerExpr', hide: a.hideAll, append: [decl] });
      const main = harnessMain('PlayerExpr', `HTown.Harness.${isIO ? 'runIO' : 'showValue'} PlayerExpr.htownExpr'`);
      const built = await this.build(job, mod, 'PlayerExpr', main, false);
      if ('error' in built) return { status: 'expr-error', error: { ...built.error, line: null }, summary };
      const r = await this.runProgram(job, [], input);
      if (isIO) return { status: 'evaluated', summary, type, output: programOutput(r) };
      if (r.code === 0) return { status: 'evaluated', summary, type, value: prettyShow(r.stdout) };
      return { status: 'evaluated', summary, type, runtimeError: programOutput(r).error ?? runtimeDiagnostic(r.stderr) };
    });
  }

  // ---------- steps ----------

  private async job<R>(signal: AbortSignal | undefined, body: (job: Job) => Promise<R>): Promise<R> {
    const dir = await JobDir.create(this.cfg.sandbox);
    const job = new Job(dir, this.cfg, signal);
    try {
      return await body(job);
    } catch (e) {
      if (e instanceof Stop) return { status: 'stopped', reason: e.reason, seconds: job.seconds() } as R;
      if (e instanceof Internal) return { status: 'compile-error', error: { kind: 'internal', message: e.message, line: null } } as R;
      throw e;
    } finally {
      await dir.remove().catch(() => undefined);
    }
  }

  /** Type-check modules with htown-inspect. */
  private async inspect(job: Job, modules: [name: string, mod: BuiltModule][]): Promise<Inspected[]> {
    const n = job.next();
    const out = `inspect-${n}.json`;
    for (const [name, mod] of modules) await job.dir.write(`${name}.hs`, mod.text);
    const r = await job.exec(this.cfg.inspector, [...GHC_RTS, this.cfg.libdir, out, ...modules.map(([name]) => `${name}.hs`), '--', ...INSPECT_FLAGS], { wallMs: 30_000 });
    if (r.timedOut) throw new Stop('timeout');
    let results: (ModuleInfo | { ok: false; phase: string })[];
    try {
      results = JSON.parse(await readFile(job.dir.file(out), 'utf8'));
    } catch {
      throw new Internal("GHC couldn't check this program." + (r.stderr.trim() ? '\n' + r.stderr.trim().slice(0, 800) : ''));
    }
    const outs = bySection(r.stdout), errs = bySection(r.stderr);
    return results.map((res, i) => {
      const output = `${errs[i] ?? ''}\n${outs[i] ?? ''}`;
      return { ...res, messages: parseMessages(output), output };
    });
  }

  /** Check the player's module, learning which of our imported names it clashes with. */
  private async analyse(job: Job, prog: Program): Promise<Analysis | { error: Diagnostic }> {
    const prelude = new Set<string>(), town = new Set<string>();
    for (let round = 0; ; round++) {
      const mod = buildModule(prog, { name: 'Player', hide: { prelude, town } });
      const [res] = await this.inspect(job, [['Player', mod]]);
      if (res.ok) {
        const all = res.defined;
        return { info: res, hideAll: { prelude: [...prelude, ...all], town: [...town, ...all] } };
      }
      let learned = false;
      for (const { name, local, town: fromTown } of ambiguities(res.messages)) {
        if (local && !(prelude.has(name) && town.has(name))) { prelude.add(name); town.add(name); learned = true; }
        else if (fromTown && !town.has(name)) { town.add(name); learned = true; }
      }
      if (!learned || round >= 3) return { error: compileDiagnostic(firstError(res.messages), res.phase, mod.origLine, res.output) };
    }
  }

  /** Check the player's module with more declarations added at the end. */
  private inspectMore(job: Job, prog: Program, a: Analysis, name: string, append: string[]): Promise<Inspected[]> {
    return this.inspect(job, [[name, buildModule(prog, { name, hide: a.hideAll, append })]]);
  }

  /** Build the module and a Main for it into ./htown-run. */
  private async build(job: Job, mod: BuiltModule, name: string, main: string, deferTypeErrors: boolean): Promise<{ ok: true } | { error: Diagnostic }> {
    await job.dir.write(`${name}.hs`, mod.text);
    await job.dir.write('Main.hs', main);
    const r = await job.exec(this.cfg.ghc, [
      ...GHC_RTS, '--make', '-O0', '-fno-omit-yields', ...(deferTypeErrors ? ['-fdefer-type-errors'] : []), ...COMMON,
      '-outputdir', 'build', '-o', 'htown', '-with-rtsopts=-M256m -K64m', 'Main.hs',
    ], { wallMs: 60_000 });
    if (r.timedOut) throw new Stop('timeout');
    if (r.code !== 0) {
      const msg = firstError(parseMessages(r.stderr + '\n' + r.stdout));
      const mapLine = (n: number) => (msg?.file?.endsWith(`${name}.hs`) ? mod.origLine(n) : null);
      return { error: compileDiagnostic(msg, 'typecheck', mapLine, r.stderr) };
    }
    await job.dir.seal('htown', 'htown-run');
    return { ok: true };
  }

  private runProgram(job: Job, args: string[], input: string): Promise<RunResult> {
    return job.exec(job.dir.file('htown-run'), args, { stdin: input, wallMs: this.cfg.runSeconds * 1000, maxOutput: MAX_PROGRAM_OUTPUT }).then(r => {
      if (r.timedOut) throw new Stop('timeout');
      return r;
    });
  }

  private async runTests(job: Job, prog: Program, a: Analysis, tests: ChallengeTest[]): Promise<TestRow[]> {
    const exprs = tests.flatMap((t, i) => (Array.isArray(t) ? [{ i, expr: t[0], want: t[1] }] : []));
    const ios = tests.flatMap((t, i) => (Array.isArray(t) ? [] : [{ i, test: t }]));
    const rows: TestRow[] = new Array(tests.length);
    const label = (t: IOTest) => `main${t.input ? `  ⟵ input: ${JSON.stringify(t.input)}` : ''}`;

    const decls = exprs.flatMap((t, k) => [
      `htownEq${k}' = HTown.Harness.eqTest ${parens(t.expr)} ${parens(t.want)}`,
      `htownShow${k}' = HTown.Harness.showTest ${parens(t.expr)} ${parens(t.want)}`,
    ]);
    const mod = buildModule(prog, { name: 'PlayerRun', hide: a.hideAll, harness: true, append: decls });
    const list = exprs.map((_, k) => `(PlayerRun.htownEq${k}', PlayerRun.htownShow${k}')`).join(', ');
    const main = harnessMain('PlayerRun', `HTown.Harness.dispatch [${list}] ${ios.length ? 'PlayerRun.main' : 'HTown.Harness.noMain'}`);
    const built = await this.build(job, mod, 'PlayerRun', main, true);
    if ('error' in built) {
      for (const t of exprs) rows[t.i] = { expr: t.expr, ok: false, error: built.error.message };
      for (const t of ios) rows[t.i] = { expr: label(t.test), ok: false, error: built.error.message };
      return rows;
    }

    if (exprs.length) {
      const r = await job.exec(job.dir.file('htown-run'), ['tests', String(this.cfg.testSeconds * 1_000_000)], {
        wallMs: exprs.length * this.cfg.testSeconds * 1000 + 5000,
      });
      const outcomes = r.stdout.split('\n').filter(l => l.startsWith('@@htown ')).map(l => JSON.parse(l.slice(8)) as Outcome);
      exprs.forEach((t, k) => {
        const o = outcomes[k];
        rows[t.i] = o ? exprRow(t.expr, o)
          : { expr: t.expr, ok: false, error: r.timedOut ? TOO_LONG : runtimeDiagnostic(r.stderr || 'The tests stopped unexpectedly.').message };
      });
    }
    for (const { i, test } of ios) {
      const r = await job.exec(job.dir.file('htown-run'), ['main'], { stdin: test.input ?? '', wallMs: this.cfg.runSeconds * 1000, maxOutput: MAX_PROGRAM_OUTPUT });
      const expr = label(test);
      if (r.timedOut) rows[i] = { expr, ok: false, error: TOO_LONG };
      else if (r.tooMuchOutput) rows[i] = { expr, ok: false, error: TOO_MUCH_OUTPUT };
      else if (r.code !== 0) rows[i] = { expr, ok: false, error: programOutput(r).error!.message };
      else rows[i] = { expr, ok: r.stdout === test.out, want: JSON.stringify(test.out), got: JSON.stringify(r.stdout) };
    }
    return rows;
  }
}

// ---------- helpers ----------

type Outcome = { ok: boolean; want: string; got: string } | { ok: false; want?: string; error: string };

function exprRow(expr: string, o: Outcome): TestRow {
  if ('error' in o) return { expr, ok: false, ...(o.want !== undefined ? { want: prettyShow(o.want) } : {}), error: explainRuntime(o.error, false).message };
  return { expr, ok: o.ok, want: prettyShow(o.want), got: prettyShow(o.got) };
}

/** What a run of the player's program printed, and why it stopped if it failed. */
function programOutput(r: RunResult): RunOutput {
  if (r.tooMuchOutput) return { out: r.stdout, error: { kind: 'loop', message: TOO_MUCH_OUTPUT, line: null } };
  if (r.code === 0) return { out: r.stdout };
  const error = r.stderr.trim() ? runtimeDiagnostic(r.stderr) : { kind: 'runtime' as const, message: `The program stopped (exit code ${r.code}).`, line: null };
  return { out: r.stdout, error };
}

/** An expression in brackets, on lines of its own (so a trailing `-- comment` can't eat the bracket). */
function parens(expr: string): string {
  return '(\n' + expr.replace(/\r\n?/g, '\n').split('\n').map(l => '    ' + l).join('\n') + '\n  )';
}

function harnessMain(mod: string, body: string): string {
  // `import Prelude` only so GHC's messages about this file name types plainly (Show, not ghc-internal:Show).
  return `{-# LANGUAGE ExtendedDefaultRules #-}\nmodule Main (main) where\nimport Prelude\nimport qualified HTown.Harness\nimport qualified ${mod}\nmain = ${body}\n`;
}

/** Split output on the inspector's "@@htown-file N" lines. */
function bySection(text: string): string[] {
  const sections: string[] = [];
  let cur = -1;
  for (const line of text.split('\n')) {
    const m = line.match(/^@@htown-file (\d+)$/);
    if (m) { cur = +m[1]; sections[cur] = ''; } else if (cur >= 0) sections[cur] += line + '\n';
  }
  return sections;
}

function summarize(info: ModuleInfo): ProgramSummary {
  return {
    datas: info.datas,
    classes: info.classes,
    instances: info.instances,
    types: info.types,
    hasMain: Object.hasOwn(info.types, 'main'),
  };
}

function missingParts(c: Checkable, info: ModuleInfo): MissingPart[] {
  const n = c.needs;
  if (!n) return [];
  const types = new Set([...info.datas.map(d => d.name), ...info.synonyms]);
  const cons = new Set(info.datas.flatMap(d => d.cons));
  const classes = new Set(info.classes.map(k => k.name));
  return [
    ...(n.types || []).filter(t => !types.has(t)).map(name => ({ what: 'type' as const, name })),
    ...(n.cons || []).filter(k => !cons.has(k)).map(name => ({ what: 'constructor' as const, name })),
    ...(n.fields || []).filter(f => !info.fields.includes(f)).map(name => ({ what: 'field' as const, name })),
    ...(n.classes || []).filter(k => !classes.has(k)).map(name => ({ what: 'class' as const, name })),
    ...(n.instances || [])
      .filter(([k, t]) => !info.instances.includes(`${k} ${t}`))
      .map(([cls, type]) => ({ what: 'instance' as const, cls, type })),
  ];
}

// Same wording as the in-browser interpreter's fitsSignature.
function signatureMessage(name: string, sig: string, type: string): string {
  const generic = /(^|[^A-Za-z])[a-z]([^A-Za-z]|$)/.test(sigType(sig));
  return `This challenge needs \`${sig.trim()}\`, but your \`${name}\` has the type \`${name} :: ${type}\`.`
    + (generic ? " The lowercase letters in the challenge's type are type variables: your function has to work for any type there, not just one." : '');
}
