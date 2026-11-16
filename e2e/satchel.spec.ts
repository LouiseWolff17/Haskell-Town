// The Satchel: it appears with the first gift, lists unused gifts, and using one in the wrong place loses nothing.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES } from '../src/content/index.ts';
import { openTown, savedState } from './helpers.ts';

const village = Object.fromEntries(CHALLENGES.map(c => [c.id, true]));
const errand = (id: string) => ({ date: 0, topic: 'functions', errand: id, outcome: 'recalled', confidence: 'sure', firstTry: true });
/** The village built, with two of Wren's errands solved: ♥ 2, so her spare key has arrived. */
const withWrensKey = { done: village, lettersRead: { wren: true }, reviews: { started: 0, topics: {}, day: null, log: [errand('firstOrZero'), errand('twoBags')] } };

/** Click a point on the canvas, in canvas pixels (400 wide). The camera is at the top of the village in these tests. */
async function clickMap(page: Page, x: number, y: number): Promise<void> {
  const cv = page.locator('#town'), box = (await cv.boundingBox())!;
  const h = await cv.evaluate(c => (c as HTMLCanvasElement).height);
  await cv.click({ position: { x: x * box.width / 400, y: y * box.height / h } });
}
const HOUSE = [54, 60] as const, BAKERY = [146, 55] as const;
/** Inside a building, the map's label says where you are. */
const insideOf = (page: Page) => page.locator('#town');
const IN = (place: string) => new RegExp(`^Inside ${place}`);
/** Click a point in the room (176×150 room pixels), which sits in the middle of the canvas (rooms.ts placement). */
async function clickRoom(page: Page, x: number, y: number): Promise<void> {
  const h = await page.locator('#town').evaluate(c => (c as HTMLCanvasElement).height);
  const fit = Math.min(400 / 176, h / 150), sc = fit >= 2 ? Math.floor(fit) : fit;
  await clickMap(page, Math.floor((400 - 176 * sc) / 2) + x * sc, Math.floor((h - 150 * sc) / 2) + y * sc);
}
/** The doormat, every room's way out. */
const DOORMAT = [88, 145] as const;
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
  await expect(insideOf(page)).toHaveAttribute('aria-label', IN("Wren's cottage"));
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
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
  const map = insideOf(page);
  await expect(map).toHaveAttribute('aria-label', IN("Wren's cottage"));
  await expect(page.locator('#roomSay')).toContainText('kettle');
  await expect(page.locator('#hoverLabel')).toContainText('doormat');
  // you come in standing on the doormat, so E takes you straight back out, onto Wren's doorstep
  await page.keyboard.press('KeyE');
  await expect(map).toHaveAttribute('aria-label', /map of Haskell Town/);
  await expect(page.locator('#roomSay')).toBeHidden();
  const p = (await savedState(page)).player;
  expect(Math.abs(p.x - 54)).toBeLessThan(3);
  expect(Math.abs(p.y - 89)).toBeLessThan(3);
  // and standing at the door, E goes in again
  await expect(page.locator('#hoverLabel')).toContainText('Press E to go inside');
  await page.keyboard.press('KeyE');
  await expect(map).toHaveAttribute('aria-label', IN("Wren's cottage"));
});

test('the Satchel lists open doors too, so the keyboard can get there', async ({ page }) => {
  await openTown(page, { ...withWrensKey, used: { wren: 1 } });
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: /Wren's cottage/ }).click();
  await expect(insideOf(page)).toHaveAttribute('aria-label', IN("Wren's cottage"));
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
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
/** Just outside each front door (town.ts frontDoor), so a test doesn't start with a long walk across town. */
const DOORS: Record<string, { x: number; y: number }> = { wren: { x: 54, y: 89 }, hazel: { x: 160, y: 91 }, moss: { x: 228, y: 185 }, bram: { x: 248, y: 91 }, fern: { x: 216, y: 253 } };
const openBy = (rid: string) => ({ ...allOpen, player: DOORS[rid] });
/** Go into a place through the Satchel's list of open doors (you walk to its front door first). */
async function goInside(page: Page, place: string) {
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: place }).click();
  await expect(insideOf(page)).toHaveAttribute('aria-label', IN(place));
}
/** Where things are in each room (the middle of each Spot's box in rooms.ts, in room pixels). */
const SPOT = {
  tea: [20, 26], cat: [110, 58], letters: [128, 18],
  dough: [80, 53], recipe: [78, 18], oven: [146, 24],
  shelf: [142, 21], book: [89, 54], chair: [24, 61],
  goods: [52, 21], till: [131, 40], bram: [156, 36],
  records: [19, 31], proposal: [151, 16], visitors: [55, 126], fern: [88, 34],
} as const;
/** Click something in the room: you walk over, then look. */
const look = (page: Page, what: keyof typeof SPOT) => { const [x, y] = SPOT[what]; return clickRoom(page, x, y); };
const say = (page: Page) => page.locator('#roomSay');
const popup = (page: Page) => page.locator('#roomPop');

