// Types: representation, unification, pretty-printing, type syntax, and the Prelude's type environment.
// Type variables record cx.level (for let-generalisation); class checks read the program's data context in cx.
import { BUILTIN_CLASSES, cx } from './context.js';
import { HsError } from './errors.js';
import { tokenize } from './lexer.js';
import { FIX, TypeParser } from './parser.js';

const BUILTIN_SUPERS = { Ord: ['Eq'], Fractional: ['Num'], Applicative: ['Functor'], Monad: ['Applicative'] };
const supersOf = c => (cx.classes[c] && cx.classes[c].supers) || BUILTIN_SUPERS[c] || [];
function superClosure(c) { const out = []; const go = x => supersOf(x).forEach(y => { if (!out.includes(y)) { out.push(y); go(y); } }); go(c); return out; }
const entails = (set, c) => set.has(c) || [...set].some(x => superClosure(x).includes(c));
const tvar = cls => ({ tv: cx.nextTv++, ref: null, cls: new Set(cls || []), level: cx.level });
const TC = (con, ...args) => ({ con, args });
const tInt = TC('Int'), tBool = TC('Bool'), tChar = TC('Char'), tDouble = TC('Double'), tUnit = TC('()');
const tList = a => TC('[]', a), tFun = (a, b) => TC('->', a, b), tTup = as => TC('(,)', ...as), tString = () => tList(tChar);
const isVar = t => t.tv !== undefined;
function prune(t) {
  while (isVar(t) && t.ref) t = t.ref;
  if (t.con === '@') { const h = prune(t.args[0]); if (!isVar(h) && !h.rigid && h.con !== '@') return { con: h.con, args: [...h.args, t.args[1]] }; } // (Maybe) applied to a  ==>  Maybe a
  return t;
}

class UFail { constructor(kind, info) { this.kind = kind; this.info = info; } }
function occursAdjust(v, t) { t = prune(t); if (t === v) return true; if (isVar(t)) { if (t.level > v.level) t.level = v.level; return false; } return t.args.some(a => occursAdjust(v, a)); }
function requireCls(c, t) {
  t = prune(t);
  if (isVar(t)) { t.cls.add(c); return; }
  if (t.rigid) { if (entails(t.cls, c)) return; throw new UFail('rigidcls', { c, t }); }
  const k = t.con;
  if (k === '@') { if (isVar(prune(t.args[0]))) return; throw new UFail('class', { c, t }); }
  const ci = cx.classes[c];
  if (ci && (ci.user || ci.hkt)) { // your own classes, and Functor / Applicative / Monad
    const inst = ci.instances[k];
    if (!inst) throw new UFail('noinst', { c, t });
    (inst.ctx || []).forEach(([c2, i]) => { if (t.args[i]) requireCls(c2, t.args[i]); });
    return;
  }
  if (c === 'Num') { if (k === 'Int' || k === 'Double') return; throw new UFail('class', { c, t }); }
  if (c === 'Fractional') { if (k === 'Double') return; throw new UFail('class', { c, t }); }
  if (c === 'Read') { if (['Int', 'Double', 'Bool'].includes(k)) return; throw new UFail('class', { c, t }); }
  const ut = cx.types[k];
  if (ut) {
    const ui = ci && ci.instances[k];
    if (ui) { (ui.ctx || []).forEach(([c2, i]) => { if (t.args[i]) requireCls(c2, t.args[i]); }); return; }
    if (!ut.deriving.has(c) && !(c === 'Eq' && (ut.deriving.has('Ord') || (cx.classes.Ord && cx.classes.Ord.instances[k])))) throw new UFail('deriving', { c, t });
    t.args.forEach(a => requireCls(c, a)); return;
  }
  if (['Int', 'Double', 'Bool', 'Char', '()', '[]', '(,)', 'Maybe', 'Either', 'Ordering'].includes(k)) { t.args.forEach(a => requireCls(c, a)); return; }
  throw new UFail('class', { c, t });
}
function bindV(v, t) {
  if (occursAdjust(v, t)) throw new UFail('occurs');
  t = prune(t);
  if (isVar(t)) v.cls.forEach(c => t.cls.add(c)); else v.cls.forEach(c => requireCls(c, t));
  v.ref = t;
}
function unify(a, b) {
  a = prune(a); b = prune(b); if (a === b) return;
  if (isVar(a)) return bindV(a, b);
  if (isVar(b)) return bindV(b, a);
  if (a.con === '@' || b.con === '@') { // a type applied to an argument, like  f a  (f could become Maybe, [] or IO)
    if (a.con !== '@') [a, b] = [b, a];
    if (b.con === '@') { unify(a.args[0], b.args[0]); unify(a.args[1], b.args[1]); return; }
    if (b.rigid || !b.args.length) throw new UFail('mismatch');
    unify(a.args[0], { con: b.con, args: b.args.slice(0, -1) });
    unify(a.args[1], b.args[b.args.length - 1]);
    return;
  }
  if (a.con !== b.con || a.args.length !== b.args.length || a.rigid || b.rigid) throw new UFail('mismatch');
  for (let i = 0; i < a.args.length; i++) unify(a.args[i], b.args[i]);
}

