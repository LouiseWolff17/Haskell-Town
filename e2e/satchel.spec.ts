// The Satchel: it appears with the first gift, lists unused gifts, and using one in the wrong place loses nothing.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES } from '../src/content/index.ts';
import { openTown, savedState } from './helpers.ts';

const village = Object.fromEntries(CHALLENGES.map(c => [c.id, true]));
const errand = (id: string) => ({ date: 0, topic: 'functions', errand: id, outcome: 'recalled', confidence: 'sure', firstTry: true });
/** The village built, with two of Wren's errands solved: ♥ 2, so her spare key has arrived. */
const withWrensKey = { done: village, lettersRead: { wren: true }, reviews: { started: 0, topics: {}, day: null, log: [errand('firstOrZero'), errand('twoBags')] } };

/** Click a point on the map, in map pixels (the village is 400 px wide). */
async function clickMap(page: Page, x: number, y: number): Promise<void> {
  const cv = page.locator('#town'), box = (await cv.boundingBox())!;
  const h = await cv.evaluate(c => (c as HTMLCanvasElement).height);
  await cv.click({ position: { x: x * box.width / 400, y: y * box.height / h } });
}
const HOUSE = [54, 60] as const, BAKERY = [146, 55] as const;

test('there is no Satchel before the first gift', async ({ page }) => {
  await openTown(page, { done: village });
  await expect(page.locator('#town')).toBeVisible();
  await expect(page.locator('#satchelBtn')).toBeHidden();
});

test('a gift used in the wrong place goes back in the Satchel, and in the right place it is used', async ({ page }) => {
  await openTown(page, withWrensKey);
  const btn = page.locator('#satchelBtn'), list = page.locator('#satchel');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('1');

  await btn.click();
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: /A spare key/ }).click();
  await expect(list).toBeHidden();
  await expect(page.locator('#hoverLabel')).toContainText('is in your hand');

  // the bakery isn't where the key goes: a gentle line, and nothing is lost
  await clickMap(page, ...BAKERY);
  await expect(page.locator('#toast')).toContainText("The key doesn't fit here.");
  await expect(page.locator('#toast')).toContainText('back in your satchel');
  expect((await savedState(page)).used).toBeUndefined();
  await btn.click();
  await expect(list.getByRole('button', { name: /A spare key/ })).toBeVisible();

  // Wren's cottage is where it goes
  await list.getByRole('button', { name: /A spare key/ }).click();
  await clickMap(page, ...HOUSE);
  await expect(page.locator('#toast')).toContainText('use spareKey wrensCottage');
  expect((await savedState(page)).used?.wren).toBeTruthy();
  await expect(btn).not.toContainText('1');
  await btn.click();
  await expect(list).toContainText('Empty for now');
});

test('Escape puts the held item back without using it', async ({ page }) => {
  await openTown(page, withWrensKey);
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: /A spare key/ }).click();
  await expect(page.locator('#satchelBtn')).toContainText('back');
  await page.keyboard.press('Escape');
  await expect(page.locator('#satchelBtn')).toContainText('Satchel 1');
  expect((await savedState(page)).used).toBeUndefined();
});
