// Lazy function arguments and data fields: a value is only worked out when something needs it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
data Tree a = Leaf | Node (Tree a) a (Tree a)
data Point = Point { px :: Int, py :: Int }
data Shape = Circle Double | Rect Double Double
class Describe a where
  describe :: a -> String
  label :: a -> Int -> String
instance Describe Shape where
  describe (Circle _) = "circle"
  describe _ = "rect"
  label _ n = show n

-- an endless tree: every node n has children 2n and 2n+1
build :: Int -> Tree Int
build n = Node (build (2 * n)) n (build (2 * n + 1))

leftmost :: Int -> Tree a -> a
leftmost 0 (Node _ x _) = x
leftmost k (Node l _ _) = leftmost (k - 1) l

ignore :: a -> Int
ignore _ = 5

myIf :: Bool -> a -> a -> a
myIf True t _ = t
myIf False _ e = e

(|||) :: Bool -> Bool -> Bool
True ||| _ = True
False ||| b = b

loop :: Int
loop = loop + 1

sumTo :: Int -> Int -> Int
sumTo 0 acc = acc
sumTo n acc = sumTo (n - 1) (acc + n)

snoc :: [Int] -> [Int] -> [Int]
snoc [] acc = acc
snoc (x:xs) acc = snoc xs (acc ++ [x])

biggest :: [Int] -> Int -> Int
biggest [] m = m
biggest (x:xs) m = biggest xs (max x m)
`;
const value = async (expr: string) => {
  const r = await runner.evaluate(PROGRAM, expr, '');
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const runtimeError = async (expr: string) => {
  const r = await runner.evaluate(PROGRAM, expr, '');
  assert.ok(r.status === 'evaluated' && r.runtimeError, `${expr} should fail: ${JSON.stringify(r)}`);
  return r.runtimeError.message;
};

describe('laziness', () => {
  const cases: [string, string][] = [
    ['const 1 undefined', '1'],
    ['ignore undefined', '5'],
    ['ignore loop', '5'],
    ['flip const undefined 3', '3'],
    ['(\\_ -> 4) undefined', '4'],
    ['myIf True 1 undefined', '1'],
    ['True ||| undefined', 'True'],
    ['fst (1, undefined)', '1'],
    ['snd (undefined, 2)', '2'],
    ['let x = undefined in 7', '7'],
    ['(const 1 . undefined) 3', '1'],
    ['fromMaybe undefined (Just 3)', '3'],
    ['fmap (const 2) (Just undefined)', 'Just 2'],
    ['px (Point { px = 3, py = undefined })', '3'],
    ['leftmost 10 (build 1)', '1024'],
    ['describe (Circle undefined)', '"circle"'],
    ['length [Just undefined, Nothing]', '2'],
    ['seq 1 2', '2'],
  ];
  for (const [expr, want] of cases) test(expr, async () => assert.equal(await value(expr), want));

  test('a value that is needed is still worked out', async () => {
    for (const expr of ['seq undefined 1', 'myIf False 1 undefined', 'leftmost 2 Leaf']) await runtimeError(expr);
  });

  test('a value defined by itself is reported, not run forever', async () => {
    assert.match(await runtimeError('loop'), /defined in terms of itself/);
  });

  // accumulators are worked out as they go, so they don't pile up thunks that overflow the stack
  test('accumulating parameters still recurse a thousand deep', async () => {
    assert.equal(await value('sumTo 1000 0'), '500500');
    assert.equal(await value('length (snoc [1..1000] [])'), '1000');
    assert.equal(await value('biggest [1..1000] 0'), '1000');
  });
});