test("Wren's cottage: tea, the cat, and her letters pinned up in a pop-up", async ({ page }) => {
  await openTown(page, openBy('wren'));
  await goInside(page, "Wren's cottage");
  await expect(say(page)).toContainText('kettle');
  await look(page, 'tea');
  await expect(say(page)).toContainText('Wren');
  await look(page, 'cat');
  await expect(say(page)).toContainText('cat');
  await look(page, 'letters');
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).locator('.in-pins')).toContainText('Wren');
  // Escape closes the pop-up and you're still inside
  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
  await expect(insideOf(page)).toHaveAttribute('aria-label', IN("Wren's cottage"));
});

test('inside, you click things to walk there, press E to look, and walking on closes what was said', async ({ page }) => {
  await openTown(page, openBy('wren'));
  await goInside(page, "Wren's cottage");
  await expect(say(page)).toContainText('kettle');
  await look(page, 'cat');
  await expect(say(page)).not.toContainText('kettle');
  await expect(say(page)).toContainText('cat');
  // standing there, E looks again: the next line about the cat
  const first = await say(page).textContent();
  await page.keyboard.press('KeyE');
  await expect(say(page)).not.toHaveText(first!);
  await expect(say(page)).toContainText('cat');
  // walk away: the dialogue box closes, and E has nothing to look at
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
  await expect(say(page)).toBeHidden();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  await expect(say(page)).toBeHidden();
});

test('the bakery kitchen: folding triples the layers, and the recipe can be baked in Haskell', async ({ page }) => {
  await openTown(page, openBy('hazel'));
  await goInside(page, 'The bakery kitchen');
  await look(page, 'dough');
  await expect(say(page)).toContainText('layers 1 = 3');
  // already standing at the counter, so the next fold happens straight away
  await look(page, 'dough');
  await expect(say(page)).toContainText('layers 2 = 9');
  await look(page, 'oven');
  await expect(say(page)).toContainText('recipe is pinned on the wall');

  // the starter still has its blank: not baked yet, and nothing breaks
  await look(page, 'recipe');
  const pop = popup(page);
  await expect(pop.locator('.in-code')).toBeFocused();
  await pop.getByRole('button', { name: /Bake it/ }).click();
  await expect(pop.locator('[data-result]')).toContainText('Hazel expects 3');
  expect((await savedState(page)).inside?.baked).toBeUndefined();

  await pop.locator('.in-code').fill('layers :: Int -> Int\nlayers 0 = 1\nlayers n = 3 * layers (n - 1)\n');
  await pop.getByRole('button', { name: /Bake it/ }).click();
  await expect(pop.locator('[data-result]')).toContainText('81 layers each');
  const saved = await savedState(page);
  expect(saved.inside?.baked).toBeTruthy();
  expect(saved.code['interior:bakery']).toContain('3 * layers');
  await pop.getByRole('button', { name: 'Close' }).click();
  await expect(pop).toBeHidden();
});

test('the reading room: your own section, and the sunflower moves to the book you pick', async ({ page }) => {
  await openTown(page, openBy('moss'));
  await goInside(page, 'The reading room');
  await look(page, 'shelf');
  const pop = popup(page);
  // it starts at the latest thing you built (the bakery, day 2)
  await expect(pop.locator('.in-book.marked')).toContainText('🌻');
  await expect(pop.locator('pre.code')).toContainText('loaves = 12');
  await pop.locator('.in-book', { hasText: /cottage|house/i }).first().click();
  await expect(pop.locator('pre.code')).toContainText('a cosy cottage');
  expect((await savedState(page)).inside?.bookmark).toBe('house');
  // a click outside the pop-up closes it
  await pop.click({ position: { x: 5, y: 5 } });
  await expect(pop).toBeHidden();
  await look(page, 'chair');
  await expect(say(page)).toContainText('armchair');
});

