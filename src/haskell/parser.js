// Parser: tokens → declarations and expression ASTs. Fixity comes from the program's own
// infixl/infixr lines (cx.fixity), set by parseProgram before anything else is parsed.
import { cx } from './context.js';
import { HsError } from './errors.js';
import { tokenize } from './lexer.js';

const FIX = { '$': [0,'r'], '>>=': [1,'l'], '>>': [1,'l'], '<$>': [4,'l'], '<*>': [4,'l'], '<>': [6,'r'], '||': [2,'r'], '&&': [3,'r'], '==': [4,'n'], '/=': [4,'n'], '<': [4,'n'], '<=': [4,'n'], '>': [4,'n'], '>=': [4,'n'],
  ':': [5,'r'], '++': [5,'r'], '+': [6,'l'], '-': [6,'l'], '*': [7,'l'], '/': [7,'l'], '^': [8,'r'], '.': [9,'r'], '!!': [9,'l'] };
const BT_FIX = { div: [7,'l'], mod: [7,'l'], quot: [7,'l'], rem: [7,'l'], elem: [4,'n'], notElem: [4,'n'] };
const RESERVED_OPS = ['=', '|', '->', '..', '::', '<-', '\\', '=>', '@', '~'];
const BLOCK_ENDERS = ['where', 'in', 'then', 'else', 'of'];

class Parser {
  constructor(toks, start = 0, end = toks.length) { this.toks = toks; this.pos = start; this.start = start; this.end = end; }
  peek(o = 0) { const i = this.pos + o; return i < this.end ? this.toks[i] : undefined; }
  next() { return this.toks[this.pos++]; }
  is(t, v, o = 0) { const k = this.peek(o); return !!k && k.t === t && (v === undefined || k.v === v); }
  fail(msg) {
    const k = this.peek() || this.toks[Math.min(this.pos, this.end) - 1] || this.toks[this.start];
    const ln = k ? k.line : 1;
    throw new HsError(`Line ${ln}: ${msg}`, 'parse', ln);
  }
  desc(k) { return k ? '`' + k.v + '`' : 'the end of the line'; }
  expect(t, v, msg) { if (!this.is(t, v)) this.fail(msg || `I expected \`${v}\` here, but found ${this.desc(this.peek())}.`); return this.next(); }

