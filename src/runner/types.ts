// The contract between the game and whatever runs the player's Haskell.
//
// The game only talks to a CodeRunner. Today that is BrowserRunner (the in-browser
// interpreter in src/haskell). Later it can be a runner that sends code to a sandboxed
// GHC server. Every method is async so a remote runner fits without changing the game.
//
// Results are plain JSON-friendly data — no HTML, no interpreter objects — so they can
// cross a network boundary unchanged. See docs/runner-api.md.

import type { Challenge } from '../content/types.ts';

export type DiagnosticKind = 'parse' | 'scope' | 'type' | 'runtime' | 'loop' | 'internal';

/** A compiler or runtime message. `message` may contain `code` in backticks, and extra
 *  lines for "Expected:/Found:" pairs, "Tip:" lines and indented code. */
export interface Diagnostic {
  kind: DiagnosticKind;
  message: string;
  line: number | null;
}

/** What a program declares — shown in the Workshop's "Types in your file". */
export interface ProgramSummary {
  datas: { name: string; params: string[]; cons: string[] }[];
  classes: { name: string; param: string; methods: string[] }[];
  /** e.g. "Functor Crate" */
  instances: string[];
  /** Top-level name → pretty-printed type, e.g. { add: "Int -> Int -> Int" } */
  types: Record<string, string>;
  hasMain: boolean;
}

export interface RunOutput {
  out: string;
  /** Output printed before the error is kept in `out`. */
  error?: Diagnostic;
}

/** The runner gave up before the code finished: it ran too long, or the player pressed Stop. */
export interface Stopped {
  status: 'stopped';
  reason: 'timeout' | 'cancelled';
  /** How long the code had been running. */
  seconds: number;
}

// ---------- checking a challenge ----------

export interface TestRow {
  /** What was run, e.g. `add 2 3` or `main  ⟵ input: "Wren"` */
  expr: string;
  ok: boolean;
  want?: string;
  got?: string;
  /** Set when running the test threw (runtime error, `undefined`, endless loop…). */
  error?: string;
}

export type MissingPart =
  | { what: 'type' | 'constructor' | 'field' | 'class'; name: string }
  | { what: 'instance'; cls: string; type: string };

/** A rule the challenge sets beyond passing the tests. */
export type RuleBreak =
  | { rule: 'forbidden'; used: string[] }
  | { rule: 'recursion' };

export type CheckResult =
  | Stopped
  /** It didn't parse or type-check. No tests ran. */
  | { status: 'compile-error'; error: Diagnostic }
  /** The function the tests call isn't defined. */
  | { status: 'missing-function'; fn: string }
  /** A required data type, constructor, field, class or instance is missing. */
  | { status: 'missing-parts'; missing: MissingPart[] }
  /** The function exists but its type doesn't fit the challenge's signature. */
  | { status: 'signature-mismatch'; message: string }
  /** The tests ran. `passed` is true only if every test passed and no rule was broken. */
  | {
      status: 'tested';
      passed: boolean;
      /** For function challenges: the function's type, and whether the player wrote the signature. */
      fnType?: { fn: string; type: string; hasSignature: boolean };
      /** For instance-only challenges: the instances found. */
      instances?: string[];
      tests: TestRow[];
      ruleBreak?: RuleBreak;
    };

// ---------- the Workshop ----------

export type CompileResult =
  | Stopped
  | { status: 'compile-error'; error: Diagnostic }
  | { status: 'ok'; summary: ProgramSummary };

export type RunMainResult =
  | Stopped
  | { status: 'compile-error'; error: Diagnostic }
  | { status: 'no-main'; summary: ProgramSummary }
  | { status: 'ran'; summary: ProgramSummary; output: RunOutput };

export type EvalResult =
  | Stopped
  | { status: 'compile-error'; error: Diagnostic }
  /** The program is fine but the expression doesn't type-check. */
  | { status: 'expr-error'; error: Diagnostic; summary: ProgramSummary }
  /** It type-checked and ran. Exactly one of value / output / runtimeError is set. */
  | {
      status: 'evaluated';
      summary: ProgramSummary;
      type: string;
      /** `show` of the result, for a pure expression */
      value?: string;
      /** for an IO action: what it printed */
      output?: RunOutput;
      runtimeError?: Diagnostic;
    };

export interface CodeRunner {
  /** Short name for logs and the UI, e.g. "browser" or "ghc". */
  readonly name: string;
  /** Check the player's code against a challenge: compile, check needs and signature, run tests, check rules. */
  check(challenge: Challenge, source: string): Promise<CheckResult>;
  /** Type-check a program and describe what it declares. */
  compile(source: string): Promise<CompileResult>;
  /** Compile, then run `main` with the given stdin (one line per getLine). */
  runMain(source: string, input: string): Promise<RunMainResult>;
  /** Compile, then evaluate an expression in the program (like GHCi's λ> prompt). IO actions are run. */
  evaluate(source: string, expr: string, input: string): Promise<EvalResult>;
  /** Stop the code that is running now, if the runner can. Its pending call resolves with a `stopped` result. */
  cancel?(): void;
}
