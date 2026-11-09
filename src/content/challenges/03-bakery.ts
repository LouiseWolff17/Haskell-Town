import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'bakery', num: 3, resident: 'hazel', title: 'Bread for the Week', concept: 'Pattern matching', stage: 'Stage 2 · The Village',
    reward: "Hazel's bakery", requires: ['mailbox'],
    story: "A baker named Hazel has arrived on the new road! “On Saturdays the market is busy, so I bake 24 loaves. On Sundays I'm closed — no loaves at all. Every other day, 12 loaves will do. Could you write that down for me?”",
    task: 'Write <code>loavesFor</code>, which takes the name of a day and returns how many loaves Hazel should bake.',
    fn: 'loavesFor', sig: 'loavesFor :: String -> Int',
    examples: [['loavesFor "Saturday"', '24'], ['loavesFor "Sunday"', '0'], ['loavesFor "Tuesday"', '12']],
    tests: [['loavesFor "Saturday"', '24'], ['loavesFor "Sunday"', '0'], ['loavesFor "Monday"', '12'], ['loavesFor "Wednesday"', '12']],
    starter: {
      guided: "-- Haskell tries each equation from top to bottom\n-- and uses the first one that matches.\nloavesFor :: String -> Int\nloavesFor \"Saturday\" = 24\nloavesFor \"Sunday\"   = ___\nloavesFor _          = ___\n",
      balanced: "loavesFor :: String -> Int\nloavesFor day = undefined\n",
      independent: "-- Write loavesFor here.\n\n",
    },
    primer: "<b>Pattern matching</b> lets you write a function as several equations, one for each kind of input. Haskell checks them from top to bottom and uses the first that fits. The underscore <code>_</code> matches <i>anything</i>, so it's perfect as a last “otherwise” case.",
    primerCode: "greet :: String -> String\ngreet \"Hazel\" = \"Morning, baker!\"\ngreet _       = \"Hello, neighbour!\"",
    hints: [
      "Instead of one big rule, you can write <i>several equations</i> for the same function, each starting with a different input pattern.",
      "There are three situations: Saturday, Sunday, and every other day. Write one equation for each, and put the catch-all last — order matters!",
      "The shape looks like:<pre>loavesFor \"Saturday\" = ...\nloavesFor \"Sunday\"   = ...\nloavesFor _          = ...</pre>",
      "Fill in 24 for Saturday, 0 for Sunday, and 12 for the <code>_</code> case. If the <code>_</code> equation came first, it would match every day!",
    ],
    solution: "loavesFor :: String -> Int\nloavesFor \"Saturday\" = 24\nloavesFor \"Sunday\"   = 0\nloavesFor _          = 12\n",
    explanation: "Each equation handles one pattern. When you call <code>loavesFor \"Monday\"</code>, Haskell skips the Saturday and Sunday equations (they don't match) and lands on <code>_</code>, which matches anything. Putting the most specific cases first is a habit you'll use all the time.",
    learn: { title: 'Pattern matching', body: 'Write a function as several equations, one per input shape. They are tried top to bottom; <code>_</code> matches anything, so it goes last.', code: 'loavesFor "Sunday" = 0\nloavesFor _        = 12' },
  },
];

export default challenges;
