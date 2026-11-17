// Glaschu's library and map room: Data.Map and Data.Set, used qualified (import qualified Data.Map as Map).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';
import type { Checkable } from '../src/content/types.ts';

const runner = new BrowserRunner();
const PROGRAM = `
import qualified Data.Map as Map
import qualified Data.Set as Set
import Data.Map (Map)

data Shelf = Low | Middle | High deriving (Show, Eq, Ord)

catalogue :: Map String Int
catalogue = Map.fromList [("Kidnapped", 3), ("Ivanhoe", 1), ("Rob Roy", 2)]

wordCount :: String -> Map String Int
wordCount = foldr (\\w -> Map.insertWith (+) w 1) Map.empty . words

borrow :: String -> Map String Int -> Map String Int
borrow = Map.adjust (subtract 1)

shelves :: Map.Map Shelf [String]
shelves = Map.fromListWith (++) [(High, ["Ivanhoe"]), (Low, ["Kidnapped"]), (High, ["Rob Roy"])]

trails :: Map String [String]
trails = Map.fromList [("Station", ["Loch", "Forge"]), ("Loch", ["Pass"]), ("Forge", ["Pass", "Loch"]), ("Pass", []), ("Bothy", ["Pass"])]

reachable :: String -> Set.Set String
reachable start = go [start] Set.empty
  where
    go [] seen = seen
    go (x:xs) seen
      | x \`Set.member\` seen = go xs seen
      | otherwise = go (Map.findWithDefault [] x trails ++ xs) (Set.insert x seen)
`;

const evaluate = (expr: string, src = PROGRAM) => runner.evaluate(src, expr, '');
const value = async (expr: string, src = PROGRAM) => {
  const r = await evaluate(expr, src);
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const typeOf = async (expr: string, src = PROGRAM) => {
  const r = await evaluate(expr, src);
  assert.ok(r.status === 'evaluated', `${expr}: ${JSON.stringify(r)}`);
  return r.type;
};
const runtimeError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'evaluated' && r.runtimeError, `${expr} should fail when it runs: ${JSON.stringify(r)}`);
  return r.runtimeError.message;
};
const exprError = async (expr: string, src = PROGRAM) => {
  const r = await evaluate(expr, src);
  assert.ok(r.status === 'expr-error', `${expr} should not type-check: ${JSON.stringify(r)}`);
  return r.error.message;
};
const compileError = async (src: string) => {
  const r = await evaluate('0', src);
  assert.ok(r.status === 'compile-error', `should not compile: ${JSON.stringify(r)}`);
  return r.error.message;
};