test("the general store: the shelf, and asking Bram's till about it", async ({ page }) => {
  await openTown(page, openBy('bram'));
  await goInside(page, 'Inside the store');
  const pop = popup(page);
  await look(page, 'goods');
  await expect(pop).toContainText('teapot');
  await page.keyboard.press('Escape');
  await look(page, 'till');
  await pop.getByRole('button', { name: 'filter (< 10) prices' }).click();
  await expect(pop.locator('[data-result]')).toContainText('[5,8]');
  await pop.locator('#tillExpr').fill('map tenOff prices');
  await pop.locator('#tillExpr').press('Enter');
  await expect(pop.locator('[data-result]')).toContainText('[11,5,27,8,18]');
  await pop.locator('#tillExpr').fill('bananas');
  await pop.locator('#tillExpr').press('Enter');
  await expect(pop.locator('[data-result]')).toContainText('bananas');
});

test("City Hall: sign the visitors' book and Fern updates the holiday", async ({ page }) => {
  await openTown(page, openBy('fern'));
  await goInside(page, 'City Hall');
  const pop = popup(page);
  await look(page, 'records');
  await expect(pop.locator('.in-records')).toContainText('23 of 23 buildings');
  await page.keyboard.press('Escape');
  await look(page, 'proposal');
  await expect(pop).toContainText('[name to be confirmed]');
  await page.keyboard.press('Escape');
  await look(page, 'visitors');
  await pop.locator('#hallName').fill('Juniper <b>');
  await pop.getByRole('button', { name: /Run main/ }).click();
  await expect(pop.locator('[data-result]')).toContainText('Welcome to City Hall, Juniper <b>!');
  await expect(pop.locator('.in-proposal')).toContainText('Juniper <b> Day');
  expect((await savedState(page)).inside?.name).toBe('Juniper <b>');
  // closing it, you're still in City Hall, and the doormat takes you out
  await page.keyboard.press('Escape');
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
});

// ---------- Brine's little boat (Juniper's star) ----------
/** Brine at ♥ 4 (his boat is at the pier), Juniper at ♥ 2 with her star used on it, standing on the shore below it. */
const aboard = {
  done: village, lettersRead: { brine: true, juniper: true }, used: { juniper: 1 }, player: { x: 366, y: 250 },
  reviews: { started: 0, topics: {}, day: null, log: ['parcel', 'cargoTotal', 'parcel', 'cargoTotal', 'weather', 'nameTag'].map(errand) },
};
const BOAT = { brine: [134, 86], star: [112, 38], rod: [140, 28], wheel: [63, 70] } as const;
const lookAboard = (page: Page, what: keyof typeof BOAT) => { const [x, y] = BOAT[what]; return clickRoom(page, x, y); };

test("Brine's little boat: go aboard, look at the star, the wheel and the line, sail out with Brine and home again, and back ashore", async ({ page }) => {
  await openTown(page, aboard);
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: "Brine's little boat" }).click();
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Aboard Brine's little boat.*gangplank/);
  await expect(say(page)).toContainText('coiling rope');
  await expect(page.locator('#hoverLabel')).toContainText('gangplank');
  await lookAboard(page, 'star');
  await expect(say(page)).toContainText('star');
  await lookAboard(page, 'wheel');
  await expect(say(page)).toContainText('wheel');
  await lookAboard(page, 'rod');
  await expect(say(page)).toContainText('float');
  // talking to Brine sails out to sea: a cut-scene, then there's no way ashore until you talk to him again
  await lookAboard(page, 'brine');
  await expect(say(page)).toContainText('Brine');
  await expect(page.locator('#hoverLabel')).toContainText('Talk to Brine to sail home');
  await expect(say(page)).toContainText(/Out at sea|head home/);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /talk to Brine to sail home/);
  await clickRoom(page, ...DOORMAT);
  await page.waitForTimeout(400);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Aboard/);
  await lookAboard(page, 'brine');
  await expect(say(page)).toContainText(/Home|home|kettle/);
  await expect(say(page)).toContainText(/Back at the pier|Home again/);
  // the gangplank takes you back to the shore below the pier
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
  const p = (await savedState(page)).player;
  expect(Math.abs(p.x - 366)).toBeLessThan(3);
  expect(Math.abs(p.y - 250)).toBeLessThan(3);
  // standing there, E goes aboard again
  await expect(page.locator('#hoverLabel')).toContainText('Press E to go aboard');
  await page.keyboard.press('KeyE');
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Aboard/);
});