  // ---- indentation-aware blocks (where / let / case ... of) ----
  layoutBlock(stopAtIn, what) {
    const first = this.peek();
    if (!first || (first.t === 'kw' && BLOCK_ENDERS.includes(first.v))) this.fail(`I expected something after \`${what}\`.`);
    const col = first.col; const items = [];
    let start = this.pos, depth = 0, lets = 0, i = this.pos;
    for (; i < this.end; i++) {
      const t = this.toks[i];
      if (i > start && t.bol && depth === 0) {
        if (t.col < col) break;
        if (t.col === col && !(t.t === 'kw' && (t.v === 'then' || t.v === 'else'))) { items.push([start, i]); start = i; if (t.t === 'kw' && BLOCK_ENDERS.includes(t.v)) break; }
      }
      if (t.t === 'p' && (t.v === '(' || t.v === '[')) depth++;
      else if (t.t === 'p' && (t.v === ')' || t.v === ']')) { if (depth === 0) break; depth--; }
      else if (t.t === 'kw' && t.v === 'let') lets++;
      else if (t.t === 'kw' && t.v === 'in' && depth === 0) { if (lets > 0) lets--; else if (stopAtIn) break; }
      else if (t.t === 'p' && t.v === ';' && depth === 0) { items.push([start, i]); start = i + 1; }
    }
    if (i > start) items.push([start, i]);
    this.pos = i;
    return items.filter(([s, e]) => e > s);
  }
  parseDecls(ranges, top = false, sigsOnlyOk = false) {
    const defs = {}, sigs = {}, datas = [], syns = [], classes = [], instances = [];
    for (const [s, e] of ranges) {
      const f = this.toks[s];
      if (f.t === 'kw' && ['data', 'newtype', 'type'].includes(f.v)) {
        if (!top) throw new HsError(`Line ${f.line}: \`${f.v}\` declarations go at the top level of the file, with no indentation.`, 'parse', f.line);
        const p = new Parser(this.toks, s, e);
        if (f.v === 'type') syns.push(p.parseSynonym()); else datas.push(p.parseData());
        continue;
      }
      if (f.t === 'kw' && (f.v === 'import' || f.v === 'module')) continue; // everything in Haskell Town is already loaded
      if (f.t === 'kw' && (f.v === 'class' || f.v === 'instance')) {
        if (!top) throw new HsError(`Line ${f.line}: \`${f.v}\` declarations go at the top level of the file, with no indentation.`, 'parse', f.line);
        const p = new Parser(this.toks, s, e);
        if (f.v === 'class') classes.push(p.parseClass()); else instances.push(p.parseInstance());
        continue;
      }
      if (f.t === 'id' && ['infixl', 'infixr', 'infix'].includes(f.v)) continue; // handled before parsing
      let sigIdx = -1, eqIdx = -1, depth = 0;
      for (let i = s; i < e; i++) {
        const t = this.toks[i];
        if (t.t === 'p' && '(['.includes(t.v)) depth++; else if (t.t === 'p' && ')]'.includes(t.v)) depth--;
        else if (depth === 0 && t.t === 'op' && t.v === '::' && sigIdx < 0) sigIdx = i;
        else if (depth === 0 && t.t === 'op' && (t.v === '=' || t.v === '|') && eqIdx < 0) eqIdx = i;
      }
      if (sigIdx >= 0 && (eqIdx < 0 || sigIdx < eqIdx)) {
        const head = this.toks.slice(s, sigIdx).filter((t, i, a) => !(t.t === 'p' && (t.v === '(' || t.v === ')') && ((a[i + 1] && a[i + 1].t === 'op') || (a[i - 1] && a[i - 1].t === 'op'))));
        if (!head.length || head.some(t => !(t.t === 'id' || t.t === 'op' || (t.t === 'p' && t.v === ','))))
          throw new HsError(`Line ${f.line}: a type signature starts with a function name, then ::, then the type — like add :: Int -> Int -> Int`, 'parse', f.line);
        const tt = this.toks.slice(sigIdx + 1, e);
        if (!tt.length) throw new HsError(`Line ${f.line}: after :: write the type, like Int or [String] -> Int.`, 'parse', f.line);
        head.filter(t => t.t === 'id' || t.t === 'op').forEach(t => { sigs[t.v] = { toks: tt, line: f.line }; });
        continue;
      }
      // an infix definition, like  x <+> y = ...  or  Circle a == Circle b = ...
      let opAt = -1, opLen = 1, dd = 0;
      for (let i = s; i < (eqIdx < 0 ? e : eqIdx); i++) {
        const t = this.toks[i];
        if (t.t === 'p' && '(['.includes(t.v)) dd++; else if (t.t === 'p' && ')]'.includes(t.v)) dd--;
        else if (dd === 0 && i > s && t.t === 'op' && t.v !== ':' && !RESERVED_OPS.includes(t.v)) { opAt = i; break; }
        else if (dd === 0 && i > s && t.t === 'p' && t.v === '`' && this.toks[i + 1] && this.toks[i + 1].t === 'id') { opAt = i; opLen = 3; break; }
      }
      if (opAt > 0) {
        const lp = new Parser(this.toks, s, opAt); const left = lp.parsePat();
        if (lp.peek()) lp.fail(`I didn't expect ${lp.desc(lp.peek())} here.`);
        const name = opLen === 3 ? this.toks[opAt + 1].v : this.toks[opAt].v;
        const rp = new Parser(this.toks, opAt + opLen, e); const right = rp.parsePat();
        const b = rp.parseRhs(name, [left, right], f.line);
        if (rp.peek()) rp.fail(`I didn't expect ${rp.desc(rp.peek())} here. Is something missing before it, or is the indentation off?`);
        (defs[name] = defs[name] || []).push(b);
        continue;
      }
      const p = new Parser(this.toks, s, e);
      const b = p.parseBinding();
      if (p.peek()) {
        const k = p.peek();
        p.fail(`I didn't expect ${p.desc(k)} here. Is something missing before it, or is the indentation off?`);
      }
      (defs[b.name] = defs[b.name] || []).push(b);
    }
    if (!sigsOnlyOk) for (const n in sigs) if (!defs[n]) throw new HsError(`Line ${sigs[n].line}: there's a type signature for ${n}, but no definition for it yet.`, 'parse', sigs[n].line);
    return { defs, sigs, datas, syns, classes, instances };
  }
  // class [Ctx =>] Name var where  method :: type ; defaults
  parseClass() {
    const kw = this.next(), line = kw.line;
    let whereAt = this.end; for (let i = this.pos; i < this.end; i++) if (this.toks[i].t === 'kw' && this.toks[i].v === 'where') { whereAt = i; break; }
    const head = this.toks.slice(this.pos, whereAt);
    const arrow = head.findIndex(t => t.t === 'op' && t.v === '=>');
    const supers = [];
    if (arrow >= 0) for (let k = 0; k < arrow; k++) if (head[k].t === 'con') supers.push(head[k].v);
    const rest = head.slice(arrow + 1);
    if (rest.length !== 2 || rest[0].t !== 'con' || rest[1].t !== 'id')
      throw new HsError(`Line ${line}: a class starts like this: class Describable a where — a capitalised class name, then one type variable.`, 'parse', line);
    this.pos = whereAt; let body = { defs: {}, sigs: {} };
    if (this.is('kw', 'where')) { this.next(); if (this.peek()) body = this.parseDecls(this.layoutBlock(false, 'where'), false, true); }
    if (this.peek()) this.fail(`I didn't expect ${this.desc(this.peek())} in this class declaration.`);
    return { name: rest[0].v, param: rest[1].v, supers, sigs: body.sigs, defaults: body.defs, line };
  }
  // instance [Ctx =>] Class Type where  method definitions
  parseInstance() {
    const kw = this.next(), line = kw.line;
    let whereAt = this.end; for (let i = this.pos; i < this.end; i++) if (this.toks[i].t === 'kw' && this.toks[i].v === 'where') { whereAt = i; break; }
    let i = this.pos; const ctx = [];
    const arrow = this.toks.slice(this.pos, whereAt).findIndex(t => t.t === 'op' && t.v === '=>');
    if (arrow >= 0) {
      for (let k = this.pos; k < this.pos + arrow; k++) if (this.toks[k].t === 'con' && this.toks[k + 1] && this.toks[k + 1].t === 'id') ctx.push([this.toks[k].v, this.toks[k + 1].v]);
      i = this.pos + arrow + 1;
    }
    const ct = this.toks[i];
    if (!ct || ct.t !== 'con') throw new HsError(`Line ${line}: an instance starts like this: instance Describable Shape where`, 'parse', line);
    const tp = new TypeParser(this.toks, i + 1, whereAt);
    if (tp.i >= whereAt) throw new HsError(`Line ${line}: after the class name, write the type this instance is for, like: instance ${ct.v} Shape where`, 'parse', line);
    const type = tp.atom();
    if (tp.i < whereAt) throw new HsError(`Line ${line}: put parentheses around the type, like: instance ${ct.v} (${this.toks.slice(i + 1, whereAt).map(t => t.v).join(' ')}) where`, 'parse', line);
    this.pos = whereAt; let body = { defs: {}, sigs: {} };
    if (this.is('kw', 'where')) { this.next(); if (this.peek()) body = this.parseDecls(this.layoutBlock(false, 'where')); }
    if (this.peek()) this.fail(`I didn't expect ${this.desc(this.peek())} in this instance declaration.`);
    return { cls: ct.v, type, ctx, defs: body.defs, line };
  }
  parseData() {
    const kw = this.next(), line = kw.line;
    const nt = this.expect('con', undefined, `After \`${kw.v}\`, write the new type's name with a capital letter, like: data Shape = …`);
    const params = []; while (this.is('id')) params.push(this.next().v);
    this.expect('op', '=', `After \`data ${nt.v}${params.map(p => ' ' + p).join('')}\`, write = and then the constructors, like: data ${nt.v} = A | B`);
    const cons = [];
    for (;;) {
      const ct = this.expect('con', undefined, `Each constructor starts with a capital letter, like Circle or Rect. I found ${this.desc(this.peek())}.`);
      const c = { name: ct.v, fields: [], line: ct.line };
      if (this.is('p', '{')) {
        this.next(); c.fieldNames = [];
        while (!this.is('p', '}')) {
          const names = [this.expect('id', undefined, 'Inside { … }, write a field name, then :: and its type, like name :: String').v];
          while (this.is('p', ',')) { this.next(); names.push(this.expect('id', undefined, 'Expected another field name.').v); }
          this.expect('op', '::', `After the field name, write :: and the field's type, like ${names[0]} :: String`);
          let j = this.pos, depth = 0;
          for (; j < this.end; j++) { const t = this.toks[j]; if (t.t === 'p' && '(['.includes(t.v)) depth++; else if (t.t === 'p' && ')]'.includes(t.v)) depth--; else if (depth === 0 && t.t === 'p' && (t.v === ',' || t.v === '}')) break; }
          const tp = new TypeParser(this.toks, this.pos, j); const ast = tp.fun(); if (tp.i < j) tp.fail(`I didn't expect \`${this.toks[tp.i].v}\` in this field's type.`);
          this.pos = j;
          names.forEach(n => { c.fieldNames.push(n); c.fields.push(ast); });
          if (this.is('p', ',')) this.next(); else break;
        }
        this.expect('p', '}', 'A record needs a closing }.');
      } else {
        while (this.is('con') || this.is('id') || this.is('p', '(') || this.is('p', '[')) { const tp = new TypeParser(this.toks, this.pos, this.end); c.fields.push(tp.atom()); this.pos = tp.i; }
      }
      cons.push(c);
      if (this.is('op', '|')) { this.next(); continue; }
      break;
    }
    const deriving = [];
    if (this.is('kw', 'deriving')) {
      this.next();
      const add = t => { if (!['Show', 'Eq', 'Ord'].includes(t.v)) this.fail(`Haskell Town can derive Show, Eq and Ord — not \`${t.v}\` yet.`); deriving.push(t.v); };
      if (this.is('p', '(')) { this.next(); while (!this.is('p', ')')) { add(this.expect('con', undefined, 'Write class names inside deriving ( … ), like deriving (Show, Eq).')); if (this.is('p', ',')) this.next(); else break; } this.expect('p', ')'); }
      else add(this.expect('con', undefined, 'After deriving, write a class name like Show, or a list like (Show, Eq).'));
    }
    if (this.peek()) this.fail(`I didn't expect ${this.desc(this.peek())} in this data declaration. Constructors are separated by |.`);
    return { name: nt.v, params, cons, deriving, line };
  }
  parseSynonym() {
    const kw = this.next();
    const nt = this.expect('con', undefined, 'After `type`, write the new name with a capital letter, like: type Name = String');
    const params = []; while (this.is('id')) params.push(this.next().v);
    this.expect('op', '=', `After \`type ${nt.v}\`, write = and the type it stands for.`);
    const tp = new TypeParser(this.toks, this.pos, this.end); const ast = tp.fun(); if (tp.i < this.end) tp.fail(`I didn't expect \`${this.toks[tp.i].v}\` here.`);
    this.pos = this.end;
    return { name: nt.v, params, ast, line: kw.line };
  }

