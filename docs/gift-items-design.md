# Haskell Town — gifts become items (draft, 2026-11-14)

Builds on `rewards-design.md`. Today the ♥2 gifts only sit in the Journal. Here each gift becomes an **item you can use** to open a new place, so friendship keeps opening up the world after the village and its land are done.

Core rules (same spirit as the rewards design):
- No failure and no lock-out. Using an item in the wrong place does nothing bad, and no item can be lost or wasted.
- Every item's Journal note hints where it goes, so players don't have to guess.
- Items that are given away (plasters, honey) stay in the Journal as a memory ("Given to Barley, the baker in Glaschu").

## Decisions (2026-11-14)
- **Tulip bulb:** a magical way *into* the beehives. You shrink to bee size and step inside. **You pick which hive**, and each hive is a different room (2a).
- **Moss's sunflower:** used as a **bookmark** in the library, which lets you into the reading room. (Iris's silk bookmark is the one for Glaschu's library.)
- **Fern's key:** keeps the twist. The note says it doesn't open anything, and then it opens City Hall (section 3).
- **Money:** the currency is **coins**. You earn them **from errands and from selling things you find** (fish, shells, honey). You can sell **both** at Bram's store and to the resident each find belongs to (section 7).
- **What coins buy:** all three kinds: **decorations**, **useful things** (seeds, a better fishing rod, a bigger satchel) and **bigger things** (new buildings and upgrades). Section 8.
- **Decorations and bought buildings can both be placed anywhere** on open ground, snapping to a grid.
- **The map grows two ways (8d):** **every** bought building comes with a new plot of land, and land can also be bought on its own as a **land deed** from Fern.
- **Seeds** are planted in **your own garden plot** by Wren's cottage.
- **The planet:** Louise has a specific gameplay idea. **On hold**: don't design the planet's gameplay yet. Only the way there (the telescope) is decided.
- **The mountain city is called Glaschu.** It's **a little bigger than Haskell Town**, has **its own residents with hearts, letters, gifts and lasting changes**, and has **its own shop and land deeds**. Full design in **[glaschu-design.md](glaschu-design.md)** (section 5).

## 1. The mechanic: the Satchel
- A **🎒 Satchel** button on the map appears with the first gift. It lists the items you have that haven't been used yet.
- Pick an item and valid targets on the map glow softly. Click one to use it. Click anything else and you get a gentle line ("The key doesn't fit here."), then the item goes back in the satchel.
- After use, the place opens. Its icon on the map gets a small door marker so it can be visited again.
- Optional Haskell touch: the use shows a line like `use spareKey wrensCottage` in the toast, making items feel like values and using one feel like function application. It's purely decorative.
- The satchel also holds **things you find** (fish, shells, honey) until you sell them (section 7), and **things you've bought** (seeds, decorations not yet placed). Gifts can't be sold.
- The satchel has a limited number of slots for finds and bought things; a bigger satchel can be bought (section 8). Gifts never take up slots, so a full satchel never blocks progress.

## 2. Every gift, where it goes, and what it opens

| Resident | Item | Use it on | Needs first | Opens | Where |
|---|---|---|---|---|---|
| Wren | 🔑 Spare key | Wren's cottage door | — | Wren's cottage (tea, visit) | Town |
| Hazel | 🥐 Croissant recipe | Bakery | — | Bakery kitchen | Town |
| Moss | 🌻 Pressed sunflower | Library | — | Used as a bookmark: the library reading room | Town |
| Bram | 🧾 Discount card | General store | — | Inside the store: shopping with 10% off | Town |
| Fern | 🗝️ Key to the town | City Hall | — | City Hall rooms | Town |
| Rowan | 🌷 Tulip bulb | The beehives in the Wildflower Meadow | Wildflower Meadow (3 errands) | **A magical way inside the hives**: you shrink down and step into the hive you pick (see 2a) | Town land, magical |
| Juniper | ⭐ Gold star sticker | Brine's little boat | Brine ♥4 (boat at the pier) | The open sea + fishing | Town coast |
| Brine | 🐚 Conch shell | Duck Pond | Duck Pond (15 errands) | Magical beach (the shell stays at the pond's edge and is the way there and back) | Secret place |
| Orla | 🔭 Brass telescope | Observatory telescope | — | Telescope view → the ominous planet (Snah & Lime). Gameplay on hold | Space |
| Pip | 🎫 Golden ticket | Railway station | — | Train to Glaschu | Glaschu |
| Iris | 🔖 Silk bookmark | Glaschu Library | Golden ticket | Heather's library (Iris's pen-pal of 30 years) | Glaschu |
| Sorrel | 🩹 Plasters | Tansy, by Glaschu Station | Golden ticket | Helps her; she becomes your first Glaschu friend and guide | Glaschu |
| Marigold | 🍯 Meadow honey | Barley, Glaschu's baker | Golden ticket | Honey for the festival honey cakes | Glaschu |