describe('Data.Map', () => {
  test('fromList, lookup, insert, member, size, and showing a Map as GHC does', async () => {
    assert.equal(await value('catalogue'), 'fromList [("Ivanhoe",1),("Kidnapped",3),("Rob Roy",2)]');
    assert.equal(await value('Map.lookup "Ivanhoe" catalogue'), 'Just 1');
    assert.equal(await value('Map.lookup "Waverley" catalogue'), 'Nothing');
    assert.equal(await value('Map.insert "Waverley" 5 catalogue'), 'fromList [("Ivanhoe",1),("Kidnapped",3),("Rob Roy",2),("Waverley",5)]');
    assert.equal(await value('Map.insert "Ivanhoe" 9 catalogue Map.! "Ivanhoe"'), '9');
    assert.equal(await value('(Map.member "Rob Roy" catalogue, Map.size catalogue, Map.null Map.empty)'), '(True,3,True)');
    assert.equal(await value('Map.fromList [(2, \'b\'), (1, \'a\'), (2, \'c\')]'), "fromList [(1,'a'),(2,'c')]"); // the last one wins
    assert.equal(await value('Just (Map.singleton 1.5 "x")'), 'Just (fromList [(1.5,"x")])');
    assert.equal(await value('Map.empty :: Map Int Int'), 'fromList []');
  });
  test('the library\'s types', async () => {
    assert.equal(await typeOf('catalogue'), 'Map String Int');
    assert.equal(await typeOf('Map.insertWith'), 'Ord b => (a -> a -> a) -> b -> a -> Map b a -> Map b a');
    assert.equal(await typeOf('Map.toList catalogue'), '[(String, Int)]');
    assert.equal(await typeOf('reachable'), 'String -> Set String');
  });
  test('updating: insertWith, adjust, alter, update, delete', async () => {
    assert.equal(await value('wordCount "the loch the pass the loch"'), 'fromList [("loch",2),("pass",1),("the",3)]');
    assert.equal(await value('borrow "Kidnapped" catalogue Map.! "Kidnapped"'), '2');
    assert.equal(await value('borrow "Waverley" catalogue == catalogue'), 'True');
    assert.equal(await value('Map.alter (fmap (* 10)) "Rob Roy" catalogue Map.!? "Rob Roy"'), 'Just 20');
    assert.equal(await value('Map.alter (const (Just 7)) "New" catalogue Map.!? "New"'), 'Just 7');
    assert.equal(await value('Map.keys (Map.update (\\n -> if n > 1 then Just n else Nothing) "Ivanhoe" catalogue)'), '["Kidnapped","Rob Roy"]');
    assert.equal(await value('Map.keys (Map.delete "Kidnapped" catalogue)'), '["Ivanhoe","Rob Roy"]');
    assert.equal(await value('shelves'), 'fromList [(Low,["Kidnapped"]),(High,["Rob Roy","Ivanhoe"])]'); // your own Ord, and fromListWith f new old
  });
  test('a long count with insertWith does not pile up', async () => {
    assert.equal(await value('Map.toList (foldl (\\m x -> Map.insertWith (+) (x `mod` 3) 1 m) Map.empty [1..30000])'), '[(0,10000),(1,10000),(2,10000)]');
  });
  test('folds, maps and filters', async () => {
    assert.equal(await value('Map.foldrWithKey (\\k v acc -> k ++ "=" ++ show v ++ ";" ++ acc) "" catalogue'), '"Ivanhoe=1;Kidnapped=3;Rob Roy=2;"');
    assert.equal(await value('Map.foldr (+) 0 catalogue'), '6');
    assert.equal(await value('Map.elems (Map.map (* 2) catalogue)'), '[2,6,4]');
    assert.equal(await value('Map.keys (Map.filter (> 1) catalogue)'), '["Kidnapped","Rob Roy"]');
    assert.equal(await value('Map.toList (Map.mapWithKey (\\k v -> length k + v) catalogue)'), '[("Ivanhoe",8),("Kidnapped",12),("Rob Roy",9)]');
    assert.equal(await value('Map.lookupMin catalogue'), 'Just ("Ivanhoe",1)');
    assert.equal(await value('Map.findMax catalogue'), '("Rob Roy",2)');
    assert.equal(await value('fst (Map.partition even catalogue)'), 'fromList [("Rob Roy",2)]');
  });
  test('combining Maps: union is left-biased, and <> is union', async () => {
    const other = '(Map.fromList [("Ivanhoe", 100), ("Waverley", 4)])';
    assert.equal(await value(`Map.union catalogue ${other} Map.! "Ivanhoe"`), '1');
    assert.equal(await value(`Map.toList (Map.unionWith (+) catalogue ${other})`), '[("Ivanhoe",101),("Kidnapped",3),("Rob Roy",2),("Waverley",4)]');
    assert.equal(await value(`Map.keys (Map.intersection catalogue ${other})`), '["Ivanhoe"]');
    assert.equal(await value(`Map.keys (catalogue Map.\\\\ ${other})`), '["Kidnapped","Rob Roy"]');
    assert.equal(await value(`Map.size (catalogue <> ${other})`), '4');
    assert.equal(await value('mconcat [Map.singleton 1 "a", Map.singleton 2 "b"] == Map.fromList [(2, "b"), (1, "a")]'), 'True');
  });
  test('a Map is Foldable over its values, a Functor and a Traversable', async () => {
    assert.equal(await value('(sum catalogue, length catalogue, maximum catalogue, elem 3 catalogue)'), '(6,3,3,True)');
    assert.equal(await value('fmap show catalogue Map.! "Kidnapped"'), '"3"');
    assert.equal(await value('traverse (\\n -> if n > 0 then Just n else Nothing) catalogue == Just catalogue'), 'True');
    assert.equal(await value('traverse (\\n -> if n > 1 then Just n else Nothing) catalogue'), 'Nothing');
  });
  test('Maps compare like their toList', async () => {
    assert.equal(await value('Map.fromList [(1, "a")] < Map.fromList [(1, "b")]'), 'True');
    assert.equal(await value('Map.fromList [(1, 2), (3, 4)] == Map.fromList [(3, 4), (1, 2)]'), 'True');
  });
  test('friendly runtime errors', async () => {
    assert.match(await runtimeError('catalogue Map.! "Waverley"'), /Map\.!: there's no key "Waverley" in this map/);
    assert.match(await runtimeError('Map.findMin (Map.empty :: Map Int Int)'), /Map\.findMin: the map is empty/);
  });
  test('type errors', async () => {
    assert.match(await exprError('Map.insert 1 "x" catalogue'), /3rd argument of `Map\.insert`[\s\S]*Expected: Map a number String\n  Found:    Map String Int/);
    assert.match(await exprError('Map.lookp "Ivanhoe" catalogue'), /I don't know anything called `Map\.lookp`\. Did you mean `Map\.lookup`\?/);
    assert.match(await exprError('Map.fromList [(id, 1)]'), /Functions can't be compared|can't be put in order/);
  });
});

describe('Data.Set', () => {
  test('a visited Set for searching the trails', async () => {
    assert.equal(await value('reachable "Forge"'), 'fromList ["Forge","Loch","Pass"]');
    assert.equal(await value('Set.size (reachable "Station")'), '4');
    assert.equal(await value('Set.member "Bothy" (reachable "Station")'), 'False');
  });
  test('fromList, insert, delete, union, intersection, difference, map, filter', async () => {
    assert.equal(await value('Set.fromList [3, 1, 2, 3, 1]'), 'fromList [1,2,3]');
    assert.equal(await value('Set.fromList "heather"'), 'fromList "aehrt"');
    assert.equal(await value('Set.toList (Set.insert 0 (Set.delete 2 (Set.fromList [1, 2, 3])))'), '[0,1,3]');
    assert.equal(await value('Set.union (Set.fromList [1, 2]) (Set.fromList [2, 3])'), 'fromList [1,2,3]');
    assert.equal(await value('Set.intersection (Set.fromList [1, 2]) (Set.fromList [2, 3])'), 'fromList [2]');
    assert.equal(await value('Set.difference (Set.fromList [1, 2]) (Set.fromList [2, 3])'), 'fromList [1]');
    assert.equal(await value('Set.map (`div` 2) (Set.fromList [1, 2, 3, 4])'), 'fromList [0,1,2]');
    assert.equal(await value('Set.filter odd (Set.fromList [1 .. 6])'), 'fromList [1,3,5]');
    assert.equal(await value('Set.isSubsetOf (Set.fromList [1]) (Set.fromList [1, 2])'), 'True');
    assert.equal(await value('Map.keysSet catalogue'), 'fromList ["Ivanhoe","Kidnapped","Rob Roy"]');
    assert.equal(await value('Set.empty <> Set.singleton \'x\''), "fromList \"x\"");
  });
  test('a Set is Foldable', async () => {
    assert.equal(await value('(sum (Set.fromList [1, 1, 2]), length (Set.fromList "aab"), foldr (:) [] (Set.fromList [2, 1]))'), '(3,2,[1,2])');
  });
});

describe('imports', () => {
  test('any alias works, as do the full module names and Data.Map.Strict', async () => {
    const src = 'import qualified Data.Map.Strict as M\nimport qualified Data.Set as S\nm :: M.Map Int String\nm = M.fromList [(1, "one")]\n';
    assert.equal(await value('M.lookup 1 m', src), 'Just "one"');
    assert.equal(await value('S.toList (M.keysSet m)', src), '[1]');
    assert.equal(await value('Data.Map.size m', src), '1');
    assert.equal(await typeOf('m', src), 'Map Int String');
  });
  test('Map. and Set. work even without an import line, like the rest of the library', async () => {
    assert.equal(await value('Map.size (Map.fromList [(1, 1)])', 'x = 1\n'), '1');
    assert.equal(await value('Set.toList (Set.fromList "abba")', 'x = 1\n'), '"ab"');
  });
  test('import Data.Map (Map, fromList, (!)) brings those names in unqualified', async () => {
    const src = 'import Data.Map (Map, fromList, (!))\ncodes :: Map Char Int\ncodes = fromList (zip "abc" [1 ..])\n';
    assert.equal(await value('codes ! \'b\'', src), '2');
    assert.match(await compileError('import Data.Map (frmList)\nx = 1\n'), /Data\.Map doesn't have anything called `frmList`/);
  });
  test('qualified names of the always-loaded modules are the Prelude\'s', async () => {
    const src = 'import qualified Data.Char as C\nimport qualified Data.List as L\nshout :: String -> String\nshout = map C.toUpper\n';
    assert.equal(await value('L.sort (shout "loch")', src), '"CHLO"');
    assert.equal(await value('Data.Maybe.fromMaybe 0 Nothing', src), '0');
  });
  test('friendly errors', async () => {
    assert.match(await compileError('import Data.Map\nx = 1\n'), /import qualified Data\.Map as Map/);
    assert.match(await compileError('x = M.insert 1 2 M.empty\n'), /I don't know a module called `M` \(in `M\.insert`\)[\s\S]*import qualified Data\.Map as M/);
    assert.match(await compileError('import qualified Data.Text as T\nx = T.pack "a"\n'), /doesn't have the module Data\.Text/);
    assert.match(await compileError('data Map = Map Int\n'), /already a type called `Map` \(the one from Data\.Map\)/);
  });
  test('ranges and composition of constructors still work', async () => {
    const src = 'data Day = Mon | Tue | Wed deriving (Show, Eq, Ord, Enum, Bounded)\n';
    assert.equal(await value('[Mon..Wed]', src), '[Mon,Tue,Wed]');
    assert.equal(await value('(Just . succ) Mon', src), 'Just Tue');
  });
  test('a challenge signature can mention Map', async () => {
    const c = { fn: 'wordCount', sig: 'wordCount :: String -> Map.Map String Int', tests: [['wordCount "a b a"', 'Map.fromList [("a", 2), ("b", 1)]']] } as unknown as Checkable;
    const r = await runner.check(c, PROGRAM);
    assert.ok(r.status === 'tested' && r.passed, JSON.stringify(r));
    const wrong = { ...c, sig: 'wordCount :: String -> Map.Map String Bool' } as Checkable;
    assert.equal((await runner.check(wrong, PROGRAM)).status, 'signature-mismatch');
  });
  test('main can print a Map', async () => {
    const r = await runner.runMain(PROGRAM + 'main :: IO ()\nmain = do\n  print (Map.toList catalogue)\n  mapM_ print (Set.fromList [2, 1])\n', '');
    assert.ok(r.status === 'ran', JSON.stringify(r));
    assert.equal(r.output.out, '[("Ivanhoe",1),("Kidnapped",3),("Rob Roy",2)]\n1\n2\n');
  });
});
