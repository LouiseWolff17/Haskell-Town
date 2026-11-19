# Roadmap

## What the in-browser Haskell can't do yet

The game shows the same list in Library → "What Haskell Town can't do yet". Keep it in sync with `src/content/unsupported.ts`.

1. **Some type class features**: multi-parameter classes, default method signatures, `deriving` beyond Show/Eq/Ord (no `deriving Functor`), instances for tuples or type synonyms like `String` (FlexibleInstances).
2. **Your own Num / Fractional / Read instances.**
3. **Parts of Foldable and Traversable**: `sum`, `length`, `elem`, `maximum`, `foldr` etc. take any Foldable, but there's no Foldable for tuples. Foldable instances must define `foldMap`. `traverse`, `sequenceA`, `mapM` and `sequence` take any Traversable (lists, `Maybe`, `Either e`, your own instances), but there's no Traversable for tuples, and `for` isn't there. No Monoid for functions. `Min`/`Max` are Semigroups only.
4. **Choosing an instance from the result type alone in polymorphic code**, e.g. a user method `empty :: f a` inside a `Container f =>` function. `pure`/`return`/`mempty` do work.
5. **Ambiguous runtime picks**: inside fully polymorphic code, a user class with instances for both `Int` and `Double` may pick the wrong one. `1 <> 2` with no type is a runtime error rather than a type error.
6. **Full laziness**: function arguments, constructor fields, tuples and list items are lazy, and `foldr` stops early, but the results of `map`, `zipWith` and friends on a finite list are worked out straight away (`length (map undefined [1])` fails).
7. **Modules & imports**: only `Data.Map` and `Data.Set` are real modules (used qualified); other `import` lines are ignored, and you can't write your own modules. No `Data.Map` functions beyond the common ones (no `lookupLT`, `elemAt`, `splitLookup` …), and a Map is a sorted array, so adding to a very large one is slow.
8. **Most of IO**: no files, `interact`, `getContents`. `read` / `readLn` only know Int, Double, Bool, Char, String, and lists and tuples of those (no `Maybe` or your own types).
9. **Big numbers**: no arbitrary-precision `Integer` (exact up to 2^53). `Float` = `Double`.
10. **Very deep recursion** can hit the browser's stack limit.
11. **Advanced type features**: GADTs, type families, `forall`, kind signatures, `$!`, strictness annotations (`seq` works).
12. **Display details**: unsigned polymorphic expressions show `Num a => [a]` instead of `[Integer]`, and there are extra parentheses around custom `show` inside constructors.

## Next steps

### Project health
- [x] Commit `package-lock.json` and switch CI to `npm ci`.
- [x] Run player code in a **Web Worker**, with a Stop button and a 10-second timeout, so slow code can't freeze the page.
- [x] Split `src/haskell/interpreter.js` into lexer / parser / types / typecheck / evaluator modules, sharing their mutable state (let-level, fixities, the current data context) through one explicit context object (`src/haskell/context.js`).
- [x] Move `src/game/*.js` to TypeScript, one file at a time. (`src/haskell` is still JavaScript.)
- [x] Browser tests (Playwright) for the main flows: solve a challenge, build, Workshop (`e2e/`).

