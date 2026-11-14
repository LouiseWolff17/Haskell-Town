# Glaschu — the mountain city (Chapter 2 draft, 2026-11-14)

Builds on [gift-items-design.md](gift-items-design.md) (how you get there and the gifts that land here) and `prototype-v0.1-notes.md` (what Chapter 1 teaches and what the interpreter can't do yet).

## Overview
- **Glaschu** is a stone-and-slate city up in the mountains, reached by Pip's morning train (the 🎫 golden ticket). Steep streets, a cable car, a loch, snowy peaks, pine forest.
- **A little bigger than Haskell Town:** 16 residents (Haskell Town has 13), 27 challenges (Haskell Town has 23), and a bigger starting map.
- **It works like the first town:**
  - You build the city by solving challenges.
  - Each resident has hearts, letters, gifts and a lasting change.
  - Each resident owns one errand topic, with 2 errands each: 32 errands in total.
  - Errands open new land around Glaschu (section 5).
- **Its own shop and its own land deeds** (section 6). The coin purse is shared with Haskell Town.
- **Chapter 1 ends** with Functor/Monad, Monoid/Foldable and laziness. **Chapter 2** takes the player from "I can write Haskell" to "I can build real programs in Haskell": folds, data structures, Applicative and Traversable, monads you build yourself, and two capstones (a parser and an interactive program).

## 1. Arriving
- The train pulls into **Glaschu Station** and there's almost nothing there yet, like Wren's empty road at the start of Chapter 1.
- **Tansy**, a 9-year-old who loves climbing, has fallen and scraped her knee by the station. **Sorrel's plasters** fix her up. She becomes your first Glaschu friend and shows you around.
- The first challenges rebuild the city from the station outward, up the hill.

## 2. Residents

| # | Resident | Who they are | Building | Errand topic |
|---|---|---|---|---|
| 1 | **Tansy** | 9 years old, climbs everything, your guide | Treehouse | Trees (binary search trees) |
| 2 | **Corrie** | Runs the cable car up the mountain | Cable car station | Folds |
| 3 | **Barley** | The baker, needs honey for the festival honey cakes | Bakehouse | Enum, Bounded & ranges |
| 4 | **Flint** | The postmaster, precise about everything | Post office | Records |
| 5 | **Heather** | The librarian, Iris's pen-pal for 30 years | Glaschu Library | Data.Map |
| 6 | **Gorse** | Mapmaker, walks every mountain trail | Map room | Searching paths |
| 7 | **Thistle** | Blacksmith, runs the ironmonger's shop | The Forge (the shop) | Applicative |
| 8 | **Alder** | Bridge builder | The mountain bridge | Traversable |
| 9 | **Loch** | Ferry keeper on the loch | Ferry pier | Errors with Either |
| 10 | **Sloe** | Innkeeper, has a rule for everything | The Inn | Reader |
| 11 | **Linnet** | Leads the town choir | Music hall | Writer |
| 12 | **Birch** | Keeps the weather station | Weather station | State |
| 13 | **Bracken** | Goatherd and cheesemaker | Dairy | Unfolds (`iterate`, `unfoldr`) |
| 14 | **Kestrel** | Falconer and lookout | Lookout tower | Laws and property checks |
| 15 | **Saxifrage** ("Saxi") | Mountain guide who reads the old trail signs | Guide hut on the pass | Parsers |
| 16 | **Muir** | The provost (mayor) of Glaschu | The Town House | IO programs |

Names follow Haskell Town's habit of plants and birds, but highland ones (heather, gorse, thistle, linnet, kestrel, saxifrage). Corrie, Loch and Muir are Scottish landscape words, to match the name Glaschu.

### The three already in the story
- **Tansy:** the hurt girl. Her treehouse is a binary tree in the most literal sense: every branch has a left and a right.
- **Barley:** the baker. The mountain bees sleep through the cold, so there's no honey for the festival honey cakes, until you bring **Marigold's meadow honey**.
- **Heather:** the librarian. She and Iris have written to each other for 30 years, and **Iris's silk bookmark** gets you into her library.

## 3. Challenges (27)
Stages unlock in order, and within a stage the buildings can be done in either order (like City Hall and the Clinic in Chapter 1). As in Chapter 1, a building's first challenge builds it and a second adds an upgrade.

### Stage 1 — Arrival (a warm-up from Chapter 1)
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 1 | Tansy | Up the Tree — `data Tree = Leaf \| Node Tree Int Tree`, `insert :: Int -> Tree -> Tree` | Binary search trees | **Treehouse** |
| 2 | Tansy | Is It Up There? — `member :: Int -> Tree -> Bool`, `toList` in order | Searching a tree | Treehouse: rope ladder |
| 3 | Corrie | Every Cabin, Right to Left — `foldr` your own `map` and `filter` | `foldr` | **Cable car station** |
| 4 | Corrie | Counting Up the Hill — `foldl` vs `foldr`, running totals with `scanl` | `foldl`, `scanl` | Cable car: a second cabin |
| 5 | Barley | Bread for Every Day — `data Day = Mon \| … deriving (Enum, Bounded)`, `[minBound .. maxBound]`, `succ` | Enum & Bounded | **Bakehouse** |
| 6 | Barley | Letters on the Loaves — `['a'..'z']`, `zip` labels onto loaves | Char ranges | Bakehouse: festival oven |

### Stage 2 — Letters and maps
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 7 | Flint | Change of Address — record update syntax `p { street = s }` | Record update | **Post office** |
| 8 | Flint | Reading the Envelope — record patterns `f (Letter { to = t })` | Record patterns | Post office: sorting room |
| 9 | Heather | The Card Catalogue — `Map.fromList`, `Map.lookup`, `Map.insert` | Data.Map | **Glaschu Library** |
| 10 | Heather | Books Out, Books Back — `Map.adjust`, `Map.insertWith`, `Map.foldrWithKey` | Updating a Map | Library: reading tower |
| 11 | Gorse | Every Trail From Here — paths in a trail graph stored as a `Map`, with a visited `Set` | Graph search | **Map room** |

### Stage 3 — Applicative and Traversable
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 12 | Thistle | Made to Order — `Order <$> name <*> size <*> metal`, all `Maybe` | Applicative | **The Forge** (the shop opens) |
| 13 | Thistle | Every Field Checked — `liftA2`, validation with `Either String` | Applicative with Either | Forge: shop sign + anvil |
| 14 | Alder | Plank by Plank — `instance Traversable Bridge` | Traversable | **The mountain bridge** |
| 15 | Alder | Will It Hold? — `traverse checkPlank`: one bad plank → `Nothing` | `traverse`, `sequenceA` | Bridge: lanterns along it |
| 16 | Loch | Rough Water — your own `data FerryError = …` and `Either FerryError` chains | Custom error types | **Ferry pier** |

### Stage 4 — Monads you build yourself
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 17 | Sloe | House Rules — `newtype Reader r a`, instances, `ask` | Reader | **The Inn** |
| 18 | Sloe | Every Room Knows the Rules — rooms that read the same rules with `do` | Using Reader | Inn: a lit sign + chimney smoke |
| 19 | Linnet | The Choir Book — `newtype Writer w a`, `tell` (with a Monoid `w`) | Writer | **Music hall** |
| 20 | Birch | Tomorrow's Weather — `newtype State s a`, `get`, `put`, `modify` | State | **Weather station** |
| 21 | Birch | A Week of Weather — `replicateM 7 nextDay`, `evalState` | Running State | Weather station: wind vane + snow |

### Stage 5 — Unfolding and laws
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 22 | Bracken | The Herd Grows — `iterate`, `unfoldr :: (b -> Maybe (a, b)) -> b -> [a]` | Unfolds | **Dairy** |
| 23 | Kestrel | Sharp Eyes — check `fmap id == id` and `(a <> b) <> c == a <> (b <> c)` on many inputs | Laws and property checks | **Lookout tower** |
| 24 | Kestrel | The Falcon Never Lies — write your own checker, e.g. `forAll :: [a] -> (a -> Bool) -> Bool` | Property testing | Lookout: a falcon circling |

### Stage 6 — Capstones
| # | Resident | Challenge | Concept | Builds |
|---|---|---|---|---|
| 25 | Saxi | The Old Trail Signs — `newtype Parser a = Parser (String -> Maybe (a, String))`, with Functor/Applicative/Monad | Parser combinators | **Guide hut on the pass** |
| 26 | Saxi | Reading the Whole Mountain — `many`, `<\|>` (your own `class Alternative`), parse a full trail sign into data | Combining parsers | Guide hut: a signpost forest |
| 27 | Muir | The Town Meeting — an interactive `main`: a loop with `getLine`, `readLn`, `when`, `mapM_`, until "goodbye" | Full IO programs | **The Town House** |

Totals: 16 residents, 27 challenges, 16 buildings plus 11 upgrades.

## 4. Errands and friendship
- Each resident owns the topic in the residents table: 16 topics × 2 errands = **32 errands**, on the same spaced-practice schedule as Haskell Town's Notice Board.
- Same rules: 1 heart per errand (max 4), ♥1 letter, ♥2 gift, ♥4 lasting change. Hints and outcome never matter.
- Errands also earn coins, the same as in Haskell Town.
- Some Glaschu gifts should go **back to Haskell Town** (two-way chains). Ideas:
  - Thistle forges a **fishing hook** → a rare fish in Haskell Town's sea.
  - Bracken's **goat-bell** → goats join Moss's sheep in the Wildflower Meadow.
  - Linnet's **songbook** → new songs for the Market's music box.
  - Muir's **twin-town charter** → a "Twinned with Glaschu" sign by Fern's City Hall.
- The rest of the gifts, letters and lasting changes are still to be written.

## 5. Land around Glaschu (from errands)
Like Haskell Town's four errand lands:

| Land | Errands solved | Resident |
|---|---|---|
| Pine Forest (red squirrels, a woodcutter's path) | 4 | Tansy |
| Loch Shore (a rowing boat, herons) | 10 | Loch |
| The High Pass (snow, a mountain hut) | 18 | Saxi |
| Hot Springs (steam, a bathhouse) | 28 | Birch |

## 6. Shop, coins and land
- **The shop:** Thistle's Forge, once challenge 12 builds it. It sells mountain things:
  - Decorations: iron lanterns, stone cairns, tartan bunting, a sledge, a snowman kit.
  - Useful things: ice-fishing gear for the frozen loch, climbing boots for the High Pass, a warm scarf.
  - Glaschu buys finds too: **Thistle buys everything**, and residents pay more for their own thing (fish → Loch, cheese and milk → Bracken, pine cones → Tansy).
- **Coins:** the same purse as Haskell Town, so coins earned in one city can be spent in the other.
- **Land deeds:** sold by **Muir** at the Town House, working the same way as Fern's deeds, with their own price ladder.
- **Bought buildings** can go anywhere in Glaschu, as in Haskell Town. Mountain ones could include a ski hut, a curling rink, a bothy, or a pub with a fiddler.

## 7. What the interpreter needs first
Parts of Chapter 2 rely on things Haskell Town can't do yet (see the "NOT supported yet" list in `prototype-v0.1-notes.md`):

| Needed for | Runner work |
|---|---|
| Barley (5, 6) | `deriving (Enum, Bounded)`, `succ`/`pred`/`minBound`/`maxBound`, Char ranges `['a'..'z']` |
| Flint (7, 8) | Record update syntax and record patterns |
| Heather, Gorse (9–11) | `Data.Map` and `Data.Set` (and `import qualified … as Map`) |
| Alder (14, 15) | A `Traversable` class and `sequenceA` |
| Bracken (22) | `unfoldr` |
| Saxi (26) | Fine as is: players write their own `Alternative` class |
| Muir (27) | `readLn` / `read`, and an IO loop that waits for input each time |

- Stages 4 and 6 (Reader, Writer, State, parsers) already work: they're `newtype`s with your own Functor/Applicative/Monad instances, which Haskell Town supports today.
- Stage 1 needs only the Enum work; stage 2 needs records and `Data.Map`.

## Open questions
1. Do the residents, their personalities and the order of the stages feel right?
2. Should Glaschu's challenges be harder overall, or keep the same gentle curve as Chapter 1?
3. Is 27 challenges + 32 errands the right size, or should it be closer to Haskell Town's (23 + 26)?
