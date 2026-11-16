import type { Checkable } from './types.ts';

// The five town interiors (docs/gift-items-design.md, section 4): what's inside a place once its gift
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
