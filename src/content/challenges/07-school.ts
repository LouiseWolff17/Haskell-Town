import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'school', num: 8, resident: 'juniper', title: 'Three Little Classes', concept: 'Custom data types', stage: 'Stage 3 · The Growing Town',
    reward: 'The School', requires: ['library2'],
    story: "Juniper is opening the town's first school, down on the new south lane. “I'd like to sort the children into three classes: Seedlings are under 7, Sprouts are under 10, and everyone else is a Sapling. Could you make a proper type for the classes, so nobody gets put in a class that doesn't exist?”",
    task: 'Define a data type <code>Grade</code> with three constructors — <code>Seedling</code>, <code>Sprout</code> and <code>Sapling</code> — ending with <code>deriving (Show, Eq)</code>. Then write <code>gradeFor</code>, which picks the grade for an age.',
    fn: 'gradeFor', sig: 'gradeFor :: Int -> Grade', needs: { types: ['Grade'], cons: ['Seedling', 'Sprout', 'Sapling'] },
    examples: [['gradeFor 5', 'Seedling'], ['gradeFor 8', 'Sprout'], ['gradeFor 12', 'Sapling']],
    tests: [['gradeFor 5', 'Seedling'], ['gradeFor 6', 'Seedling'], ['gradeFor 7', 'Sprout'], ['gradeFor 9', 'Sprout'], ['gradeFor 10', 'Sapling'], ['gradeFor 12', 'Sapling']],
    starter: {
      guided: "data Grade = Seedling | Sprout | Sapling\n  deriving (Show, Eq)\n\ngradeFor :: Int -> Grade\ngradeFor age\n  | age < 7   = ___\n  | age < 10  = ___\n  | otherwise = ___\n",
      balanced: "data Grade = Seedling | Sprout | Sapling\n  deriving (Show, Eq)\n\ngradeFor :: Int -> Grade\ngradeFor age = undefined\n",
      independent: "-- Define the data type Grade, then write gradeFor.\n\n",
    },
    primer: "With <code>data</code> you can invent your own type. You list its possible values — its <b>constructors</b> — separated by <code>|</code>. Constructors start with a capital letter. <code>deriving (Show, Eq)</code> lets Haskell print the values and compare them with <code>==</code>.",
    primerCode: "data Weather = Sunny | Rainy | Snowy\n  deriving (Show, Eq)\n\numbrella :: Weather -> Bool\numbrella Rainy = True\numbrella _     = False",
    hints: [
      "<code>Grade</code> is a brand-new type with exactly three possible values. Each value is a constructor: a name with a capital letter.",
      "First the type: <code>data Grade = … | … | …</code>. Then <code>gradeFor</code> checks the age from youngest to oldest.",
      "Guards work well here: <code>| age &lt; 7 = …</code>, then <code>| age &lt; 10 = …</code>, then <code>| otherwise = …</code>.",
      "Under 7 → <code>Seedling</code>, under 10 → <code>Sprout</code>, otherwise → <code>Sapling</code>. Remember <code>deriving (Show, Eq)</code> after the data line.",
    ],
    solution: "data Grade = Seedling | Sprout | Sapling\n  deriving (Show, Eq)\n\ngradeFor :: Int -> Grade\ngradeFor age\n  | age < 7   = Seedling\n  | age < 10  = Sprout\n  | otherwise = Sapling\n",
    explanation: "Now <code>gradeFor</code> can only ever answer with one of three real classes. A typo like <code>Sprot</code> is caught by the compiler instead of becoming a bug. Types that list their possible values like this are called <b>sum types</b> — <code>Bool</code> itself is defined as <code>data Bool = False | True</code>!",
    learn: { title: 'Custom data types', body: '<code>data</code> creates a new type by listing its constructors, separated by <code>|</code>. <code>deriving (Show, Eq)</code> lets you print and compare them.', code: 'data Grade = Seedling | Sprout | Sapling\n  deriving (Show, Eq)' },
  },
  {
    id: 'school2', plot: 'school', upgrade: true, num: 9, resident: 'juniper', title: 'Birthday Cards', concept: 'Records', stage: 'Stage 3 · The Growing Town',
    reward: 'A flag and a swing for the School', requires: ['school'],
    story: "Juniper keeps a record card for every student, with their name and age. “It's Ana's birthday today! Could you write a function that gives me an updated card?”",
    task: 'Using a record type <code>Student</code> with fields <code>name :: String</code> and <code>age :: Int</code> (deriving <code>Show, Eq</code>), write <code>birthday</code>, which returns the same student one year older.',
    fn: 'birthday', sig: 'birthday :: Student -> Student', needs: { types: ['Student'], cons: ['Student'], fields: ['name', 'age'] },
    examples: [['birthday (Student "Ana" 7)', 'Student {name = "Ana", age = 8}']],
    tests: [['birthday (Student "Ana" 7)', 'Student "Ana" 8'], ['birthday (Student { name = "Bo", age = 10 })', 'Student "Bo" 11'], ['name (birthday (Student "Cy" 5))', '"Cy"'], ['age (birthday (birthday (Student "Di" 6)))', '8']],
    starter: {
      guided: "data Student = Student { name :: String, age :: Int }\n  deriving (Show, Eq)\n\n-- s { age = ... } makes a copy of s with a new age.\nbirthday :: Student -> Student\nbirthday s = s { age = ___ }\n",
      balanced: "data Student = Student { name :: String, age :: Int }\n  deriving (Show, Eq)\n\nbirthday :: Student -> Student\nbirthday s = undefined\n",
      independent: "-- Define the record type Student, then write birthday.\n\n",
    },
    primer: "A <b>record</b> is a data type whose fields have names. Each field name is also a function that reads that field: <code>age s</code>. To change a field, write <code>s { age = newValue }</code>. This makes a <i>new</i> record and leaves the old one unchanged.",
    primerCode: "data Pet = Pet { petName :: String, legs :: Int }\n  deriving Show\n\nrex = Pet { petName = \"Rex\", legs = 4 }\n-- legs rex                 gives  4\n-- rex { petName = \"Max\" }  gives  Pet {petName = \"Max\", legs = 4}",
    hints: [
      "<code>age s</code> reads the student's current age — field names are functions.",
      "You want a copy of <code>s</code> where only the age changes. That's record update syntax: <code>s { field = … }</code>.",
      "<code>birthday s = s { age = … }</code> — what should the new age be, in terms of the old one?",
      "The new age is <code>age s + 1</code>.",
    ],
    solution: "data Student = Student { name :: String, age :: Int }\n  deriving (Show, Eq)\n\nbirthday :: Student -> Student\nbirthday s = s { age = age s + 1 }\n",
    explanation: "<code>s { age = age s + 1 }</code> builds a fresh <code>Student</code> with the same name and a bigger age. In Haskell, values never change in place — Ana's old card still says 7. That makes programs much easier to reason about.",
    learn: { title: 'Records', body: 'Records name their fields. Field names read values (<code>age s</code>), and <code>s { age = 9 }</code> makes an updated copy.', code: 'data Student = Student { name :: String, age :: Int }\nbirthday s = s { age = age s + 1 }' },
  },
];

export default challenges;
