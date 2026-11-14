# Roadmap

## What the in-browser Haskell can't do yet

The game shows the same list in Library → "What Haskell Town can't do yet". Keep it in sync with `src/content/unsupported.ts`.

1. **Some type class features**: multi-parameter classes, default method signatures, `deriving` beyond Show/Eq/Ord (no `deriving Functor`), instances for tuples or type synonyms like `String` (FlexibleInstances).
2. **Your own Num / Fractional / Read instances.**
3. **Parts of Foldable and Traversable**: `sum`, `length`, `elem`, `maximum`, `foldr` etc. only take lists. Foldable instances must define `foldMap`. `traverse`/`mapM`/`sequence` only work over lists (there's no `Traversable` class). No Monoid for functions. `Min`/`Max` are Semigroups only.
4. **Choosing an instance from the result type alone in polymorphic code**, e.g. a user method `empty :: f a` inside a `Container f =>` function. `pure`/`return`/`mempty` do work.
5. **Ambiguous runtime picks**: inside fully polymorphic code, a user class with instances for both `Int` and `Double` may pick the wrong one. `1 <> 2` with no type is a runtime error rather than a type error.
6. **Record patterns** like `f (Student { name = n })`.
7. **Full laziness**: only lists are lazy. `const 1 undefined` fails, and there are no character ranges (`['a'..'z']`).
8. **Modules & imports**: `import` lines are ignored, and there's no `Data.Map`.
9. **Most of IO**: no files, `interact`, `getContents`, `readLn`.
10. **Big numbers**: no arbitrary-precision `Integer` (exact up to 2^53). `Float` = `Double`.
11. **Very deep recursion** can hit the browser's stack limit.
12. **Advanced type features**: GADTs, type families, `forall`, kind signatures, `seq`, strictness.
13. **Display details**: unsigned polymorphic expressions show `Num a => [a]` instead of `[Integer]`, and there are extra parentheses around custom `show` inside constructors.

## Next steps

### Project health
- [x] Commit `package-lock.json` and switch CI to `npm ci`.
- [x] Run player code in a **Web Worker**, with a Stop button and a 10-second timeout, so slow code can't freeze the page.
- [x] Split `src/haskell/interpreter.js` into lexer / parser / types / typecheck / evaluator modules, sharing their mutable state (let-level, fixities, the current data context) through one explicit context object (`src/haskell/context.js`).
- [x] Move `src/game/*.js` to TypeScript, one file at a time. (`src/haskell` is still JavaScript.)
- [x] Browser tests (Playwright) for the main flows: solve a challenge, build, Workshop (`e2e/`).

### Haskell features
- [ ] Fuller laziness: lazy function arguments and data fields (`const 1 undefined`, lazy trees).
- [ ] `Enum` for `Char` ranges (`['a'..'z']`).
- [ ] Foldable-generic `sum`, `length`, `elem` …, keeping the friendly list error messages.
- [ ] A `Traversable` class and `sequenceA` (Glaschu's mountain bridge, challenges 14–15).
- [ ] `deriving (Enum, Bounded)`, with `succ`/`pred`/`minBound`/`maxBound` (Glaschu's bakehouse).
- [ ] Record update syntax `p { street = s }` and record patterns (Glaschu's post office).
- [ ] `Data.Map` and `Data.Set`, with `import qualified … as Map` (Glaschu's library and map room).
- [ ] `unfoldr` (Glaschu's dairy).
- [ ] `readLn` / `read`, and an IO loop that waits for input each time (Glaschu's Town House).

### Learning
- [x] Spaced retrieval practice after the village is built: the Notice Board (`src/game/schedule.ts`).
- [x] Use the Notice Board's data (lapses, calibration) to suggest which topics to revisit in the Library (`revisitSuggestions` in `src/game/schedule.ts`).
- [ ] More errands per topic, and errands that mix two topics.
- [ ] Larger multi-function projects at City Hall (design doc stage 5: mastery and creativity).

### Rewards (see the rewards design note)
- [x] Map growth from errands: new land south of the railway (`src/content/expansions.ts`).
- [x] The Journal: a page per building with your code, errand stamps, and the land you've opened.
- [x] Friendship with residents: hearts from their errands, letters in Wren's mailbox, gifts, and a lasting change to their building.
- [x] Life in town: one atmospheric touch per building (birds, chimney smoke, people walking), and a day/night cycle from the Observatory.

- [x] Market music (Web Audio) and a printable Journal booklet.

### Gifts become items (see [docs/gift-items-design.md](docs/gift-items-design.md))
Ordered by the design's suggested build order.

**1. Satchel and town interiors**
- [ ] 🎒 Satchel button on the map (appears with the first gift), listing unused items; pick one and valid targets glow, wrong targets give a gentle line and nothing is lost.
- [ ] Used places get a door marker on the map so they can be revisited; optional `use spareKey wrensCottage` toast.
- [ ] Rewrite the gift notes so each hints where it goes (Fern's key keeps its twist; Iris's bookmark, Sorrel's plasters and Marigold's honey say "For your travels").
- [ ] Five town interiors as scene cards: Wren's cottage, the bakery kitchen (croissant recipe), the library reading room (Moss's sunflower as a bookmark), the general store (Bram's 10% card), City Hall (Fern's key).
- [ ] Given-away items stay in the Journal as a memory.

**2. Coins and the store**
- [ ] 🪙 Coin counter next to the Satchel, one purse shared with Glaschu; a fixed amount per errand.
- [ ] Bram's store: buy things (10% off with the card) and sell all finds at a standard price.
- [ ] Decorations placed anywhere on open ground in a Decorate mode, snapping to a grid; movable, saved with positions; lamp posts light up at night.
- [ ] Useful things: seeds, a better fishing rod, a bigger satchel (gifts never take slots).
- [ ] Your garden plot by Wren's cottage: seeds grow over real days, nothing wilts.

**3. Magical and world places** (an item placed in the world becomes a doorway)
- [ ] Inside the beehives (Rowan's tulip): pick a hive — nursery, honey store, queen's hive — with a tulip petal as the way back; collect honey.
- [ ] The open sea and fishing from Brine's boat (Juniper's sticker), catches as `Maybe Fish`.
- [ ] The magical beach through Brine's conch at the Duck Pond, with endless shells.
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
