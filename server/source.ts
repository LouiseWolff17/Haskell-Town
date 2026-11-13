// Getting the player's source ready for GHC:
//  - only safe pragmas are allowed (no CPP, Template Haskell, compiler options, …),
//  - the module gets a name we choose (whatever header the player wrote, or none),
//  - Haskell Town's imports are added: the Prelude and the town prelude (HTown.Prelude, the
//    extras the in-browser interpreter has built in), each hiding the names the program
//    defines itself, so the player's own `toList` or `insert` wins as it does in the browser,
//  - test bindings can be appended at the end,
// and GHC's line numbers can be mapped back to the player's lines.

import type { Diagnostic } from '../src/runner/types.ts';

export interface Program {
  /** The player's source, with Windows line endings normalised. */
  source: string;
  /** The program imports Prelude itself, so we mustn't add `import Prelude`. */
  importsPrelude: boolean;
}

/** Names to hide from the imports we add. */
export interface Hiding {
  prelude: Iterable<string>;
  town: Iterable<string>;
}

export interface ModuleSpec {
  /** The module name, e.g. Player. */
  name: string;
  hide: Hiding;
  /** Also `import qualified HTown.Harness` (for test bindings). */
  harness?: boolean;
  /** Top-level declarations to add at the end. */
  append?: string[];
}

export interface BuiltModule {
  text: string;
  /** The player's line for a line of `text`, or null for a line we added. */
  origLine(line: number): number | null;
}

export const MAX_SOURCE = 100_000;

// Extensions a program may turn on (or off, with No…). Anything else is refused: CPP and
// Template Haskell run things at compile time, FFI and MagicHash get around Safe Haskell,
// PackageImports reaches hidden packages, and Unsafe/Trustworthy would switch Safe off.
const EXTENSIONS = new Set(`
  Haskell98 Haskell2010 GHC2021 GHC2024
  AllowAmbiguousTypes ApplicativeDo Arrows BangPatterns BinaryLiterals BlockArguments
  ConstrainedClassMethods ConstraintKinds DataKinds DatatypeContexts DefaultSignatures
  DeriveAnyClass DeriveDataTypeable DeriveFoldable DeriveFunctor DeriveGeneric DeriveLift
  DeriveTraversable DerivingStrategies DerivingVia DisambiguateRecordFields DuplicateRecordFields
  EmptyCase EmptyDataDecls EmptyDataDeriving ExistentialQuantification ExplicitForAll
  ExplicitNamespaces ExtendedDefaultRules FieldSelectors FlexibleContexts FlexibleInstances
  FunctionalDependencies GADTSyntax GADTs GeneralisedNewtypeDeriving GeneralizedNewtypeDeriving
  HexFloatLiterals ImplicitParams ImplicitPrelude ImportQualifiedPost ImpredicativeTypes
  InstanceSigs KindSignatures LambdaCase LexicalNegation LiberalTypeSynonyms LinearTypes
  MonadComprehensions MonoLocalBinds MonomorphismRestriction MultiParamTypeClasses MultiWayIf
  NamedFieldPuns NamedWildCards NegativeLiterals NondecreasingIndentation NPlusKPatterns
  NumDecimals NumericUnderscores OverloadedLabels OverloadedLists OverloadedRecordDot
  OverloadedStrings ParallelListComp PartialTypeSignatures PatternGuards PatternSynonyms
  PolyKinds PostfixOperators QualifiedDo QuantifiedConstraints RankNTypes RebindableSyntax
  RecordWildCards RecursiveDo RelaxedPolyRec RoleAnnotations Safe ScopedTypeVariables
  StandaloneDeriving StandaloneKindSignatures StarIsType Strict StrictData TraditionalRecordSyntax
  TupleSections TypeAbstractions TypeApplications TypeData TypeFamilies TypeFamilyDependencies
  TypeOperators TypeSynonymInstances UnicodeSyntax UndecidableInstances UndecidableSuperClasses
  ViewPatterns
`.trim().split(/\s+/));

// Pragmas that only give GHC hints. (OPTIONS_GHC is refused: it can pass any flag.)
const PRAGMAS = new Set([
  'LANGUAGE', 'INLINE', 'NOINLINE', 'INLINABLE', 'INLINEABLE', 'OPAQUE', 'SPECIALIZE', 'SPECIALISE',
  'MINIMAL', 'COMPLETE', 'UNPACK', 'NOUNPACK', 'OVERLAPPING', 'OVERLAPPABLE', 'OVERLAPS', 'INCOHERENT',
  'DEPRECATED', 'WARNING', 'SCC', 'OPTIONS_HADDOCK',
]);

