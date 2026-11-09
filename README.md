# λ Haskell Town

A cozy city builder where you grow a little village by writing real Haskell.

Residents come to you with small problems. You solve each one by writing a Haskell function, and the town grows: a cottage, a bakery, a library, a railway, a harbour… The challenges go all the way from `add :: Int -> Int -> Int` to Functors, Monads, Monoids and lazy infinite lists.

- **23 challenges, 13 residents, 14 buildings.** Every building teaches one idea, and its upgrade practises it again.
- **Real Haskell, checked like GHC.** Your code is type-checked before anything runs, and the error messages are written for beginners.
- **Help without penalties.** There are three learning-assistance modes (Guided, Balanced, Independent) and four levels of hints, plus a full solution if you want it. The reward is the same however you get there.
- **The Workshop** is free play with the whole language: your own data types, classes, IO and a λ> prompt.

Play it at **https://louisewolff17.github.io/Haskell-Town/** (it goes live after the first deploy, see below).

## Running it locally

You need Node.js 22.18 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Content checks + runner contract tests (Node's built-in test runner) |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Production build into `dist/` |

## How the code is organised

```
index.html              page markup
src/
  main.ts               entry point: wires the game together
  styles.css
  content/              everything a game designer edits — plain typed data
    types.ts            Challenge, Resident, … (start here)
    challenges/         one file per building, e.g. 06-library.ts
    residents.ts  workshop-examples.ts  unsupported.ts  coming-soon.ts
  runner/               the boundary between the game and "something that runs Haskell"
    types.ts            the CodeRunner interface and its result types
    browser.ts          BrowserRunner: checks challenges with the in-browser interpreter
  haskell/
    interpreter.js      Mini-Haskell: lexer, parser, type checker, lazy evaluator
  game/                 the UI
    state.js            saved progress (localStorage) + helpers
    town.js             the pixel-art map
    sidebar.js          request list, learning library
    notebook.js         challenge window and Workshop
    highlight.js        syntax highlighting
tests/
  content.test.ts          ids, unlock order, hints… all fit together
  runner-contract.test.ts  every reference solution passes; wrong answers don't
docs/                   design notes and the runner API
```

The UI never calls the interpreter directly. It asks a **`CodeRunner`** to `check` a challenge, `compile`, `evaluate` or `runMain`, and gets plain data back (`CheckResult`, `EvalResult`, …) that it turns into HTML. So swapping the in-browser interpreter for a real GHC backend later only means writing a new runner. See [docs/runner-api.md](docs/runner-api.md).

## Adding a challenge

1. Add an object to the right file in `src/content/challenges/`, or add a new file and list it in `challenges/index.ts`. `src/content/types.ts` documents every field.
2. Give it a `solution`, and tests that the starters fail.
3. Run `npm test`. It checks that your solution passes, that no starter passes, and that the unlock order still works.
4. A new building also needs a plot and a drawing in `src/game/town.js` (`PLOTS` and the draw functions).

## Deploying

Every push to `main` runs the tests, builds, and publishes to GitHub Pages (`.github/workflows/deploy.yml`). Turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Status

This is v0.8 of the prototype, moved into a proper project. What the interpreter can't do yet, and what's planned, is in [ROADMAP.md](ROADMAP.md). The original design is in [docs/design.md](docs/design.md).
