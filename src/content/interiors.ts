import type { Checkable } from './types.ts';

// The town interiors, Brine's boat, the beehives and the magical beach (docs/gift-items-design.md, sections 2a and 4): what's inside a place once its gift
// has opened it. Each is a small scene card with a cozy toy or an optional Haskell bonus, never a
// required challenge. The game side is src/game/interiors.ts.

/** Wren's cottage: tea, her letters pinned up, and a cat. Just a visit. */
export const COTTAGE = {
  tea: [
    '"Milk? Sugar? A base case of one biscuit?" Wren pours.',
    'Wren tops up your cup. "I used to count letters on my fingers. Now I have a function for it."',
    '"This road had nothing on it once," Wren says, looking out of the window. "Now listen to it."',
    'The kettle sings again. Wren says the second cup is always the best one.',
    '"You should see the mailbox on a Monday," says Wren. "Overflowing. In a good way."',
  ],
  cat: [
    'The cat opens one eye and closes it again. You may keep sitting on the edge of your chair.',
    'The cat purrs. It sounds a bit like a recursive function that never reaches its base case.',
    'The cat stretches, turns around three times and settles in exactly the same spot.',
    'The cat pats your sleeve once, which Wren says is very high praise.',
  ],
};

/** The bakery kitchen: laminate the croissant dough. Every fold triples the layers. */
export const KITCHEN = {
  maxFolds: 6,
  folds: [
    'A slab of cold butter on the dough. One layer, ready to fold.',
    'Fold it in three. Hazel nods.',
    'Roll it out, fold it in three again. "Patience," says Hazel.',
    'Again. You can just about count the layers.',
    'Again! You can no longer count the layers. Haskell can.',
    'Again. Hazel says that is a proper croissant now.',
    'One more for luck. The dough is all layers and very little else.',
  ],
  starter: 'layers :: Int -> Int\nlayers 0 = 1\nlayers n = ___\n',
  puzzle: {
    fn: 'layers', sig: 'layers :: Int -> Int', recursive: true,
    tests: [['layers 0', '1'], ['layers 1', '3'], ['layers 2', '9'], ['layers 4', '81']],
  } satisfies Checkable,
  oven: 'The oven is roaring. Hazel\'s recipe is pinned on the wall: write it down in Haskell and it can go in.',
  ovenBaked: 'The oven ticks as it cools. The last tray of croissants is on the counter, and the kitchen smells wonderful.',
  baked: '🥐 Out of the oven: a tray of croissants with 81 layers each. Hazel wraps one up for you to take home.',
  notYet: 'Hazel peers at the dough. "Nearly. Each fold makes three of what you had before."',
  recursion: '"Lovely numbers," says Hazel, "but fold it one layer at a time: let `layers` call itself."',
};

/** The reading room. */
export const READING = {
  chair: [
    'You sink into the armchair. The lamp hums. Iris brings you a cushion without being asked.',
    'The armchair is exactly as comfortable as it looks. Iris says it has a base case: you, asleep.',
    'From the armchair you can see your whole section. It looks bigger from here.',
  ],
};

/** Bram's store: the shelf as a list. Coins and buying come with the next part of the design. */
export const STORE = {
  shelf: [
    { icon: '🍓', name: 'jam', price: 12 },
    { icon: '🕯️', name: 'candle', price: 5 },
    { icon: '🏮', name: 'lantern', price: 30 },
    { icon: '🌱', name: 'seeds', price: 8 },
    { icon: '🫖', name: 'teapot', price: 20 },
  ],
  /** Bram's 10%, rounded in your favour. */
  source: 'shelf :: [String]\nshelf = ["jam", "candle", "lantern", "seeds", "teapot"]\n\nprices :: [Int]\nprices = [12, 5, 30, 8, 20]\n\n-- Bram\'s card: 10% off, rounded in your favour\ntenOff :: Int -> Int\ntenOff p = p - p `div` 10\n',
  tries: ['map tenOff prices', 'filter (< 10) prices', 'sum (map tenOff prices)', 'zip shelf (map tenOff prices)'],
  bram: [
    '"Welcome back, favourite customer!" Bram straightens a jar that was already straight.',
    '"I filter the bargain shelf every Monday," says Bram. "You taught me that. Don\'t tell anyone."',
    '"Coins are coming," says Bram. "I\'ve ordered a little drawer for them and everything."',
  ],
  till: 'The till isn\'t taking coins yet. Bram says he\'s still deciding what a coin should look like.',
};

