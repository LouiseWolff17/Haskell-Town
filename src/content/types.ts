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

/** The fields a CodeRunner needs to check code: a challenge has them, and so does an errand. */
export type Checkable = Pick<Challenge, 'fn' | 'sig' | 'needs' | 'tests' | 'forbid' | 'recursive'>;

// ---------- Errands: spaced retrieval practice after the village is built ----------

/** A group of ideas that comes back for review as one unit, e.g. "Recursion". */
export interface ReviewTopic {
  id: string;
  title: string;
  resident: string;
  /** The challenges that taught this topic. Their Library cards are the cue a player can peek at. */
  from: string[];
}

/** A small new problem on an old topic, solved from memory. Each topic has several, so a
 *  review is a fresh problem (practising transfer) rather than retyping a remembered answer. */
export interface Errand extends Checkable {
  id: string;
  /** A ReviewTopic id. */
  topic: string;
  resident: string;
  title: string;
  story: string;
  task: string;
  examples?: ExprTest[];
  ioExamples?: IOTest[];
  /** Kept small on purpose: the point is to recall the rest. */
  starter: string;
  solution: string;
  /** Shown after the errand is solved, or when the player asks for the answer. */
  explanation: string;
}

// ---------- Rewards: the town keeps growing after the village is built ----------

/** A new piece of land south of the railway, opened by solving errands from the Notice Board. */
export interface Expansion {
  id: string;
  title: string;
  /** Total errands solved (any outcome) before it opens. Errands are capped per day, so this paces growth. */
  needs: number;
  /** Where it goes: slot 0 and 1 share the first strip of land (west, east), 2 and 3 the second, and so on. */
  slot: number;
  /** The resident who welcomes you there. */
  resident: string;
  /** Shown in the toast and the Journal when it opens. */
  note: string;
}

/** What a resident gives as you help them with errands. Hearts come from their errands on the Notice Board. */
export interface Friendship {
  resident: string;
  /** ♥ 1: a letter that arrives in Wren's mailbox. */
  letter: string;
  /** ♥ 2: a keepsake for the Journal. Its note hints where it goes in the Satchel (docs/gift-items-design.md, section 3).
   *  `afterUse`, if set, is added to the note once the item has been used. */
  gift: { icon: string; name: string; note: string; afterUse?: string };
  /** ♥ 4: a lasting change to their building on the map (drawn in town.ts FRIEND_ART). */
  change: string;
}

/** Where a gift is used on the map: a building, or a piece of land opened by errands. */
export interface ItemTarget {
  plot?: string;
  /** An Expansion id. */
  land?: string;
  /** Only part of the plot or land, as [dx, dy, w, h] from its corner (the beehives, Brine's boat). */
  spot?: [dx: number, dy: number, w: number, h: number];
  /** Only there once this resident is a best friend (♥ 4): Brine's boat is his lasting change. */
  friend?: string;
  /** The place as a Haskell name, for the toast: `use spareKey wrensCottage`. */
  name: string;
}

/** A ♥ 2 gift as something in the Satchel, used by clicking the place it belongs. */
export interface GiftItem {
  resident: string;
  /** The item as a Haskell name, for the toast. */
  id: string;
  /** Null while its place isn't in the game yet (the Glaschu items). */
  target: ItemTarget | null;
  /** Picked while its place isn't on the map yet: why it waits. Nothing is used up. */
  notYet: string;
  /** Clicked somewhere else: a gentle line, and the item goes back in the Satchel. */
  wrong: string;
  /** Used in the right place. */
  used: string;
  /** Once used, its place can be visited: a room for the five town buildings (interiors.ts), else a card with this title and line. */
  place?: string;
  visit?: string;
}

/** A bit of life on the map that appears the first time you solve an errand on a topic. */
export interface LifeTouch {
  /** A ReviewTopic id. */
  topic: string;
  title: string;
  note: string;
}