  // ---- expressions ----
  peekOp() {
    const k = this.peek(); if (!k) return null;
    if (k.t === 'op' && (cx.fixity[k.v] || FIX[k.v])) return { name: k.v, fix: cx.fixity[k.v] || FIX[k.v], len: 1, line: k.line };
    if (k.t === 'p' && k.v === '`') {
      const n = this.peek(1), c = this.peek(2);
      if (n && n.t === 'id' && c && c.t === 'p' && c.v === '`') return { name: n.v, fix: cx.fixity[n.v] || BT_FIX[n.v] || [9,'l'], len: 3, line: k.line };
      this.fail('Backticks go around a function name to use it in the middle, like 7 `div` 2.');
    }
    if (k.t === 'op' && !RESERVED_OPS.includes(k.v)) return { name: k.v, fix: [9, 'l'], len: 1, line: k.line }; // your own operator
    return null;
  }
  parseExpr(min = 0) {
    let left = this.parseUnary();
    for (;;) {
      const op = this.peekOp(); if (!op) break;
      const [prec, assoc] = op.fix; if (prec < min) break;
      if (this.is('p', ')', op.len)) break; // left section, e.g. (2*)
      this.pos += op.len;
      if (!this.peek()) this.fail(`\`${op.name}\` needs something on its right-hand side too.`);
      const right = this.parseExpr(assoc === 'r' ? prec : prec + 1);
      left = { k: 'bin', op: op.name, l: left, r: right, line: op.line };
    }
    if (min === 0 && this.is('op', '::')) {
      const t0 = this.next(); let j = this.pos, depth = 0;
      for (; j < this.end; j++) {
        const t = this.toks[j];
        if (t.t === 'p' && (t.v === '(' || t.v === '[')) depth++;
        else if (t.t === 'p' && (t.v === ')' || t.v === ']')) { if (depth === 0) break; depth--; }
        else if (t.t === 'p' && t.v === ',') { if (depth === 0) break; }
        else if (!(t.t === 'con' || t.t === 'id' || (t.t === 'op' && (t.v === '->' || t.v === '=>')))) break;
      }
      if (j === this.pos) this.fail('After :: write a type, like Int.');
      const toks = this.toks.slice(this.pos, j); this.pos = j;
      left = { k: 'ann', e: left, toks, line: t0.line };
    }
    return left;
  }
  parseUnary() {
    if (this.is('op', '-')) { const t = this.next(); return { k: 'neg', e: this.parseExpr(7), line: t.line }; }
    return this.parseApp();
  }
  canAtom() { const k = this.peek(); if (!k) return false; return ['num', 'str', 'char', 'id', 'con'].includes(k.t) || (k.t === 'p' && (k.v === '(' || k.v === '[')); }
  parseApp() {
    if (this.is('kw', 'if')) return this.parseIf();
    if (this.is('op', '\\')) return this.parseLambda();
    if (this.is('kw', 'let')) return this.parseLet();
    if (this.is('kw', 'case')) return this.parseCase();
    if (this.is('kw', 'do')) return this.parseDo();
    if (!this.canAtom()) this.fail(`I expected an expression here, but found ${this.desc(this.peek())}.`);
    let f = this.parseAtom();
    while (this.canAtom() || this.is('op', '\\') || this.is('kw', 'case') || this.is('kw', 'if') || this.is('kw', 'do')) {
      const a = this.is('op', '\\') ? this.parseLambda() : this.is('kw', 'case') ? this.parseCase() : this.is('kw', 'if') ? this.parseIf() : this.is('kw', 'do') ? this.parseDo() : this.parseAtom();
      f = { k: 'app', f, a, line: f.line };
    }
    return f;
  }
  parseAtom() {
    const k = this.next(), line = k.line;
    if (k.t === 'num') return { k: 'lit', v: k.v, lt: k.float ? 'float' : 'int', line };
    if (k.t === 'str') return { k: 'lit', v: k.v, lt: 'str', line };
    if (k.t === 'char') return { k: 'lit', v: k.v, lt: 'char', line };
    let node;
    if (k.t === 'id') node = k.v === '___' ? { k: 'hole', line } : { k: 'var', name: k.v, line };
    else if (k.t === 'con') return this.is('p', '{') ? this.parseRecordBody({ k: 'rec', con: k.v, line }) : { k: 'con', name: k.v, line };
    else if (k.v === '[') return Object.assign(this.parseListTail(), { line });
    else node = Object.assign(this.parseParenTail(line), { line });
    return this.is('p', '{') ? this.parseRecordBody({ k: 'upd', e: node, line }) : node;
  }
  parseRecordBody(node) {
    this.next(); node.fields = [];
    while (!this.is('p', '}')) {
      const f = this.expect('id', undefined, `Inside { … }, write field = value, like name = "Ana". I found ${this.desc(this.peek())}.`);
      this.expect('op', '=', `After the field name \`${f.v}\`, write = and its value.`);
      node.fields.push([f.v, this.parseExpr(), f.line]);
      if (this.is('p', ',')) this.next(); else break;
    }
    this.expect('p', '}', `I expected a , or a closing } here, but found ${this.desc(this.peek())}.`);
    return node;
  }
  parseDo() {
    const t0 = this.next();
    const stmts = this.layoutBlock(false, 'do').map(([s, e]) => {
      const line = this.toks[s].line; const p = new Parser(this.toks, s, e);
      if (p.is('kw', 'let')) {
        p.next(); const d = p.parseDecls(p.layoutBlock(true, 'let'));
        if (p.is('kw', 'in')) { const q = new Parser(this.toks, s, e); const ex = q.parseExpr(); if (q.peek()) q.fail(`I didn't expect ${q.desc(q.peek())} here.`); return { e: ex, line }; }
        if (p.peek()) p.fail(`I didn't expect ${p.desc(p.peek())} here. Is the indentation off?`);
        return { let: d, line };
      }
      let depth = 0, arrow = -1;
      for (let i = s; i < e; i++) { const t = this.toks[i]; if (t.t === 'p' && '(['.includes(t.v)) depth++; else if (t.t === 'p' && ')]'.includes(t.v)) depth--; else if (depth === 0 && t.t === 'op' && t.v === '<-') { arrow = i; break; } }
      if (arrow >= 0) {
        const pp = new Parser(this.toks, s, arrow); const pat = pp.parsePat(); if (pp.peek()) pp.fail('On the left of <- write a name (or pattern), like: name <- getLine');
        const ep = new Parser(this.toks, arrow + 1, e); if (!ep.peek()) ep.fail('After <-, write the IO action to run, like getLine.');
        const ex = ep.parseExpr(); if (ep.peek()) ep.fail(`I didn't expect ${ep.desc(ep.peek())} here. Is the indentation off?`);
        return { bind: pat, e: ex, line };
      }
      const ex = p.parseExpr(); if (p.peek()) p.fail(`I didn't expect ${p.desc(p.peek())} here. Is the indentation off?`);
      return { e: ex, line };
    });
    const last = stmts[stmts.length - 1];
    if (!last.e || last.bind) throw new HsError(`Line ${last.line}: the last line of a do block must be an action (like putStrLn …), not ${last.bind ? 'a <- line' : 'a let'}.`, 'parse', last.line);
    return { k: 'do', stmts, line: t0.line };
  }
  parseListTail() {
    if (this.is('p', ']')) { this.next(); return { k: 'list', items: [] }; }
    const first = this.parseExpr();
    if (this.is('op', '..')) {
      this.next();
      if (this.is('p', ']')) { this.next(); return { k: 'range', from: first, to: null }; } // [1..] never ends
      const to = this.parseExpr(); this.expect('p', ']'); return { k: 'range', from: first, to };
    }
    if (this.is('op', '|')) {
      this.next(); const quals = [];
      for (;;) {
        let j = this.pos, depth = 0, arrow = -1; const s = this.pos;
        for (; j < this.end; j++) {
          const t = this.toks[j];
          if (t.t === 'p' && '(['.includes(t.v)) depth++;
          else if (t.t === 'p' && ')]'.includes(t.v)) { if (depth === 0) break; depth--; }
          else if (depth === 0 && t.t === 'p' && t.v === ',') break;
          else if (depth === 0 && t.t === 'op' && t.v === '<-' && arrow < 0) arrow = j;
        }
        if (j === s) this.fail('After | (or a comma), write something like x <- xs, or a condition.');
        const line = this.toks[s].line;
        if (this.toks[s].t === 'kw' && this.toks[s].v === 'let') quals.push({ let: new Parser(this.toks).parseDecls([[s + 1, j]]), line });
        else if (arrow >= 0) {
          const pp = new Parser(this.toks, s, arrow); const pat = pp.parsePat(); if (pp.peek()) pp.fail('On the left of <- write a name or pattern, like x <- xs.');
          const ep = new Parser(this.toks, arrow + 1, j); if (!ep.peek()) ep.fail('After <-, write the list to take items from.');
          const src = ep.parseExpr(); if (ep.peek()) ep.fail(`I didn't expect ${ep.desc(ep.peek())} here.`);
          quals.push({ gen: pat, src, line });
        } else { const ep = new Parser(this.toks, s, j); const g = ep.parseExpr(); if (ep.peek()) ep.fail(`I didn't expect ${ep.desc(ep.peek())} here.`); quals.push({ guard: g, line }); }
        this.pos = j;
        if (this.is('p', ',')) { this.next(); continue; }
        this.expect('p', ']', 'A list comprehension needs a closing ].'); break;
      }
      return { k: 'comp', e: first, quals };
    }
    const items = [first];
    while (this.is('p', ',')) {
      this.next(); items.push(this.parseExpr());
      if (items.length === 2 && this.is('op', '..')) { this.next(); if (this.is('p', ']')) { this.next(); return { k: 'range', from: items[0], then: items[1], to: null }; } const to = this.parseExpr(); this.expect('p', ']'); return { k: 'range', from: items[0], then: items[1], to }; }
    }
    this.expect('p', ']', `I expected a , or a ] in this list, but found ${this.desc(this.peek())}.`);
    return { k: 'list', items };
  }
  parseParenTail(line) {
    if (this.is('p', ')')) { this.next(); return { k: 'tuple', items: [] }; }
    const op = this.peekOp();
    if (op && this.is('p', ')', op.len)) { this.pos += op.len; this.next(); return { k: 'opfn', op: op.name }; }
    if (op && op.name !== '-') { this.pos += op.len; const e = this.parseExpr(); this.expect('p', ')'); return { k: 'rsec', op: op.name, e }; }
    const e = this.parseExpr();
    const op2 = this.peekOp();
    if (op2 && this.is('p', ')', op2.len)) { this.pos += op2.len; this.next(); return { k: 'lsec', op: op2.name, e }; }
    if (this.is('p', ',')) { const items = [e]; while (this.is('p', ',')) { this.next(); items.push(this.parseExpr()); } this.expect('p', ')'); return { k: 'tuple', items }; }
    this.expect('p', ')', `I expected a closing ) here, but found ${this.desc(this.peek())}.`);
    return { k: 'paren', e };
  }
  parseIf() {
    const t0 = this.next(); const c = this.parseExpr();
    this.expect('kw', 'then', 'An `if` needs a `then` part.');
    const t = this.parseExpr();
    this.expect('kw', 'else', 'In Haskell every `if` needs an `else` too — a function always has to give back something.');
    return { k: 'if', c, t, e: this.parseExpr(), line: t0.line };
  }
  parseLambda() {
    const t0 = this.next(); const pats = [];
    while (this.canPatAtom()) pats.push(this.parsePatAtom());
    if (!pats.length) this.fail('A lambda needs at least one argument, like \\x -> x + 1.');
    this.expect('op', '->', 'In a lambda, put -> between the arguments and the body, like \\x -> x + 1.');
    return { k: 'lam', pats, body: this.parseExpr(), line: t0.line };
  }
  parseLet() {
    const t0 = this.next();
    const { defs, sigs } = this.parseDecls(this.layoutBlock(true, 'let'));
    this.expect('kw', 'in', 'A `let` needs an `in` after its definitions, like: let y = 2 in y * 3');
    return { k: 'let', defs, sigs, body: this.parseExpr(), line: t0.line };
  }
  parseCase() {
    const t0 = this.next(); const scrut = this.parseExpr();
    this.expect('kw', 'of', 'A `case` needs `of` after the value, like: case n of ...');
    const alts = this.layoutBlock(false, 'of').map(([s, e]) => {
      const p = new Parser(this.toks, s, e); const line = this.toks[s].line;
      const pat = p.parsePat(); const alt = { pat, line };
      if (p.is('op', '->')) { p.next(); alt.body = p.parseExpr(); }
      else if (p.is('op', '|')) {
        alt.guards = [];
        while (p.is('op', '|')) { p.next(); const g = p.parseExpr(); p.expect('op', '->', 'In a case, a guard is followed by -> and the result.'); alt.guards.push([g, p.parseExpr()]); }
      } else p.fail(`In a case, each pattern is followed by -> and the result. I found ${p.desc(p.peek())} instead.`);
      if (p.peek()) p.fail(`I didn't expect ${p.desc(p.peek())} here. Is the indentation off?`);
      return alt;
    });
    return { k: 'case', scrut, alts, line: t0.line };
  }
  parseBinding() {
    if (this.is('p', '(') && this.is('op', undefined, 1) && this.is('p', ')', 2)) {
      const t0 = this.next(), op = this.next().v; this.next();
      const pats = []; while (this.canPatAtom()) pats.push(this.parsePatAtom());
      return this.parseRhs(op, pats, t0.line);
    }
    const nt = this.peek();
    if (!nt || nt.t !== 'id') {
      if (nt && nt.t === 'con') this.fail(`Function names start with a lowercase letter — try \`${nt.v[0].toLowerCase() + nt.v.slice(1)}\` instead of \`${nt.v}\`.`);
      this.fail(`I expected the name of a function here, but found ${this.desc(nt)}.`);
    }
    this.next();
    const pats = []; while (this.canPatAtom()) pats.push(this.parsePatAtom());
    if (this.is('op', ':')) this.fail('Patterns like x:xs need parentheses around them when they are arguments: (x:xs).');
    return this.parseRhs(nt.v, pats, nt.line);
  }
  parseRhs(name, pats, line) {
    let b;
    if (this.is('op', '=')) { this.next(); b = { name, pats, body: this.parseExpr(), line }; }
    else if (this.is('op', '|')) {
      const guards = [];
      while (this.is('op', '|')) {
        this.next(); const g = this.parseExpr();
        this.expect('op', '=', 'After a guard condition, write = and then the result.');
        guards.push([g, this.parseExpr()]);
      }
      b = { name, pats, guards, line };
    } else this.fail(`I expected \`=\` after the arguments of ${name}, but found ${this.desc(this.peek())}.`);
    if (this.is('kw', 'where')) { this.next(); b.where = this.parseDecls(this.layoutBlock(false, 'where')); }
    return b;
  }
  canPatAtom() { const k = this.peek(); if (!k) return false; return ['id', 'num', 'str', 'char', 'con'].includes(k.t) || (k.t === 'p' && (k.v === '(' || k.v === '[')); }
  parsePatAtom() {
    const k = this.next();
    if (k.t === 'id') return k.v === '_' ? { p: 'wild' } : { p: 'var', name: k.v };
    if (k.t === 'num') return { p: 'lit', v: k.v, lt: k.float ? 'float' : 'int' };
    if (k.t === 'str') return { p: 'lit', v: k.v, lt: 'str' };
    if (k.t === 'char') return { p: 'lit', v: k.v, lt: 'char' };
    if (k.t === 'con') return { p: 'con', name: k.v, args: [] };
    if (k.v === '[') {
      if (this.is('p', ']')) { this.next(); return { p: 'list', items: [] }; }
      const items = [this.parsePat()]; while (this.is('p', ',')) { this.next(); items.push(this.parsePat()); }
      this.expect('p', ']'); return { p: 'list', items };
    }
    if (k.v === '(') {
      if (this.is('p', ')')) { this.next(); return { p: 'tuple', items: [] }; }
      const first = this.parsePat();
      if (this.is('p', ',')) { const items = [first]; while (this.is('p', ',')) { this.next(); items.push(this.parsePat()); } this.expect('p', ')'); return { p: 'tuple', items }; }
      this.expect('p', ')', `I expected a closing ) in this pattern, but found ${this.desc(this.peek())}.`); return first;
    }
    this.pos--; this.fail(`I expected a pattern here, but found ${this.desc(k)}.`);
  }
  parsePat() {
    let left;
    if (this.is('con')) { const c = this.next(); const args = []; while (this.canPatAtom()) args.push(this.parsePatAtom()); left = { p: 'con', name: c.v, args }; }
    else if (this.is('op', '-') && this.is('num', undefined, 1)) { this.next(); const n = this.next(); left = { p: 'lit', v: -n.v, lt: n.float ? 'float' : 'int' }; }
    else left = this.parsePatAtom();
    if (this.is('op', ':')) { this.next(); return { p: 'cons', h: left, t: this.parsePat() }; }
    return left;
  }
}

