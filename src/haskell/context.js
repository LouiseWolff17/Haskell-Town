// The state the interpreter's stages share while they compile and run one program.
// Everything that used to be a module-level `let` lives here, so the stages can be separate modules.
// The fields are only ever written by the stages below — nothing outside src/haskell touches them.

// Built-in classes (Eq, Ord, Show, Functor …, and the Market's Semigroup / Monoid / Foldable).
// types.js fills in their method types, evaluator.js their built-in instances.
export const BUILTIN_CLASSES = {};

// the data context of a program with no data, type, class or instance declarations
export const EMPTY_CTX = { types: {}, syn: {}, cons: {}, fields: {} };

export const cx = {
  // ---- type checker ----
  level: 0,                 // let-nesting depth: type variables made deeper than this get generalised
  nextTv: 0,                // id of the next fresh type variable
  // ---- parser ----
  fixity: {},               // operators given a fixity by the program itself (infixl 6 <+>)
  pendingClasses: new Set(),// class names the program declares, known before their bodies are checked
  // ---- the current program's data context (used by the type checker and at run time) ----
  types: {},                // your own data types: name → { params, deriving, line, lib }
  syn: {},                  // type synonyms
  cons: {},                 // constructors: name → { scheme, arity, index, fieldNames, typeName, … }
  fields: {},               // record fields
  classes: BUILTIN_CLASSES, // classes and their instances
};

// Switch to a program's data context (made by compile, kept on prog.ctx / env.__ctx).
export function setCtx(c) { cx.types = c.types; cx.syn = c.syn; cx.cons = c.cons; cx.fields = c.fields; cx.classes = c.classes || BUILTIN_CLASSES; }
