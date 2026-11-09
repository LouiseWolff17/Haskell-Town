import type { Errand, ReviewTopic } from './types.ts';

// The Notice Board opens once the whole village is built. Residents pin small errands to it,
// each one a new problem on an idea from an earlier building, to be solved from memory.
// When each topic comes back is decided by src/game/schedule.ts (spaced retrieval practice).
//
// Each resident has a topic of their own, so every resident's errands (and friendship hearts)
// come back at the same pace. Topics that used to be shared are listed in LEGACY_TOPICS,
// so older saves carry their progress over.
//
// Every topic needs at least two errands: reviews take turns through them, so the player
// practises using the idea on a new problem instead of retyping an answer they remember.

export const REVIEW_TOPICS: ReviewTopic[] = [
  { id: 'functions', title: 'Functions & lists', resident: 'wren', from: ['house', 'mailbox'] },
  { id: 'patterns', title: 'Pattern matching', resident: 'hazel', from: ['bakery'] },
  { id: 'map', title: 'map', resident: 'moss', from: ['garden'] },
  { id: 'filter', title: 'filter', resident: 'bram', from: ['store'] },
  { id: 'recursion', title: 'Recursion', resident: 'iris', from: ['library', 'library2'] },
  { id: 'data', title: 'Data types & records', resident: 'juniper', from: ['school', 'school2'] },
  { id: 'io', title: 'IO & do blocks', resident: 'fern', from: ['hall', 'hall2'] },
  { id: 'maybe', title: 'Maybe & Either', resident: 'sorrel', from: ['clinic', 'clinic2'] },
  { id: 'hof', title: 'Higher-order functions & folds', resident: 'pip', from: ['railway', 'railway2'] },
  { id: 'classes', title: 'Type classes & instances', resident: 'rowan', from: ['park', 'park2'] },
  { id: 'functor', title: 'Functor & Monad', resident: 'brine', from: ['harbour', 'harbour2'] },
  { id: 'monoid', title: 'Monoid & Foldable', resident: 'marigold', from: ['market', 'market2'] },
  { id: 'lazy', title: 'Laziness & infinite lists', resident: 'orla', from: ['observatory', 'observatory2'] },
];

/** Old topic id → the topics it was split into. Their progress is copied to each (see syncTopics in schedule.ts). */
export const LEGACY_TOPICS: Record<string, string[]> = { basics: ['functions', 'patterns'], mapfilter: ['map', 'filter'] };