/** City Hall: Fern's office, the town records, a proposed holiday, and a hall that greets you by name. */
export const HALL = {
  fern: [
    '"Welcome to City Hall," says Fern. "Population: growing. Council: me."',
    'Fern stamps something, looks at it with great satisfaction, and stamps it again.',
    '"The motion to keep you is carried," says Fern. "Unanimously. I checked."',
    '"The key does open something," says Fern, still slightly amazed. "I\'ve written it in the minutes."',
  ],
  program: 'main :: IO ()\nmain = do\n  putStrLn "Who goes there?"\n  name <- getLine\n  putStrLn ("Welcome to City Hall, " ++ name ++ "!")\n',
};

/** Brine's little boat, with Juniper's gold star on the rail. Talk to Brine to sail out to sea and back. Fishing comes later (ROADMAP). */
export const BOAT = {
  /** Talking to Brine at the pier: he casts off, and the cut-scene sails you out to sea. */
  sailOut: [
    '"Right then," says Brine. "Let\'s see what\'s past the lighthouse." He pulls in the gangplank and casts off.',
    '"Fancy a trip out?" Brine doesn\'t wait for an answer. Ropes off, sail up, and away you go.',
    'Brine casts off and the sail fills with a snap. "Mind the bucket," he says. There isn\'t a bucket.',
  ],
  atSea: [
    'Out at sea. The harbour is a smudge behind you and the water goes on and on. Talk to Brine when you want to head home.',
    'Nothing but sea and sky, and the boat creaking happily. "Say the word and we\'ll head home," says Brine.',
  ],
  /** Talking to Brine out at sea: he brings her about, and the cut-scene sails you home. */
  sailHome: [
    '"Home, then," says Brine, and brings her about. The sail swings over your head.',
    '"The kettle\'s on at the harbour," says Brine. "Let\'s not keep it waiting."',
  ],
  home: [
    'Back at the pier. Brine ties up with a knot you\'ve never seen before, and the gangplank goes down.',
    'Home again. Brine pats the rail. "Good girl," he says to the boat.',
  ],
  star: [
    "Juniper's gold star, stuck on a little crooked. Brine won't hear of straightening it.",
    '"Best-looking boat in the harbour," says Brine. "It\'s the star. Juniper\'s class came down to wave at it."',
    'The star catches the light off the water and throws it back, twice as bright.',
  ],
  wheel: [
    'Brine lets you take the wheel. The boat is still tied up, so you steer her very carefully nowhere.',
    'You turn the wheel a little to the left. "Aye aye," says Brine, very seriously.',
    "The wheel is worn smooth where Brine's hands go. Yours fit there too.",
  ],
  rod: [
    'A line out over the side, and a red float bobbing. Nothing bites in the harbour. "They all know me here," says Brine.',
    'What comes back on a line is a `Maybe Fish`, Brine says: sometimes `Just` a fish, mostly `Nothing`. Out at sea, more `Just`.',
    'The float bobs. You wait. The float bobs again. "Out at sea it\'s a different story," says Brine.',
  ],
  rodAtSea: [
    'Out here the float dances on every wave. Nothing yet. "They\'re thinking about it," says Brine.',
    'Still `Nothing`. Brine says the sea is lazy: it only hands over a fish when you really need one.',
  ],
};

