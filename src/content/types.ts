// The shape of the game's content. Challenges are plain data: the game draws them,
// and a CodeRunner (see src/runner) checks a player's code against them.

export type AssistMode = 'guided' | 'balanced' | 'independent';

export interface Resident {
  name: string;
  hair: string;
  shirt: string;
  role: string;
}

/** An expression test: evaluate `expr` in the player's program and compare it with `expected` (also Haskell). */
export type ExprTest = [expr: string, expected: string];
/** An IO test: run `main` with this stdin and compare everything it prints. */
export interface IOTest {
  input?: string;
  out: string;
}
export type ChallengeTest = ExprTest | IOTest;

/** Things the player's program must declare, checked before any test runs. */
export interface Needs {
  types?: string[];
  cons?: string[];
  fields?: string[];
  classes?: string[];
  /** [className, typeName], e.g. ['Functor', 'Crate'] */
  instances?: [cls: string, type: string][];
}

export interface Challenge {
  id: string;
  /** Position in the Requests list (1-based). */
  num: number;
  resident: string;
  title: string;
  concept: string;
  stage: string;
  reward: string;
  /** Challenge ids that must be solved first. */
  requires: string[];
  /** Upgrades add decorations to an existing building instead of building a new one. */
  upgrade?: boolean;
  /** The map plot this challenge belongs to (defaults to `id`). */
  plot?: string;

  story: string;
  task: string;
  /** The function the tests call, or null for instance-only challenges. */
  fn: string | null;
  sig: string | null;
  needs?: Needs;
  /** Prelude functions the player may not use (e.g. `sum` in a recursion challenge). */
  forbid?: string[];
  /** The solution must contain a recursive function. */
  recursive?: boolean;

  examples?: ExprTest[];
  ioExamples?: IOTest[];
  tests: ChallengeTest[];

  starter: Record<AssistMode, string>;
  primer: string;
  primerCode: string;
  /** Four progressive hints: concept, direction, structure, almost there. */
  hints: string[];
  solution: string;
  explanation: string;
  learn: { title: string; body: string; code: string };
}

export interface ComingSoon {
  title: string;
  concept: string;
  note: string;
}

export interface WorkshopExample {
  title: string;
  blurb: string;
  code: string;
  expr?: string;
  input?: string;
}
