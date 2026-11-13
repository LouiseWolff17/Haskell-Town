// The contract every CodeRunner must meet. It runs against BrowserRunner and against
// WorkerRunner (with an in-process stand-in for the Web Worker, so the messaging is tested).
// With GHC_RUNNER_URL set (e.g. http://localhost:8080, the service in server/), it also runs
// against GhcRunner and real GHC; CI does that in the `ghc` job.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRunner } from '../src/runner/browser.ts';
import { WorkerRunner } from '../src/runner/worker-runner.ts';
import { GhcRunner } from '../src/runner/ghc-runner.ts';
import { InProcessWorker } from './helpers/fake-worker.ts';
import type { CodeRunner, CheckResult } from '../src/runner/types.ts';
import { CHALLENGES, ERRANDS, WORKSHOP_EXAMPLES } from '../src/content/index.ts';
import type { Challenge } from '../src/content/types.ts';

const GHC_URL = process.env.GHC_RUNNER_URL;
const RUNNERS: CodeRunner[] = [
  new BrowserRunner(),
  new WorkerRunner(() => new InProcessWorker()),
  ...(GHC_URL ? [new GhcRunner({ url: GHC_URL })] : []),
];
const byId = (id: string): Challenge => {
  const c = CHALLENGES.find(x => x.id === id);
  if (!c) throw new Error('no challenge ' + id);
  return c;
};
const describeFailure = (r: CheckResult) =>
  r.status === 'tested'
    ? JSON.stringify({ ruleBreak: r.ruleBreak, failing: r.tests.filter(t => !t.ok) }, null, 2)
    : JSON.stringify(r, null, 2);

