import { BrowserRunner } from './browser.ts';
import type { CodeRunner } from './types.ts';

export type * from './types.ts';
export { BrowserRunner };

// The runner the game uses. Only the browser runner exists today; a GHC runner
// (see docs/runner-api.md) would be picked here, e.g. from an environment variable.
export function createRunner(): CodeRunner {
  return new BrowserRunner();
}