const SYMBOL = new Set('!#$%&*+./<=>?@\\^|-~:');
const isSymbol = (c: string | undefined) => c !== undefined && SYMBOL.has(c);
const isIdent = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_']/u.test(c);

/** Where the next token starts, skipping whitespace, comments and pragmas. */
function skipTrivia(s: string, i: number): number {
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith('{-', i)) { i = endOfBlockComment(s, i); continue; }
    if (isLineComment(s, i)) { while (i < s.length && s[i] !== '\n') i++; continue; }
    return i;
  }
}
function isLineComment(s: string, i: number): boolean {
  if (!s.startsWith('--', i)) return false;
  let j = i;
  while (s[j] === '-') j++;
  return !isSymbol(s[j]);
}
function endOfBlockComment(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    if (s.startsWith('{-', i)) { depth++; i += 2; }
    else if (s.startsWith('-}', i)) { depth--; i += 2; if (depth === 0) return i; }
    else i++;
  }
  return i;
}

const lineAt = (s: string, i: number) => s.slice(0, i).split('\n').length;
const colAt = (s: string, i: number) => i - (s.lastIndexOf('\n', i - 1) + 1); // 0-based

/** Pragmas the program may not use, as a compile error. */
export function checkPragmas(source: string): Diagnostic | null {
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (source.startsWith('{-#', i)) {
      const end = source.indexOf('#-}', i);
      const body = source.slice(i + 3, end < 0 ? source.length : end).trim();
      const word = (body.match(/^[A-Za-z_]+/)?.[0] ?? '').toUpperCase();
      const line = lineAt(source, i);
      if (!PRAGMAS.has(word)) {
        return refuse(line, word.startsWith('OPTIONS') || word === 'INCLUDE'
          ? `compiler options (\`{-# ${word} … #-}\`) can't be set in Haskell Town.`
          : `Haskell Town's GHC doesn't allow the \`{-# ${word || body} #-}\` pragma.`);
      }
      if (word === 'LANGUAGE') {
        for (const ext of body.slice(8).split(',').map(x => x.trim()).filter(Boolean)) {
          const name = ext.startsWith('No') && EXTENSIONS.has(ext.slice(2)) ? ext.slice(2) : ext;
          if (!EXTENSIONS.has(name)) return refuse(line, `Haskell Town's GHC doesn't allow the \`${ext}\` extension.`);
        }
      }
      i = end < 0 ? source.length : end + 3;
    } else if (source.startsWith('{-', i)) i = endOfBlockComment(source, i);
    else if (isLineComment(source, i)) { while (i < source.length && source[i] !== '\n') i++; }
    else if (c === '"') i = endOfString(source, i);
    else if (c === "'" && !isIdent(source[i - 1])) i = endOfChar(source, i);
    else i++;
  }
  return null;
}
function refuse(line: number, what: string): Diagnostic {
  return {
    kind: 'parse',
    message: `Line ${line}: ${what}\nTip: Take it out. Haskell Town only lets programs use pragmas and extensions that are safe to run on its server.`,
    line,
  };
}
function endOfString(s: string, i: number): number {
  for (i++; i < s.length && s[i] !== '\n'; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '"') return i + 1;
  }
  return i;
}
function endOfChar(s: string, i: number): number {
  // 'a', '\n', '\'', '\123' — or a promoted name like 'Just, which isn't a literal
  const m = s.slice(i, i + 12).match(/^'(?:\\[^']*|[^\\'\n])'/);
  return i + (m ? m[0].length : 1);
}

/** Replace comments and string contents with spaces, keeping every line where it was. */
function blankComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    let j = i;
    if (s.startsWith('{-', i)) j = endOfBlockComment(s, i);
    else if (isLineComment(s, i)) { while (j < s.length && s[j] !== '\n') j++; }
    else if (s[i] === '"') j = endOfString(s, i);
    if (j > i) { out += s.slice(i, j).replace(/[^\n]/g, ' '); i = j; }
    else { out += s[i]; i++; }
  }
  return out;
}

export function prepare(raw: string): { ok: true; program: Program } | { ok: false; error: Diagnostic } {
  const source = raw.replace(/\r\n?/g, '\n');
  if (source.length > MAX_SOURCE) {
    return { ok: false, error: { kind: 'internal', message: `This program is too long for Haskell Town's GHC (over ${MAX_SOURCE / 1000}k characters).`, line: null } };
  }
  const bad = checkPragmas(source);
  if (bad) return { ok: false, error: bad };
  const importsPrelude = /^[ \t]*import\s+(?:safe\s+)?(?:qualified\s+)?Prelude\b/m.test(blankComments(source));
  return { ok: true, program: { source, importsPrelude } };
}