### Haskell features
- [x] Fuller laziness: lazy function arguments and data fields (`const 1 undefined`, lazy trees), and `seq`. Cheap, safe arguments (`acc + x`, `acc ++ [x]`, `max x m`) are still worked out straight away, so accumulators don't pile up thunks (`tests/laziness.test.ts`).
- [x] Lazy list items and a lazy `foldr` (`length [undefined]`, `foldr (\x _ -> x) 0 [1..]`). A `foldr` that needs the whole list and overflows the stack is redone from the right end, so `foldr (+) 0 [1..100000]` still works.
- [x] `Enum` for `Char` ranges (`['a'..'z']`, `['a', 'c' ..]`); ranges of anything else (`[Just 1 ..]`, `["a".."z"]`) are friendly type errors (`tests/ranges.test.ts`).
- [x] Foldable-generic `sum`, `length`, `elem`, `maximum`, `foldr`, `null`, `any`, `concatMap`, `mapM_` … (lists, `Maybe`, `Either e`, your own instances), keeping the friendly list error messages: `length 'a'` still says `Expected: [a]` with the list tip (`tests/foldable.test.ts`).
- [x] A `Traversable` class and `sequenceA` (Glaschu's mountain bridge, challenges 14–15): `instance Traversable Bridge` with `traverse` or `sequenceA` (it needs Functor and Foldable instances, as in GHC), and `traverse`, `sequenceA`, `mapM`, `forM`, `sequence` over lists, `Maybe`, `Either e` and your own instances, with any Applicative (`tests/traversable.test.ts`).
- [x] `deriving (Enum, Bounded)`, with `succ`/`pred`/`minBound`/`maxBound`/`fromEnum`/`toEnum` (Glaschu's bakehouse): `[minBound .. maxBound] :: [Day]`, `[Sat ..]`, `[Mon, Wed ..]`, also for `Bool`, `Ordering`, `()` and `Char`; only for types whose constructors hold nothing. `minBound`/`maxBound`/`toEnum` need a known type, not a function for any `(Bounded a, Enum a)` (`tests/enum-bounded.test.ts`).
- [x] Record update syntax `p { street = s }` and record patterns (Glaschu's post office): updates can be chained (`r { a = 1 } { b = 2 }`), and patterns can be nested, use only some fields, use puns (`Letter { from }`) or match any constructor (`Circle {}`). Friendly errors for a field given twice, a field of another type, or fields no one constructor has. Not yet: `{..}`, and updates that change a type parameter (`(Box 1 "x") { item = True }`) (`tests/records.test.ts`).
- [x] `Data.Map` and `Data.Set`, with `import qualified … as Map` (Glaschu's library and map room): any alias (`as M`), `Data.Map.Strict`, `Map.Map k v` or `Map k v` in signatures, import lists like `import Data.Map (Map, fromList, (!))`, and `Map.`/`Set.` without an import. About 60 Map and 30 Set functions (`fromList`, `lookup`, `insertWith`, `adjust`, `alter`, `foldrWithKey`, `!`, `!?`, `union`, `keysSet` …); Maps and Sets can be shown (as `fromList […]`), compared, folded (`sum`, `length` … over a Map's values), `fmap`ped and `traverse`d (Maps), and joined with `<>`. Values a Map function works out are worked out straight away, as in `Data.Map.Strict`. `C.toUpper` after `import qualified Data.Char as C` works too. Friendly errors for `import Data.Map` on its own, an unknown alias and a module Haskell Town doesn't have (`tests/containers.test.ts`).
- [x] `unfoldr` (Glaschu's dairy): `unfoldr :: (b -> Maybe (a, b)) -> b -> [a]`, with or without `import Data.List (unfoldr)`. Lazy, so an unfold that never stops works with `take` and `takeWhile` (`tests/unfoldr.test.ts`).
- [x] `readLn` / `read`, and an IO loop that waits for input each time (Glaschu's Town House): `readLn :: Read a => IO a`, and `read` now also reads `Char`, `String`, lists and tuples (`read "[1,2,3]" :: [Int]`), and a number whose type is only settled later (`let x = read s` used as a Double). When `main` asks for a line that hasn't been typed, the run reports `waiting` (`RunOutput.waiting`) instead of failing; the Workshop then shows an input line in the console, and each line typed there runs `main` again from the start with that line added, so it looks as if the program waited. Typed lines are shown in place (`RunOutput.reads`). Challenge IO tests still fail with "no more input". New Workshop example: the town meeting (`tests/io-input.test.ts`, `e2e/workshop.spec.ts`).

### Learning
- [x] Spaced retrieval practice after the village is built: the Notice Board (`src/game/schedule.ts`).
- [x] Use the Notice Board's data (lapses, calibration) to suggest which topics to revisit in the Library (`revisitSuggestions` in `src/game/schedule.ts`).
- [x] More errands per topic, and errands that mix two topics: 52 errands, three plain ones per topic and one that mixes in a second topic (`mix` in `src/content/errands.ts`, e.g. recursion + Maybe, IO + recursion). Mixed errands come last in each topic's turn (`errandTurns` in `src/game/schedule.ts`), show both topics on the Notice Board, and a peek shows both topics' Library cards. A retry after seeing an answer is always a plain errand not yet met that day. Every errand's model answer is now run against its tests (`tests/content.test.ts`).
- [x] Larger multi-function projects at City Hall (design doc stage 5: mastery and creativity): once the village is built, Mayor Fern hands out three projects in turn, each a whole program in one file built over 5–6 steps, ending with an interactive `main` (the Tree Vote; Pip's Timetable Board; Hazel's Order Book). Every run checks all the steps so far (earlier steps act as regression tests), Reset goes back to the last step that passed, and a finished project stays open for refactoring, with ideas to extend it and a copy to the Workshop. Bunting on City Hall and a Journal page for each (`src/content/projects.ts`, `src/game/project-rules.ts`, `tests/projects.test.ts`, `e2e/projects.spec.ts`). Along the way, a parser fix: a multi-line `if`/`case` statement in a `do` block whose nested `do` has a `<-` is no longer read as a bind.

### Rewards (see the rewards design note)
- [x] Map growth from errands: new land south of the railway (`src/content/expansions.ts`).
- [x] The Journal: a page per building with your code, errand stamps, and the land you've opened.
- [x] Friendship with residents: hearts from their errands, letters in Wren's mailbox, gifts, and a lasting change to their building.
- [x] Life in town: one atmospheric touch per building (birds, chimney smoke, people walking), and a day/night cycle from the Observatory.

- [x] Market music (Web Audio) and a printable Journal booklet.

### Gifts become items (see [docs/gift-items-design.md](docs/gift-items-design.md))
Ordered by the design's suggested build order.

**1. Satchel and town interiors**
- [x] 🎒 Satchel button on the map (appears with the first gift), listing unused items; pick one and valid targets glow, wrong targets give a gentle line and nothing is lost.
- [x] Used places can be revisited (buildings through their front door, other places by clicking them or from the Satchel's list); optional `use spareKey wrensCottage` toast.
- [x] Rewrite the gift notes so each hints where it goes (Fern's key keeps its twist; Iris's bookmark, Sorrel's plasters and Marigold's honey say "For your travels").
- [x] Five town interiors you walk into through the front door (the map becomes the room, the doormat leads back out): Wren's cottage, the bakery kitchen (croissant recipe), the library reading room (Moss's sunflower as a bookmark), the general store (Bram's 10% card), City Hall (Fern's key).
- [x] Brine's little boat (Juniper's star) as a pixel-art scene too: go aboard from the shore below the pier, the gangplank leads back ashore; the star, the wheel and a line over the side. Talking to Brine plays a cut-scene that sails out to sea, and talking to him again sails home.
- [x] Give Brine's boat a paddle wheel on each side instead of a sail: on the map (his lasting change by the harbour), in the boat scene, and in the cut-scene out to sea, with the wheels turning while it moves (see the decisions in [docs/gift-items-design.md](docs/gift-items-design.md)). A funnel amidships replaces the mast, puffing harder under way; the wheels rest at the pier, spin up as Brine casts off and churn white water at sea; and they can be looked at aboard (`🛞 The paddle wheels`).
- [x] Given-away items stay in the Journal as a memory: Iris's bookmark, Sorrel's plasters and Marigold's honey know who they go to in Glaschu (`givenTo` in `src/content/items.ts`); once given (`giveAway` in `src/game/satchel.ts`, for now from the DEV panel) they leave the Satchel and get a "Given away" page in the Journal, a line on the gift in the Friends panel, and a section in the printed booklet.

**2. Coins and the store**
- [x] 🪙 Coin counter next to the Satchel, one purse shared with Glaschu; a fixed amount per errand: 5 coins for every errand solved, whatever the outcome (`COINS` in `src/content/friendship.ts`). Errand coins are worked out from the errand log, so they can't be lost and earlier errands count too; sold finds and purchases go in a small ledger (`state.purse`, `earn`/`spend` in `src/game/purse.ts`). The counter appears with the first errand, hops when it changes, and the errand's win box shows `+5 coins`. Bram's lines now say his till isn't ready for them yet.
- [x] Bram's store: buy things (10% off with the card) and sell all finds at a standard price. The shelf has a Buy button on each thing at its card price (`tenOff`, rounded in your favour, the same as in the till's Haskell), with a receipt line like `tenOff 30  -- 27 coins`; not enough coins gets a kind line from Bram and nothing is spent. Bought things wait in the Satchel under "From Bram's store" (`state.bought`). Finds (shells, honey, fish, flowers, vegetables, each with a standard price in `src/content/finds.ts`) wait in the Satchel under "Finds" (`state.finds`, `addFind` in `src/game/purse.ts`), and Bram's till buys them all in one go (`sum [3 * 2, 1 * 4]  -- 10 coins`). Nothing hands out finds yet (that comes with the beach, the hives, the sea and the garden); the DEV panel has Finds and +20 🪙 buttons to try it.
- [x] Decorations placed anywhere on open ground in a Decorate mode, snapping to a grid; movable, saved with positions; lamp posts light up at night. Bram's shelf has a "For around town" row (lamp post, bench, flower pot, fence, birdbath, signpost, well, stepping stones; `src/content/decorations.ts`) at the card price with the same receipt line. Bought ones wait in the Satchel under "🪴 Decorations" (`state.decor`, a list of `{ kind, x?, y? }`: no position = still in the Satchel). The 🪴 Decorate button on the map (once you own one) switches clicks from walking to placing: pick a decoration from the tray or the Satchel and a green/red footprint follows the mouse on an 8 px grid, with dots on the open ground and a line saying why a spot won't do (the road, a front path, a tree, the lot a building will go on…). Click a placed one to move it; Put in satchel takes it off the map; Esc cancels. The keyboard works too (arrows move a cell, Enter sets it down, Delete puts it away). Decorations are solid except stepping stones, and lamp posts glow after dark. Rules in `src/game/decor-rules.ts` (`tests/decor.test.ts`), the mode and art in `src/game/decor.ts`, the map side in `town.ts` (`e2e/decorate.spec.ts`). Not yet: turning things round, and decorating the errand lands south of the railway (their art fills them; bought land will be open ground).
- [x] Useful things: seeds, a better fishing rod, a bigger satchel (gifts never take slots). Bram's shelf has a "Useful things" row (`src/content/useful.ts`) at the card price with the same receipt line: seed packets (as many as you like; they wait in the Satchel under "🧰 Useful things" for the garden plot) and, bought once and kept for good, the fishing rod (it waits for fishing at sea) and the bigger satchel (`slots = 40`, shown as `✓ yours` once bought). Seeds moved off the ordinary shelf, and seeds bought there earlier move over (`state.useful`). The Satchel now has slots (`SATCHEL_SLOTS`, 20, 40 with the bigger satchel, shown as `12 of 20` in its header and on the shelf): every find, shelf thing, seed packet and decoration waiting in it takes one; gifts, the rod and the bigger satchel never do. A full satchel only turns new things away: Bram says so kindly (`length satchel == 20  -- full`, with a hint at the bigger satchel) and nothing is spent, and `addFind` puts in only what fits and says how many. Selling finds or setting decorations down makes room, and putting a decoration back in is always allowed, even when full. Slot rules in `src/game/rewards.ts` (`slotsUsed`, `roomFor`), the satchel side in `src/game/purse.ts`; the DEV panel has a Useful button.
- [ ] Your garden plot by Wren's cottage: seeds grow over real days, nothing wilts.

**3. Magical and world places** (an item placed in the world becomes a doorway)
- [x] Inside the beehives (Rowan's tulip) as pixel-art rooms: three hives in the meadow, each its own room at bee size (the nursery, the honey store with its `<>` nectar cell, the queen's hive with the waggle dance), a shrinking-down cut-scene on the way in, and a tulip petal as the way back. The Journal remembers which hives you've been in.
- [ ] Collect honey in the honey store to sell (needs coins and finds in the Satchel).
- [ ] The open sea and fishing from Brine's boat (Juniper's sticker), catches as `Maybe Fish`.
- [x] The magical beach through Brine's conch at the Duck Pond as a pixel-art scene: a warm wave washes you there (a cut-scene) and the conch on the sand takes you back. The waves (`repeat wave`), a hermit crab, a rock pool, and shells washing up forever on the tideline, one per look, as `take n (cycle shells)`. The Journal counts the shells you've found.
- [ ] Collect shells on the beach to sell (needs coins and finds in the Satchel).
- [ ] A few finds per day per place; residents pay more for their own thing (fish → Brine, honey → Marigold, shells → Juniper, garden produce → Moss/Hazel).

**4. Bigger things and a growing map**
- [ ] Extra buildings and upgrades bought with coins (commissioned at City Hall or ordered from Bram); placed anywhere with a green/red footprint outline, movable later. Challenge buildings stay earned with code.
- [ ] Every bought building brings a new plot of land; Fern also sells 📜 land deeds (rising prices, pick the north/west/south edge).
- [ ] New land reuses the strip-and-slot system in `src/content/expansions.ts`; errand land and bought land stay separate.
- [ ] Map scrolling (drag to pan, maybe zoom) with a minimap or "back to the town square" button.
- [ ] Journal lists bought plots; the printable booklet gets a "your town" page.

**5. Observatory planet**
- [ ] Orla's telescope opens the view to the planet (Snah & Lime). Gameplay on hold until Louise's idea is written down.

### Glaschu — Chapter 2 (see [docs/glaschu-design.md](docs/glaschu-design.md))
The interpreter work it needs is listed under Haskell features above and can start in parallel.

- [ ] Pip's golden ticket and the morning train to Glaschu Station, arriving to an almost empty city.
- [ ] Tansy (helped by Sorrel's plasters) as your first friend and guide; Barley needs Marigold's honey; Iris's bookmark opens Heather's library.
- [ ] 16 residents, each with hearts, letters, gifts and a lasting change.
- [ ] 27 challenges in 6 stages (16 buildings + 11 upgrades):
  - [ ] Stage 1 — Arrival: binary search trees, `foldr`/`foldl`/`scanl`, Enum & Bounded, Char ranges.
  - [ ] Stage 2 — Letters and maps: records, `Data.Map`, graph search.
  - [ ] Stage 3 — Applicative and Traversable, custom error types with `Either`.
  - [ ] Stage 4 — Reader, Writer and State built by hand.
  - [ ] Stage 5 — Unfolds, laws and property checks.
  - [ ] Stage 6 — Capstones: parser combinators and an interactive IO program.
- [ ] 32 errands (2 per resident topic) on the Notice Board schedule, earning hearts and coins.
- [ ] Four errand lands: Pine Forest (4), Loch Shore (10), The High Pass (18), Hot Springs (28).
- [ ] Thistle's Forge as the shop (mountain decorations and useful things; buys finds); Muir sells land deeds.
- [ ] Two-way gifts back to Haskell Town (Thistle's fishing hook, Bracken's goat-bell, Linnet's songbook, Muir's twin-town charter); write the remaining gifts, letters and lasting changes.
- [ ] Settle the open questions: residents and stage order, difficulty curve, overall size.

### Real GHC
- [ ] A sandboxed GHC service implementing the [runner API](docs/runner-api.md), and a `GhcRunner` that passes `tests/runner-contract.test.ts`.
