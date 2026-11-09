import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'library', num: 6, resident: 'iris', title: 'Counting the Pages', concept: 'Recursion', stage: 'Stage 3 · The Growing Town',
    reward: 'The Library', requires: ['garden', 'store'],
    story: "Iris the librarian has arrived to open a library across the road. “Each book on this shelf has a number of pages, and I'd like the total. But please — do it the old-fashioned way, one book at a time!”",
    task: 'Write <code>totalPages</code>, which adds up all the page counts in a list. Use <b>recursion</b> — no <code>sum</code>, <code>foldr</code> or <code>foldl</code> this time.',
    fn: 'totalPages', sig: 'totalPages :: [Int] -> Int', forbid: ['sum', 'foldr', 'foldl', 'product'], recursive: true,
    examples: [['totalPages []', '0'], ['totalPages [120, 80]', '200']],
    tests: [['totalPages []', '0'], ['totalPages [100]', '100'], ['totalPages [120, 80]', '200'], ['totalPages [5, 10, 15, 20]', '50']],
    starter: {
      guided: "-- Two cases: an empty shelf, and a shelf with a first book p\n-- followed by the rest of the shelf.\ntotalPages :: [Int] -> Int\ntotalPages []       = ___\ntotalPages (p:rest) = p + ___\n",
      balanced: "totalPages :: [Int] -> Int\ntotalPages pages = undefined\n",
      independent: "-- Write totalPages here, using recursion.\n\n",
    },
    primer: "<b>Recursion</b> means a function that uses itself. A recursive function on lists has two parts: a <b>base case</b> for the empty list <code>[]</code>, and a <b>recursive case</b> for a list made of a first item and the rest, written <code>(x:rest)</code>. The recursive case does a little work with <code>x</code> and lets the function itself handle <code>rest</code>.",
    primerCode: "countDown :: Int -> [Int]\ncountDown 0 = [0]\ncountDown n = n : countDown (n - 1)\n\n-- countDown 3  gives  [3,2,1,0]",
    hints: [
      "A list is either empty, <code>[]</code>, or a first item followed by the rest, <code>(p:rest)</code>. Write one equation for each.",
      "What's the total of an empty shelf? And if you already knew the total of <code>rest</code>, how would you get the total of the whole shelf?",
      "The total of the rest is <code>totalPages rest</code> — the function calling itself on a smaller list.",
      "Base case: <code>totalPages [] = 0</code>. Recursive case: <code>totalPages (p:rest) = p + totalPages rest</code>.",
    ],
    solution: "totalPages :: [Int] -> Int\ntotalPages []       = 0\ntotalPages (p:rest) = p + totalPages rest\n",
    explanation: "Haskell unfolds it like this:<pre>totalPages [120, 80]\n= 120 + totalPages [80]\n= 120 + (80 + totalPages [])\n= 120 + (80 + 0)\n= 200</pre>The base case is what makes it stop. This is exactly how <code>sum</code> is built — and now you could write it yourself.",
    learn: { title: 'Recursion', body: 'A recursive function calls itself on a smaller input. On lists: a base case for <code>[]</code> and a recursive case for <code>(x:rest)</code>.', code: 'total []       = 0\ntotal (x:rest) = x + total rest' },
  },
  {
    id: 'library2', plot: 'library', upgrade: true, num: 7, resident: 'iris', title: 'Is It on the Shelf?', concept: 'Recursion with guards', stage: 'Stage 3 · The Growing Town',
    reward: 'A reading bench and lanterns for the Library', requires: ['library'],
    story: "A visitor asks Iris whether the library has a certain book. “Could you check the shelf for me, one title at a time? Stop as soon as you find it!”",
    task: 'Write <code>hasBook title shelf</code>, which is <code>True</code> if <code>title</code> is somewhere in <code>shelf</code> and <code>False</code> otherwise. Use recursion — no <code>elem</code>, <code>any</code> or <code>filter</code>.',
    fn: 'hasBook', sig: 'hasBook :: String -> [String] -> Bool', forbid: ['elem', 'notElem', 'any', 'all', 'filter', 'lookup'], recursive: true,
    examples: [['hasBook "Rain" ["Moss Grows", "Rain"]', 'True'], ['hasBook "Owls" []', 'False']],
    tests: [['hasBook "Owls" []', 'False'], ['hasBook "Rain" ["Rain"]', 'True'], ['hasBook "Owls" ["Rain", "Moss Grows"]', 'False'], ['hasBook "Owls" ["Rain", "Moss Grows", "Owls"]', 'True']],
    starter: {
      guided: "hasBook :: String -> [String] -> Bool\nhasBook _ [] = ___\nhasBook title (b:rest)\n  | title == b = ___\n  | otherwise  = hasBook title ___\n",
      balanced: "hasBook :: String -> [String] -> Bool\nhasBook title shelf = undefined\n",
      independent: "-- Write hasBook here, using recursion.\n\n",
    },
    primer: "Recursion can stop early. With <b>guards</b> (the <code>|</code> lines) the recursive case can check a condition first, and only keep going if it needs to. A recursive call can also pass extra arguments along unchanged.",
    primerCode: "firstBig :: [Int] -> Int\nfirstBig [] = 0\nfirstBig (x:rest)\n  | x > 100   = x\n  | otherwise = firstBig rest",
    hints: [
      "Searching an empty shelf can never find anything. For a non-empty shelf, look at the first book <code>b</code>.",
      "If the first book is the title you want, you're done. If not, keep looking in the rest of the shelf.",
      "Use guards on the recursive case: <code>| title == b = …</code> and <code>| otherwise = …</code>.",
      "Empty shelf: <code>False</code>. When <code>title == b</code>: <code>True</code>. Otherwise: <code>hasBook title rest</code>.",
    ],
    solution: "hasBook :: String -> [String] -> Bool\nhasBook _ [] = False\nhasBook title (b:rest)\n  | title == b = True\n  | otherwise  = hasBook title rest\n",
    explanation: "The search stops as soon as the book is found — the rest of the shelf is never looked at. That's how <code>elem</code> works inside. Notice that <code>title</code> travels along unchanged in every recursive call: recursion can carry extra information with it.",
    learn: { title: 'Recursion with guards', body: 'Guards let a recursive function decide whether to stop or keep going. Extra arguments can be passed along unchanged in each call.', code: 'has x [] = False\nhas x (y:rest)\n  | x == y    = True\n  | otherwise = has x rest' },
  },
];

export default challenges;
