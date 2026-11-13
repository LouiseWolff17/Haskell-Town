// The parts of the GHC service (server/) that don't need GHC: getting the source ready,
// and turning GHC's messages into the game's. The service itself runs in CI's `ghc` job.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildModule, prepare } from '../server/source.ts';
import type { Program } from '../server/source.ts';
import { ambiguities, compileDiagnostic, explainRuntime, parseMessages, prettyShow } from '../server/diagnostics.ts';

const program = (src: string): Program => {
  const p = prepare(src);
  assert.ok(p.ok, 'should be accepted');
  return p.program;
};
const NO_HIDING = { prelude: [], town: [] };

describe('preparing the source', () => {
  test('a header is added, and lines map back to the player\'s', () => {
    const m = buildModule(program('add :: Int -> Int -> Int\nadd x y = x + y\n'), { name: 'Player', hide: NO_HIDING });
    const lines = m.text.split('\n');
    assert.equal(lines[0], 'module Player where');
    assert.match(lines[1], /^import Prelude; import qualified Prelude; import HTown\.Prelude$/);
    assert.equal(lines[2], 'add :: Int -> Int -> Int');
    assert.deepEqual([1, 2, 3, 4].map(m.origLine), [null, null, 1, 2]);
  });

  test("the player's own header is replaced, keeping pragmas above it and the line numbers below", () => {
    const src = '{-# LANGUAGE LambdaCase #-}\nmodule Main\n  ( main\n  ) where\n\nmain = print 1\n';
    const m = buildModule(program(src), { name: 'PlayerRun', hide: NO_HIDING, harness: true });
    const lines = m.text.split('\n');
    assert.equal(lines[0], '{-# LANGUAGE LambdaCase #-}');
    assert.equal(lines[1], 'module PlayerRun where');
    assert.match(lines[4], /import qualified HTown\.Harness$/);
    assert.equal(lines[6], 'main = print 1');
    assert.equal(m.origLine(7), 6);
  });

  test('names the program defines are hidden from the imports we add', () => {
    const m = buildModule(program('toList = 1\n(<+>) = 2\n'), { name: 'Player', hide: { prelude: ['toList'], town: ['toList', '<+>'] } });
    assert.match(m.text, /import Prelude hiding \(toList\); import qualified Prelude; import HTown\.Prelude hiding \(\(<\+>\), toList\)/);
  });

  test('a program that imports Prelude itself keeps its own import', () => {
    const m = buildModule(program('import Prelude hiding (lookup)\nlookup = 3\n'), { name: 'Player', hide: NO_HIDING });
    assert.doesNotMatch(m.text, /import Prelude;/);
  });

  test('appended declarations go in the same column as the program\'s', () => {
    const m = buildModule(program('module Main where x = 1\n                  y = 2\n'), { name: 'Player', hide: NO_HIDING, append: ['z = 3'] });
    assert.match(m.text, /\n {18}z = 3\n/);
  });

  test('unsafe pragmas and extensions are refused, with the line', () => {
    for (const [src, line] of [['{-# OPTIONS_GHC -F -pgmF sh #-}\nx = 1', 1], ['x = 1\n{-# LANGUAGE CPP #-}', 2], ['{-# language TemplateHaskell #-}', 1], ['{-# ANN module "x" #-}', 1]] as const) {
      const p = prepare(src);
      assert.ok(!p.ok && p.error.kind === 'parse' && p.error.line === line, src);
    }
    assert.ok(prepare('{-# LANGUAGE LambdaCase, NoMonomorphismRestriction #-}\nx = "{-# CPP #-}"\nc = \'"\'\n{-# INLINE x #-}\n').ok);
  });
});

