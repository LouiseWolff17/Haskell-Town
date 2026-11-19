// Your garden plot by Wren's cottage: it appears with your first seeds, seeds grow over real days into flowers and
// vegetables, a ready plant waits however long it takes, and picking puts it in the Satchel for Bram's till.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES, PLANTS } from '../src/content/index.ts';
import { openTown, savedState } from './helpers.ts';

const village = Object.fromEntries(CHALLENGES.map(c => [c.id, true]));
/** The village built, standing by the plot's gate (east of the fence, on the cottage side). */
const byTheGate = { done: village, player: { x: 26, y: 50 } };

/** Click a point on the map, in map pixels. The camera is at the top of the village in these tests. */
async function clickMap(page: Page, x: number, y: number): Promise<void> {
  const cv = page.locator('#town'), box = (await cv.boundingBox())!;
  const h = await cv.evaluate(c => (c as HTMLCanvasElement).height);
  await cv.click({ position: { x: x * box.width / 400, y: y * box.height / h } });
}
const pop = (page: Page) => page.locator('#roomPop');
const beds = (page: Page) => pop(page).locator('[data-beds]');

test('with seeds, the plot is there: plant one and it is a seed today', async ({ page }) => {
  await openTown(page, { ...byTheGate, useful: { seeds: 2 } });
  await clickMap(page, 12, 45);
  await expect(pop(page)).toBeVisible();
  await expect(pop(page)).toContainText('Your garden plot');
  await expect(beds(page)).toHaveText('map stage beds  -- [Empty, Empty, Empty, Empty]');
  await pop(page).getByRole('button', { name: 'Plant a seed in bed 1' }).click();
  await expect(beds(page)).toHaveText('map stage beds  -- [Seed, Empty, Empty, Empty]');
  await expect(pop(page).locator('[data-seeds]')).toHaveText('1');
  const s = await savedState(page);
  expect(s.useful.seeds).toBe(1);
  expect(PLANTS.map(p => p.id)).toContain(s.garden.beds[0].plant);
  // the last packet goes in too, and then there are none left to plant
  await pop(page).getByRole('button', { name: 'Plant a seed in bed 2' }).click();
  await expect(pop(page).getByRole('button', { name: /Plant a seed/ })).toHaveCount(0);
  await expect(pop(page)).toContainText('No seeds left');
  await page.keyboard.press('Escape');
  await expect(pop(page)).toBeHidden();
  // with every packet planted, the plot stays
  await page.reload();
  await page.keyboard.press('KeyE');
  await expect(beds(page)).toHaveText(/\[Seed, Seed, Empty, Empty\]/);
});

test('without seeds or a garden, the plot is not there', async ({ page }) => {
  await openTown(page, byTheGate);
  await clickMap(page, 12, 45);
  await page.waitForTimeout(800);
  await expect(pop(page)).toBeHidden();
});

test('a plant from long ago is still ready (nothing wilts), and picking puts it in the satchel', async ({ page }) => {
  await openTown(page, { ...byTheGate, garden: { beds: [{ plant: 'rose', day: 1 }, { plant: 'carrot', day: 1 }, null, null] } });
  await page.keyboard.press('KeyE');
  await expect(beds(page)).toHaveText('map stage beds  -- [Ready Rose, Ready Carrots, Empty, Empty]');
  await pop(page).getByRole('button', { name: 'Pick a rose from bed 1' }).click();
  await expect(pop(page).locator('.in-receipt')).toContainText('A rose, picked');
  await pop(page).getByRole('button', { name: 'Pick carrots from bed 2' }).click();
  await expect(beds(page)).toHaveText('map stage beds  -- [Empty, Empty, Empty, Empty]');
  const s = await savedState(page);
  expect(s.finds).toEqual({ flower: 1, vegetable: 1 });
  expect(s.garden.picked).toBe(2);
});

test('pick everything that is ready, and a full satchel leaves the rest in their beds', async ({ page }) => {
  await openTown(page, { ...byTheGate, finds: { shell: 19 }, garden: { beds: [{ plant: 'daisy', day: 1 }, { plant: 'pumpkin', day: 1 }, { plant: 'cabbage', day: 1 }, null] } });
  await page.keyboard.press('KeyE');
  await pop(page).getByRole('button', { name: /Pick everything that's ready \(3\)/ }).click();
  await expect(pop(page).locator('.in-receipt')).toContainText('1 picked');
  await expect(pop(page).locator('.in-receipt')).toContainText("they won't wilt");
  await expect(pop(page).locator('.in-receipt')).toContainText('map pick (filter ready beds)  -- [Daisy]');
  await expect(beds(page)).toHaveText('map stage beds  -- [Empty, Ready Pumpkin, Ready Cabbage, Empty]');
  expect((await savedState(page)).finds).toEqual({ shell: 19, flower: 1 });
});

test('a decoration on the grass where the plot goes moves back into the satchel', async ({ page }) => {
  await openTown(page, { done: village, player: { x: 60, y: 108 }, decor: [{ kind: 'pot', x: 8, y: 40 }, { kind: 'bench', x: 88, y: 40 }], useful: { seeds: 1 } });
  await expect(page.locator('#toast')).toContainText('the flower pot is back in your satchel');
  expect((await savedState(page)).decor).toEqual([{ kind: 'pot' }, { kind: 'bench', x: 88, y: 40 }]);
});
