// Glaschu's dairy: unfoldr :: (b -> Maybe (a, b)) -> b -> [a], growing a list from a seed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
import Data.List (unfoldr)

countdown :: Int -> [Int]
countdown = unfoldr step
  where
    step 0 = Nothing
    step n = Just (n, n - 1)

herd :: [Int]
herd = unfoldr (\\(a, b) -> Just (a, (b, a + b))) (1, 1)

digits :: Int -> [Int]
digits = reverse . unfoldr (\\n -> if n == 0 then Nothing else Just (n \`mod\` 10, n \`div\` 10))

chunks :: Int -> [a] -> [[a]]
chunks k = unfoldr (\\xs -> if null xs then Nothing else Just (splitAt k xs))
`;

const evaluate = (expr: string, src = PROGRAM) => runner.evaluate(src, expr, '');
const value = async (expr: string, src = PROGRAM) => {
  const r = await evaluate(expr, src);
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const typeError = async (expr: string) => {
  const r = await evaluate(expr);
  assert.ok(r.status === 'expr-error' && r.error, `${expr} should be a type error: ${JSON.stringify(r)}`);
  return r.error.message;
};

describe('unfoldr', () => {
  test('stops at Nothing', async () => {
    assert.equal(await value('countdown 5'), '[5,4,3,2,1]');
    assert.equal(await value('countdown 0'), '[]');
    assert.equal(await value('digits 1234'), '[1,2,3,4]');
  });
  test('seeds of any type', async () => {
    assert.equal(await value('chunks 2 "abcde"'), '["ab","cd","e"]');
    assert.equal(await value('unfoldr (\\c -> if c > \'e\' then Nothing else Just (c, succ c)) \'a\''), '"abcde"');
  });
  test('an unfold that never stops works with take', async () => {
    assert.equal(await value('take 7 herd'), '[1,1,2,3,5,8,13]');
    assert.equal(await value('takeWhile (< 20) (unfoldr (\\n -> Just (n * n, n + 1)) 1)'), '[1,4,9,16]');
  });
  test('works without the import', async () => {
    assert.equal(await value('unfoldr (\\n -> if n > 3 then Nothing else Just (n, n + 1)) 1', ''), '[1,2,3]');
    assert.equal(await value('length (unfoldr (\\n -> if n > 3 then Nothing else Just ("moo", n + 1)) 1)', ''), '3');
  });
  test('a step that does not give a Maybe pair is a type error', async () => {
    await typeError('unfoldr (\\n -> Just n) 1');
    await typeError('unfoldr (\\n -> (n, n + 1)) 1');
  });
});
