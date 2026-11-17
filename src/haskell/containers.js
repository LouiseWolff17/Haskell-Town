// Data.Map and Data.Set (Glaschu's library and map room): their functions, with their types.
// Programs use them qualified (Map.insert, Set.member, or M.insert after import qualified Data.Map as M; see modules.js),
// so they live in the Prelude's environment under those names, next to map, filter and lookup without clashing.
//
// A Map is an HMap: its keys in order, and its values at the same positions (evaluator.js). Looking a key up is a
// binary search; adding one copies the arrays, which is fine for the sizes a town's programs use.
// Like Data.Map.Strict, a value a function works out (insertWith, adjust, Map.map …) is worked out straight away,
// so counting with insertWith (+) in a long fold doesn't pile up a chain of sums. Values you put in yourself
// (insert, fromList) stay lazy.
import { BUILTIN_CLASSES } from './context.js';
import { HsError } from './errors.js';
import { tokenize } from './lexer.js';
import { HMap, HSet, PRELUDE, apply, cmp, force, isPure, prim, showShort, toList } from './evaluator.js';
import { TENV0, sigScheme } from './types.js';

const Nothing = { con: 'Nothing', args: [] }, Just = x => ({ con: 'Just', args: [x] });
const pair = (a, b) => ({ tuple: [a, b] });
const asMaybe = m => { m = force(m); return isPure(m) ? Just(m.pureOf) : m; };
const call = (f, ...xs) => xs.reduce((g, x) => apply(g, x), f);
const EMPTY_MAP = new HMap([], []), EMPTY_SET = new HSet([]);

// the first position whose key is >= k
function seek(ks, k) { let lo = 0, hi = ks.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(ks[mid], k) < 0) lo = mid + 1; else hi = mid; } return lo; }
const at = (ks, k) => { const i = seek(ks, k); return i < ks.length && cmp(ks[i], k) === 0 ? i : -1; };
// a copy of m with key k set to v (put in its place, or replacing the old value)
function put(m, k, v) {
  const i = seek(m.ks, k), hit = i < m.ks.length && cmp(m.ks[i], k) === 0;
  const ks = m.ks.slice(), vs = m.vs.slice();
  if (hit) vs[i] = v; else { ks.splice(i, 0, k); vs.splice(i, 0, v); }
  return new HMap(ks, vs);
}
const without = (m, i) => i < 0 ? m : new HMap(m.ks.filter((_, j) => j !== i), m.vs.filter((_, j) => j !== i));
const pick = (m, keep) => { const ks = [], vs = []; m.ks.forEach((k, i) => { if (keep(k, m.vs[i], i)) { ks.push(k); vs.push(m.vs[i]); } }); return new HMap(ks, vs); };
// sorted keys (and values), with each key once: later ones combine with earlier ones (by default the later one wins)
function build(kvs, combine = (nw) => nw) {
  const tagged = kvs.map(([k, v], i) => [force(k), v, i]).sort((a, b) => cmp(a[0], b[0]) || a[2] - b[2]);
  const ks = [], vs = [];
  for (const [k, v] of tagged) {
    if (ks.length && cmp(ks[ks.length - 1], k) === 0) vs[vs.length - 1] = combine(v, vs[vs.length - 1]);
    else { ks.push(k); vs.push(v); }
  }
  return { ks, vs };
}
const mapFrom = (kvs, combine) => { const { ks, vs } = build(kvs, combine); return new HMap(ks, vs); };
const setFrom = xs => new HSet(build(xs.map(x => [x, null])).ks);
const pairsOf = xs => toList(xs).map(p => { p = force(p); return [p.tuple[0], p.tuple[1]]; });
// walk two Maps (or Sets) together, in key order: both(i, j) for a key in each, left(i) / right(j) for a key in only one
function merge(a, b, { both, left, right }) {
  let i = 0, j = 0;
  while (i < a.ks.length || j < b.ks.length) {
    const c = i >= a.ks.length ? 1 : j >= b.ks.length ? -1 : cmp(a.ks[i], b.ks[j]);
    if (c === 0) both(i++, j++);
    else if (c < 0) { if (left) left(i); i++; }
    else { if (right) right(j); j++; }
  }
}
function unionWithM(f, a, b) {
  const ks = [], vs = [];
  merge(a, b, { both: (i, j) => { ks.push(a.ks[i]); vs.push(f ? call(f, a.vs[i], b.vs[j]) : a.vs[i]); }, left: i => { ks.push(a.ks[i]); vs.push(a.vs[i]); }, right: j => { ks.push(b.ks[j]); vs.push(b.vs[j]); } });
  return new HMap(ks, vs);
}
function setOp(a, b, keepBoth, keepLeft, keepRight) {
  const ks = [];
  merge(a, b, { both: i => keepBoth && ks.push(a.ks[i]), left: i => keepLeft && ks.push(a.ks[i]), right: j => keepRight && ks.push(b.ks[j]) });
  return new HSet(ks);
}
const empty = (name, what) => new HsError(`${name}: the ${what} is empty, so there's nothing there to take!`);
const extreme = (m, last, name) => { if (!m.ks.length) throw empty(name, 'map'); const i = last ? m.ks.length - 1 : 0; return pair(m.ks[i], m.vs[i]); };
const missing = (k, name) => new HsError(`${name}: there's no key ${showShort(k)} in this map. Use Map.lookup (it gives Nothing) or Map.findWithDefault when a key might be missing.`);

