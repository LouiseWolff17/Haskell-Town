{-# LANGUAGE Safe #-}

-- | The names Haskell Town's in-browser Prelude has on top of the standard one, so the
-- same program works with GHC without any imports. The GHC runner imports this module
-- into every program, hiding any name the program defines itself.
-- Keep it in step with the built-ins in src/haskell/evaluator.js.
module HTown.Prelude
  ( -- * Data.Char
    toUpper, toLower, isDigit, isAlpha, isUpper, isLower, isSpace, ord, chr, digitToInt,
    -- * Data.List
    sort, sortOn,
    -- * Data.Maybe
    fromMaybe, catMaybes, mapMaybe, isJust, isNothing,
    -- * Control.Monad
    when, unless, replicateM, replicateM_, foldM, forM, forM_,
    -- * Data.Foldable
    toList, traverse_,
    -- * Data.Monoid and Data.Semigroup
    Sum (..), Product (..), Min (..), Max (..), Any (..), All (..),
  )
where

import Control.Monad (foldM, forM, forM_, replicateM, replicateM_, unless, when)
import Data.Char (chr, digitToInt, isAlpha, isDigit, isLower, isSpace, isUpper, ord, toLower, toUpper)
import Data.Foldable (toList, traverse_)
import Data.List (sort, sortOn)
import Data.Maybe (catMaybes, fromMaybe, isJust, isNothing, mapMaybe)
import Data.Monoid (All (..), Any (..), Product (..), Sum (..))
import Data.Semigroup (Max (..), Min (..))
import Prelude ()
