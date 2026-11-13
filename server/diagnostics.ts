// Turning GHC's messages into the beginner-friendly ones the game shows.
//
// GHC's own messages are precise but dense ("• Couldn't match expected type ‘Int’ with
// actual type ‘[Char]’ • In the first argument of …"). The game shows one short sentence,
// optional `Expected:` / `Found:` lines and a `Tip:` line, like the in-browser interpreter.

import type { Diagnostic, DiagnosticKind } from '../src/runner/types.ts';

export interface GhcMessage {
  file: string | null;
  line: number | null;
  col: number | null;
  severity: 'error' | 'warning';
  code: string | null;
  /** The message without its location line, dedented. */
  body: string;
}

const HEADER = /^(?:(?<file>[^\s:][^:\n]*?):(?:(?<l>\d+):(?<c>\d+)(?:-\d+)?|\((?<l2>\d+),(?<c2>\d+)\)-\(\d+,\d+\))|<no location info>): (?<sev>error|warning)(?::)?(?<rest>.*)$/;

/** Split compiler output into its messages. Lines before the first message are ignored. */
export function parseMessages(output: string): GhcMessage[] {
  const msgs: (GhcMessage & { lines: string[] })[] = [];
  for (const line of output.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(HEADER);
    if (m?.groups) {
      const g = m.groups;
      let rest = g.rest;
      const code = rest.match(/\[(GHC-\d+)\]/)?.[1] ?? null;
      rest = rest.replace(/\[[^\]]*\]/g, '').trim();
      msgs.push({
        file: g.file ?? null,
        line: g.l ? +g.l : g.l2 ? +g.l2 : null,
        col: g.c ? +g.c : g.c2 ? +g.c2 : null,
        severity: g.sev as 'error' | 'warning',
        code,
        body: '',
        lines: rest ? [rest] : [],
      });
    } else if (msgs.length && !line.startsWith('@@htown')) {
      msgs[msgs.length - 1].lines.push(line);
    }
  }
  // GHC quotes names as ‘x’, or as `x' when it can't print Unicode: use one style
  return msgs.map(({ lines, ...m }) => ({ ...m, body: dedent(lines).replace(/`([^`'\n]*)'/g, '‘$1’') }));
}

function dedent(lines: string[]): string {
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  // GHC's source snippet (`  |` lines) if -fno-diagnostics-show-caret was ignored
  lines = lines.filter(l => !/^\s*\d*\s*\|/.test(l));
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length));
  return lines.map(l => l.slice(Number.isFinite(ind) ? ind : 0)).join('\n');
}

export const firstError = (msgs: GhcMessage[]) => msgs.find(m => m.severity === 'error') ?? null;

