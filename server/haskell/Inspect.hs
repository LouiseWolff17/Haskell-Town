-- htown-inspect: type-checks a player's program with the GHC API and describes it as JSON.
-- It only type-checks (the caller passes -fno-code), so none of the player's code runs here.
--
-- Usage: htown-inspect LIBDIR OUT.json FILE.hs [FILE.hs ...] -- GHC-FLAGS...
--
-- Each file is checked on its own, in order. Before each one, the line "@@htown-file N"
-- is written to stdout and to stderr, so the caller can tell which compiler messages
-- belong to which file. OUT.json gets a list with one object per file:
--
--   {"ok":false,"phase":"imports"|"parse"|"typecheck"}
--   {"ok":true,"types":{"add":"Int -> Int -> Int"},"sigs":["add"],"datas":[...],
--    "synonyms":[...],"classes":[...],"instances":["Functor Crate"],"fields":[...],
--    "defined":[...],"uses":["+"],"recursive":false}
--
-- "uses" are the top-level and imported names the program's expressions refer to (for a
-- challenge's `forbid` rule), and "recursive" says whether any binding group is recursive,
-- which is GHC's own dependency analysis of the renamed program.
{-# LANGUAGE RankNTypes #-}
{-# LANGUAGE ScopedTypeVariables #-}
module Main (main) where

import Control.Monad.IO.Class (liftIO)
import Data.Char (isAlpha, isUpper, ord)
import Data.Data (Data, gmapQ)
import Data.List (nub)
import Data.Maybe (mapMaybe)
import Data.Typeable (Typeable, cast)
import Numeric (showHex)
import System.Environment (getArgs)
import System.Exit (ExitCode (..), exitWith)
import System.IO

import GHC
import GHC.Core.Class (classMethods, classTyVars)
import GHC.Core.DataCon (dataConFieldLabels)
import GHC.Core.InstEnv (instanceHead)
import GHC.Core.TyCon (isAlgTyCon, isClassTyCon, isTypeSynonymTyCon, tyConClass_maybe, tyConDataCons, tyConTyVars)
import GHC.Core.Type (splitTyConApp_maybe)
import GHC.Driver.Ppr (showSDoc)
import GHC.Types.Basic (RecFlag (..))
import GHC.Types.FieldLabel (FieldLabel (..))
import GHC.Types.Id (idType, isDFunId, isImplicitId)
import GHC.Types.Name (getOccString, isExternalName)
import GHC.Types.SrcLoc (GenLocated (..), noLoc)
import GHC.Types.TyThing (TyThing (..))
import GHC.Unit.Module.Graph (mgModSummaries)
import GHC.Utils.Logger (getLogger)
import GHC.Utils.Outputable (Depth (AllTheWay), Outputable, neverQualify, ppr, withUserStyle)

main :: IO ()
main = do
  mapM_ (`hSetEncoding` utf8) [stdout, stderr]
  args <- getArgs
  case break (== "--") args of
    (libdir : out : files@(_ : _), _ : flags) -> do
      results <- runGhc (Just libdir) $ do
        df <- getSessionDynFlags
        logger <- getLogger
        (df', _, _) <- parseDynamicFlags logger df (map noLoc flags)
        _ <- setSessionDynFlags df'
        mapM (uncurry inspectFile) (zip [0 :: Int ..] files)
      withFile out WriteMode $ \h -> hSetEncoding h utf8 >> hPutStr h (render (JA results))
    _ -> do
      hPutStrLn stderr "usage: htown-inspect LIBDIR OUT.json FILE.hs [FILE.hs ...] -- GHC-FLAGS..."
      exitWith (ExitFailure 2)

-- | Type-check one file. Compiler messages go to stderr (via printException).
inspectFile :: Int -> FilePath -> Ghc J
inspectFile i file = do
  liftIO (mark i)
  target <- guessTarget file Nothing Nothing
  setTargets [target]
  graph <- attempt (depanal [] False)
  case mgModSummaries <$> graph of
    Nothing -> pure (failed "imports")
    Just [] -> pure (failed "imports")
    Just (ms : _) -> do
      parsed <- attempt (parseModule ms)
      case parsed of
        Nothing -> pure (failed "parse")
        Just pm -> do
          checked <- attempt (typecheckModule pm)
          maybe (pure (failed "typecheck")) describe checked
  where
    attempt :: Ghc a -> Ghc (Maybe a)
    attempt act = handleSourceError (\e -> printException e >> pure Nothing) (Just <$> act)
    failed phase = JO [("ok", JB False), ("phase", JS phase)]

mark :: Int -> IO ()
mark i = mapM_ (\h -> hPutStrLn h ("@@htown-file " ++ show i) >> hFlush h) [stdout, stderr]

-- | Everything the runner needs to know about a module that type-checks.
describe :: TypecheckedModule -> Ghc J
describe tcm = do
  dflags <- getSessionDynFlags
  let pp :: Outputable a => a -> String
      pp x = showSDoc dflags (withUserStyle neverQualify AllTheWay (ppr x))
      info = moduleInfo tcm
      things = modInfoTyThings info
      ids = [i | AnId i <- things, not (isImplicitId i), not (isDFunId i), not (generated (getOccString i))]
      tycons = [tc | ATyCon tc <- things, not (generated (getOccString tc))]
      classes = mapMaybe tyConClass_maybe tycons
      datas = [tc | tc <- tycons, isAlgTyCon tc, not (isClassTyCon tc)]
      synonyms = [tc | tc <- tycons, isTypeSynonymTyCon tc]
      cons = concatMap tyConDataCons datas
      fields = nub [getOccString (flSelector fl) | dc <- cons, fl <- dataConFieldLabels dc]
      methods = concatMap classMethods classes
      headName t = case splitTyConApp_maybe t of
        Just (tc, _) -> getOccString tc
        Nothing -> pp t
      instStr ci = case instanceHead ci of
        (_, cls, tys) -> unwords (getOccString cls : map headName (take 1 (reverse tys)))
      renamed :: forall b. Typeable b => [b]
      renamed = case renamedSource tcm of
        Nothing -> []
        Just rn -> hxListify (const True) rn
      uses = nub [getOccString n | HsVar _ (L _ n) <- (renamed :: [HsExpr GhcRn]), isExternalName n]
      sigs = nub [getOccString n | TypeSig _ lns _ <- (renamed :: [Sig GhcRn]), L _ n <- lns, isExternalName n]
      recursive = not (null [() | Recursive <- (renamed :: [RecFlag])])
      strs = JA . map JS
  pure $
    JO
      [ ("ok", JB True),
        ("types", JO [(getOccString i, JS (pp (idType i))) | i <- ids]),
        ("sigs", strs sigs),
        ( "datas",
          JA
            [ JO
                [ ("name", JS (getOccString tc)),
                  ("params", strs (map getOccString (tyConTyVars tc))),
                  ("cons", strs (map getOccString (tyConDataCons tc)))
                ]
            | tc <- datas
            ]
        ),
        ("synonyms", strs (map getOccString synonyms)),
        ( "classes",
          JA
            [ JO
                [ ("name", JS (getOccString c)),
                  ("param", JS (case classTyVars c of v : _ -> getOccString v; [] -> "")),
                  ("methods", strs (map getOccString (classMethods c)))
                ]
            | c <- classes
            ]
        ),
        ("instances", strs (nub (map instStr (modInfoInstances info)))),
        ("fields", strs fields),
        ( "defined",
          strs (nub (map getOccString ids ++ map getOccString tycons ++ map getOccString cons ++ fields ++ map getOccString methods))
        ),
        ("uses", strs uses),
        ("recursive", JB recursive)
      ]

-- | Names GHC makes up itself: $tcFoo, $dmshow, C:Show, ...
generated :: String -> Bool
generated ('$' : c : _) = isAlpha c
generated (c : ':' : _) = isUpper c
generated _ = False

-- ---------- a little generic traversal (syb isn't a GHC boot package) ----------

hxEverything :: forall r. (r -> r -> r) -> (forall a. Data a => a -> r) -> (forall a. Data a => a -> r)
hxEverything k f = go
  where
    go :: forall a. Data a => a -> r
    go x = foldl k (f x) (gmapQ go x)

hxListify :: forall b. Typeable b => (b -> Bool) -> (forall a. Data a => a -> [b])
hxListify p = hxEverything (++) (\x -> case cast x of Just b | p b -> [b]; _ -> [])

-- ---------- a little JSON ----------

data J = JS String | JB Bool | JA [J] | JO [(String, J)]

render :: J -> String
render (JS s) = '"' : concatMap esc s ++ "\""
  where
    esc '"' = "\\\""
    esc '\\' = "\\\\"
    esc '\n' = "\\n"
    esc c
      | ord c < 0x20 = "\\u" ++ replicate (4 - length h) '0' ++ h
      | otherwise = [c]
      where
        h = showHex (ord c) ""
render (JB b) = if b then "true" else "false"
render (JA xs) = "[" ++ commas (map render xs) ++ "]"
render (JO kvs) = "{" ++ commas [render (JS k) ++ ":" ++ render v | (k, v) <- kvs] ++ "}"

commas :: [String] -> String
commas [] = ""
commas (x : xs) = x ++ concatMap (',' :) xs
