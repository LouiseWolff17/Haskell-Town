// Mini-Haskell: a small, type-checked interpreter for the beginner subset of Haskell.
// Lexer → parser → Hindley–Milner type checker with type classes → lazy-list evaluator.
// This file is the public API; the stages live next to it (lexer, parser, types, typecheck, evaluator),
// sharing one context object (context.js).
// The game never imports this directly: it goes through src/runner (see docs/runner-api.md).
import { BUILTIN_CLASSES, EMPTY_CTX, cx, setCtx } from './context.js';
import { HsError } from './errors.js';
import { tokenize } from './lexer.js';
import { parseExprSrc, parseProgram } from './parser.js';
import { CONS0, LIB_CLASSES, LIB_DATA_SRC, TC, TENV0, TYPE_ARITY, UFail, buildType, instantiate, methodSchemeAst, parseTypeToks, ppScheme, skolemize, tFun, tvar, unify } from './types.js';
import { freeVars, infer, inferBinds, inferEquations } from './typecheck.js';
import { PRELUDE, bindGroup, deepEq, evalE, lookup, makeFunction, prim, runAction, show, showT } from './evaluator.js';

let LIB_DATAS = null; // the library newtypes (Sum, Product, …), parsed once
const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true });

// ================= Public API =================
function guard(f) {
  try { return f(); }
  catch (e) {
    cx.level = 0;
    if (e instanceof RangeError) throw new HsError('Your function kept calling itself and never reached an end. Check that there is a base case (like f [] = …) and that each recursive call works on a smaller input.', 'loop');
    if (!(e instanceof HsError)) throw new HsError('Something went wrong inside the interpreter: ' + e.message, 'internal');
    throw e;
  }
}
// Parse + type-check + prepare to run. Throws HsError (kind 'parse' | 'scope' | 'type') like a compiler would.
function buildDataCtx(datas, syns) {
  const ctx = { types: {}, syn: {}, cons: {}, fields: {} }; setCtx(ctx);
  const builtin = n => TYPE_ARITY[n] !== undefined;
  for (const s of syns) {
    if (builtin(s.name) || ctx.syn[s.name]) throw new HsError(`Line ${s.line}: there's already a type called \`${s.name}\`.`, 'type', s.line);
    ctx.syn[s.name] = s;
  }
  // the library's newtypes (Sum, Product, …) — skipped if your own program uses the same type, constructor or field names
  if (!LIB_DATAS) LIB_DATAS = parseProgram(LIB_DATA_SRC).datas;
  const mine = new Set(); datas.forEach(d => { mine.add(d.name); d.cons.forEach(c => { mine.add(c.name); (c.fieldNames || []).forEach(f => mine.add(f)); }); });
  syns.forEach(s => mine.add(s.name));
  const libs = LIB_DATAS.filter(d => !mine.has(d.name) && !d.cons.some(c => mine.has(c.name) || (c.fieldNames || []).some(f => mine.has(f))));
  for (const d of [...libs, ...datas]) {
    if (builtin(d.name) || ctx.types[d.name] || ctx.syn[d.name]) throw new HsError(`Line ${d.line}: there's already a type called \`${d.name}\`. Pick a different name.`, 'type', d.line);
    ctx.types[d.name] = { params: d.params, deriving: new Set(d.deriving), line: d.line, lib: libs.includes(d) };
  }
  for (const d of [...libs, ...datas]) d.cons.forEach((c, idx) => {
    if (ctx.cons[c.name] || CONS0[c.name]) throw new HsError(`Line ${c.line}: there's already a constructor called \`${c.name}\`. Each constructor needs its own name.`, 'type', c.line);
    cx.level++; const pv = {}; d.params.forEach(p => { pv[p] = tvar(); });
    const getVar = n => { if (!pv[n]) throw new HsError(`Line ${c.line}: \`${c.name}\` uses the type variable \`${n}\`, but it isn't listed after the type's name. Write: data ${d.name} ${[...d.params, n].join(' ')} = …`, 'type', c.line); return pv[n]; };
    const fts = c.fields.map(a => buildType(a, getVar, c.line));
    cx.level--;
    const res = TC(d.name, ...d.params.map(p => pv[p])); const qs = Object.values(pv);
    ctx.cons[c.name] = { scheme: { qs, type: fts.reduceRight((acc, f) => tFun(f, acc), res) }, arity: fts.length, index: idx, fieldNames: c.fieldNames || null, typeName: d.name, fieldAsts: c.fields, params: d.params };
    (c.fieldNames || []).forEach((f, i) => {
      if (ctx.fields[f] && ctx.fields[f].typeName !== d.name) throw new HsError(`Line ${c.line}: the field name \`${f}\` is already used by \`${ctx.fields[f].typeName}\`. Field names must be different across types.`, 'type', c.line);
      if (!ctx.fields[f]) ctx.fields[f] = { typeName: d.name, scheme: { qs, type: tFun(res, fts[i]) }, lib: ctx.types[d.name].lib };
    });
  });
  return ctx;
}
function buildClassCtx(classes, instances, ctx) {
  ctx.classes = {};
  for (const [n, b] of Object.entries(BUILTIN_CLASSES)) ctx.classes[n] = Object.assign({}, b, { instances: Object.assign({}, b.instances) });
  for (const ci of Object.values(ctx.classes)) for (const [k, inst] of Object.entries(ci.instances)) if (inst.libType && !(ctx.types[k] && ctx.types[k].lib)) delete ci.instances[k];
  setCtx(ctx);
  const NOT_YOURS = ['Num', 'Fractional', 'Read', 'Integral'];
  const err = (line, m) => new HsError(`${line ? `Line ${line}: ` : ''}${m}`, 'type', line);
  ctx.methodOwner = {}; cx.pendingClasses = new Set(classes.map(c => c.name));
  for (const c of classes) {
    if (LIB_CLASSES.includes(c.name)) throw err(c.line, `\`${c.name}\` is built into Haskell Town now (it opened with the Market), so you don't need to define it. Delete this class declaration and keep your instances.`);
    if (ctx.classes[c.name] || NOT_YOURS.includes(c.name)) throw err(c.line, `there's already a class called \`${c.name}\`. Pick a different name.`);
    for (const sup of c.supers) if (!ctx.classes[sup] && !classes.some(x => x.name === sup) && !NOT_YOURS.includes(sup)) throw err(c.line, `I don't know a class called \`${sup}\`.`);
    const ci = { name: c.name, param: c.param, supers: c.supers, user: true, hkt: false, sigs: {}, schemes: {}, defaults: c.defaults, instances: {}, dispatch: {}, arity: {}, line: c.line, required: [] };
    for (const m of Object.keys(c.defaults)) if (!c.sigs[m]) throw err(c.defaults[m][0].line, `\`${m}\` has a default definition in class \`${c.name}\`, but no type signature there. Add one, like: ${m} :: ${c.param} -> …`);
    for (const [m, sg] of Object.entries(c.sigs)) {
      const { ctx: mctx, ast } = parseTypeToks(sg.toks);
      ci.sigs[m] = { ast, mctx, line: sg.line };
      const walk = a => a.k === 'vapp' ? (a.name === c.param || a.args.some(walk)) : a.k === 'fun' ? walk(a.a) || walk(a.b) : a.k === 'con' ? a.args.some(walk) : false;
      if (walk(ast)) ci.hkt = true;
      const args = []; let a = ast; while (a.k === 'fun') { args.push(a.a); a = a.b; }
      ci.arity[m] = args.length;
      ci.dispatch[m] = args.map((x, i) => ((x.k === 'var' || x.k === 'vapp') && x.name === c.param) ? i : -1).filter(i => i >= 0);
      if (!c.defaults[m]) ci.required.push([m]);
      if (ctx.methodOwner[m]) throw err(sg.line, `\`${m}\` is already a method of class \`${ctx.methodOwner[m]}\`. Each method needs its own name.`);
      ctx.methodOwner[m] = c.name;
    }
    ctx.classes[c.name] = ci;
  }
  for (const ci of Object.values(ctx.classes)) if (ci.user && !ci.lib) for (const [m, sg] of Object.entries(ci.sigs)) ci.schemes[m] = methodSchemeAst(sg.ast, sg.mctx, sg.line, ci.name, ci.param);
  for (const inst of instances) {
    const ci = ctx.classes[inst.cls]; const L = inst.line;
    if (!ci) {
      if (NOT_YOURS.includes(inst.cls)) throw err(L, `writing your own \`${inst.cls}\` instances isn't supported in Haskell Town yet.`);
      throw err(L, `I don't know a class called \`${inst.cls}\`. Define it first with: class ${inst.cls} a where …`);
    }
    const ty = inst.type;
    if (ty.k !== 'con') throw err(L, `an instance needs a specific type, like \`instance ${inst.cls} Shape\`, not a type variable.`);
    const key = ty.name;
    if (key === 'String' || cx.syn[key]) throw err(L, `instances can't be written for \`${key}\` because it's a type synonym. ${key === 'String' ? 'Write the instance for lists instead: instance ' + inst.cls + ' [a] — or wrap the String in your own data type.' : ''}`);
    if (key === '(,)' || key === '()') throw err(L, `instances for tuples aren't supported in Haskell Town yet.`);
    if (ty.args.some(a => a.k !== 'var') || new Set(ty.args.map(a => a.name)).size !== ty.args.length)
      throw err(L, `in an instance head, the type's arguments must be different type variables, like (Tree a) or (Either e).`);
    const ut = cx.types[key]; const arity = ut ? ut.params.length : key === '[]' ? 1 : TYPE_ARITY[key];
    if (arity === undefined) throw err(L, `I don't know a type called \`${key}\`.`);
    const want = ci.hkt ? arity - 1 : arity;
    if (ty.args.length !== want) {
      if (ci.hkt && arity === 0) throw err(L, `\`${key}\` doesn't take a type parameter, so it can't be a ${inst.cls}. ${inst.cls} is for “container” types like Maybe, lists or your own \`data Box a = …\`.`);
      if (ci.hkt) throw err(L, `for ${inst.cls}, leave off the last type parameter: write \`instance ${inst.cls} ${want ? '(' + key + ' ' + ut.params.slice(0, want).join(' ') + ')' : key}\`.`);
      throw err(L, `\`${key}\` takes ${arity} type parameter${arity === 1 ? '' : 's'}, so write: instance ${inst.cls} (${key} ${(ut ? ut.params : ['a', 'b']).slice(0, arity).join(' ')})`);
    }
    if (ci.instances[key]) throw err(L, ci.instances[key].builtin ? `\`${inst.cls} ${key}\` is already built into Haskell Town.` : `there's already an instance ${inst.cls} ${key}.`);
    if (!ci.user && !ci.hkt && !ut) throw err(L, `\`${inst.cls} ${key}\` is already built into Haskell Town.`);
    if (ut && ut.deriving.has(inst.cls)) throw err(L, `\`${key}\` already derives ${inst.cls}. Remove ${inst.cls} from its deriving list, or remove this instance.`);
    const argVars = ty.args.map(a => a.name);
    const ictx = inst.ctx.map(([c2, v]) => { const i = argVars.indexOf(v); if (i < 0) throw err(L, `the constraint \`${c2} ${v}\` must be about one of the instance's type variables (${argVars.join(', ') || 'there are none'}).`); return [c2, i]; });
    for (const m of Object.keys(inst.defs)) if (!ci.sigs[m]) throw err(inst.defs[m][0].line, `\`${m}\` isn't a method of class \`${inst.cls}\`. Its methods are: ${Object.keys(ci.sigs).join(', ')}.`);
    ci.instances[key] = { key, cls: inst.cls, argVars, ctx: ictx, defs: inst.defs, line: L, methods: {} };
  }
  // every instance needs its superclasses, and the methods without a default
  for (const ci of Object.values(ctx.classes)) for (const [key, inst] of Object.entries(ci.instances)) {
    if (inst.builtin) continue;
    for (const sup of ci.supers) {
      const sc = ctx.classes[sup]; const ut = cx.types[key];
      const has = (sc && sc.instances[key]) || (ut && (ut.deriving.has(sup) || (sup === 'Eq' && ut.deriving.has('Ord'))));
      if (!has) throw err(inst.line, `before \`instance ${ci.name} ${key}\`, \`${key}\` needs to be an instance of \`${sup}\` too (${ci.name} builds on ${sup}). Add ${ut && ['Eq', 'Ord', 'Show'].includes(sup) ? `deriving (${sup}) or ` : ''}instance ${sup} ${key} where …`);
    }
    for (const group of ci.required || []) if (!group.some(m => inst.defs[m]))
      throw err(inst.line, `\`instance ${ci.name} ${key}\` needs a definition of ${group.map(m => '`' + m + '`').join(' or ')}.`);
  }
}
// type-check class defaults and instance methods against the class's method types
function checkClassBodies(ctx, tenv) {
  const rigid = (n, cls) => ({ con: n, args: [], rigid: true, cls: new Set(cls || []) });
  for (const ci of Object.values(ctx.classes)) {
    if (ci.user) for (const [m, eqs] of Object.entries(ci.defaults)) {
      const sg = ci.sigs[m]; const mv = { [ci.param]: rigid(ci.param, [ci.name]) };
      cx.level++; const exp = buildType(sg.ast, n => mv[n] || (mv[n] = rigid(n)), sg.line);
      sg.mctx.forEach(([c, v]) => mv[v] && mv[v].cls.add(c));
      inferEquations(m, eqs, tenv, exp); cx.level--;
    }
    for (const inst of Object.values(ci.instances)) {
      if (inst.builtin) continue;
      for (const [m, eqs] of Object.entries(inst.defs)) {
        const sk = {}; inst.argVars.forEach(v => { sk[v] = rigid(v); }); inst.ctx.forEach(([c, i]) => sk[inst.argVars[i]].cls.add(c));
        const head = TC(inst.key, ...inst.argVars.map(v => sk[v]));
        const sg = ci.sigs[m]; const mv = {};
        cx.level++;
        const exp = buildType(sg.ast, n => n === ci.param ? head : (mv[n] || (mv[n] = rigid(n))), inst.line);
        sg.mctx.forEach(([c, v]) => mv[v] && mv[v].cls.add(c));
        inferEquations(m, eqs, tenv, exp); cx.level--;
      }
    }
  }
}
function compileClassBodies(ctx, env) {
  for (const ci of Object.values(ctx.classes)) {
    if (ci.user && !ci.lib) { ci.defaultFns = {}; for (const [m, eqs] of Object.entries(ci.defaults)) ci.defaultFns[m] = makeFunction(m, eqs, env); }
    for (const inst of Object.values(ci.instances)) if (!inst.builtin) for (const [m, eqs] of Object.entries(inst.defs)) inst.methods[m] = makeFunction(m, eqs, env);
  }
}
const accessor = f => prim(1, v => { const info = cx.cons[v.con]; const i = info && info.fieldNames ? info.fieldNames.indexOf(f) : -1; if (i < 0) throw new HsError(`\`${f}\` doesn't exist on a ${v.con} value.`); return v.args[i]; }, f);
function compile(src) {
  return guard(() => {
    cx.level = 0; setCtx(EMPTY_CTX);
    const prog = parseProgram(src);
    const ctx = buildDataCtx(prog.datas, prog.syns);
    buildClassCtx(prog.classes, prog.instances, ctx);
    const base = Object.create(TENV0); const baseEnv = Object.create(PRELUDE);
    for (const ci of Object.values(ctx.classes)) if (ci.user && !ci.lib) for (const m in ci.schemes) {
      if (prog.defs[m]) throw new HsError(`Line ${prog.defs[m][0].line}: \`${m}\` is a method of class \`${ci.name}\`, so it can't also be a top-level function. Put its definition inside an instance instead.`, 'type', prog.defs[m][0].line);
      base[m] = ci.schemes[m];
    }
    for (const f in ctx.fields) {
      if (ctx.fields[f].lib && prog.defs[f]) continue; // your own getSum wins over the library's
      if (prog.defs[f]) throw new HsError(`Line ${prog.defs[f][0].line}: \`${f}\` is already the name of a record field, so it can't also be a function.`, 'type', prog.defs[f][0].line);
      base[f] = ctx.fields[f].scheme; baseEnv[f] = accessor(f);
    }
    const tenv = inferBinds(prog.defs, prog.sigs, base);
    checkClassBodies(ctx, tenv);
    const types = {}; for (const n of Object.keys(prog.defs)) types[n] = ppScheme(tenv[n]);
    const env = Object.create(baseEnv); bindGroup(prog.defs, env);
    compileClassBodies(ctx, env);
    [env, baseEnv, tenv, base].forEach(o => hide(o, '__ctx', ctx));
    hide(env, '__tenv', tenv); hide(baseEnv, '__tenv', base);
    const uses = new Set(); const recursive = [];
    for (const n in prog.defs) { const fv = freeVars(prog.defs[n]); fv.forEach(v => uses.add(v)); if (fv.has(n)) recursive.push(n); }
    for (const ci of Object.values(ctx.classes)) for (const inst of Object.values(ci.instances)) for (const eqs of Object.values(inst.defs || {})) freeVars(eqs).forEach(v => uses.add(v));
    const classes = prog.classes.map(c => ({ name: c.name, param: c.param, methods: Object.keys(c.sigs).map(m => `${/^[a-z]/.test(m) ? m : '(' + m + ')'} :: ${ppScheme(ctx.classes[c.name].schemes[m])}`) }));
    const instances = prog.instances.map(i => `${i.cls} ${ctx.classes[i.cls].instances[i.type.name].argVars.length ? '(' + i.type.name + ' ' + ctx.classes[i.cls].instances[i.type.name].argVars.join(' ') + ')' : i.type.name}`);
    return { env, baseEnv, tenv, types, sigs: prog.sigs, defs: prog.defs, datas: prog.datas, ctx, uses, recursive, classes, instances };
  });
}
function typeOf(tenv, src) { return guard(() => { cx.level = 0; if (tenv && tenv.__ctx) setCtx(tenv.__ctx); return infer(parseExprSrc(src), tenv || TENV0); }); }
// Evaluate an expression. It is type-checked first (so show/print/read know their types).
function evalIn(env, src) {
  return guard(() => {
    if (env.__ctx) setCtx(env.__ctx);
    const e = parseExprSrc(src);
    const tenv = env === PRELUDE ? TENV0 : env.__tenv;
    if (tenv) { cx.level = 0; infer(e, tenv); }
    return evalE(e, env);
  });
}
const newRt = input => ({ out: [], size: 0, pos: 0, input: (input || '').split('\n').filter((l, i, a) => i < a.length - 1 || l !== '') });
// Run an IO action value with the given input text. Returns { out, error? } — output so far is kept even on errors.
function runIO(action, input, ctx) {
  if (ctx) setCtx(ctx);
  const rt = newRt(input);
  try { guard(() => runAction(action, rt)); return { out: rt.out.join('') }; }
  catch (e) { return { out: rt.out.join(''), error: e }; }
}
function runMain(prog, input) {
  setCtx(prog.ctx);
  if (!prog.defs.main) return { out: '', error: new HsError('There is no `main` to run yet. Write one, like:  main = putStrLn "Hello!"', 'scope') };
  try { unify(TC('IO', tvar()), instantiate(prog.tenv.main)); }
  catch (e) { return { out: '', error: new HsError(`\`main\` must be an IO action (its type should be IO ()), but yours is \`main :: ${prog.types.main}\`.`, 'type', prog.defs.main[0].line) }; }
  let action; try { action = guard(() => lookup(prog.env, 'main')); } catch (e) { return { out: '', error: e }; }
  return runIO(action, input);
}
// Does the player's function fit the type the challenge needs? Returns null if yes, otherwise a friendly message.
function fitsSignature(tenv, name, sig) {
  if (tenv.__ctx) setCtx(tenv.__ctx);
  try {
    const expected = skolemize(tokenize(sig.split('::')[1]));
    unify(expected, instantiate(tenv[name]));
    return null;
  } catch (e) {
    if (!(e instanceof UFail) && !(e instanceof HsError)) throw e;
    const generic = /(^|[^A-Za-z])[a-z]([^A-Za-z]|$)/.test(sig.split('::')[1]);
    return `This challenge needs \`${sig.trim()}\`, but your \`${name}\` has the type \`${name} :: ${ppScheme(tenv[name])}\`.` + (generic ? ' The lowercase letters in the challenge\'s type are type variables: your function has to work for any type there, not just one.' : '');
  }
}
const isIO = v => !!v && typeof v.io === 'function';
const ppType = t => ppScheme({ qs: [], type: t });

export const HS = { compile, evalIn, typeOf, fitsSignature, runMain, runIO, isIO, ppType, show, showT, deepEq, PRELUDE, TENV0, HsError };