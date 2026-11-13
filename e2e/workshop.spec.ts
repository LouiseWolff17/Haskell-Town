// The Workshop: free play with type-checking, expressions, main with stdin, and Stop.
import { expect, test } from '@playwright/test';
import { openTown, savedState, setCode } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openTown(page);
  await page.locator('#workshopBtn').click();
  await expect(page.locator('#notebook')).toBeVisible();
  await expect(page.locator('#nbTitle')).toHaveText('The Workshop');
});

test('it opens on the first example and type-checks it', async ({ page }) => {
  await expect(page.locator('#code')).toHaveValue(/data Shape = Circle Double/);
  await expect(page.locator('#runBtn')).toHaveText('▶ Check & run');
  await page.locator('#runBtn').click();
  const results = page.locator('#results');
  await expect(results.locator('.typeok')).toContainText('Types check out');
  await expect(results).toContainText('area :: Shape -> Double');
});

test('evaluating an expression shows its value and type', async ({ page }) => {
  await setCode(page, 'double :: Int -> Int\ndouble n = n * 2\n');
  await page.locator('#wsExpr').fill('map double [1, 2, 3]');
  await page.locator('#wsExpr').press('Enter');
  const results = page.locator('#results');
  await expect(results.locator('.console.result')).toHaveText('[2,4,6]');
  await expect(results.locator('.ws-type code')).toHaveText('[Int]');
});

test('an example runs as soon as it is picked', async ({ page }) => {
  await page.locator('.ex', { hasText: 'Trees: a recursive type' }).click();
  await expect(page.locator('#wsExpr')).toHaveValue('toList (foldr insert Leaf [5, 2, 8, 1])');
  await expect(page.locator('#results .console.result')).toHaveText('[1,2,5,8]');
});

test('main reads getLine from the input box', async ({ page }) => {
  await page.locator('.ex', { hasText: 'IO: the Town Hall greeter' }).click();
  const out = page.locator('#results pre.console');
  await expect(out).toContainText('Hello, Wren!');
  await expect(out).toContainText('Building house #3');

  await page.locator('#wsInput').fill('Ana\n1');
  await page.locator('#wsMain').click();
  await expect(out).toContainText('Hello, Ana!');
  await expect(out).not.toContainText('Building house #2');
});

test('Run main without a main says so', async ({ page }) => {
  await setCode(page, 'x :: Int\nx = 1\n');
  await page.locator('#wsMain').click();
  await expect(page.locator('#results .note-h')).toHaveText('No main yet');
});

test('a type error points at its line', async ({ page }) => {
  await setCode(page, 'ok :: Int\nok = 1\n\nbad :: Int\nbad = "one"\n');
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .note-h')).toHaveText("The types don't fit together yet");
  await expect(page.locator('#gutter .bad')).toHaveText('5');
});

test('slow code can be stopped', async ({ page }) => {
  // A naive fib: shallow recursion (no stack overflow), but far too slow to finish.
  await setCode(page, 'fib :: Int -> Int\nfib n = if n < 2 then n else fib (n - 1) + fib (n - 2)\n');
  await page.locator('#wsExpr').fill('fib 40');
  await page.locator('#wsEval').click();
  const run = page.locator('#runBtn');
  await expect(run).toHaveText('■ Stop');
  await run.click();
  await expect(page.locator('#results .note-h')).toHaveText('Stopped');
  await expect(run).toHaveText('▶ Check & run');

  // the runner still works afterwards
  await page.locator('#wsExpr').fill('1 + 1');
  await page.locator('#wsEval').click();
  await expect(page.locator('#results .console.result')).toHaveText('2');
});

test('Workshop code and boxes are saved', async ({ page }) => {
  await setCode(page, 'greet = "hi"\n');
  await page.locator('#wsExpr').fill('greet');
  await page.locator('#nbClose').click();
  await expect(page.locator('#notebook')).toBeHidden();
  expect(await savedState(page)).toMatchObject({ code: { workshop: 'greet = "hi"\n' }, wsExpr: 'greet' });

  await page.reload();
  await page.locator('#workshopBtn').click();
  await expect(page.locator('#code')).toHaveValue('greet = "hi"\n');
  await expect(page.locator('#wsExpr')).toHaveValue('greet');
});