// ---- pretty printing ----
function namer() {
  const m = new Map(), used = new Set();
  const f = (t, pref) => { if (!m.has(t)) { let n = pref && !used.has(pref) ? pref : null; for (let i = 0; !n; i++) { const c = String.fromCharCode(97 + i); if (!used.has(c)) n = c; } m.set(t, n); used.add(n); } return m.get(t); };
  f.has = t => m.has(t); return f;
}
function pp(t, nm, prec = 0, friendly = false) {
  t = prune(t);
  if (isVar(t)) {
    if (friendly && t.cls.has('Fractional')) return 'a fractional number';
    if (friendly && t.cls.has('Num')) return 'a number';
    if (friendly && (t.cls.has('Monad') || t.cls.has('Applicative') || t.cls.has('Functor')) && !nm.has(t)) return nm(t, t.cls.has('Monad') ? 'm' : 'f');
    return nm(t);
  }
  if (t.rigid) return t.con;
  const f = friendly;
  if (t.con === '@') { const s = pp(t.args[0], nm, 2, f) + ' ' + pp(t.args[1], nm, 2, f); return prec > 1 ? '(' + s + ')' : s; }
  if (t.con === '[]' && !t.args.length) return '[]';
  if (t.con === '[]') { const e = prune(t.args[0]); return !isVar(e) && e.con === 'Char' ? 'String' : '[' + pp(e, nm, 0, f) + ']'; }
  if (t.con === '(,)') return '(' + t.args.map(a => pp(a, nm, 0, f)).join(', ') + ')';
  if (t.con === '->') { const s = pp(t.args[0], nm, 1, f) + ' -> ' + pp(t.args[1], nm, 0, f); return prec > 0 ? '(' + s + ')' : s; }
  if (!t.args.length) return t.con;
  const s = t.con + ' ' + t.args.map(a => pp(a, nm, 2, f)).join(' '); return prec > 1 ? '(' + s + ')' : s;
}
function ppScheme(s) {
  const nm = namer(); const body = pp(s.type, nm); const cs = [];
  const seen = new Set(); const walk = t => { t = prune(t); if (isVar(t)) { if (!seen.has(t)) { seen.add(t); [...t.cls].forEach(c => { if (!(c === 'Eq' && t.cls.has('Ord')) && !(c === 'Num' && t.cls.has('Fractional'))) cs.push(`${c} ${nm(t)}`); }); } } else t.args.forEach(walk); };
  walk(s.type); cs.sort();
  return (cs.length ? (cs.length > 1 ? '(' + cs.join(', ') + ')' : cs[0]) + ' => ' : '') + body;
}

