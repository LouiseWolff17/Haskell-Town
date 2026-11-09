// BrowserRunner: runs the player's code with the in-browser interpreter (src/haskell).
// This holds the challenge-checking rules; a GHC runner must give the same results
// for the same code (tests/runner-contract.test.ts checks this).

import { HS } from '../haskell/interpreter.js';
import type { Program } from '../haskell/interpreter.js';
import type { Challenge, IOTest } from '../content/types.ts';
import type {
  CheckResult, CodeRunner, CompileResult, Diagnostic, DiagnosticKind, EvalResult,
  MissingPart, ProgramSummary, RuleBreak, RunMainResult, RunOutput, TestRow,
} from './types.ts';

const KINDS: DiagnosticKind[] = ['parse', 'scope', 'type', 'runtime', 'loop', 'internal'];

function diagnostic(e: unknown): Diagnostic {
  if (e instanceof HS.HsError) {
    return { kind: KINDS.includes(e.kind) ? e.kind : 'runtime', message: e.message, line: e.line ?? null };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { kind: 'internal', message: 'Something went wrong inside the interpreter: ' + message, line: null };
}

function output(r: { out: string; error?: unknown }): RunOutput {
  return r.error ? { out: r.out, error: diagnostic(r.error) } : { out: r.out };
}

function summarize(prog: Program): ProgramSummary {
  return {
    datas: (prog.datas || []).map(d => ({ name: d.name, params: [...d.params], cons: d.cons.map(c => c.name) })),
    classes: (prog.classes || []).map(c => ({ name: c.name, param: c.param, methods: [...c.methods] })),
    instances: [...(prog.instances || [])],
    types: { ...prog.types },
    hasMain: !!prog.defs.main,
  };
}

type Compiled = { ok: true; prog: Program } | { ok: false; error: Diagnostic };
function compile(source: string): Compiled {
  try { return { ok: true, prog: HS.compile(source) }; }
  catch (e) { return { ok: false, error: diagnostic(e) }; }
}

function missingParts(c: Challenge, prog: Program): MissingPart[] {
  const n = c.needs;
  if (!n) return [];
  const { ctx } = prog;
  return [
    ...(n.types || []).filter(t => !ctx.types[t]).map(name => ({ what: 'type' as const, name })),
    ...(n.cons || []).filter(k => !ctx.cons[k]).map(name => ({ what: 'constructor' as const, name })),
    ...(n.fields || []).filter(f => !ctx.fields[f]).map(name => ({ what: 'field' as const, name })),
    ...(n.classes || []).filter(k => !ctx.classes[k]).map(name => ({ what: 'class' as const, name })),
    ...(n.instances || [])
      .filter(([k, t]) => !(ctx.classes[k] && ctx.classes[k].instances[t]))
      .map(([cls, type]) => ({ what: 'instance' as const, cls, type })),
  ];
}

function runIOTest(prog: Program, test: IOTest): TestRow {
  const r = HS.runMain(prog, test.input || '');
  const expr = `main${test.input ? `  ⟵ input: ${JSON.stringify(test.input)}` : ''}`;
  if (r.error) return { expr, ok: false, error: r.error.message };
  return { expr, ok: r.out === test.out, want: JSON.stringify(test.out), got: JSON.stringify(r.out) };
}

function runExprTest(prog: Program, expr: string, expected: string): TestRow {
  let ty: unknown = null;
  try { ty = HS.typeOf(prog.tenv, expr); } catch { /* shown as a runtime error below */ }
  const sh = (v: unknown) => (ty ? HS.showT(v, ty) : HS.show(v));
  const want = HS.evalIn(prog.baseEnv, expected);
  try {
    const got = HS.evalIn(prog.env, expr);
    return { expr, ok: HS.deepEq(got, want), want: sh(want), got: sh(got) };
  } catch (e) {
    return { expr, ok: false, want: sh(want), error: diagnostic(e).message };
  }
}

export function checkChallenge(c: Challenge, source: string): CheckResult {
  const compiled = compile(source);
  if (!compiled.ok) return { status: 'compile-error', error: compiled.error };
  const { prog } = compiled;

  if (c.fn && (!(c.fn in prog.env) || !Object.prototype.hasOwnProperty.call(prog.env, c.fn))) {
    return { status: 'missing-function', fn: c.fn };
  }
  const missing = missingParts(c, prog);
  if (missing.length) return { status: 'missing-parts', missing };

  const misfit = c.fn && c.sig ? HS.fitsSignature(prog.tenv, c.fn, c.sig) : null;
  if (misfit) return { status: 'signature-mismatch', message: misfit };

  const tests = c.tests.map(t => (Array.isArray(t) ? runExprTest(prog, t[0], t[1]) : runIOTest(prog, t)));
  let passed = tests.every(t => t.ok);
  let ruleBreak: RuleBreak | undefined;
  if (passed) {
    const used = (c.forbid || []).filter(f => prog.uses.has(f));
    if (used.length) ruleBreak = { rule: 'forbidden', used };
    else if (c.recursive && !prog.recursive.length) ruleBreak = { rule: 'recursion' };
    if (ruleBreak) passed = false;
  }
  return {
    status: 'tested',
    passed,
    ...(c.fn
      ? { fnType: { fn: c.fn, type: prog.types[c.fn], hasSignature: !!prog.sigs[c.fn] } }
      : { instances: [...prog.instances] }),
    tests,
    ...(ruleBreak ? { ruleBreak } : {}),
  };
}

function compileProgram(source: string): CompileResult {
  const c = compile(source);
  return c.ok ? { status: 'ok', summary: summarize(c.prog) } : { status: 'compile-error', error: c.error };
}

function runMain(source: string, input: string): RunMainResult {
  const c = compile(source);
  if (!c.ok) return { status: 'compile-error', error: c.error };
  const summary = summarize(c.prog);
  if (!summary.hasMain) return { status: 'no-main', summary };
  return { status: 'ran', summary, output: output(HS.runMain(c.prog, input)) };
}

function evaluate(source: string, expr: string, input: string): EvalResult {
  const c = compile(source);
  if (!c.ok) return { status: 'compile-error', error: c.error };
  const { prog } = c;
  const summary = summarize(prog);
  let ty: unknown;
  try { ty = HS.typeOf(prog.tenv, expr); }
  catch (e) { return { status: 'expr-error', error: diagnostic(e), summary }; }
  const type = HS.ppType(ty);
  try {
    const v = HS.evalIn(prog.env, expr);
    if (HS.isIO(v)) return { status: 'evaluated', summary, type, output: output(HS.runIO(v, input, prog.ctx)) };
    return { status: 'evaluated', summary, type, value: HS.showT(v, ty) };
  } catch (e) {
    return { status: 'evaluated', summary, type, runtimeError: diagnostic(e) };
  }
}

export class BrowserRunner implements CodeRunner {
  readonly name = 'browser';
  async check(challenge: Challenge, source: string) { return checkChallenge(challenge, source); }
  async compile(source: string) { return compileProgram(source); }
  async runMain(source: string, input: string) { return runMain(source, input); }
  async evaluate(source: string, expr: string, input: string) { return evaluate(source, expr, input); }
}
