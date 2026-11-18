// Glaschu's Town House: readLn / read, and IO loops that wait for a line each time (RunOutput.waiting).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';
import { CHALLENGES } from '../src/content/index.ts';
import type { RunOutput } from '../src/runner/types.ts';

const runner = new BrowserRunner();

const run = async (src: string, input: string): Promise<RunOutput> => {
  const r = await runner.runMain(src, input);
  assert.equal(r.status, 'ran', JSON.stringify(r));
  return r.status === 'ran' ? r.output : { out: '' };
};
const value = async (expr: string, src = '') => {
  const r = await runner.evaluate(src, expr, '');
  assert.ok(r.status === 'evaluated' && r.value !== undefined, `${expr}: ${JSON.stringify(r)}`);
  return r.value;
};
const runtimeError = async (expr: string) => {
  const r = await runner.evaluate('', expr, '');
  assert.ok(r.status === 'evaluated' && r.runtimeError, `${expr}: ${JSON.stringify(r)}`);
  return r.runtimeError.message;
};
const typeError = async (expr: string) => {
  const r = await runner.evaluate('', expr, '');
  assert.equal(r.status, 'expr-error', `${expr}: ${JSON.stringify(r)}`);
  return r.status === 'expr-error' ? r.error.message : '';
};

const MEETING = `
import Control.Monad (when, unless)

main :: IO ()
main = do
  putStrLn "The meeting is open."
  meeting 0

meeting :: Int -> IO ()
meeting total = do
  putStr "> "
  line <- getLine
  if line == "goodbye"
    then putStrLn ("Closed with " ++ show total ++ " votes.")
    else do
      let n = read line :: Int
      when (n > 10) (putStrLn "A lot of hands!")
      unless (n > 0) (putStrLn "Nobody?")
      print (total + n)
      meeting (total + n)
`;

