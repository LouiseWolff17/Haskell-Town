// Evaluator: runtime values, thunks and lazy lists, IO, class-method dispatch, the Prelude, and evalE.
// Values of your own types are interpreted through the data context in cx (constructors, instances).
import { BUILTIN_CLASSES, cx } from './context.js';
import { HsError } from './errors.js';
import { TC, buildType, isVar, prune, tDouble, tvar } from './types.js';

// ================= Values & runtime =================
const UNIT = { tuple: [] };
// ---- laziness ----
// A Thunk is a value that hasn't been worked out yet: function arguments, constructor fields, tuple items,
// top-level constants and where/let bindings. force works it out (once — the result is kept) when something
// needs to look at it. evalE always returns a forced value; thunks only live inside arguments and data.
class Thunk {
  constructor(compute) { this.compute = compute; this.done = false; this.value = undefined; this.running = false; }
  get __thunk() { return true; }
}
const LOOP_MSG = 'This value is defined in terms of itself, so it can never be worked out.';
function force(v) {
  while (v instanceof Thunk) {
    if (!v.done) {
      if (v.running) throw new HsError(LOOP_MSG, 'loop');
      v.running = true;
      try { v.value = v.compute(); } finally { v.running = false; }
      v.done = true; v.compute = null;
    }
    v = v.value;
  }
  return v;
}
// a thunk's value if it's already known, without working anything out
const peek = v => v instanceof Thunk && v.done ? force(v) : v;
const isFn = v => !!v && typeof v === 'object' && typeof v.fn === 'function';
const mkFn = (f, name) => ({ fn: f, name });
// A built-in function. It looks at all its arguments, so they are forced once it has them all —
// except the positions listed in `lazy`, which are passed on as they are (const's second argument, …).
const prim = (arity, f, name, lazy) => {
  const go = args => mkFn(a => {
    const nx = [...args, a];
    if (nx.length < arity) return go(nx);
    for (let i = 0; i < arity; i++) if (!lazy || !lazy.includes(i)) nx[i] = force(nx[i]);
    return f(...nx);
  }, name);
  return go([]);
};

