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
/** The front door of Wren's cottage (plot 30,36 48×50, its path at x 54). */
const HOUSE_DOOR = [54, 82] as const;

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
  // and in you go, through the front door: the map becomes the cottage
  await expect(page.locator('#roomPanel')).toBeVisible();
  await expect(page.locator('#roomPanel')).toContainText("Wren's cottage");
  await page.locator('#roomPanel').getByRole('button', { name: /Back to town/ }).click();
  await expect(page.locator('#roomPanel')).toBeHidden();
  await expect(btn).not.toContainText('1');
  await btn.click();
  await expect(list).toContainText('Empty for now');
  await expect(list.getByRole('button', { name: /Wren's cottage/ })).toBeVisible();
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

test('once the key is used, clicking the cottage door walks you in, and the doormat takes you out', async ({ page }) => {
  await openTown(page, { ...withWrensKey, used: { wren: 1 } });
  await expect(page.locator('#satchelBtn')).toBeVisible();
  await clickMap(page, ...HOUSE_DOOR);
  const panel = page.locator('#roomPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Wren's cottage");
  await expect(page.locator('#roomSay')).toContainText('kettle');
  await expect(page.locator('#hoverLabel')).toContainText('doormat');
  // you come in standing on the doormat, so E takes you straight back out, onto Wren's doorstep
  await page.keyboard.press('KeyE');
  await expect(panel).toBeHidden();
  await expect(page.locator('#roomSay')).toBeHidden();
  const p = (await savedState(page)).player;
  expect(Math.abs(p.x - 54)).toBeLessThan(3);
  expect(Math.abs(p.y - 89)).toBeLessThan(3);
  // and standing at the door, E goes in again
  await expect(page.locator('#hoverLabel')).toContainText('Press E to go inside');
  await page.keyboard.press('KeyE');
  await expect(panel).toBeVisible();
});

test('the Satchel lists open doors too, so the keyboard can get there', async ({ page }) => {
  await openTown(page, { ...withWrensKey, used: { wren: 1 } });
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: /Wren's cottage/ }).click();
  await expect(page.locator('#roomPanel')).toBeVisible();
  await page.locator('#roomPanel').getByRole('button', { name: /Back to town/ }).click();
  await expect(page.locator('#roomPanel')).toBeHidden();
});

// ---------- The five town interiors ----------
const FIVE = ['wren', 'hazel', 'moss', 'bram', 'fern'] as const;
const ERRANDS_OF: Record<string, string[]> = { wren: ['firstOrZero', 'twoBags'], hazel: ['crust', 'boxLabel'], moss: ['afterRain', 'potLabels'], bram: ['inStock', 'bigLabels'], fern: ['signIn', 'addVisitors'] };
/** The village built, all five town gifts arrived and used, and Wren's letter read. */
const allOpen = {
  done: village, lettersRead: { wren: true },
  journal: { house: { code: 'house = "a cosy cottage"', day: 1 }, bakery: { code: 'loaves = 12', day: 2 } },
  used: Object.fromEntries(FIVE.map(r => [r, 1])),
  reviews: { started: 0, topics: {}, day: null, log: FIVE.flatMap(r => ERRANDS_OF[r].map(errand)) },
};
/** Go into a place through the Satchel's list of open doors (you walk to its front door first). */
async function goInside(page: Page, place: RegExp) {
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: place }).click();
  const panel = page.locator('#roomPanel');
  await expect(panel).toBeVisible();
  return panel;
}
/** Look at something in the room with its button under the map: you walk over, then look. */
const look = (room: ReturnType<Page['locator']>, name: RegExp) => room.locator('.room-spots').getByRole('button', { name }).click();

test("Wren's cottage: tea, the cat, and her letters pinned up", async ({ page }) => {
  await openTown(page, allOpen);
  const room = await goInside(page, /Wren's cottage/), say = page.locator('#roomSay');
  await expect(say).toContainText('kettle');
  await look(room, /Tea with Wren/);
  await expect(say).toContainText('Wren');
  await look(room, /The cat/);
  await expect(say).toContainText('cat');
  await look(room, /The letters/);
  await expect(room.locator('.room-body .in-pins')).toContainText('Wren');
});

test('inside, you click things to walk there, press E to look, and walking on closes what was said', async ({ page }) => {
  await openTown(page, allOpen);
  await goInside(page, /Wren's cottage/);
  const say = page.locator('#roomSay');
  // the room fills the map at 2×, in the middle: 176×150 room pixels in 400×340 → offset (24, 20)
  await clickMap(page, 24 + 110 * 2, 20 + 58 * 2);
  await expect(say).toContainText('cat');
  // standing there, E looks again: the next line about the cat
  const first = await say.textContent();
  await page.keyboard.press('KeyE');
  await expect(say).not.toHaveText(first!);
  await expect(say).toContainText('cat');
  // walk away: the dialogue box closes, and E has nothing to look at
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
  await expect(say).toBeHidden();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  await expect(say).toBeHidden();
});

test('the bakery kitchen: folding triples the layers, and the recipe can be baked in Haskell', async ({ page }) => {
  await openTown(page, allOpen);
  const room = await goInside(page, /bakery kitchen/);
  await look(room, /The dough/);
  await expect(page.locator('#roomSay')).toContainText('layers 1 = 3');
  // already standing at the counter, so the next fold happens straight away
  await look(room, /The dough/);
  await expect(page.locator('#roomSay')).toContainText('layers 2 = 9');
  await look(room, /The oven/);
  await expect(page.locator('#roomSay')).toContainText('recipe is pinned on the wall');

  // the starter still has its blank: not baked yet, and nothing breaks
  await look(room, /Hazel's recipe/);
  const panel = room.locator('.room-body');
  await panel.getByRole('button', { name: /Bake it/ }).click();
  await expect(panel.locator('[data-result]')).toContainText('Hazel expects 3');
  expect((await savedState(page)).inside?.baked).toBeUndefined();

  await panel.locator('.in-code').fill('layers :: Int -> Int\nlayers 0 = 1\nlayers n = 3 * layers (n - 1)\n');
  await panel.getByRole('button', { name: /Bake it/ }).click();
  await expect(panel.locator('[data-result]')).toContainText('81 layers each');
  const saved = await savedState(page);
  expect(saved.inside?.baked).toBeTruthy();
  expect(saved.code['interior:bakery']).toContain('3 * layers');
});

test('the reading room: your own section, and the sunflower moves to the book you pick', async ({ page }) => {
  await openTown(page, allOpen);
  const room = await goInside(page, /reading room/);
  await look(room, /Your section/);
  const panel = room.locator('.room-body');
  // it starts at the latest thing you built (the bakery, day 2)
  await expect(panel.locator('.in-book.marked')).toContainText('🌻');
  await expect(panel.locator('pre.code')).toContainText('loaves = 12');
  await panel.locator('.in-book', { hasText: /cottage|house/i }).first().click();
  await expect(panel.locator('pre.code')).toContainText('a cosy cottage');
  expect((await savedState(page)).inside?.bookmark).toBe('house');
  await look(room, /armchair/);
  await expect(page.locator('#roomSay')).toContainText('armchair');
});

test("the general store: the shelf, and asking Bram's till about it", async ({ page }) => {
  await openTown(page, allOpen);
  const room = await goInside(page, /Inside the store/);
  await look(room, /The shelf/);
  await expect(room.locator('.room-body')).toContainText('teapot');
  await look(room, /Bram's till/);
  const panel = room.locator('.room-body');
  await panel.getByRole('button', { name: 'filter (< 10) prices' }).click();
  await expect(panel.locator('[data-result]')).toContainText('[5,8]');
  await panel.locator('#tillExpr').fill('map tenOff prices');
  await panel.locator('#tillExpr').press('Enter');
  await expect(panel.locator('[data-result]')).toContainText('[11,5,27,8,18]');
  await panel.locator('#tillExpr').fill('bananas');
  await panel.locator('#tillExpr').press('Enter');
  await expect(panel.locator('[data-result]')).toContainText('bananas');
});

test("City Hall: sign the visitors' book and Fern updates the holiday", async ({ page }) => {
  await openTown(page, allOpen);
  const room = await goInside(page, /City Hall/);
  const panel = room.locator('.room-body');
  await look(room, /town records/);
  await expect(panel.locator('.in-records')).toContainText('23 of 23 buildings');
  await look(room, /notice board/);
  await expect(panel).toContainText('[name to be confirmed]');
  await look(room, /visitors' book/);
  await panel.locator('#hallName').fill('Juniper <b>');
  await panel.getByRole('button', { name: /Run main/ }).click();
  await expect(panel.locator('[data-result]')).toContainText('Welcome to City Hall, Juniper <b>!');
  await expect(panel.locator('.in-proposal')).toContainText('Juniper <b> Day');
  expect((await savedState(page)).inside?.name).toBe('Juniper <b>');
});
