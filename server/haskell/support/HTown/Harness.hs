{-# LANGUAGE ScopedTypeVariables #-}
{-# LANGUAGE Trustworthy #-}

-- | Runs the programs the GHC runner generates around the player's code (see
-- server/ghc.ts). Player code can't import this module.
--
-- A check builds one executable:
--
-- > main = HTown.Harness.dispatch [(PlayerRun.htownEq0', PlayerRun.htownShow0'), ...] PlayerRun.main
--
-- Run as @htown tests MICROSECONDS@ it runs every expression test, each under its own
-- time limit, and prints one line per test: @@@htown {"ok":true,"want":"5","got":"5"}@.
-- Run as @htown main@ it runs the player's main with the real stdin and stdout.
module HTown.Harness
  ( Test,
    eqTest,
    showTest,
    dispatch,
    noMain,
    showValue,
    runIO,
  )
where

import Control.Exception
import Data.Char (ord)
import Numeric (showHex)
import System.Environment (getArgs)
import System.IO
import System.Timeout (timeout)

-- | One expression test.
newtype Test = Test (IO Outcome)

data Outcome
  = -- | ok, want, got
    Compared Bool String String
  | -- | want (when it could be shown), and the error
    Failed (Maybe String) String
  | -- | The type has no Eq instance, so compare what `show` gives instead.
    NoEq

-- | Compare with `==`, like a player would expect.
eqTest :: (Eq a, Show a) => a -> a -> Test
eqTest got want = Test $ do
  w <- shown want
  r <- try (evaluate (got == want))
  case r of
    Left (e :: SomeException)
      | isTypeError e -> pure NoEq -- a deferred "No instance for Eq ..."
      | otherwise -> rethrowAsync e >> pure (Failed (Just w) (message e))
    Right ok -> Compared ok w <$> shown got

-- | For types without Eq: two values are the same if they show the same. (The in-browser
-- interpreter compares any two values structurally, so tests don't need Eq instances.)
showTest :: Show a => a -> a -> Test
showTest got want = Test $ do
  w <- shown want
  r <- try (shown got)
  case r of
    Left (e :: SomeException) -> rethrowAsync e >> pure (Failed (Just w) (message e))
    Right g -> pure (Compared (g == w) w g)

dispatch :: [(Test, Test)] -> IO () -> IO ()
dispatch tests mainAction = do
  utf8Everywhere
  args <- getArgs
  case args of
    ["tests", micros] -> mapM_ (runTest (read micros)) tests
    ["main"] -> mainAction
    _ -> hPutStrLn stderr "usage: htown (tests MICROSECONDS | main)"

noMain :: IO ()
noMain = hPutStrLn stderr "This program has no main."

runTest :: Int -> (Test, Test) -> IO ()
runTest limit (Test byEq, Test byShow) = do
  r <- try (timeout limit compared)
  emit $ case r of
    Left (e :: SomeException) -> Failed Nothing (message e) -- stack or heap overflow, a deferred type error
    Right Nothing -> Failed Nothing "@@timeout"
    Right (Just o) -> o
  where
    -- A missing Eq instance is a deferred type error. Depending on how GHC compiled the
    -- test, it is thrown when `==` runs or as soon as the test starts: either way, fall
    -- back to comparing with `show`.
    compared = do
      first <- try byEq
      case first of
        Left (e :: SomeException)
          | isTypeError e -> byShow
          | otherwise -> throwIO e
        Right NoEq -> byShow
        Right o -> pure o

-- | Evaluate an expression for the Workshop and print what `show` gives.
showValue :: Show a => a -> IO ()
showValue x = do
  utf8Everywhere
  let s = show x
  putStr (take valueLimit s)
  if null (drop valueLimit s) then pure () else putStr "…"

-- | Run an IO expression for the Workshop.
runIO :: IO a -> IO ()
runIO act = utf8Everywhere >> act >> pure ()

-- ---------- helpers ----------

showLimit, valueLimit :: Int
showLimit = 2000
valueLimit = 5000

-- | `show` a value, forcing at most showLimit characters of it.
shown :: Show a => a -> IO String
shown x = do
  let s = show x
      t = take showLimit s
  _ <- evaluate (length t)
  pure (if null (drop showLimit s) then t else t ++ "…")

isTypeError :: SomeException -> Bool
isTypeError e = case fromException e of
  Just (TypeError _) -> True
  Nothing -> False

-- | A test's own time limit arrives as an asynchronous exception: let it through.
rethrowAsync :: SomeException -> IO ()
rethrowAsync e = case fromException e of
  Just (_ :: SomeAsyncException) -> throwIO e
  Nothing -> pure ()

message :: SomeException -> String
message = displayException

utf8Everywhere :: IO ()
utf8Everywhere = mapM_ (`hSetEncoding` utf8) [stdin, stdout, stderr]

emit :: Outcome -> IO ()
emit o = putStrLn ("@@htown " ++ json o) >> hFlush stdout
  where
    json (Compared ok w g) = obj [("ok", if ok then "true" else "false"), ("want", str w), ("got", str g)]
    json (Failed w e) = obj ([("ok", "false")] ++ maybe [] (\x -> [("want", str x)]) w ++ [("error", str e)])
    json NoEq = obj [("ok", "false"), ("error", str "no Eq instance")]
    obj kvs = "{" ++ commas [str k ++ ":" ++ v | (k, v) <- kvs] ++ "}"
    commas [] = ""
    commas (x : xs) = x ++ concatMap (',' :) xs

str :: String -> String
str s = '"' : concatMap esc s ++ "\""
  where
    esc '"' = "\\\""
    esc '\\' = "\\\\"
    esc '\n' = "\\n"
    esc c
      | ord c < 0x20 = "\\u" ++ replicate (4 - length h) '0' ++ h
      | otherwise = [c]
      where
        h = showHex (ord c) ""
