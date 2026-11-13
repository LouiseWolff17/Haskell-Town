#!/bin/sh
# Build-time smoke test of the GHC side: the inspector and a generated harness.
# Run by server/Dockerfile; prints what it sees so a failing build shows why.
set -eu
dir=$(mktemp -d)
cd "$dir"
export HOME="$dir"
libdir=$(ghc --print-libdir)
flags="-fno-code -XSafe -XNoImplicitPrelude -w -fno-diagnostics-show-caret -fdiagnostics-color=never -hide-all-packages -package base -package containers -package htown-support"

cat > Player.hs <<'HS'
module Player where
import Prelude; import qualified Prelude; import HTown.Prelude
data Crate a = Empty | Crate a deriving Show
instance Functor Crate where
  fmap _ Empty = Empty
  fmap f (Crate x) = Crate (f x)
total :: [Int] -> Int
total [] = 0
total (x:xs) = x + total xs
main :: IO ()
main = getLine >>= \n -> putStrLn ("Hi " ++ n)
HS
cat > PlayerBad.hs <<'HS'
module PlayerBad where
import Prelude
add :: Int -> Int -> Int
add x y = x ++ y
HS
/opt/haskell-town/bin/htown-inspect "$libdir" out.json Player.hs PlayerBad.hs -- $flags > inspect.out 2> inspect.err || true
echo "--- inspector stdout"; cat inspect.out
echo "--- inspector stderr"; cat inspect.err
echo "--- inspector json"; cat out.json; echo
grep -q '"recursive":true' out.json
grep -q 'Functor Crate' out.json

sed 's/^module Player where/module PlayerRun where/; s/import HTown.Prelude/import HTown.Prelude; import qualified HTown.Harness/' Player.hs > PlayerRun.hs
cat >> PlayerRun.hs <<'HS'
htownEq0' = HTown.Harness.eqTest (fmap (+ 1) (Crate 4)) (Crate 5)
htownShow0' = HTown.Harness.showTest (fmap (+ 1) (Crate 4)) (Crate 5)
htownEq1' = HTown.Harness.eqTest (total [1, 2, 3]) (7)
htownShow1' = HTown.Harness.showTest (total [1, 2, 3]) (7)
HS
cat > Main.hs <<'HS'
module Main (main) where
import qualified HTown.Harness
import qualified PlayerRun
main = HTown.Harness.dispatch [(PlayerRun.htownEq0', PlayerRun.htownShow0'), (PlayerRun.htownEq1', PlayerRun.htownShow1')] PlayerRun.main
HS
ghc --make -O0 -fno-omit-yields -fdefer-type-errors -XNoImplicitPrelude -w -hide-all-packages -package base -package containers -package htown-support -outputdir build -o htown Main.hs
./htown tests 2000000
echo Wren | ./htown main
# the first test falls back to `show` (Crate has no Eq), the second is a wrong answer
test "$(./htown tests 2000000 | grep -c '"ok":true')" = 1
cd / && rm -rf "$dir"
echo "selftest ok"
