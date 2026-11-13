# The GHC service

Real GHC for Haskell Town, in a sandbox. It implements the [runner API](../docs/runner-api.md) over HTTP, and [`GhcRunner`](../src/runner/ghc-runner.ts) is the game's side of it. It gives the same results as the in-browser interpreter for the same code (`tests/runner-contract.test.ts` checks this in CI), but it covers all of Haskell: `Integer`, full laziness, `deriving Functor`, `Data.Map`, type families and the rest.

## Running it

You need Docker with Compose. From the repository root:

```sh
docker compose -f server/compose.yaml up --build      # the service on http://localhost:8080
VITE_GHC_URL=http://localhost:8080 npm run dev        # the game, using it
GHC_RUNNER_URL=http://localhost:8080 node --test tests/runner-contract.test.ts
```

With `VITE_GHC_URL` set at build time, the game uses GHC, and falls back to the in-browser interpreter when the service can't be reached or is busy. Without it, nothing changes. For a deployed game, set `ALLOWED_ORIGINS` (for example `https://louisewolff17.github.io`) so only the game's page can call the service, and put HTTPS in front of port 8080.

## How a request is handled

1. **The source is prepared** (`source.ts`). Only harmless pragmas are allowed: no `OPTIONS_GHC`, CPP, Template Haskell, FFI, `MagicHash`, `PackageImports`, `Unsafe` or `Trustworthy`. The module is renamed (whatever header the player wrote, or none), and two imports are added: the Prelude, and [`HTown.Prelude`](haskell/support/HTown/Prelude.hs), the extras the in-browser interpreter has built in (`sort`, `toUpper`, `toList`, `Sum`, …). Both hide any name the program defines itself, so a player's own `insert` or `toList` wins, as it does in the browser.
2. **The inspector type-checks it** ([`haskell/Inspect.hs`](haskell/Inspect.hs), a small GHC API program). It uses `-fno-code -XSafe`, so nothing runs, and writes JSON: top-level types, which have signatures, data types, classes, instances, fields, which names the program uses (for `forbid`) and whether any binding group is recursive (for `recursive`, from GHC's own dependency analysis). A challenge's signature is checked the same way, as `htownSig' :: <sig>; htownSig' = <fn>`, so its type variables must stay polymorphic.
3. **Tests are compiled into the program** as bindings at the end of a copy of the module, run by [`HTown.Harness`](haskell/support/HTown/Harness.hs). GHC builds it with `-fdefer-type-errors`, so a test that doesn't type-check fails alone. Values are compared with `==`, or by what `show` gives when the type has no `Eq` instance, like the browser's structural comparison.
4. **The program runs.** Expression tests each run under their own time limit (the code is compiled with `-fno-omit-yields`, so even a tight loop can be stopped). IO tests run `main` once per test, with the input on stdin.
5. **Messages are translated** (`diagnostics.ts`): GHC's messages and runtime errors become the game's short sentences with `Expected:` / `Found:` and `Tip:` lines, on the player's own line numbers.

## The sandbox

[`compose.yaml`](compose.yaml) runs two containers from one image ([`Dockerfile`](Dockerfile)):

- **ghc** compiles and runs the player's code. It has **no network** (`network_mode: none`), a **read-only** file system with a 512 MB tmpfs for jobs, at most 2 GB of memory, 2 CPUs and 256 processes. It starts as root with every capability dropped except `SETUID`, `SETGID` and `KILL`, and `no-new-privileges`. Those are only used to start each process as the unprivileged `sandbox` user and to stop it.
- **gateway** ([`gateway.ts`](gateway.ts)) is the only part on the network. It runs as another unprivileged user and passes requests to `ghc` over a Unix socket, with CORS, a 256 KB request limit and a per-address rate limit.

Inside `ghc`, each request gets a fresh directory that other jobs can't find. Every process (GHC, the inspector, the player's program) runs as `sandbox`, in its own process group, with a nearly empty environment and `prlimit` limits on CPU time, file size and open files. Each step has a wall-clock limit, and output is capped. The player's program gets a 256 MB heap, and the whole request is stopped after 60 seconds. Player code is compiled with Safe Haskell, and only `base`, `containers` and the support library are visible. If the player presses Stop (or the browser gives up), the gateway drops the request and the job is killed.

## Settings

Environment variables of `node server/main.ts`:

| Variable | Default | |
|---|---|---|
| `SOCKET` / `PORT` | port 8080 | Listen on a Unix socket, or on a port (`HOST`, default 127.0.0.1) |
| `SANDBOX_UID`, `SANDBOX_GID` | unset | Run every process as this user (unset: as the service's own user, for local development) |
| `MAX_JOBS` | CPU count | Requests handled at once; `MAX_WAITING` (32) more wait, the rest get 503 |
| `REQUEST_SECONDS` | 60 | A whole request |
| `TEST_SECONDS` | 2 | One expression test |
| `RUN_SECONDS` | 10 | The player's `main`, or a Workshop expression |
| `GHC`, `HTOWN_INSPECT` | `ghc`, `/opt/haskell-town/bin/htown-inspect` | Where the tools are |
| `PRLIMIT=0` | | Don't use `prlimit` |

The gateway reads `PORT`, `UPSTREAM_SOCKET`, `ALLOWED_ORIGINS` (comma-separated, or `*`) and `RATE_PER_MINUTE` (120).

## Files

```
server/
  main.ts          the HTTP API, the challenge list, the job queue
  ghc.ts           check / compile / runMain / evaluate with GHC
  source.ts        pragma rules, module header and imports, line numbers
  diagnostics.ts   GHC's messages → the game's
  sandbox.ts       running processes with limits; job directories
  gateway.ts       the public HTTP side
  http.ts  healthcheck.ts
  haskell/
    Inspect.hs     htown-inspect (GHC API)
    support/       the htown-support package: HTown.Prelude, HTown.Harness
    selftest.sh    run while the image is built
  Dockerfile  compose.yaml
```

The pure parts (source preparation, message translation) are tested in `tests/ghc-service.test.ts` without GHC.