describe('read', () => {
  test('Int, Double and Bool, as before', async () => {
    assert.equal(await value('read "42" :: Int'), '42');
    assert.equal(await value('read " -7 " + 1'), '-6');
    assert.equal(await value('read "2.5" :: Double'), '2.5');
    assert.equal(await value('read "3" :: Double'), '3.0');
    assert.equal(await value('read "True" :: Bool'), 'True');
  });

  test('Char, String, lists and tuples', async () => {
    assert.equal(await value(`read "'x'" :: Char`), "'x'");
    assert.equal(await value('read "\\"hi there\\"" :: String'), '"hi there"');
    assert.equal(await value('read "[1, 2, 3]" :: [Int]'), '[1,2,3]');
    assert.equal(await value('read "[]" :: [Int]'), '[]');
    assert.equal(await value('read "(1, True)" :: (Int, Bool)'), '(1,True)');
    assert.equal(await value('read "[(\\"a\\", 1.5)]" :: [(String, Double)]'), '[("a",1.5)]');
    assert.equal(await value('sum (read "[1,2,3]")'), '6');
  });

  test('text that does not fit the type is a friendly runtime error', async () => {
    assert.match(await runtimeError('read "abc" :: Int'), /read: "abc" isn't a valid whole number \(Int\)/);
    assert.match(await runtimeError('read "3.5" :: Int'), /isn't a valid whole number/);
    assert.match(await runtimeError('read "yes" :: Bool'), /isn't True or False/);
    assert.match(await runtimeError('read "[1,2" :: [Int]'), /isn't a valid \[Int\]/);
    assert.match(await runtimeError('read "hi" :: String'), /isn't a valid String/);
  });

  test('types it cannot read are type errors', async () => {
    assert.match(await typeError('read "Just 1" :: Maybe Int'), /`read` and `readLn` can turn text into/);
    assert.match(await typeError('(readLn :: IO (Maybe Int))'), /`read` and `readLn`/);
  });
});

describe('readLn', () => {
  test('reads a line and turns it into the type it needs', async () => {
    const src = 'main :: IO ()\nmain = do\n  n <- readLn :: IO Int\n  x <- readLn\n  print (n + 1)\n  print (x * 2.0)\n';
    assert.equal((await run(src, '41\n1.25')).out, '42\n2.5\n');
  });

  test('with no annotation a number defaults to Int', async () => {
    const src = 'main :: IO ()\nmain = do\n  n <- readLn\n  print (n * 2)\n';
    assert.equal((await run(src, '21')).out, '42\n');
  });

  test('a number whose type is only settled later (by 2.0) can have a decimal point', async () => {
    const src = 'main :: IO ()\nmain = do\n  n <- readLn\n  x <- readLn\n  let y = read "1.5"\n  print (n + 1)\n  print (x * 2.0)\n  print (y * 2.0)\n';
    assert.equal((await run(src, '41\n1.25')).out, '42\n2.5\n3.0\n');
  });

  test('a list in one line', async () => {
    const src = 'main :: IO ()\nmain = do\n  xs <- readLn :: IO [Int]\n  print (sum xs)\n';
    assert.equal((await run(src, '[1,2,3]')).out, '6\n');
  });

  test('a bad line stops the program with read\'s message', async () => {
    const src = 'main :: IO ()\nmain = do\n  putStrLn "How many?"\n  n <- readLn :: IO Int\n  print n\n';
    const o = await run(src, 'lots');
    assert.equal(o.out, 'How many?\n');
    assert.match(o.error?.message ?? '', /read: "lots" isn't a valid whole number/);
    assert.equal(o.waiting, undefined);
  });

  test('has the type Read a => IO a', async () => {
    const r = await runner.evaluate('', 'readLn', '');
    assert.ok(r.status === 'evaluated' || r.status === 'expr-error');
    const t = await runner.evaluate('', '(readLn :: IO Int)', '5');
    assert.ok(t.status === 'evaluated');
    if (t.status === 'evaluated') assert.equal(t.type, 'IO Int');
  });
});

describe('an IO loop that waits for input', () => {
  test('runs to the end when every line is there', async () => {
    const o = await run(MEETING, '3\n12\n0\ngoodbye');
    assert.equal(o.out, 'The meeting is open.\n> 3\n> A lot of hands!\n15\n> Nobody?\n15\n> Closed with 15 votes.\n');
    assert.equal(o.error, undefined);
    assert.equal(o.waiting, undefined);
  });

  test('says it is waiting when it wants another line, keeping what it printed', async () => {
    const o = await run(MEETING, '3');
    assert.equal(o.out, 'The meeting is open.\n> 3\n> ');
    assert.equal(o.waiting, true);
    assert.match(o.error?.message ?? '', /getLine found no more input/);
  });

  test('with no input at all, it waits for the first line', async () => {
    const o = await run(MEETING, '');
    assert.equal(o.out, 'The meeting is open.\n> ');
    assert.equal(o.waiting, true);
    assert.deepEqual(o.reads, undefined);
  });

  test('adding the typed line and running again carries on from there (the way the Workshop console works)', async () => {
    const typed: string[] = [];
    let o = await run(MEETING, '');
    for (const line of ['4', '5', 'goodbye']) {
      assert.equal(o.waiting, true);
      typed.push(line);
      const next = await run(MEETING, typed.map(l => l + '\n').join(''));
      assert.ok(next.out.startsWith(o.out), 'a rerun prints the same things first');
      o = next;
    }
    assert.equal(o.waiting, undefined);
    assert.match(o.out, /Closed with 9 votes\.\n$/);
  });

  test('reads says where each line was read, so the typed lines can be shown in place', async () => {
    const o = await run(MEETING, '4\ngoodbye');
    assert.deepEqual(o.reads, ['The meeting is open.\n> '.length, 'The meeting is open.\n> 4\n> '.length]);
  });

  test('an empty typed line counts as a line', async () => {
    const src = 'main :: IO ()\nmain = do\n  a <- getLine\n  b <- getLine\n  print (a, b)\n';
    assert.equal((await run(src, 'x\n\n')).out, '("x","")\n');
    assert.equal((await run(src, '\n')).waiting, true);
  });

  test('readLn waits the same way', async () => {
    const o = await run('main :: IO ()\nmain = do\n  n <- readLn :: IO Int\n  print n\n', '');
    assert.equal(o.waiting, true);
    assert.match(o.error?.message ?? '', /readLn found no more input/);
  });

  test('a λ> getLine expression waits too', async () => {
    const r = await runner.evaluate('', 'getLine', '');
    assert.ok(r.status === 'evaluated' && r.output?.waiting, JSON.stringify(r));
  });

  test('a challenge IO test that runs out of input still fails with the message', async () => {
    const io = CHALLENGES.find(c => c.tests.some(t => !Array.isArray(t)));
    assert.ok(io, 'some challenge has an IO test');
    const r = await runner.check(io!, 'main :: IO ()\nmain = do\n  a <- getLine\n  b <- getLine\n  c <- getLine\n  d <- getLine\n  e <- getLine\n  f <- getLine\n  putStrLn (a ++ b ++ c ++ d ++ e ++ f)\n');
    assert.ok(r.status === 'tested' && !r.passed);
    if (r.status === 'tested') assert.ok(r.tests.some(t => /no more input/.test(t.error ?? '')), JSON.stringify(r.tests));
  });
});

describe('a do statement that runs over several lines with a nested do', () => {
  test('`if … then … else do` followed by a bind on a deeper line is not read as a bind', async () => {
    const src = 'readAll :: IO [String]\nreadAll = do\n  line <- getLine\n  if line == "done" then return [] else do\n    rest <- readAll\n    return (line : rest)\nmain = readAll >>= print\n';
    assert.equal((await run(src, 'x\ny\ndone\n')).out, '["x","y"]\n');
  });
  test('a case with nested do blocks, and a bind whose action is a lambda', async () => {
    const src = 'go :: IO [String]\ngo = do\n  x <- getLine\n  case x of\n    "done" -> return []\n    _ -> do\n      rest <- go\n      return (x : rest)\nmain = do\n  xs <- go\n  ys <- mapM (\\s -> return (s ++ "!")) xs\n  print ys\n';
    assert.equal((await run(src, 'a\nb\ndone\n')).out, '["a!","b!"]\n');
  });
});