// name: [type, arity, implementation, the arguments that stay lazy]
const MAP = {
  empty: ['Map k v', 0, () => EMPTY_MAP],
  singleton: ['k -> v -> Map k v', 2, (k, v) => new HMap([k], [v]), [1]],
  fromList: ['Ord k => [(k, v)] -> Map k v', 1, xs => mapFrom(pairsOf(xs))],
  fromListWith: ['Ord k => (v -> v -> v) -> [(k, v)] -> Map k v', 2, (f, xs) => mapFrom(pairsOf(xs), (nw, old) => call(f, nw, old))],
  fromSet: ['(k -> v) -> Set k -> Map k v', 2, (f, s) => new HMap(s.ks, s.ks.map(k => apply(f, k)))],
  toList: ['Map k v -> [(k, v)]', 1, m => m.ks.map((k, i) => pair(k, m.vs[i]))],
  toAscList: ['Map k v -> [(k, v)]', 1, m => m.ks.map((k, i) => pair(k, m.vs[i]))],
  assocs: ['Map k v -> [(k, v)]', 1, m => m.ks.map((k, i) => pair(k, m.vs[i]))],
  toDescList: ['Map k v -> [(k, v)]', 1, m => m.ks.map((k, i) => pair(k, m.vs[i])).reverse()],
  keys: ['Map k v -> [k]', 1, m => m.ks.slice()],
  elems: ['Map k v -> [v]', 1, m => m.vs.slice()],
  keysSet: ['Map k v -> Set k', 1, m => new HSet(m.ks)],
  size: ['Map k v -> Int', 1, m => m.ks.length],
  null: ['Map k v -> Bool', 1, m => m.ks.length === 0],
  member: ['Ord k => k -> Map k v -> Bool', 2, (k, m) => at(m.ks, k) >= 0],
  notMember: ['Ord k => k -> Map k v -> Bool', 2, (k, m) => at(m.ks, k) < 0],
  lookup: ['Ord k => k -> Map k v -> Maybe v', 2, (k, m) => { const i = at(m.ks, k); return i < 0 ? Nothing : Just(m.vs[i]); }],
  findWithDefault: ['Ord k => v -> k -> Map k v -> v', 3, (d, k, m) => { const i = at(m.ks, k); return i < 0 ? d : m.vs[i]; }, [0]],
  '!': ['Ord k => Map k v -> k -> v', 2, (m, k) => { const i = at(m.ks, k); if (i < 0) throw missing(k, 'Map.!'); return m.vs[i]; }],
  '!?': ['Ord k => Map k v -> k -> Maybe v', 2, (m, k) => { const i = at(m.ks, k); return i < 0 ? Nothing : Just(m.vs[i]); }],
  insert: ['Ord k => k -> v -> Map k v -> Map k v', 3, (k, v, m) => put(m, k, v), [1]],
  // insertWith f k new m: f new old when k is already there
  insertWith: ['Ord k => (v -> v -> v) -> k -> v -> Map k v -> Map k v', 4, (f, k, v, m) => { const i = at(m.ks, k); return put(m, k, i < 0 ? v : call(f, v, m.vs[i])); }, [2]],
  delete: ['Ord k => k -> Map k v -> Map k v', 2, (k, m) => without(m, at(m.ks, k))],
  adjust: ['Ord k => (v -> v) -> k -> Map k v -> Map k v', 3, (f, k, m) => { const i = at(m.ks, k); return i < 0 ? m : put(m, k, apply(f, m.vs[i])); }],
  update: ['Ord k => (v -> Maybe v) -> k -> Map k v -> Map k v', 3, (f, k, m) => { const i = at(m.ks, k); if (i < 0) return m; const r = asMaybe(apply(f, m.vs[i])); return r.con === 'Just' ? put(m, k, r.args[0]) : without(m, i); }],
  alter: ['Ord k => (Maybe v -> Maybe v) -> k -> Map k v -> Map k v', 3, (f, k, m) => { const i = at(m.ks, k); const r = asMaybe(apply(f, i < 0 ? Nothing : Just(m.vs[i]))); return r.con === 'Just' ? put(m, k, r.args[0]) : without(m, i); }],
  map: ['(a -> b) -> Map k a -> Map k b', 2, (f, m) => new HMap(m.ks, m.vs.map(v => apply(f, v)))],
  mapWithKey: ['(k -> a -> b) -> Map k a -> Map k b', 2, (f, m) => new HMap(m.ks, m.vs.map((v, i) => call(f, m.ks[i], v)))],
  mapKeys: ['Ord k2 => (k1 -> k2) -> Map k1 v -> Map k2 v', 2, (f, m) => mapFrom(m.ks.map((k, i) => [apply(f, k), m.vs[i]]))],
  mapMaybe: ['(a -> Maybe b) -> Map k a -> Map k b', 2, (f, m) => { const ks = [], vs = []; m.vs.forEach((v, i) => { const r = asMaybe(apply(f, v)); if (r.con === 'Just') { ks.push(m.ks[i]); vs.push(r.args[0]); } }); return new HMap(ks, vs); }],
  filter: ['(v -> Bool) -> Map k v -> Map k v', 2, (p, m) => pick(m, (_, v) => apply(p, v))],
  filterWithKey: ['(k -> v -> Bool) -> Map k v -> Map k v', 2, (p, m) => pick(m, (k, v) => call(p, k, v))],
  partition: ['(v -> Bool) -> Map k v -> (Map k v, Map k v)', 2, (p, m) => { const yes = m.vs.map(v => apply(p, v)); return pair(pick(m, (_, __, i) => yes[i]), pick(m, (_, __, i) => !yes[i])); }],
  foldr: ['(a -> b -> b) -> b -> Map k a -> b', 3, (f, z, m) => m.vs.reduceRight((acc, v) => call(f, v, acc), z), [1]],
  foldl: ['(b -> a -> b) -> b -> Map k a -> b', 3, (f, z, m) => m.vs.reduce((acc, v) => call(f, acc, v), z), [1]],
  foldrWithKey: ['(k -> a -> b -> b) -> b -> Map k a -> b', 3, (f, z, m) => m.vs.reduceRight((acc, v, i) => call(f, m.ks[i], v, acc), z), [1]],
  foldlWithKey: ['(b -> k -> a -> b) -> b -> Map k a -> b', 3, (f, z, m) => m.vs.reduce((acc, v, i) => call(f, acc, m.ks[i], v), z), [1]],
  union: ['Ord k => Map k v -> Map k v -> Map k v', 2, (a, b) => unionWithM(null, a, b)], // the left map wins
  unionWith: ['Ord k => (v -> v -> v) -> Map k v -> Map k v -> Map k v', 3, (f, a, b) => unionWithM(f, a, b)],
  unions: ['Ord k => [Map k v] -> Map k v', 1, ms => toList(ms).reduce((a, b) => unionWithM(null, a, b), EMPTY_MAP)],
  unionsWith: ['Ord k => (v -> v -> v) -> [Map k v] -> Map k v', 2, (f, ms) => toList(ms).reduce((a, b) => unionWithM(f, a, b), EMPTY_MAP)],
  intersection: ['Ord k => Map k a -> Map k b -> Map k a', 2, (a, b) => pick(a, k => at(b.ks, k) >= 0)],
  intersectionWith: ['Ord k => (a -> b -> c) -> Map k a -> Map k b -> Map k c', 3, (f, a, b) => { const ks = [], vs = []; merge(a, b, { both: (i, j) => { ks.push(a.ks[i]); vs.push(call(f, a.vs[i], b.vs[j])); } }); return new HMap(ks, vs); }],
  difference: ['Ord k => Map k a -> Map k b -> Map k a', 2, (a, b) => pick(a, k => at(b.ks, k) < 0)],
  '\\\\': ['Ord k => Map k a -> Map k b -> Map k a', 2, (a, b) => pick(a, k => at(b.ks, k) < 0)],
  restrictKeys: ['Ord k => Map k v -> Set k -> Map k v', 2, (m, s) => pick(m, k => at(s.ks, k) >= 0)],
  withoutKeys: ['Ord k => Map k v -> Set k -> Map k v', 2, (m, s) => pick(m, k => at(s.ks, k) < 0)],
  lookupMin: ['Map k v -> Maybe (k, v)', 1, m => m.ks.length ? Just(extreme(m, false)) : Nothing],
  lookupMax: ['Map k v -> Maybe (k, v)', 1, m => m.ks.length ? Just(extreme(m, true)) : Nothing],
  findMin: ['Map k v -> (k, v)', 1, m => extreme(m, false, 'Map.findMin')],
  findMax: ['Map k v -> (k, v)', 1, m => extreme(m, true, 'Map.findMax')],
  deleteMin: ['Map k v -> Map k v', 1, m => without(m, m.ks.length ? 0 : -1)],
  deleteMax: ['Map k v -> Map k v', 1, m => without(m, m.ks.length - 1)],
};
MAP["foldr'"] = MAP.foldr; MAP["foldl'"] = MAP.foldl; MAP["foldrWithKey'"] = MAP.foldrWithKey; MAP["foldlWithKey'"] = MAP.foldlWithKey;

