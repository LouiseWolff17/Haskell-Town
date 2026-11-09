import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'railway', num: 14, resident: 'pip', title: 'Every Train on Time', concept: 'Higher-order functions', stage: 'Stage 4 · The City',
    reward: 'The Railway Station', requires: ['hall2', 'clinic2'],
    story: "Conductor Pip is building a railway station at the edge of town. “Every timetable change I make applies to <i>every</i> train: add five minutes to all of them, or double them, or turn them into labels. I'd love one function where I can pass in <i>which</i> change to make.”",
    task: 'Write your own version of <code>map</code>, called <code>everyTrain</code>: it takes a function and a list, and applies the function to every item. Use recursion — no <code>map</code> allowed!',
    fn: 'everyTrain', sig: 'everyTrain :: (a -> b) -> [a] -> [b]', forbid: ['map', 'foldr', 'foldl', 'concatMap', 'mapM', 'mapM_'], recursive: true,
    examples: [['everyTrain (+ 5) [600, 615]', '[605, 620]'], ['everyTrain show [1, 2]', '["1", "2"]']],
    tests: [['everyTrain (+ 5) [600, 615]', '[605, 620]'], ['everyTrain (* 2) []', '[]'], ['everyTrain show [1, 2]', '["1", "2"]'], ['everyTrain even [1, 2, 3]', '[False, True, False]']],
    starter: {
      guided: "-- f is a function. everyTrain uses it on every item of the list.\neveryTrain :: (a -> b) -> [a] -> [b]\neveryTrain f []       = ___\neveryTrain f (x:rest) = f x : ___\n",
      balanced: "everyTrain :: (a -> b) -> [a] -> [b]\neveryTrain f trains = undefined\n",
      independent: "-- Write everyTrain here, using recursion.\n\n",
    },
    primer: "A <b>higher-order function</b> takes another function as an argument. You've already used some: <code>map</code> and <code>filter</code>. In a type, a function argument is written in parentheses: <code>(a -&gt; b)</code> means “a function from <code>a</code> to <code>b</code>”. The lowercase letters are <b>type variables</b>: they can stand for any type.",
    primerCode: "twice :: (a -> a) -> a -> a\ntwice f x = f (f x)\n\n-- twice (+ 3) 10       gives  16\n-- twice reverse \"abc\"  gives  \"abc\"",
    hints: [
      "It's a recursive function on lists, like <code>totalPages</code> at the Library — but this time it builds a new list instead of a number.",
      "An empty list stays empty. For <code>(x:rest)</code>, the new list starts with <code>f x</code> and continues with the rest, changed the same way.",
      "Use <code>:</code> to put <code>f x</code> in front of the recursive result: <code>f x : everyTrain f …</code>.",
      "<code>everyTrain f [] = []</code> and <code>everyTrain f (x:rest) = f x : everyTrain f rest</code>.",
    ],
    solution: "everyTrain :: (a -> b) -> [a] -> [b]\neveryTrain f []       = []\neveryTrain f (x:rest) = f x : everyTrain f rest\n",
    explanation: "You've just written <code>map</code> itself! The type <code>(a -&gt; b) -&gt; [a] -&gt; [b]</code> says it works for any types at all, so the same function adds minutes to times, turns numbers into Strings, and checks which are even. Passing <code>f</code> along in the recursive call is what makes it work.",
    learn: { title: 'Higher-order functions', body: 'Functions can take functions as arguments. <code>(a -&gt; b)</code> in a type is a function argument; type variables like <code>a</code> work for any type.', code: 'everyTrain f []       = []\neveryTrain f (x:rest) = f x : everyTrain f rest' },
  },
  {
    id: 'railway2', plot: 'railway', upgrade: true, num: 15, resident: 'pip', title: 'All Aboard!', concept: 'Functions as values & folds', stage: 'Stage 4 · The City',
    reward: 'Train service for the Railway', requires: ['railway'],
    story: "The first train is ready to roll! “At every stop, something happens to the passenger count: some people get on, some get off. I've written each stop as a little function. Could you tell me how many passengers are left at the end of the line?”",
    task: 'Write <code>passengersAfter</code>, which takes a list of stops (each one a function <code>Int -&gt; Int</code>) and a starting number of passengers, and applies the stops in order, first to last.',
    fn: 'passengersAfter', sig: 'passengersAfter :: [Int -> Int] -> Int -> Int',
    examples: [['passengersAfter [(+ 5), subtract 2] 10', '13'], ['passengersAfter [] 10', '10']],
    tests: [['passengersAfter [] 10', '10'], ['passengersAfter [(+ 5)] 10', '15'], ['passengersAfter [(+ 5), subtract 3, (* 2)] 0', '4'], ['passengersAfter [(* 2), (+ 1)] 3', '7']],
    starter: {
      guided: "-- Apply the first stop, then carry on with the rest of the stops.\npassengersAfter :: [Int -> Int] -> Int -> Int\npassengersAfter []           people = ___\npassengersAfter (stop:stops) people = passengersAfter stops ___\n",
      balanced: "passengersAfter :: [Int -> Int] -> Int -> Int\npassengersAfter stops people = undefined\n",
      independent: "-- Write passengersAfter here.\n\n",
    },
    primer: "Functions are ordinary values, so you can keep them in a list: <code>[(+ 1), (* 2)] :: [Int -&gt; Int]</code>. A <b>fold</b> walks through a list while carrying a running value along. <code>foldl</code> goes from left to right: <code>foldl step start list</code>.",
    primerCode: "-- foldl (\\total x -> total + x) 0 [1, 2, 3]\n--   = ((0 + 1) + 2) + 3\n--   = 6",
    hints: [
      "Each stop is a function: if <code>stop</code> is <code>(+ 5)</code>, then <code>stop people</code> is <code>people + 5</code>.",
      "With no stops left, the count doesn't change. Otherwise, apply the first stop to <code>people</code> and carry on with the remaining stops.",
      "The recursive case is <code>passengersAfter stops (stop people)</code> — the new count travels along to the next stop.",
      "Base case: <code>passengersAfter [] people = people</code>. Or the whole thing as a fold: <code>passengersAfter stops people = foldl (\\n stop -&gt; stop n) people stops</code>.",
    ],
    solution: "passengersAfter :: [Int -> Int] -> Int -> Int\npassengersAfter []           people = people\npassengersAfter (stop:stops) people = passengersAfter stops (stop people)\n",
    explanation: "Order matters: <code>[(* 2), (+ 1)]</code> starting at 3 gives 7, but <code>[(+ 1), (* 2)]</code> would give 8. Your recursion carries the running count along exactly the way <code>foldl</code> does, so <code>foldl (\\n stop -&gt; stop n) people stops</code> is the same function in one line.",
    learn: { title: 'Functions as values & folds', body: 'Functions can live in lists and be passed around. A fold carries a running value through a list.', code: 'foldl (\\n stop -> stop n) 0 [(+ 5), (* 2)]  -- 10' },
  },
];

export default challenges;
