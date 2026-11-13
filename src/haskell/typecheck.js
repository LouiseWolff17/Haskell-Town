// Type checking: Hindley–Milner inference with type classes, and the friendly type error messages.
import { cx } from './context.js';
import { HsError } from './errors.js';
import { CONS0, OPS0, OP_TYPES, TC, TENV0, TYPE_ARITY, UFail, buildType, generalize, instantiate, instantiateWith, isVar, namer, parseTypeToks, pp, prune, sigScheme, skolemize, tBool, tChar, tFun, tList, tString, tTup, tUnit, tvar, unify } from './types.js';

const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const article = s => /^(a |an )/.test(s) ? s : (/^[AEIOU]/.test(s) ? 'an ' : 'a ') + '`' + s + '`';
function lineOf(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.line) return n.line;
  for (const k of ['f', 'l', 'e', 'c', 'scrut', 'body', 'from']) { const l = lineOf(n[k]); if (l) return l; }
  if (n.items && n.items.length) return lineOf(n.items[0]);
  return null;
}
function typeError(e, ctx, ppE, ppA, actWasVar, exp, act) {
  const L = ctx.line ? `Line ${ctx.line}: ` : '';
  const what = ctx.what || 'this expression';
  if (e.kind === 'occurs') return new HsError(`${L}${what} would need an infinite type. That usually means a list and one of its items got mixed up — for example writing xs : xs instead of x : xs.`, 'type', ctx.line);
  if (e.kind === 'rigidcls') {
    const { c, t } = e.info;
    const verb = { Num: 'arithmetic (like + or *)', Fractional: 'division with /', Eq: 'comparison with ==', Ord: 'ordering (like < or max)', Show: 'show' }[c];
    return new HsError(`${L}${what} uses ${verb} on values of type \`${t.con}\`, but the type signature doesn't promise that \`${t.con}\` supports it. Add \`${c} ${t.con} =>\` to the start of the signature, like: f :: ${c} ${t.con} => …`, 'type', ctx.line);
  }
  const VERB = { Show: 'shown (with show or print)', Eq: 'compared with ==', Ord: 'put in order (with <, max, sort …)', Read: 'read from text' };
  if (e.kind === 'noinst') {
    const { c, t } = e.info; const k = prune(t).con; const ci = cx.classes[c];
    const ut = cx.types[k]; const params = ut ? ut.params : [];
    const head = ci && ci.hkt ? k : (params.length ? `(${k} ${params.join(' ')})` : k);
    const m = ci ? Object.keys(ci.sigs)[0] : 'method';
    if (ci && ci.hkt && !(ut ? params.length : TYPE_ARITY[k])) return new HsError(`${L}${what} needs \`${k}\` to be a ${c}, but \`${k}\` doesn't take a type parameter, so it can't be one. ${c} is for “container” types like Maybe, lists or your own \`data Box a = …\`.`, 'type', ctx.line);
    if ((c === 'Semigroup' || c === 'Monoid') && (k === 'Int' || k === 'Double')) return new HsError(`${L}${what} needs \`${k}\` to be a ${c}, but numbers can be combined in two ways — adding or multiplying — so Haskell makes you choose. Wrap them: Sum 3 <> Sum 4 is Sum 7, Product 3 <> Product 4 is Product 12. Use getSum or getProduct to take the number back out.`, 'type', ctx.line);
    const zeroArg = ci && ci.arity && ci.arity[m] === 0;
    return new HsError(`${L}${what} needs \`${k}\` to be an instance of \`${c}\`, but there's no instance yet. Add one, like:\n  instance ${c} ${head} where\n    ${/^[a-z]/.test(m) ? m : '(' + m + ')'}${zeroArg ? '' : ' …'} = …`, 'type', ctx.line);
  }
  if (e.kind === 'deriving') {
    const { c, t } = e.info; const T = prune(t).con;
    return new HsError(`${L}${what} needs \`${T}\` values to be ${VERB[c]}, but \`${T}\` can't do that yet. Add \`deriving (${c})\` to the end of \`data ${T}\`, like: data ${T} = … deriving (${c})`, 'type', ctx.line);
  }
  if (e.kind === 'class' && (!actWasVar || e.info.c === 'Read') && ['Show', 'Eq', 'Ord', 'Read'].includes(e.info.c) && prune(e.info.t).con !== '->') {
    const { c, t } = e.info; const T = pp(t, namer());
    if (prune(t).con === 'IO') return new HsError(`${L}${what} is an IO action, and IO actions can't be ${VERB[c]}. Run it inside a do block instead, like: x <- action`, 'type', ctx.line);
    if (c === 'Read') return new HsError(`${L}\`read\` can turn text into an Int, a Double or a Bool, but here it would need to make ${article(T)}.`, 'type', ctx.line);
    return new HsError(`${L}values of type \`${T}\` can't be ${VERB[c]}.`, 'type', ctx.line);
  }
  if (e.kind === 'class' && !actWasVar && (ctx.op || e.info.c === 'Fractional' || e.info.c === 'Show' || e.info.c === 'Eq' || e.info.c === 'Ord')) {
    const { c, t } = e.info; const T = pp(t, namer());
    if (c === 'Num') return new HsError(`${L}${ctx.op ? '`' + ctx.op + '` works with numbers' : 'A number is needed here'}, but ${what} is ${article(T)}.${T === 'String' ? ' To join strings together, use ++.' : ''}${prune(t).con === '[]' && T !== 'String' ? " A list isn't a number — did you mean sum or length?" : ''}${prune(t).con === '->' ? ' Is a function missing its argument?' : ''}`, 'type', ctx.line);
    if (c === 'Fractional') return new HsError(`${L}\`/\` divides fractional numbers (like Double), but here it's used with ${article(T)}. For whole numbers, use \`div\` instead, like 7 \`div\` 2.`, 'type', ctx.line);
    return new HsError(`${L}${c === 'Show' ? "A function can't be shown" : "Functions can't be compared"} — ${what} is a function. Is it missing an argument?`, 'type', ctx.line);
  }
  let msg = `${L}Type mismatch in ${what}.\n  Expected: ${ppE}\n  Found:    ${ppA}`;
  const E = prune(exp), A = prune(act);
  const tips = [];
  if (!isVar(E) && !isVar(A)) {
    if (ctx.op && (E.con === 'IO') !== (A.con === 'IO')) tips.push(`A function call grabs its argument before \`${ctx.op}\` does, so putStrLn "a" ${ctx.op} b means (putStrLn "a") ${ctx.op} b. Put the whole thing in parentheses: putStrLn ("a" ${ctx.op} b).`);
    else if ((E.con === '->') !== (A.con === '->')) tips.push('A function may be missing an argument, or be given one too many.');
    else if ((ppE === 'Char' && ppA === 'String') || (ppE === 'String' && ppA === 'Char')) tips.push('"a" (double quotes) is a String; \'a\' (single quotes) is a single Char.');
    else if ((E.con === '[]') !== (A.con === '[]') && ppE !== 'String' && ppA !== 'String') tips.push('One of these is a list and the other is a single value.');
    else if ((E.con === 'Int' && A.con === 'Double') || (E.con === 'Double' && A.con === 'Int')) tips.push('Use fromIntegral to turn an Int into a Double.');
    if (E.rigid || A.rigid) tips.push(`The type signature says \`${(E.rigid ? E : A).con}\` could be any type, so the function can't assume it's something specific.`);
  } else if (!isVar(E) && E.rigid) tips.push(`The type signature says \`${E.con}\` could be any type, so the function can't assume it's something specific.`);
  if (tips.length) msg += '\nTip: ' + tips[0];
  return new HsError(msg, 'type', ctx.line);
}
function unifyAt(exp, act, ctx) {
  const nm = namer(); const ppE = pp(exp, nm, 0, true), ppA = pp(act, nm, 0, true);
  const pa = prune(act); const actWasVar = isVar(pa) && pa.cls.size > 0;
  try { unify(exp, act); }
  catch (e) { if (!(e instanceof UFail)) throw e; throw typeError(e, ctx, ppE, ppA, actWasVar, exp, act); }
}

