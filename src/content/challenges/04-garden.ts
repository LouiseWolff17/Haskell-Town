import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'garden', num: 4, resident: 'moss', title: 'Thirsty Seedlings', concept: 'map', stage: 'Stage 2 · The Village',
    reward: 'The community garden', requires: ['bakery'],
    story: "Old Moss wants to plant a community garden across the road. “Each seedling has a water level. One trip with the watering can raises every plant's level by 1. Could you tell me what the levels will be after watering?”",
    task: 'Write <code>waterAll</code>, which takes a list of water levels and adds 1 to every one of them.',
    fn: 'waterAll', sig: 'waterAll :: [Int] -> [Int]',
    examples: [['waterAll [0, 3, 1]', '[1, 4, 2]'], ['waterAll []', '[]']],
    tests: [['waterAll [0, 3, 1]', '[1, 4, 2]'], ['waterAll []', '[]'], ['waterAll [5]', '[6]'], ['waterAll [9, 9, 2, 0]', '[10, 10, 3, 1]']],
    starter: {
      guided: "-- map applies a function to every item in a list.\n-- (+ 1) is a function that adds 1 to whatever it's given.\nwaterAll :: [Int] -> [Int]\nwaterAll levels = map ___ levels\n",
      balanced: "waterAll :: [Int] -> [Int]\nwaterAll levels = undefined\n",
      independent: "-- Write waterAll here.\n\n",
    },
    primer: "<code>map</code> takes a <b>function</b> and a <b>list</b>, and applies the function to every item. Functions are values in Haskell, so you can hand one to another function! <code>(* 2)</code> is a little function that doubles; <code>(+ 1)</code> adds one.",
    primerCode: "map (* 2) [1, 2, 3]       -- [2,4,6]\nmap (\\n -> n - 1) [5, 6]  -- [4,5]",
    hints: [
      "When you want to do <i>the same thing</i> to <i>every item</i> of a list, that's the job of <code>map</code>.",
      "Think of two pieces: what to do to one plant (add 1), and the list of plants. <code>map</code> takes the first piece, then the second.",
      "The shape is <code>waterAll levels = map ??? levels</code>, where <code>???</code> is a function that adds one to a number.",
      "A function that adds one can be written <code>(+ 1)</code> — that's called a <i>section</i>. Or as a lambda: <code>(\\n -> n + 1)</code>. Put either one after <code>map</code>.",
    ],
    solution: "waterAll :: [Int] -> [Int]\nwaterAll levels = map (+ 1) levels\n",
    explanation: "<code>map (+ 1) levels</code> builds a new list by applying <code>(+ 1)</code> to each item. Nothing is changed in place — Haskell makes a fresh list. Bonus: since both sides end in <code>levels</code>, you can write simply <code>waterAll = map (+ 1)</code>.",
    learn: { title: 'map', body: '<code>map f xs</code> applies <code>f</code> to every item of <code>xs</code> and returns a new list of the same length. Functions can be passed around like any other value.', code: 'map (+ 1) [0, 3, 1]  -- [1,4,2]' },
  },
];

export default challenges;