/** Inside the beehives (Rowan's tulip): you shrink to bee size and pick a hive. Collecting honey to sell comes with coins (ROADMAP). */
export const HIVES = {
  nursery: {
    enter: [
      'The tulip folds its petals round you, and down you go. When they open again the world is warm and gold and very, very big. A nurse bee puts a feeler to her mouth: the babies are sleeping.',
      'Down through the tulip again, as small as a bee. The nursery smells of wax and warm milk. "Shh," buzz three bees at once.',
    ],
    cells: [
      'Row after row of cells, a curled-up larva in each. To the bees the comb is a list, `[Larva, Larva, Egg, Capped, Larva]`, and they feed it in order without ever skipping one.',
      'A nurse bee goes down the row: `map feed cells`. Every larva gets its drop of jelly and wriggles.',
      'Some cells are capped with wax: there\'s a bee in there, nearly ready. The nurses count them with `length (filter isCapped cells)`, which is how bees count down to a birthday.',
    ],
    nurse: [
      'The nurse bee is humming a lullaby, very low. It has one note and goes on forever, like `repeat "mmm"`. The larvae don\'t mind. They only ever `take` a little of it before they\'re asleep.',
      '"Every one of them is the best one," says the nurse bee, in bee. At this size you understand her perfectly.',
      'She tucks a larva in with a pat of wax and hums a little louder. Rowan, she says, plants the best clover in the world.',
    ],
    bread: [
      'Bee bread: pollen packed into cells, every colour in the meadow. Orange from the poppies, purple from the heather, yellow from the dandelions.',
      'A forager comes in with her pollen baskets full and kicks them off into a cell, very pleased with herself.',
      'The bees mix the pollen with a little honey so it keeps. Hazel would call that a recipe. The bees call it Tuesday.',
    ],
  },
  honey: {
    enter: [
      'The tulip folds round you, and down you go. When the petals open, everything glows: shelf after shelf of honey, lit up like lamps.',
      'Back through the tulip, as small as a bee. The honey store is warm, and sticky underfoot, and smells wonderful.',
    ],
    comb: [
      'Shelves of capped honeycomb, glowing gold. Every cell is full and sealed with wax. Marigold would know exactly what to do with it.',
      'You reach for a cell. "When you\'ve got a jar," buzzes a guard bee, kindly. You haven\'t got a jar yet.',
      'The bees know every cell on these shelves by heart. If honey were a list, this would be a very long one, and every element sweet.',
    ],
    fanners: [
      'A row of bees fanning their wings as fast as they can, drying the nectar into honey. It takes days. They don\'t mind.',
      'The breeze from the fanners ruffles your hair. One of them winks at you without slowing down.',
      '"Faster," says the bee at the end of the row. "Faster," says the next one. Nobody is in charge. It works anyway.',
    ],
    /** The nectar cell: each look pours one more flower's nectar in (one line per flower), combined with `<>`, until it's full and capped. */
    flowers: ['clover', 'heather', 'lime', 'bramble', 'dandelion', 'tulip'],
    nectar: [
      'A forager pours in nectar from the clover. The cell was `mempty`, and `mempty <> x` is just `x`, so now it\'s clover.',
      'Heather goes in next. Nectars combine with `<>`, in the order the bees come home.',
      'Lime blossom. The bees say it doesn\'t matter how you group it: `(a <> b) <> c` is the same as `a <> (b <> c)`.',
      'Bramble. The cell is getting heavy, and the fanners speed up.',
      'Dandelion. Nearly full.',
      'And a drop from your tulip, to finish. The cell is full, and a bee seals it with wax. That\'s `mconcat` of every flower in it.',
    ],
    /** Looking again once it's capped: a new cell, empty. */
    again: 'The bees carry the capped cell off to the shelves, and start on a new one.',
  },
  queen: {
    enter: [
      'The tulip folds round you, and down you go. When the petals open, every bee in the room turns to look at you. Then they all bow, which is a lot of bowing.',
      'Back through the tulip, as small as a bee. "The visitor," murmurs the queen\'s court, and makes room.',
    ],
    /** {errands} is how many errands you've solved. */
    queen: [
      '"So you\'re the one," says the queen. "Rowan talks about you. So do my foragers. {errands} errands, they tell me, and every one of them done properly."',
      '"A town that runs on functions," says the queen. "We\'ve been doing that for a very long time. Ours are mostly `fly`, `sip` and `dance`."',
      '"Tell Rowan the tulip is lovely," says the queen. "And tell Marigold she\'s very welcome to the honey. She knows which jars are hers."',
      'The queen looks you up and down. "You\'d make a decent forager," she says. From a queen, that\'s the highest praise there is.',
    ],
    dance: [
      'A bee is doing the waggle dance: a wiggly run, a loop round, and again. It means lots of flowers, that way, not far. In Haskell it would be `Just (towards "the pond", 300)`.',
      'When nobody has found anything, nobody dances: that\'s `Nothing`. Today everybody wants a turn.',
      'The watching bees copy the steps, then fly off where she pointed. One dance, and every bee who watches it knows the way. Like a function everybody can call.',
    ],
    royal: [
      'Three big cells hang from the comb, lumpy like peanuts. Royal cells, a bee whispers, for queens to come. "Not for a long time," says the queen, firmly.',
      'A royal cell is made of the same wax as every other cell, just more of it. The bees say that\'s true of queens too.',
    ],
  },
};

