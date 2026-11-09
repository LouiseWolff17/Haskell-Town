import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'harbour', num: 18, resident: 'brine', title: 'Cargo Crates', concept: 'Functor', stage: 'Stage 5 · Mastery',
    reward: 'The Harbour', requires: ['park2'],
    story: "Captain Brine is opening a harbour by the sea. “My crates hold all sorts — fish, rope, sacks of coins. Sometimes a crate is empty. I need a way to change what's inside a crate without unpacking it, whatever kind of cargo it holds.”",
    task: 'For <code>data Crate a = Empty | Crate a</code>, write <code>instance Functor Crate</code>. <code>fmap f</code> should apply <code>f</code> to the cargo of a full crate, and leave an empty crate empty.',
    fn: null, sig: null, needs: { types: ['Crate'], cons: ['Empty', 'Crate'], instances: [['Functor', 'Crate']] },
    examples: [['fmap (+ 1) (Crate 4)', 'Crate 5'], ['fmap (+ 1) Empty', 'Empty']],
    tests: [['fmap (+ 1) (Crate 4)', 'Crate 5'], ['fmap (+ 1) Empty', 'Empty'], ['fmap length (Crate "fish")', 'Crate 4'], ['(* 2) <$> Crate 21', 'Crate 42'], ['fmap show (Crate True)', 'Crate "True"']],
    starter: {
      guided: "data Crate a = Empty | Crate a\n  deriving Show\n\ninstance Functor Crate where\n  fmap f Empty     = ___\n  fmap f (Crate x) = ___\n",
      balanced: "data Crate a = Empty | Crate a\n  deriving Show\n\ninstance Functor Crate where\n  fmap f crate = undefined\n",
      independent: "data Crate a = Empty | Crate a\n  deriving Show\n\n-- Write instance Functor Crate here.\n",
    },
    primer: "A <b>Functor</b> is a type holding values that you can transform without taking them out. You know one already: <code>map</code> is <code>fmap</code> for lists! <code>Maybe</code> is a Functor too: <code>fmap (+1) (Just 2)</code> is <code>Just 3</code>, and <code>fmap (+1) Nothing</code> stays <code>Nothing</code>. The instance is for <code>Crate</code>, not <code>Crate a</code> — a Functor is about the container, whatever is inside.",
    primerCode: "data Pair a = Pair a a  deriving Show\n\ninstance Functor Pair where\n  fmap f (Pair x y) = Pair (f x) (f y)\n\n-- fmap (* 10) (Pair 1 2)  gives  Pair 10 20",
    hints: [
      "<code>fmap :: (a -> b) -> Crate a -> Crate b</code>. Write one equation for each kind of crate.",
      "An empty crate has nothing to change, so it stays empty. A full crate gets <code>f</code> applied to its cargo.",
      "<code>fmap f Empty = Empty</code>. For a full crate, the result is a new crate containing <code>f x</code>.",
      "<code>fmap f (Crate x) = Crate (f x)</code>.",
    ],
    solution: "data Crate a = Empty | Crate a\n  deriving Show\n\ninstance Functor Crate where\n  fmap f Empty     = Empty\n  fmap f (Crate x) = Crate (f x)\n",
    explanation: "That's exactly how <code>Maybe</code>'s Functor works — <code>Empty</code> is like <code>Nothing</code>. Now everything made for Functors works with crates too, like the operator <code>&lt;$&gt;</code>: <code>(* 2) &lt;$&gt; Crate 21</code> gives <code>Crate 42</code>. A well-behaved Functor never changes the shape, only the contents.",
    learn: { title: 'Functor', body: '<code>fmap :: Functor f =&gt; (a -&gt; b) -&gt; f a -&gt; f b</code> changes the values inside a container. <code>&lt;$&gt;</code> is fmap as an operator. Lists, Maybe, Either and IO are all Functors.', code: 'instance Functor Crate where\n  fmap f Empty     = Empty\n  fmap f (Crate x) = Crate (f x)' },
  },
  {
    id: 'harbour2', plot: 'harbour', upgrade: true, num: 19, resident: 'brine', title: 'Charting a Course', concept: 'Monads: do with Maybe', stage: 'Stage 5 · Mastery',
    reward: 'A lighthouse for the Harbour', requires: ['harbour'],
    story: "Captain Brine is planning trips between ports. “I know how far some ports are from our harbour, but not all of them. If even one leg of a trip is unknown, I can't plan it at all. Can you add up a trip for me — and give up as soon as a port is unknown?”",
    task: '<code>portDistance</code> is written for you: it gives <code>Just</code> a distance, or <code>Nothing</code> for an unknown port. Write <code>tripLength a b</code>: the distance to port <code>a</code> plus the distance to port <code>b</code>, or <code>Nothing</code> if either port is unknown. Use a <code>do</code> block!',
    fn: 'tripLength', sig: 'tripLength :: String -> String -> Maybe Int',
    examples: [['tripLength "Elmport" "Oakhaven"', 'Just 8'], ['tripLength "Elmport" "Atlantis"', 'Nothing']],
    tests: [['tripLength "Elmport" "Oakhaven"', 'Just 8'], ['tripLength "Elmport" "Atlantis"', 'Nothing'], ['tripLength "Atlantis" "Pinecove"', 'Nothing'], ['tripLength "Pinecove" "Pinecove"', 'Just 4']],
    starter: {
      guided: "portDistance :: String -> Maybe Int\nportDistance \"Elmport\"  = Just 3\nportDistance \"Oakhaven\" = Just 5\nportDistance \"Pinecove\" = Just 2\nportDistance _          = Nothing\n\n-- In a Maybe do block, each <- unwraps a Just.\n-- If anything is Nothing, the whole block is Nothing.\ntripLength :: String -> String -> Maybe Int\ntripLength a b = do\n  x <- portDistance a\n  y <- ___\n  return ___\n",
      balanced: "portDistance :: String -> Maybe Int\nportDistance \"Elmport\"  = Just 3\nportDistance \"Oakhaven\" = Just 5\nportDistance \"Pinecove\" = Just 2\nportDistance _          = Nothing\n\ntripLength :: String -> String -> Maybe Int\ntripLength a b = undefined\n",
      independent: "portDistance :: String -> Maybe Int\nportDistance \"Elmport\"  = Just 3\nportDistance \"Oakhaven\" = Just 5\nportDistance \"Pinecove\" = Just 2\nportDistance _          = Nothing\n\n-- Write tripLength here.\n",
    },
    primer: "<code>do</code> blocks aren't only for IO! They work for any <b>Monad</b>, and <code>Maybe</code> is one. In a Maybe <code>do</code> block, <code>x &lt;- something</code> takes the value out of a <code>Just</code>. If <i>any</i> step is <code>Nothing</code>, the whole block stops and gives <code>Nothing</code>. At the end, <code>return x</code> wraps the answer back up as <code>Just x</code>.",
    primerCode: "halfOf :: Int -> Maybe Int\nhalfOf n = if even n then Just (n `div` 2) else Nothing\n\nquarter :: Int -> Maybe Int\nquarter n = do\n  h <- halfOf n\n  halfOf h\n-- quarter 12 gives Just 3;  quarter 6 gives Nothing",
    hints: [
      "You need two distances, and both might be missing. A <code>do</code> block for <code>Maybe</code> handles the missing case for you.",
      "Get the distance for <code>a</code>, then the one for <code>b</code>, each with <code>&lt;-</code>. Then give back their sum.",
      "The second line is <code>y &lt;- portDistance b</code>.",
      "The last line is <code>return (x + y)</code>. Here <code>return</code> means <code>Just</code> — it's not like return in other languages!",
    ],
    solution: "portDistance :: String -> Maybe Int\nportDistance \"Elmport\"  = Just 3\nportDistance \"Oakhaven\" = Just 5\nportDistance \"Pinecove\" = Just 2\nportDistance _          = Nothing\n\ntripLength :: String -> String -> Maybe Int\ntripLength a b = do\n  x <- portDistance a\n  y <- portDistance b\n  return (x + y)\n",
    explanation: "Without <code>do</code>, you'd need nested <code>case</code> expressions to check every <code>Nothing</code>. The Maybe monad does that checking between the lines for you. There's an even shorter way using Applicative: <code>tripLength a b = (+) &lt;$&gt; portDistance a &lt;*&gt; portDistance b</code>. Functor, Applicative and Monad are three steps up the same ladder — and you've climbed all of them.",
    learn: { title: 'Monads', body: 'A Monad lets you chain steps with <code>&gt;&gt;=</code> or a <code>do</code> block. In Maybe, any <code>Nothing</code> stops the chain. IO, lists and Either are monads too.', code: 'trip a b = do\n  x <- portDistance a\n  y <- portDistance b\n  return (x + y)' },
  },
];

export default challenges;