### 2a. Inside the beehives (the tulip)
- Planting the tulip by the hives makes it bloom. From then on, the tulip is the magic doorway.
- **You pick which hive to go into.** Every hive in the meadow can be clicked, and each one is a different room at bee size:
  - **The nursery hive:** tiny larvae tucked in their cells, nurse bees humming lullabies.
  - **The honey-store hive:** shelves of capped honeycomb glowing gold. This is where you collect honey to sell.
  - **The queen's hive:** the queen on her comb, who has heard all about you.
  - More hives could be added later, or bought as an upgrade for the meadow.
- Entering one: the view swirls and shrinks, and you're inside, with walls of golden honeycomb, warm light and bees busy at work. A small label names the hive, and the Journal remembers which ones you've visited.
- The way back is a tulip petal by the hive's entrance (the same idea as the conch shell at the pond).
- The magical places then share one pattern: **an item placed in the world becomes a doorway** (tulip → hives, conch → beach, telescope → planet).

### Chains this creates
- **Tulip → inside the hives → honey.** Marigold's honey note already says "from the beehives, if you've opened it". If you've been inside the hives, the jar says so, and maybe the bees even helped fill it.
- **Boat → sticker → sea.** Brine's ♥4 change (the little boat) is the target for Juniper's ♥2 gift.
- **Rowan's pond + Brine's conch → beach.**
- **Pip's ticket gates all of Glaschu**, so the bookmark, the plasters and the honey wait in the satchel until then. Their notes should say "keep this for your travels".

## 3. Note rewrites (so items point to their place)
- **Fern's key (decided: keep the twist).** The Journal note stays: *"Ceremonial. It doesn't open anything. Fern insists that is not the point."* The satchel still lets you try it on City Hall, and when you do: *"…it fits. Fern is speechless. The council (Fern) will look into it."* City Hall's rooms open, and from then on the Journal note gets a new last line: *"It turns out it does open something."*
- **Rowan's tulip:** *"Plant it wherever you think needs a bit of Ord. Rowan swears that if you plant it by the beehives, the bees will invite you in."*
- **Juniper's sticker:** *"On the back, in crayon: `data Friend = You`. The children say it would look nice on a boat."*
- **Brine's conch:** *"Hold it to your ear and you can hear… not the harbour. Somewhere warmer. Brine says it wants to go back in the water. The pond would do."*
- **Moss's sunflower:** *"From the first row Moss ever watered with map. Flat enough to mark your place in a book. Iris would approve."*
- **Bram's discount card:** *"10% off everything, forever. Bram filtered it to just you. Bring it by the store."*
- **Iris's bookmark / Sorrel's plasters / Marigold's honey:** add *"For your travels."*
- **Orla's telescope:** *"…on clear nights. Orla says something else has been showing up in the eyepiece lately."*

## 4. What the new places contain
Each place should give either a small bonus Haskell puzzle or a cozy toy, and never a required challenge. Ideas:

