// A Traversable class (Alder's mountain bridge, Glaschu challenges 14–15): your own instances with traverse
// or sequenceA, and traverse / sequenceA / mapM / sequence over lists, Maybe, Either and your own types.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
data Bridge a = End | Plank a (Bridge a) deriving Show
instance Functor Bridge where
  fmap f End         = End
  fmap f (Plank x r) = Plank (f x) (fmap f r)
instance Foldable Bridge where
  foldMap f End         = mempty
  foldMap f (Plank x r) = f x <> foldMap f r
instance Traversable Bridge where
  traverse f End         = pure End
  traverse f (Plank x r) = Plank <$> f x <*> traverse f r

-- only sequenceA: traverse comes from it
data Pair a = Pair a a deriving Show
instance Functor Pair where
  fmap f (Pair a b) = Pair (f a) (f b)
instance Foldable Pair where
  foldMap f (Pair a b) = f a <> f b
instance Traversable Pair where
  sequenceA (Pair a b) = Pair <$> a <*> b

data Wrap a = Wrap a

bridge :: Bridge Int
bridge = Plank 3 (Plank 5 (Plank 2 End))

checkPlank :: Int -> Maybe Int
checkPlank w = if w > 0 then Just w else Nothing

halve :: Int -> Either String Int
halve n = if even n then Right (n \`div\` 2) else Left ("odd: " ++ show n)

willItHold :: Traversable t => t Int -> Maybe (t Int)
willItHold = traverse checkPlank

allA :: (Traversable t, Applicative f) => (a -> f b) -> t a -> f (t b)
allA = traverse

total :: Traversable t => t Int -> Int
total = sum
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
const compileError = async (src: string) => {
  const r = await runner.evaluate(src, '1', '');
  assert.ok(r.status === 'compile-error', `should not compile: ${JSON.stringify(r)}`);
  return r.error.message;
};
const BASE = 'data B a = E | P a (B a)\n';
const FUNCTOR = 'instance Functor B where\n  fmap f E = E\n';
const FOLDABLE = 'instance Foldable B where\n  foldMap f E = mempty\n';

describe('Traversable', () => {
  const cases: [string, string][] = [
    // your own instance, with traverse
    ['traverse checkPlank bridge', 'Just (Plank 3 (Plank 5 (Plank 2 End)))'],
    ['traverse checkPlank (Plank 1 (Plank 0 End))', 'Nothing'],
    ['traverse checkPlank End', 'Just End'],
    ['sequenceA (Plank (Just 1) (Plank (Just 2) End))', 'Just (Plank 1 (Plank 2 End))'],
    ['sequenceA (Plank (Just 1) (Plank Nothing End))', 'Nothing'],
    ['sequenceA (Plank [1, 2] (Plank [3] End))', '[Plank 1 (Plank 3 End),Plank 2 (Plank 3 End)]'],
    ['traverse halve (Plank 2 (Plank 3 End))', 'Left "odd: 3"'],
    ['mapM checkPlank bridge', 'Just (Plank 3 (Plank 5 (Plank 2 End)))'],
    ['sequence (Plank (Right 1) End :: Bridge (Either String Int))', 'Right (Plank 1 End)'],
    ['forM bridge checkPlank', 'Just (Plank 3 (Plank 5 (Plank 2 End)))'],
    // your own instance, with only sequenceA
    ['traverse halve (Pair 2 4)', 'Right (Pair 1 2)'],
    ['traverse halve (Pair 2 3)', 'Left "odd: 3"'],
    ['traverse (\\x -> [x, x * 10]) (Pair 1 2)', '[Pair 1 2,Pair 1 20,Pair 10 2,Pair 10 20]'],
    // code that works for any Traversable
    ['willItHold bridge', 'Just (Plank 3 (Plank 5 (Plank 2 End)))'],
    ['willItHold [1, 0]', 'Nothing'], ['willItHold (Just 4)', 'Just (Just 4)'],
    ['allA Just (End :: Bridge Int)', 'Just End'], ['allA Just (Plank 1 End)', 'Just (Plank 1 End)'],
    ['total bridge', '10'],
    // the built-in instances
    ['sequenceA [Just 1, Just 2]', 'Just [1,2]'], ['sequenceA [Just 1, Nothing]', 'Nothing'],
    ['sequenceA (Just [1, 2])', '[Just 1,Just 2]'], ['sequenceA ([] :: [Maybe Int])', 'Just []'],
    ['traverse checkPlank (Right 3 :: Either String Int)', 'Just (Right 3)'],
    ['traverse checkPlank (Left "x" :: Either String Int)', 'Just (Left "x")'],
    ['traverse checkPlank (Nothing :: Maybe Int)', 'Just Nothing'],
    ['traverse halve [2, 4, 6]', 'Right [1,2,3]'], ['sequence [[1, 2], [3]]', '[[1,3],[2,3]]'],
    ['forM [1, 2, 3] checkPlank', 'Just [1,2,3]'],
  ];
  for (const [expr, want] of cases) test(expr, async () => assert.equal(await value(expr), want));

  test('mapM in IO goes through your own type', async () => {
    const r = await evaluate('mapM (\\x -> print x >> return (x * 2)) bridge >>= print');
    assert.ok(r.status === 'evaluated');
    assert.equal(r.output?.out, '3\n5\n2\nPlank 6 (Plank 10 (Plank 4 End))\n');
  });

  test('the types say Traversable', async () => {
    const r = await evaluate('willItHold');
    assert.ok(r.status === 'evaluated');
    assert.equal(r.summary.types.willItHold, 'Traversable t => t Int -> Maybe (t Int)');
    assert.equal(r.summary.types.total, 'Traversable t => t Int -> Int');
    assert.equal(r.type, 'Traversable t => t Int -> Maybe (t Int)');
    const r2 = await evaluate('traverse checkPlank bridge');
    assert.ok(r2.status === 'evaluated');
    assert.equal(r2.type, 'Maybe (Bridge Int)');
  });

  test('things that are not containers keep the friendly list errors', async () => {
    assert.match(await typeError("traverse checkPlank 'a'"), /Expected: \[Int\]\n {2}Found: {4}Char\nTip: One of these is a list/);
    assert.match(await typeError('mapM print 5'), /2nd argument of `mapM`/);
  });

  test('a container without an instance asks for one', async () => {
    assert.match(await typeError('traverse checkPlank (Wrap 1)'), /instance Traversable Wrap where\n {4}traverse … = …/);
  });

  test('a signature has to promise Traversable', async () => {
    assert.match(await compileError('f :: t Int -> Maybe (t Int)\nf = traverse Just'), /Add `Traversable t =>`/);
  });

  test('an instance needs Functor and Foldable first, and traverse or sequenceA', async () => {
    assert.match(await compileError(BASE + 'instance Traversable B where\n  traverse f E = pure E'), /needs to be an instance of `Functor` too/);
    assert.match(await compileError(BASE + FUNCTOR + 'instance Traversable B where\n  traverse f E = pure E'), /needs to be an instance of `Foldable` too/);
    assert.match(await compileError(BASE + FUNCTOR + FOLDABLE + 'instance Traversable B'), /needs a definition of `traverse` or `sequenceA`/);
    assert.match(await compileError(BASE + FUNCTOR + FOLDABLE + 'instance Traversable B where\n  fmap f E = E'), /`fmap` isn't a method of class `Traversable`/);
  });

  test('Traversable is built in', async () => {
    assert.match(await compileError('class Traversable t where\n  traverse :: t a'), /built into Haskell Town now \(it opened with Alder's mountain bridge\)/);
  });
});
