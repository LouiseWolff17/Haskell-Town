// Glaschu's bakehouse: deriving (Enum, Bounded), succ / pred / minBound / maxBound / fromEnum / toEnum, and ranges of your own types.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
data Day = Mon | Tue | Wed | Thu | Fri | Sat | Sun deriving (Show, Eq, Ord, Enum, Bounded)

allDays :: [Day]
allDays = [minBound .. maxBound]

tomorrow :: Day -> Day
tomorrow d = if d == maxBound then minBound else succ d

weekend :: [Day]
weekend = [Sat ..]
`;

const evaluate = (expr: string, src = PROGRAM) => runner.evaluate(src, expr, '');
const value = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const runtimeError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'evaluated' && r.runtimeError, `${expr} should fail when it runs: ${JSON.stringify(r)}`);
  return r.runtimeError.message;
};
const typeError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'expr-error' && r.error, `${expr} should be a type error: ${JSON.stringify(r)}`);
  return r.error.message;
};
const compileError = async (src: string) => {
  const r = await evaluate('1', src);
  assert.ok(r.status === 'compile-error' && r.error, `should not compile: ${JSON.stringify(r)}`);
  return r.error.message;
};

describe('deriving (Enum, Bounded)', () => {
  const cases: [string, string][] = [
    ['allDays', '[Mon,Tue,Wed,Thu,Fri,Sat,Sun]'],
    ['weekend', '[Sat,Sun]'],
    ['tomorrow Tue', 'Wed'],
    ['tomorrow Sun', 'Mon'],
    ['succ Mon', 'Tue'],
    ['pred Sun', 'Sat'],
    ['minBound :: Day', 'Mon'],
    ['maxBound :: Day', 'Sun'],
    ['[Tue .. Thu]', '[Tue,Wed,Thu]'],
    ['[Mon, Wed ..]', '[Mon,Wed,Fri,Sun]'],
    ['[Sun, Fri ..]', '[Sun,Fri,Wed,Mon]'],
    ['[Fri, Thu .. Tue]', '[Fri,Thu,Wed,Tue]'],
    ['[Sun .. Mon]', '[]'],
    ['fromEnum Wed', '2'],
    ['toEnum 4 :: Day', 'Fri'],
    ['map fromEnum allDays', '[0,1,2,3,4,5,6]'],
    ['length ([minBound .. maxBound] :: [Day])', '7'],
    ['enumFromTo Tue Thu', '[Tue,Wed,Thu]'],
    ["zip ['a'..] allDays", "[('a',Mon),('b',Tue),('c',Wed),('d',Thu),('e',Fri),('f',Sat),('g',Sun)]"],
    ['[d | d <- allDays, d > Fri]', '[Sat,Sun]'],
  ];
  for (const [expr, want] of cases) test(expr, async () => assert.equal(await value(expr), want));

  test('the built-in Enum and Bounded types', async () => {
    assert.equal(await value('succ 1'), '2');
    assert.equal(await value("succ 'a'"), "'b'");
    assert.equal(await value("pred 'b'"), "'a'");
    assert.equal(await value('succ False'), 'True');
    assert.equal(await value('[LT ..]'), '[LT,EQ,GT]');
    assert.equal(await value('[False ..]'), '[False,True]');
    assert.equal(await value('(minBound, maxBound) :: (Bool, Ordering)'), '(False,GT)');
    assert.equal(await value('minBound :: Char'), "'\\NUL'");
    assert.equal(await value('toEnum 65 :: Char'), "'A'");
    assert.equal(await value("fromEnum 'a'"), '97');
    assert.equal(await value('maxBound :: Int'), String(Number.MAX_SAFE_INTEGER));
  });

  test('succ of the last value and pred of the first are friendly errors', async () => {
    assert.match(await runtimeError('succ Sun'), /Sun is the last Day/);
    assert.match(await runtimeError('pred Mon'), /Mon is the first Day/);
    assert.match(await runtimeError('succ True'), /True is the last Bool/);
    assert.match(await runtimeError('toEnum 9 :: Day'), /only has 7 values, numbered 0 to 6/);
  });

  test('type errors point at the missing deriving', async () => {
    const src = 'data Bread = Rye | Spelt deriving Show\nloaves = [Rye ..]';
    assert.match(await compileError(src), /Add `deriving \(Enum\)`/);
    assert.match(await compileError('data Bread = Rye | Spelt deriving (Show, Enum)\nbest = maxBound :: Bread'), /deriving \(Bounded\)/);
    assert.match(await typeError('succ "a"'), /single quotes/);
    assert.match(await typeError('maxBound :: String'), /smallest and a largest/);
    assert.match(await compileError('f :: a -> a\nf x = succ x'), /Add `Enum a =>`/);
  });

  test('only plain lists of names can derive Enum or Bounded', async () => {
    assert.match(await compileError('data Loaf = Loaf Int | Crumb deriving (Enum)'), /`Loaf` holds a value/);
    assert.match(await compileError('data Loaf = Loaf Int deriving (Bounded)'), /can't derive Bounded/);
    assert.match(await compileError('data Loaf = Rye deriving (Functor)'), /Show, Eq, Ord, Enum and Bounded/);
  });

  test('minBound without a known type asks for an annotation', async () => {
    assert.match(await runtimeError('minBound'), /\(minBound :: Day\)/);
  });
});
