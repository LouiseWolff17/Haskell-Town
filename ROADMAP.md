# Roadmap

## What the in-browser Haskell can't do yet

The game shows the same list in Library → "What Haskell Town can't do yet". Keep it in sync with `src/content/unsupported.ts`.

1. **Some type class features**: multi-parameter classes, default method signatures, `deriving` beyond Show/Eq/Ord (no `deriving Functor`), instances for tuples or type synonyms like `String` (FlexibleInstances).
2. **Your own Num / Fractional / Read instances.**
3. **Parts of Foldable and Traversable**: `sum`, `length`, `elem`, `maximum`, `foldr` etc. only take lists. Foldable instances must define `foldMap`. `traverse`/`mapM`/`sequence` only work over lists (there's no `Traversable` class). No Monoid for functions. `Min`/`Max` are Semigroups only.
4. **Choosing an instance from the result type alone in polymorphic code**, e.g. a user method `empty :: f a` inside a `Container f =>` function. `pure`/`return`/`mempty` do work.
5. **Ambiguous runtime picks**: inside fully polymorphic code, a user class with instances for both `Int` and `Double` may pick the wrong one. `1 <> 2` with no type is a runtime error rather than a type error.
6. **Record patterns** like `f (Student { name = n })`.
7. **Full laziness**: only lists are lazy. `const 1 undefined` fails, and there are no character ranges (`['a'..'z']`).
8. **Modules & imports**: `import` lines are ignored, and there's no `Data.Map`.
9. **Most of IO**: no files, `interact`, `getContents`, `readLn`.
10. **Big numbers**: no arbitrary-precision `Integer` (exact up to 2^53). `Float` = `Double`.
11. **Very deep recursion** can hit the browser's stack limit.
12. **Advanced type features**: GADTs, type families, `forall`, kind signatures, `seq`, strictness.
13. **Display details**: unsigned polymorphic expressions show `Num a => [a]` instead of `[Integer]`, and there are extra parentheses around custom `show` inside constructors.

## Next steps

### Project health
- [ ] Commit `package-lock.json` after the first `npm install`, then switch CI to `npm ci`.
- [ ] Run the runner in a **Web Worker**, so an endless loop can't freeze the page. A timeout could then stop it.
- [ ] Split `src/haskell/interpreter.js` into lexer / parser / types / evaluator modules. Its parts share mutable state (`curLevel`, the current data context), so that becomes an explicit context object first.
- [ ] Move `src/game/*.js` to TypeScript, one file at a time (`state` and `highlight` first).
- [ ] Browser tests (Playwright) for the main flows: solve a challenge, build, Workshop.

### Haskell features
- [ ] Fuller laziness: lazy function arguments and data fields (`const 1 undefined`, lazy trees).
- [ ] `Enum` for `Char` ranges (`['a'..'z']`).
- [ ] Foldable-generic `sum`, `length`, `elem` …, keeping the friendly list error messages.
- [ ] A `Traversable` class, perhaps with a Bridge building.

### Learning
- [ ] Track which concepts the player struggles with (attempt counts are already stored) and offer optional practice in the Library.
- [ ] Larger multi-function projects at City Hall (design doc stage 5: mastery and creativity).

### Real GHC
- [ ] A sandboxed GHC service implementing the [runner API](docs/runner-api.md), and a `GhcRunner` that passes `tests/runner-contract.test.ts`.
