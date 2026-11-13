import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const KEY = 'haskelltown-v1';

/**
 * Open the game with a saved state (or a fresh one with the welcome screen already dismissed).
 * The state is only written when nothing is saved yet, so a reload keeps the player's progress.
 */
export async function openTown(page: Page, saved: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(([key, s]) => {
    if (localStorage.getItem(key) == null) localStorage.setItem(key, JSON.stringify(s));
  }, [KEY, { done: {}, code: {}, hints: {}, attempts: {}, mode: 'guided', welcomed: true, ...saved }] as const);
  await page.goto('./');
  await expect(page.locator('#welcome')).toBeHidden();
}

/** The saved game, straight from localStorage. */
export const savedState = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

/** Replace everything in the notebook editor, the way typing would (the game listens for `input`). */
export async function setCode(page: Page, code: string): Promise<void> {
  await page.locator('#code').fill(code);
}

/** Open a request from the sidebar: the character walks to the building, then the notebook opens. */
export async function openRequest(page: Page, title: string): Promise<void> {
  await page.locator('#requests .req', { hasText: title }).click();
  await expect(page.locator('#notebook')).toBeVisible();
  await expect(page.locator('#nbTitle')).toHaveText(title);
}