// ---- type syntax ----
const TYPE_ARITY = { Int: 0, Integer: 0, Double: 0, Float: 0, Bool: 0, Char: 0, String: 0, Maybe: 1, Either: 2, IO: 1, Ordering: 0 };
const KNOWN_CLASSES = ['Num', 'Fractional', 'Eq', 'Ord', 'Show', 'Integral', 'Read'];
function parseTypeToks(toks) {
  const line = toks[0] ? toks[0].line : null;
  const fail = m => { throw new HsError(`${line ? `Line ${line}: ` : ''}${m}`, 'type', line); };
  let i = 0; const is = (t, v) => toks[i] && toks[i].t === t && (v === undefined || toks[i].v === v);
  const ctx = []; const arrow = toks.findIndex(t => t.t === 'op' && t.v === '=>');
  if (arrow >= 0) {
    for (let k = 0; k < arrow; k++) if (toks[k].t === 'con') {
      const v = toks[k + 1]; if (!v || v.t !== 'id') fail(`In the constraint before =>, write a class then a type variable, like Num a.`);
      if (!KNOWN_CLASSES.includes(toks[k].v) && !cx.classes[toks[k].v] && !cx.pendingClasses.has(toks[k].v)) fail(`I don't know the type class \`${toks[k].v}\`. Try Num, Eq, Ord, Show, Functor or Monad — or define it with \`class\`.`);
      ctx.push([toks[k].v === 'Integral' ? 'Num' : toks[k].v, v.v]);
    }
    i = arrow + 1;
  }
  const tp = new TypeParser(toks, i);
  const ast = tp.fun(); if (tp.i < toks.length) fail(`I didn't expect \`${toks[tp.i].v}\` in this type.`);
  return { ctx, ast, line };
}
function buildType(ast, getVar, line, depth = 0) {
  const L = line ? `Line ${line}: ` : '';
  if (depth > 40) throw new HsError(`${L}this type synonym refers to itself forever. A \`type\` can't be recursive — use \`data\` for that.`, 'type', line);
  if (ast.k === 'var') return getVar(ast.name);
  if (ast.k === 'vapp') return ast.args.reduce((acc, a) => TC('@', acc, buildType(a, getVar, line, depth)), getVar(ast.name));
  if (ast.k === 'fun') return tFun(buildType(ast.a, getVar, line, depth), buildType(ast.b, getVar, line, depth));
  const args = ast.args.map(a => buildType(a, getVar, line, depth));
  if (ast.name === '[]') return tList(args[0]);
  if (ast.name === '(,)') return tTup(args);
  if (ast.name === '()') return tUnit;
  const syn = cx.syn[ast.name];
  if (syn) {
    if (args.length !== syn.params.length) throw new HsError(`${L}the type synonym \`${ast.name}\` needs ${syn.params.length} type argument${syn.params.length === 1 ? '' : 's'}.`, 'type', line);
    const m = {}; syn.params.forEach((p, i) => { m[p] = args[i]; });
    return buildType(syn.ast, n => { if (!m[n]) throw new HsError(`Line ${syn.line}: the type variable \`${n}\` must be listed after \`type ${ast.name}\`.`, 'type', syn.line); return m[n]; }, line, depth + 1);
  }
  const ut = cx.types[ast.name];
  if (ut) {
    if (args.length !== ut.params.length) throw new HsError(`${L}\`${ast.name}\` ${ut.params.length ? `needs ${ut.params.length} type argument${ut.params.length > 1 ? 's' : ''}, like ${ast.name} Int` : 'takes no type arguments'}.`, 'type', line);
    return TC(ast.name, ...args);
  }
  const ar = TYPE_ARITY[ast.name];
  if (ar === undefined) throw new HsError(`${L}I don't know a type called \`${ast.name}\`. Types you can use: Int, Double, Bool, Char, String, lists like [Int], Maybe, Either, IO — or one you define yourself with \`data\`.`, 'type', line);
  if (args.length !== ar) throw new HsError(`${line ? `Line ${line}: ` : ''}\`${ast.name}\` ${ar ? `needs ${ar} type argument${ar > 1 ? 's' : ''}, like ${ast.name} Int` : 'takes no type arguments'}.`, 'type', line);
  if (ast.name === 'Integer') return tInt; if (ast.name === 'Float') return tDouble;
  if (ast.name === 'String') return tString();
  return TC(ast.name, ...args);
}
function sigScheme(toks) {
  const { ctx, ast, line } = parseTypeToks(toks);
  cx.level++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  cx.level--;
  ctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
  return { qs: Object.values(vars), type };
}
function skolemize(toks) {
  const { ctx, ast, line } = parseTypeToks(toks); const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = { con: n, args: [], rigid: true, cls: new Set() }), line);
  ctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
  return type;
}
const typeFromString = s => sigScheme(tokenize(s));
function instantiateWith(s) {
  const m = new Map(s.qs.map(q => [q, tvar([...q.cls])]));
  if (!s.qs.length) return { type: s.type, map: m };
  const copy = t => { t = prune(t); if (isVar(t)) return m.get(t) || t; if (!t.args.length) return t; return { con: t.con, args: t.args.map(copy) }; };
  return { type: copy(s.type), map: m };
}
const instantiate = s => instantiateWith(s).type;
// A class method's type: the class's type variable carries the class constraint, and we remember which variable it is.
function methodSchemeAst(ast, mctx, line, cls, param) {
  cx.level++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  cx.level--;
  mctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
  if (!vars[param]) throw new HsError(`${line ? `Line ${line}: ` : ''}a method of class \`${cls}\` must mention the class's type variable \`${param}\` in its type.`, 'type', line);
  vars[param].cls.add(cls);
  return { qs: Object.values(vars), type, method: { cls, param: vars[param] } };
}
const methodScheme = (str, cls, param) => { const { ctx, ast, line } = parseTypeToks(tokenize(str)); return methodSchemeAst(ast, ctx, line, cls, param); };
function generalize(t) {
  const qs = []; const walk = x => { x = prune(x); if (isVar(x)) { if (x.level > cx.level && !qs.includes(x)) qs.push(x); } else x.args.forEach(walk); };
  walk(t); return { qs, type: t };
}

