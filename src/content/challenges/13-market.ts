import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'market', num: 20, resident: 'marigold', title: 'Market Day Takings', concept: 'Semigroup & Monoid', stage: 'Stage 6 · The Market',
    reward: 'The Market', requires: ['harbour2'],
    story: "Marigold has opened a market between the library and the sea. “Every stall hands me its takings at closing time: the coins it earned, and a list of what it sold. I need to put them all together into one total for the day. And if a stall sold nothing, that shouldn't change the total at all.”",
    task: 'For <code>data Takings = Takings Int [String]</code> (coins, and the things sold), write <code>instance Semigroup Takings</code>: <code>&lt;&gt;</code> adds the coins and joins the lists. Then write <code>instance Monoid Takings</code>: <code>mempty</code> is the takings of a stall that sold nothing. Then <code>mconcat</code> adds up a whole day!',
    fn: null, sig: null, needs: { types: ['Takings'], cons: ['Takings'], instances: [['Semigroup', 'Takings'], ['Monoid', 'Takings']] },
    examples: [['Takings 3 ["jam"] <> Takings 5 ["honey"]', 'Takings 8 ["jam","honey"]'], ['mempty :: Takings', 'Takings 0 []']],
    tests: [['Takings 3 ["jam"] <> Takings 5 ["honey"]', 'Takings 8 ["jam", "honey"]'], ['Takings 0 [] <> Takings 2 ["eggs"]', 'Takings 2 ["eggs"]'], ['mempty :: Takings', 'Takings 0 []'],
      ['mempty <> Takings 4 ["fig"]', 'Takings 4 ["fig"]'], ['mconcat [Takings 1 ["pear"], Takings 2 ["fig"], Takings 4 ["plum"]]', 'Takings 7 ["pear", "fig", "plum"]'], ['mconcat [] :: Takings', 'Takings 0 []']],
    starter: {
      guided: "-- One stall's takings: the coins it earned, and what it sold.\ndata Takings = Takings Int [String]\n  deriving (Show, Eq)\n\n-- <> puts two stalls' takings together.\ninstance Semigroup Takings where\n  Takings a xs <> Takings b ys = Takings ___ ___\n\n-- mempty: a stall that sold nothing at all.\ninstance Monoid Takings where\n  mempty = ___\n",
      balanced: "-- One stall's takings: the coins it earned, and what it sold.\ndata Takings = Takings Int [String]\n  deriving (Show, Eq)\n\ninstance Semigroup Takings where\n  t1 <> t2 = undefined\n\ninstance Monoid Takings where\n  mempty = undefined\n",
      independent: "-- One stall's takings: the coins it earned, and what it sold.\ndata Takings = Takings Int [String]\n  deriving (Show, Eq)\n\n-- Write instance Semigroup Takings and instance Monoid Takings here.\n",
    },
    primer: "A <b>Semigroup</b> is a type with a way to combine two values into one, written <code>&lt;&gt;</code>. You already know one: for lists, <code>&lt;&gt;</code> is <code>++</code>. A <b>Monoid</b> is a Semigroup with an “empty” value, <code>mempty</code>, that changes nothing: <code>mempty &lt;&gt; x</code> is just <code>x</code>. With both, <code>mconcat</code> combines a whole list. Numbers can be combined in two ways (adding or multiplying), so you wrap them to choose: <code>Sum</code> or <code>Product</code>.",
    primerCode: "-- Lists: <> is ++, and mempty is []\ngreeting = \"Good \" <> \"morning\"     -- \"Good morning\"\n\n-- Numbers: wrap them to say HOW to combine\ntotal = getSum (Sum 3 <> Sum 4)     -- 7\n\n-- mconcat combines a whole list, starting from mempty\nshopping = mconcat [\"jam\", \"tea\", \"figs\"]   -- \"jamteafigs\"",
    hints: [
      "There are two instances to write. <code>Semigroup</code> says how to combine two <code>Takings</code> with <code>&lt;&gt;</code>. <code>Monoid</code> adds <code>mempty</code>, the takings that change nothing when you combine them with anything.",
      "Combining two takings: add the coins together, and join the two lists of things sold. A stall that sold nothing earned no coins and has an empty list.",
      "Pattern-match both sides of <code>&lt;&gt;</code> to get at the parts:<pre>Takings a xs &lt;&gt; Takings b ys = Takings (…) (…)</pre>and <code>mempty = Takings … …</code>",
      "<code>Takings a xs &lt;&gt; Takings b ys = Takings (a + b) (xs ++ ys)</code> and <code>mempty = Takings 0 []</code>.",
    ],
    solution: "-- One stall's takings: the coins it earned, and what it sold.\ndata Takings = Takings Int [String]\n  deriving (Show, Eq)\n\ninstance Semigroup Takings where\n  Takings a xs <> Takings b ys = Takings (a + b) (xs ++ ys)\n\ninstance Monoid Takings where\n  mempty = Takings 0 []\n",
    explanation: "You wrote two lines, and got <code>mconcat</code> for free. It works for any Monoid, and now <code>Takings</code> is one. Two rules make a good Monoid: <code>mempty</code> changes nothing (<code>mempty &lt;&gt; t == t</code>), and grouping doesn't matter (<code>(a &lt;&gt; b) &lt;&gt; c == a &lt;&gt; (b &lt;&gt; c)</code>). Because grouping doesn't matter, Marigold could add up the morning and the afternoon separately and still get the same day total. Monoids also combine: a pair <code>(Sum 3, \"jam\") &lt;&gt; (Sum 4, \"tea\")</code> combines each side.",
    learn: { title: 'Semigroup & Monoid', body: '<code>&lt;&gt;</code> combines two values (Semigroup). <code>mempty</code> is the value that changes nothing (Monoid). <code>mconcat</code> combines a whole list. Lists, <code>Maybe</code>, <code>Ordering</code> and tuples are Monoids. For numbers, choose <code>Sum</code> or <code>Product</code>.', code: 'instance Semigroup Takings where\n  Takings a xs <> Takings b ys = Takings (a + b) (xs ++ ys)\n\ninstance Monoid Takings where\n  mempty = Takings 0 []' },
  },
  {
    id: 'market2', plot: 'market', upgrade: true, num: 21, resident: 'marigold', title: 'Weighing the Crates', concept: 'Foldable', stage: 'Stage 6 · The Market',
    reward: 'A weighing scale for the Market', requires: ['market'],
    story: "Marigold keeps her crates in a tree, so she can find one fast: lighter crates go to the left, heavier ones to the right. “At closing time I need to go through <i>every</i> crate: weigh them all together, and list them in order. I'd rather not write a new function for each of those jobs.”",
    task: 'For <code>data Tree a = Leaf | Node (Tree a) a (Tree a)</code>, write <code>instance Foldable Tree</code> by defining <code>foldMap</code>: go through the left branch, then the value, then the right branch. Then write <code>totalWeight :: Tree Int -> Int</code> using <code>foldMap</code> and <code>Sum</code>. You get <code>toList</code> for free!',
    fn: 'totalWeight', sig: 'totalWeight :: Tree Int -> Int', needs: { types: ['Tree'], instances: [['Foldable', 'Tree']] },
    examples: [['totalWeight (Node (Node Leaf 2 Leaf) 5 (Node Leaf 9 Leaf))', '16'], ['toList (Node (Node Leaf 2 Leaf) 5 (Node Leaf 9 Leaf))', '[2,5,9]']],
    tests: [['totalWeight (Node (Node Leaf 2 Leaf) 5 (Node Leaf 9 Leaf))', '16'], ['totalWeight Leaf', '0'], ['toList (Node (Node Leaf 2 Leaf) 5 (Node Leaf 9 Leaf))', '[2, 5, 9]'],
      ['toList (Node Leaf "fig" (Node Leaf "plum" Leaf))', '["fig", "plum"]'], ['foldMap (\\w -> [w, w]) (Node Leaf 3 Leaf)', '[3, 3]'], ['getProduct (foldMap Product (Node (Node Leaf 2 Leaf) 3 (Node Leaf 4 Leaf)))', '24']],
    starter: {
      guided: "-- Lighter crates go to the left, heavier ones to the right.\ndata Tree a = Leaf | Node (Tree a) a (Tree a)\n  deriving Show\n\ncrates :: Tree Int\ncrates = Node (Node Leaf 2 Leaf) 5 (Node (Node Leaf 7 Leaf) 9 Leaf)\n\n-- foldMap f turns every value into a Monoid with f,\n-- then combines them all with <>.\ninstance Foldable Tree where\n  foldMap f Leaf         = ___\n  foldMap f (Node l x r) = foldMap f l <> ___ <> foldMap f r\n\n-- Sum is the Monoid that adds. getSum takes the number back out.\ntotalWeight :: Tree Int -> Int\ntotalWeight t = getSum (foldMap ___ t)\n",
      balanced: "-- Lighter crates go to the left, heavier ones to the right.\ndata Tree a = Leaf | Node (Tree a) a (Tree a)\n  deriving Show\n\ncrates :: Tree Int\ncrates = Node (Node Leaf 2 Leaf) 5 (Node (Node Leaf 7 Leaf) 9 Leaf)\n\ninstance Foldable Tree where\n  foldMap f Leaf         = undefined\n  foldMap f (Node l x r) = undefined\n\ntotalWeight :: Tree Int -> Int\ntotalWeight t = undefined\n",
      independent: "-- Lighter crates go to the left, heavier ones to the right.\ndata Tree a = Leaf | Node (Tree a) a (Tree a)\n  deriving Show\n\ncrates :: Tree Int\ncrates = Node (Node Leaf 2 Leaf) 5 (Node (Node Leaf 7 Leaf) 9 Leaf)\n\n-- Write instance Foldable Tree (define foldMap),\n-- then totalWeight :: Tree Int -> Int using foldMap and Sum.\n",
    },
    primer: "A <b>Foldable</b> is a container you can go through from start to end. Its key method is <code>foldMap :: Monoid m =&gt; (a -&gt; m) -&gt; t a -&gt; m</code>: turn every value into a Monoid with a function, then combine them all with <code>&lt;&gt;</code>. Which Monoid you choose decides what you get: <code>Sum</code> adds the values up, and a one-item list <code>[x]</code> lists them. Like Functor, the instance is for <code>Tree</code>, not <code>Tree a</code>.",
    primerCode: "data Pair a = Pair a a\n\ninstance Foldable Pair where\n  foldMap f (Pair x y) = f x <> f y\n\n-- toList (Pair 1 2)                gives [1,2]\n-- getSum (foldMap Sum (Pair 3 4))  gives 7",
    hints: [
      "<code>foldMap</code> doesn't know which Monoid it will be used with: Sum, lists, Takings… So it can only use the two things every Monoid has: <code>mempty</code> and <code>&lt;&gt;</code>.",
      "A <code>Leaf</code> holds nothing, so it gives <code>mempty</code>. A <code>Node</code>: fold the left branch, turn the value into a Monoid with <code>f</code>, fold the right branch, and combine the three with <code>&lt;&gt;</code>. For <code>totalWeight</code>, the Monoid is <code>Sum</code>.",
      "<code>foldMap f Leaf = mempty</code>. In the Node equation, the middle part is the value <code>x</code> after <code>f</code> has turned it into a Monoid. <code>foldMap Sum t</code> turns every weight into a Sum and adds them up.",
      "<code>foldMap f (Node l x r) = foldMap f l &lt;&gt; f x &lt;&gt; foldMap f r</code> and <code>totalWeight t = getSum (foldMap Sum t)</code>.",
    ],
    solution: "-- Lighter crates go to the left, heavier ones to the right.\ndata Tree a = Leaf | Node (Tree a) a (Tree a)\n  deriving Show\n\ncrates :: Tree Int\ncrates = Node (Node Leaf 2 Leaf) 5 (Node (Node Leaf 7 Leaf) 9 Leaf)\n\ninstance Foldable Tree where\n  foldMap f Leaf         = mempty\n  foldMap f (Node l x r) = foldMap f l <> f x <> foldMap f r\n\ntotalWeight :: Tree Int -> Int\ntotalWeight t = getSum (foldMap Sum t)\n",
    explanation: "One instance, and every Monoid works with your tree: <code>foldMap Sum</code> for the total weight, <code>foldMap Product</code> for a product, <code>foldMap (\\w -&gt; [w])</code> to list the crates (that's what <code>toList</code> does). Because the tree keeps lighter crates on the left, <code>toList crates</code> even comes out sorted: <code>[2,5,7,9]</code>. In GHC, a Foldable instance also gives you <code>sum</code>, <code>length</code>, <code>maximum</code> and <code>elem</code> on trees. In Haskell Town those still take lists, so write <code>sum (toList crates)</code>.",
    learn: { title: 'Foldable', body: '<code>foldMap :: Monoid m =&gt; (a -&gt; m) -&gt; t a -&gt; m</code> turns every value into a Monoid and combines them. Define it once for your container, and get <code>toList</code> and every Monoid for free. Lists and <code>Maybe</code> are Foldable too.', code: 'instance Foldable Tree where\n  foldMap f Leaf         = mempty\n  foldMap f (Node l x r) = foldMap f l <> f x <> foldMap f r' },
  },
];

export default challenges;