/** The magical beach (Brine's conch at the Duck Pond): endless waves, and shells washing up forever. Selling shells comes with coins (ROADMAP). */
export const BEACH = {
  enter: [
    'You hold the conch to your ear. The waves get louder, and louder, and then a warm wave rolls right over you. When it draws back, you\'re standing on a beach that isn\'t on any map.',
    'Back through the conch. The wave rolls over you, warm as a bath, and leaves you on the magical beach. The shells are still washing up.',
  ],
  waves: [
    'Wave after wave, and never a last one. The sea here is `repeat wave`: a list that goes on forever. Haskell only works out the wave that\'s breaking right now, so it never runs out of time. That\'s laziness.',
    'You count the waves: one, two, three… The sea says `take 3 (repeat wave)` is a perfectly good answer, and you can stop whenever you like.',
    'The waves sound exactly like the conch. Of course they do. This is where the sound was coming from.',
  ],
  /** The shells on the tideline, in the order the waves bring them: `cycle shells`, so after the last comes the first again. */
  shells: [
    { name: 'cowrie', line: 'A wave brings in a cowrie, smooth as a sweet and speckled like an egg.' },
    { name: 'scallop', line: 'A scallop, pink and ridged, like a little fan.' },
    { name: 'whelk', line: 'A whelk, curled round and round to a point.' },
    { name: 'cockle', line: 'A cockle, ribbed, the colour of milky tea.' },
    { name: 'moon snail', line: 'A moon snail, round and pale, with a spiral on top like a sleepy eye.' },
  ],
  /** Said before the first shell, each time the list goes round again. */
  again: 'And here comes a cowrie again: `cycle` starts the list over whenever it runs out, so the beach never does.',
  crab: [
    'A hermit crab, scuttling sideways in a borrowed whelk shell. It\'s looking for a bigger one, and on this beach there will always be a bigger one.',
    'The crab checks every shell the waves bring: `head (filter fitsMe (cycle shells))`. The beach never ends, but the crab stops at the first one that fits. That\'s laziness too.',
    'The crab waves a claw at you. You wave back. It seems satisfied, and goes back to shell-shopping.',
  ],
  pool: [
    'A rock pool, left behind by the tide: a starfish, two anemones and a very small fish who thinks it owns the place.',
    'The tide fills the pool and leaves it again, forever: `iterate tide pool`. You only ever see the one that\'s happening now.',
    'The little fish swims round and round, `cycle ["left", "right"]`. It has never once been bored.',
    'Juniper would love this. Her class has a shelf at the school waiting for a shell collection.',
  ],
};