describe("GHC's messages", () => {
  const out = [
    'Player.hs:4:11: error: [GHC-83865]',
    '    • Couldn\'t match expected type ‘Int’ with actual type ‘[a0]’',
    '    • In the expression: x ++ y',
    '      In an equation for ‘add’: add x y = x ++ y',
    '',
    'Player.hs:(6,1)-(7,9): error: [GHC-88464]',
    '    Variable not in scope: totl :: [Int] -> Int',
    '    Suggested fix: Perhaps use ‘total’ (line 5)',
  ].join('\n');

  test('are split up, with their places and codes', () => {
    const msgs = parseMessages(out);
    assert.deepEqual(msgs.map(m => [m.line, m.col, m.code]), [[4, 11, 'GHC-83865'], [6, 1, 'GHC-88464']]);
    assert.match(msgs[1].body, /^Variable not in scope/);
  });

  test('become short friendly diagnostics on the player\'s lines', () => {
    const [mismatch, scope] = parseMessages(out);
    const d = compileDiagnostic(mismatch, 'typecheck', n => n - 2);
    assert.equal(d.kind, 'type');
    assert.equal(d.line, 2);
    assert.match(d.message, /^Line 2: Type mismatch in `add`\.\n {2}Expected: Int\n {2}Found: {4}\[a0\]/);
    const s = compileDiagnostic(scope, 'typecheck', n => n);
    assert.equal(s.kind, 'scope');
    assert.match(s.message, /I don't know anything called `totl`\.\nTip: Did you mean `total`\?/);
  });

  test('a parse error is a parse error, and holes say what goes in them', () => {
    const [p] = parseMessages('Player.hs:3:1: error: [GHC-58481]\n    parse error (possibly incorrect indentation or mismatched brackets)\n');
    assert.equal(compileDiagnostic(p, 'parse', n => n).kind, 'parse');
    const [h] = parseMessages('Player.hs:4:11: error: [GHC-88464]\n    • Found hole: ___ :: Int\n    • In an equation for ‘add’: add x y = ___\n');
    assert.match(compileDiagnostic(h, 'typecheck', n => n).message, /still a blank \(`___`\).*an `Int`/);
  });

  test('ambiguous names are found, with where they come from', () => {
    const msgs = parseMessages('Player.hs:9:5: error: [GHC-87543]\n    Ambiguous occurrence ‘toList’.\n    It could refer to\n       either ‘HTown.Prelude.toList’, imported from ‘HTown.Prelude’ at Player.hs:2:1-30\n           or ‘Player.toList’, defined at Player.hs:12:1.\n');
    assert.deepEqual(ambiguities(msgs), [{ name: 'toList', local: true, town: true }]);
  });

  test('runtime errors read like the in-browser ones', () => {
    assert.match(explainRuntime('htown: Prelude.head: empty list\nCallStack (from HasCallStack):\n  error, called at …').message, /^`head` was called on an empty list/);
    assert.match(explainRuntime('Prelude.undefined\nCallStack (from HasCallStack):\n  undefined, called at PlayerRun.hs:2:11', false).message, /^Reached `undefined`/);
    assert.equal(explainRuntime('htown: boom\nCallStack (from HasCallStack):\n  error, called at PlayerRun.hs:2:11 in main:PlayerRun').message, 'error: boom');
    assert.equal(explainRuntime('@@timeout', false).kind, 'loop');
    assert.equal(explainRuntime('stack overflow', false).kind, 'loop');
  });

  test('shown strings keep their non-ASCII characters', () => {
    assert.equal(prettyShow('"Ana \\183 class 3"'), '"Ana · class 3"');
    assert.equal(prettyShow('["caf\\233\\&1", "a\\nb"]'), '["café1", "a\\nb"]');
  });
});

describe('more of GHC\'s messages', () => {
  test("names GHC qualifies with their package lose the package, and the game's own apostrophes survive", () => {
    const [m] = parseMessages("Main.hs:6:8: error: [GHC-39999]\n    • No instance for ‘ghc-internal-9.1003.0:Show\n                         (a0 -> a0)’\n        arising from a use of ‘HTown.Harness.showValue’\n");
    assert.equal(compileDiagnostic(m, 'typecheck', () => null).message, "A function can't be shown.\nTip: Is the function missing an argument?");
    const [s] = parseMessages("Player.hs:3:1: error: [GHC-44360]\n    • No instance for ‘Show Grade’ arising from a use of ‘print’\n");
    assert.match(compileDiagnostic(s, 'typecheck', n => n).message, /^Line 3: `Grade` has no `Show` instance, so it can't be shown\./);
  });

  test('a type without a parameter used as a Functor', () => {
    const [m] = parseMessages('Player.hs:4:18: error: [GHC-83865]\n    • Expected kind ‘* -> *’, but ‘Crate’ has kind ‘*’\n    • In the first argument of ‘Functor’, namely ‘Crate’\n');
    assert.match(compileDiagnostic(m, 'typecheck', n => n - 2).message, /^Line 2: `Crate` doesn't take a type argument/);
  });

  test('an error at the very end of the file points at the last line of code', () => {
    const m = buildModule(program('add :: Int -> Int -> Int\nadd x y = (x + y\n\n'), { name: 'Player', hide: NO_HIDING });
    const lines = m.text.split('\n').length;
    assert.equal(m.origLine(lines + 1), 2);
    const withTests = buildModule(program('x = 1\n'), { name: 'PlayerRun', hide: NO_HIDING, append: ['t = 2'] });
    assert.equal(withTests.origLine(99), null);
  });
});
