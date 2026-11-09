// Types for the parts of the interpreter that src/runner/browser.ts uses.
// The interpreter itself is plain JavaScript (interpreter.js); values and type
// representations are opaque here on purpose — only the runner looks inside them.

export type Value = unknown;
export type Type = unknown;
export type TypeEnv = Record<string, unknown>;
export type Env = Record<string, unknown>;

export declare class HsError extends Error {
  kind: 'parse' | 'scope' | 'type' | 'runtime' | 'loop' | 'internal';
  line: number | null;
  constructor(msg: string, kind?: string, line?: number | null);
}

export interface Program {
  env: Env;
  baseEnv: Env;
  tenv: TypeEnv;
  /** name → pretty-printed type */
  types: Record<string, string>;
  /** names the player wrote a signature for */
  sigs: Record<string, unknown>;
  defs: Record<string, unknown>;
  datas: { name: string; params: string[]; cons: { name: string }[] }[];
  ctx: {
    types: Record<string, unknown>;
    cons: Record<string, unknown>;
    fields: Record<string, unknown>;
    classes: Record<string, { instances: Record<string, unknown> }>;
  };
  /** every Prelude name the program uses (for `forbid`) */
  uses: Set<string>;
  /** names of functions that call themselves */
  recursive: string[];
  classes: { name: string; param: string; methods: string[] }[];
  instances: string[];
}

export declare const HS: {
  compile(src: string): Program;
  evalIn(env: Env, src: string): Value;
  typeOf(tenv: TypeEnv, src: string): Type;
  fitsSignature(tenv: TypeEnv, name: string, sig: string): string | null;
  runMain(prog: Program, input: string): { out: string; error?: HsError };
  runIO(action: Value, input: string, ctx?: Program['ctx']): { out: string; error?: HsError };
  isIO(v: Value): boolean;
  ppType(t: Type): string;
  show(v: Value): string;
  showT(v: Value, t: Type): string;
  deepEq(a: Value, b: Value): boolean;
  PRELUDE: Env;
  TENV0: TypeEnv;
  HsError: typeof HsError;
};
