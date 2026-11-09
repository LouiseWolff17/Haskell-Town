import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'park', num: 16, resident: 'rowan', title: 'Talking Signposts', concept: 'Type classes', stage: 'Stage 5 · Mastery',
    reward: 'The Park', requires: ['railway2'],
    story: "Rowan the park keeper is planting a park at the east end of town. “I want a signpost next to everything in the park that says what it is. Trees and benches are different types, but I'd love one function, <code>describe</code>, that works for both. Can Haskell do that?” It can — with a type class!",
    task: 'The class <code>Describable</code> has one method, <code>describe :: a -> String</code>. Write <code>instance Describable Tree</code> and <code>instance Describable Bench</code> so that <code>Oak</code> → <code>"A mighty oak"</code>, <code>Willow</code> → <code>"A weeping willow"</code>, and <code>Bench n</code> → <code>"A bench for n people"</code>.',
    fn: null, sig: null, needs: { classes: ['Describable'], instances: [['Describable', 'Tree'], ['Describable', 'Bench']] },
    examples: [['describe Oak', '"A mighty oak"'], ['describe (Bench 4)', '"A bench for 4 people"']],
    tests: [['describe Oak', '"A mighty oak"'], ['describe Willow', '"A weeping willow"'], ['describe (Bench 4)', '"A bench for 4 people"'], ['describe (Bench 12)', '"A bench for 12 people"'], ['map describe [Willow, Oak]', '["A weeping willow", "A mighty oak"]']],
    starter: {
      guided: "class Describable a where\n  describe :: a -> String\n\ndata Tree = Oak | Willow\ndata Bench = Bench Int\n\ninstance Describable Tree where\n  describe Oak    = \"A mighty oak\"\n  describe Willow = ___\n\ninstance Describable Bench where\n  describe (Bench n) = \"A bench for \" ++ ___ ++ \" people\"\n",
      balanced: "class Describable a where\n  describe :: a -> String\n\ndata Tree = Oak | Willow\ndata Bench = Bench Int\n\ninstance Describable Tree where\n  describe t = undefined\n\ninstance Describable Bench where\n  describe b = undefined\n",
      independent: "data Tree = Oak | Willow\ndata Bench = Bench Int\n\n-- Write the class Describable (with the method describe :: a -> String),\n-- then an instance for Tree and an instance for Bench.\n",
    },
    primer: "A <b>type class</b> is a promise that a type can do something. <code>class Describable a where describe :: a -> String</code> says: any type <code>a</code> that is <i>Describable</i> has a <code>describe</code> function. An <b>instance</b> keeps that promise for one particular type. You've used classes all along — <code>Show</code>, <code>Eq</code> and <code>Ord</code> are classes too!",
    primerCode: "class Noisy a where\n  noise :: a -> String\n\ndata Duck = Duck\n\ninstance Noisy Duck where\n  noise Duck = \"Quack!\"",
    hints: [
      "The class is already written. Your job is two <code>instance</code> blocks: one saying how to describe a <code>Tree</code>, one for a <code>Bench</code>.",
      "Inside an instance, you define <code>describe</code> just like an ordinary function, pattern matching on that type's constructors. Indent the definitions under <code>where</code>.",
      "The shape is:<pre>instance Describable Tree where\n  describe Oak    = …\n  describe Willow = …</pre>and the same idea for <code>Bench</code>.",
      "For the bench: <code>describe (Bench n) = \"A bench for \" ++ show n ++ \" people\"</code> — <code>show</code> turns the number into a String.",
    ],
    solution: "class Describable a where\n  describe :: a -> String\n\ndata Tree = Oak | Willow\ndata Bench = Bench Int\n\ninstance Describable Tree where\n  describe Oak    = \"A mighty oak\"\n  describe Willow = \"A weeping willow\"\n\ninstance Describable Bench where\n  describe (Bench n) = \"A bench for \" ++ show n ++ \" people\"\n",
    explanation: "Now <code>describe</code> works on two completely different types, and Haskell picks the right instance each time: <code>describe Oak</code> uses the Tree instance, <code>describe (Bench 4)</code> the Bench one. You can even write functions for <i>anything</i> describable: <code>signs :: Describable a =&gt; [a] -&gt; [String]</code>. That <code>Describable a =&gt;</code> part is a <b>constraint</b> — the same kind as <code>Ord a =&gt;</code>.",
    learn: { title: 'Type classes', body: 'A <code>class</code> lists functions a type promises to have. An <code>instance</code> keeps the promise for one type. Constraints like <code>Describable a =&gt;</code> ask for it.', code: 'class Describable a where\n  describe :: a -> String\n\ninstance Describable Tree where\n  describe Oak = "A mighty oak"' },
  },
  {
    id: 'park2', plot: 'park', upgrade: true, num: 17, resident: 'rowan', title: 'The Flower Show', concept: 'Instances of Eq & Ord', stage: 'Stage 5 · Mastery',
    reward: 'A flower show for the Park', requires: ['park'],
    story: "It's the park's first flower show! “The judges rank flowers by their number of petals — nothing else counts,” says Rowan. “Two flowers with the same number of petals are a tie. The score cards are already printed; I just need the judging.”",
    task: 'For <code>data Flower = Flower String Int</code> (a name and a number of petals), write <code>instance Eq Flower</code> and <code>instance Ord Flower</code> that only look at the petals. <code>instance Show Flower</code> is written for you. Then <code>maximum</code> and <code>sort</code> will just work!',
    fn: null, sig: null, needs: { types: ['Flower'], instances: [['Show', 'Flower'], ['Eq', 'Flower'], ['Ord', 'Flower']] },
    examples: [['Flower "Tulip" 6 == Flower "Lily" 6', 'True'], ['maximum [Flower "Daisy" 21, Flower "Rose" 5]', 'Daisy (21 petals)']],
    tests: [['Flower "Tulip" 6 == Flower "Lily" 6', 'True'], ['Flower "Rose" 5 == Flower "Lily" 6', 'False'], ['Flower "Rose" 5 < Flower "Lily" 6', 'True'], ['maximum [Flower "Daisy" 21, Flower "Rose" 5, Flower "Lily" 6]', 'Flower "Daisy" 21'], ['sort [Flower "Aster" 3, Flower "Bluebell" 1, Flower "Clover" 2]', '[Flower "Bluebell" 1, Flower "Clover" 2, Flower "Aster" 3]']],
    starter: {
      guided: "data Flower = Flower String Int   -- a name and a number of petals\n\ninstance Show Flower where\n  show (Flower name petals) = name ++ \" (\" ++ show petals ++ \" petals)\"\n\ninstance Eq Flower where\n  Flower _ a == Flower _ b = ___\n\ninstance Ord Flower where\n  compare (Flower _ a) (Flower _ b) = ___\n",
      balanced: "data Flower = Flower String Int   -- a name and a number of petals\n\ninstance Show Flower where\n  show (Flower name petals) = name ++ \" (\" ++ show petals ++ \" petals)\"\n\ninstance Eq Flower where\n  f1 == f2 = undefined\n\ninstance Ord Flower where\n  compare f1 f2 = undefined\n",
      independent: "data Flower = Flower String Int   -- a name and a number of petals\n\ninstance Show Flower where\n  show (Flower name petals) = name ++ \" (\" ++ show petals ++ \" petals)\"\n\n-- Write instance Eq Flower and instance Ord Flower here.\n",
    },
    primer: "You can write your own instances of Haskell's built-in classes. For <code>Eq</code> you define <code>==</code>. For <code>Ord</code> you define <code>compare</code>, which answers <code>LT</code> (less than), <code>EQ</code> (equal) or <code>GT</code> (greater than). Operators are defined like functions, with the arguments on either side: <code>x == y = …</code>.",
    primerCode: "data Size = Size Int\n\ninstance Eq Size where\n  Size a == Size b = a == b\n\ninstance Ord Size where\n  compare (Size a) (Size b) = compare a b",
    hints: [
      "<code>deriving (Eq, Ord)</code> would compare the names too — that's why you write these instances yourself. Both should look only at the petal counts.",
      "In both instances, pattern-match to pull the petal numbers out of the two flowers, and ignore the names with <code>_</code>.",
      "For <code>==</code>, compare the two numbers with <code>==</code>. For <code>compare</code>, use the built-in <code>compare</code> on the two numbers.",
      "<code>Flower _ a == Flower _ b = a == b</code> and <code>compare (Flower _ a) (Flower _ b) = compare a b</code>.",
    ],
    solution: "data Flower = Flower String Int   -- a name and a number of petals\n\ninstance Show Flower where\n  show (Flower name petals) = name ++ \" (\" ++ show petals ++ \" petals)\"\n\ninstance Eq Flower where\n  Flower _ a == Flower _ b = a == b\n\ninstance Ord Flower where\n  compare (Flower _ a) (Flower _ b) = compare a b\n",
    explanation: "Two small instances made a whole toolbox work for flowers: <code>&lt;</code>, <code>max</code>, <code>maximum</code> and <code>sort</code> are all built on <code>compare</code>. That's the real power of type classes: write the core once, get lots of functions for free. Notice that <code>Ord</code> needs <code>Eq</code> first — classes can build on other classes.",
    learn: { title: 'Instances of built-in classes', body: 'Write <code>instance Eq T</code> (define <code>==</code>) or <code>instance Ord T</code> (define <code>compare</code>) to choose how your type is compared. <code>sort</code>, <code>maximum</code> and friends then use them.', code: 'instance Ord Flower where\n  compare (Flower _ a) (Flower _ b) = compare a b' },
  },
];

export default challenges;
