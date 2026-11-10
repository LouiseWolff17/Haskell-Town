# λ Haskell Town

A cozy city builder where you grow a little village by writing real Haskell.

Residents come to you with small problems. You solve each one by writing a Haskell function, and the town grows: a cottage, a bakery, a library, a railway, a harbour… The challenges go all the way from `add :: Int -> Int -> Int` to Functors, Monads, Monoids and lazy infinite lists.

After the village is built, the **Notice Board** opens: residents pin up a few errands each day, small new problems on old topics, to solve from memory. Each topic comes back after a gap that grows as you remember it better (spaced retrieval practice, based on [Carpenter, Pan & Butler, 2022](https://doi.org/10.1038/s44159-022-00089-1)).

- **23 challenges, 13 residents, 14 buildings.** Every building teaches one idea, and its upgrade practises it again.
- **Real Haskell, checked like GHC.** Your code is type-checked before anything runs, and the error messages are written for beginners.
- **Help without penalties.** There are three learning-assistance modes (Guided, Balanced, Independent) and four levels of hints, plus a full solution if you want it. The reward is the same however you get there.
- **The Notice Board** brings each topic back over days and weeks: 26 errands on 13 topics, one topic per resident, solved from memory, with feedback after you try.
- **The town keeps growing.** Solving errands opens new land south of the railway (a meadow, an orchard, a duck pond, a windmill), and the **Journal** keeps a page for every building with the code you wrote, plus a stamp for every errand.
- **Friends.** Each errand you solve for a resident earns a heart. Hearts bring a letter to Wren's mailbox, then a gift, then a lasting change to their building on the map. Friends have their own panel to the left of the map.
- **Life in town.** The first errand on each topic brings something to the map: a sleepy cat, the bread bike, birds, a kite, gulls, shooting stars… Once the Observatory is built, the town gets dark in the evening, following your clock (there's a toggle on the map).
- **Market music and a printable Journal.** Once the Market is built, a 🎵 button plays a soft music-box tune (made on the fly, no sound files) while a fiddler plays by the stalls. The Journal can be printed or saved as a PDF: a little "what I learned" booklet with every building's code, your errands, letters and land.
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
    errands.ts          review topics and errands for the Notice Board
    expansions.ts       land that opens as errands are solved
    friendship.ts       letters, gifts and building changes for each resident
    life.ts             the bit of life each errand topic brings to the map
    residents.ts  workshop-examples.ts  unsupported.ts  coming-soon.ts
  runner/               the boundary between the game and "something that runs Haskell"
    types.ts            the CodeRunner interface and its result types
    browser.ts          BrowserRunner: checks challenges with the in-browser interpreter
    worker-runner.ts    WorkerRunner: the same, in a Web Worker, with Stop and a 10 s timeout
    worker.ts           the code that runs inside the worker
  haskell/
    interpreter.js      Mini-Haskell: lexer, parser, type checker, lazy evaluator
  game/                 the UI
    state.js            saved progress (localStorage) + helpers
    town.js             the pixel-art map
    sidebar.js          request list, learning library
    errands.js          the Notice Board tab
    schedule.ts         when errands come back (pure functions, tested)
    rewards.ts          map growth, Journal stamps, friendship hearts (pure functions, tested)
    journal.js          the Journal tab and the printable booklet
    friends.js          the Friends panel left of the map (hearts, letters, gifts)
    music.js            market music (Web Audio, no sound files)
    notebook.js         challenge window and Workshop
    highlight.js        syntax highlighting
tests/
  content.test.ts          ids, unlock order, hints… all fit together
  runner-contract.test.ts  every reference solution passes; wrong answers don't
  worker-runner.test.ts    timeouts, Stop, crashes and queueing in WorkerRunner
  schedule.test.ts         Notice Board scheduling: boxes, gaps, retries
  rewards.test.ts          new land, Journal stamps and hearts
docs/                   design notes and the runner API
```

The UI never calls the interpreter directly. Player code runs in a background Web Worker, so slow or endless code can't freeze the page: the Run button turns into **Stop**, and anything still running after 10 seconds is stopped with a friendly explanation. It asks a **`CodeRunner`** to `check` a challenge, `compile`, `evaluate` or `runMain`, and gets plain data back (`CheckResult`, `EvalResult`, …) that it turns into HTML. So swapping the in-browser interpreter for a real GHC backend later only means writing a new runner. See [docs/runner-api.md](docs/runner-api.md).

## Adding a challenge

1. Add an object to the right file in `src/content/challenges/`, or add a new file and list it in `challenges/index.ts`. `src/content/types.ts` documents every field.
2. Give it a `solution`, and tests that the starters fail.
3. Run `npm test`. It checks that your solution passes, that no starter passes, and that the unlock order still works.
4. A new building also needs a plot and a drawing in `src/game/town.js` (`PLOTS` and the draw functions).

## Adding an errand

Add it to `ERRANDS` in `src/content/errands.ts` under an existing topic (or add a topic to `REVIEW_TOPICS`; each topic needs at least two errands, so reviews can vary). Give it a small `starter` that doesn't pass and a `solution` that does; `npm test` checks both. In dev mode (`npm run dev`, or the live site with `?dev` at the end of the address), the DEV panel's **+1 day** button moves the clock forward so you can try the schedule.

## Adding new land

Add an entry to `EXPANSIONS` in `src/content/expansions.ts` with the next `slot` and a larger `needs` (total errands solved), and a drawing in `EXPANSION_ART` in `src/game/town.js`. Slots fill a strip of land west then east of the path; the map grows by one strip whenever a new one is needed, and the unopened half shows as mist. In dev mode, the DEV panel's **Solve errands** and **+1 day** buttons get you there quickly.

## The DEV panel

Under `npm run dev` there's a DEV panel in the bottom-right corner: **Solve next**, **Solve stage**, **Solve errands**, **+3 h** (try the night) and **+1 day** (move the Notice Board's clock). On the live site, add `?dev` to the address to get it, e.g. `https://louisewolff17.github.io/Haskell-Town/?dev`. It changes your saved progress, so use it in a private window if you want to keep your real town.

## Deploying

Every push to `main` runs the tests, builds, and publishes to GitHub Pages (`.github/workflows/deploy.yml`). Turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Status

This is v0.8 of the prototype, moved into a proper project. What the interpreter can't do yet, and what's planned, is in [ROADMAP.md](ROADMAP.md). The original design is in [docs/design.md](docs/design.md).
