// Glaschu's post office: record update syntax p { street = s } and record patterns f (Letter { to = t }).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
data Address = Address { street :: String, town :: String } deriving (Show, Eq)
data Letter = Letter { to :: Address, from :: String, stamps :: Int } deriving Show
data Shape = Circle { radius :: Double } | Rect { w :: Double, h :: Double } deriving Show

home :: Address
home = Address { street = "Mill Lane", town = "Glaschu" }

letter :: Letter
letter = Letter { to = home, from = "Wren", stamps = 2 }

move :: String -> Address -> Address
move s p = p { street = s }

townOf :: Letter -> String
townOf (Letter { to = Address { town = t } }) = t

sender :: Letter -> String
sender Letter { from } = from

paid :: Letter -> Bool
paid Letter { stamps = 0 } = False
paid _ = True

kind :: Shape -> String
kind s = case s of
  Circle {} -> "round"
  Rect { w = a, h = b } | a == b -> "square"
                        | otherwise -> "box"

area :: Shape -> Double
area Circle { radius = r } = 3 * r * r
area Rect { h = y, w = x } = x * y

firstTown :: [Letter] -> String
firstTown (Letter { to = Address { town = t } } : _) = t
firstTown [] = "none"
`;

const evaluate = (expr: string, src = PROGRAM) => runner.evaluate(src, expr, '');
const value = async (expr: string, src = PROGRAM) => {
  const r = await evaluate(expr, src);
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const exprError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'expr-error', `${expr} should not type-check: ${JSON.stringify(r)}`);
  return r.error.message;
};
const compileError = async (def: string) => {
  const r = await evaluate('0', PROGRAM + def + '\n');
  assert.ok(r.status === 'compile-error', `${def} should not compile: ${JSON.stringify(r)}`);
  return r.error.message;
};

describe('record update', () => {
  test('changes only the named fields', async () => {
    assert.equal(await value('move "High Street" home'), 'Address {street = "High Street", town = "Glaschu"}');
    assert.equal(await value('home { street = "A", town = "B" }'), 'Address {street = "A", town = "B"}');
    assert.equal(await value('home == home { town = "Glaschu" }'), 'True');
  });
  test('binds tighter than function application, and can be chained or nested', async () => {
    assert.equal(await value('paid letter { stamps = 0 }'), 'False');
    assert.equal(await value('home { street = "A" } { town = "T" }'), 'Address {street = "A", town = "T"}');
    assert.equal(await value('Circle { radius = 2 } { radius = 3 }'), 'Circle {radius = 3.0}');
    assert.equal(await value('townOf letter { to = (to letter) { town = "Oban" } }'), '"Oban"');
  });
  test('a field the value\'s constructor lacks fails when it runs', async () => {
    const r = await evaluate('(Circle 1) { w = 2 }');
    assert.ok(r.status === 'evaluated' && r.runtimeError, JSON.stringify(r));
    assert.match(r.runtimeError.message, /no field `w`/);
  });
  test('friendly type errors', async () => {
    assert.match(await exprError('home { street = "A", street = "B" }'), /`street` is given twice/);
    assert.match(await exprError('home { radius = 1 }'), /an Address has no field called `radius` \(that's a field of Shape\)\. An Address's fields are: street, town/);
    assert.match(await exprError('home { street = "A", stamps = 1 }'), /`street` is a field of Address but `stamps` is a field of Letter/);
    assert.match(await exprError('(Circle 1) { radius = 2, w = 1 }'), /no constructor of Shape has all of the fields `radius`, `w`/);
    assert.match(await exprError('home { street = 3 }'), /field `street`[\s\S]*Expected: String/);
    assert.match(await exprError('home { nope = 1 }'), /don't know a record field called `nope`/);
  });
});

describe('record patterns', () => {
  test('match named fields, in any order, nested and inside other patterns', async () => {
    assert.equal(await value('townOf letter'), '"Glaschu"');
    assert.equal(await value('map area [Circle 1, Rect 2 3]'), '[3.0,6.0]');
    assert.equal(await value('firstTown [letter]'), '"Glaschu"');
    assert.equal(await value('paid letter'), 'True');
  });
  test('field puns and Con {}', async () => {
    assert.equal(await value('sender letter'), '"Wren"');
    assert.equal(await value('map kind [Circle 1, Rect 2 2, Rect 1 3]'), '["round","square","box"]');
  });
  test('work in lambdas, case and <-', async () => {
    assert.equal(await value('(\\Address { town = t } -> t) home'), '"Glaschu"');
    assert.equal(await value('case letter of Letter { stamps = n } -> n + 1'), '3');
    assert.equal(await value('[s | Address { street = s } <- [home, move "Quay" home]]'), '["Mill Lane","Quay"]');
  });
  test('only look at the fields they name', async () => {
    assert.equal(await value('sender (Letter undefined "Fern" undefined)'), '"Fern"');
  });
  test('friendly errors', async () => {
    assert.match(await compileError('f (Address { nope = x }) = x'), /`Address` has no field called `nope`\. Its fields are: street, town/);
    assert.match(await compileError('f (Address { town = x, town = y }) = x'), /`town` appears twice in this pattern/);
    assert.match(await compileError('data P = P Int Int\nf (P { a = x }) = x'), /`P` wasn't defined with named fields/);
    assert.match(await compileError('f (Address { town = 3 }) = 1'), /field `town` in this Address pattern[\s\S]*Expected: String/);
    assert.match(await compileError('f Address {..} = 1'), /RecordWildCards/);
  });
});
