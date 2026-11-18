import type { Project } from './types.ts';

// City Hall projects: learning stage 5 (docs/design.md), mastery and creativity. Once the village is built,
// Mayor Fern hands out bigger jobs: a whole program in one file, built a step at a time. Each step adds a
// function that uses the ones before it, and every run checks all the steps so far, so the earlier tests
// guard the earlier work. Each project ends with a `main` you can talk to. Once it's finished the file
// stays open: refactor it or add to it, and the tests tell you straight away if something broke.
//
// Code in these strings is in template literals, so a Haskell lambda's backslash is written \\.

export const PROJECTS: Project[] = [
  {
    id: 'vote', resident: 'fern', title: 'The Tree Vote', concepts: 'Lists · recursion · Maybe · folds · IO',
    reward: 'A string of red bunting for City Hall',
    story: "Mayor Fern spreads a big sheet of paper over the front desk. “The town square needs a tree, and everyone wants a say. Oak, Elm, Willow… I'll collect the votes, but counting them by hand takes all night. Could you build me a little vote counter? A piece at a time, mind: we'll test each part as we go.”",
    starter: `-- The Tree Vote: Mayor Fern's ballot counter.
-- Each step adds to this file, and every run checks all the steps so far.
`,
    steps: [
      {
        title: "One option's votes", fn: 'votesFor', sig: 'votesFor :: String -> [String] -> Int',
        task: 'Write <code>votesFor</code>: given a tree and the list of votes, how many votes did that tree get?',
        examples: [['votesFor "Oak" ["Oak", "Elm", "Oak"]', '2'], ['votesFor "Ash" ["Oak", "Elm"]', '0']],
        tests: [['votesFor "Oak" ["Oak", "Elm", "Oak"]', '2'], ['votesFor "Ash" ["Oak", "Elm"]', '0'], ['votesFor "Elm" []', '0'], ['votesFor "Elm" ["Elm", "Elm", "Elm"]', '3']],
        stub: `votesFor :: String -> [String] -> Int
votesFor option votes = undefined
`,
        hints: [
          'Two things you already know fit together here: keep only some votes, then count them.',
          '<code>filter</code> keeps the votes equal to <code>option</code>, and <code>length</code> counts what is left.',
          '<code>filter (== option) votes</code> is the list of votes for that tree.',
        ],
        solution: `votesFor :: String -> [String] -> Int
votesFor option votes = length (filter (== option) votes)
`,
        explanation: '<code>(== option)</code> is a section: a function that asks “is this the option?”. Small functions like this one are the bricks the rest of the counter is built from.',
      },
      {
        title: 'Every option once', fn: 'options', sig: 'options :: [String] -> [String]',
        task: 'Write <code>options</code>: every tree that got a vote, each one once, in the order they were first voted for.',
        examples: [['options ["Oak", "Elm", "Oak", "Ash", "Elm"]', '["Oak","Elm","Ash"]'], ['options []', '[]']],
        tests: [['options ["Oak", "Elm", "Oak", "Ash", "Elm"]', '["Oak", "Elm", "Ash"]'], ['options []', '[]'], ['options ["Willow"]', '["Willow"]'], ['options ["Ash", "Ash", "Ash"]', '["Ash"]'], ['options ["Elm", "Oak", "Elm", "Oak"]', '["Elm", "Oak"]']],
        stub: `options :: [String] -> [String]
options votes = undefined
`,
        hints: [
          'Recursion on the list: an empty list has no options, and for <code>(v : vs)</code>, <code>v</code> is the first option.',
          'Keep <code>v</code>, then take out every other vote for <code>v</code> before looking for the next option.',
          '<code>options (v : vs) = v : options (filter (/= v) vs)</code>, and a line for <code>[]</code>.',
        ],
        solution: `options :: [String] -> [String]
options [] = []
options (v : vs) = v : options (filter (/= v) vs)
`,
        explanation: 'Each call keeps one option and removes all its copies, so the list gets shorter every time and the recursion always reaches <code>[]</code>.',
      },
      {
        title: 'The tally', fn: 'tally', sig: 'tally :: [String] -> [(String, Int)]',
        task: 'Write <code>tally</code>: each option paired with its number of votes, in the same order as <code>options</code>. Use the two functions you already have.',
        examples: [['tally ["Oak", "Elm", "Oak"]', '[("Oak",2),("Elm",1)]'], ['tally []', '[]']],
        tests: [['tally ["Oak", "Elm", "Oak"]', '[("Oak", 2), ("Elm", 1)]'], ['tally []', '[]'], ['tally ["Ash", "Willow", "Willow", "Ash", "Willow"]', '[("Ash", 2), ("Willow", 3)]']],
        stub: `tally :: [String] -> [(String, Int)]
tally votes = undefined
`,
        hints: [
          'No new recursion needed: <code>options</code> gives the trees, <code>votesFor</code> counts each one.',
          'For every option <code>o</code>, make the pair <code>(o, votesFor o votes)</code>.',
          'A list comprehension does it: <code>[(o, votesFor o votes) | o &lt;- options votes]</code>. So does <code>map</code> with a lambda.',
        ],
        solution: `tally :: [String] -> [(String, Int)]
tally votes = [(o, votesFor o votes) | o <- options votes]
`,
        explanation: 'This is what a bigger program feels like: <code>tally</code> is one line because the two functions under it each do one job well.',
      },
      {
        title: 'The winner', fn: 'winner', sig: 'winner :: [String] -> Maybe String',
        task: "Write <code>winner</code>: the tree with the most votes, or <code>Nothing</code> if nobody voted. On a tie, the tree that was voted for first wins (Fern says that's fair).",
        examples: [['winner ["Oak", "Elm", "Elm"]', 'Just "Elm"'], ['winner ["Ash", "Oak", "Oak", "Ash"]', 'Just "Ash"'], ['winner []', 'Nothing']],
        tests: [['winner ["Oak", "Elm", "Elm"]', 'Just "Elm"'], ['winner []', 'Nothing'], ['winner ["Ash", "Oak", "Oak", "Ash"]', 'Just "Ash"'], ['winner ["Willow"]', 'Just "Willow"'], ['winner ["Elm", "Oak", "Ash", "Ash", "Oak", "Ash"]', 'Just "Ash"']],
        stub: `winner :: [String] -> Maybe String
winner votes = undefined
`,
        hints: [
          'Start from <code>tally votes</code>. An empty tally means <code>Nothing</code>; otherwise walk along the pairs, keeping the best one so far.',
          'A fold keeps “the best so far”. <code>foldl</code> starts from the first pair and only swaps when a later pair has <i>more</i> votes, so ties stay with the first.',
          '<code>case tally votes of [] -&gt; Nothing; (t : ts) -&gt; Just (fst (foldl better t ts))</code>, where <code>better best x = if snd x &gt; snd best then x else best</code>.',
        ],
        solution: `winner :: [String] -> Maybe String
winner votes = case tally votes of
    [] -> Nothing
    (t : ts) -> Just (fst (foldl better t ts))
  where
    better best x = if snd x > snd best then x else best
`,
        explanation: '<code>Maybe</code> makes the “nobody voted” case part of the type, so the program that uses <code>winner</code> has to deal with it. Using <code>&gt;</code> and not <code>&gt;=</code> is what keeps ties with the first tree.',
      },
      {
        title: 'Counting night', fn: 'main', sig: 'main :: IO ()',
        task: 'Write <code>main</code>: read one line of votes (separated by spaces), print each tree as <code>Oak: 2</code> in tally order, then <code>The new tree is: Oak!</code>. If the line is empty, print just <code>No votes yet.</code>',
        ioExamples: [{ input: 'Oak Elm Oak', out: 'Oak: 2\nElm: 1\nThe new tree is: Oak!' }],
        tests: [
          { input: 'Oak Elm Oak', out: 'Oak: 2\nElm: 1\nThe new tree is: Oak!\n' },
          { input: 'Willow', out: 'Willow: 1\nThe new tree is: Willow!\n' },
          { input: 'Ash Oak Oak Ash', out: 'Ash: 2\nOak: 2\nThe new tree is: Ash!\n' },
          { input: '\n', out: 'No votes yet.\n' },
        ],
        stub: `main :: IO ()
main = do
  line <- getLine
  undefined
`,
        hints: [
          'All the counting is done already. <code>main</code> only reads the line, splits it with <code>words</code>, and prints what <code>tally</code> and <code>winner</code> say.',
          '<code>mapM_</code> prints one line per pair of the tally. Then a <code>case</code> on <code>winner votes</code> picks the last line.',
          '<code>mapM_ (\\(o, n) -&gt; putStrLn (o ++ ": " ++ show n)) (tally votes)</code>, then <code>case winner votes of Just w -&gt; … ; Nothing -&gt; …</code>',
        ],
        solution: `main :: IO ()
main = do
  line <- getLine
  let votes = words line
  mapM_ (\\(o, n) -> putStrLn (o ++ ": " ++ show n)) (tally votes)
  case winner votes of
    Just w -> putStrLn ("The new tree is: " ++ w ++ "!")
    Nothing -> putStrLn "No votes yet."
`,
        explanation: 'A thin IO shell around a pure core: everything that can go wrong in counting is in pure functions you have tested one by one, and <code>main</code> only talks to the world.',
      },
    ],
    wrapUp: "Mayor Fern reads out the result on the steps of City Hall, and the town cheers. You've built a whole program: four pure functions, each tested on its own, and a small <code>main</code> on top. That shape (small pure pieces, a thin IO shell) is how most Haskell programs are made.",
    ideas: [
      'Draw each tree\'s votes as a bar, like <code>Oak: ##</code> (<code>replicate</code> makes a String of <code>#</code>s). Main\'s tests expect the plain format, so try this on a copy of your file in the Workshop.',
      'Refactor <code>votesFor</code> with <code>foldr</code> instead of <code>filter</code>. Run the tests: every step is checked again, so you\'ll know straight away if it still works.',
      'Write <code>options</code> without recursion, using <code>foldl</code> and <code>elem</code>. Do the tests still pass?',
    ],
  },
  {
    id: 'timetable', resident: 'pip', title: "Pip's Timetable Board", concepts: 'Records · Maybe in do · Either · recursion in IO',
    reward: 'A string of blue bunting for City Hall',
    story: "Pip leans on City Hall's front desk with a stack of crumpled notes. “Trains to Seaside, trains to Hilltop, and people asking me all day which one to take and whether there's a seat. Mayor Fern says you build programs now. Could you make me a booking board? It reads my timetable, then books seats for whoever asks.”",
    starter: `import Data.Char (isDigit)

-- Pip's Timetable Board.

-- A train on the board: where it goes, the hour it leaves, and the seats still free.
data Train = Train { dest :: String, hour :: Int, seats :: Int }
  deriving (Show, Eq)
`,
    steps: [
      {
        title: 'Reading a number', fn: 'number', sig: 'number :: String -> Maybe Int',
        task: "Pip's notes are typed by hand, so a number might not be a number. Write <code>number</code>: <code>Just</code> the number if the String is made only of digits (and isn't empty), otherwise <code>Nothing</code>.",
        examples: [['number "40"', 'Just 40'], ['number "forty"', 'Nothing'], ['number ""', 'Nothing']],
        tests: [['number "40"', 'Just 40'], ['number "9"', 'Just 9'], ['number "forty"', 'Nothing'], ['number ""', 'Nothing'], ['number "4x"', 'Nothing']],
        stub: `number :: String -> Maybe Int
number s = undefined
`,
        hints: [
          '<code>read</code> crashes on a String that isn\'t a number, so check first and only <code>read</code> when it is safe.',
          '<code>isDigit</code> (imported at the top) tests one Char; <code>all isDigit s</code> tests them all. Remember the empty String: <code>all</code> says True for it.',
          'Guards: <code>| not (null s) &amp;&amp; all isDigit s = Just (read s)</code> and <code>| otherwise = Nothing</code>.',
        ],
        solution: `number :: String -> Maybe Int
number s
  | not (null s) && all isDigit s = Just (read s)
  | otherwise = Nothing
`,
        explanation: 'Turning a partial function (<code>read</code> can crash) into a total one (<code>number</code> always answers) is one of the most useful habits in Haskell: the <code>Maybe</code> in the type warns everyone who uses it.',
      },
      {
        title: 'Reading a train', fn: 'readTrain', sig: 'readTrain :: String -> Maybe Train',
        task: 'Each line of Pip\'s timetable looks like <code>Seaside 9 40</code>: where, the hour, the seats. Write <code>readTrain</code>, which gives <code>Nothing</code> if the line doesn\'t have exactly three words or a number can\'t be read.',
        examples: [['readTrain "Seaside 9 40"', 'Just (Train "Seaside" 9 40)'], ['readTrain "Seaside nine 40"', 'Nothing'], ['readTrain "Hilltop 10"', 'Nothing']],
        tests: [['readTrain "Seaside 9 40"', 'Just (Train "Seaside" 9 40)'], ['readTrain "Hilltop 14 0"', 'Just (Train "Hilltop" 14 0)'], ['readTrain "Seaside nine 40"', 'Nothing'], ['readTrain "Seaside 9 lots"', 'Nothing'], ['readTrain "Hilltop 10"', 'Nothing'], ['readTrain ""', 'Nothing']],
        stub: `readTrain :: String -> Maybe Train
readTrain line = undefined
`,
        hints: [
          'Split the line with <code>words</code> and match on the result: a list of exactly three words is <code>[d, h, s]</code>; anything else is <code>Nothing</code>.',
          'Two numbers to read, and either can fail. A <code>do</code> block in <code>Maybe</code> (as on the Harbour lighthouse) stops at the first <code>Nothing</code>.',
          '<code>[d, h, s] -&gt; do</code> then <code>hh &lt;- number h</code>, <code>ss &lt;- number s</code>, <code>return (Train d hh ss)</code>.',
        ],
        solution: `readTrain :: String -> Maybe Train
readTrain line = case words line of
  [d, h, s] -> do
    hh <- number h
    ss <- number s
    return (Train d hh ss)
  _ -> Nothing
`,
        explanation: 'The <code>Maybe</code> monad does the checking for you: each <code>&lt;-</code> either gets a number or ends the whole block with <code>Nothing</code>. No nested <code>case</code>s needed.',
      },
      {
        title: 'The next train', fn: 'nextTrain', sig: 'nextTrain :: String -> Int -> [Train] -> Maybe Train',
        task: "Write <code>nextTrain</code>: the earliest train to a place that leaves at or after a given hour. Pip's board isn't in order. <code>Nothing</code> if there's no such train.",
        examples: [['nextTrain "Seaside" 10 [Train "Seaside" 14 30, Train "Hilltop" 10 12, Train "Seaside" 11 5]', 'Just (Train "Seaside" 11 5)'], ['nextTrain "Seaside" 15 [Train "Seaside" 14 30]', 'Nothing']],
        tests: [
          ['nextTrain "Seaside" 10 [Train "Seaside" 14 30, Train "Hilltop" 10 12, Train "Seaside" 11 5]', 'Just (Train "Seaside" 11 5)'],
          ['nextTrain "Hilltop" 10 [Train "Seaside" 14 30, Train "Hilltop" 10 12, Train "Seaside" 11 5]', 'Just (Train "Hilltop" 10 12)'],
          ['nextTrain "Seaside" 15 [Train "Seaside" 14 30, Train "Hilltop" 10 12]', 'Nothing'],
          ['nextTrain "Moon" 1 [Train "Seaside" 14 30]', 'Nothing'],
          ['nextTrain "Seaside" 0 [Train "Seaside" 14 30, Train "Seaside" 9 40, Train "Seaside" 12 8]', 'Just (Train "Seaside" 9 40)'],
        ],
        stub: `nextTrain :: String -> Int -> [Train] -> Maybe Train
nextTrain place from board = undefined
`,
        hints: [
          'Two jobs: keep the trains that fit (right place, late enough), then pick the earliest of those.',
          '<code>filter</code> with a lambda that checks <code>dest t == place &amp;&amp; hour t &gt;= from</code>. Then a fold that keeps the train with the smaller <code>hour</code>, like <code>winner</code> did.',
          '<code>case filter fits board of [] -&gt; Nothing; (t : ts) -&gt; Just (foldl earlier t ts)</code>.',
        ],
        solution: `nextTrain :: String -> Int -> [Train] -> Maybe Train
nextTrain place from board = case filter fits board of
    [] -> Nothing
    (t : ts) -> Just (foldl earlier t ts)
  where
    fits t = dest t == place && hour t >= from
    earlier a b = if hour b < hour a then b else a
`,
        explanation: 'Record fields are functions: <code>dest t</code> and <code>hour t</code> read a train. The <code>where</code> names the two small ideas, so the main line reads almost like the task.',
      },
      {
        title: 'Booking seats', fn: 'book', sig: 'book :: Int -> Train -> Either String Train',
        task: 'Write <code>book</code>: book some seats on a train. Give back the train with fewer seats free, or a message: <code>Book at least one seat.</code> for fewer than one, and <code>Not enough seats: 3 left to Seaside.</code> when there aren\'t enough.',
        examples: [['book 2 (Train "Seaside" 9 40)', 'Right (Train "Seaside" 9 38)'], ['book 5 (Train "Seaside" 9 3)', 'Left "Not enough seats: 3 left to Seaside."'], ['book 0 (Train "Hilltop" 10 12)', 'Left "Book at least one seat."']],
        tests: [
          ['book 2 (Train "Seaside" 9 40)', 'Right (Train "Seaside" 9 38)'],
          ['book 3 (Train "Seaside" 9 3)', 'Right (Train "Seaside" 9 0)'],
          ['book 5 (Train "Seaside" 9 3)', 'Left "Not enough seats: 3 left to Seaside."'],
          ['book 1 (Train "Hilltop" 14 0)', 'Left "Not enough seats: 0 left to Hilltop."'],
          ['book 0 (Train "Hilltop" 10 12)', 'Left "Book at least one seat."'],
        ],
        stub: `book :: Int -> Train -> Either String Train
book n t = undefined
`,
        hints: [
          '<code>Either</code> (as at the Clinic): <code>Left</code> carries the reason it went wrong, <code>Right</code> the new train.',
          'Three guards: too few, too many, fine. For “fine”, a record update makes a copy of the train with a new <code>seats</code>.',
          '<code>| otherwise = Right t { seats = seats t - n }</code>. The message is built with <code>++</code> and <code>show (seats t)</code>.',
        ],
        solution: `book :: Int -> Train -> Either String Train
book n t
  | n < 1 = Left "Book at least one seat."
  | n > seats t = Left ("Not enough seats: " ++ show (seats t) ++ " left to " ++ dest t ++ ".")
  | otherwise = Right t { seats = seats t - n }
`,
        explanation: '<code>t { seats = … }</code> doesn\'t change <code>t</code>: it makes a new train, the same except for the seats. Nothing in Haskell changes in place, which is why every step\'s tests can trust the functions before it.',
      },
      {
        title: 'The booking board', fn: 'main', sig: 'main :: IO ()',
        task: `Write <code>main</code>. First it reads Pip's timetable, one train per line, until a line that says <code>done</code>. A line it can't read prints <code>Pip can't read: …</code> and is skipped. Then it reads one request, like <code>Seaside 10 2</code> (where, from what hour, how many seats), and prints one of:
          <br><code>Booked on the 11 o'clock to Seaside. Seats left: 3.</code>
          <br><code>No train to Seaside from 10 o'clock.</code>
          <br>the message from <code>book</code>, or <code>Pip can't read: …</code> for a request it can't read.`,
        ioExamples: [{ input: 'Seaside 14 30\nHilltop 10 12\nSeaside 11 5\ndone\nSeaside 10 2', out: "Booked on the 11 o'clock to Seaside. Seats left: 3." }],
        tests: [
          { input: 'Seaside 14 30\nHilltop 10 12\nSeaside 11 5\ndone\nSeaside 10 2', out: "Booked on the 11 o'clock to Seaside. Seats left: 3.\n" },
          { input: 'Seaside 14 30\nSeaside ten 4\nHilltop x\ndone\nSeaside 9 1', out: "Pip can't read: Seaside ten 4\nPip can't read: Hilltop x\nBooked on the 14 o'clock to Seaside. Seats left: 29.\n" },
          { input: 'Hilltop 10 2\ndone\nHilltop 9 5', out: 'Not enough seats: 2 left to Hilltop.\n' },
          { input: 'Hilltop 10 2\ndone\nSeaside 9 1', out: 'No train to Seaside from 9 o\'clock.\n' },
          { input: 'done\nplease', out: "Pip can't read: please\n" },
        ],
        stub: `readBoard :: IO [Train]
readBoard = undefined

main :: IO ()
main = do
  board <- readBoard
  undefined
`,
        hints: [
          'A request looks just like a timetable line: a place and two numbers. So <code>readTrain</code> reads it too (its “seats” are the seats wanted). For the timetable, a recursive IO action reads lines until <code>done</code>.',
          '<code>readBoard</code>: read a line; if it is <code>"done"</code>, <code>return []</code>; else read the rest with <code>readBoard</code> and add the train in front (or print the “can\'t read” line first). Then in <code>main</code>, a <code>case</code> for each thing that can fail.',
          '<code>case readTrain request of Nothing -&gt; …; Just (Train place from n) -&gt; case nextTrain place from board of Nothing -&gt; …; Just t -&gt; case book n t of Left msg -&gt; putStrLn msg; Right t2 -&gt; …</code>',
        ],
        solution: `readBoard :: IO [Train]
readBoard = do
  line <- getLine
  if line == "done" then return [] else
    case readTrain line of
      Just t -> do
        rest <- readBoard
        return (t : rest)
      Nothing -> do
        putStrLn ("Pip can't read: " ++ line)
        readBoard

main :: IO ()
main = do
  board <- readBoard
  request <- getLine
  case readTrain request of
    Nothing -> putStrLn ("Pip can't read: " ++ request)
    Just (Train place from n) -> case nextTrain place from board of
      Nothing -> putStrLn ("No train to " ++ place ++ " from " ++ show from ++ " o'clock.")
      Just t -> case book n t of
        Left msg -> putStrLn msg
        Right booked -> putStrLn ("Booked on the " ++ show (hour booked) ++ " o'clock to " ++ place ++ ". Seats left: " ++ show (seats booked) ++ ".")
`,
        explanation: '<code>readBoard</code> is recursion in IO: it calls itself until the input says stop, just like a list function calls itself until <code>[]</code>. And reusing <code>readTrain</code> for the request is the kind of shortcut you only see once the pieces are small and clear.',
      },
    ],
    wrapUp: "Pip pins the board up in the station and books the first seats to Seaside himself. Your program reads messy input safely (<code>Maybe</code>), explains what went wrong (<code>Either</code>), and loops in IO, all on top of small functions tested one at a time.",
    ideas: [
      'Let the board take more than one request: after each booking, read another, until someone types <code>bye</code>. The booked train should have fewer seats next time, so pass the updated board along in a recursive loop.',
      'Refactor <code>main</code>\'s three nested <code>case</code>s: write <code>request :: [Train] -> String -> Either String Train</code> with a <code>do</code> block in <code>Either</code>, and turn the <code>Maybe</code>s into <code>Left</code> messages. The tests will tell you if the output changed.',
      'Print the whole timetable sorted by hour before taking a request (write your own insertion sort, as a recursion warm-up).',
    ],
  },
  {
    id: 'orders', resident: 'hazel', title: "Hazel's Order Book", concepts: 'Type classes · Semigroup & Monoid · Foldable · Traversable · IO',
    reward: 'A string of golden bunting for City Hall',
    story: "Hazel bustles into City Hall with flour on her sleeves. “Market day's coming and the orders are piling up: loaves, buns, pies, all for different people. I need to know how much to bake and what I'll take at the till. Mayor Fern said you'd write me an order book, a proper program with types and everything!”",
    starter: `-- Hazel's Order Book.

data Bake = Loaf | Bun | Pie
  deriving (Show, Eq)
`,
    steps: [
      {
        title: 'Prices', fn: null, sig: null, needs: { classes: ['Priced'], instances: [['Priced', 'Bake']] },
        task: 'Make a class <code>Priced</code> with one method, <code>price :: a -&gt; Int</code>, and an <code>instance Priced Bake</code>: a loaf is 3 coins, a bun 1, a pie 5.',
        examples: [['price Loaf', '3'], ['price Pie', '5']],
        tests: [['price Loaf', '3'], ['price Bun', '1'], ['price Pie', '5']],
        stub: `class Priced a where
  price :: a -> Int

instance Priced Bake where
  price b = undefined
`,
        hints: [
          'A class names an idea several types can share (like <code>Describable</code> at the Park). Here the idea is “has a price”.',
          '<code>class Priced a where</code> with the method\'s type on the next line, indented. The instance gives one equation per kind of bake.',
          '<code>instance Priced Bake where</code>, then <code>price Loaf = 3</code>, <code>price Bun = 1</code>, <code>price Pie = 5</code>.',
        ],
        solution: `class Priced a where
  price :: a -> Int

instance Priced Bake where
  price Loaf = 3
  price Bun = 1
  price Pie = 5
`,
        explanation: 'Right now only bakes have a price. The next step gives orders a price too, with the same method name, and that is the whole point of a class.',
      },
      {
        title: 'Orders have prices too', fn: null, sig: null, needs: { types: ['Order'], fields: ['customer', 'bakes'], instances: [['Priced', 'Order']] },
        task: 'Add a record <code>data Order = Order { customer :: String, bakes :: [Bake] }</code> (deriving <code>Show</code> and <code>Eq</code>), and an <code>instance Priced Order</code>: an order costs the prices of all its bakes added up.',
        examples: [['price (Order "Wren" [Loaf, Bun, Bun])', '5'], ['price (Order "Moss" [])', '0']],
        tests: [['price (Order "Wren" [Loaf, Bun, Bun])', '5'], ['price (Order "Moss" [])', '0'], ['price (Order "Iris" [Pie, Pie])', '10'], ['customer (Order "Bram" [Bun])', '"Bram"']],
        stub: `data Order = Order { customer :: String, bakes :: [Bake] }
  deriving (Show, Eq)

instance Priced Order where
  price order = undefined
`,
        hints: [
          'Inside the instance you can use <code>price</code> on each <code>Bake</code>: that\'s the other instance doing its job.',
          '<code>bakes order</code> is the list of bakes. Price each one, then add them up.',
          '<code>price order = sum (map price (bakes order))</code>',
        ],
        solution: `data Order = Order { customer :: String, bakes :: [Bake] }
  deriving (Show, Eq)

instance Priced Order where
  price order = sum (map price (bakes order))
`,
        explanation: 'In <code>sum (map price (bakes order))</code>, Haskell picks the <code>Bake</code> instance for the inner <code>price</code> from the types alone. One name, two meanings, never confused.',
      },
      {
        title: 'Counting the bake', fn: 'countOf', sig: 'countOf :: Bake -> Count', needs: { types: ['Count'], instances: [['Semigroup', 'Count'], ['Monoid', 'Count']] },
        task: 'Add <code>data Count = Count { loaves :: Int, buns :: Int, pies :: Int }</code> (deriving <code>Show</code> and <code>Eq</code>), make it a <code>Semigroup</code> (add the numbers) and a <code>Monoid</code> (nothing counted yet), and write <code>countOf</code>: one bake as a Count.',
        examples: [['countOf Bun', 'Count 0 1 0'], ['countOf Loaf <> countOf Loaf', 'Count 2 0 0'], ['mconcat (map countOf [Loaf, Pie, Loaf])', 'Count 2 0 1']],
        tests: [['countOf Bun', 'Count 0 1 0'], ['countOf Pie', 'Count 0 0 1'], ['countOf Loaf <> countOf Loaf', 'Count 2 0 0'], ['mempty <> countOf Pie', 'Count 0 0 1'], ['mconcat (map countOf [Loaf, Pie, Loaf])', 'Count 2 0 1'], ['mconcat [] == Count 0 0 0', 'True']],
        stub: `data Count = Count { loaves :: Int, buns :: Int, pies :: Int }
  deriving (Show, Eq)

instance Semigroup Count where
  a <> b = undefined

instance Monoid Count where
  mempty = undefined

countOf :: Bake -> Count
countOf b = undefined
`,
        hints: [
          'As at the Market: <code>&lt;&gt;</code> combines two Counts, and <code>mempty</code> is the Count that changes nothing when combined.',
          'Match both Counts in the <code>&lt;&gt;</code> equation and add field by field. <code>mempty</code> is all zeros. <code>countOf</code> has one equation per bake.',
          '<code>Count a b c &lt;&gt; Count x y z = Count (a + x) (b + y) (c + z)</code>, <code>mempty = Count 0 0 0</code>, <code>countOf Loaf = Count 1 0 0</code>…',
        ],
        solution: `data Count = Count { loaves :: Int, buns :: Int, pies :: Int }
  deriving (Show, Eq)

instance Semigroup Count where
  Count a b c <> Count x y z = Count (a + x) (b + y) (c + z)

instance Monoid Count where
  mempty = Count 0 0 0

countOf :: Bake -> Count
countOf Loaf = Count 1 0 0
countOf Bun = Count 0 1 0
countOf Pie = Count 0 0 1
`,
        explanation: 'Once <code>Count</code> is a Monoid, every tool for Monoids works on it: <code>mconcat</code>, <code>foldMap</code>, and <code>&lt;&gt;</code> anywhere. You wrote two lines and got a whole toolbox.',
      },
      {
        title: 'The whole bake', fn: 'toBake', sig: 'toBake :: [Order] -> Count',
        task: 'Write <code>toBake</code>: how many loaves, buns and pies Hazel must bake for all the orders together.',
        examples: [['toBake [Order "Wren" [Loaf, Bun], Order "Bram" [Bun, Pie]]', 'Count 1 2 1'], ['toBake []', 'Count 0 0 0']],
        tests: [['toBake [Order "Wren" [Loaf, Bun], Order "Bram" [Bun, Pie]]', 'Count 1 2 1'], ['toBake []', 'Count 0 0 0'], ['toBake [Order "Moss" []]', 'Count 0 0 0'], ['toBake [Order "Iris" [Pie, Pie, Loaf], Order "Juniper" [Bun, Bun, Bun, Pie]]', 'Count 1 3 3']],
        stub: `toBake :: [Order] -> Count
toBake orders = undefined
`,
        hints: [
          'All the bakes of all the orders in one list, then each bake turned into a Count and everything combined.',
          '<code>concatMap bakes orders</code> is every bake. <code>foldMap</code> maps and combines in one go (it\'s Foldable\'s favourite tool).',
          '<code>toBake orders = foldMap countOf (concatMap bakes orders)</code>',
        ],
        solution: `toBake :: [Order] -> Count
toBake orders = foldMap countOf (concatMap bakes orders)
`,
        explanation: '<code>foldMap countOf</code> needs nothing but a Monoid, and that is why the empty list just works: it gives <code>mempty</code>. No base case to write.',
      },
      {
        title: 'Reading an order', fn: 'readOrder', sig: 'readOrder :: String -> Maybe Order',
        task: 'Hazel types orders like <code>Wren Loaf Bun Bun</code>: a name, then the bakes. Write <code>readOrder</code>: <code>Nothing</code> for an empty line or if any word after the name isn\'t a bake.',
        examples: [['readOrder "Wren Loaf Bun"', 'Just (Order "Wren" [Loaf, Bun])'], ['readOrder "Wren Loaf Cake"', 'Nothing']],
        tests: [['readOrder "Wren Loaf Bun"', 'Just (Order "Wren" [Loaf, Bun])'], ['readOrder "Moss Pie"', 'Just (Order "Moss" [Pie])'], ['readOrder "Wren Loaf Cake"', 'Nothing'], ['readOrder ""', 'Nothing'], ['readOrder "Bram"', 'Just (Order "Bram" [])']],
        stub: `readOrder :: String -> Maybe Order
readOrder line = undefined
`,
        hints: [
          'A helper <code>readBake :: String -&gt; Maybe Bake</code> reads one word. Then every word after the name must read, or the whole order is <code>Nothing</code>.',
          '<code>mapM readBake ws</code> (or <code>traverse</code>) runs <code>readBake</code> on every word and gives <code>Just</code> the list only if all of them worked.',
          '<code>case words line of [] -&gt; Nothing; (who : ws) -&gt; fmap (Order who) (mapM readBake ws)</code>',
        ],
        solution: `readBake :: String -> Maybe Bake
readBake "Loaf" = Just Loaf
readBake "Bun" = Just Bun
readBake "Pie" = Just Pie
readBake _ = Nothing

readOrder :: String -> Maybe Order
readOrder line = case words line of
  [] -> Nothing
  (who : ws) -> fmap (Order who) (mapM readBake ws)
`,
        explanation: '<code>mapM readBake</code> turns a list of <code>Maybe</code>s inside out: <code>[Maybe Bake]</code> becomes <code>Maybe [Bake]</code>, failing if any one fails. That is Traversable doing in one word what would take a recursive function.',
      },
      {
        title: 'Market morning', fn: 'main', sig: 'main :: IO ()',
        task: `Write <code>main</code>: read orders, one per line, until a line that says <code>close</code>. An order it can't read prints <code>Hazel can't read: …</code> and is skipped. Then print the bake and the takings:
          <br><code>Loaves: 1</code> · <code>Buns: 3</code> · <code>Pies: 1</code> · <code>Takings: 11</code>, each on its own line.`,
        ioExamples: [{ input: 'Wren Loaf Bun\nBram Pie Bun Bun\nclose', out: 'Loaves: 1\nBuns: 3\nPies: 1\nTakings: 11' }],
        tests: [
          { input: 'Wren Loaf Bun\nBram Pie Bun Bun\nclose', out: 'Loaves: 1\nBuns: 3\nPies: 1\nTakings: 11\n' },
          { input: 'Iris Loaf Cake\nMoss Loaf\nJuniper Bread\nclose', out: "Hazel can't read: Iris Loaf Cake\nHazel can't read: Juniper Bread\nLoaves: 1\nBuns: 0\nPies: 0\nTakings: 3\n" },
          { input: 'close', out: 'Loaves: 0\nBuns: 0\nPies: 0\nTakings: 0\n' },
        ],
        stub: `readOrders :: IO [Order]
readOrders = undefined

main :: IO ()
main = do
  orders <- readOrders
  undefined
`,
        hints: [
          'Like a recursive list function, but in IO: <code>readOrders</code> reads a line, stops at <code>"close"</code>, and otherwise calls itself for the rest.',
          'Print the “can\'t read” line as soon as the bad line is read, then carry on with <code>readOrders</code>. In <code>main</code>, <code>toBake orders</code> gives the Count and <code>price</code> works on each order.',
          '<code>let c = toBake orders</code>, then <code>putStrLn ("Loaves: " ++ show (loaves c))</code> and so on, and <code>sum (map price orders)</code> for the takings.',
        ],
        solution: `readOrders :: IO [Order]
readOrders = do
  line <- getLine
  if line == "close" then return [] else
    case readOrder line of
      Just o -> do
        rest <- readOrders
        return (o : rest)
      Nothing -> do
        putStrLn ("Hazel can't read: " ++ line)
        readOrders

main :: IO ()
main = do
  orders <- readOrders
  let c = toBake orders
  putStrLn ("Loaves: " ++ show (loaves c))
  putStrLn ("Buns: " ++ show (buns c))
  putStrLn ("Pies: " ++ show (pies c))
  putStrLn ("Takings: " ++ show (sum (map price orders)))
`,
        explanation: 'Look how little <code>main</code> has to know: the class gives every order a price, the Monoid adds up the bake, and Traversable reads the orders safely. Each idea from the village does one job in one program.',
      },
    ],
    wrapUp: "Hazel tapes the order book to the bakery wall and bakes exactly enough for the first time ever. This program used nearly everything from the village: a class with two instances, a record, a Monoid, <code>foldMap</code>, <code>mapM</code> over <code>Maybe</code>, and IO recursion. That's mastery: choosing the right idea for each piece.",
    ideas: [
      'Give <code>Order</code> a Semigroup too, so two orders from the same customer can be joined into one.',
      'Write <code>bestCustomer :: [Order] -&gt; Maybe String</code>: who spends the most? It has the same shape as <code>winner</code> in the Tree Vote. Could one function, given a way to score things, do both?',
      'Refactor <code>readOrders</code> and Pip\'s <code>readBoard</code> into one shape: <code>readUntil :: String -&gt; (String -&gt; Maybe a) -&gt; IO [a]</code> would do for both (with the message passed in as well).',
    ],
  },
];
