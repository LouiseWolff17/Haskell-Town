# The runner API

Haskell Town keeps the game separate from the thing that runs the player's Haskell, as the design doc suggests. The game talks to a `CodeRunner` (`src/runner/types.ts`):

```ts
interface CodeRunner {
  readonly name: string;
  check(challenge: Checkable, source: string): Promise<CheckResult>;  // a Challenge or an Errand
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
| `GhcRunner` (`src/runner/ghc-runner.ts`) | ✅ with `VITE_GHC_URL` | Real GHC on the sandboxed service in `server/` (no network, read-only, CPU/memory/time limits, an unprivileged user per job). Covers all of Haskell. Calls run side by side; `cancel()` stops them all. Falls back to the in-browser runner when the service can't be reached or is busy. See [server/README.md](../server/README.md). |

`createRunner()` in `src/runner/index.ts` picks the runner: `GhcRunner` when the game was built with `VITE_GHC_URL` set, with `WorkerRunner` as its fallback, and otherwise `WorkerRunner` (or `BrowserRunner` where there are no Web Workers).

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

`tests/runner-contract.test.ts` runs against every runner in its `RUNNERS` list: BrowserRunner, WorkerRunner with an in-process stand-in for the worker, and GhcRunner when `GHC_RUNNER_URL` points at a GHC service (CI's `ghc` job builds the service's image, starts it with `server/compose.yaml` and does this). It checks that every reference solution passes, that no starter code passes, and that each kind of failure produces the right status. A new runner is ready when that file passes with it added.

## The GHC service's HTTP API

`server/main.ts` serves this (behind `server/gateway.ts`, which adds CORS and rate limits):

```
POST /check     { challengeId, source }        → CheckResult
POST /compile   { source }                     → CompileResult
POST /run       { source, input }              → RunMainResult
POST /evaluate  { source, expr, input }        → EvalResult
GET  /health                                   → { ok, ghc, running, waiting }
```

The service has its own copy of the challenges and errands (`src/content`), so `check` only takes an id and the browser can't change the tests. An unknown id is a 404, a full queue a 503, a bad request a 400 with `{ error }`; GhcRunner sends the first two to its fallback runner. A request the client drops (Stop) is killed on the server.

How the service gives the same answers as the interpreter:

- **The same names without imports.** Every program gets `import HTown.Prelude`: the interpreter's built-in extras (`sort`, `sortOn`, `toUpper`, `fromMaybe`, `when`, `toList`, `Sum`, `Product`, …). Names the program defines itself are hidden from it (and from the Prelude), so a player's own `toList` wins.
- **`forbid` and `recursive`** come from GHC's renamed program: the names its expressions use, and whether any binding group (top-level or local) is recursive.
- **Signatures** are checked as `htownSig' :: <sig>; htownSig' = <fn>`, so a type variable in `sig` must stay polymorphic and a more general function is fine.
- **Expression tests** compare with `==`, or with `show` when the type has no `Eq` instance (the interpreter compares any two values structurally). Each test has its own time limit, so an endless loop fails its tests instead of stopping the check.
- **Messages** are translated into the same short style, on the player's own line numbers (`server/diagnostics.ts`).