function parseProgram(src) {
  const toks = tokenize(src);
  cx.fixity = {};
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.bol && t.col === 0 && t.t === 'id' && ['infixl', 'infixr', 'infix'].includes(t.v))) continue;
    const n = toks[i + 1];
    if (!n || n.t !== 'num') throw new HsError(`Line ${t.line}: write a precedence number after ${t.v}, like: ${t.v} 6 <+>`, 'parse', t.line);
    for (let j = i + 2; j < toks.length && toks[j].line === t.line; j++) {
      const o = toks[j];
      if (o.t === 'op') cx.fixity[o.v] = [n.v, t.v === 'infixl' ? 'l' : t.v === 'infixr' ? 'r' : 'n'];
      else if (o.t === 'id') cx.fixity[o.v] = [n.v, t.v === 'infixl' ? 'l' : t.v === 'infixr' ? 'r' : 'n'];
    }
  }
  const ranges = []; let s = 0;
  for (let i = 0; i < toks.length; i++) if (i > s && toks[i].bol && toks[i].col === 0) { ranges.push([s, i]); s = i; }
  if (toks.length > s) ranges.push([s, toks.length]);
  return new Parser(toks).parseDecls(ranges, true);
}
class TypeParser {
  constructor(toks, i = 0, end = toks.length) { this.toks = toks; this.i = i; this.end = end; this.line = toks[i] ? toks[i].line : (toks[0] ? toks[0].line : null); }
  is(t, v) { const k = this.i < this.end ? this.toks[this.i] : undefined; return !!k && k.t === t && (v === undefined || k.v === v); }
  fail(m) { throw new HsError(`${this.line ? `Line ${this.line}: ` : ''}${m}`, 'type', this.line); }
  atomStart() { return this.is('con') || this.is('id') || this.is('p', '(') || this.is('p', '['); }
  fun() { const a = this.bapp(); if (this.is('op', '->')) { this.i++; return { k: 'fun', a, b: this.fun() }; } return a; }
  bapp() {
    if (this.is('con')) { const n = this.toks[this.i++].v; const args = []; while (this.atomStart()) args.push(this.atom()); return { k: 'con', name: n, args }; }
    if (this.is('id')) { const n = this.toks[this.i++].v; const args = []; while (this.atomStart()) args.push(this.atom()); return args.length ? { k: 'vapp', name: n, args } : { k: 'var', name: n }; }
    return this.atom();
  }
  atom() {
    const t = this.i < this.end ? this.toks[this.i++] : undefined; if (!t) this.fail('This type ends too early.');
    if (t.t === 'id') return { k: 'var', name: t.v };
    if (t.t === 'con') return { k: 'con', name: t.v, args: [] };
    if (t.v === '[') { if (this.is('p', ']')) { this.i++; return { k: 'con', name: '[]', args: [] }; } const e = this.fun(); if (!this.is('p', ']')) this.fail('I expected a ] in this type.'); this.i++; return { k: 'con', name: '[]', args: [e] }; }
    if (t.v === '(') {
      if (this.is('p', ')')) { this.i++; return { k: 'con', name: '()', args: [] }; }
      const items = [this.fun()]; while (this.is('p', ',')) { this.i++; items.push(this.fun()); }
      if (!this.is('p', ')')) this.fail('I expected a ) in this type.'); this.i++;
      return items.length === 1 ? items[0] : { k: 'con', name: '(,)', args: items };
    }
    this.i--; this.fail(`I didn't expect \`${t.v}\` in a type.`);
  }
}
function parseExprSrc(src) {
  const p = new Parser(tokenize(src)); const e = p.parseExpr();
  if (p.peek()) p.fail(`I didn't expect ${p.desc(p.peek())} here.`);
  return e;
}

export { FIX, TypeParser, parseExprSrc, parseProgram };