const PRELUDE_TYPES = {
  length: '[a] -> Int', sum: 'Num a => [a] -> a', product: 'Num a => [a] -> a', map: '(a -> b) -> [a] -> [b]', filter: '(a -> Bool) -> [a] -> [a]',
  foldr: '(a -> b -> b) -> b -> [a] -> b', foldl: '(b -> a -> b) -> b -> [a] -> b', null: '[a] -> Bool', head: '[a] -> a', last: '[a] -> a',
  tail: '[a] -> [a]', init: '[a] -> [a]', reverse: '[a] -> [a]', elem: 'Eq a => a -> [a] -> Bool', notElem: 'Eq a => a -> [a] -> Bool',
  take: 'Int -> [a] -> [a]', drop: 'Int -> [a] -> [a]', maximum: 'Ord a => [a] -> a', minimum: 'Ord a => [a] -> a', max: 'Ord a => a -> a -> a', min: 'Ord a => a -> a -> a',
  even: 'Int -> Bool', odd: 'Int -> Bool', not: 'Bool -> Bool', show: 'Show a => a -> String', concat: '[[a]] -> [a]', concatMap: '(a -> [b]) -> [a] -> [b]',
  zip: '[a] -> [b] -> [(a, b)]', zipWith: '(a -> b -> c) -> [a] -> [b] -> [c]', replicate: 'Int -> a -> [a]', fst: '(a, b) -> a', snd: '(a, b) -> b',
  id: 'a -> a', const: 'a -> b -> a', flip: '(a -> b -> c) -> b -> a -> c', abs: 'Num a => a -> a', negate: 'Num a => a -> a', subtract: 'Num a => a -> a -> a',
  succ: 'Int -> Int', pred: 'Int -> Int', div: 'Int -> Int -> Int', mod: 'Int -> Int -> Int', quot: 'Int -> Int -> Int', rem: 'Int -> Int -> Int',
  fromIntegral: 'Num b => Int -> b', error: 'String -> a', words: 'String -> [String]', unwords: '[String] -> String', lines: 'String -> [String]', unlines: '[String] -> String',
  all: '(a -> Bool) -> [a] -> Bool', any: '(a -> Bool) -> [a] -> Bool', and: '[Bool] -> Bool', or: '[Bool] -> Bool', otherwise: 'Bool', undefined: 'a',
  putStrLn: 'String -> IO ()', putStr: 'String -> IO ()', print: 'Show a => a -> IO ()', getLine: 'IO String', return: 'a -> IO a', pure: 'a -> IO a',
  mapM_: '(a -> IO b) -> [a] -> IO ()', forM_: '[a] -> (a -> IO b) -> IO ()', mapM: '(a -> IO b) -> [a] -> IO [b]', when: 'Bool -> IO () -> IO ()',
  read: 'Read a => String -> a', compare: 'Ord a => a -> a -> Ordering',
  fromMaybe: 'a -> Maybe a -> a', catMaybes: '[Maybe a] -> [a]', mapMaybe: '(a -> Maybe b) -> [a] -> [b]', isJust: 'Maybe a -> Bool', isNothing: 'Maybe a -> Bool', either: '(a -> c) -> (b -> c) -> Either a b -> c', lookup: 'Eq a => a -> [(a, b)] -> Maybe b', maybe: 'b -> (a -> b) -> Maybe a -> b', sortOn: 'Ord b => (a -> b) -> [a] -> [a]', sort: 'Ord a => [a] -> [a]',
  toUpper: 'Char -> Char', toLower: 'Char -> Char', isDigit: 'Char -> Bool', isAlpha: 'Char -> Bool', isUpper: 'Char -> Bool', isLower: 'Char -> Bool', isSpace: 'Char -> Bool',
  ord: 'Char -> Int', chr: 'Int -> Char', digitToInt: 'Char -> Int', replicateM_: 'Int -> IO a -> IO ()',
  repeat: 'a -> [a]', cycle: '[a] -> [a]', iterate: '(a -> a) -> a -> [a]', scanl: '(b -> a -> b) -> b -> [a] -> [b]', scanl1: '(a -> a -> a) -> [a] -> [a]',
  takeWhile: '(a -> Bool) -> [a] -> [a]', dropWhile: '(a -> Bool) -> [a] -> [a]', splitAt: 'Int -> [a] -> ([a], [a])',
};
const OP_TYPES = {
  '+': 'Num a => a -> a -> a', '-': 'Num a => a -> a -> a', '*': 'Num a => a -> a -> a', '/': 'Fractional a => a -> a -> a', '^': 'Num a => a -> Int -> a',
  '==': 'Eq a => a -> a -> Bool', '/=': 'Eq a => a -> a -> Bool', '<': 'Ord a => a -> a -> Bool', '<=': 'Ord a => a -> a -> Bool', '>': 'Ord a => a -> a -> Bool', '>=': 'Ord a => a -> a -> Bool',
  '++': '[a] -> [a] -> [a]', ':': 'a -> [a] -> [a]', '!!': '[a] -> Int -> a', '&&': 'Bool -> Bool -> Bool', '||': 'Bool -> Bool -> Bool',
  '.': '(b -> c) -> (a -> b) -> a -> c', '$': '(a -> b) -> a -> b', '>>=': 'IO a -> (a -> IO b) -> IO b', '>>': 'IO a -> IO b -> IO b',
};
const CON_TYPES = { LT: 'Ordering', EQ: 'Ordering', GT: 'Ordering', True: 'Bool', False: 'Bool', Nothing: 'Maybe a', Just: 'a -> Maybe a', Left: 'a -> Either a b', Right: 'b -> Either a b' };
const TENV0 = Object.create(null); for (const k in PRELUDE_TYPES) TENV0[k] = typeFromString(PRELUDE_TYPES[k]);
const OPS0 = {}; for (const k in OP_TYPES) OPS0[k] = typeFromString(OP_TYPES[k]);
const CONS0 = {}; for (const k in CON_TYPES) CONS0[k] = typeFromString(CON_TYPES[k]);
// Built-in classes you can write instances for, with their methods' types.
const CLASS_DEFS = {
  Eq: { param: 'a', sigs: { '==': 'a -> a -> Bool', '/=': 'a -> a -> Bool' }, required: [['==', '/=']] },
  Ord: { param: 'a', sigs: { compare: 'a -> a -> Ordering', '<=': 'a -> a -> Bool', '<': 'a -> a -> Bool', '>': 'a -> a -> Bool', '>=': 'a -> a -> Bool', max: 'a -> a -> a', min: 'a -> a -> a' }, required: [['compare', '<=']] },
  Show: { param: 'a', sigs: { show: 'a -> String' }, required: [['show']] },
  Functor: { param: 'f', hkt: true, sigs: { fmap: '(a -> b) -> f a -> f b', '<$>': '(a -> b) -> f a -> f b' }, required: [['fmap']] },
  Applicative: { param: 'f', hkt: true, sigs: { pure: 'a -> f a', '<*>': 'f (a -> b) -> f a -> f b' }, required: [['pure'], ['<*>']] },
  Monad: { param: 'm', hkt: true, sigs: { '>>=': 'm a -> (a -> m b) -> m b', '>>': 'm a -> m b -> m b', return: 'a -> m a' }, required: [['>>=']] },
};
for (const [name, d] of Object.entries(CLASS_DEFS)) {
  const sigs = {}; for (const [m, str] of Object.entries(d.sigs)) { const { ctx, ast } = parseTypeToks(tokenize(str)); sigs[m] = { ast, mctx: ctx }; }
  const instances = {}; if (d.hkt) ['Maybe', '[]', 'Either', 'IO'].forEach(k => { instances[k] = { key: k, builtin: true, methods: {}, ctx: [] }; });
  BUILTIN_CLASSES[name] = { name, param: d.param, hkt: !!d.hkt, user: false, supers: BUILTIN_SUPERS[name] || [], sigs, required: d.required, instances, defaults: {}, dispatch: {}, arity: {} };
}
for (const [n, d] of Object.entries(CLASS_DEFS)) if (d.hkt) for (const [m, str] of Object.entries(d.sigs)) { const sc = methodScheme(str, n, d.param); if (OP_TYPES[m] || FIX[m]) OPS0[m] = sc; else TENV0[m] = sc; }