/** Where the module header is (`module X (…) where`), or where the first token is. */
function findHeader(s: string): { header: true; start: number; end: number } | { header: false; at: number } {
  const start = skipTrivia(s, 0);
  if (!(s.startsWith('module', start) && !isIdent(s[start + 6]))) return { header: false, at: start };
  let i = start + 6;
  let depth = 0;
  while (i < s.length) {
    i = skipTrivia(s, i);
    const c = s[i];
    if (c === '(') { depth++; i++; }
    else if (c === ')') { depth--; i++; }
    else if (isIdent(c)) {
      let j = i;
      while (isIdent(s[j]) || (s[j] === '.' && isIdent(s[j + 1]))) j++;
      if (depth === 0 && s.slice(i, j) === 'where') return { header: true, start, end: j };
      i = j;
    } else i++;
  }
  return { header: false, at: start }; // no `where`: let GHC complain about the header
}

const opName = (n: string) => (/^[\p{L}_]/u.test(n) ? n : `(${n})`);
function importLine(p: Program, spec: ModuleSpec): string {
  const hiding = (names: Iterable<string>) => {
    const list = [...new Set(names)].sort();
    return list.length ? ` hiding (${list.map(opName).join(', ')})` : '';
  };
  const parts = [];
  if (!p.importsPrelude) parts.push(`import Prelude${hiding(spec.hide.prelude)}`, 'import qualified Prelude');
  parts.push(`import HTown.Prelude${hiding(spec.hide.town)}`);
  if (spec.harness) parts.push('import qualified HTown.Harness');
  return parts.join('; ');
}

/** The player's program as module `spec.name`, with our imports and any appended declarations. */
export function buildModule(p: Program, spec: ModuleSpec): BuiltModule {
  const s = p.source;
  const lines = s.split('\n');
  const out: { t: string; o: number | null }[] = [];
  const keep = (from: number, to: number) => { for (let k = from; k <= to; k++) out.push({ t: lines[k - 1], o: k }); };
  const imports = importLine(p, spec);
  const h = findHeader(s);
  // The column the program's top-level declarations start in: what we add goes there too.
  let indent = 0;

  if (h.header) {
    const hs = lineAt(s, h.start), he = lineAt(s, h.end);
    const after = skipTrivia(s, h.end);
    if (s[after] === '{') {
      // module X where { … } — explicit braces: put our imports just inside them
      const text = s.slice(0, h.start) + `module ${spec.name} where` + s.slice(h.start, h.end).replace(/[^\n]/g, ' ')
        + s.slice(h.end, after + 1) + ` ${imports};` + s.slice(after + 1);
      return { text: text + (spec.append?.length ? '\n' + spec.append.join(';\n') + '\n' : ''), origLine: n => (n <= lines.length ? n : null) };
    }
    indent = after < s.length ? colAt(s, after) : 0;
    keep(1, hs - 1);
    out.push({ t: lines[hs - 1].slice(0, colAt(s, h.start)) + `module ${spec.name} where`, o: hs });
    for (let k = hs + 1; k <= he; k++) out.push({ t: '', o: k });
    out.push({ t: ' '.repeat(indent) + imports, o: null });
    const rest = lines[he - 1].slice(colAt(s, h.end));
    if (rest.trim()) out.push({ t: ' '.repeat(colAt(s, h.end)) + rest, o: he });
    keep(he + 1, lines.length);
  } else if (h.at >= s.length) {
    // nothing but comments
    keep(1, lines.length);
    out.push({ t: `module ${spec.name} where`, o: null }, { t: imports, o: null });
  } else {
    const t = lineAt(s, h.at), col = colAt(s, h.at);
    indent = col;
    keep(1, t - 1);
    const before = lines[t - 1].slice(0, col);
    if (before.trim()) out.push({ t: before, o: t });
    out.push({ t: `module ${spec.name} where`, o: null }, { t: ' '.repeat(indent) + imports, o: null });
    out.push({ t: ' '.repeat(col) + lines[t - 1].slice(col), o: t });
    keep(t + 1, lines.length);
  }
  if (spec.append?.length) {
    out.push({ t: '', o: null });
    for (const decl of spec.append) for (const l of decl.split('\n')) out.push({ t: ' '.repeat(indent) + l, o: null });
  }
  return { text: out.map(l => l.t).join('\n') + '\n', origLine: n => out[n - 1]?.o ?? null };
}

/** An expression from a test or the Workshop, made safe to put inside one declaration. */
export function oneLine(expr: string): string {
  return expr.replace(/\r?\n/g, ' ');
}

/** `add :: Int -> Int -> Int` → `Int -> Int -> Int` */
export function sigType(sig: string): string {
  const i = sig.indexOf('::');
  return (i < 0 ? sig : sig.slice(i + 2)).trim();
}