| Place | What's there | Haskell flavour |
|---|---|---|
| Wren's cottage | Tea with Wren, her letters pinned up, a cat | None, just a visit |
| Bakery kitchen | Laminate the croissant dough | Recursion: `layers 0 = 1; layers n = 3 * layers (n - 1)` |
| Library reading room | Your sunflower marks your place in your own section; browse your past code | Browse your past code |
| General store | Buy things with coins, 10% off with Bram's card; sell anything you've found | Prices as a list: `map` / `filter` on the shelf |
| City Hall | Fern's office, the town records, a "proposed holiday"; where you commission new buildings and buy land deeds (section 8) | IO: the hall greets you by name |
| Inside the beehives | Pick a hive: nursery, honey store or the queen's hive; collect honey to sell | Monoid: combine the nectar with `<>`; honeycomb cells as a list |
| Open sea + fishing | Cast a line, what comes back is a `Maybe Fish`; sell your catch | Maybe / pattern matching / filter |
| Magical beach | Endless waves, shells washing up forever; collect shells to sell | Laziness: `cycle`, `take` |
| Your garden plot | Plant seeds, watch them grow over real days, pick what's ready | `map` over the beds, like Moss |
| The planet | Snah and Lime | **On hold**: Louise's own idea |
| Glaschu | A whole new city and chapter (section 5) | Chapter 2 curriculum |

## 5. Glaschu (the mountain city)
Full design in **[glaschu-design.md](glaschu-design.md)**: 16 residents, 27 challenges across 6 stages, 32 errands, four errand lands, Thistle's Forge as the shop, Muir's land deeds, and the interpreter work Chapter 2 needs. In short:
- Reached by Pip's morning train. **Tansy** (the hurt girl, helped by Sorrel's plasters) is your first friend there. **Barley** (the baker) needs Marigold's honey. **Heather** (the librarian) is Iris's pen-pal.
- Chapter 2 teaches folds, binary trees, Enum and ranges, records, `Data.Map`, Applicative, Traversable, Reader/Writer/State built by hand, unfolds, laws, parser combinators and full IO programs.
- Coins are shared between the two cities, and some Glaschu gifts send items back to Haskell Town.

## 6. Suggested build order
1. **Satchel + use-on mechanic**, plus the five town interiors as simple scene cards (Wren, Hazel, Moss, Bram, Fern). Small and self-contained.
2. **Coins + the general store** (sections 7–8): earning from errands, then decorations with free placement, then useful things and your garden plot.
3. **Magical and world places:** inside the beehives (three hives), the sea with fishing, the magical beach. They share the "item becomes a doorway" pattern, reuse the existing land and coast, and are where you find things to sell. Selling to residents comes with them.
4. **Bigger things + a growing map:** buildings and upgrades bought with coins (8c), land deeds, and the map growing to fit them (8d). This needs map scrolling, so it's a bigger change to the map code.
5. **Glaschu / Chapter 2**: the biggest piece. The train, bookmark, plasters and honey all land here, plus the new residents. Its interpreter work (Enum, records, `Data.Map`, Traversable, `readLn`) can start earlier, in parallel.
6. **Observatory planet**, once Louise's gameplay idea is written down.

## 7. Coins
- The currency is **🪙 coins**. A coin counter sits next to the Satchel. The purse is shared between Haskell Town and Glaschu.
- **Earning, two ways:**
  - **Errands:** a fixed amount per errand solved, no matter the hints or outcome (same rule as the hearts).
  - **Selling what you find:** fish from the sea, shells from the beach, honey from inside the hives, and what grows in your garden plot.
