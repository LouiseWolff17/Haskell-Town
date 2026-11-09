import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'observatory', num: 22, resident: 'orla', title: 'The Endless Star Chart', concept: 'Laziness & infinite lists', stage: 'Stage 6 · The Observatory',
    reward: 'The Observatory', requires: ['market2'],
    story: "Orla the astronomer is building an observatory on the hill by the sea. “I give every star I find a name: Star 1, Star 2, Star 3… and I'll never run out of stars. I want <i>one</i> list with all their names in it, forever. Then on any night I can just take the first few I need.”",
    task: 'Write <code>starNames :: [String]</code>, the <b>endless</b> list <code>["Star 1", "Star 2", "Star 3", …]</code>. Then write <code>firstStars :: Int -> [String]</code>, which gives the first <code>n</code> names from it.',
    fn: 'firstStars', sig: 'firstStars :: Int -> [String]',
    examples: [['firstStars 3', '["Star 1","Star 2","Star 3"]'], ['starNames !! 99', '"Star 100"']],
    tests: [['firstStars 3', '["Star 1", "Star 2", "Star 3"]'], ['firstStars 0', '[]'], ['starNames !! 99', '"Star 100"'], ['starNames !! 5000', '"Star 5001"'],
      ['take 2 (drop 7 starNames)', '["Star 8", "Star 9"]'], ['head (filter (\\s -> length s > 6) starNames)', '"Star 10"']],
    starter: {
      guided: "-- [1..] counts up forever: 1, 2, 3, 4, …\n-- Haskell only works out the parts of it that are needed.\nstarNames :: [String]\nstarNames = map (\\n -> \"Star \" ++ show n) ___\n\nfirstStars :: Int -> [String]\nfirstStars n = ___ n starNames\n",
      balanced: "starNames :: [String]\nstarNames = undefined\n\nfirstStars :: Int -> [String]\nfirstStars n = undefined\n",
      independent: "-- Write starNames (an endless list of names) and firstStars here.\n",
    },
    primer: "Haskell is <b>lazy</b>: it only works out a value when something needs it. That means a list can go on forever! <code>[1..]</code> is every number from 1 upwards. You can't print all of it, but you can <code>take 5 [1..]</code>, and Haskell computes just those five. <code>map</code>, <code>filter</code>, <code>zip</code> and list comprehensions all work on endless lists too, one item at a time.",
    primerCode: "evens :: [Int]\nevens = [2, 4 ..]          -- 2, 4, 6, 8, … forever\n\n-- take 4 evens             gives [2,4,6,8]\n-- takeWhile (< 9) evens    gives [2,4,6,8]\n-- zip [1..] \"abc\"          gives [(1,'a'),(2,'b'),(3,'c')]",
    hints: [
      "Build the endless list once, from the endless list of numbers <code>[1..]</code>. Each number becomes a name. Then <code>firstStars</code> just takes the start of it.",
      "Turning every number into a name is a job for <code>map</code> (or a list comprehension). Getting the first <code>n</code> items of a list is <code>take</code>.",
      "<code>starNames = map (\\n -> \"Star \" ++ show n) [1..]</code> — or as a comprehension: <code>[\"Star \" ++ show n | n &lt;- [1..]]</code>.",
      "<code>firstStars n = take n starNames</code>.",
    ],
    solution: "starNames :: [String]\nstarNames = map (\\n -> \"Star \" ++ show n) [1..]\n\nfirstStars :: Int -> [String]\nfirstStars n = take n starNames\n",
    explanation: "<code>starNames</code> never ends, yet <code>starNames !! 5000</code> is instant: Haskell only builds the names something asks for. That's <b>laziness</b>. It lets you describe <i>everything</i> (all the stars, all the numbers) and decide later how much you need. Just don't ask for the whole thing: <code>length starNames</code> would count forever (Haskell Town stops it and tells you).",
    learn: { title: 'Laziness & infinite lists', body: 'Haskell works out values only when they are needed, so lists can be endless: <code>[1..]</code>, <code>repeat x</code>, <code>cycle xs</code>, <code>iterate f x</code>. Use <code>take</code>, <code>takeWhile</code>, <code>!!</code> or <code>zip</code> to use just part of one.', code: 'starNames = map (\\n -> "Star " ++ show n) [1..]\n\ntake 3 starNames  -- ["Star 1","Star 2","Star 3"]' },
  },
  {
    id: 'observatory2', plot: 'observatory', upgrade: true, num: 23, resident: 'orla', title: 'The Twinkling Star', concept: 'Lists defined by themselves', stage: 'Stage 6 · The Observatory',
    reward: 'A telescope for the Observatory', requires: ['observatory'],
    story: "Orla has found a very strange star. “On the first two nights it was 1 bright. Since then, every night it's as bright as the two nights before added together: 1, 1, 2, 3, 5, 8… I'd like the whole list of nights, forever. I have a feeling the list can be built out of <i>itself</i>.”",
    task: 'Write <code>twinkles :: [Int]</code>, the endless list <code>[1, 1, 2, 3, 5, 8, 13, …]</code>: it starts with two 1s, and each next number is the sum of the two before it. Try building it from itself, with <code>zipWith</code> and <code>tail</code>!',
    fn: 'twinkles', sig: 'twinkles :: [Int]',
    examples: [['take 7 twinkles', '[1,1,2,3,5,8,13]'], ['twinkles !! 30', '1346269']],
    tests: [['take 7 twinkles', '[1, 1, 2, 3, 5, 8, 13]'], ['take 2 twinkles', '[1, 1]'], ['twinkles !! 30', '1346269'], ['takeWhile (< 100) twinkles', '[1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]'], ['head (dropWhile (< 1000) twinkles)', '1597']],
    starter: {
      guided: "-- zipWith (+) adds two lists item by item:\n--   zipWith (+) [1, 2, 3] [10, 20, 30]  gives  [11, 22, 33]\n-- tail drops the first item:  tail [1, 1, 2, 3]  gives  [1, 2, 3]\n--\n-- twinkles:        1 1 2 3 5 …\n-- tail twinkles:   1 2 3 5 …\n-- added together:  2 3 5 8 …   ← that's the rest of twinkles!\ntwinkles :: [Int]\ntwinkles = 1 : 1 : zipWith (+) ___ ___\n",
      balanced: "twinkles :: [Int]\ntwinkles = undefined\n",
      independent: "-- Write twinkles :: [Int] here.\n",
    },
    primer: "Because Haskell is lazy, a list can be defined <b>in terms of itself</b>. <code>ones = 1 : ones</code> is an endless list of 1s: the first item is 1, and the rest is… <code>ones</code> again. Haskell is happy, as long as each new item only needs items that came before it. The <code>:</code> puts an item at the front, and the rest is only worked out when someone asks for it.",
    primerCode: "ones :: [Int]\nones = 1 : ones                     -- 1, 1, 1, …\n\ncounting :: [Int]\ncounting = 1 : map (+ 1) counting   -- 1, 2, 3, …\n\n-- take 4 counting  gives [1,2,3,4]",
    hints: [
      "Write down the list, and under it the same list shifted by one (its <code>tail</code>). Add the two rows together, item by item: you get the list again, from its third item on.",
      "So the list is: <code>1</code>, then <code>1</code>, then the item-by-item sum of <code>twinkles</code> and <code>tail twinkles</code>. Adding two lists item by item is <code>zipWith (+)</code>.",
      "<code>twinkles = 1 : 1 : zipWith (+) … …</code>, where the two blanks are the list itself and the list without its first item.",
      "<code>twinkles = 1 : 1 : zipWith (+) twinkles (tail twinkles)</code>.",
    ],
    solution: "twinkles :: [Int]\ntwinkles = 1 : 1 : zipWith (+) twinkles (tail twinkles)\n",
    explanation: "This is the famous Fibonacci sequence, written as a list that feeds on itself. To get the third item, <code>zipWith</code> needs the first item of <code>twinkles</code> and of <code>tail twinkles</code>, which are already there. Each item is built once and remembered, so <code>twinkles !! 30</code> is quick. In a language that isn't lazy, this definition would loop forever before giving you anything. In Haskell it's one line.",
    learn: { title: 'Lists defined by themselves', body: 'Thanks to laziness, a list can use its own earlier items: <code>ones = 1 : ones</code>, or <code>fibs = 0 : 1 : zipWith (+) fibs (tail fibs)</code>. Each new item may only need items before it.', code: 'twinkles :: [Int]\ntwinkles = 1 : 1 : zipWith (+) twinkles (tail twinkles)' },
  },
];

export default challenges;
