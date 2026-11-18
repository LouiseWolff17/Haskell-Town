// City Hall projects: one file built a step at a time, every earlier step checked again on each run.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES, PROJECTS } from '../src/content/index.ts';
import { solutionThrough } from '../src/game/project-rules.ts';
import { openTown, savedState, setCode } from './helpers.ts';

const village = Object.fromEntries(CHALLENGES.map(c => [c.id, true]));
const vote = PROJECTS.find(p => p.id === 'vote')!;

/** A project in the Requests list, by its title (a locked one mentions the one before it, so match the title only). */
const item = (page: Page, title: string) => page.locator('#requests .req').filter({ has: page.locator('.req-title', { hasText: title }) });
async function openProject(page: Page, title: string): Promise<void> {
  await item(page, title).click();
  await expect(page.locator('#notebook')).toBeVisible();
  await expect(page.locator('#nbTitle')).toHaveText(title);
}

test('projects are locked until the village is built', async ({ page }) => {
  await openTown(page);
  const tree = item(page, 'The Tree Vote');
  await expect(tree).toBeDisabled();
  await expect(tree).toContainText('Opens once the whole village is built');
});

test('a step passes, the next one is added to the file, and breaking an earlier step is caught', async ({ page }) => {
  await openTown(page, { done: village, mode: 'balanced' });
  await openProject(page, 'The Tree Vote');
  await expect(page.locator('#nbEyebrow')).toContainText('Step 1 of 5');
  await expect(page.locator('#code')).toHaveValue(/-- Step 1: One option's votes\nvotesFor :: String/);

  // the stub alone doesn't pass
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .res-head')).toContainText('of 4 tests pass');

  // step 1's answer passes, and step 2's stub appears at the bottom
  await setCode(page, solutionThrough(vote, 1));
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .win h3')).toContainText("Step 1 done: One option's votes");
  await expect(page.locator('#code')).toHaveValue(/-- Step 2: Every option once\noptions :: \[String\] -> \[String\]\noptions votes = undefined\n$/);
  await expect(page.locator('#nbEyebrow')).toContainText('Step 2 of 5');
  await expect(page.locator('#problem .proj-steps li.done')).toHaveCount(1);

  // break step 1 while writing step 2: the run says step 1 used to pass
  await setCode(page, solutionThrough(vote, 2).replace('length (filter (== option) votes)', 'length votes'));
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .note-h').first()).toHaveText('Step 1 used to pass');

  // Reset goes back to the checkpoint: the file as it was when step 1 passed
  await page.locator('#resetBtn').click();
  await expect(page.locator('#code')).toHaveValue(/options votes = undefined\n$/);
  await expect(page.locator('#modeNote')).toContainText('when step 1 passed');

  const s = await savedState(page);
  expect(s.projects.vote).toMatchObject({ passed: 1 });
  // the project waits in the Requests list at step 2
  await page.locator('#nbClose').click();
  await expect(item(page, 'The Tree Vote')).toContainText('Step 2 of 5');
});

test('finishing a project puts up its bunting, opens the next one, and keeps checking every step', async ({ page }) => {
  const last = vote.steps.length - 1;
  await openTown(page, { done: village, projects: { vote: { passed: last, hints: [], runs: 4 } }, code: { 'project:vote': solutionThrough(vote, last) } });
  await openProject(page, 'The Tree Vote');
  await setCode(page, solutionThrough(vote, vote.steps.length));
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .win h3')).toHaveText('The Tree Vote: finished!');
  await expect(page.locator('#assistant')).toContainText('Make it yours');

  // a refactor: votesFor with foldr. Every step is checked again.
  await setCode(page, solutionThrough(vote, vote.steps.length).replace('length (filter (== option) votes)', 'foldr (\\v n -> if v == option then n + 1 else n) 0 votes'));
  await page.locator('#runBtn').click();
  await expect(page.locator('#results .res-head')).toContainText('All 5 steps still pass!');

  await page.locator('#nbClose').click();
  await expect(page.locator('#toast')).toContainText('The Tree Vote is finished!');
  await expect(item(page, 'The Tree Vote')).toContainText('Finished ✓');
  await expect(item(page, "Pip's Timetable Board")).toContainText('New project');
  const s = await savedState(page);
  expect(s.projects.vote.done).toEqual(expect.any(Number));

  // the Journal keeps the finished program
  await page.locator('.tabs button[data-tab=journal]').click();
  await expect(page.locator('#journal')).toContainText('City Hall projects · 1 of 3');
});