/** ‘x’ and `x' → `x`, and drop the module names GHC sometimes puts on our own names. */
export function tidy(s: string): string {
  return s
    .replace(/[‘`]([^’'`\n]*)[’']/g, '`$1`')
    .replace(/\b(?:Player(?:Sig|Expr|Run)?|HTown\.Prelude|HTown\.Harness)\./g, '')
    .replace(/\bGHC\.Internal\.[\w.]+\.(?=[\w(])/g, '')
    .replace(/htown(?:Sig|Expr|Eq\d+|Show\d+)'/g, 'the test');
}

/** The bullets of a GHC message: "• a\n  more\n• b" → ["a\nmore", "b"]. */
function bullets(body: string): string[] {
  if (!body.includes('•')) return [body];
  return body.split(/^• |\n• /m).filter(b => b.trim()).map(b => b.replace(/\n  /g, '\n').trim());
}

const article = (t: string) => (/^[AEIOU]/.test(t) ? 'an' : 'a');
const isNumberType = (t: string) => /^(Int|Integer|Double|Float|Word|Rational)$/.test(t);
const isText = (t: string) => t === 'String' || t === '[Char]';

function mismatchTip(expected: string, found: string, all: string): string | null {
  const pair = [expected, found];
  if (/rigid type variable/.test(all)) return "Lowercase letters in a type signature mean *any* type, so the function has to work for every type there, not just one.";
  if (pair.some(isNumberType) && pair.some(isText)) return 'To turn a number into text use `show`, and to turn text into a number use `read`.';
  if (pair.some(t => /^(Int|Integer)$/.test(t)) && pair.some(t => /^(Double|Float)$/.test(t))) return 'To use a whole number where a `Double` is needed, convert it with `fromIntegral`.';
  if (/->/.test(found) && !/->/.test(expected)) return 'This is still a function here: is it missing an argument?';
  if (/^\[/.test(expected) !== /^\[/.test(found) && pair.some(t => /^\[/.test(t))) return 'One side is a list and the other is a single value. `:` puts one item on the front of a list; `++` joins two lists.';
  if (pair.some(t => t === 'Bool')) return 'Conditions (like `x > 3`) give a `Bool`. Check what each side of the comparison is.';
  return null;
}

/** One sentence (plus Expected/Found and Tip lines) for a compile-time message. */
export function explainCompile(body: string): { message: string; kind: DiagnosticKind } {
  const parts = bullets(body);
  const main = parts[0] ?? '';
  const all = body;
  const fn = all.match(/In an equation for ‘([^’]+)’/)?.[1];
  const suggestions = [...all.matchAll(/Perhaps use (?:one of these:)?\s*‘([^’]+)’/g)].map(m => m[1]);
  const suggest = suggestions.length ? `Tip: Did you mean \`${suggestions[0]}\`?` : null;
  let m: RegExpMatchArray | null;
  const out = (kind: DiagnosticKind, ...lines: (string | null | undefined)[]) =>
    ({ kind, message: tidy(lines.filter(l => l != null).join('\n')) });

  // ---- reading the code ----
  if ((m = main.match(/^parse error on input ‘(.+?)’/))) {
    return out('parse', `Haskell couldn't make sense of \`${m[1]}\` here.`,
      m[1] === '=' || m[1] === '|'
        ? 'Tip: Check the line above: is something unfinished there? Lines that continue a definition must be indented.'
        : 'Tip: Check for a missing bracket or quote, and that lines continuing a definition are indented.');
  }
  if (/^parse error \(possibly incorrect indentation or mismatched brackets\)/.test(main)) {
    return out('parse', "Haskell couldn't read this part: a bracket may be missing, or a line is indented wrongly.",
      'Tip: Every `(` needs a matching `)`, and lines that continue a definition must be indented further than its first line.');
  }
  if ((m = main.match(/^Parse error in pattern: (.+)/))) {
    return out('parse', `\`${m[1].trim()}\` isn't a pattern Haskell understands.`,
      'Tip: A constructor with arguments needs brackets in a pattern: `f (x:xs) = …`, not `f x:xs = …`.');
  }
  if (/lexical error in string\/character literal/.test(main)) {
    return out('parse', "A string or character here isn't written right.", 'Tip: Strings go in double quotes, "like this"; a single character goes in single quotes, like `\'a\'`.');
  }
  if (/^lexical error/.test(main)) return out('parse', "There's a character here that Haskell can't read.");
  if (/^The last statement in a ‘?do’? block must be an expression/.test(main)) {
    return out('parse', 'A `do` block has to end with an action, not with `<-` or `let`.', 'Tip: Add the action that uses the result, like `putStrLn name` or `return x`.');
  }
  if (/^(Empty ‘do’|Unexpected |parse error|Parse error|Illegal)/.test(main)) return out('parse', firstLine(main));

  // ---- names ----
  if ((m = main.match(/^Found hole: (\S+) :: ([^\n]+)/))) {
    const [hole, type] = [m[1], m[2].trim()];
    return out('parse', `There's still a blank (\`${hole}\`) to fill in here. It should be ${article(type)} \`${type}\`.`,
      `Tip: Replace \`${hole}\` with your own code.`);
  }
  if ((m = main.match(/^Variable not in scope:\s*(\S+)/))) {
    return out('scope', `I don't know anything called \`${m[1]}\`.`, suggest ?? 'Tip: Check the spelling (names are case-sensitive), or define it first.');
  }
  if ((m = main.match(/^(?:Data constructor not in scope:\s*(\S+)|Not in scope: data constructor ‘([^’]+)’)/))) {
    return out('scope', `I don't know a constructor called \`${m[1] ?? m[2]}\`.`, suggest ?? 'Tip: Constructors come from a `data` declaration. Check the spelling.');
  }
  if ((m = main.match(/^Not in scope: type (?:constructor or class|variable) ‘([^’]+)’/))) {
    return out('scope', `I don't know a type called \`${m[1]}\`.`, suggest ?? 'Tip: Types come from a `data` (or `type`) declaration, and start with a capital letter.');
  }
  if ((m = main.match(/^Not in scope: ‘([^’]+)’/))) return out('scope', `I don't know anything called \`${m[1]}\`.`, suggest);
  if ((m = main.match(/^Ambiguous occurrence ‘([^’]+)’/))) {
    return out('scope', `\`${m[1]}\` could mean two different things here.`, `Tip: Give your own \`${m[1]}\` a different name.`);
  }
  if ((m = main.match(/^Multiple declarations of ‘([^’]+)’/))) {
    return out('scope', `\`${m[1]}\` is defined more than once.`, 'Tip: All the equations of one function must be written together, one after another.');
  }
  if ((m = main.match(/^The type signature for ‘([^’]+)’\s+lacks an accompanying binding/))) {
    return out('scope', `There's a type signature for \`${m[1]}\`, but no definition with that name.`, 'Tip: Check that the definition below it is spelled the same way.');
  }
  if ((m = main.match(/^Duplicate type signatures?/))) return out('scope', 'A function has two type signatures.', 'Tip: Keep one of them.');
  if ((m = main.match(/^Conflicting definitions for ‘([^’]+)’/))) {
    return out('scope', `\`${m[1]}\` is used twice in the same pattern.`, 'Tip: Give each variable in a pattern its own name. To check two things are equal, use a guard: `| a == b = …`.');
  }
  if ((m = main.match(/^Could not find module ‘([^’]+)’/))) {
    return out('scope', `Haskell Town's GHC doesn't have a module called \`${m[1]}\`.`, 'Tip: You can import modules from base and containers, like Data.List, Data.Char and Data.Map.');
  }
  if ((m = main.match(/^‘?([\w.]+)’?: Can't be safely imported!/)) || (m = main.match(/^The (?:module|package) .*?‘([^’]+)’.* (?:is not trusted|not safe)/))) {
    return out('scope', `\`${m[1]}\` can't be used in Haskell Town, because it can do things that aren't safe to run on the server.`);
  }

  // ---- types ----
  if ((m = main.match(/^Couldn't match (?:expected type ‘([^’]+)’ with actual type ‘([^’]+)’|type ‘([^’]+)’ with ‘([^’]+)’)/s))) {
    const expected = (all.match(/^\s*Expected: (.+)$/m)?.[1] ?? m[1] ?? m[4] ?? '').trim();
    const found = (all.match(/^\s*Actual: (.+)$/m)?.[1] ?? m[2] ?? m[3] ?? '').trim();
    return out('type', `Type mismatch${fn ? ` in \`${fn}\`` : ''}.`, `  Expected: ${expected}`, `  Found:    ${found}`,
      mismatchTip(expected, found, all) ? 'Tip: ' + mismatchTip(expected, found, all) : null);
  }
  if ((m = main.match(/^No instance for [‘(]+([^’)]+)[’)]+\s+arising from (?:a use of ‘([^’]+)’|the literal ‘([^’]+)’|(.*))/s))) {
    const [cls, ...rest] = m[1].trim().split(/\s+/);
    const type = rest.join(' ').replace(/^\((.*)\)$/, '$1');
    if (m[3] !== undefined || cls === 'Num' || cls === 'Fractional') {
      return out('type', `A number is used here where ${article(type)} \`${type}\` is needed.`,
        isText(type) ? 'Tip: Put text in double quotes, or turn a number into text with `show`.' : null);
    }
    if (/->/.test(type)) return out('type', `A function can't be ${verb(cls)}.`, 'Tip: Is the function missing an argument?');
    return out('type', `\`${type}\` has no \`${cls}\` instance, so it can't be ${verb(cls)}.`,
      ['Show', 'Eq', 'Ord', 'Enum', 'Bounded'].includes(cls)
        ? `Tip: Add \`deriving (${cls === 'Ord' ? 'Eq, Ord' : cls})\` to the end of its \`data\` declaration, or write \`instance ${cls} ${type.split(' ')[0]} where …\`.`
        : `Tip: Write \`instance ${cls} ${type.split(' ')[0]} where …\` with the methods it needs.`);
  }
  if ((m = main.match(/^Ambiguous type variable ‘([^’]+)’/))) {
    return out('type', "Haskell can't work out which type to use here.", 'Tip: Add a type annotation, like `(read s :: Int)`.');
  }
  if ((m = main.match(/^Occurs check: cannot construct the infinite type: (.+)/))) {
    return out('type', `The types here would have to be infinite (\`${m[1].trim()}\`), so something doesn't fit.`,
      'Tip: Often a list is used where a single item is expected, or the other way round.');
  }
  if ((m = main.match(/^The equation\(s\) for ‘([^’]+)’ have (\w+) arguments?,\s*but its type ‘([^’]+)’ has only (\w+)/s))) {
    return out('type', `The equations for \`${m[1]}\` take ${m[2]} argument${m[2] === 'one' ? '' : 's'}, but its type \`${m[3]}\` only has ${m[4]}.`);
  }
  if ((m = main.match(/^Equations for ‘([^’]+)’ have different numbers of arguments/))) {
    return out('type', `The equations for \`${m[1]}\` have different numbers of arguments.`, 'Tip: Every equation of a function needs the same number of arguments.');
  }
  if ((m = main.match(/^Expecting (\w+) more arguments? to ‘([^’]+)’/))) {
    return out('type', `\`${m[2]}\` needs a type argument here, like \`${m[2]} Int\`.`);
  }
  if ((m = main.match(/^Couldn't match kind/))) return out('type', firstLine(main));
  return out('type', firstLine(main));
}

function verb(cls: string): string {
  return ({ Show: 'shown', Eq: 'compared with `==`', Ord: 'compared or sorted', Foldable: 'folded over', Functor: 'mapped over with `fmap`' } as Record<string, string>)[cls] ?? `used as ${article(cls)} \`${cls}\``;
}
const firstLine = (s: string) => s.split('\n')[0].trim();

/** A compiler message as the game's Diagnostic. `mapLine` turns GHC's line into the player's. */
export function compileDiagnostic(msg: GhcMessage | null, phase: string, mapLine: (n: number) => number | null, fallback = ''): Diagnostic {
  if (!msg) {
    return { kind: 'internal', message: "GHC couldn't compile this program, and didn't say why." + (fallback ? '\n' + fallback.slice(0, 500) : ''), line: null };
  }
  const { message, kind } = explainCompile(msg.body);
  const line = msg.line != null ? mapLine(msg.line) : null;
  return { kind: phase === 'parse' ? 'parse' : kind, message: (line ? `Line ${line}: ` : '') + message, line };
}

// ---------- run time ----------

/** Text an exception left on stderr (or in a test result) → a sentence for the player. */
export function explainRuntime(text: string, program = true): { message: string; kind: DiagnosticKind } {
  let t = text.replace(/\r\n?/g, '\n').trim();
  if (program) t = t.replace(/^[\w.-]+: /, ''); // "htown: " from the top-level handler
  const stack = t.match(/\n(CallStack \(from HasCallStack\):|HasCallStack backtrace:)[\s\S]*$/)?.[0] ?? '';
  t = t.slice(0, t.length - stack.length).trim();
  const fromError = /^\s*error, called at/m.test(stack);
  let m: RegExpMatchArray | null;
  const runtime = (message: string) => ({ kind: 'runtime' as const, message });
  const loop = (message: string) => ({ kind: 'loop' as const, message });

  if (t === '@@timeout') return loop('This took too long, so Haskell Town stopped it. It might be stuck in an endless loop: check that every recursive call gets closer to a base case.');
  if (/\(deferred type error\)\s*$/.test(t)) {
    const msg = parseMessages(t.replace(/\(deferred type error\)\s*$/, ''))[0];
    return { kind: 'type', message: explainCompile(msg?.body ?? t).message };
  }
  if ((m = t.match(/^Prelude\.(head|tail|last|init|foldr1|foldl1|cycle): empty list/)) || (m = t.match(/^(maximum|minimum|foldr1|foldl1)\b.*empty structure/))) {
    return runtime(`\`${m[1]}\` was called on an empty list — there's nothing there to take!`);
  }
  if (/Prelude\.!!: index too large/.test(t)) return runtime('`!!` was given an index past the end of the list (counting starts at 0).');
  if (/Prelude\.!!: negative index/.test(t)) return runtime('`!!` needs an index of 0 or more.');
  if (/^Prelude\.undefined/.test(t)) return runtime("Reached `undefined` — this part of the function hasn't been written yet. Replace undefined with your own code!");
  if ((m = t.match(/Non-exhaustive patterns in function (\S+)/))) {
    return runtime(tidy(`None of the equations for \`${m[1].replace(/\.$/, '')}\` match the input. Is there a case you haven't covered yet, like the empty list \`[]\`?`));
  }
  if ((m = t.match(/Non-exhaustive guards in function (\S+)/))) {
    return runtime(tidy(`None of the guards in \`${m[1]}\` were True. Tip: end the guards with \`| otherwise = …\`.`));
  }
  if (/Non-exhaustive patterns in (case|\\case|lambda)/.test(t)) return runtime("None of the patterns match this value. Is there a case you haven't covered yet?");
  if ((m = t.match(/Non-exhaustive patterns in (.+)/))) return runtime(tidy(`A pattern didn't match: ${m[1]}.`));
  if ((m = t.match(/Irrefutable pattern failed for pattern (.+)/))) return runtime(tidy(`The pattern \`${m[1].trim()}\` didn't match.`));
  if (/divide by zero/.test(t)) return runtime('Division by zero!');
  if (/^stack overflow/.test(t)) return loop('Your function kept calling itself and never reached an end. Check that there is a base case (like f [] = …) and that each recursive call works on a smaller input.');
  if (/heap overflow/.test(t)) return loop('Your program used more memory than Haskell Town allows. Is it building an endless list, or keeping far more than it needs?');
  if (/<<loop>>/.test(t)) return loop('A value here is defined in terms of itself, so it can never be worked out.');
  if (/Prelude\.read: no parse/.test(t)) return runtime("`read` couldn't turn the text into a value of the type you asked for.\nTip: Check the input, and say which type you want, like `read s :: Int`.");
  if (/hGetLine: end of file|getLine: end of file|hGetContents.*end of file/.test(t)) return runtime('getLine found no more input — the program asked for more lines than were typed in.');
  if (/Prelude\.chr: bad argument/.test(t)) return runtime("`chr` was given a number that isn't a character code.");
  if ((m = t.match(/digitToInt: not a digit (.+)/))) return runtime(`digitToInt: ${m[1]} is not a digit.`);
  if (fromError) return runtime(`error: ${t}`);
  return runtime(tidy(t || 'The program stopped with an error.'));
}

export function runtimeDiagnostic(text: string, program = true): Diagnostic {
  const { message, kind } = explainRuntime(text, program);
  return { kind, message, line: null };
}

/** GHC's `show` writes non-ASCII characters as escapes ("Ana \183 class"); the game shows them as they are. */
export function prettyShow(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && !inStr) { inStr = true; out += c; continue; }
    if (!inStr) {
      // a Char literal: '\183'
      const ch = s.slice(i).match(/^'\\(\d+)'/);
      if (ch && +ch[1] >= 160) { out += `'${String.fromCodePoint(+ch[1])}'`; i += ch[0].length - 1; continue; }
      out += c;
      continue;
    }
    if (c === '"') { inStr = false; out += c; continue; }
    if (c === '\\') {
      const d = s.slice(i + 1).match(/^\d+/);
      if (d && +d[0] >= 160 && +d[0] <= 0x10ffff) {
        out += String.fromCodePoint(+d[0]);
        i += d[0].length;
        if (s.startsWith('\\&', i + 1)) i += 2;
        continue;
      }
      out += c + (s[i + 1] ?? '');
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** Names GHC says are ambiguous, and whether the program itself defines one of the candidates. */
export function ambiguities(msgs: GhcMessage[]): { name: string; local: boolean; town: boolean }[] {
  return msgs.flatMap(m => {
    const a = m.body.match(/Ambiguous occurrence ‘([^’]+)’/);
    return a ? [{ name: a[1], local: /defined at/.test(m.body), town: /HTown\.Prelude/.test(m.body) }] : [];
  });
}
