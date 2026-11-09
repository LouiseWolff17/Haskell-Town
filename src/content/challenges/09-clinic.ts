import type { Challenge } from '../types.ts';

const challenges: Challenge[] = [
  {
    id: 'clinic', num: 12, resident: 'sorrel', title: 'The Missing Reading', concept: 'Maybe', stage: 'Stage 4 · The City',
    reward: 'The Clinic', requires: ['school2'],
    story: "Dr. Sorrel has opened a little clinic below the south lane. “When a patient visits, we take their temperature — but sometimes the thermometer is out being cleaned, and there's no reading at all. Could you help me write up each visit, even when the reading is missing?”",
    task: 'Write <code>checkup</code>, which takes a temperature that might be missing (<code>Maybe Double</code>). With no reading, return <code>"No reading"</code>. A reading of 38 or more is <code>"Fever"</code>; anything lower is <code>"Healthy"</code>.',
    fn: 'checkup', sig: 'checkup :: Maybe Double -> String',
    examples: [['checkup Nothing', '"No reading"'], ['checkup (Just 38.5)', '"Fever"'], ['checkup (Just 36.6)', '"Healthy"']],
    tests: [['checkup Nothing', '"No reading"'], ['checkup (Just 38.5)', '"Fever"'], ['checkup (Just 38)', '"Fever"'], ['checkup (Just 36.6)', '"Healthy"'], ['checkup (Just 37.9)', '"Healthy"']],
    starter: {
      guided: "-- Maybe Double is either Nothing, or Just a Double.\ncheckup :: Maybe Double -> String\ncheckup Nothing = ___\ncheckup (Just t)\n  | t >= 38   = ___\n  | otherwise = ___\n",
      balanced: "checkup :: Maybe Double -> String\ncheckup reading = undefined\n",
      independent: "-- Write checkup here.\n\n",
    },
    primer: "<code>Maybe</code> is Haskell's way of saying “there might not be a value”. A <code>Maybe Int</code> is either <code>Nothing</code>, or <code>Just</code> an <code>Int</code>, like <code>Just 7</code>. Haskell has no <code>null</code>: the type tells you when something can be missing, and you handle both cases with pattern matching.",
    primerCode: "greeting :: Maybe String -> String\ngreeting Nothing     = \"Hello, stranger!\"\ngreeting (Just name) = \"Hello, \" ++ name ++ \"!\"",
    hints: [
      "A <code>Maybe Double</code> comes in two shapes: <code>Nothing</code> and <code>Just t</code>. Pattern matching can give each shape its own equation.",
      "Write one equation for <code>Nothing</code>. In the equation for <code>(Just t)</code>, you have a real number <code>t</code> to compare with 38.",
      "The shape is <code>checkup Nothing = …</code>, then <code>checkup (Just t)</code> with guards <code>| t &gt;= 38 = …</code> and <code>| otherwise = …</code>.",
      "Nothing → <code>\"No reading\"</code>; 38 or more → <code>\"Fever\"</code>; otherwise → <code>\"Healthy\"</code>. Keep the parentheses in <code>(Just t)</code>.",
    ],
    solution: "checkup :: Maybe Double -> String\ncheckup Nothing = \"No reading\"\ncheckup (Just t)\n  | t >= 38   = \"Fever\"\n  | otherwise = \"Healthy\"\n",
    explanation: "Because the type says <code>Maybe Double</code>, the missing case is part of the plan from the start. Try deleting the <code>Nothing</code> equation and running the tests: that case is no longer handled. In many languages a missing value is a <code>null</code> that crashes later; in Haskell it's written into the type.",
    learn: { title: 'Maybe', body: '<code>Maybe a</code> is either <code>Nothing</code> or <code>Just x</code>. Pattern-match on both to handle missing values safely.', code: 'describe Nothing  = "unknown"\ndescribe (Just x) = show x' },
  },
  {
    id: 'clinic2', plot: 'clinic', upgrade: true, num: 13, resident: 'sorrel', title: 'Booking Appointments', concept: 'Either', stage: 'Stage 4 · The City',
    reward: 'A herb garden for the Clinic', requires: ['clinic'],
    story: "“Patients keep asking for appointments at odd hours,” sighs Dr. Sorrel. “The clinic is open from 9 to 16. If someone asks for an hour that works, please book it — and if not, tell them why.”",
    task: 'Write <code>bookSlot</code>. For an hour before 9, return <code>Left "Too early"</code>; after 16, return <code>Left "Too late"</code>; otherwise return <code>Right hour</code>.',
    fn: 'bookSlot', sig: 'bookSlot :: Int -> Either String Int',
    examples: [['bookSlot 10', 'Right 10'], ['bookSlot 7', 'Left "Too early"'], ['bookSlot 18', 'Left "Too late"']],
    tests: [['bookSlot 10', 'Right 10'], ['bookSlot 9', 'Right 9'], ['bookSlot 16', 'Right 16'], ['bookSlot 7', 'Left "Too early"'], ['bookSlot 17', 'Left "Too late"']],
    starter: {
      guided: "-- Left carries a problem, Right carries a success.\nbookSlot :: Int -> Either String Int\nbookSlot hour\n  | hour < 9  = Left ___\n  | hour > 16 = ___\n  | otherwise = ___ hour\n",
      balanced: "bookSlot :: Int -> Either String Int\nbookSlot hour = undefined\n",
      independent: "-- Write bookSlot here.\n\n",
    },
    primer: "<code>Either</code> is like <code>Maybe</code>, but the “didn't work” case can carry an explanation. A value of type <code>Either String Int</code> is either <code>Left</code> a <code>String</code> (by convention, what went wrong) or <code>Right</code> an <code>Int</code> (the result that's “right”).",
    primerCode: "safeDivide :: Int -> Int -> Either String Int\nsafeDivide _ 0 = Left \"Can't divide by zero\"\nsafeDivide a b = Right (a `div` b)",
    hints: [
      "There are three outcomes: too early, too late, or fine. Two of them are problems (<code>Left</code>) and one is a success (<code>Right</code>).",
      "Guards can check the hour: first whether it's before 9, then whether it's after 16, and otherwise it's fine.",
      "<code>Left</code> and <code>Right</code> are constructors, and you use them like functions: <code>Left \"Too early\"</code>, <code>Right hour</code>.",
      "<code>| hour &lt; 9 = Left \"Too early\"</code>, <code>| hour &gt; 16 = Left \"Too late\"</code>, <code>| otherwise = Right hour</code>.",
    ],
    solution: "bookSlot :: Int -> Either String Int\nbookSlot hour\n  | hour < 9  = Left \"Too early\"\n  | hour > 16 = Left \"Too late\"\n  | otherwise = Right hour\n",
    explanation: "<code>Either</code> lets a function return a result <i>or</i> the reason it couldn't make one, and the type makes whoever calls it deal with both. Notice the boundaries: 9 and 16 are both bookable, which is why the tests check exactly those hours.",
    learn: { title: 'Either', body: '<code>Either e a</code> is <code>Left e</code> (usually an error) or <code>Right a</code> (a success). Like Maybe, but the failure carries information.', code: 'safeDivide _ 0 = Left "zero!"\nsafeDivide a b = Right (a `div` b)' },
  },
];

export default challenges;
