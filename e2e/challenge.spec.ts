// Solving a challenge and building its reward: the game's main loop.
import { expect, test } from '@playwright/test';
import { KEY, openRequest, openTown, savedState, setCode } from './helpers.ts';

const SOLUTION = 'add :: Int -> Int -> Int\nadd x y = x + y\n';

test('a new player sees the welcome screen once', async ({ page }) => {
  await page.goto('./');
  const welcome = page.locator('#welcome');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Independent' }).click();
  await welcome.getByRole('button', { name: "Let's build a town" }).click();
  await expect(welcome).toBeHidden();

  await page.reload();
  await expect(page.locator('#welcome')).toBeHidden();
  expect(await savedState(page)).toMatchObject({ welcomed: true, mode: 'independent' });
});

test.describe('solving a challenge', () => {
  test.beforeEach(async ({ page }) => {
    await openTown(page);
    await openRequest(page, "Wren's Moving Day");
  });

  test('the notebook shows the task and the guided starter', async ({ page }) => {
    await expect(page.locator('#nbEyebrow')).toContainText('Challenge 01');
    await expect(page.locator('#problem')).toContainText('Write a function add');
    await expect(page.locator('#code')).toHaveValue(/add x y = ___/);
    await expect(page.locator('#runBtn')).toHaveText('▶ Run tests');
  });

  test('the unfilled starter fails, with a nudge', async ({ page }) => {
    await page.locator('#runBtn').click();
    const results = page.locator('#results');
    await expect(results.locator('.res-head')).toContainText('0 of 4 tests pass');
    await expect(results.locator('.nudge')).toContainText('Not written yet?');
    await expect(page.locator('#buildBtn')).toHaveCount(0);
  });

  test('a wrong answer shows what was expected', async ({ page }) => {
    await setCode(page, 'add :: Int -> Int -> Int\nadd x y = x * y\n');
    await page.locator('#runBtn').click();
    const results = page.locator('#results');
    await expect(results.locator('.res-head')).toContainText('1 of 4 tests pass'); // add 0 0 == 0 * 0
    await expect(results.locator('li.no').first()).toContainText('expected');
    await expect(page.locator('#buildBtn')).toHaveCount(0);
  });

  test('a type error is reported before any test runs', async ({ page }) => {
    await setCode(page, 'add :: Int -> Int -> Int\nadd x y = x ++ y\n');
    await page.locator('#runBtn').click();
    await expect(page.locator('#results .note-h')).toHaveText("The types don't fit together yet");
    await expect(page.locator('#gutter .bad')).toHaveText('2');
  });

  test('hints are revealed one at a time, up to the full solution', async ({ page }) => {
    const assistant = page.locator('#assistant');
    await expect(assistant.locator('.hint-count')).toHaveText('0 of 4 revealed');
    for (let i = 1; i <= 4; i++) await assistant.locator('#hintBtn').click();
    await expect(assistant.locator('.hints li')).toHaveCount(4);
    await assistant.getByRole('button', { name: 'Show a full solution (optional)' }).click();
    await assistant.getByRole('button', { name: 'Put this in my notebook' }).click();
    await expect(page.locator('#code')).toHaveValue(SOLUTION);
  });

  test('the right answer passes every test, with Ctrl+Enter too', async ({ page }) => {
    await setCode(page, SOLUTION);
    await page.locator('#code').press('Control+Enter');
    const results = page.locator('#results');
    await expect(results.locator('.res-head')).toHaveText(/All tests pass!/);
    await expect(results.locator('li.ok')).toHaveCount(4);
    await expect(results.locator('.typeok code')).toHaveText('add :: Int -> Int -> Int');
    await expect(results.locator('.win-stats')).toContainText('Solved in 1 run');
    await expect(page.locator('#buildBtn')).toHaveText("Build Wren's cottage");
  });

  test('code typed in the notebook is kept after closing it', async ({ page }) => {
    await setCode(page, 'add x y = y + x\n');
    await page.keyboard.press('Escape');
    await expect(page.locator('#notebook')).toBeHidden();
    await page.reload();
    await openRequest(page, "Wren's Moving Day");
    await expect(page.locator('#code')).toHaveValue('add x y = y + x\n');
  });
});

test.describe('building', () => {
  test('building the reward grows the town and unlocks the next request', async ({ page }) => {
    await openTown(page);
    const next = page.locator('#requests .req', { hasText: 'The Mailbox Problem' });
    await expect(next).toBeDisabled();
    await expect(page.locator('#progressText')).toHaveText('0 of 23 requests');

    await openRequest(page, "Wren's Moving Day");
    await setCode(page, SOLUTION);
    await page.locator('#runBtn').click();
    await page.locator('#buildBtn').click();

    await expect(page.locator('#notebook')).toBeHidden();
    await expect(page.locator('#toast')).toContainText("Wren's cottage has been built!");
    await expect(page.locator('#toast')).toContainText('New request from Wren');
    await expect(page.locator('#progressText')).toHaveText('1 of 23 requests');
    await expect(page.locator('#requests .req', { hasText: "Wren's Moving Day" }).locator('.chip')).toHaveText('Built ✓');
    await expect(next).toBeEnabled();
    await expect(next.locator('.chip')).toHaveText('Needs help');

    // the Library card and the Journal page open up
    await page.locator('.tabs button[data-tab=library]').click();
    await expect(page.locator('#lib-house')).not.toHaveClass(/lib-locked/);
    await expect(page.locator('#lib-mailbox')).toHaveClass(/lib-locked/);

    const s = await savedState(page);
    expect(s.done).toEqual({ house: true });
    expect(s.journal.house.code).toBe(SOLUTION);
  });

  test('progress survives a reload, and a built challenge can be reopened', async ({ page }) => {
    await openTown(page, { done: { house: true }, code: { house: SOLUTION }, attempts: { house: 1 } });
    await expect(page.locator('#progressText')).toHaveText('1 of 23 requests');
    await page.reload();
    await expect(page.locator('#progressText')).toHaveText('1 of 23 requests');

    await openRequest(page, "Wren's Moving Day");
    await expect(page.locator('#results .done-note')).toContainText("already built Wren's cottage");
    await page.locator('#runBtn').click();
    await expect(page.locator('#results .already')).toHaveText('Already built ✓');
    await expect(page.locator('#buildBtn')).toHaveCount(0);
  });

  test('starting the town over clears progress but keeps the mode', async ({ page }) => {
    await openTown(page, { done: { house: true }, mode: 'balanced' });
    const reset = page.locator('#resetProgress');
    await reset.click();
    await expect(reset).toHaveText('Click again to start over');
    await reset.click();
    await expect(page.locator('#progressText')).toHaveText('0 of 23 requests');
    const s = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
    expect(s).toMatchObject({ done: {}, mode: 'balanced', welcomed: true });
  });
});
