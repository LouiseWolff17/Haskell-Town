// sum, length, elem, foldr … take any Foldable (lists, Maybe, Either, your own instances),
// and passing something that isn't a container still gets the friendly list error.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
data Tree a = Leaf | Node (Tree a) a (Tree a)
instance Foldable Tree where
  foldMap f Leaf         = mempty
  foldMap f (Node l x r) = foldMap f l <> f x <> foldMap f r

data Box = Box Int
data Wrap a = Wrap a

crates :: Tree Int
crates = Node (Node Leaf 2 Leaf) 5 (Node Leaf 9 Leaf)

total xs = sum xs + length xs

weigh :: Foldable t => t Int -> Int
weigh = sum

totalPages :: [Int] -> Int
totalPages = sum
`;

const evaluate = (expr: string) => runner.evaluate(PROGRAM, expr, '');
const value = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const typeError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'expr-error' && r.error, `${expr} should be a type error: ${JSON.stringify(r)}`);
  return r.error.message;
};

describe('Foldable-generic Prelude functions', () => {
  const cases: [string, string][] = [
    ['sum crates', '16'], ['product crates', '90'], ['length crates', '3'], ['null crates', 'False'], ['null Leaf', 'True'],
    ['elem 9 crates', 'True'], ['notElem 9 crates', 'False'], ['maximum crates', '9'], ['minimum crates', '2'],
    ['foldr (:) [] crates', '[2,5,9]'], ['foldl (-) 0 crates', '-16'], ['any even crates', 'True'], ['all (> 1) crates', 'True'],
    ['concatMap show crates', '"259"'], ['weigh crates', '16'], ['total crates', '19'],
    ['sum (Just 3)', '3'], ['length Nothing', '0'], ['concat (Just [1, 2])', '[1,2]'], ['and (Just False)', 'False'], ['or Nothing', 'False'],
    ['length (Right 3)', '1'], ['length (Left 3)', '0'], ['sum (Right 4)', '4'],
    // lists behave as before, endless ones included
    ['sum [1..10]', '55'], ['length "hello"', '5'], ['total [1, 2]', '5'], ['totalPages [10, 20]', '30'], ['weigh [1, 2, 3]', '6'],
    ['elem 5 [1..]', 'True'], ['foldr (\\x _ -> x) 0 [1..]', '1'], ['length [undefined]', '1'], ['foldr (+) 0 [1..100000]', '5000050000'],
  ];
  for (const [expr, want] of cases) test(expr, async () => assert.equal(await value(expr), want));

  test('mapM_ and friends go through any Foldable', async () => {
    const r = await evaluate('mapM_ print crates >> mapM_ print (Just 7)');
    assert.ok(r.status === 'evaluated');
    assert.equal(r.output?.out, '2\n5\n9\n7\n');
  });

  test('the types say Foldable', async () => {
    const r = await evaluate('total');
    assert.ok(r.status === 'evaluated');
    assert.equal(r.summary.types.total, 'Foldable t => t Int -> Int');
    assert.equal(r.summary.types.totalPages, '[Int] -> Int');
    assert.equal(r.type, 'Foldable t => t Int -> Int');
  });

  test('things that are not containers keep the friendly list errors', async () => {
    const tip = /Tip: One of these is a list and the other is a single value\./;
    assert.match(await typeError("length 'a'"), /Expected: \[a\]\n {2}Found: {4}Char\n/);
    assert.match(await typeError("length 'a'"), tip);
    assert.match(await typeError('sum 5'), /Expected: \[a number\]\n {2}Found: {4}a number/);
    assert.match(await typeError('elem 3 4'), /2nd argument of `elem`/);
    assert.match(await typeError('length getLine'), /Found: {4}IO String\nTip: One of these is a list/);
    assert.match(await typeError('length (1, 2)'), tip);
    assert.match(await typeError('maximum True'), tip);
    assert.match(await typeError('sum (Box 1)'), tip);
  });

  test('a container without an instance asks for one', async () => {
    assert.match(await typeError('length (Wrap 1)'), /instance Foldable Wrap where\n {4}foldMap … = …/);
  });

  test('a signature has to promise Foldable', async () => {
    const r = await runner.evaluate('f :: t Int -> Int\nf xs = sum xs', 'f', '');
    assert.ok(r.status === 'compile-error');
    assert.match(r.error.message, /Add `Foldable t =>`/);
  });

  test('maximum of an empty container', async () => {
    const r = await evaluate('maximum (Leaf :: Tree Int)');
    assert.ok(r.status === 'evaluated' && r.runtimeError);
    assert.match(r.runtimeError.message, /maximum was given Leaf, which holds nothing/);
  });
});
