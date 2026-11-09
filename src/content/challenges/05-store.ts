import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'store', num: 5, resident: 'bram', title: 'Bargain Shelf', concept: 'filter', stage: 'Stage 2 · The Village',
    reward: "Bram's general store", requires: ['bakery'],
    story: "Bram is opening a general store and wants a bargain shelf by the door. “Anything that costs less than 10 coins goes on the shelf. Could you pick those prices out for me, in the same order?”",
    task: 'Write <code>bargains</code>, which takes a list of prices and keeps only the ones below 10.',
    fn: 'bargains', sig: 'bargains :: [Int] -> [Int]',
    examples: [['bargains [12, 4, 9, 30]', '[4, 9]'], ['bargains [15, 20]', '[]']],
    tests: [['bargains [12, 4, 9, 30, 10]', '[4, 9]'], ['bargains []', '[]'], ['bargains [15, 20]', '[]'], ['bargains [1, 2, 3]', '[1, 2, 3]']],
    starter: {
      guided: "-- filter keeps the items for which a test says True.\n-- (< 10) is a test: \"is this less than 10?\"\nbargains :: [Int] -> [Int]\nbargains prices = filter ___ prices\n",
      balanced: "bargains :: [Int] -> [Int]\nbargains prices = undefined\n",
      independent: "-- Write bargains here.\n\n",
    },
    primer: "<code>filter</code> takes a <b>test</b> (a function that returns <code>True</code> or <code>False</code>) and a list, and keeps only the items that pass. Like <code>map</code>, it's a function that takes another function.",
    primerCode: "filter even [1, 2, 3, 4]   -- [2,4]\nfilter (> 2) [1, 2, 3, 4]  -- [3,4]",
    hints: [
      "You're choosing <i>some</i> items from a list and dropping the rest. The Prelude function for that is <code>filter</code>.",
      "<code>filter</code> needs a test that answers “should this price stay?” — True means keep it.",
      "The shape is <code>bargains prices = filter ??? prices</code>, where <code>???</code> answers “is this less than 10?”",
      "A test for “less than 10” can be written <code>(< 10)</code> or <code>(\\p -> p < 10)</code>. Careful: 10 itself shouldn't be kept!",
    ],
    solution: "bargains :: [Int] -> [Int]\nbargains prices = filter (< 10) prices\n",
    explanation: "<code>filter (< 10) prices</code> walks the list and keeps each price where <code>p < 10</code> is <code>True</code>, preserving the order. <code>map</code> transforms every item; <code>filter</code> chooses items. Together they handle a surprising amount of real work.",
    learn: { title: 'filter', body: '<code>filter test xs</code> keeps only the items of <code>xs</code> for which <code>test</code> returns <code>True</code>. The order stays the same.', code: 'filter (< 10) [12, 4, 9]  -- [4,9]' },
  },
];

export default challenges;
