import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'mailbox', num: 2, resident: 'wren', title: 'The Mailbox Problem', concept: 'Lists', stage: 'Stage 1 · The Beginning',
    reward: 'A mailbox and the country road', requires: ['house'],
    story: "Wren is settling in, but letters keep piling up on the doorstep. “Could you help me make a function that tells me how many letters I've received?”",
    task: 'Write a function <code>countLetters</code> that takes a list of letters and returns how many letters are in that list.',
    fn: 'countLetters', sig: 'countLetters :: [String] -> Int',
    examples: [['countLetters []', '0'], ['countLetters ["Hi"]', '1'], ['countLetters ["Hi", "Hello"]', '2']],
    tests: [['countLetters []', '0'], ['countLetters ["Hi"]', '1'], ['countLetters ["Hi", "Hello"]', '2'], ['countLetters ["Dear Wren", "Welcome!", "Bills", "Postcard"]', '4']],
    starter: {
      guided: "-- [String] means \"a list of Strings\".\ncountLetters :: [String] -> Int\ncountLetters letters = ___ letters\n",
      balanced: "countLetters :: [String] -> Int\ncountLetters letters = undefined\n",
      independent: "-- Write countLetters here.\n\n",
    },
    primer: "A <b>list</b> holds many values of the same type, written in square brackets: <code>[1, 2, 3]</code> or <code>[\"Hi\", \"Hello\"]</code>. The empty list is <code>[]</code>. Haskell comes with a toolbox of list functions called the <b>Prelude</b>.",
    primerCode: "reverse [1, 2, 3]   -- [3,2,1]\nhead [\"a\", \"b\"]     -- \"a\"\nsum [1, 2, 3]       -- 6",
    hints: [
      "This is a question about the <i>size</i> of a list. Haskell's Prelude already has many functions that work on any list.",
      "You don't need to look inside any of the letters — you only need to know how many there are. Is there a built-in function that gives the size of a list?",
      "The function you're looking for is <code>length</code>. Its type is <code>length :: [a] -> Int</code> — it works on lists of anything.",
      "Give the list to <code>length</code>: on the right of the <code>=</code>, write <code>length</code> followed by a space and <code>letters</code>.",
    ],
    solution: "countLetters :: [String] -> Int\ncountLetters letters = length letters\n",
    explanation: "<code>length letters</code> counts the items in the list. Curious how <code>length</code> itself works? It can be written with <b>recursion</b> — you'll meet this at the Library later:<pre>countLetters [] = 0\ncountLetters (_:rest) = 1 + countLetters rest</pre>",
    learn: { title: 'Lists', body: 'Lists are written in square brackets and hold values of one type. <code>[String]</code> is the type “list of strings”. The Prelude gives you <code>length</code>, <code>reverse</code>, <code>head</code>, <code>sum</code> and many more.', code: 'length ["Hi", "Hello"]  -- 2' },
  },
];

export default challenges;
