# The runner API

Haskell Town keeps the game separate from the thing that runs the player's Haskell, as the design doc suggests. The game talks to a `CodeRunner` (`src/runner/types.ts`):

```ts
interface CodeRunner {
  readonly name: string;
  check(challenge: Challenge, source: string): Promise<CheckResult>;
  compile(source: string): Promise<CompileResult>;
  runMain(source: string, input: string): Promise<RunMainResult>;
  evaluate(source: string, expr: string, input: string): Promise<EvalResult>;
  cancel?(): void;   // stop the running call, if the runner can
}
```

Every result type can also be `{ status: 'stopped', reason: 'timeout' | 'cancelled', seconds }`. That means the runner gave up before the code finished, and the UI explains it to the player.

Every method is async, and every result is plain JSON. A runner can therefore live in the page, in a Web Worker, or behind an HTTP API without the game changing.

## Runners

| Runner | Status | Notes |
|---|---|---|
| `BrowserRunner` (`src/runner/browser.ts`) | ✅ | Mini-Haskell interpreter in `src/haskell`. Works offline, but only covers a subset of Haskell (see ROADMAP.md). Runs on the page, so slow code freezes it. Used in tests and where Web Workers aren't available. |
| `WorkerRunner` (`src/runner/worker-runner.ts`) | ✅ in use | The same interpreter in a Web Worker (`worker.ts`). One call at a time. A call is stopped after 10 s, or by `cancel()` (the Stop button), by terminating the worker and starting a new one. |
| GHC runner | 💭 planned | Real GHC in a sandbox (container with CPU/memory/time limits, no network). Covers all of Haskell. |

`createRunner()` in `src/runner/index.ts` picks the runner. A likely setup is GHC when it's reachable, with the browser runner as the offline fallback.

## What `check` must do

`check(challenge, source)` returns the first stage that fails:

1. **`compile-error`**: it doesn't parse or type-check. `error.kind` is `parse`, `scope` or `type`, and `error.line` is set where known.
2. **`missing-function`**: `challenge.fn` isn't defined at the top level.
3. **`missing-parts`**: something in `challenge.needs` (types, constructors, fields, classes, instances) is missing.
4. **`signature-mismatch`**: the function's type doesn't unify with `challenge.sig`. Type variables in `sig` must stay polymorphic.
5. **`tested`**: the tests ran.
   - Expression tests `[expr, expected]`: evaluate both and compare with `==`. Report `want`/`got` using `show`, or `error` if evaluation failed.
   - IO tests `{ input, out }`: run `main` with `input` as stdin and compare stdout exactly.
   - If every test passes, the rules are checked: `forbid` (none of these Prelude names may be used) and `recursive` (some function must call itself). A broken rule gives `ruleBreak` and `passed: false`.

Error messages are shown to beginners. Raw GHC output should be translated into the same friendly style before it's returned. Lines starting with `Expected:` / `Found:` and `Tip:` are formatted specially by the UI.

## The contract test

`tests/runner-contract.test.ts` runs against every runner in its `RUNNERS` list (today BrowserRunner, plus WorkerRunner with an in-process stand-in for the worker). It checks that all 23 reference solutions pass, that no starter code passes, and that each kind of failure produces the right status. A new runner is ready when that file passes with it added.

## A possible HTTP shape for the GHC runner

This is only a sketch, nothing implements it yet:

```
POST /check     { challengeId, source }        → CheckResult
POST /compile   { source }                     → CompileResult
POST /run       { source, input }              → RunMainResult
POST /evaluate  { source, expr, input }        → EvalResult
```

The server would load the challenge definitions itself, so the browser can't change the tests. The rule checks (`forbid`, `recursive`) can be done on GHC's renamed AST or with `-ddump-rn`.