export const ERRANDS: Errand[] = [
  // ---------- pattern matching (Hazel) ----------
  {
    id: 'crust', topic: 'patterns', resident: 'hazel', title: 'Which Crust?',
    story: "Hazel is labelling the morning loaves. “Rye bakes dark, spelt bakes nutty, and everything else comes out golden. Could you write that down for me?”",
    task: 'Write <code>crustFor</code>, which gives <code>"dark"</code> for <code>"rye"</code>, <code>"nutty"</code> for <code>"spelt"</code> and <code>"golden"</code> for any other flour.',
    fn: 'crustFor', sig: 'crustFor :: String -> String',
    examples: [['crustFor "rye"', '"dark"'], ['crustFor "wheat"', '"golden"']],
    tests: [['crustFor "rye"', '"dark"'], ['crustFor "spelt"', '"nutty"'], ['crustFor "wheat"', '"golden"'], ['crustFor ""', '"golden"']],
    starter: 'crustFor :: String -> String\n',
    solution: 'crustFor :: String -> String\ncrustFor "rye"   = "dark"\ncrustFor "spelt" = "nutty"\ncrustFor _       = "golden"\n',
    explanation: 'One equation per case, tried from top to bottom. The last one uses <code>_</code>, which matches anything, so it has to come last, or it would catch rye and spelt too.',
  },
  {
    id: 'boxLabel', topic: 'patterns', resident: 'hazel', title: 'Bun Boxes',
    story: "Hazel packs buns into little boxes and writes on the lid. “An empty box says empty. One bun says just bun, or just roll, or whatever it is. More than one, I write assorted.”",
    task: 'Write <code>boxLabel</code>: <code>"empty"</code> for an empty list, <code>"just "</code> followed by the name for a list with one item, and <code>"assorted"</code> for anything longer. Use patterns, not <code>length</code>.',
    fn: 'boxLabel', sig: 'boxLabel :: [String] -> String', forbid: ['length', 'null'],
    examples: [['boxLabel []', '"empty"'], ['boxLabel ["bun"]', '"just bun"'], ['boxLabel ["bun", "roll"]', '"assorted"']],
    tests: [['boxLabel []', '"empty"'], ['boxLabel ["bun"]', '"just bun"'], ['boxLabel ["roll"]', '"just roll"'], ['boxLabel ["bun", "roll"]', '"assorted"'], ['boxLabel ["a", "b", "c"]', '"assorted"']],
    starter: 'boxLabel :: [String] -> String\n',
    solution: 'boxLabel :: [String] -> String\nboxLabel []  = "empty"\nboxLabel [x] = "just " ++ x\nboxLabel _   = "assorted"\n',
    explanation: '<code>[x]</code> is a pattern for a list with exactly one item, and it names that item <code>x</code>. Patterns are tried from the top, so the catch-all <code>_</code> only gets lists with two or more.',
  },

  // ---------- functions & lists (Wren) ----------
  {
    id: 'firstOrZero', topic: 'functions', resident: 'wren', title: 'The Top Box',
    story: "Wren is stacking boxes again. “I only ever need to know what's in the top box. And if there are no boxes at all, just say 0.”",
    task: 'Write <code>topBox</code>, which gives the first number in a list, or <code>0</code> for an empty list. Use pattern matching, not <code>head</code>.',
    fn: 'topBox', sig: 'topBox :: [Int] -> Int', forbid: ['head', 'null'],
    examples: [['topBox [7, 2, 9]', '7'], ['topBox []', '0']],
    tests: [['topBox [7, 2, 9]', '7'], ['topBox []', '0'], ['topBox [42]', '42'], ['topBox [-1, 5]', '-1']],
    starter: 'topBox :: [Int] -> Int\n',
    solution: 'topBox :: [Int] -> Int\ntopBox []    = 0\ntopBox (x:_) = x\n',
    explanation: 'A list is either <code>[]</code> or a first item stuck on the front of the rest, <code>(x:rest)</code>. The <code>_</code> says “I don\'t need the rest”. Unlike <code>head</code>, this can never crash on an empty list.',
  },

  {
    id: 'twoBags', topic: 'functions', resident: 'wren', title: 'Two Mailbags',
    story: "The post came in two bags today. “I've got one list of letters from the morning bag and one from the afternoon bag. How many letters is that altogether?”",
    task: 'Write <code>countBoth</code>, which takes two lists of letters and gives how many letters there are in total.',
    fn: 'countBoth', sig: 'countBoth :: [String] -> [String] -> Int',
    examples: [['countBoth ["Hi"] ["Hello", "Hey"]', '3'], ['countBoth [] []', '0']],
    tests: [['countBoth ["Hi"] ["Hello", "Hey"]', '3'], ['countBoth [] []', '0'], ['countBoth ["a", "b"] []', '2'], ['countBoth [] ["x"]', '1']],
    starter: 'countBoth :: [String] -> [String] -> Int\n',
    solution: 'countBoth :: [String] -> [String] -> Int\ncountBoth morning afternoon = length morning + length afternoon\n',
    explanation: 'A function with two arguments has two arrows in its type: <code>[String] -> [String] -> Int</code>. Each argument gets a name on the left of <code>=</code>. (<code>length (morning ++ afternoon)</code> works too.)',
  },

  // ---------- map (Moss) ----------
  {
    id: 'afterRain', topic: 'map', resident: 'moss', title: 'After the Rain',
    story: "Moss measured the seedlings, then it rained. “Each one grew 2 centimetres overnight. Which ones are at least 10 centimetres tall now?”",
    task: 'Write <code>afterRain</code>: add 2 to every height, then keep only the heights that are at least 10.',
    fn: 'afterRain', sig: 'afterRain :: [Int] -> [Int]',
    examples: [['afterRain [8, 3, 12]', '[10, 14]'], ['afterRain []', '[]']],
    tests: [['afterRain [8, 3, 12]', '[10, 14]'], ['afterRain []', '[]'], ['afterRain [1, 2, 3]', '[]'], ['afterRain [7, 8, 9]', '[10, 11]']],
    starter: 'afterRain :: [Int] -> [Int]\n',
    solution: 'afterRain :: [Int] -> [Int]\nafterRain hs = filter (>= 10) (map (+ 2) hs)\n',
    explanation: '<code>map</code> changes every item, <code>filter</code> keeps some of them. Here the order matters: grow first, then measure. <code>(+ 2)</code> and <code>(>= 10)</code> are sections: an operator with one side filled in.',
  },
  {
    id: 'potLabels', topic: 'map', resident: 'moss', title: 'Labelling the Pots',
    story: "Moss is potting up seedlings to give away. “Every pot needs a little label: Pot, then the plant's name. Could you make me the labels?”",
    task: 'Write <code>potLabels</code>, which puts <code>"Pot: "</code> in front of every name in the list.',
    fn: 'potLabels', sig: 'potLabels :: [String] -> [String]',
    examples: [['potLabels ["basil", "mint"]', '["Pot: basil", "Pot: mint"]'], ['potLabels []', '[]']],
    tests: [['potLabels ["basil", "mint"]', '["Pot: basil", "Pot: mint"]'], ['potLabels []', '[]'], ['potLabels ["fern"]', '["Pot: fern"]']],
    starter: 'potLabels :: [String] -> [String]\n',
    solution: 'potLabels :: [String] -> [String]\npotLabels names = map ("Pot: " ++) names\n',
    explanation: '<code>map</code> does the same thing to every item. <code>("Pot: " ++)</code> is a section: <code>++</code> with its left side filled in, so it\'s a function waiting for the name to stick on the end.',
  },

  // ---------- filter (Bram) ----------
  {
    id: 'inStock', topic: 'filter', resident: 'bram', title: 'What Can I Sell?',
    story: "Bram keeps his stock as pairs of a name and how many he has. “Just give me the names of the things I've still got at least one of.”",
    task: 'Write <code>inStock</code>, which gives the names whose count is more than 0, in the same order.',
    fn: 'inStock', sig: 'inStock :: [(String, Int)] -> [String]',
    examples: [['inStock [("jam", 3), ("tea", 0), ("eggs", 6)]', '["jam", "eggs"]']],
    tests: [['inStock [("jam", 3), ("tea", 0), ("eggs", 6)]', '["jam", "eggs"]'], ['inStock []', '[]'], ['inStock [("tea", 0)]', '[]'], ['inStock [("oats", 1)]', '["oats"]']],
    starter: 'inStock :: [(String, Int)] -> [String]\n',
    solution: 'inStock :: [(String, Int)] -> [String]\ninStock items = map fst (filter (\\(_, n) -> n > 0) items)\n',
    explanation: 'First <code>filter</code> the pairs, then <code>map fst</code> to keep just the names. A list comprehension says the same thing: <code>[name | (name, n) &lt;- items, n &gt; 0]</code>.',
  },

  {
    id: 'bigLabels', topic: 'filter', resident: 'bram', title: 'The Big Shelf',
    story: "Bram's top shelf has wide labels. “Only things with names longer than four letters go up there. Which ones are they?”",
    task: 'Write <code>bigShelf</code>, which keeps the names that are longer than 4 letters, in the same order.',
    fn: 'bigShelf', sig: 'bigShelf :: [String] -> [String]',
    examples: [['bigShelf ["jam", "biscuits", "tea", "honey"]', '["biscuits", "honey"]']],
    tests: [['bigShelf ["jam", "biscuits", "tea", "honey"]', '["biscuits", "honey"]'], ['bigShelf []', '[]'], ['bigShelf ["oats"]', '[]'], ['bigShelf ["apple"]', '["apple"]']],
    starter: 'bigShelf :: [String] -> [String]\n',
    solution: 'bigShelf :: [String] -> [String]\nbigShelf names = filter (\\n -> length n > 4) names\n',
    explanation: '<code>filter</code> keeps the items its test says <code>True</code> for. The test here is a lambda, <code>\\n -> length n > 4</code>. You could also write it as <code>(> 4) . length</code>.',
  },

  // ---------- recursion ----------
  {
    id: 'countShort', topic: 'recursion', resident: 'iris', title: 'Short Reads',
    story: "Iris wants a shelf of quick reads. “How many of these books have fewer than 100 pages? Count them one at a time, please.”",
    task: 'Write <code>countShort</code>, which counts the numbers below 100, using recursion. No <code>filter</code>, <code>length</code> or folds.',
    fn: 'countShort', sig: 'countShort :: [Int] -> Int', forbid: ['filter', 'length', 'foldr', 'foldl', 'sum'], recursive: true,
    examples: [['countShort [80, 250, 99]', '2'], ['countShort []', '0']],
    tests: [['countShort []', '0'], ['countShort [80, 250, 99]', '2'], ['countShort [100, 300]', '0'], ['countShort [1, 2, 3, 400]', '3']],
    starter: 'countShort :: [Int] -> Int\n',
    solution: 'countShort :: [Int] -> Int\ncountShort [] = 0\ncountShort (p:rest)\n  | p < 100   = 1 + countShort rest\n  | otherwise = countShort rest\n',
    explanation: 'Base case: an empty shelf has no short books. Recursive case: look at the first book, count it or not, and let <code>countShort</code> handle the rest of the shelf.',
  },
  {
    id: 'thickest', topic: 'recursion', resident: 'iris', title: 'The Thickest Book',
    story: "A bookend has broken. “I need to know how thick the thickest book is, so I can buy one big enough. An empty shelf needs nothing, so 0.”",
    task: 'Write <code>thickest</code>, which gives the largest number in the list (or <code>0</code> for an empty list), using recursion. No <code>maximum</code> or folds.',
    fn: 'thickest', sig: 'thickest :: [Int] -> Int', forbid: ['maximum', 'foldr', 'foldl', 'foldr1', 'foldl1'], recursive: true,
    examples: [['thickest [120, 640, 85]', '640'], ['thickest []', '0']],
    tests: [['thickest []', '0'], ['thickest [5]', '5'], ['thickest [120, 640, 85]', '640'], ['thickest [3, 9, 9, 2]', '9']],
    starter: 'thickest :: [Int] -> Int\n',
    solution: 'thickest :: [Int] -> Int\nthickest []       = 0\nthickest (p:rest) = max p (thickest rest)\n',
    explanation: 'If you knew the thickest book in the rest of the shelf, the answer would be whichever is bigger: that one, or the first book. <code>max p (thickest rest)</code> says exactly that.',
  },

  // ---------- data types & records ----------
  {
    id: 'weather', topic: 'data', resident: 'juniper', title: 'Playtime Weather',
    story: "Juniper decides each morning whether the class can play outside. “Sunny or Cloudy: outside. Rainy: inside. I'd like a proper type for the weather.”",
    task: 'Make a data type <code>Weather</code> with the constructors <code>Sunny</code>, <code>Cloudy</code> and <code>Rainy</code>, and write <code>playOutside</code>, which is <code>True</code> unless it\'s rainy.',
    fn: 'playOutside', sig: 'playOutside :: Weather -> Bool', needs: { types: ['Weather'], cons: ['Sunny', 'Cloudy', 'Rainy'] },
    examples: [['playOutside Sunny', 'True'], ['playOutside Rainy', 'False']],
    tests: [['playOutside Sunny', 'True'], ['playOutside Cloudy', 'True'], ['playOutside Rainy', 'False'], ['map playOutside [Rainy, Sunny]', '[False, True]']],
    starter: '-- Your Weather type and playOutside go here.\n',
    solution: 'data Weather = Sunny | Cloudy | Rainy\n  deriving (Show, Eq)\n\nplayOutside :: Weather -> Bool\nplayOutside Rainy = False\nplayOutside _     = True\n',
    explanation: '<code>data</code> makes a brand new type, and its constructors are the only values it can have. Because the compiler knows all three, a typo like <code>Rainny</code> is caught before anything runs.',
  },
  {
    id: 'nameTag', topic: 'data', resident: 'juniper', title: 'Name Tags',
    story: "It's the first day of term. “Each pupil has a name and a class number. Could you print a name tag like <i>Ana · class 3</i> for each one?”",
    task: 'Make a record <code>Pupil</code> with fields <code>pupilName :: String</code> and <code>classNo :: Int</code>, and write <code>nameTag</code>, which gives <code>"Ana · class 3"</code> for Ana in class 3.',
    fn: 'nameTag', sig: 'nameTag :: Pupil -> String', needs: { types: ['Pupil'], cons: ['Pupil'], fields: ['pupilName', 'classNo'] },
    examples: [['nameTag (Pupil "Ana" 3)', '"Ana · class 3"']],
    tests: [['nameTag (Pupil "Ana" 3)', '"Ana · class 3"'], ['nameTag (Pupil { pupilName = "Bo", classNo = 1 })', '"Bo · class 1"'], ['classNo (Pupil "Cy" 2)', '2']],
    starter: '-- Your Pupil record and nameTag go here.\n',
    solution: 'data Pupil = Pupil { pupilName :: String, classNo :: Int }\n  deriving Show\n\nnameTag :: Pupil -> String\nnameTag p = pupilName p ++ " · class " ++ show (classNo p)\n',
    explanation: 'A record gives each field a name, and each name is also a function: <code>pupilName p</code> reads the name out of <code>p</code>. <code>show</code> turns the class number into text so <code>++</code> can join it on.',
  },

  // ---------- IO ----------
  {
    id: 'signIn', topic: 'io', resident: 'fern', title: 'The Visitors\' Book',
    story: "City Hall has a visitors' book. “When someone types their name, please greet them, and tell them how many letters their name has. People love that.”",
    task: 'Write <code>main</code>: read a name, print <code>Welcome, NAME!</code>, then print <code>Your name has N letters.</code>',
    fn: 'main', sig: 'main :: IO ()',
    ioExamples: [{ input: 'Wren', out: 'Welcome, Wren!\nYour name has 4 letters.\n' }],
    tests: [{ input: 'Wren', out: 'Welcome, Wren!\nYour name has 4 letters.\n' }, { input: 'Juniper', out: 'Welcome, Juniper!\nYour name has 7 letters.\n' }],
    starter: 'main :: IO ()\n',
    solution: 'main :: IO ()\nmain = do\n  name <- getLine\n  putStrLn ("Welcome, " ++ name ++ "!")\n  putStrLn ("Your name has " ++ show (length name) ++ " letters.")\n',
    explanation: 'Inside <code>do</code>, <code>&lt;-</code> takes the result out of an IO action (<code>getLine</code>), and each line after it can use it. <code>length</code> and <code>show</code> are ordinary pure functions, used right inside IO.',
  },
  {
    id: 'addVisitors', topic: 'io', resident: 'fern', title: 'Two Doors',
    story: "City Hall has two doors, each with a counter. “Type in the count from each door, one per line, and tell me the total.”",
    task: 'Write <code>main</code>: read two lines, each a whole number, and print <code>Total: N</code>. (<code>read</code> turns text into a number.)',
    fn: 'main', sig: 'main :: IO ()',
    ioExamples: [{ input: '12\n30', out: 'Total: 42\n' }],
    tests: [{ input: '12\n30', out: 'Total: 42\n' }, { input: '0\n5', out: 'Total: 5\n' }, { input: '100\n1', out: 'Total: 101\n' }],
    starter: 'main :: IO ()\n',
    solution: 'main :: IO ()\nmain = do\n  a <- getLine\n  b <- getLine\n  let total = read a + read b :: Int\n  putStrLn ("Total: " ++ show total)\n',
    explanation: 'Each <code>getLine</code> gives a <code>String</code>. <code>read</code> turns it into a number, but it needs to know which type you want, so <code>:: Int</code> says so. <code>let</code> inside <code>do</code> names a pure value.',
  },

  // ---------- Maybe & Either ----------
  {
    id: 'safeDivide', topic: 'maybe', resident: 'sorrel', title: 'Sharing the Pills',
    story: "Dr. Sorrel splits a box of pills between patients. “If there are no patients, there is no answer. Don't crash, just tell me so.”",
    task: 'Write <code>share</code>, which divides the pills between the patients (whole pills, use <code>div</code>), or gives <code>Nothing</code> when there are 0 patients.',
    fn: 'share', sig: 'share :: Int -> Int -> Maybe Int',
    examples: [['share 10 2', 'Just 5'], ['share 10 0', 'Nothing']],
    tests: [['share 10 2', 'Just 5'], ['share 10 0', 'Nothing'], ['share 7 2', 'Just 3'], ['share 0 4', 'Just 0']],
    starter: 'share :: Int -> Int -> Maybe Int\n',
    solution: 'share :: Int -> Int -> Maybe Int\nshare _ 0 = Nothing\nshare pills patients = Just (pills `div` patients)\n',
    explanation: '<code>Maybe</code> puts “there might be no answer” into the type, so whoever calls <code>share</code> has to handle the <code>Nothing</code> case. Nothing can crash by dividing by zero.',
  },
  {
    id: 'checkTemp', topic: 'maybe', resident: 'sorrel', title: 'A Sensible Thermometer',
    story: "The new thermometer sometimes reads nonsense. “Below 30 or above 45 degrees, tell me what's wrong. Otherwise give me the reading.”",
    task: 'Write <code>checkTemp</code>: <code>Left "Too low"</code> below 30, <code>Left "Too high"</code> above 45, and <code>Right t</code> otherwise.',
    fn: 'checkTemp', sig: 'checkTemp :: Int -> Either String Int',
    examples: [['checkTemp 37', 'Right 37'], ['checkTemp 12', 'Left "Too low"']],
    tests: [['checkTemp 37', 'Right 37'], ['checkTemp 12', 'Left "Too low"'], ['checkTemp 50', 'Left "Too high"'], ['checkTemp 30', 'Right 30'], ['checkTemp 45', 'Right 45']],
    starter: 'checkTemp :: Int -> Either String Int\n',
    solution: 'checkTemp :: Int -> Either String Int\ncheckTemp t\n  | t < 30    = Left "Too low"\n  | t > 45    = Left "Too high"\n  | otherwise = Right t\n',
    explanation: '<code>Either</code> is like <code>Maybe</code>, but the failure side carries a reason. By convention <code>Left</code> is what went wrong and <code>Right</code> is the right answer.',
  },

  // ---------- higher-order functions ----------
  {
    id: 'twice', topic: 'hof', resident: 'pip', title: 'Round Trip',
    story: "Pip's trains go out and come back on the same track. “Whatever a trip does, a round trip does it twice. Can you write that once, for every kind of trip?”",
    task: 'Write <code>twice</code>, which takes a function and a value, and applies the function to the value two times.',
    fn: 'twice', sig: 'twice :: (a -> a) -> a -> a',
    examples: [['twice (+ 3) 1', '7'], ['twice reverse "abc"', '"abc"']],
    tests: [['twice (+ 3) 1', '7'], ['twice (* 2) 5', '20'], ['twice reverse "abc"', '"abc"'], ['twice (map (+ 1)) [1, 2]', '[3, 4]']],
    starter: 'twice :: (a -> a) -> a -> a\n',
    solution: 'twice :: (a -> a) -> a -> a\ntwice f x = f (f x)\n',
    explanation: 'Functions are values, so <code>f</code> is just an argument. The type <code>(a -&gt; a) -&gt; a -&gt; a</code> works for any type <code>a</code>, which is why it works on numbers, strings and lists alike. You could also write <code>twice f = f . f</code>.',
  },
  {
    id: 'countWhere', topic: 'hof', resident: 'pip', title: 'Counting Carriages',
    story: "Pip counts carriages for all sorts of reasons: the full ones, the empty ones, the long ones. “One counting function, and I'll tell it what to look for.”",
    task: 'Write <code>countWhere</code>, which takes a test and a list, and counts the items that pass the test.',
    fn: 'countWhere', sig: 'countWhere :: (a -> Bool) -> [a] -> Int',
    examples: [['countWhere even [1, 2, 3, 4]', '2'], ['countWhere (> 10) []', '0']],
    tests: [['countWhere even [1, 2, 3, 4]', '2'], ['countWhere (> 10) []', '0'], ['countWhere (== \'a\') "banana"', '3'], ['countWhere null [[], [1], []]', '2']],
    starter: 'countWhere :: (a -> Bool) -> [a] -> Int\n',
    solution: 'countWhere :: (a -> Bool) -> [a] -> Int\ncountWhere p xs = length (filter p xs)\n',
    explanation: 'The test <code>p</code> is a function passed in by the caller. A fold works too: <code>foldr (\\x n -&gt; if p x then n + 1 else n) 0 xs</code>.',
  },

  // ---------- type classes ----------
  {
    id: 'priced', topic: 'classes', resident: 'rowan', title: 'Park Tickets',
    story: "Rowan is selling tickets for the flower show. “Children pay 2 coins and adults pay 5. I'd like a <code>Priced</code> class, so I can price other things later too.”",
    task: 'Make a class <code>Priced</code> with a method <code>price :: a -> Int</code>, a type <code>Ticket</code> with constructors <code>Child</code> and <code>Adult</code>, and an instance <code>Priced Ticket</code>.',
    fn: null, sig: null, needs: { classes: ['Priced'], types: ['Ticket'], cons: ['Child', 'Adult'], instances: [['Priced', 'Ticket']] },
    examples: [['price Child', '2'], ['price Adult', '5']],
    tests: [['price Child', '2'], ['price Adult', '5'], ['sum (map price [Adult, Child, Child])', '9']],
    starter: '-- Your Priced class, Ticket type and instance go here.\n',
    solution: 'class Priced a where\n  price :: a -> Int\n\ndata Ticket = Child | Adult\n\ninstance Priced Ticket where\n  price Child = 2\n  price Adult = 5\n',
    explanation: 'A class names a set of methods; an instance says how one type does them. Later, an <code>instance Priced Flower</code> could give flowers a price too, and anything written for <code>Priced a</code> would work on both.',
  },
  {
    id: 'sizes', topic: 'classes', resident: 'rowan', title: 'Hedge Sizes',
    story: "Rowan is trimming hedges. “Small, Medium, Large. I'd like to know the biggest hedge in a row, without writing the comparisons myself.”",
    task: 'Make a type <code>Size</code> with <code>Small</code>, <code>Medium</code> and <code>Large</code> (in that order) that can be compared, and write <code>biggest</code>, which gives the largest size in a non-empty list.',
    fn: 'biggest', sig: 'biggest :: [Size] -> Size', needs: { types: ['Size'], cons: ['Small', 'Medium', 'Large'] },
    examples: [['biggest [Small, Large, Medium]', 'Large']],
    tests: [['biggest [Small, Large, Medium]', 'Large'], ['biggest [Small]', 'Small'], ['biggest [Medium, Small, Medium]', 'Medium'], ['Small < Large', 'True']],
    starter: '-- Your Size type and biggest go here.\n',
    solution: 'data Size = Small | Medium | Large\n  deriving (Show, Eq, Ord)\n\nbiggest :: [Size] -> Size\nbiggest = maximum\n',
    explanation: '<code>deriving (Eq, Ord)</code> asks Haskell to write the instances: constructors written earlier count as smaller. Once <code>Size</code> is in <code>Ord</code>, <code>maximum</code>, <code>sort</code> and <code>&lt;</code> all work on it.',
  },

  // ---------- Functor & Monad ----------
  {
    id: 'parcel', topic: 'functor', resident: 'brine', title: 'Sealed Parcels',
    story: "Captain Brine ships parcels that must stay sealed. “Change what's inside if you must, but the parcel stays a parcel.”",
    task: 'Make a type <code>Parcel a = Parcel a</code> (deriving <code>Show</code>) and an instance <code>Functor Parcel</code>.',
    fn: null, sig: null, needs: { types: ['Parcel'], cons: ['Parcel'], instances: [['Functor', 'Parcel']] },
    examples: [['fmap (+ 1) (Parcel 41)', 'Parcel 42']],
    tests: [['fmap (+ 1) (Parcel 41)', 'Parcel 42'], ['fmap length (Parcel "rope")', 'Parcel 4'], ['(* 3) <$> Parcel 5', 'Parcel 15']],
    starter: '-- Your Parcel type and Functor instance go here.\n',
    solution: 'data Parcel a = Parcel a\n  deriving Show\n\ninstance Functor Parcel where\n  fmap f (Parcel x) = Parcel (f x)\n',
    explanation: '<code>fmap</code> applies a function to what\'s inside and keeps the shape. That\'s all a Functor is. The instance is for <code>Parcel</code>, not <code>Parcel a</code>, because <code>fmap</code> may change the type inside.',
  },
  {
    id: 'cargoTotal', topic: 'functor', resident: 'brine', title: 'Two Holds',
    story: "Each ship has two cargo holds, and the gauges sometimes fail. “If either reading is missing, I don't have a total. Otherwise add them up.”",
    task: 'Write <code>totalCargo</code>, which adds two <code>Maybe Int</code> readings, or gives <code>Nothing</code> if either one is missing. Try a <code>do</code> block.',
    fn: 'totalCargo', sig: 'totalCargo :: Maybe Int -> Maybe Int -> Maybe Int',
    examples: [['totalCargo (Just 3) (Just 4)', 'Just 7'], ['totalCargo (Just 3) Nothing', 'Nothing']],
    tests: [['totalCargo (Just 3) (Just 4)', 'Just 7'], ['totalCargo (Just 3) Nothing', 'Nothing'], ['totalCargo Nothing (Just 4)', 'Nothing'], ['totalCargo (Just 0) (Just 0)', 'Just 0']],
    starter: 'totalCargo :: Maybe Int -> Maybe Int -> Maybe Int\n',
    solution: 'totalCargo :: Maybe Int -> Maybe Int -> Maybe Int\ntotalCargo a b = do\n  x <- a\n  y <- b\n  return (x + y)\n',
    explanation: 'In a <code>Maybe</code> <code>do</code> block, each <code>&lt;-</code> stops everything at the first <code>Nothing</code>. Only if both are there does <code>return</code> wrap the total in <code>Just</code>.',
  },

  // ---------- Monoid & Foldable ----------
  {
    id: 'basket', topic: 'monoid', resident: 'marigold', title: 'Shopping Baskets',
    story: "Marigold merges the baskets at the till. “A basket has a number of items and a price in coins. Two baskets together are one bigger basket, and an empty basket changes nothing.”",
    task: 'Make <code>data Basket = Basket Int Int</code> (deriving <code>Show</code> and <code>Eq</code>), with <code>Semigroup</code> and <code>Monoid</code> instances that add both numbers.',
    fn: null, sig: null, needs: { types: ['Basket'], cons: ['Basket'], instances: [['Semigroup', 'Basket'], ['Monoid', 'Basket']] },
    examples: [['Basket 2 5 <> Basket 1 3', 'Basket 3 8']],
    tests: [['Basket 2 5 <> Basket 1 3', 'Basket 3 8'], ['mempty :: Basket', 'Basket 0 0'], ['mconcat [Basket 1 1, Basket 2 2, Basket 3 3]', 'Basket 6 6'], ['Basket 4 9 <> mempty', 'Basket 4 9']],
    starter: '-- Your Basket type and its instances go here.\n',
    solution: 'data Basket = Basket Int Int\n  deriving (Show, Eq)\n\ninstance Semigroup Basket where\n  Basket a p <> Basket b q = Basket (a + b) (p + q)\n\ninstance Monoid Basket where\n  mempty = Basket 0 0\n',
    explanation: '<code>&lt;&gt;</code> combines two baskets and <code>mempty</code> is the basket that changes nothing. With those two, <code>mconcat</code> comes for free and adds up a whole day of baskets.',
  },
  {
    id: 'pair', topic: 'monoid', resident: 'marigold', title: 'Pairs of Jars',
    story: "Jam is sold in pairs of jars. “I want to treat a pair like any other container: list what's in it, count it, fold over it.”",
    task: 'Make <code>data Pair a = Pair a a</code> and an instance <code>Foldable Pair</code> (define <code>foldMap</code>).',
    fn: null, sig: null, needs: { types: ['Pair'], cons: ['Pair'], instances: [['Foldable', 'Pair']] },
    examples: [['toList (Pair 3 4)', '[3, 4]']],
    tests: [['toList (Pair 3 4)', '[3, 4]'], ['getSum (foldMap Sum (Pair 3 4))', '7'], ['toList (Pair "plum" "fig")', '["plum", "fig"]']],
    starter: '-- Your Pair type and Foldable instance go here.\n',
    solution: 'data Pair a = Pair a a\n\ninstance Foldable Pair where\n  foldMap f (Pair x y) = f x <> f y\n',
    explanation: '<code>foldMap</code> turns each item into a Monoid value and combines them with <code>&lt;&gt;</code>. Pick the Monoid and you pick the job: <code>Sum</code> adds, <code>(\\x -&gt; [x])</code> collects a list.',
  },

  // ---------- laziness ----------
  {
    id: 'evens', topic: 'lazy', resident: 'orla', title: 'Even Hours',
    story: "Orla looks up at the sky every second hour, forever. “I'd like the list of all the hours I look: 0, 2, 4, 6 and so on, without end.”",
    task: 'Define <code>lookHours</code>, the endless list of even numbers starting from 0.',
    fn: 'lookHours', sig: 'lookHours :: [Int]',
    examples: [['take 4 lookHours', '[0, 2, 4, 6]']],
    tests: [['take 4 lookHours', '[0, 2, 4, 6]'], ['lookHours !! 500', '1000'], ['takeWhile (< 9) lookHours', '[0, 2, 4, 6, 8]']],
    starter: 'lookHours :: [Int]\n',
    solution: 'lookHours :: [Int]\nlookHours = [0, 2 ..]\n',
    explanation: 'Because Haskell only works out what is asked for, an endless list is fine as long as you only <code>take</code> part of it. <code>map (* 2) [0..]</code> or <code>iterate (+ 2) 0</code> work just as well.',
  },
  {
    id: 'doubling', topic: 'lazy', resident: 'orla', title: 'The Doubling Comet',
    story: "A comet gets twice as bright every night. “Starting at 1, give me its brightness for every night to come.”",
    task: 'Define <code>brightness</code>, the endless list 1, 2, 4, 8, 16…, by writing the list in terms of itself.',
    fn: 'brightness', sig: 'brightness :: [Int]',
    examples: [['take 5 brightness', '[1, 2, 4, 8, 16]']],
    tests: [['take 5 brightness', '[1, 2, 4, 8, 16]'], ['brightness !! 20', '1048576'], ['length (takeWhile (< 1000) brightness)', '10']],
    starter: 'brightness :: [Int]\n',
    solution: 'brightness :: [Int]\nbrightness = 1 : map (* 2) brightness\n',
    explanation: 'The first item is 1, and the rest is the whole list doubled. Each new item only needs the one before it, so laziness can build it one step at a time. <code>iterate (* 2) 1</code> is the library version.',
  },
];