- **Where you sell: both places.**
  - **Bram's store buys everything** at a fair standard price. It's the easy option: sell the whole satchel in one go.
  - **Each find's own resident pays a little more** for it, and you get a thank-you line:
    - Fish → **Brine** at the harbour.
    - Honey → **Marigold** at the market.
    - Shells → **Juniper** at the school (for the children's shell collection).
    - Flowers and vegetables from your garden plot → **Moss** at the community garden (or Hazel buys vegetables for the bakery).
  - Selling to residents doesn't give hearts (hearts stay errand-only, as in the rewards design), but it could unlock small extra letters.
- **Finding things:** each place gives a few finds per day, so there's a reason to come back without any pressure to grind.
- **Spending:** three kinds of things plus land (section 8). Bram's card gives 10% off at his store.
- Optional Haskell touch: the receipt shows the sum as code, e.g. `total = sum (map discount basket)`.
- To keep it cozy: no prices that need grinding, nothing essential behind coins, and nothing that can be lost.

## 8. What coins buy

### 8a. Decorations (Bram's store)
- Small things that make the town look like *yours*, with no other effect: lamp posts, benches, flower pots, fences, a birdbath, bunting, a signpost with your name, a well, stepping stones.
- **Placed anywhere** on open ground. Pick a decoration from the satchel and drag it onto the map; it snaps to a grid (e.g. 8 px) so things line up. It can't go on roads, the railway, water or buildings. Decorations can be moved, turned and put back in the satchel at any time, so nothing is permanent.
- A **"Decorate" mode** on the map keeps placing separate from normal clicking: in decorate mode, clicks move things; outside it, clicks open places as usual.
- Lamp posts light up at night with the day/night cycle.
- Decorations are saved with their positions in the save file.

### 8b. Useful things (Bram's store)
- **Seeds** for **your own garden plot**, a small fenced patch next to Wren's cottage that appears with your first seeds.
  - Plant a seed in an empty bed; it grows over real days (sprout → bud → bloom/ripe), following the player's clock like the day/night cycle.
  - Pick what's ready to sell, or keep flowers to put in a vase decoration.
  - A bigger plot (more beds) could be one of the upgrades in 8c.
  - Nothing wilts or dies: a ready plant just waits for you.
- **A better fishing rod:** more kinds of fish, rarer catches. Never required: the basic rod can still catch everything common.
- **A bigger satchel:** more slots for finds and bought things.
- Possibly later: a shovel for digging up buried things on the beach, a bee-suit for the hives, a lantern for night fishing, a watering can that makes plants grow a little faster.

### 8c. Bigger things: buildings and upgrades
- The **23 challenge buildings stay earned with code**. Coins never replace a challenge.
- Coins buy **extra buildings and upgrades** on top of them, commissioned at City Hall (Fern) or ordered from Bram:
  - Extra buildings, e.g. a café, a gazebo in the park, a greenhouse (for seeds in winter), a little house of your own, a fish market stall at the harbour.
  - Upgrades to existing buildings, e.g. a second floor on the cottage, a bigger bakery oven, more stalls at the market, a carousel in the park, more beds in your garden plot, more hives in the meadow.
- **Bought buildings can go anywhere** on open ground, like decorations, using the same Decorate mode. They snap to a coarser grid because they're bigger, and they need enough free space for their whole footprint (the map shows a green/red outline while you drag).
- Bought buildings can be moved later too, so a placement is never a mistake.
- Optional: a building takes a day to finish, with a little scaffold and builder on the map until then.

### 8d. A growing map
The map grows in two ways:
- **With every bought building.** Each bought building (not upgrades) comes with a new **plot of open land** at the edge of town, so there's always room for it and for more decorations. You can still place the building anywhere; the new land is just extra space.
- **With a land deed.** At City Hall, Fern sells **📜 land deeds**: one deed = one new plot of open land, with no building attached, for players who want more room to decorate. Fern stamps it with great ceremony ("The council (me) approves.").
  - Each deed costs a little more than the last, so the town grows at a gentle pace.
  - When you buy a deed you pick which **edge** to grow from (north, west or south), shown as glowing mist on the map.

How new land works (both ways):
- It arrives the same way as the errand land south of the railway: the mist at the edge of the map clears, with a toast ("Fern has extended the town boundary!"). It reuses the strip-and-slot system from `src/content/expansions.ts`.
- **Where the map grows:** outward in all open directions (north and west of the main road, and further south past the errand land). The sea stays on the east, so the coast keeps its shape.
- **Errand land and bought land are separate.** The four errand lands (Meadow, Orchard, Duck Pond, Windmill Hill) still open only through errands, and bought land is plain open ground for your own building and decorating.
- **The map needs to scroll.** Once the town is bigger than the screen, the map pans by dragging (and maybe zooms), with a small minimap or a "back to the town square" button. New land is centred on screen when it opens.
- The Journal's land section lists bought plots too, with dates ("Land deed #3, north edge").
- The printable Journal booklet gets a "your town" page with a picture of the whole map.

## Open questions
- None left for the gift and coin design. Glaschu's open questions are in [glaschu-design.md](glaschu-design.md).
- The planet waits for Louise's gameplay idea.
