import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'house', num: 1, resident: 'wren', title: "Wren's Moving Day", concept: 'Functions & types', stage: 'Stage 1 · The Beginning',
    reward: "Wren's cottage", requires: [],
    story: "Wren has just rolled into town with a handcart full of boxes. “I've got some boxes on the cart and some already by the door. Could you write me a little function that adds two numbers? Then I'll know how many I have to unpack!”",
    task: 'Write a function <code>add</code> that takes two whole numbers and gives back their sum.',
    fn: 'add', sig: 'add :: Int -> Int -> Int',
    examples: [['add 2 3', '5'], ['add 10 0', '10']],
    tests: [['add 2 3', '5'], ['add 0 0', '0'], ['add 10 (-4)', '6'], ['add 7 8', '15']],
    starter: {
      guided: "-- The type signature says: add takes an Int, then another Int,\n-- and gives back an Int.\nadd :: Int -> Int -> Int\nadd x y = ___\n",
      balanced: "add :: Int -> Int -> Int\nadd x y = undefined\n",
      independent: "-- Write a function called add here.\n\n",
    },
    primer: "In Haskell, a function is written as its name, its arguments separated by spaces, an <code>=</code> sign, and an expression for the result. No brackets or commas around the arguments! The line above it, with <code>::</code>, is the <b>type signature</b>: it says what goes in and what comes out.",
    primerCode: "double :: Int -> Int\ndouble n = n * 2\n\n-- double 4  gives  8",
    hints: [
      "A function's arguments get names on the left of the <code>=</code>. Here they're called <code>x</code> and <code>y</code>. Whatever you write on the right of <code>=</code> is the answer.",
      "You want an answer that combines <code>x</code> and <code>y</code>. Which arithmetic operator joins two numbers into their total?",
      "The shape is: <code>add x y = x ? y</code> — just replace the <code>?</code> with the right operator.",
      "Write <code>x</code>, then the plus sign <code>+</code>, then <code>y</code> on the right of the equals sign.",
    ],
    solution: "add :: Int -> Int -> Int\nadd x y = x + y\n",
    explanation: "<code>add x y = x + y</code> reads as “add of x and y <i>is</i> x plus y.” In Haskell, <code>=</code> isn't “store this value” — it's a definition. Wherever you see <code>add 2 3</code>, you could replace it with <code>2 + 3</code>.",
    learn: { title: 'Functions', body: 'A function definition is a name, its arguments, <code>=</code>, and the result. A type signature with <code>::</code> describes what goes in and comes out; <code>-&gt;</code> separates each argument.', code: 'add :: Int -> Int -> Int\nadd x y = x + y' },
  },
];

export default challenges;