const sMin = (s, last, name) => { if (!s.ks.length) throw empty(name, 'set'); return s.ks[last ? s.ks.length - 1 : 0]; };
const SET = {
  empty: ['Set a', 0, () => EMPTY_SET],
  singleton: ['a -> Set a', 1, x => new HSet([x])],
  fromList: ['Ord a => [a] -> Set a', 1, xs => setFrom(toList(xs))],
  toList: ['Set a -> [a]', 1, s => s.ks.slice()],
  toAscList: ['Set a -> [a]', 1, s => s.ks.slice()],
  elems: ['Set a -> [a]', 1, s => s.ks.slice()],
  toDescList: ['Set a -> [a]', 1, s => s.ks.slice().reverse()],
  size: ['Set a -> Int', 1, s => s.ks.length],
  null: ['Set a -> Bool', 1, s => s.ks.length === 0],
  member: ['Ord a => a -> Set a -> Bool', 2, (x, s) => at(s.ks, x) >= 0],
  notMember: ['Ord a => a -> Set a -> Bool', 2, (x, s) => at(s.ks, x) < 0],
  insert: ['Ord a => a -> Set a -> Set a', 2, (x, s) => { const i = seek(s.ks, x); if (i < s.ks.length && cmp(s.ks[i], x) === 0) return s; const ks = s.ks.slice(); ks.splice(i, 0, x); return new HSet(ks); }],
  delete: ['Ord a => a -> Set a -> Set a', 2, (x, s) => { const i = at(s.ks, x); return i < 0 ? s : new HSet(s.ks.filter((_, j) => j !== i)); }],
  union: ['Ord a => Set a -> Set a -> Set a', 2, (a, b) => setOp(a, b, true, true, true)],
  unions: ['Ord a => [Set a] -> Set a', 1, ss => toList(ss).reduce((a, b) => setOp(a, b, true, true, true), EMPTY_SET)],
  intersection: ['Ord a => Set a -> Set a -> Set a', 2, (a, b) => setOp(a, b, true, false, false)],
  difference: ['Ord a => Set a -> Set a -> Set a', 2, (a, b) => setOp(a, b, false, true, false)],
  '\\\\': ['Ord a => Set a -> Set a -> Set a', 2, (a, b) => setOp(a, b, false, true, false)],
  isSubsetOf: ['Ord a => Set a -> Set a -> Bool', 2, (a, b) => a.ks.every(x => at(b.ks, x) >= 0)],
  filter: ['(a -> Bool) -> Set a -> Set a', 2, (p, s) => new HSet(s.ks.filter(x => apply(p, x)))],
  partition: ['(a -> Bool) -> Set a -> (Set a, Set a)', 2, (p, s) => { const yes = s.ks.map(x => apply(p, x)); return pair(new HSet(s.ks.filter((_, i) => yes[i])), new HSet(s.ks.filter((_, i) => !yes[i]))); }],
  map: ['Ord b => (a -> b) -> Set a -> Set b', 2, (f, s) => setFrom(s.ks.map(x => apply(f, x)))],
  foldr: ['(a -> b -> b) -> b -> Set a -> b', 3, (f, z, s) => s.ks.reduceRight((acc, x) => call(f, x, acc), z), [1]],
  foldl: ['(b -> a -> b) -> b -> Set a -> b', 3, (f, z, s) => s.ks.reduce((acc, x) => call(f, acc, x), z), [1]],
  findMin: ['Set a -> a', 1, s => sMin(s, false, 'Set.findMin')],
  findMax: ['Set a -> a', 1, s => sMin(s, true, 'Set.findMax')],
  lookupMin: ['Set a -> Maybe a', 1, s => s.ks.length ? Just(s.ks[0]) : Nothing],
  lookupMax: ['Set a -> Maybe a', 1, s => s.ks.length ? Just(s.ks[s.ks.length - 1]) : Nothing],
  deleteMin: ['Set a -> Set a', 1, s => new HSet(s.ks.slice(1))],
  deleteMax: ['Set a -> Set a', 1, s => new HSet(s.ks.slice(0, -1))],
};
SET["foldr'"] = SET.foldr; SET["foldl'"] = SET.foldl;

for (const [prefix, lib] of [['Map', MAP], ['Set', SET]]) for (const [name, [type, arity, impl, lazy]] of Object.entries(lib)) {
  const full = `${prefix}.${name}`;
  TENV0[full] = sigScheme(tokenize(type));
  PRELUDE[full] = arity === 0 ? impl() : prim(arity, impl, full, lazy);
}

// Semigroup and Monoid: <> is union (the left one wins for a key in both), mempty is the empty Map or Set
{
  const S = BUILTIN_CLASSES.Semigroup.instances, M = BUILTIN_CLASSES.Monoid.instances;
  const inst = (key, methods) => ({ key, builtin: true, methods, ctx: [] });
  S.Map = inst('Map', { '<>': prim(2, (a, b) => unionWithM(null, a, b), '<>') }); M.Map = inst('Map', { mempty: EMPTY_MAP });
  S.Set = inst('Set', { '<>': prim(2, (a, b) => setOp(a, b, true, true, true), '<>') }); M.Set = inst('Set', { mempty: EMPTY_SET });
}
