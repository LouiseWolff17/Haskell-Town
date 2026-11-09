# Design

A short version of the original design document ("A Little Town, A Lot of Code").

## Core loop

1. A resident has a problem.
2. The player writes a Haskell function to help.
3. Hints are there if needed, revealed one level at a time.
4. The town grows: a new building or decoration.
5. New residents arrive with new problems and new Haskell concepts.

The town is the progress map. There's no level-select menu: residents waiting by their lots are the challenges.

## Principles

- **Every challenge is a small story**, not an exercise with a building stuck on the end.
- **Buildings stand for concepts**: the mailbox is lists, the library is recursion, the clinic is Maybe/Either, the railway is higher-order functions…
- **No penalty for help.** Correctness and help used are tracked separately. Four hints give the same building as zero.
- **Always real Haskell syntax**, even when filling in blanks.
- **Scaffolding fades.** Guided mode gives blanks to fill in, Balanced gives a signature and the tests, Independent gives only the problem. The player can switch at any time.
- **Think like a Haskell programmer**, not just pass exercises.

## Hint levels

| Level | Purpose |
|---|---|
| 1. Concept | Which Haskell idea helps here |
| 2. Direction | How to approach the problem |
| 3. Structure | A partial shape or the relevant syntax |
| 4. Almost there | The individual steps |
| (5.) Solution | The full solution, with an explanation |

## Challenge structure

Story · learning objective · task · examples · editor · tests · hints · explanation · reward. Each field is in `src/content/types.ts`.

## Challenges (v0.8)

| # | Resident | Challenge | Concept | Unlocks |
|---|---|---|---|---|
| 1 | Wren | Wren's Moving Day: `add` | Functions & types | Cottage |
| 2 | Wren | The Mailbox Problem: `countLetters` | Lists | Mailbox + road |
| 3 | Hazel | Bread for the Week: `loavesFor` | Pattern matching | Bakery |
| 4 | Moss | Thirsty Seedlings: `waterAll` | map | Community garden |
| 5 | Bram | Bargain Shelf: `bargains` | filter | General store |
| 6 | Iris | Counting the Pages: `totalPages` | Recursion | Library |
| 7 | Iris | Is It on the Shelf?: `hasBook` | Recursion with guards | Library: bench + lanterns |
| 8 | Juniper | Three Little Classes: `data Grade` | Custom data types | School |
| 9 | Juniper | Birthday Cards: record `Student` | Records | School: flag + swing |
| 10 | Fern | The Welcome Desk: `main` | IO & do blocks | City Hall |
| 11 | Fern | The Town Census | Pure code inside IO | City Hall: fountain |
| 12 | Dr. Sorrel | The Missing Reading: `checkup` | Maybe | Clinic |
| 13 | Dr. Sorrel | Booking Appointments: `bookSlot` | Either | Clinic: herb garden |
| 14 | Pip | Every Train on Time: your own `map` | Higher-order functions | Railway Station |
| 15 | Pip | All Aboard!: `passengersAfter` | Functions as values & folds | Railway: train service |
| 16 | Rowan | Talking Signposts: `Describable` | Type classes | Park |
| 17 | Rowan | The Flower Show: `Eq`/`Ord Flower` | Instances of built-in classes | Park: flower show |
| 18 | Captain Brine | Cargo Crates: `Functor Crate` | Functor | Harbour |
| 19 | Captain Brine | Charting a Course: Maybe `do` | Monads | Harbour: lighthouse |
| 20 | Marigold | Market Day Takings | Semigroup & Monoid | Market |
| 21 | Marigold | Weighing the Crates: `Foldable Tree` | Foldable | Market: crates + scale |
| 22 | Orla | The Endless Star Chart | Laziness & infinite lists | Observatory |
| 23 | Orla | The Twinkling Star | Lists defined by themselves | Observatory: telescope |

Then: the Notice Board's errands (see below).

Unlock order: 1 → 2 → 3 → (4, 5) → 6 → 7 → 8 → 9 → (City Hall 10–11 and Clinic 12–13 in either order) → Railway → Park → Harbour → Market → Observatory.

## After the village: the Notice Board

Building the village once isn't the same as remembering it. When every request is done, residents start pinning **errands** to the Notice Board (the Errands tab). The design follows Carpenter, Pan & Butler (2022), *The science of effective learning with spacing and retrieval practice*:

- **Retrieval practice with feedback.** Errands are solved from memory: no primer, no hints up front. After trying, the player can peek at the topic's Library cards or see the answer, and every solved errand shows a model answer to compare with.
- **Spacing.** Each of the 11 review topics sits in a box. Solving it first time without a peek moves it up a box, and the gap until it comes back grows: 1, 3, 7, 14, 30 days. A peek or a few wrong runs keep the box; seeing the answer sends it back to tomorrow.
- **Successive relearning.** Within a day, a topic is practised until it's solved once from memory: seeing the answer puts a fresh errand on that topic at the end of the day's list.
- **Interleaving and limits.** At most four errands a day, on different topics, in mixed order. When they're done, the board says when the next ones come and why there is no point cramming.
- **Varied problems (transfer).** Each topic has at least two errands, and reviews take turns, so the player applies the idea to a new problem instead of retyping a remembered answer.
- **Metacognition.** Before the first run, the player can guess how sure they are. The board shows how often “Sure” really meant right first time, and the “Why do errands come back?” panel explains why effortful practice feels worse but works better.

The rules are pure functions in `src/game/schedule.ts`, tested in `tests/schedule.test.ts`.

## Learning stages (long term)

1. Guided discovery → 2. Assisted programming → 3. Independent problem-solving → 4. Complex problem-solving → 5. Mastery and creativity: multi-function projects, file IO, refactoring and open-ended programs.

## Technical direction

Game logic stays separate from Haskell execution (see [runner-api.md](runner-api.md)). The long-term goal is real GHC in a sandbox with resource limits, never inside the game client.
