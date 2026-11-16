// Ranges count through numbers and characters: [1..5], ['a'..'z'], ['a', 'c' ..], and nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const PROGRAM = `
letters :: String
letters = ['a'..'z']

between :: Char -> Char -> String
between a b = [a..b]

upTo :: Enum a => a -> a -> [a]
upTo x y = [x..y]
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

describe('character ranges', () => {
  const cases: [string, string][] = [
    ['letters', '"abcdefghijklmnopqrstuvwxyz"'],
    ["['A'..'E']", '"ABCDE"'],
    ["['0'..'9']", '"0123456789"'],
    ["['a', 'c' .. 'i']", '"acegi"'],
    ["['e', 'd' .. 'a']", '"edcba"'],
    ["['z'..'a']", '""'],
    ["take 3 ['x'..]", '"xyz"'],
    ["take 3 ['a', 'e' ..]", '"aei"'],
    ["between 'p' 's'", '"pqrs"'],
    ["upTo 'a' 'c'", '"abc"'],
    ['upTo 1 3', '[1,2,3]'],
    ["zip ['a'..'c'] [1..]", "[('a',1),('b',2),('c',3)]"],
    ["[c | c <- ['a'..'z'], c `elem` \"aeiou\"]", '"aeiou"'],
    ["length ['a'..'z']", '26'],
  ];
  for (const [expr, want] of cases) test(expr, async () => assert.equal(await value(expr), want));

  test('number ranges still work', async () => {
    assert.equal(await value('[1..5]'), '[1,2,3,4,5]');
    assert.equal(await value('[10, 8 .. 1]'), '[10,8,6,4,2]');
    assert.equal(await value('take 3 [0, 5 ..]'), '[0,5,10]');
    assert.equal(await value('[1.0..3.0]'), '[1.0,2.0,3.0]');
  });

  test('a range of characters has type String', async () => {
    const r = await evaluate("['a'..'c']");
    assert.ok(r.status === 'evaluated');
    assert.equal(r.type, 'String');
  });

  test('strings, booleans and mixed ranges are type errors', async () => {
    assert.match(await typeError('["a".."z"]'), /single quotes/);
    assert.match(await typeError('[True ..]'), /numbers or characters/);
    assert.match(await typeError("['a'..5]"), /Type mismatch/);
  });
});