// the instance a user wrote for a value's type, if any (used for Show / Eq / Ord and Functor … on your own types)
function userInst(cls, v) {
  if (!v || !v.con) return null; const info = cx.cons[v.con]; if (!info) return null;
  const ci = cx.classes[cls]; return (ci && ci.instances[info.typeName]) || null;
}
const forceVal = force;
const instFn = (inst, name) => inst.methods[name] ? forceVal(inst.methods[name]) : null;
const PURE = x => ({ pureOf: x }); const isPure = v => !!v && typeof v === 'object' && 'pureOf' in v;
function show(v) {
  v = force(v);
  if (v === MEMPTY) return 'mempty';
  if (isPure(v)) return 'pure ' + paren(show(v.pureOf));
  { const ui = userInst('Show', v); if (ui && instFn(ui, 'show')) return strOf(apply(instFn(ui, 'show'), v)); }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(10));
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (isL(v)) return show(toList(v));
  if (Array.isArray(v)) return '[' + v.map(show).join(',') + ']';
  if (v && v.tuple) return '(' + v.tuple.map(show).join(',') + ')';
  if (v && v.con) {
    const info = cx.cons[v.con];
    if (info && info.fieldNames) return `${v.con} {${info.fieldNames.map((f, i) => `${f} = ${show(v.args[i])}`).join(', ')}}`;
    return v.args.length ? v.con + ' ' + v.args.map(a => paren(show(a))).join(' ') : v.con;
  }
  if (isFn(v)) return '<a function>';
  if (v && v.io) return '<an IO action>';
  return String(v);
}
const paren = s => (/^-/.test(s) || (/\s/.test(s) && !/^[\[("']/.test(s))) ? '(' + s + ')' : s;
// show a value using its (inferred) type, so Chars, Strings and Doubles print the way GHC prints them
function showT(v, t) {
  v = force(v); t = prune(t);
  if (isVar(t) && t.cls.has('Fractional')) t = tDouble;
  if (isPure(v) && !isVar(t) && !t.rigid) v = pureG(t.con, v.pureOf);
  if (v === MEMPTY && !isVar(t) && !t.rigid) v = memptyT(t);
  if (isVar(t) || t.rigid) return show(v);
  { const ui = userInst('Show', v); if (ui && instFn(ui, 'show')) return strOf(apply(instFn(ui, 'show'), v)); }
  switch (t.con) {
    case 'Char': return "'" + (v === "'" ? "\\'" : v === '\n' ? '\\n' : v === '\0' ? '\\NUL' : v) + "'";
    case 'Double': return Number.isInteger(v) ? v + '.0' : show(v);
    case '[]': { const e = prune(t.args[0]); if (!isVar(e) && e.con === 'Char') return JSON.stringify(typeof v === 'string' ? v : toList(v).join('')); return '[' + toList(v).map(x => showT(x, e)).join(',') + ']'; }
    case '(,)': return '(' + v.tuple.map((x, i) => showT(x, t.args[i])).join(',') + ')';
    case 'Maybe': return v.con === 'Just' ? 'Just ' + paren(showT(v.args[0], t.args[0])) : 'Nothing';
    case 'Either': return v.con + ' ' + paren(showT(v.args[0], t.args[v.con === 'Left' ? 0 : 1]));
  }
  if (cx.types[t.con] && v && v.con && cx.cons[v.con]) {
    const info = cx.cons[v.con]; const m = {}; info.params.forEach((p, i) => { m[p] = t.args[i]; });
    const parts = v.args.map((x, i) => showT(x, buildType(info.fieldAsts[i], n => m[n] || tvar(), null)));
    if (info.fieldNames) return `${v.con} {${info.fieldNames.map((f, i) => `${f} = ${parts[i]}`).join(', ')}}`;
    return parts.length ? v.con + ' ' + parts.map(paren).join(' ') : v.con;
  }
  return show(v);
}
const showShort = v => { if (isL(v)) { const h = takeN(v, 8); return h.length < 8 ? show(h) : '[' + h.map(show).join(',') + ',…]'; } const s = show(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
const num = (v, ctx) => { if (typeof v !== 'number') throw new HsError(`${ctx} works with numbers, but it was given ${showShort(v)}.`); return v; };
const bool = (v, ctx) => { if (typeof v !== 'boolean') throw new HsError(`${ctx} needs True or False, but got ${showShort(v)}.`); return v; };
// ---- lazy lists ----
// x : rest makes an LCons whose tail is only worked out when something needs it, so lists can go on forever.
// Finite lists are still plain arrays or strings; everything that walks a list understands all three.
// The items can be thunks too (length [undefined] is 1): iter, takeN and spine hand them over as they are,
// and toList works them all out, for the functions that look at every item anyway (sum, show, ==, …).
const LAZY_LIMIT = 1000000;
const tooLong = () => new HsError('This list goes on forever (or has over a million items), so Haskell Town stopped. Infinite lists are fine — just take the part you need, like take 10 [1..].', 'loop');
class LCons {
  constructor(h, tf) { this.h = h; this.tf = tf; this.done = false; this.t = undefined; }
  tail() {
    if (!this.done) {
      if (this.busy) throw new HsError('This list is defined in terms of itself in a way that can never be worked out.', 'loop');
      this.busy = true; try { this.t = this.tf(); } finally { this.busy = false; }
      this.tf = null; this.done = true;
    }
    return this.t;
  }
}
const isL = v => v instanceof LCons;
const isListV = v => typeof v === 'string' || Array.isArray(v) || v instanceof LCons;
const cell = (h, t) => { const c = new LCons(h, null); c.done = true; c.t = t; return c; };
function* iter(v, name) {
  let n = 0; v = force(v);
  while (v instanceof LCons) { yield v.h; v = v.tail(); if (++n > LAZY_LIMIT) throw tooLong(); }
  if (v === MEMPTY) return;
  if (typeof v === 'string' || Array.isArray(v)) { yield* v; return; }
  throw new HsError(`${name || 'This'} expects a list, but was given ${showShort(v)}.`);
}
// the rest of a long array, without copying it: walking it with (x:xs) costs the same at every step
const arrTail = (arr, i) => i >= arr.length ? [] : new LCons(arr[i], () => arrTail(arr, i + 1));
function fromIter(it) { const r = it.next(); return r.done ? [] : new LCons(r.value, () => fromIter(it)); }
const lazyGen = g => fromIter(g());
function forceL(v) {
  if (v.arr) return v.arr;
  const out = []; let c = v;
  while (c instanceof LCons) { out.push(c.h); c = c.tail(); if (out.length > LAZY_LIMIT) throw tooLong(); }
  if (typeof c === 'string' || Array.isArray(c)) for (const x of c) out.push(x);
  v.arr = out; return out;
}
function takeN(v, n) { const out = []; if (n <= 0) return out; for (const x of iter(v)) { out.push(x); if (out.length >= n) break; } return out; }
// the list's items, some maybe still thunks
const spine = (v, name) => { v = force(v); if (Array.isArray(v)) return v; if (v instanceof LCons) return forceL(v); if (v === MEMPTY) return []; if (typeof v === 'string') return [...v]; throw new HsError(`${name} expects a list, but was given ${showShort(v)}.`); };
// the list's items, all worked out (a thunk's value replaces it in the array, so this is only done once)
const toList = (v, name) => {
  const l = spine(v, name);
  for (let i = 0; i < l.length; i++) if (l[i] instanceof Thunk) l[i] = force(l[i]);
  return l;
};
const fromLike = (orig, arr) => (typeof orig === 'string' && arr.every(c => typeof c === 'string' && c.length === 1)) ? arr.join('') : arr;
const tup = v => v.tuple;

function deepEq(a, b) {
  a = force(a); b = force(b);
  if (a === MEMPTY || b === MEMPTY) return isEmptyish(a === MEMPTY ? b : a);
  if (isPure(a) || isPure(b)) {
    const [p, o] = isPure(a) ? [a, b] : [b, a];
    if (isPure(o)) return deepEq(p.pureOf, o.pureOf);
    if (Array.isArray(o)) return o.length === 1 && deepEq(o[0], p.pureOf);
    if (o && (o.con === 'Just' || o.con === 'Right')) return deepEq(o.args[0], p.pureOf);
    return false;
  }
  if (a && a.con && b && b.con) {
    const ui = userInst('Eq', a);
    if (ui) { if (instFn(ui, '==')) return apply(apply(instFn(ui, '=='), a), b); if (instFn(ui, '/=')) return !apply(apply(instFn(ui, '/='), a), b); }
  }
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (isListV(a) && isListV(b)) {
    const x = spine(a), y = spine(b); return x.length === y.length && x.every((e, i) => deepEq(e, y[i]));
  }
  if (a && a.tuple && b && b.tuple) return a.tuple.length === b.tuple.length && a.tuple.every((e, i) => deepEq(e, b.tuple[i]));
  if (a && a.con && b && b.con) return a.con === b.con && a.args.every((e, i) => deepEq(e, b.args[i]));
  return a === b;
}
function cmp(a, b) {
  a = force(a); b = force(b);
  if (a && a.con && b && b.con) {
    const ui = userInst('Ord', a);
    if (ui && instFn(ui, 'compare')) { const o = apply(apply(instFn(ui, 'compare'), a), b); return o.con === 'LT' ? -1 : o.con === 'GT' ? 1 : 0; }
    if (ui && instFn(ui, '<=')) { const le = (x, y) => apply(apply(instFn(ui, '<='), x), y); return le(a, b) ? (le(b, a) ? 0 : -1) : 1; }
  }
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  if (isListV(a) && isListV(b)) {
    const x = spine(a), y = spine(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = cmp(x[i], y[i]); if (c) return c; }
    return Math.sign(x.length - y.length);
  }
  if (a && a.tuple && b && b.tuple) { for (let i = 0; i < a.tuple.length; i++) { const c = cmp(a.tuple[i], b.tuple[i]); if (c) return c; } return 0; }
  if (a && a.con && b && b.con) {
    if (a.con !== b.con) return conIndex(a.con) < conIndex(b.con) ? -1 : 1;
    for (let i = 0; i < a.args.length; i++) { const c = cmp(a.args[i], b.args[i]); if (c) return c; }
    return 0;
  }
  return 0;
}
const conIndex = n => cx.cons[n] ? cx.cons[n].index : ({ Nothing: 0, Just: 1, Left: 0, Right: 1, LT: 0, EQ: 1, GT: 2 }[n] || 0);
function append(a, b) {
  if (isL(a) || isL(b)) return lazyGen(function* () { yield* iter(a, '++'); yield* iter(b, '++'); });
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  const r = [...spine(a, '++'), ...spine(b, '++')];
  return (typeof a === 'string' || typeof b === 'string') ? fromLike('', r) : r;
}
// a function's result is always forced (a built-in like fst may hand back a field that is still a thunk)
function apply(f, a) { f = force(f); if (!isFn(f)) throw new HsError(`${showShort(f)} isn't a function, so it can't be given an argument.`); return force(f.fn(a)); }

// ---- IO: an action is { io: rt => value }; rt holds the output and the remaining input lines ----
const io = f => ({ io: f });
const strOf = s => typeof s === 'string' ? s : toList(s).join('');
function runAction(a, rt) {
  a = force(a);
  if (isPure(a)) return force(a.pureOf);
  if (!a || typeof a.io !== 'function') throw new HsError(`Expected an IO action, but got ${showShort(a)}.`);
  return force(a.io(rt));
}
function emit(rt, s) { rt.out.push(s); rt.size += s.length; if (rt.size > 50000) throw new HsError('Your program printed a LOT of output, so Haskell Town stopped it. Is there a loop that never ends?'); }
function readT(s, t) {
  const tt = t ? prune(t) : null; const k = !tt || isVar(tt) ? 'Int' : tt.con; const str = s.trim();
  if (k === 'Bool') { if (str === 'True' || str === 'False') return str === 'True'; throw new HsError(`read: "${s}" isn't True or False.`); }
  if (k === 'Double') { if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str); throw new HsError(`read: "${s}" isn't a valid Double.`); }
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  throw new HsError(`read: "${s}" isn't a valid whole number (Int).`);
}
// Functor / Applicative / Monad for the built-in types, falling back to the instances you write for your own types.
// A bare { pureOf: x } is what pure/return make when the type isn't known yet; it fits into any of them.
const Just = x => ({ con: 'Just', args: [x] }), Right = x => ({ con: 'Right', args: [x] });
const isListy = v => Array.isArray(v) || typeof v === 'string' || v instanceof LCons;
function userHkt(cls, v, name) {
  const ui = userInst(cls, v); const f = ui && instFn(ui, name);
  if (f) return f;
  throw new HsError(`\`${name}\` doesn't know how to work with ${showShort(v)}${v && v.con && cx.cons[v.con] ? ` — there's no \`instance ${cls} ${cx.cons[v.con].typeName}\`` : ''}.`);
}
// f x, worked out only when it's needed (fmap over Just keeps the field lazy)
const later = (f, x) => new Thunk(() => apply(f, x));
function fmapG(f, m) {
  m = force(m);
  if (isPure(m)) return PURE(apply(f, m.pureOf));
  if (isL(m)) return lazyGen(function* () { for (const x of iter(m)) yield apply(f, x); });
  if (isListy(m)) return fromLike(m, spine(m).map(x => apply(f, x)));
  if (m && m.io) return io(rt => apply(f, runAction(m, rt)));
  if (m && m.con === 'Just') return Just(later(f, m.args[0])); if (m && m.con === 'Nothing') return m;
  if (m && m.con === 'Right') return Right(later(f, m.args[0])); if (m && m.con === 'Left') return m;
  return apply(apply(userHkt('Functor', m, 'fmap'), f), m);
}
function apG(mf, mx) {
  mf = force(mf); mx = force(mx);
  if (isPure(mf)) return fmapG(mf.pureOf, mx);
  if (isPure(mx)) return fmapG(mkFn(f => apply(f, mx.pureOf)), mf);
  if (isListy(mf)) { const out = []; for (const f of toList(mf)) for (const x of toList(mx)) out.push(apply(f, x)); return out; }
  if (mf && mf.io) return io(rt => { const f = runAction(mf, rt); return apply(f, runAction(mx, rt)); });
  if (mf && (mf.con === 'Nothing' || mf.con === 'Left')) return mf;
  if (mf && (mf.con === 'Just' || mf.con === 'Right')) return (mx.con === 'Nothing' || mx.con === 'Left') ? mx : { con: mx.con, args: [later(mf.args[0], mx.args[0])] };
  return apply(apply(userHkt('Applicative', mf, '<*>'), mf), mx);
}
function bindG(m, k) {
  m = force(m);
  if (isPure(m)) return apply(k, m.pureOf);
  if (isL(m)) return lazyGen(function* () { for (const x of iter(m)) { const r = apply(k, x); if (isPure(r)) yield r.pureOf; else yield* iter(r); } });
  if (isListy(m)) { const out = []; for (const x of spine(m)) { const r = apply(k, x); if (isPure(r)) out.push(r.pureOf); else out.push(...toList(r)); } return out; }
  if (m && m.io) return io(rt => runAction(apply(k, runAction(m, rt)), rt));
  if (m && (m.con === 'Nothing' || m.con === 'Left')) return m;
  if (m && (m.con === 'Just' || m.con === 'Right')) return apply(k, m.args[0]);
  return apply(apply(userHkt('Monad', m, '>>='), m), k);
}
function pureG(key, x) {
  if (!key) return PURE(x);
  if (key === 'Maybe') return Just(x); if (key === '[]') return [x]; if (key === 'Either') return Right(x); if (key === 'IO') return io(() => x);
  const mo = cx.classes.Monad && cx.classes.Monad.instances[key], ap = cx.classes.Applicative && cx.classes.Applicative.instances[key];
  if (mo && instFn(mo, 'return')) return apply(instFn(mo, 'return'), x);
  if (ap && instFn(ap, 'pure')) return apply(instFn(ap, 'pure'), x);
  return PURE(x);
}
const HKT_FN = { fmap: prim(2, fmapG, 'fmap'), '<$>': prim(2, fmapG, '<$>'), '<*>': prim(2, apG, '<*>'), '>>=': prim(2, bindG, '>>='), '>>': prim(2, (a, b) => bindG(a, mkFn(() => b)), '>>') };
// ---- Semigroup / Monoid / Foldable at runtime ----
// MEMPTY is what mempty gives when the type isn't known where it's used (inside code that works for any Monoid).
// <> treats it as "nothing to add", and it turns into the real mempty once the type is known (when shown, compared …).
const MEMPTY = Object.freeze({ memptyOf: true });
const keyOfT = t => { if (!t) return null; t = prune(t); return (!isVar(t) && !t.rigid && t.con !== '@') ? t.con : null; };
function memptyT(t) {
  t = t ? prune(t) : null; const k = keyOfT(t); if (!k) return MEMPTY;
  if (k === '(,)') return { tuple: t.args.map(memptyT) };
  const inst = cx.classes.Monoid && cx.classes.Monoid.instances[k]; if (!inst) return MEMPTY;
  if (inst.builtin) return inst.memptyFor ? inst.memptyFor(t) : forceVal(inst.methods.mempty);
  return forceVal(inst.methods.mempty);
}
function sappend(a, b) {
  a = force(a); b = force(b);
  if (a === MEMPTY) return b; if (b === MEMPTY) return a;
  const ci = cx.classes.Semigroup; const key = valueKey(a, ci) || valueKey(b, ci);
  if (!key) throw new HsError(`\`<>\` doesn't know how to combine ${showShort(a)}${typeof a === 'number' ? '. Numbers can be combined by adding or by multiplying, so say which: Sum 3 <> Sum 4, or Product 3 <> Product 4' : ''}.`);
  return apply(apply(implFor(ci, key, '<>'), a), b);
}
const libMethodOf = (cls, key, name) => { const inst = key && cx.classes[cls] && cx.classes[cls].instances[key]; return inst && !inst.builtin && inst.methods[name] ? forceVal(inst.methods[name]) : null; };
function mconcatT(t, xs) { return toList(xs, 'mconcat').reduceRight((acc, x) => sappend(x, acc), memptyT(t)); }
function foldMapG(tKey, mT, f, c) {
  const ci = cx.classes.Foldable; const key = tKey || valueKey(c, ci) || (c === MEMPTY ? '[]' : null);
  let r;
  if (key === '[]') r = spine(c).reduceRight((acc, x) => sappend(apply(f, x), acc), MEMPTY);
  else if (key === 'Maybe') r = c.con === 'Just' ? apply(f, c.args[0]) : isPure(c) ? apply(f, c.pureOf) : MEMPTY;
  else if (key === 'Either') r = c.con === 'Right' ? apply(f, c.args[0]) : isPure(c) ? apply(f, c.pureOf) : MEMPTY;
  else if (key) r = apply(apply(implFor(ci, key, 'foldMap'), f), c);
  else throw new HsError(`\`foldMap\` doesn't know how to go through ${showShort(c)}${c && c.con && cx.cons[c.con] ? ` — there's no \`instance Foldable ${cx.cons[c.con].typeName}\`` : ''}.`);
  return r === MEMPTY && mT ? memptyT(mT) : r;
}
function toListG(tKey, c) {
  const key = tKey || valueKey(c, cx.classes.Foldable);
  if (key === '[]' || c === MEMPTY) return toList(c);
  if (key === 'Maybe') return c.con === 'Just' ? [c.args[0]] : [];
  if (key === 'Either') return c.con === 'Right' ? [c.args[0]] : []; // a Left holds no items: length (Left 1) is 0
  const own = libMethodOf('Foldable', key, 'toList'); if (own) return apply(own, c);
  const r = foldMapG(key, null, mkFn(x => [x]), c); return r === MEMPTY ? [] : r;
}
// built-in instances
{
  const S = BUILTIN_CLASSES.Semigroup.instances, M = BUILTIN_CLASSES.Monoid.instances, F = BUILTIN_CLASSES.Foldable.instances;
  const inst = (key, methods, ctx = [], extra = {}) => Object.assign({ key, builtin: true, methods, ctx }, extra);
  const both = (key, op, empty, ctxS = [], ctxM = ctxS, extra = {}) => { S[key] = inst(key, { '<>': prim(2, op, '<>') }, ctxS, extra); if (empty !== undefined) M[key] = inst(key, { mempty: empty }, ctxM, extra); };
  const asM = m => isPure(m) ? Just(m.pureOf) : m;
  both('[]', append, []);
  both('Maybe', (a, b) => { a = asM(a); b = asM(b); return a.con === 'Nothing' ? b : b.con === 'Nothing' ? a : Just(sappend(a.args[0], b.args[0])); }, { con: 'Nothing', args: [] }, [['Semigroup', 0]]);
  both('Ordering', (a, b) => a.con === 'EQ' ? b : a, { con: 'EQ', args: [] });
  both('()', () => UNIT, UNIT);
  both('(,)', (a, b) => ({ tuple: a.tuple.map((x, i) => sappend(x, b.tuple[i])) }), MEMPTY, [0, 1, 2, 3].map(i => ['Semigroup', i]), [0, 1, 2, 3].map(i => ['Monoid', i]));
  const nt = (con, v) => ({ con, args: [v] });
  const f0 = v => force(v.args[0]);
  both('Sum', (a, b) => nt('Sum', f0(a) + f0(b)), nt('Sum', 0), [['Num', 0]], [['Num', 0]], { libType: true });
  both('Product', (a, b) => nt('Product', f0(a) * f0(b)), nt('Product', 1), [['Num', 0]], [['Num', 0]], { libType: true });
  both('Min', (a, b) => cmp(f0(a), f0(b)) <= 0 ? a : b, undefined, [['Ord', 0]], [], { libType: true });
  both('Max', (a, b) => cmp(f0(a), f0(b)) >= 0 ? a : b, undefined, [['Ord', 0]], [], { libType: true });
  both('Any', (a, b) => nt('Any', f0(a) || f0(b)), nt('Any', false), [], [], { libType: true });
  both('All', (a, b) => nt('All', f0(a) && f0(b)), nt('All', true), [], [], { libType: true });
  F['[]'] = inst('[]', {}); F.Maybe = inst('Maybe', {}); F.Either = inst('Either', {});
  const T = BUILTIN_CLASSES.Traversable.instances; T['[]'] = inst('[]', {}); T.Maybe = inst('Maybe', {}); T.Either = inst('Either', {});
}
// is v the mempty of its type? (used when comparing with the MEMPTY placeholder)
function isEmptyish(v) {
  v = force(v);
  if (v === MEMPTY) return true;
  if (isListV(v)) return takeN(v, 1).length === 0;
  if (v && v.tuple) return v.tuple.every(isEmptyish);
  if (v && v.con) {
    if (v.con === 'Nothing' || v.con === 'EQ') return true;
    const k = cx.cons[v.con] && cx.cons[v.con].typeName; const inst = k && cx.classes.Monoid && cx.classes.Monoid.instances[k];
    if (inst) { const e = memptyT(TC(k)); return e !== MEMPTY && deepEq(v, e); }
  }
  return false;
}
// Applicative / Monad helpers for any monad: the type checker tells us which one (key), or we look at the values.
function traverseG(key, f, xs, keep = true) {
  const l = toList(foldArg(xs, 'traverse'), 'traverse'); const done = out => keep ? out : UNIT;
  if (!l.length) return pureG(key, done([]));
  if (key === 'IO') return io(rt => done(l.map(x => runAction(apply(f, x), rt))));
  const first = apply(f, l[0]);
  if (!key && first && first.io) return io(rt => { const out = [runAction(first, rt)]; for (let i = 1; i < l.length; i++) out.push(runAction(apply(f, l[i]), rt)); return done(out); });
  const mayb = r => r && (r.con === 'Just' || r.con === 'Nothing'), eith = r => r && (r.con === 'Left' || r.con === 'Right');
  if (key === 'Maybe' || key === 'Either' || (!key && (mayb(first) || eith(first)))) {
    const out = []; let isE = key === 'Either' || eith(first);
    for (let i = 0; i < l.length; i++) {
      const r = i ? apply(f, l[i]) : first; if (isPure(r)) { out.push(force(r.pureOf)); continue; }
      if (eith(r)) isE = true;
      if (r.con === 'Nothing' || r.con === 'Left') return r;
      out.push(force(r.args[0]));
    }
    return { con: isE ? 'Right' : 'Just', args: [done(out)] };
  }
  // lists, your own monads: (:) <$> f x <*> rest, from the right
  const cons = keep ? mkFn(h => mkFn(t => [h, ...toList(t)])) : mkFn(() => mkFn(u => u));
  let acc = pureG(key, done([]));
  for (let i = l.length - 1; i >= 0; i--) acc = apG(fmapG(cons, i ? apply(f, l[i]) : first), acc);
  return acc;
}
// traverse / sequenceA / mapM / sequence over any Traversable. tKey is the container (from the type checker, or
// else from the value), fKey the Applicative. Lists use the list code above; Maybe and Either hold at most one
// item; your own types use your traverse, or your sequenceA after an fmap.
function traverseT(tKey, fKey, f, c, name) {
  c = force(c);
  const key = tKey || (isListV(c) || c === MEMPTY ? '[]' : valueKey(c, cx.classes.Traversable));
  if (key === '[]') return traverseG(fKey, f, c);
  if (isPure(c)) return fmapG(mkFn(y => PURE(y)), apply(f, c.pureOf)); // pure x, container not known yet
  if (key === 'Maybe' || key === 'Either') {
    if (c.con === 'Nothing' || c.con === 'Left') return pureG(fKey, c); // nothing inside: traverse f Nothing is pure Nothing
    return fmapG(mkFn(y => ({ con: c.con, args: [y] })), apply(f, c.args[0]));
  }
  const ti = key && cx.classes.Traversable.instances[key];
  if (!ti) throw new HsError(`\`${name}\` doesn't know how to go through ${showShort(c)}${c && c.con && cx.cons[c.con] ? ` — there's no \`instance Traversable ${cx.cons[c.con].typeName}\`` : ''}.`);
  const own = instFn(ti, 'traverse'), seqA = instFn(ti, 'sequenceA');
  const r = own ? apply(apply(own, f), c) : apply(seqA, fmapG(f, c));
  return fKey && isPure(r) ? pureG(fKey, r.pureOf) : r; // pure End inside your instance becomes Just End once we know it's Maybe
}
const idFn = mkFn(x => x);
const LIBFN = {
  '<>': () => prim(2, sappend, '<>'),
  mappend: t => prim(2, (a, b) => { const own = libMethodOf('Monoid', keyOfT(t), 'mappend'); return own ? apply(apply(own, a), b) : sappend(a, b); }, 'mappend'),
  mempty: t => memptyT(t),
  mconcat: t => prim(1, xs => { const own = libMethodOf('Monoid', keyOfT(t), 'mconcat'); return own ? apply(own, xs) : mconcatT(t, xs); }, 'mconcat'),
  foldMap: (t, ex) => prim(2, (f, c) => foldMapG(keyOfT(t), ex && ex.m, f, c), 'foldMap'),
  toList: t => prim(1, c => toListG(keyOfT(t), c), 'toList'),
  traverse: (t, ex) => prim(2, (f, c) => traverseT(keyOfT(t), keyOfT(ex && ex.f), f, c, 'traverse'), 'traverse'),
  sequenceA: (t, ex) => prim(1, c => traverseT(keyOfT(t), keyOfT(ex && ex.f), idFn, c, 'sequenceA'), 'sequenceA'),
  mapM: (t, ex) => prim(2, (f, c) => traverseT(keyOfT(t), keyOfT(ex && ex.m), f, c, 'mapM'), 'mapM'),
  forM: (t, ex) => prim(2, (c, f) => traverseT(keyOfT(t), keyOfT(ex && ex.m), f, c, 'forM'), 'forM'),
  sequence: (t, ex) => prim(1, c => traverseT(keyOfT(t), keyOfT(ex && ex.m), idFn, c, 'sequence'), 'sequence'),
  traverse_: t => prim(2, (f, xs) => traverseG(keyOfT(t), f, xs, false), 'traverse_'),
  mapM_: t => prim(2, (f, xs) => traverseG(keyOfT(t), f, xs, false), 'mapM_'),
  forM_: t => prim(2, (xs, f) => traverseG(keyOfT(t), f, xs, false), 'forM_'),
  sequence_: t => prim(1, xs => traverseG(keyOfT(t), mkFn(x => x), xs, false), 'sequence_'),
  when: t => prim(2, (b, a) => b ? a : pureG(keyOfT(t), UNIT), 'when'),
  unless: t => prim(2, (b, a) => b ? pureG(keyOfT(t), UNIT) : a, 'unless'),
  replicateM: t => prim(2, (n, a) => { if (n > 100000) throw new HsError('That is a lot of repeats! Try a smaller number.'); return traverseG(keyOfT(t), mkFn(() => a), Array.from({ length: Math.max(0, n) }, (_, i) => i)); }, 'replicateM'),
  replicateM_: t => prim(2, (n, a) => { if (n > 100000) throw new HsError('That is a lot of repeats! Try a smaller number.'); return traverseG(keyOfT(t), mkFn(() => a), Array.from({ length: Math.max(0, n) }, (_, i) => i), false); }, 'replicateM_'),
  foldM: t => prim(3, (f, z, xs) => { const l = toList(xs, 'foldM'); const go = (i, acc) => i === l.length ? pureG(keyOfT(t), acc) : bindG(apply(apply(f, acc), l[i]), mkFn(b => go(i + 1, b))); return go(0, z); }, 'foldM'),
};
// Which code to run for a class method: decided by the type the type checker found, or else by looking at the value.
function methodValue(ref) {
  if (ref.lib && LIBFN[ref.name]) return LIBFN[ref.name](ref.cv, ref.ex);
  const ci = cx.classes[ref.cls], name = ref.name;
  let key = null; if (ref.cv) { const t = prune(ref.cv); if (!isVar(t) && !t.rigid && t.con !== '@') key = t.con; }
  if (ci.hkt && !ci.user) {
    if (name === 'pure' || name === 'return') return mkFn(x => pureG(key, force(x)), name);
    if (key && !['Maybe', '[]', 'Either', 'IO'].includes(key) && ci.instances[key] && instFn(ci.instances[key], name)) return instFn(ci.instances[key], name);
    return HKT_FN[name];
  }
  if (key && ci.instances[key]) return implFor(ci, key, name);
  return dynamicMethod(ci, name);
}
function implFor(ci, key, name) {
  const inst = ci.instances[key];
  const f = instFn(inst, name) || (ci.defaultFns && ci.defaultFns[name] && forceVal(ci.defaultFns[name]));
  if (f) return f;
  throw new HsError(`\`instance ${ci.name} ${key}\` has no definition for \`${name}\`.`);
}
function valueKey(v, ci) {
  v = force(v);
  const c = [];
  if (typeof v === 'number') c.push(...(Number.isInteger(v) ? ['Int', 'Double'] : ['Double', 'Int']));
  else if (typeof v === 'boolean') c.push('Bool');
  else if (typeof v === 'string') { if (v.length === 1) c.push('Char'); c.push('[]'); }
  else if (Array.isArray(v) || isL(v)) c.push('[]');
  else if (v && v.tuple) c.push(v.tuple.length ? '(,)' : '()');
  else if (v && v.con) c.push(cx.cons[v.con] ? cx.cons[v.con].typeName : ({ Nothing: 'Maybe', Just: 'Maybe', Left: 'Either', Right: 'Either', LT: 'Ordering', EQ: 'Ordering', GT: 'Ordering' }[v.con]));
  else if (v && v.io) c.push('IO');
  return c.find(k => ci.instances[k]) || null;
}
function dynamicMethod(ci, name) {
  const pos = ci.dispatch[name] || [], ar = ci.arity[name] || 0;
  if (!pos.length || !ar) throw new HsError(`Haskell Town can't tell which instance of \`${ci.name}\` to use for \`${name}\` here. Add a type annotation, like (${name} :: YourType).`);
  return prim(ar, (...args) => {
    for (const p of pos) { const key = valueKey(args[p], ci); if (key) return args.reduce((f, a) => apply(f, a), implFor(ci, key, name)); }
    throw new HsError(`There's no instance of \`${ci.name}\` for ${showShort(args[pos[0]])}.`);
  }, name, [...Array(ar).keys()].filter(i => !pos.includes(i))); // only the arguments that pick the instance are forced
}
const BINOPS = {
  '+': prim(2, (a, b) => a + b), '-': prim(2, (a, b) => a - b), '*': prim(2, (a, b) => a * b),
  '/': prim(2, (a, b) => { if (b === 0) throw new HsError('Division by zero!'); return a / b; }),
  '^': prim(2, (a, b) => { if (b < 0) throw new HsError('Negative exponent: ^ only works with exponents of 0 or more.'); return Math.pow(a, b); }),
  '==': prim(2, (a, b) => deepEq(a, b)), '/=': prim(2, (a, b) => !deepEq(a, b)),
  '<': prim(2, (a, b) => cmp(a, b) < 0), '<=': prim(2, (a, b) => cmp(a, b) <= 0), '>': prim(2, (a, b) => cmp(a, b) > 0), '>=': prim(2, (a, b) => cmp(a, b) >= 0),
  '++': prim(2, append),
  ':': prim(2, (x, xs) => { x = peek(x); return isL(xs) ? cell(x, xs) : (typeof xs === 'string' && typeof x === 'string' && x.length === 1) ? x + xs : [x, ...spine(xs, '(:)')]; }, ':', [0]),
  '!!': prim(2, (xs, n) => { const l = spine(xs, '!!'); if (n < 0 || n >= l.length) throw new HsError(`Index ${n} is too large — the list only has ${l.length} items (counting from 0).`); return l[n]; }),
  '&&': prim(2, (a, b) => a && force(b), '&&', [1]), '||': prim(2, (a, b) => a || force(b), '||', [1]),
  '.': prim(3, (f, g, x) => apply(f, new Thunk(() => apply(g, x))), '.', [2]), '$': prim(2, (f, x) => apply(f, x), '$', [1]),
  '>>=': prim(2, (m, f) => bindG(m, f)), '>>': prim(2, (a, b) => bindG(a, mkFn(() => b))),
  '<$>': prim(2, (f, m) => fmapG(f, m)), '<*>': prim(2, (mf, mx) => apG(mf, mx)),
};
const PRELUDE = {};
const PRELUDE_ARITY = {};
const def = (name, arity, f, lazy) => { PRELUDE[name] = prim(arity, f, name, lazy); PRELUDE_ARITY[name] = arity; };
const needNonEmpty = (l, name) => { if (!l.length) throw new HsError(`${name} was called on an empty list — there's nothing there to take!`); return l; };
def('length', 1, xs => spine(xs).length);
def('sum', 1, xs => toList(xs).reduce((a, b) => a + b, 0));
def('product', 1, xs => toList(xs).reduce((a, b) => a * b, 1));
def('map', 2, (f, xs) => fromLike(xs, spine(xs).map(x => apply(f, x))));
def('filter', 2, (p, xs) => fromLike(xs, spine(xs).filter(x => apply(p, x))));
// foldr f z (x:xs) = f x (foldr f z xs), with the rest of the fold as a thunk: f only works it out if it needs it,
// so foldr (\x _ -> x) 0 [1..] is 1 and foldr can build an endless list. A function that needs the whole rest
// (foldr (+) 0 [1..100000]) nests one call per item; if that overflows the stack, the fold is done again from
// the right end instead, which takes no stack (working everything out is fine then: it was all needed anyway).
def('foldr', 3, (f, z, xs) => {
  const at = (v, i) => {
    if (v instanceof LCons) return apply(apply(f, v.h), new Thunk(() => at(force(v.tail()), 0)));
    if (v === MEMPTY || i >= v.length) return z;
    return apply(apply(f, v[i]), new Thunk(() => at(v, i + 1)));
  };
  try { return at(xs, 0); } catch (e) { if (!(e instanceof RangeError)) throw e; }
  const l = spine(xs, 'foldr'); let acc = z; for (let i = l.length - 1; i >= 0; i--) acc = apply(apply(f, l[i]), acc); return acc;
}, [1]);
def('foldl', 3, (f, z, xs) => { let acc = z; for (const x of spine(xs)) acc = apply(apply(f, acc), x); return acc; });
def('null', 1, xs => spine(xs).length === 0);
def('head', 1, xs => needNonEmpty(spine(xs), 'head')[0]);
def('tail', 1, xs => fromLike(xs, needNonEmpty(spine(xs), 'tail').slice(1)));
def('last', 1, xs => { const l = needNonEmpty(spine(xs), 'last'); return l[l.length - 1]; });
def('init', 1, xs => fromLike(xs, needNonEmpty(spine(xs), 'init').slice(0, -1)));
def('reverse', 1, xs => fromLike(xs, [...spine(xs)].reverse()));
def('elem', 2, (x, xs) => spine(xs).some(y => deepEq(x, y)));
def('notElem', 2, (x, xs) => !spine(xs).some(y => deepEq(x, y)));
def('take', 2, (n, xs) => fromLike(xs, spine(xs).slice(0, Math.max(0, n))));
def('drop', 2, (n, xs) => fromLike(xs, spine(xs).slice(Math.max(0, n))));
def('maximum', 1, xs => needNonEmpty(toList(xs), 'maximum').reduce((a, b) => cmp(a, b) >= 0 ? a : b));
def('minimum', 1, xs => needNonEmpty(toList(xs), 'minimum').reduce((a, b) => cmp(a, b) <= 0 ? a : b));
def('max', 2, (a, b) => cmp(a, b) >= 0 ? a : b); def('min', 2, (a, b) => cmp(a, b) <= 0 ? a : b);
def('even', 1, n => n % 2 === 0); def('odd', 1, n => Math.abs(n % 2) === 1);
def('not', 1, b => !b);
def('show', 1, v => show(v));
def('concat', 1, xss => toList(xss).reduce((a, b) => append(a, b), []));
def('concatMap', 2, (f, xs) => spine(xs).map(x => apply(f, x)).reduce((a, b) => append(a, b), []));
def('zip', 2, (a, b) => { const x = spine(a), y = spine(b); return x.slice(0, Math.min(x.length, y.length)).map((e, i) => ({ tuple: [e, y[i]] })); });
def('zipWith', 3, (f, a, b) => { const x = spine(a), y = spine(b); return x.slice(0, Math.min(x.length, y.length)).map((e, i) => apply(apply(f, e), y[i])); });
def('replicate', 2, (n, x) => { if (n > 100000) throw new HsError('That is a lot of copies! Try a smaller number.'); return Array(Math.max(0, n)).fill(x); }, [1]);
def('fst', 1, t => tup(t)[0]); def('snd', 1, t => tup(t)[1]);
def('id', 1, x => x); def('const', 2, (a, _b) => a, [1]); def('flip', 3, (f, a, b) => apply(apply(f, b), a), [1, 2]);
def('seq', 2, (_a, b) => b, [1]); // seq forces its first argument (as every built-in does) and hands back the second
def('abs', 1, n => Math.abs(n)); def('negate', 1, n => -n); def('subtract', 2, (a, b) => b - a);
// ---- Enum and Bounded (Glaschu's bakehouse) ----
// Numbers count by 1; everything else (Char, Bool, Ordering, (), your own data Day = Mon | Tue | … deriving (Enum, Bounded))
// is turned into its position (fromEnum), counted, and turned back (toEnum). minBound, maxBound and toEnum pick their
// type from what the type checker found, like read does.
const ORDERING = ['LT', 'EQ', 'GT'];
const INT_MAX = Number.MAX_SAFE_INTEGER, INT_MIN = Number.MIN_SAFE_INTEGER;
function enumKey(v) { // which Enum type a (non-number) value belongs to
  if (typeof v === 'string' && v.length && v.length === String.fromCodePoint(v.codePointAt(0)).length) return 'Char'; // one character, even past \uFFFF
  if (typeof v === 'boolean') return 'Bool';
  if (v && v.tuple && !v.tuple.length) return '()';
  if (v && v.con) return ORDERING.includes(v.con) ? 'Ordering' : cx.cons[v.con] && cx.cons[v.con].typeName;
  return null;
}
const enumNames = key => key === 'Ordering' ? ORDERING : cx.types[key] && cx.types[key].cons;
const enumLast = key => key === 'Char' ? 0x10FFFF : key === 'Bool' ? 1 : key === '()' ? 0 : enumNames(key).length - 1;
function fromEnumV(v) {
  v = force(v);
  if (typeof v === 'number') return Math.trunc(v);
  const key = enumKey(v);
  if (key === 'Char') return v.codePointAt(0);
  if (key === 'Bool') return v ? 1 : 0;
  if (key === '()') return 0;
  if (key && enumNames(key)) return enumNames(key).indexOf(v.con);
  throw new HsError(`${showShort(v)} can't be counted — only numbers, characters, Bools and types with deriving (Enum) can.`);
}
function toEnumKey(key, i, who = 'toEnum') {
  if (key === 'Int' || key === 'Double') return i;
  if (!Number.isInteger(i) || i < 0 || i > enumLast(key)) {
    if (key === 'Char') throw new HsError(`${who} ${i}: there's no character with that number.`);
    throw new HsError(`${who} ${i}: \`${key}\` only has ${enumLast(key) + 1} value${enumLast(key) ? 's' : ''}, numbered 0 to ${enumLast(key)}.`);
  }
  if (key === 'Char') return String.fromCodePoint(i);
  if (key === 'Bool') return i === 1;
  if (key === '()') return UNIT;
  return { con: enumNames(key)[i], args: [] };
}
function succPred(v, by) {
  v = force(v);
  if (typeof v === 'number') return v + by;
  const key = enumKey(v), i = fromEnumV(v) + by;
  if (i < 0 || i > enumLast(key)) {
    const s = key === 'Char' ? showT(v, TC('Char')) : show(v);
    throw new HsError(by > 0 ? `succ ${s}: ${s} is the last ${key}, so there's nothing after it.` : `pred ${s}: ${s} is the first ${key}, so there's nothing before it.`);
  }
  return toEnumKey(key, i);
}
def('succ', 1, v => succPred(v, 1)); def('pred', 1, v => succPred(v, -1));
def('fromEnum', 1, fromEnumV);
// [a ..], [a, b ..], [a .. z] and [a, b .. z]. Number ranges without an end go on forever; the others stop at the last value.
function enumRange(first, then, to) {
  first = force(first);
  const key = typeof first === 'number' ? null : enumKey(first);
  const num = v => key ? fromEnumV(v) : force(v), item = x => key ? toEnumKey(key, x) : x;
  const a = num(first), step = then !== undefined ? num(then) - a : 1;
  if (to === undefined) {
    if (!key || step === 0) { const go = x => new LCons(item(x), () => go(x + step)); return go(a); } // [1..] and [1, 3 ..] go on forever
    to = item(step > 0 ? enumLast(key) : 0); // [Mon ..] stops at the last day, [Sun, Fri ..] at the first
  }
  const z = num(to);
  if (step === 0) throw new HsError('That range never moves forward, so it would go on forever.');
  if (key) { // a finite range of characters or constructors, built lazily
    const go = x => (step > 0 ? x <= z : x >= z) ? new LCons(item(x), () => go(x + step)) : [];
    return go(a);
  }
  const out = [];
  for (let x = a; step > 0 ? x <= z : x >= z; x += step) { out.push(x); if (out.length > 100000) throw new HsError('That range is too big for this little town (over 100,000 items).'); }
  return out;
}
def('enumFrom', 1, a => enumRange(a));
def('enumFromThen', 2, (a, b) => enumRange(a, b));
def('enumFromTo', 2, (a, z) => enumRange(a, undefined, z));
def('enumFromThenTo', 3, (a, b, z) => enumRange(a, b, z));
const cantTell = name => new HsError(`Haskell Town can't tell which type's \`${name}\` you mean here. Add a type annotation, like (${name}${name === 'toEnum' ? ' 3' : ''} :: Day).`);
function boundOf(t, which) {
  t = prune(t);
  if (isVar(t) || t.rigid) throw cantTell(which);
  if (t.con === '(,)') return { tuple: t.args.map(a => boundOf(a, which)) };
  if (t.con === 'Int') return which === 'minBound' ? INT_MIN : INT_MAX;
  return toEnumKey(t.con, which === 'minBound' ? 0 : enumLast(t.con));
}
function toEnumT(t, i) {
  t = prune(t);
  if (isVar(t) || t.rigid) throw cantTell('toEnum');
  return toEnumKey(t.con, i);
}
const dz = b => { if (b === 0) throw new HsError('Division by zero!'); return b; };
def('div', 2, (a, b) => Math.floor(a / dz(b)));
def('mod', 2, (a, b) => { b = dz(b); return ((a % b) + b) % b; });
def('quot', 2, (a, b) => Math.trunc(a / dz(b)));
def('rem', 2, (a, b) => a % dz(b));
def('fromIntegral', 1, n => n);
def('error', 1, s => { throw new HsError(`error: ${isListV(s) ? strOf(s) : show(s)}`); });
def('words', 1, s => strOf(s).split(/\s+/).filter(Boolean)); def('unwords', 1, ws => toList(ws).map(strOf).join(' '));
def('lines', 1, s => { const r = strOf(s).split('\n'); if (r[r.length - 1] === '') r.pop(); return r; }); def('unlines', 1, ls => toList(ls).map(l => strOf(l) + '\n').join(''));
def('all', 2, (p, xs) => spine(xs).every(x => apply(p, x))); def('any', 2, (p, xs) => spine(xs).some(x => apply(p, x)));
def('and', 1, xs => toList(xs).every(x => x)); def('or', 1, xs => toList(xs).some(x => x));
def('putStrLn', 1, s => io(rt => { emit(rt, strOf(s) + '\n'); return UNIT; }));
def('putStr', 1, s => io(rt => { emit(rt, strOf(s)); return UNIT; }));
def('print', 1, v => io(rt => { emit(rt, show(v) + '\n'); return UNIT; }));
PRELUDE.getLine = io(rt => { if (rt.pos >= rt.input.length) throw new HsError('getLine found no more input — the program asked for more lines than were typed in.'); return rt.input[rt.pos++]; });
def('return', 1, x => PURE(x)); def('pure', 1, x => PURE(x)); def('fmap', 2, (f, m) => fmapG(f, m));
def('compare', 2, (a, b) => { const c = cmp(a, b); return { con: c < 0 ? 'LT' : c > 0 ? 'GT' : 'EQ', args: [] }; });
const asMaybe = m => (m = force(m), isPure(m)) ? { con: 'Just', args: [m.pureOf] } : m;
def('fromMaybe', 2, (d, m) => { m = asMaybe(m); return m.con === 'Just' ? m.args[0] : d; }, [0]);
def('catMaybes', 1, xs => toList(xs).map(asMaybe).filter(m => m.con === 'Just').map(m => force(m.args[0])));
def('mapMaybe', 2, (f, xs) => spine(xs).map(x => asMaybe(apply(f, x))).filter(m => m.con === 'Just').map(m => force(m.args[0])));
def('isJust', 1, m => asMaybe(m).con === 'Just'); def('isNothing', 1, m => asMaybe(m).con === 'Nothing');
def('either', 3, (f, g, e) => isPure(e) ? apply(g, e.pureOf) : e.con === 'Left' ? apply(f, e.args[0]) : apply(g, e.args[0]));
def('mapM_', 2, (f, xs) => io(rt => { for (const x of spine(xs)) runAction(apply(f, x), rt); return UNIT; }));
def('forM_', 2, (xs, f) => io(rt => { for (const x of spine(xs)) runAction(apply(f, x), rt); return UNIT; }));
def('mapM', 2, (f, xs) => io(rt => spine(xs).map(x => runAction(apply(f, x), rt))));
def('when', 2, (b, a) => b ? a : io(() => UNIT), [1]);
def('read', 1, s => readT(strOf(s), null));
def('lookup', 2, (k, xs) => { const hit = toList(xs).find(p => deepEq(p.tuple[0], k)); return hit ? { con: 'Just', args: [hit.tuple[1]] } : { con: 'Nothing', args: [] }; });
def('maybe', 3, (d, f, m) => { m = asMaybe(m); return m.con === 'Just' ? apply(f, m.args[0]) : d; }, [0]);
def('sort', 1, xs => fromLike(xs, [...toList(xs)].sort(cmp)));
def('sortOn', 2, (f, xs) => fromLike(xs, spine(xs).map(x => [apply(f, x), x]).sort((a, b) => cmp(a[0], b[0])).map(p => p[1])));
def('takeWhile', 2, (p, xs) => { const l = spine(xs); let i = 0; while (i < l.length && apply(p, l[i])) i++; return fromLike(xs, l.slice(0, i)); });
def('dropWhile', 2, (p, xs) => { const l = spine(xs); let i = 0; while (i < l.length && apply(p, l[i])) i++; return fromLike(xs, l.slice(i)); });
def('splitAt', 2, (n, xs) => { const l = spine(xs); return { tuple: [fromLike(xs, l.slice(0, Math.max(0, n))), fromLike(xs, l.slice(Math.max(0, n)))] }; });
def('toUpper', 1, c => c.toUpperCase()); def('toLower', 1, c => c.toLowerCase());
def('isDigit', 1, c => /^[0-9]$/.test(c)); def('isAlpha', 1, c => /^[A-Za-z]$/.test(c)); def('isUpper', 1, c => /^[A-Z]$/.test(c)); def('isLower', 1, c => /^[a-z]$/.test(c)); def('isSpace', 1, c => /^\s$/.test(c));
def('ord', 1, c => c.charCodeAt(0)); def('chr', 1, n => String.fromCharCode(n));
def('digitToInt', 1, c => { if (!/^[0-9a-fA-F]$/.test(c)) throw new HsError(`digitToInt: '${c}' is not a digit.`); return parseInt(c, 16); });
def('replicateM_', 2, (n, a) => io(rt => { for (let i = 0; i < n; i++) runAction(a, rt); return UNIT; }));
for (const k in LIBFN) PRELUDE[k] = LIBFN[k](null);
// Lazy-aware versions: on a lazy (maybe endless) list they only look at as much as they need.
// On plain finite lists they keep the old, fast behaviour.
{
  const lz = (name, arity, lazyF) => { const old = PRELUDE[name]; const pos = arity - 1; PRELUDE[name] = prim(arity, (...a) => isL(a[pos]) ? lazyF(...a) : a.slice(0, arity).reduce((f, x) => apply(f, x), old), name); };
  lz('map', 2, (f, xs) => lazyGen(function* () { for (const x of iter(xs)) yield apply(f, x); }));
  lz('filter', 2, (p, xs) => lazyGen(function* () { for (const x of iter(xs)) if (apply(p, x)) yield x; }));
  lz('concatMap', 2, (f, xs) => lazyGen(function* () { for (const x of iter(xs)) yield* iter(apply(f, x)); }));
  lz('concat', 1, xss => lazyGen(function* () { for (const xs of iter(xss)) yield* iter(xs); }));
  lz('take', 2, (n, xs) => takeN(xs, n));
  lz('drop', 2, (n, xs) => { let v = xs, i = 0; while (i < n && isL(v)) { v = v.tail(); i++; } return isL(v) ? v : fromLike(v, toList(v).slice(n - i)); });
  lz('splitAt', 2, (n, xs) => ({ tuple: [apply(apply(PRELUDE.take, n), xs), apply(apply(PRELUDE.drop, n), xs)] }));
  lz('takeWhile', 2, (p, xs) => { const out = []; for (const x of iter(xs)) { if (!apply(p, x)) break; out.push(x); } return out; });
  lz('dropWhile', 2, (p, xs) => { let v = xs, n = 0; while (isL(v) && apply(p, v.h)) { v = v.tail(); if (++n > LAZY_LIMIT) throw tooLong(); } return isL(v) ? v : apply(apply(PRELUDE.dropWhile, p), v); });
  lz('head', 1, xs => xs.h);
  lz('tail', 1, xs => xs.tail());
  lz('null', 1, () => false);
  lz('elem', 2, (x, xs) => { for (const y of iter(xs)) if (deepEq(x, y)) return true; return false; });
  lz('notElem', 2, (x, xs) => { for (const y of iter(xs)) if (deepEq(x, y)) return false; return true; });
  lz('any', 2, (p, xs) => { for (const x of iter(xs)) if (apply(p, x)) return true; return false; });
  lz('all', 2, (p, xs) => { for (const x of iter(xs)) if (!apply(p, x)) return false; return true; });
  lz('and', 1, xs => { for (const x of iter(xs)) if (!force(x)) return false; return true; });
  lz('or', 1, xs => { for (const x of iter(xs)) if (force(x)) return true; return false; });
  lz('lookup', 2, (k, xs) => { for (let p of iter(xs)) if (deepEq((p = force(p)).tuple[0], k)) return Just(p.tuple[1]); return { con: 'Nothing', args: [] }; });
  // zip and zipWith stop at the shorter list, so either one may be endless
  const zipL = (f, a, b) => (isL(a) || isL(b)) ? lazyGen(function* () { const ib = iter(b); for (const x of iter(a)) { const r = ib.next(); if (r.done) return; yield f(x, r.value); } }) : null;
  const oldZip = PRELUDE.zip, oldZipWith = PRELUDE.zipWith;
  PRELUDE.zip = prim(2, (a, b) => zipL((x, y) => ({ tuple: [x, y] }), a, b) || apply(apply(oldZip, a), b), 'zip');
  PRELUDE.zipWith = prim(3, (f, a, b) => zipL((x, y) => apply(apply(f, x), y), a, b) || apply(apply(apply(oldZipWith, f), a), b), 'zipWith');
  const oldIdx = BINOPS['!!'];
  BINOPS['!!'] = prim(2, (xs, n) => { if (!isL(xs)) return apply(apply(oldIdx, xs), n); if (n < 0) throw new HsError('!! needs an index of 0 or more.'); const h = takeN(xs, n + 1); if (h.length <= n) throw new HsError(`Index ${n} is too large — the list only has ${h.length} items (counting from 0).`); return h[n]; });
  BINOPS['++'] = prim(2, append);
}
// ---- Foldable ----
// sum, length, elem, foldr … take any Foldable: anything that isn't already a list (Maybe, Either, your own
// instance) is first turned into one with toList, and then the list code runs as before. Lists, strings and
// lazy lists go straight through, so endless lists keep working and nothing is copied.
function foldArg(v, name) {
  v = force(v);
  if (isListV(v) || v === MEMPTY) return v;
  if (isPure(v)) return [v.pureOf];
  if (v && v.con && valueKey(v, cx.classes.Foldable)) return toListG(null, v);
  throw new HsError(`${name} expects a list, but was given ${showShort(v)}.`);
}
{
  const FOLDABLE_ARG = { length: [1, 0], null: [1, 0], sum: [1, 0], product: [1, 0], maximum: [1, 0], minimum: [1, 0], and: [1, 0], or: [1, 0], concat: [1, 0],
    elem: [2, 1], notElem: [2, 1], all: [2, 1], any: [2, 1], concatMap: [2, 1], foldr: [3, 2], foldl: [3, 2] }; // name: [arity, which argument is the container]
  for (const [name, [arity, pos]] of Object.entries(FOLDABLE_ARG)) {
    const listFn = PRELUDE[name];
    const needsItem = name === 'maximum' || name === 'minimum';
    PRELUDE[name] = prim(arity, (...a) => {
      const c = force(a[pos]); a[pos] = foldArg(c, name);
      if (needsItem && a[pos] !== c && !spine(a[pos]).length) throw new HsError(`${name} was given ${showShort(c)}, which holds nothing — there's nothing there to take!`);
      return a.reduce((f, x) => apply(f, x), listFn);
    }, name, name === 'foldr' ? [1] : undefined);
  }
}
// endless lists
def('repeat', 1, x => { const c = new LCons(x, null); c.done = true; c.t = c; return c; }, [0]);
def('cycle', 1, xs => { if (!takeN(xs, 1).length) throw new HsError('cycle was given an empty list — there is nothing to repeat!'); return lazyGen(function* () { for (;;) yield* iter(xs); }); });
def('iterate', 2, (f, x) => { const go = v => new LCons(v, () => go(apply(f, v))); return go(x); });
def('scanl', 3, (f, z, xs) => lazyGen(function* () { let acc = z; yield acc; for (const x of iter(xs)) { acc = apply(apply(f, acc), x); yield acc; } }));
def('scanl1', 2, (f, xs) => lazyGen(function* () { let first = true, acc; for (const x of iter(xs)) { acc = first ? x : apply(apply(f, acc), x); first = false; yield acc; } }));
PRELUDE.otherwise = true;
PRELUDE.undefined = new Thunk(() => { throw new HsError("Reached `undefined` — this part of the function hasn't been written yet. Replace undefined with your own code!", 'undefined'); });

function conValue(name) {
  if (name === 'True') return true; if (name === 'False') return false;
  if (name === 'Nothing' || name === 'LT' || name === 'EQ' || name === 'GT') return { con: name, args: [] };
  const ar = cx.cons[name] ? cx.cons[name].arity : 1;
  if (ar === 0) return { con: name, args: [] };
  return prim(ar, (...xs) => ({ con: name, args: xs }), name, [...Array(ar).keys()]); // fields stay lazy
}
function lookup(env, name) {
  if (!(name in env)) throw new HsError(`I don't know anything called \`${name}\`.`);
  const v = env[name];
  if (v instanceof Thunk && v.running) throw new HsError(`\`${name}\` is defined in terms of itself, so its value can never be worked out.`, 'loop');
  return force(v);
}
function directed(name, t) {
  if (name === 'minBound' || name === 'maxBound') return boundOf(t, name);
  const f = prune(t), a = f.args[0], r = f.args[1];
  if (name === 'show') return mkFn(v => showT(v, a), 'show');
  if (name === 'print') return mkFn(v => io(rt => { emit(rt, showT(v, a) + '\n'); return UNIT; }), 'print');
  if (name === 'toEnum') return prim(1, i => toEnumT(r, i), 'toEnum');
  return mkFn(s => readT(strOf(s), r), 'read');
}
function opFunction(op, env) { return BINOPS[op] || lookup(env, op); }

// Matching only forces as much of the value as the pattern needs: a variable or _ doesn't look at it at all.
function match(p, v, b) {
  if (p.p === 'var') { b[p.name] = v; return true; }
  if (p.p === 'wild') return true;
  v = force(v);
  switch (p.p) {
    case 'lit': return p.lt === 'str' && isListV(v) && typeof v !== 'string' ? (takeN(v, p.v.length + 1).map(force).join('') === p.v) : v === p.v;
    case 'con':
      if (p.name === 'True') return v === true; if (p.name === 'False') return v === false;
      if (v === MEMPTY) return p.name === 'Nothing' || p.name === 'EQ';
      if (isPure(v) && (p.name === 'Just' || p.name === 'Right')) v = { con: p.name, args: [v.pureOf] };
      return !!v && v.con === p.name && p.args.every((q, i) => match(q, v.args[i], b));
    case 'tuple': return p.items.length === 0 || p.items.every((q, i) => match(q, v.tuple[i], b));
    case 'list': { const l = isL(v) ? takeN(v, p.items.length + 1) : toList(v); return l.length === p.items.length && p.items.every((q, i) => match(q, l[i], b)); }
    case 'cons': {
      if (isL(v)) return match(p.h, v.h, b) && match(p.t, v.tail(), b);
      if (v === MEMPTY) return false;
      if (Array.isArray(v)) return v.length > 0 && match(p.h, v[0], b) && match(p.t, v.length > 32 ? arrTail(v, 1) : v.slice(1), b);
      return v.length > 0 && match(p.h, v[0], b) && match(p.t, v.slice(1), b);
    }
  }
  return false;
}
// for error messages: an argument that was never needed may not be worth working out (it could be undefined)
const showArg = a => { try { return paren(showShort(a)); } catch { return '_'; } };
function makeFunction(name, eqs, env) {
  const arity = eqs[0].pats.length;
  const run = args => {
    for (const eq of eqs) {
      const b = Object.create(env);
      if (!eq.pats.every((p, i) => match(p, args[i], b))) continue;
      if (eq.where) bindGroup(eq.where.defs, b);
      if (eq.guards) { for (const [g, e] of eq.guards) { if (evalE(g, b)) return evalE(e, b); } continue; }
      return evalE(eq.body, b);
    }
    const empty = args.some(a => { a = peek(a); return (Array.isArray(a) && !a.length) || a === ''; });
    throw new HsError(`None of the equations for \`${name}\` match the input ${args.map(showArg).join(' ')}. Is there a case you haven't covered yet${empty ? ', like the empty list []' : ''}?`, 'nomatch');
  };
  if (arity === 0) return new Thunk(() => run([]));
  const go = args => mkFn(a => { const nx = [...args, a]; return nx.length === arity ? run(nx) : go(nx); }, name);
  return go([]);
}
function bindGroup(defs, env) { for (const name in defs) env[name] = makeFunction(name, defs[name], env); }

// a do block is a chain of >>= : each line's result is passed on to the rest of the block
function evalDo(stmts, i, env) {
  const st = stmts[i];
  if (st.let) { const e3 = Object.create(env); bindGroup(st.let.defs, e3); return evalDo(stmts, i + 1, e3); }
  const m = evalE(st.e, env);
  if (i === stmts.length - 1) return m;
  return bindG(m, mkFn(v => {
    if (!st.bind) return evalDo(stmts, i + 1, env);
    const b = Object.create(env);
    if (match(st.bind, v, b)) return evalDo(stmts, i + 1, b);
    if (isListy(m)) return [];
    if (m && (m.con === 'Just' || m.con === 'Nothing')) return { con: 'Nothing', args: [] };
    throw new HsError(`Line ${st.line}: the pattern before <- didn't match ${showShort(v)}.`);
  }));
}
// ---- delaying an expression ----
// An argument or a field is wrapped in a Thunk, so it's only worked out if it's needed: const 1 undefined is 1.
// Expressions that are cheap and can't go wrong (a number, a variable that's already known, acc + x on
// known numbers, building a constructor) are worked out straight away instead. That keeps accumulators
// like go (acc + x) xs from piling up a long chain of thunks that would overflow the stack later.
const NOT_CHEAP = Symbol('not cheap');
const SAFE_ARITH = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b };
const SAFE_CMP = ['==', '/=', '<', '<=', '>', '>='];
// built-ins that can't fail or loop when given plain numbers, characters or Bools
const SAFE_FNS = new Set(['max', 'min', 'not', 'abs', 'negate', 'even', 'odd', 'succ', 'pred', 'subtract', 'fromIntegral', 'compare',
  'toUpper', 'toLower', 'isDigit', 'isAlpha', 'isUpper', 'isLower', 'isSpace', 'ord']);
const isPrimV = v => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length === 1);
const known = v => v !== NOT_CHEAP && !(v instanceof Thunk);
function cheap(e, env) {
  switch (e.k) {
    case 'lit': return e.v;
    case 'paren': case 'ann': return cheap(e.e, env);
    case 'var': {
      if (e.mref || e.st || !(e.name in env)) return NOT_CHEAP;
      const v = env[e.name];
      return v instanceof Thunk ? (v.done ? force(v) : v) : v; // an unworked thunk is shared, not wrapped again
    }
    case 'con': return conValue(e.name);
    case 'lam': return evalE(e, env);
    case 'neg': { const v = cheap(e.e, env); return typeof v === 'number' ? -v : NOT_CHEAP; }
    case 'tuple': return e.items.length ? { tuple: e.items.map(i => delay(i, env)) } : UNIT;
    case 'bin': {
      if (e.mref) return NOT_CHEAP;
      if (SAFE_ARITH[e.op]) {
        const a = cheap(e.l, env); if (typeof a !== 'number') return NOT_CHEAP;
        const b = cheap(e.r, env); return typeof b === 'number' ? SAFE_ARITH[e.op](a, b) : NOT_CHEAP;
      }
      if (e.op === ':') return new LCons(delay(e.l, env), () => evalE(e.r, env));
      if (e.op === '++' || SAFE_CMP.includes(e.op)) {
        const a = cheap(e.l, env); if (!known(a)) return NOT_CHEAP;
        const b = cheap(e.r, env); if (!known(b)) return NOT_CHEAP;
        if (e.op === '++') return isListV(a) && isListV(b) ? append(a, b) : NOT_CHEAP;
        return isPrimV(a) && typeof a === typeof b ? apply(apply(BINOPS[e.op], a), b) : NOT_CHEAP;
      }
      return NOT_CHEAP;
    }
    case 'list': return e.items.map(i => delay(i, env)); // like a constructor: built straight away, each item delayed
    case 'app': {
      const args = []; let h = e; while (h.k === 'app') { args.unshift(h.a); h = h.f; } while (h.k === 'paren') h = h.e;
      // a safe built-in like max x m, on known plain values
      if (h.k === 'var' && !h.mref && !h.st && SAFE_FNS.has(h.name) && env[h.name] === PRELUDE[h.name] && args.length === PRELUDE_ARITY[h.name]) {
        const vs = []; for (const a of args) { const v = cheap(a, env); if (!known(v) || !isPrimV(v) || ((h.name === 'succ' || h.name === 'pred') && typeof v !== 'number')) return NOT_CHEAP; vs.push(v); }
        return vs.reduce((f, v) => apply(f, v), PRELUDE[h.name]);
      }
      // a constructor given all its fields: build it, with each field delayed
      if (h.k !== 'con' || ['True', 'False', 'Nothing', 'LT', 'EQ', 'GT'].includes(h.name)) return NOT_CHEAP;
      const ar = cx.cons[h.name] ? cx.cons[h.name].arity : 1;
      return args.length === ar ? { con: h.name, args: args.map(a => delay(a, env)) } : NOT_CHEAP;
    }
  }
  return NOT_CHEAP;
}
function delay(e, env) { const v = cheap(e, env); return v === NOT_CHEAP ? new Thunk(() => evalE(e, env)) : v; }

// evalE is kept small on purpose: it is on the stack once per level of your recursion, so a smaller
// frame means deeper recursion fits. The less common expressions are worked out in evalRest.
function evalE(n, env) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'var': return n.mref || n.st ? evalRest(n, env) : lookup(env, n.name);
    case 'paren': case 'ann': return evalE(n.e, env);
    case 'app': return apply(evalE(n.f, env), delay(n.a, env));
    case 'bin': return evalBin(n, env);
    case 'if': return evalE(evalE(n.c, env) ? n.t : n.e, env);
    case 'case': return evalCase(n, env);
  }
  return evalRest(n, env);
}
function evalBin(n, env) {
  const op = n.op;
  if (n.mref) return apply(apply(methodValue(n.mref), delay(n.l, env)), delay(n.r, env));
  switch (op) {
    case '&&': return evalE(n.l, env) ? evalE(n.r, env) : false;
    case '||': return evalE(n.l, env) ? true : evalE(n.r, env);
    case '$': return apply(evalE(n.l, env), delay(n.r, env));
    case ':': return new LCons(delay(n.l, env), () => evalE(n.r, env)); // the item and the rest of the list wait until they're needed
    case '.': { const f = evalE(n.l, env), g = delay(n.r, env); return mkFn(x => apply(f, new Thunk(() => apply(g, x)))); }
  }
  // built-in operators look at both sides anyway; your own operators get them lazily
  const b = BINOPS[op];
  if (b) return apply(apply(b, evalE(n.l, env)), evalE(n.r, env));
  return apply(apply(lookup(env, op), delay(n.l, env)), delay(n.r, env));
}
function evalCase(n, env) {
  const v = evalE(n.scrut, env);
  for (const alt of n.alts) {
    const b = Object.create(env);
    if (!match(alt.pat, v, b)) continue;
    if (alt.guards) { for (const [g, e] of alt.guards) if (evalE(g, b)) return evalE(e, b); continue; }
    return evalE(alt.body, b);
  }
  throw new HsError(`None of the case patterns match ${showShort(v)}. Is there a case you haven't covered yet?`, 'nomatch');
}
function evalRest(n, env) {
  switch (n.k) {
    case 'var': return n.mref ? methodValue(n.mref) : directed(n.name, n.st);
    case 'con': return conValue(n.name);
    case 'rec': { const info = cx.cons[n.con]; const args = new Array(info.arity); for (const [f, e] of n.fields) args[info.fieldNames.indexOf(f)] = delay(e, env); return { con: n.con, args }; }
    case 'upd': {
      const v = evalE(n.e, env); const info = cx.cons[v.con]; const args = [...v.args];
      for (const [f, e] of n.fields) { const i = info && info.fieldNames ? info.fieldNames.indexOf(f) : -1; if (i < 0) throw new HsError(`This ${v.con} value has no field \`${f}\`.`); args[i] = delay(e, env); }
      return { con: v.con, args };
    }
    case 'comp': { // made lazily, item by item, so [x * 2 | x <- [1..]] works
      const go = function* (i, e2) {
        if (i === n.quals.length) { yield evalE(n.e, e2); return; }
        const q = n.quals[i];
        if (q.let) { const e3 = Object.create(e2); bindGroup(q.let.defs, e3); yield* go(i + 1, e3); }
        else if (q.guard) { if (evalE(q.guard, e2)) yield* go(i + 1, e2); }
        else for (const v of iter(evalE(q.src, e2), 'The source after <-')) { const b = Object.create(e2); if (match(q.gen, v, b)) yield* go(i + 1, b); }
      };
      return fromIter(go(0, env));
    }
    case 'do': return evalDo(n.stmts, 0, env);
    case 'hole': throw new HsError("There's still a ___ blank to fill in. Replace it with your own code.", 'hole');
    case 'list': return n.items.map(i => delay(i, env));
    case 'tuple': return n.items.length ? { tuple: n.items.map(i => delay(i, env)) } : UNIT;
    case 'range': {
      const first = evalE(n.from, env);
      return enumRange(first, n.then ? evalE(n.then, env) : undefined, n.to ? evalE(n.to, env) : undefined);
    }
    case 'neg': return -evalE(n.e, env);
    case 'opfn': return n.mref ? methodValue(n.mref) : opFunction(n.op, env);
    case 'lsec': { const v = delay(n.e, env), f = n.mref ? methodValue(n.mref) : opFunction(n.op, env); return mkFn(y => apply(apply(f, v), y)); }
    case 'rsec': { const v = delay(n.e, env), f = n.mref ? methodValue(n.mref) : opFunction(n.op, env); return mkFn(x => apply(apply(f, x), v)); }
    case 'lam': return makeFunction('this lambda', [{ pats: n.pats, body: n.body, line: 0 }], env);
    case 'let': { const e2 = Object.create(env); bindGroup(n.defs, e2); return evalE(n.body, e2); }
  }
  throw new HsError('Something unexpected happened while running your code.');
}

export { PRELUDE, bindGroup, deepEq, evalE, lookup, makeFunction, prim, runAction, show, showT };
