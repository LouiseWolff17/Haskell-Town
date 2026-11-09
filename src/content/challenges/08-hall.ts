import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'hall', num: 10, resident: 'fern', title: 'The Welcome Desk', concept: 'IO & do blocks', stage: 'Stage 4 · The City',
    reward: 'City Hall', requires: ['school2'],
    story: "Mayor Fern has arrived to open City Hall. “New residents come to the front desk every day. Could you write a little program that asks for their name and welcomes them?”",
    task: 'Write <code>main</code>, which reads one line (the newcomer\'s name) with <code>getLine</code> and prints <code>Welcome to Haskell Town, NAME!</code>',
    fn: 'main', sig: 'main :: IO ()',
    ioExamples: [{ input: 'Wren', out: 'Welcome to Haskell Town, Wren!' }],
    tests: [{ input: 'Wren', out: 'Welcome to Haskell Town, Wren!\n' }, { input: 'Hazel', out: 'Welcome to Haskell Town, Hazel!\n' }, { input: 'Old Moss', out: 'Welcome to Haskell Town, Old Moss!\n' }],
    starter: {
      guided: "main :: IO ()\nmain = do\n  name <- ___\n  putStrLn (\"Welcome to Haskell Town, \" ++ ___ ++ \"!\")\n",
      balanced: "main :: IO ()\nmain = do\n  undefined\n",
      independent: "-- Write main here.\n\n",
    },
    primer: "Programs talk to the outside world with <b>IO actions</b>. A <code>do</code> block runs actions one after another. <code>getLine</code> reads a line of text, and <code>name &lt;- getLine</code> gives the result a name. <code>putStrLn</code> prints a line.",
    primerCode: "main :: IO ()\nmain = do\n  putStrLn \"What's your favourite tree?\"\n  tree <- getLine\n  putStrLn (tree ++ \" is a lovely tree.\")",
    hints: [
      "<code>main</code> is the action that runs when the program starts. A <code>do</code> block lets it do two things in order.",
      "First read the name, then print the welcome. Reading uses <code>getLine</code>; printing uses <code>putStrLn</code>.",
      "<code>name &lt;- getLine</code> on the first line. Then build the message with <code>++</code>.",
      "Second line: <code>putStrLn (\"Welcome to Haskell Town, \" ++ name ++ \"!\")</code>.",
    ],
    solution: "main :: IO ()\nmain = do\n  name <- getLine\n  putStrLn (\"Welcome to Haskell Town, \" ++ name ++ \"!\")\n",
    explanation: "<code>getLine</code> has type <code>IO String</code>: an action that, when it runs, produces a String. The arrow <code>&lt;-</code> runs it and names the result, so <code>name</code> is a plain <code>String</code> you can use with <code>++</code>. Haskell keeps IO separate from pure functions, so you can always tell which parts of a program talk to the world.",
    learn: { title: 'IO & do blocks', body: 'A <code>do</code> block runs IO actions in order. <code>x &lt;- action</code> runs an action and names its result.', code: 'main = do\n  name <- getLine\n  putStrLn ("Hi " ++ name)' },
  },
  {
    id: 'hall2', plot: 'hall', upgrade: true, num: 11, resident: 'fern', title: 'The Town Census', concept: 'Pure code inside IO', stage: 'Stage 4 · The City',
    reward: 'A fountain for City Hall', requires: ['hall'],
    story: "Mayor Fern is taking the first town census. “I'll type everyone's names on one line, separated by spaces. Please list each resident on their own line, and then tell me the total.”",
    task: 'Write <code>main</code>: read one line, split it into names with <code>words</code>, print each name as <code>- Name</code> on its own line, then print <code>Total: N</code>.',
    fn: 'main', sig: 'main :: IO ()',
    ioExamples: [{ input: 'Wren Hazel Moss', out: '- Wren\n- Hazel\n- Moss\nTotal: 3' }],
    tests: [{ input: 'Wren Hazel Moss', out: '- Wren\n- Hazel\n- Moss\nTotal: 3\n' }, { input: 'Bram', out: '- Bram\nTotal: 1\n' }, { input: 'Iris Juniper Fern Bram', out: '- Iris\n- Juniper\n- Fern\n- Bram\nTotal: 4\n' }],
    starter: {
      guided: "main :: IO ()\nmain = do\n  line <- getLine\n  let residents = words line\n  mapM_ (\\r -> putStrLn (\"- \" ++ r)) ___\n  putStrLn (\"Total: \" ++ show ___)\n",
      balanced: "main :: IO ()\nmain = do\n  line <- getLine\n  undefined\n",
      independent: "-- Write main here.\n\n",
    },
    primer: "<code>mapM_</code> runs an action for every item of a list — like <code>map</code>, but for IO. Inside a <code>do</code> block, <code>let</code> names an ordinary (non-IO) value. <code>show</code> turns a number into a String so it can be printed.",
    primerCode: "main :: IO ()\nmain = do\n  let trees = [\"Oak\", \"Elm\"]\n  mapM_ putStrLn trees\n  putStrLn (\"Trees: \" ++ show (length trees))",
    hints: [
      "<code>words \"Wren Hazel\"</code> gives <code>[\"Wren\", \"Hazel\"]</code>. Pure functions like <code>words</code> and <code>length</code> work fine inside <code>do</code> — use <code>let</code> to name their results.",
      "Three steps: read the line, print every name, print the total.",
      "<code>mapM_ (\\r -> putStrLn (\"- \" ++ r)) residents</code> prints each name. For the total you need <code>length residents</code> as a String.",
      "The last line is <code>putStrLn (\"Total: \" ++ show (length residents))</code>.",
    ],
    solution: "main :: IO ()\nmain = do\n  line <- getLine\n  let residents = words line\n  mapM_ (\\r -> putStrLn (\"- \" ++ r)) residents\n  putStrLn (\"Total: \" ++ show (length residents))\n",
    explanation: "This program mixes pure code and IO the Haskell way: <code>words</code>, <code>length</code> and <code>show</code> are ordinary pure functions, and only <code>getLine</code>, <code>mapM_</code> and <code>putStrLn</code> touch the outside world. Keeping the two apart is one of Haskell's big ideas.",
    learn: { title: 'Pure code inside IO', body: '<code>let</code> in a do block names pure values; <code>mapM_</code> runs an action for each list item.', code: 'let names = words line\nmapM_ putStrLn names' },
  },
];

export default challenges;