for (const runner of RUNNERS) {
  describe(`${runner.name} runner`, () => {
    describe('every reference solution passes', () => {
      for (const c of CHALLENGES) {
        test(`#${c.num} ${c.title}`, async () => {
          const r = await runner.check(c, c.solution);
          assert.ok(r.status === 'tested' && r.passed, describeFailure(r));
        });
      }
    });

    describe('no starter code passes on its own', () => {
      for (const c of CHALLENGES) {
        test(`#${c.num} ${c.title}`, async () => {
          for (const mode of ['guided', 'balanced', 'independent'] as const) {
            const r = await runner.check(c, c.starter[mode]);
            assert.ok(!(r.status === 'tested' && r.passed), `${mode} starter should not pass`);
          }
        });
      }
    });

    describe('every errand solution passes, and no errand starter does', () => {
      for (const e of ERRANDS) {
        test(`errand ${e.id}`, async () => {
          const r = await runner.check(e, e.solution);
          assert.ok(r.status === 'tested' && r.passed, describeFailure(r));
          const s = await runner.check(e, e.starter);
          assert.ok(!(s.status === 'tested' && s.passed), 'starter should not pass');
        });
      }
    });

    test('syntax errors are compile errors with a line number', async () => {
      const r = await runner.check(byId('house'), 'add :: Int -> Int -> Int\nadd x y = (x + y\n');
      assert.equal(r.status, 'compile-error');
      if (r.status === 'compile-error') assert.equal(r.error.kind, 'parse');
    });

    test('type errors stop the tests', async () => {
      const r = await runner.check(byId('house'), 'add :: Int -> Int -> Int\nadd x y = x ++ y\n');
      assert.equal(r.status, 'compile-error');
      if (r.status === 'compile-error') assert.equal(r.error.kind, 'type');
    });

    test('a misspelled function is reported as missing', async () => {
      const r = await runner.check(byId('house'), 'addd :: Int -> Int -> Int\naddd x y = x + y\n');
      assert.deepEqual(r, { status: 'missing-function', fn: 'add' });
    });

    test('the wrong type for the function is a signature mismatch', async () => {
      const r = await runner.check(byId('house'), 'add :: Double -> Double -> Double\nadd x y = x + y\n');
      assert.equal(r.status, 'signature-mismatch');
    });

    test('a wrong answer runs the tests and fails some', async () => {
      const r = await runner.check(byId('house'), 'add :: Int -> Int -> Int\nadd x y = x * y\n');
      assert.equal(r.status, 'tested');
      if (r.status === 'tested') {
        assert.equal(r.passed, false);
        assert.ok(r.tests.some(t => t.ok) && r.tests.some(t => !t.ok));
        assert.deepEqual(r.fnType, { fn: 'add', type: 'Int -> Int -> Int', hasSignature: true });
      }
    });

    test('a missing signature is noticed (type is still inferred)', async () => {
      const r = await runner.check(byId('house'), 'add x y = x + y\n');
      assert.ok(r.status === 'tested' && r.passed && r.fnType?.hasSignature === false);
    });

    test('using a forbidden function breaks the rule even if tests pass', async () => {
      const r = await runner.check(byId('library'), 'totalPages :: [Int] -> Int\ntotalPages = sum\n');
      assert.ok(r.status === 'tested' && !r.passed);
      if (r.status === 'tested') {
        assert.ok(r.tests.every(t => t.ok));
        assert.deepEqual(r.ruleBreak, { rule: 'forbidden', used: ['sum'] });
      }
    });

    test('a recursion challenge needs recursion', async () => {
      // Correct answer, no forbidden functions, but nothing calls itself.
      const r = await runner.check(byId('library'), 'totalPages :: [Int] -> Int\ntotalPages xs = last (scanl (+) 0 xs)\n');
      assert.ok(r.status === 'tested' && !r.passed, JSON.stringify(r));
      if (r.status === 'tested') {
        assert.ok(r.tests.every(t => t.ok));
        assert.deepEqual(r.ruleBreak, { rule: 'recursion' });
      }
    });

    test('missing data types and instances are listed', async () => {
      const r = await runner.check(byId('harbour'), 'x :: Int\nx = 1\n');
      assert.equal(r.status, 'missing-parts');
      if (r.status === 'missing-parts') {
        assert.deepEqual(r.missing.find(m => m.what === 'type'), { what: 'type', name: 'Crate' });
        assert.ok(r.missing.some(m => m.what === 'instance' && m.cls === 'Functor' && m.type === 'Crate'));
      }
    });

    test('IO challenges compare what main prints', async () => {
      const c = byId('hall');
      const r = await runner.check(c, 'main :: IO ()\nmain = do\n  name <- getLine\n  putStrLn ("Hi " ++ name)\n');
      assert.ok(r.status === 'tested' && !r.passed);
      if (r.status === 'tested') assert.ok(r.tests[0].expr.startsWith('main'));
    });

    test('endless recursion is caught, not a crash', async () => {
      const r = await runner.check(byId('house'), 'add :: Int -> Int -> Int\nadd x y = add x y\n');
      assert.ok(r.status === 'tested' && !r.passed);
      if (r.status === 'tested') assert.ok(r.tests.every(t => !t.ok && t.error));
    });

    describe('workshop', () => {
      test('every workshop example compiles', async () => {
        for (const x of WORKSHOP_EXAMPLES) {
          const r = await runner.compile(x.code);
          assert.equal(r.status, 'ok', `${x.title}: ${JSON.stringify(r)}`);
        }
      });

      test('evaluating an expression gives its value and type', async () => {
        const r = await runner.evaluate('fibs :: [Int]\nfibs = 0 : 1 : zipWith (+) fibs (tail fibs)\n', 'take 8 fibs', '');
        assert.equal(r.status, 'evaluated');
        if (r.status === 'evaluated') {
          assert.equal(r.value, '[0,1,1,2,3,5,8,13]');
          assert.equal(r.type, '[Int]');
          assert.equal(r.summary.types.fibs, '[Int]');
        }
      });

      test('an expression that does not type-check is an expr-error', async () => {
        const r = await runner.evaluate('x :: Int\nx = 1\n', 'x ++ "a"', '');
        assert.equal(r.status, 'expr-error');
      });

      test('IO expressions are run with the given input', async () => {
        const r = await runner.evaluate('greet :: IO ()\ngreet = getLine >>= \\n -> putStrLn ("Hi " ++ n)\n', 'greet', 'Wren\n');
        assert.ok(r.status === 'evaluated' && r.output?.out === 'Hi Wren\n', JSON.stringify(r));
      });

      test('runMain runs main, or says there is none', async () => {
        const ran = await runner.runMain('main :: IO ()\nmain = putStrLn "hello"\n', '');
        assert.ok(ran.status === 'ran' && ran.output.out === 'hello\n');
        const none = await runner.runMain('x :: Int\nx = 1\n', '');
        assert.equal(none.status, 'no-main');
      });

      test('runtime errors keep the output printed so far', async () => {
        const r = await runner.runMain('main :: IO ()\nmain = do\n  putStrLn "one"\n  print (head ([] :: [Int]))\n', '');
        assert.ok(r.status === 'ran' && r.output.out === 'one\n' && r.output.error, JSON.stringify(r));
      });
    });
  });
}
