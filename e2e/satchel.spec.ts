// The Satchel: it appears with the first gift, lists unused gifts, and using one in the wrong place loses nothing.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHALLENGES, COINS } from '../src/content/index.ts';
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
  await pop.getByRole('button', { name: 'filter (< 15) prices' }).click();
  await expect(pop.locator('[data-result]')).toContainText('[12,5]');
  await pop.locator('#tillExpr').fill('map tenOff prices');
  await pop.locator('#tillExpr').press('Enter');
  await expect(pop.locator('[data-result]')).toContainText('[11,5,27,18]');
  await pop.locator('#tillExpr').fill('bananas');
  await pop.locator('#tillExpr').press('Enter');
  await expect(pop.locator('[data-result]')).toContainText('bananas');
});

test("Bram's store: buy from the shelf with 10% off, and sell every find at the till", async ({ page }) => {
  // 10 errands solved (50 coins), and a few things found
  await openTown(page, { ...openBy('bram'), finds: { shell: 3, honey: 1 } });
  const purse = page.locator('#purse');
  await expect(purse).toHaveText(`🪙 ${10 * COINS.errand}`);
  await goInside(page, 'Inside the store');
  const pop = popup(page);

  // the lantern is 30, 27 with the card
  await look(page, 'goods');
  await pop.getByRole('button', { name: 'Buy the lantern for 27 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('tenOff 30');
  await expect(purse).toHaveText(`🪙 ${10 * COINS.errand - 27}`);
  await expect(pop).toContainText('1 in your satchel');
  // a second one is too dear: a kind line, and nothing is spent
  await pop.getByRole('button', { name: 'Buy the lantern for 27 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('4 coins more');
  await expect(purse).toHaveText(`🪙 ${10 * COINS.errand - 27}`);
  expect((await savedState(page)).bought).toEqual({ lantern: 1 });
  await page.keyboard.press('Escape');

  // the till buys everything found, at the standard price: 3 shells × 2 + 1 honey × 4
  await look(page, 'till');
  await expect(pop.locator('[data-sell]')).toContainText('sum [3 * 2, 1 * 4]');
  await pop.getByRole('button', { name: 'Sell everything for 10 coins' }).click();
  await expect(pop.locator('[data-sell]')).toContainText('+10 coins');
  await expect(purse).toHaveText(`🪙 ${10 * COINS.errand - 27 + 10}`);
  const saved = await savedState(page);
  expect(saved.finds).toEqual({});
  expect(saved.purse).toEqual({ earned: 10, spent: 27 });
  await page.keyboard.press('Escape');

  // the lantern waits in the satchel
  await page.locator('#satchelBtn').click();
  await expect(page.locator('#satchel')).toContainText('lantern');
  await expect(page.locator('#satchel')).not.toContainText('Finds');
});

test("Bram's useful things: seeds, the rod and a bigger satchel, and a full satchel turns new things away", async ({ page }) => {
  // 10 errands (50 coins) and 20 coins found earlier; the satchel holds 19 of its 20 already (gifts take no room)
  await openTown(page, { ...openBy('bram'), purse: { earned: 20, spent: 0 }, finds: { shell: 19 } });
  const purse = page.locator('#purse');
  await goInside(page, 'Inside the store');
  const pop = popup(page);
  await look(page, 'goods');
  await expect(pop).toContainText('In your satchel: 19 of 20');

  // a seed packet takes the last slot: 8, 8 with the card
  await pop.getByRole('button', { name: 'Buy the seeds for 8 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('tenOff 8');
  await expect(pop).toContainText('In your satchel: 20 of 20');
  // a full satchel: a kind line, a hint at the bigger satchel, and nothing is spent
  await pop.getByRole('button', { name: 'Buy the seeds for 8 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('full to the brim');
  await expect(pop.locator('.in-receipt')).toContainText('A bigger satchel is on the shelf');
  await expect(purse).toHaveText('🪙 62');

  // the bigger satchel takes no slot, so it can always be bought; 30, 27 with the card
  await pop.getByRole('button', { name: 'Buy the bigger satchel for 27 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('slots = 40');
  await expect(pop).toContainText('In your satchel: 20 of 40');
  await expect(pop.getByRole('button', { name: /Buy the bigger satchel/ })).toHaveCount(0);
  // the rod: 40, 36 with the card, and there's only 35 left
  await pop.getByRole('button', { name: 'Buy the fishing rod for 36 coins' }).click();
  await expect(pop.locator('.in-receipt')).toContainText('1 coin more');
  await expect(purse).toHaveText('🪙 35');
  expect((await savedState(page)).useful).toEqual({ seeds: 1, satchel: 1 });
});

test('the Satchel counts its slots, and seeds bought from the old shelf move to the useful things', async ({ page }) => {
  await openTown(page, { ...openBy('bram'), bought: { seeds: 2, jam: 1 }, useful: { rod: 1 } });
  await page.locator('#satchelBtn').click();
  // the seeds and the jam take a slot each; the rod and the gifts take none
  await expect(page.locator('#satchel .satchel-slots')).toHaveText('3 of 20');
  await expect(page.locator('#satchel')).toContainText('2 packets of seeds');
  await expect(page.locator('#satchel')).toContainText('The fishing rod');
  await expect(page.locator('#satchel')).toContainText('jam');
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
const BOAT = { brine: [134, 86], star: [112, 38], rod: [140, 28], wheel: [63, 70], paddles: [67, 31] } as const;
const lookAboard = (page: Page, what: keyof typeof BOAT) => { const [x, y] = BOAT[what]; return clickRoom(page, x, y); };

test("Brine's little boat: go aboard, look at the star, the wheel, the paddle wheels and the line, sail out with Brine and home again, and back ashore", async ({ page }) => {
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
  await lookAboard(page, 'paddles');
  await expect(say(page)).toContainText(/paddles on the wheel|resting while she/);
  await lookAboard(page, 'rod');
  await expect(say(page)).toContainText('float');
  // talking to Brine sails out to sea: a cut-scene, then there's no way ashore until you talk to him again
  await lookAboard(page, 'brine');
  await expect(say(page)).toContainText('Brine');
  await expect(page.locator('#hoverLabel')).toContainText('Talk to Brine to sail home');
  await expect(say(page)).toContainText(/Out at sea|head home/);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /talk to Brine to sail home/);
  // out at sea the paddle wheels are churning
  await lookAboard(page, 'paddles');
  await expect(say(page)).toContainText(/churn|Round and round/);
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

// ---------- Inside the beehives (Rowan's tulip) ----------
/** The meadow open (3 errands), Rowan at ♥ 2 with his tulip planted by the hives, standing in the meadow below them. */
const byTheHives = {
  done: village, lettersRead: { rowan: true }, used: { rowan: 1 }, player: { x: 36, y: 392 },
  reviews: { started: 0, topics: {}, day: null, log: ['priced', 'sizes', 'parcel'].map(errand) },
};
const HIVE = { cells: [48, 18], nectar: [88, 60], queen: [88, 46] } as const;
/** Step into a hive from the Satchel's list, and wait for the shrinking-down to finish. */
async function intoHive(page: Page, name: RegExp): Promise<void> {
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name }).click();
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Inside the .* hive.*tulip petal/);
  await page.waitForTimeout(1400);
}

test('the beehives: pick a hive, shrink down and step inside, and the tulip petal takes you back out', async ({ page }) => {
  await openTown(page, byTheHives);
  // the Satchel lists each of the three hives
  await page.locator('#satchelBtn').click();
  for (const name of ['The nursery hive', 'The honey-store hive', "The queen's hive"]) await expect(page.locator('#satchel').getByRole('button', { name })).toBeVisible();
  await page.locator('#satchelBtn').click();

  await intoHive(page, /The nursery hive/);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Inside the nursery hive/);
  await expect(say(page)).toContainText('tulip');
  await expect(page.locator('#hoverLabel')).toContainText('tulip petal');
  await clickRoom(page, ...HIVE.cells);
  await expect(say(page)).toContainText('larva');
  // the petal takes you back out, to just in front of the nursery hive, and E goes back in
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
  const p = (await savedState(page)).player;
  expect(Math.abs(p.x - 18)).toBeLessThan(3);
  expect(Math.abs(p.y - 379)).toBeLessThan(3);
  await expect(page.locator('#hoverLabel')).toContainText('The nursery hive');
  await page.keyboard.press('KeyE');
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^Inside the nursery hive/);
  await page.waitForTimeout(1400);
  await clickRoom(page, ...DOORMAT);

  // the honey store: every look at the nectar cell pours in one more flower, combined with <>
  await intoHive(page, /The honey-store hive/);
  await clickRoom(page, ...HIVE.nectar);
  await expect(say(page)).toContainText('"clover"');
  await page.keyboard.press('KeyE');
  await expect(say(page)).toContainText('"clover" <> "heather"');
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);

  // the queen has heard all about you
  await intoHive(page, /The queen's hive/);
  await clickRoom(page, ...HIVE.queen);
  await expect(say(page)).toContainText(/queen|Rowan/);
  await clickRoom(page, ...DOORMAT);
  expect(Object.keys((await savedState(page)).inside?.hives ?? {}).sort()).toEqual(['honey', 'nursery', 'queen']);
});

// ---------- The magical beach (Brine's conch at the Duck Pond) ----------
/** The Duck Pond open (15 errands), Brine's conch set down at the water's edge, standing by the pond. */
const byThePond = {
  done: village, lettersRead: { brine: true }, used: { brine: 1 }, player: { x: 40, y: 480 },
  reviews: { started: 0, topics: {}, day: null, log: Array.from({ length: 15 }, (_, i) => errand(['parcel', 'cargoTotal', 'weather'][i % 3])) },
};
const BEACH_AT = { waves: [100, 20], tideline: [58, 62], crab: [68, 99], pool: [144, 100] } as const;
const onBeach = (page: Page, what: keyof typeof BEACH_AT) => { const [x, y] = BEACH_AT[what]; return clickRoom(page, x, y); };

test('the magical beach: the conch at the pond washes you there, shells wash up forever with cycle, and the conch takes you back', async ({ page }) => {
  await openTown(page, byThePond);
  await page.locator('#satchelBtn').click();
  await page.locator('#satchel').getByRole('button', { name: /The magical beach/ }).click();
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^On the magical beach.*conch/);
  await expect(say(page)).toContainText('wave');
  await expect(page.locator('#hoverLabel')).toContainText('conch');
  await page.waitForTimeout(1400);

  await onBeach(page, 'waves');
  await expect(say(page)).toContainText('repeat wave');
  await onBeach(page, 'crab');
  await expect(say(page)).toContainText('crab');
  await onBeach(page, 'pool');
  await expect(say(page)).toContainText('rock pool');
  // every look at the tideline brings the next shell, and after the fifth the list starts over
  await onBeach(page, 'tideline');
  await expect(say(page)).toContainText('cowrie');
  await expect(say(page)).toContainText('take 1 (cycle shells)');
  for (let i = 2; i <= 6; i++) { await page.keyboard.press('KeyE'); await expect(say(page)).toContainText(`take ${i} (cycle shells)`); }
  await expect(say(page)).toContainText('cowrie again');
  expect((await savedState(page)).inside?.shells).toBe(6);

  // the conch takes you back to the pond's edge, and E goes back through it
  await clickRoom(page, ...DOORMAT);
  await expect(insideOf(page)).toHaveAttribute('aria-label', /map of Haskell Town/);
  const p = (await savedState(page)).player;
  expect(Math.abs(p.x - 70)).toBeLessThan(3);
  expect(Math.abs(p.y - 475)).toBeLessThan(3);
  await expect(page.locator('#hoverLabel')).toContainText("Brine's conch");
  await page.keyboard.press('KeyE');
  await expect(insideOf(page)).toHaveAttribute('aria-label', /^On the magical beach/);
});

test('the coin counter sits next to the Satchel, with a fixed amount per errand solved', async ({ page }) => {
  await openTown(page, { ...withWrensKey, purse: { earned: 3, spent: 1 } });
  const purse = page.locator('#purse');
  await expect(purse).toBeVisible();
  await expect(purse).toHaveText(`🪙 ${2 * COINS.errand + 2}`);
});

test('there is no coin counter before the first errand', async ({ page }) => {
  await openTown(page, { done: village });
  await expect(page.locator('#town')).toBeVisible();
  await expect(page.locator('#purse')).toBeHidden();
});
