// Decorations: bought at Bram's store, set down on open ground in Decorate mode (snapping to the grid), moved, put back,
// saved with their positions, and lamp posts that light up at night.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES, COINS } from '../src/content/index.ts';
import { openTown, savedState } from './helpers.ts';

const village = Object.fromEntries(CHALLENGES.map(c => [c.id, true]));
const errand = (id: string) => ({ date: 0, topic: 'functions', errand: id, outcome: 'recalled', confidence: 'sure', firstTry: true });
/** The village built and Bram's card used (his store open), 4 errands solved (20 coins), standing at the store's door. */
const atTheStore = {
  done: village, lettersRead: { bram: true }, used: { bram: 1 }, player: { x: 248, y: 91 },
  reviews: { started: 0, topics: {}, day: null, log: ['inStock', 'bigLabels', 'firstOrZero', 'twoBags'].map(errand) },
};

/** Click a point on the map, in map pixels. The camera is at the top of the village in these tests. */
async function clickMap(page: Page, x: number, y: number): Promise<void> {
  const cv = page.locator('#town'), box = (await cv.boundingBox())!;
  const h = await cv.evaluate(c => (c as HTMLCanvasElement).height);
  await cv.click({ position: { x: x * box.width / 400, y: y * box.height / h } });
}
/** Click a point in a room (176×150 room pixels, in the middle of the canvas). */
async function clickRoom(page: Page, x: number, y: number): Promise<void> {
  const h = await page.locator('#town').evaluate(c => (c as HTMLCanvasElement).height);
  const fit = Math.min(400 / 176, h / 150), sc = fit >= 2 ? Math.floor(fit) : fit;
  await clickMap(page, Math.floor((400 - 176 * sc) / 2) + x * sc, Math.floor((h - 150 * sc) / 2) + y * sc);
}
/** A pixel of the map (the canvas is 400 map pixels wide, and the camera is at the top), as #rrggbb. */
const pixel = (page: Page, x: number, y: number) => page.locator('#town').evaluate((c, [x, y]) => {
  const d = (c as HTMLCanvasElement).getContext('2d')!.getImageData(x, y, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}, [x, y] as const);
const label = (page: Page) => page.locator('#hoverLabel');
const tray = (page: Page) => page.locator('#decorTray');

// Open grass between Wren's cottage, the mailbox and the trees: the lamp post's 8×8 footprint fits at (88, 40) and (88, 24).
const SPOT_A = [92, 44] as const, SPOT_B = [92, 28] as const, ROAD = [92, 108] as const;

test('buy a lamp post at Bram\'s, set it down on the grid, move it, and put it back in the satchel', async ({ page }) => {
  await openTown(page, atTheStore);
  await expect(page.locator('#decorBtn')).toBeHidden();
  // in through the front door, and buy it off the shelf with the card: 15, 13.5 → 14
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: 'Inside the store' }).click();
  await clickRoom(page, 52, 21);
  const pop = page.locator('#roomPop');
  await pop.getByRole('button', { name: 'Buy the lamp post for 14 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('tenOff 15');
  await expect(page.locator('#purse')).toHaveText(`🪙 ${4 * COINS.errand - 14}`);
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp' }]);
  await page.keyboard.press('Escape');
  await clickRoom(page, 88, 145);
  await expect(page.locator('#town')).toHaveAttribute('aria-label', /map of Haskell Town/);

  // it waits in the satchel; picking it there starts Decorate mode with it in hand
  await expect(page.locator('#decorBtn')).toBeVisible();
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: /lamp post/ }).click();
  await expect(tray(page)).toBeVisible();
  await expect(tray(page)).toContainText('lamp post is in your hand');

  // the road isn't open ground: a line says why, and nothing is set down
  await clickMap(page, ...ROAD);
  await expect(label(page)).toContainText('main road');
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp' }]);
  // open grass: it snaps to the grid
  await clickMap(page, ...SPOT_A);
  await expect(label(page)).toContainText('looks right at home');
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp', x: 88, y: 40 }]);

  // pick it up and move it; it's saved where it ends up, and stays there after a reload
  await clickMap(page, ...SPOT_A);
  await expect(tray(page)).toContainText('in your hand');
  await clickMap(page, ...SPOT_B);
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp', x: 88, y: 24 }]);
  await page.keyboard.press('Escape');
  await expect(tray(page)).toBeHidden();
  await page.reload();
  await expect(page.locator('#decorBtn')).toHaveText('🪴 Decorate');
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp', x: 88, y: 24 }]);

  // nothing is permanent: back in the satchel it goes
  await page.locator('#decorBtn').click();
  await expect(page.locator('#decorBtn')).toHaveText('✓ Done decorating');
  await clickMap(page, ...SPOT_B);
  await tray(page).getByRole('button', { name: 'Put in satchel' }).click();
  expect((await savedState(page)).decor).toEqual([{ kind: 'lamp' }]);
  await expect(tray(page).getByRole('button', { name: 'Set down the lamp post' })).toBeVisible();
  await page.locator('#decorBtn').click();
  await expect(tray(page)).toBeHidden();
});

test('the keyboard can place a decoration too: arrows move it a cell, Enter sets it down, Escape leaves it be', async ({ page }) => {
  await openTown(page, { done: village, player: { x: 70, y: 111 }, decor: [{ kind: 'pot' }] });
  await page.locator('#decorBtn').click();
  await tray(page).getByRole('button', { name: 'Set down the flower pot' }).click();
  await expect(label(page)).toContainText('Set the flower pot down here?');
  await page.keyboard.press('Escape');
  expect((await savedState(page)).decor).toEqual([{ kind: 'pot' }]);
  await tray(page).getByRole('button', { name: 'Set down the flower pot' }).click();
  await page.locator('#town').focus();
  // it starts on the open grass nearest the character, just below the road; one cell right is Moss's front path
  await page.keyboard.press('ArrowRight');
  await expect(label(page)).toContainText("That's a front path.");
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(label(page)).toContainText('looks right at home');
  expect((await savedState(page)).decor).toEqual([{ kind: 'pot', x: 56, y: 120 }]);
});

// the glass of a lamp post at (88, 40) is at (x + 2, y - 18)
const lamp = { done: village, player: { x: 70, y: 111 }, decor: [{ kind: 'lamp', x: 88, y: 40 }] };
test('lamp posts are unlit by day', async ({ page }) => {
  await openTown(page, { ...lamp, devHour: 12 });
  await expect.poll(() => pixel(page, 90, 22)).toBe('#d8e4ea');
});
test('lamp posts light up at night', async ({ page }) => {
  await openTown(page, { ...lamp, devHour: 23 });
  await expect.poll(() => pixel(page, 90, 22)).toBe('#fff2a8');
});
test('lamp posts stay unlit when the town is kept in daylight', async ({ page }) => {
  await openTown(page, { ...lamp, devHour: 23, clockOff: true });
  await expect.poll(() => pixel(page, 90, 22)).toBe('#d8e4ea');
});