// ---- inference ----
function suggestKey(env, name) {
  let best = null, bd = 3;
  for (const k in env) { if (k.length < 2) continue; const dd = lev(k.toLowerCase(), name.toLowerCase()); if (dd < bd) { bd = dd; best = k; } }
  return bd <= (name.length > 4 ? 2 : 1) ? best : null;
}
function lookupT(env, name, line) {
  if (!(name in env)) { const s = suggestKey(env, name); throw new HsError(`${line ? `Line ${line}: ` : ''}I don't know anything called \`${name}\`.${s ? ` Did you mean \`${s}\`?` : ''}`, 'scope', line); }
  return env[name];
}
function conScheme(name, line) {
  if (cx.cons[name]) return cx.cons[name].scheme;
  if (!CONS0[name]) throw new HsError(`${line ? `Line ${line}: ` : ''}I don't know a constructor called \`${name}\`. (Names starting with a capital letter are types or constructors; function names start lowercase.)`, 'scope', line);
  return CONS0[name];
}
const TYPE_DIRECTED = ['show', 'print', 'read'];
const litType = lt => lt === 'int' ? tvar(['Num']) : lt === 'float' ? tvar(['Fractional']) : lt === 'str' ? tString() : tChar;
function arrowCount(t) { let n = 0; t = prune(t); while (!isVar(t) && t.con === '->') { n++; t = prune(t.args[1]); } return n; }

function inferPat(p, binds, line) {
  switch (p.p) {
    case 'var': { if (binds[p.name]) throw new HsError(`${line ? `Line ${line}: ` : ''}\`${p.name}\` appears twice in the same pattern. Give each part its own name.`, 'type', line); return (binds[p.name] = tvar()); }
    case 'wild': return tvar();
    case 'lit': return litType(p.lt);
    case 'con': {
      let t = instantiate(conScheme(p.name, line)); const need = arrowCount(t);
      if (need !== p.args.length) throw new HsError(`${line ? `Line ${line}: ` : ''}In a pattern, \`${p.name}\` needs ${need} argument${need === 1 ? '' : 's'}${need ? `, like (${p.name} x)` : ''}.`, 'type', line);
      for (const a of p.args) { t = prune(t); unifyAt(t.args[0], inferPat(a, binds, line), { line, what: `this ${p.name} pattern` }); t = t.args[1]; }
      return t;
    }
    case 'tuple': return p.items.length ? tTup(p.items.map(x => inferPat(x, binds, line))) : tUnit;
    case 'list': { const el = tvar(); p.items.forEach(x => unifyAt(el, inferPat(x, binds, line), { line, what: 'this list pattern — every item must have the same type' })); return tList(el); }
    case 'cons': { const h = inferPat(p.h, binds, line); const t = inferPat(p.t, binds, line); unifyAt(tList(h), t, { line, what: 'the tail of this (x:xs) pattern' }); return t; }
  }
}
const monoEnv = (env, binds) => { const e = Object.create(env); for (const k in binds) e[k] = { qs: [], type: binds[k] }; return e; };

function applyArgs(fT, fname, args, env, line, descs, op) {
  let cur = fT;
  const L = line ? `Line ${line}: ` : '';
  { let t = prune(fT), n = 0; while (!isVar(t) && t.con === '->') { n++; t = prune(t.args[1]); }
    if (n > 0 && !isVar(t) && args.length > n) throw new HsError(`${L}\`${fname || 'this function'}\` is given ${args.length} arguments here, but it only takes ${n}.`, 'type', line); }
  args.forEach((a, i) => {
    let t = prune(cur);
    if (isVar(t)) {
      try { unify(t, tFun(tvar(), tvar())); }
      catch (e) { if (!(e instanceof UFail)) throw e; throw new HsError(`${L}${fname ? '`' + fname + '`' : 'This'} is a number, not a function, so it can't be given an argument. Is an operator like + or * missing?`, 'type', line); }
      t = prune(t);
    }
    if (t.con !== '->') {
      if (i === 0) throw new HsError(`${line ? `Line ${line}: ` : ''}${fname ? '`' + fname + '`' : 'This'} is ${article(pp(t, namer()))}, not a function, so it can't be given an argument. Is an operator like + or ++ missing?`, 'type', line);
      throw new HsError(`${line ? `Line ${line}: ` : ''}\`${fname || 'this function'}\` is given ${args.length} arguments here, but it only takes ${i}.`, 'type', line);
    }
    const at = infer(a, env);
    unifyAt(t.args[0], at, { line: lineOf(a) || line, what: descs(i), op });
    cur = t.args[1];
  });
  return cur;
}
// Instantiate a scheme; for a class method, remember (on the AST node) which type the class variable became,
// so the right instance can be picked when the program runs.
function instRef(s, n, name) {
  if (!s.method) return instantiate(s);
  const { type, map } = instantiateWith(s);
  n.mref = { name, cls: s.method.cls, cv: map.get(s.method.param) };
  if (s.method.lib) { n.mref.lib = true; n.mref.ex = {}; for (const [k, v] of Object.entries(s.method.extra || {})) n.mref.ex[k] = map.get(v); }
  return type;
}
function headName(n) { return n.k === 'var' || n.k === 'con' ? n.name : n.k === 'opfn' ? n.op : n.k === 'paren' ? headName(n.e) : null; }
function opScheme(op, env, line) { return OPS0[op] || lookupT(env, op, line); }

function infer(n, env) {
  switch (n.k) {
    case 'lit': return litType(n.lt);
    case 'var': { const s = lookupT(env, n.name, n.line); const t = instRef(s, n, n.name); if (TYPE_DIRECTED.includes(n.name) && s === TENV0[n.name]) n.st = t; return t; }
    case 'con': return instantiate(conScheme(n.name, n.line));
    case 'hole': return tvar();
    case 'ann': {
      const { ctx, ast, line } = parseTypeToks(n.toks); const vars = {};
      const at = buildType(ast, v => vars[v] || (vars[v] = { con: v, args: [], rigid: true, cls: new Set() }), line);
      ctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
      unifyAt(at, infer(n.e, env), { line: n.line, what: 'this expression (compared with its :: type annotation)' });
      return at;
    }
    case 'rec': {
      const L = n.line ? `Line ${n.line}: ` : '';
      conScheme(n.con, n.line); const info = cx.cons[n.con];
      if (!info || !info.fieldNames) throw new HsError(`${L}\`${n.con}\` wasn't defined with named fields, so it can't be built with { … }. Write the values in order instead, like ${n.con} x y.`, 'type', n.line);
      let t = instantiate(info.scheme); const fts = [];
      for (let i = 0; i < info.arity; i++) { t = prune(t); fts.push(t.args[0]); t = t.args[1]; }
      const seen = new Set();
      for (const [f, e, line] of n.fields) {
        const i = info.fieldNames.indexOf(f);
        if (i < 0) throw new HsError(`Line ${line}: \`${n.con}\` has no field called \`${f}\`. Its fields are: ${info.fieldNames.join(', ')}.`, 'type', line);
        if (seen.has(f)) throw new HsError(`Line ${line}: the field \`${f}\` is given twice.`, 'type', line);
        seen.add(f); unifyAt(fts[i], infer(e, env), { line, what: `the field \`${f}\`` });
      }
      const missing = info.fieldNames.filter(f => !seen.has(f));
      if (missing.length) throw new HsError(`${L}this ${n.con} is missing ${missing.length > 1 ? 'the fields' : 'the field'} ${missing.map(f => '`' + f + '`').join(', ')}.`, 'type', n.line);
      return t;
    }
    case 'upd': {
      const st = infer(n.e, env);
      for (const [f, e, line] of n.fields) {
        const fi = cx.fields[f];
        if (!fi) throw new HsError(`Line ${line}: I don't know a record field called \`${f}\`.`, 'scope', line);
        const at = prune(instantiate(fi.scheme));
        unifyAt(at.args[0], st, { line, what: 'the record being updated' });
        unifyAt(at.args[1], infer(e, env), { line, what: `the field \`${f}\`` });
      }
      return st;
    }
    case 'comp': {
      let e2 = env;
      for (const q of n.quals) {
        if (q.let) { e2 = inferBinds(q.let.defs, q.let.sigs, e2); continue; }
        if (q.guard) { unifyAt(tBool, infer(q.guard, e2), { line: lineOf(q.guard) || q.line, what: 'this condition in the list comprehension (it must be True or False)' }); continue; }
        const el = tvar();
        unifyAt(tList(el), infer(q.src, e2), { line: q.line, what: 'the source after <- (it must be a list)' });
        const binds = {}; unifyAt(el, inferPat(q.gen, binds, q.line), { line: q.line, what: 'the pattern before <-' });
        e2 = monoEnv(e2, binds);
      }
      return tList(infer(n.e, e2));
    }
    case 'do': {
      let e2 = env, last; const m = tvar(['Monad']);
      n.stmts.forEach((st, i) => {
        if (st.let) { e2 = inferBinds(st.let.defs, st.let.sigs, e2); return; }
        const t = infer(st.e, e2), a = tvar();
        unifyAt(TC('@', m, a), t, { line: lineOf(st.e) || st.line, what: st.bind ? 'the action after <- (it must be an action, like getLine — or a Maybe, list … in other do blocks)' : 'this line of the do block — every line must be an action of the same kind (all IO, or all Maybe, …)' });
        if (st.bind) { const binds = {}; unifyAt(a, inferPat(st.bind, binds, st.line), { line: st.line, what: 'the pattern before <-' }); e2 = monoEnv(e2, binds); }
        if (i === n.stmts.length - 1) last = t;
      });
      return last;
    }
    case 'paren': return infer(n.e, env);
    case 'list': { const el = tvar(); n.items.forEach(it => unifyAt(el, infer(it, env), { line: lineOf(it) || n.line, what: 'this list — every item in a list must have the same type' })); return tList(el); }
    case 'tuple': return n.items.length ? tTup(n.items.map(it => infer(it, env))) : tUnit;
    case 'range': { const el = tvar(['Num']); [n.from, n.then, n.to].filter(Boolean).forEach(x => unifyAt(el, infer(x, env), { line: n.line, what: 'this range' })); return tList(el); }
    case 'app': {
      const args = []; let h = n; while (h.k === 'app') { args.unshift(h.a); h = h.f; }
      const name = headName(h);
      return applyArgs(infer(h, env), name, args, env, n.line, i => name ? `the ${ord(i + 1)} argument of \`${name}\`` : `the ${ord(i + 1)} argument here`, null);
    }
    case 'bin': return applyArgs(instRef(opScheme(n.op, env, n.line), n, n.op), n.op, [n.l, n.r], env, n.line, i => `the ${i ? 'right' : 'left'} side of \`${n.op}\``, n.op);
    case 'neg': { const t = infer(n.e, env); unifyAt(tvar(['Num']), t, { line: n.line, what: 'this negation (the minus sign)', op: '-' }); return t; }
    case 'opfn': return instRef(opScheme(n.op, env, n.line), n, n.op);
    case 'lsec': case 'rsec': {
      const a = tvar(), b = tvar(), c = tvar();
      unify(instRef(opScheme(n.op, env, n.line), n, n.op), tFun(a, tFun(b, c)));
      if (n.k === 'lsec') { unifyAt(a, infer(n.e, env), { line: n.line, what: `the left side of \`${n.op}\``, op: n.op }); return tFun(b, c); }
      unifyAt(b, infer(n.e, env), { line: n.line, what: `the right side of \`${n.op}\``, op: n.op }); return tFun(a, c);
    }
    case 'if': {
      unifyAt(tBool, infer(n.c, env), { line: lineOf(n.c) || n.line, what: 'the condition of this if (it must be True or False)' });
      const tt = infer(n.t, env); unifyAt(tt, infer(n.e, env), { line: lineOf(n.e) || n.line, what: 'the else branch — it must have the same type as the then branch' }); return tt;
    }
    case 'lam': {
      const binds = {}; const pts = n.pats.map(p => inferPat(p, binds, n.line));
      const bt = infer(n.body, monoEnv(env, binds));
      return pts.reduceRight((acc, a) => tFun(a, acc), bt);
    }
    case 'let': return infer(n.body, inferBinds(n.defs, n.sigs, env));
    case 'case': {
      const st = infer(n.scrut, env), r = tvar();
      for (const alt of n.alts) {
        const binds = {};
        unifyAt(st, inferPat(alt.pat, binds, alt.line), { line: alt.line, what: 'this case pattern — it must match the type of the value being examined' });
        const e2 = monoEnv(env, binds);
        const bodies = alt.guards ? alt.guards.map(([g, e]) => { unifyAt(tBool, infer(g, e2), { line: lineOf(g) || alt.line, what: 'this guard (it must be True or False)' }); return e; }) : [alt.body];
        bodies.forEach(b => unifyAt(r, infer(b, e2), { line: lineOf(b) || alt.line, what: 'this case branch — every branch must give back the same type' }));
      }
      return r;
    }
  }
  throw new HsError('Something unexpected happened while checking types.', 'internal');
}
function inferEquations(name, eqs, env, expected) {
  const arity = eqs[0].pats.length;
  for (const e of eqs) if (e.pats.length !== arity)
    throw new HsError(`Line ${e.line}: every equation for ${name} needs the same number of arguments (the first has ${arity}, this one has ${e.pats.length}).`, 'parse', e.line);
  let argTs = [], resT;
  if (expected) {
    let t = expected;
    for (let i = 0; i < arity; i++) {
      t = prune(t);
      if (isVar(t)) { unify(t, tFun(tvar(), tvar())); t = prune(t); }
      if (t.con !== '->') throw new HsError(`Line ${eqs[0].line}: the type signature says \`${name}\` takes ${i} argument${i === 1 ? '' : 's'}, but its definition has ${arity}.`, 'type', eqs[0].line);
      argTs.push(t.args[0]); t = t.args[1];
    }
    resT = t;
  } else { argTs = eqs[0].pats.map(() => tvar()); resT = tvar(); }
  for (const eq of eqs) {
    const binds = {};
    eq.pats.forEach((p, i) => unifyAt(argTs[i], inferPat(p, binds, eq.line), { line: eq.line, what: `the ${ord(i + 1)} argument pattern of \`${name}\`` }));
    let e2 = monoEnv(env, binds);
    if (eq.where) e2 = inferBinds(eq.where.defs, eq.where.sigs, e2);
    const what = `the result of \`${name}\``;
    if (eq.guards) eq.guards.forEach(([g, e]) => {
      unifyAt(tBool, infer(g, e2), { line: lineOf(g) || eq.line, what: 'this guard (it must be True or False)' });
      unifyAt(resT, infer(e, e2), { line: lineOf(e) || eq.line, what });
    });
    else unifyAt(resT, infer(eq.body, e2), { line: lineOf(eq.body) || eq.line, what });
  }
  return expected || argTs.reduceRight((acc, a) => tFun(a, acc), resT);
}
function freeVars(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(x => freeVars(x, out)); return out; }
  if (node.k === 'var') out.add(node.name);
  if (['bin', 'opfn', 'lsec', 'rsec'].includes(node.k) && !OP_TYPES[node.op]) out.add(node.op);
  for (const k in node) if (k !== 'toks') freeVars(node[k], out);
  return out;
}
function sccs(nodes, deps) {
  let idx = 0; const index = {}, low = {}, on = {}, st = [], out = [];
  const sc = v => {
    index[v] = low[v] = idx++; st.push(v); on[v] = true;
    for (const w of deps[v]) { if (index[w] === undefined) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], index[w]); }
    if (low[v] === index[v]) { const c = []; let w; do { w = st.pop(); on[w] = false; c.push(w); } while (w !== v); out.push(c); }
  };
  nodes.forEach(n => { if (index[n] === undefined) sc(n); });
  return out;
}
function inferBinds(defs, sigs, env) {
  const ne = Object.create(env);
  for (const n in sigs) ne[n] = sigScheme(sigs[n].toks);
  const unsigned = Object.keys(defs).filter(n => !sigs[n]);
  const deps = {}; unsigned.forEach(n => { deps[n] = [...freeVars(defs[n])].filter(m => unsigned.includes(m)); });
  for (const scc of sccs(unsigned, deps)) {
    cx.level++;
    const monos = {}; scc.forEach(n => { monos[n] = tvar(); ne[n] = { qs: [], type: monos[n] }; });
    scc.forEach(n => unifyAt(monos[n], inferEquations(n, defs[n], ne, null), { line: defs[n][0].line, what: `the definition of \`${n}\`` }));
    cx.level--;
    scc.forEach(n => { ne[n] = generalize(monos[n]); });
  }
  for (const n in sigs) { cx.level++; inferEquations(n, defs[n], ne, skolemize(sigs[n].toks)); cx.level--; }
  return ne;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export { freeVars, infer, inferBinds, inferEquations };