// ---- the Market's class library: Semigroup, Monoid, Foldable ----
// These behave like classes you write yourself (you can add instances for your own types), but come with
// built-in instances. Their methods live in the base environment, so your own top-level definitions can shadow them.
// libScheme also remembers extra type variables (like the m in foldMap), so the runtime can pick the right mempty.
function libScheme(str, cls, param, extra = []) {
  const { ctx, ast, line } = parseTypeToks(tokenize(str));
  cx.level++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  cx.level--;
  ctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
  vars[param].cls.add(cls);
  const ex = {}; extra.forEach(v => { ex[v] = vars[v]; });
  return { qs: Object.values(vars), type, method: { cls, param: vars[param], lib: true, extra: ex } };
}
const LIB_CLASS_DEFS = {
  Semigroup: { param: 'a', supers: [], sigs: { '<>': 'a -> a -> a' }, required: [['<>']] },
  Monoid: { param: 'a', supers: ['Semigroup'], sigs: { mempty: 'a', mappend: 'a -> a -> a', mconcat: '[a] -> a' }, required: [['mempty']] },
  Foldable: { param: 't', hkt: true, supers: [], sigs: { foldMap: 'Monoid m => (a -> m) -> t a -> m', toList: 't a -> [a]' }, required: [['foldMap']], extra: { foldMap: ['m'] } },
};
const LIB_CLASSES = Object.keys(LIB_CLASS_DEFS);
for (const [name, d] of Object.entries(LIB_CLASS_DEFS)) {
  const ci = { name, param: d.param, supers: d.supers, user: true, lib: true, hkt: !!d.hkt, sigs: {}, schemes: {}, defaults: {}, defaultFns: {}, instances: {}, dispatch: {}, arity: {}, required: d.required };
  BUILTIN_CLASSES[name] = ci;
  for (const [m, str] of Object.entries(d.sigs)) {
    const { ctx, ast } = parseTypeToks(tokenize(str)); ci.sigs[m] = { ast, mctx: ctx, line: null };
    const args = []; let a = ast; while (a.k === 'fun') { args.push(a.a); a = a.b; }
    ci.arity[m] = args.length;
    ci.dispatch[m] = args.map((x, i) => ((x.k === 'var' || x.k === 'vapp') && x.name === d.param) ? i : -1).filter(i => i >= 0);
    ci.schemes[m] = TENV0[m] = libScheme(str, name, d.param, (d.extra || {})[m]);
  }
}
// Prelude helpers that now work for any monad (or applicative), not only IO
const LIB_MONAD_TYPES = {
  mapM_: ['Monad', '(a -> m b) -> [a] -> m ()'], forM_: ['Monad', '[a] -> (a -> m b) -> m ()'], mapM: ['Monad', '(a -> m b) -> [a] -> m [b]'], forM: ['Monad', '[a] -> (a -> m b) -> m [b]'],
  sequence: ['Monad', '[m a] -> m [a]'], sequence_: ['Monad', '[m a] -> m ()'], traverse: ['Applicative', '(a -> m b) -> [a] -> m [b]'], traverse_: ['Applicative', '(a -> m b) -> [a] -> m ()'],
  when: ['Applicative', 'Bool -> m () -> m ()'], unless: ['Applicative', 'Bool -> m () -> m ()'], replicateM: ['Applicative', 'Int -> m a -> m [a]'], replicateM_: ['Applicative', 'Int -> m a -> m ()'],
  foldM: ['Monad', '(b -> a -> m b) -> b -> [a] -> m b'],
};
for (const [m, [cls, str]] of Object.entries(LIB_MONAD_TYPES)) TENV0[m] = libScheme(str, cls, 'm');
// newtypes that pick one way of combining: Sum 3 <> Sum 4 is Sum 7, Product 3 <> Product 4 is Product 12
const LIB_DATA_SRC = ['Sum', 'Product', 'Min', 'Max', 'Any', 'All'].map(n => `newtype ${n}${['Any', 'All'].includes(n) ? '' : ' a'} = ${n} { get${n} :: ${['Any', 'All'].includes(n) ? 'Bool' : 'a'} } deriving (Show, Eq, Ord)`).join('\n');


export { CONS0, LIB_CLASSES, LIB_DATA_SRC, OPS0, OP_TYPES, TC, TENV0, TYPE_ARITY, UFail, buildType, generalize, instantiate, instantiateWith, isVar, methodSchemeAst, namer, parseTypeToks, pp, ppScheme, prune, sigScheme, skolemize, tBool, tChar, tDouble, tFun, tList, tString, tTup, tUnit, tvar, unify };
