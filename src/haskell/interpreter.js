// Mini-Haskell: a small, type-checked interpreter for the beginner subset of Haskell.
// Lexer → parser → Hindley–Milner type checker with type classes → lazy-list evaluator.
// The game never imports this directly: it goes through src/runner (see docs/runner-api.md).
export const HS = (() => {
class HsError extends Error { constructor(msg, kind = 'runtime', line = null) { super(msg); this.kind = kind; this.line = line; } }

const OPCHARS = '+-*/<>=!&|:.$^\\@~%#?';
const KW = new Set(['if','then','else','let','in','case','of','where','data','type','newtype','module','import','do','class','instance','deriving']);
const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

// ================= Lexer =================
function tokenize(src) {
  const toks = []; let i = 0, line = 1, lineStart = 0, firstOnLine = true;
  const push = (t, v, s, extra) => { toks.push(Object.assign({ t, v, line, col: s - lineStart, bol: firstOnLine, s, e: i }, extra)); firstOnLine = false; };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { i++; line++; lineStart = i; firstOnLine = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      let j = i; while (src[j] === '-') j++;
      if (j >= src.length || !OPCHARS.includes(src[j])) { while (i < src.length && src[i] !== '\n') i++; continue; }
    }
    if (c === '{' && src[i + 1] === '-') {
      const end = src.indexOf('-}', i + 2); const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; lineStart = k + 1; firstOnLine = true; }
      i = stop; continue;
    }
    const s = i;
    if (/[0-9]/.test(c)) {
      let float = false;
      while (/[0-9]/.test(src[i] || '')) i++;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) { float = true; i++; while (/[0-9]/.test(src[i] || '')) i++; }
      push('num', parseFloat(src.slice(s, i)), s, { float }); continue;
    }
    if (c === '"') {
      i++; let str = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') break;
        if (src[i] === '\\') { const n = src[i + 1]; str += n === 'n' ? '\n' : n === 't' ? '\t' : n; i += 2; }
        else str += src[i++];
      }
      if (src[i] !== '"') throw new HsError(`Line ${line}: this string is missing its closing " quote.`, 'parse', line);
      i++; push('str', str, s); continue;
    }
    if (c === "'") {
      let ch, j = i + 1;
      if (src[j] === '\\') { const n = src[j + 1]; ch = n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2; } else { ch = src[j]; j++; }
      if (src[j] !== "'") throw new HsError(`Line ${line}: a character like 'a' needs a closing ' quote. (Strings use double quotes: "hello".)`, 'parse', line);
      i = j + 1; push('char', ch, s); continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (/[A-Za-z0-9_']/.test(src[i] || '')) i++;
      const w = src.slice(s, i);
      push(KW.has(w) ? 'kw' : /[A-Z]/.test(w[0]) ? 'con' : 'id', w, s); continue;
    }
    if ('()[],`;{}'.includes(c)) { i++; push('p', c, s); continue; }
    if (OPCHARS.includes(c)) {
      while (i < src.length && OPCHARS.includes(src[i])) i++;
      push('op', src.slice(s, i), s); continue;
    }
    throw new HsError(`Line ${line}: I don't understand the character "${c}".`, 'parse', line);
  }
  return toks;
}

// ================= Parser =================
const FIX = { '$': [0,'r'], '>>=': [1,'l'], '>>': [1,'l'], '<$>': [4,'l'], '<*>': [4,'l'], '<>': [6,'r'], '||': [2,'r'], '&&': [3,'r'], '==': [4,'n'], '/=': [4,'n'], '<': [4,'n'], '<=': [4,'n'], '>': [4,'n'], '>=': [4,'n'],
  ':': [5,'r'], '++': [5,'r'], '+': [6,'l'], '-': [6,'l'], '*': [7,'l'], '/': [7,'l'], '^': [8,'r'], '.': [9,'r'], '!!': [9,'l'] };
const BT_FIX = { div: [7,'l'], mod: [7,'l'], quot: [7,'l'], rem: [7,'l'], elem: [4,'n'], notElem: [4,'n'] };
const RESERVED_OPS = ['=', '|', '->', '..', '::', '<-', '\\', '=>', '@', '~'];
let USER_FIX = {}; let PENDING_CLASSES = new Set(); // fixity declared in the program (infixl 6 <+>)
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
    if (k.t === 'op' && (USER_FIX[k.v] || FIX[k.v])) return { name: k.v, fix: USER_FIX[k.v] || FIX[k.v], len: 1, line: k.line };
    if (k.t === 'p' && k.v === '`') {
      const n = this.peek(1), c = this.peek(2);
      if (n && n.t === 'id' && c && c.t === 'p' && c.v === '`') return { name: n.v, fix: USER_FIX[n.v] || BT_FIX[n.v] || [9,'l'], len: 3, line: k.line };
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
  USER_FIX = {};
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.bol && t.col === 0 && t.t === 'id' && ['infixl', 'infixr', 'infix'].includes(t.v))) continue;
    const n = toks[i + 1];
    if (!n || n.t !== 'num') throw new HsError(`Line ${t.line}: write a precedence number after ${t.v}, like: ${t.v} 6 <+>`, 'parse', t.line);
    for (let j = i + 2; j < toks.length && toks[j].line === t.line; j++) {
      const o = toks[j];
      if (o.t === 'op') USER_FIX[o.v] = [n.v, t.v === 'infixl' ? 'l' : t.v === 'infixr' ? 'r' : 'n'];
      else if (o.t === 'id') USER_FIX[o.v] = [n.v, t.v === 'infixl' ? 'l' : t.v === 'infixr' ? 'r' : 'n'];
    }
  }
  const ranges = []; let s = 0;
  for (let i = 0; i < toks.length; i++) if (i > s && toks[i].bol && toks[i].col === 0) { ranges.push([s, i]); s = i; }
  if (toks.length > s) ranges.push([s, toks.length]);
  return new Parser(toks).parseDecls(ranges, true);
}

// ================= Types =================
let tvId = 0, curLevel = 0;
// program context: user data types, synonyms, constructors and record fields
const EMPTY_CTX = { types: {}, syn: {}, cons: {}, fields: {} };
let curTypes = {}, curSyn = {}, curCons = {}, curFields = {}, curClasses = {};
function setCtx(c) { curTypes = c.types; curSyn = c.syn; curCons = c.cons; curFields = c.fields; curClasses = c.classes || BUILTIN_CLASSES; }
const BUILTIN_SUPERS = { Ord: ['Eq'], Fractional: ['Num'], Applicative: ['Functor'], Monad: ['Applicative'] };
const supersOf = c => (curClasses[c] && curClasses[c].supers) || BUILTIN_SUPERS[c] || [];
function superClosure(c) { const out = []; const go = x => supersOf(x).forEach(y => { if (!out.includes(y)) { out.push(y); go(y); } }); go(c); return out; }
const entails = (set, c) => set.has(c) || [...set].some(x => superClosure(x).includes(c));
const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true });
const tvar = cls => ({ tv: tvId++, ref: null, cls: new Set(cls || []), level: curLevel });
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
  const ci = curClasses[c];
  if (ci && (ci.user || ci.hkt)) { // your own classes, and Functor / Applicative / Monad
    const inst = ci.instances[k];
    if (!inst) throw new UFail('noinst', { c, t });
    (inst.ctx || []).forEach(([c2, i]) => { if (t.args[i]) requireCls(c2, t.args[i]); });
    return;
  }
  if (c === 'Num') { if (k === 'Int' || k === 'Double') return; throw new UFail('class', { c, t }); }
  if (c === 'Fractional') { if (k === 'Double') return; throw new UFail('class', { c, t }); }
  if (c === 'Read') { if (['Int', 'Double', 'Bool'].includes(k)) return; throw new UFail('class', { c, t }); }
  const ut = curTypes[k];
  if (ut) {
    const ui = ci && ci.instances[k];
    if (ui) { (ui.ctx || []).forEach(([c2, i]) => { if (t.args[i]) requireCls(c2, t.args[i]); }); return; }
    if (!ut.deriving.has(c) && !(c === 'Eq' && (ut.deriving.has('Ord') || (curClasses.Ord && curClasses.Ord.instances[k])))) throw new UFail('deriving', { c, t });
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
const article = s => /^(a |an )/.test(s) ? s : (/^[AEIOU]/.test(s) ? 'an ' : 'a ') + '`' + s + '`';

// ---- type syntax ----
const TYPE_ARITY = { Int: 0, Integer: 0, Double: 0, Float: 0, Bool: 0, Char: 0, String: 0, Maybe: 1, Either: 2, IO: 1, Ordering: 0 };
const KNOWN_CLASSES = ['Num', 'Fractional', 'Eq', 'Ord', 'Show', 'Integral', 'Read'];
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
function parseTypeToks(toks) {
  const line = toks[0] ? toks[0].line : null;
  const fail = m => { throw new HsError(`${line ? `Line ${line}: ` : ''}${m}`, 'type', line); };
  let i = 0; const is = (t, v) => toks[i] && toks[i].t === t && (v === undefined || toks[i].v === v);
  const ctx = []; const arrow = toks.findIndex(t => t.t === 'op' && t.v === '=>');
  if (arrow >= 0) {
    for (let k = 0; k < arrow; k++) if (toks[k].t === 'con') {
      const v = toks[k + 1]; if (!v || v.t !== 'id') fail(`In the constraint before =>, write a class then a type variable, like Num a.`);
      if (!KNOWN_CLASSES.includes(toks[k].v) && !curClasses[toks[k].v] && !PENDING_CLASSES.has(toks[k].v)) fail(`I don't know the type class \`${toks[k].v}\`. Try Num, Eq, Ord, Show, Functor or Monad — or define it with \`class\`.`);
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
  const syn = curSyn[ast.name];
  if (syn) {
    if (args.length !== syn.params.length) throw new HsError(`${L}the type synonym \`${ast.name}\` needs ${syn.params.length} type argument${syn.params.length === 1 ? '' : 's'}.`, 'type', line);
    const m = {}; syn.params.forEach((p, i) => { m[p] = args[i]; });
    return buildType(syn.ast, n => { if (!m[n]) throw new HsError(`Line ${syn.line}: the type variable \`${n}\` must be listed after \`type ${ast.name}\`.`, 'type', syn.line); return m[n]; }, line, depth + 1);
  }
  const ut = curTypes[ast.name];
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
  curLevel++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  curLevel--;
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
  curLevel++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  curLevel--;
  mctx.forEach(([c, v]) => { if (vars[v]) vars[v].cls.add(c); });
  if (!vars[param]) throw new HsError(`${line ? `Line ${line}: ` : ''}a method of class \`${cls}\` must mention the class's type variable \`${param}\` in its type.`, 'type', line);
  vars[param].cls.add(cls);
  return { qs: Object.values(vars), type, method: { cls, param: vars[param] } };
}
const methodScheme = (str, cls, param) => { const { ctx, ast, line } = parseTypeToks(tokenize(str)); return methodSchemeAst(ast, ctx, line, cls, param); };
function generalize(t) {
  const qs = []; const walk = x => { x = prune(x); if (isVar(x)) { if (x.level > curLevel && !qs.includes(x)) qs.push(x); } else x.args.forEach(walk); };
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
const BUILTIN_CLASSES = {};
for (const [name, d] of Object.entries(CLASS_DEFS)) {
  const sigs = {}; for (const [m, str] of Object.entries(d.sigs)) { const { ctx, ast } = parseTypeToks(tokenize(str)); sigs[m] = { ast, mctx: ctx }; }
  const instances = {}; if (d.hkt) ['Maybe', '[]', 'Either', 'IO'].forEach(k => { instances[k] = { key: k, builtin: true, methods: {}, ctx: [] }; });
  BUILTIN_CLASSES[name] = { name, param: d.param, hkt: !!d.hkt, user: false, supers: BUILTIN_SUPERS[name] || [], sigs, required: d.required, instances, defaults: {}, dispatch: {}, arity: {} };
}
curClasses = BUILTIN_CLASSES;
for (const [n, d] of Object.entries(CLASS_DEFS)) if (d.hkt) for (const [m, str] of Object.entries(d.sigs)) { const sc = methodScheme(str, n, d.param); if (OP_TYPES[m] || FIX[m]) OPS0[m] = sc; else TENV0[m] = sc; }

// ---- the Market's class library: Semigroup, Monoid, Foldable ----
// These behave like classes you write yourself (you can add instances for your own types), but come with
// built-in instances. Their methods live in the base environment, so your own top-level definitions can shadow them.
// libScheme also remembers extra type variables (like the m in foldMap), so the runtime can pick the right mempty.
function libScheme(str, cls, param, extra = []) {
  const { ctx, ast, line } = parseTypeToks(tokenize(str));
  curLevel++; const vars = {};
  const type = buildType(ast, n => vars[n] || (vars[n] = tvar()), line);
  curLevel--;
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
let LIB_DATAS = null;

// ---- type errors ----
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
    const { c, t } = e.info; const k = prune(t).con; const ci = curClasses[c];
    const ut = curTypes[k]; const params = ut ? ut.params : [];
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
  if (curCons[name]) return curCons[name].scheme;
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
      conScheme(n.con, n.line); const info = curCons[n.con];
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
        const fi = curFields[f];
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
    curLevel++;
    const monos = {}; scc.forEach(n => { monos[n] = tvar(); ne[n] = { qs: [], type: monos[n] }; });
    scc.forEach(n => unifyAt(monos[n], inferEquations(n, defs[n], ne, null), { line: defs[n][0].line, what: `the definition of \`${n}\`` }));
    curLevel--;
    scc.forEach(n => { ne[n] = generalize(monos[n]); });
  }
  for (const n in sigs) { curLevel++; inferEquations(n, defs[n], ne, skolemize(sigs[n].toks)); curLevel--; }
  return ne;
}

// ================= Values & runtime =================
const UNIT = { tuple: [] };
const isFn = v => !!v && typeof v === 'object' && typeof v.fn === 'function';
const mkFn = (f, name) => ({ fn: f, name });
const prim = (arity, f, name) => { const go = args => mkFn(a => { const nx = [...args, a]; return nx.length === arity ? f(...nx) : go(nx); }, name); return go([]); };

// the instance a user wrote for a value's type, if any (used for Show / Eq / Ord and Functor … on your own types)
function userInst(cls, v) {
  if (!v || !v.con) return null; const info = curCons[v.con]; if (!info) return null;
  const ci = curClasses[cls]; return (ci && ci.instances[info.typeName]) || null;
}
function forceVal(f) { if (f && f.__thunk) { if (!f.done) { f.value = f.compute(); f.done = true; } return f.value; } return f; }
const instFn = (inst, name) => inst.methods[name] ? forceVal(inst.methods[name]) : null;
const PURE = x => ({ pureOf: x }); const isPure = v => !!v && typeof v === 'object' && 'pureOf' in v;
function show(v) {
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
    const info = curCons[v.con];
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
  t = prune(t);
  if (isVar(t) && t.cls.has('Fractional')) t = tDouble;
  if (isPure(v) && !isVar(t) && !t.rigid) v = pureG(t.con, v.pureOf);
  if (v === MEMPTY && !isVar(t) && !t.rigid) v = memptyT(t);
  if (isVar(t) || t.rigid) return show(v);
  { const ui = userInst('Show', v); if (ui && instFn(ui, 'show')) return strOf(apply(instFn(ui, 'show'), v)); }
  switch (t.con) {
    case 'Char': return "'" + (v === "'" ? "\\'" : v === '\n' ? '\\n' : v) + "'";
    case 'Double': return Number.isInteger(v) ? v + '.0' : show(v);
    case '[]': { const e = prune(t.args[0]); if (!isVar(e) && e.con === 'Char') return JSON.stringify(typeof v === 'string' ? v : toList(v).join('')); return '[' + toList(v).map(x => showT(x, e)).join(',') + ']'; }
    case '(,)': return '(' + v.tuple.map((x, i) => showT(x, t.args[i])).join(',') + ')';
    case 'Maybe': return v.con === 'Just' ? 'Just ' + paren(showT(v.args[0], t.args[0])) : 'Nothing';
    case 'Either': return v.con + ' ' + paren(showT(v.args[0], t.args[v.con === 'Left' ? 0 : 1]));
  }
  if (curTypes[t.con] && v && v.con && curCons[v.con]) {
    const info = curCons[v.con]; const m = {}; info.params.forEach((p, i) => { m[p] = t.args[i]; });
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
  let n = 0;
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
const toList = (v, name) => { if (Array.isArray(v)) return v; if (v instanceof LCons) return forceL(v); if (v === MEMPTY) return []; if (typeof v === 'string') return [...v]; throw new HsError(`${name} expects a list, but was given ${showShort(v)}.`); };
const fromLike = (orig, arr) => (typeof orig === 'string' && arr.every(c => typeof c === 'string' && c.length === 1)) ? arr.join('') : arr;
const tup = v => v.tuple;

function deepEq(a, b) {
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
    const x = toList(a), y = toList(b); return x.length === y.length && x.every((e, i) => deepEq(e, y[i]));
  }
  if (a && a.tuple && b && b.tuple) return a.tuple.length === b.tuple.length && a.tuple.every((e, i) => deepEq(e, b.tuple[i]));
  if (a && a.con && b && b.con) return a.con === b.con && a.args.every((e, i) => deepEq(e, b.args[i]));
  return a === b;
}
function cmp(a, b) {
  if (a && a.con && b && b.con) {
    const ui = userInst('Ord', a);
    if (ui && instFn(ui, 'compare')) { const o = apply(apply(instFn(ui, 'compare'), a), b); return o.con === 'LT' ? -1 : o.con === 'GT' ? 1 : 0; }
    if (ui && instFn(ui, '<=')) { const le = (x, y) => apply(apply(instFn(ui, '<='), x), y); return le(a, b) ? (le(b, a) ? 0 : -1) : 1; }
  }
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  if (isListV(a) && isListV(b)) {
    const x = toList(a), y = toList(b);
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
const conIndex = n => curCons[n] ? curCons[n].index : ({ Nothing: 0, Just: 1, Left: 0, Right: 1, LT: 0, EQ: 1, GT: 2 }[n] || 0);
function append(a, b) {
  if (isL(a) || isL(b)) return lazyGen(function* () { yield* iter(a, '++'); yield* iter(b, '++'); });
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  const r = [...toList(a, '++'), ...toList(b, '++')];
  return (typeof a === 'string' || typeof b === 'string') ? fromLike('', r) : r;
}
function apply(f, a) { if (!isFn(f)) throw new HsError(`${showShort(f)} isn't a function, so it can't be given an argument.`); return f.fn(a); }

// ---- IO: an action is { io: rt => value }; rt holds the output and the remaining input lines ----
const io = f => ({ io: f });
const strOf = s => typeof s === 'string' ? s : toList(s).join('');
function runAction(a, rt) {
  if (isPure(a)) return a.pureOf;
  if (!a || typeof a.io !== 'function') throw new HsError(`Expected an IO action, but got ${showShort(a)}.`);
  return a.io(rt);
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
  throw new HsError(`\`${name}\` doesn't know how to work with ${showShort(v)}${v && v.con && curCons[v.con] ? ` — there's no \`instance ${cls} ${curCons[v.con].typeName}\`` : ''}.`);
}
function fmapG(f, m) {
  if (isPure(m)) return PURE(apply(f, m.pureOf));
  if (isL(m)) return lazyGen(function* () { for (const x of iter(m)) yield apply(f, x); });
  if (isListy(m)) return fromLike(m, toList(m).map(x => apply(f, x)));
  if (m && m.io) return io(rt => apply(f, runAction(m, rt)));
  if (m && m.con === 'Just') return Just(apply(f, m.args[0])); if (m && m.con === 'Nothing') return m;
  if (m && m.con === 'Right') return Right(apply(f, m.args[0])); if (m && m.con === 'Left') return m;
  return apply(apply(userHkt('Functor', m, 'fmap'), f), m);
}
function apG(mf, mx) {
  if (isPure(mf)) return fmapG(mf.pureOf, mx);
  if (isPure(mx)) return fmapG(mkFn(f => apply(f, mx.pureOf)), mf);
  if (isListy(mf)) { const out = []; for (const f of toList(mf)) for (const x of toList(mx)) out.push(apply(f, x)); return out; }
  if (mf && mf.io) return io(rt => { const f = runAction(mf, rt); return apply(f, runAction(mx, rt)); });
  if (mf && (mf.con === 'Nothing' || mf.con === 'Left')) return mf;
  if (mf && (mf.con === 'Just' || mf.con === 'Right')) return (mx.con === 'Nothing' || mx.con === 'Left') ? mx : { con: mx.con, args: [apply(mf.args[0], mx.args[0])] };
  return apply(apply(userHkt('Applicative', mf, '<*>'), mf), mx);
}
function bindG(m, k) {
  if (isPure(m)) return apply(k, m.pureOf);
  if (isL(m)) return lazyGen(function* () { for (const x of iter(m)) { const r = apply(k, x); if (isPure(r)) yield r.pureOf; else yield* iter(r); } });
  if (isListy(m)) { const out = []; for (const x of toList(m)) { const r = apply(k, x); if (isPure(r)) out.push(r.pureOf); else out.push(...toList(r)); } return out; }
  if (m && m.io) return io(rt => runAction(apply(k, runAction(m, rt)), rt));
  if (m && (m.con === 'Nothing' || m.con === 'Left')) return m;
  if (m && (m.con === 'Just' || m.con === 'Right')) return apply(k, m.args[0]);
  return apply(apply(userHkt('Monad', m, '>>='), m), k);
}
function pureG(key, x) {
  if (!key) return PURE(x);
  if (key === 'Maybe') return Just(x); if (key === '[]') return [x]; if (key === 'Either') return Right(x); if (key === 'IO') return io(() => x);
  const mo = curClasses.Monad && curClasses.Monad.instances[key], ap = curClasses.Applicative && curClasses.Applicative.instances[key];
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
  const inst = curClasses.Monoid && curClasses.Monoid.instances[k]; if (!inst) return MEMPTY;
  if (inst.builtin) return inst.memptyFor ? inst.memptyFor(t) : forceVal(inst.methods.mempty);
  return forceVal(inst.methods.mempty);
}
function sappend(a, b) {
  if (a === MEMPTY) return b; if (b === MEMPTY) return a;
  const ci = curClasses.Semigroup; const key = valueKey(a, ci) || valueKey(b, ci);
  if (!key) throw new HsError(`\`<>\` doesn't know how to combine ${showShort(a)}${typeof a === 'number' ? '. Numbers can be combined by adding or by multiplying, so say which: Sum 3 <> Sum 4, or Product 3 <> Product 4' : ''}.`);
  return apply(apply(implFor(ci, key, '<>'), a), b);
}
const libMethodOf = (cls, key, name) => { const inst = key && curClasses[cls] && curClasses[cls].instances[key]; return inst && !inst.builtin && inst.methods[name] ? forceVal(inst.methods[name]) : null; };
function mconcatT(t, xs) { return toList(xs, 'mconcat').reduceRight((acc, x) => sappend(x, acc), memptyT(t)); }
function foldMapG(tKey, mT, f, c) {
  const ci = curClasses.Foldable; const key = tKey || valueKey(c, ci) || (c === MEMPTY ? '[]' : null);
  let r;
  if (key === '[]') r = toList(c).reduceRight((acc, x) => sappend(apply(f, x), acc), MEMPTY);
  else if (key === 'Maybe') r = c.con === 'Just' ? apply(f, c.args[0]) : isPure(c) ? apply(f, c.pureOf) : MEMPTY;
  else if (key) r = apply(apply(implFor(ci, key, 'foldMap'), f), c);
  else throw new HsError(`\`foldMap\` doesn't know how to go through ${showShort(c)}${c && c.con && curCons[c.con] ? ` — there's no \`instance Foldable ${curCons[c.con].typeName}\`` : ''}.`);
  return r === MEMPTY && mT ? memptyT(mT) : r;
}
function toListG(tKey, c) {
  const key = tKey || valueKey(c, curClasses.Foldable);
  if (key === '[]' || c === MEMPTY) return toList(c);
  if (key === 'Maybe') return c.con === 'Just' ? [c.args[0]] : [];
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
  both('Sum', (a, b) => nt('Sum', a.args[0] + b.args[0]), nt('Sum', 0), [['Num', 0]], [['Num', 0]], { libType: true });
  both('Product', (a, b) => nt('Product', a.args[0] * b.args[0]), nt('Product', 1), [['Num', 0]], [['Num', 0]], { libType: true });
  both('Min', (a, b) => cmp(a.args[0], b.args[0]) <= 0 ? a : b, undefined, [['Ord', 0]], [], { libType: true });
  both('Max', (a, b) => cmp(a.args[0], b.args[0]) >= 0 ? a : b, undefined, [['Ord', 0]], [], { libType: true });
  both('Any', (a, b) => nt('Any', a.args[0] || b.args[0]), nt('Any', false), [], [], { libType: true });
  both('All', (a, b) => nt('All', a.args[0] && b.args[0]), nt('All', true), [], [], { libType: true });
  F['[]'] = inst('[]', {}); F.Maybe = inst('Maybe', {});
}
// is v the mempty of its type? (used when comparing with the MEMPTY placeholder)
function isEmptyish(v) {
  if (v === MEMPTY) return true;
  if (isListV(v)) return takeN(v, 1).length === 0;
  if (v && v.tuple) return v.tuple.every(isEmptyish);
  if (v && v.con) {
    if (v.con === 'Nothing' || v.con === 'EQ') return true;
    const k = curCons[v.con] && curCons[v.con].typeName; const inst = k && curClasses.Monoid && curClasses.Monoid.instances[k];
    if (inst) { const e = memptyT(TC(k)); return e !== MEMPTY && deepEq(v, e); }
  }
  return false;
}
// Applicative / Monad helpers for any monad: the type checker tells us which one (key), or we look at the values.
function traverseG(key, f, xs, keep = true) {
  const l = toList(xs, 'traverse'); const done = out => keep ? out : UNIT;
  if (!l.length) return pureG(key, done([]));
  if (key === 'IO') return io(rt => done(l.map(x => runAction(apply(f, x), rt))));
  const first = apply(f, l[0]);
  if (!key && first && first.io) return io(rt => { const out = [runAction(first, rt)]; for (let i = 1; i < l.length; i++) out.push(runAction(apply(f, l[i]), rt)); return done(out); });
  const mayb = r => r && (r.con === 'Just' || r.con === 'Nothing'), eith = r => r && (r.con === 'Left' || r.con === 'Right');
  if (key === 'Maybe' || key === 'Either' || (!key && (mayb(first) || eith(first)))) {
    const out = []; let isE = key === 'Either' || eith(first);
    for (let i = 0; i < l.length; i++) {
      const r = i ? apply(f, l[i]) : first; if (isPure(r)) { out.push(r.pureOf); continue; }
      if (eith(r)) isE = true;
      if (r.con === 'Nothing' || r.con === 'Left') return r;
      out.push(r.args[0]);
    }
    return { con: isE ? 'Right' : 'Just', args: [done(out)] };
  }
  // lists, your own monads: (:) <$> f x <*> rest, from the right
  const cons = keep ? mkFn(h => mkFn(t => [h, ...toList(t)])) : mkFn(() => mkFn(u => u));
  let acc = pureG(key, done([]));
  for (let i = l.length - 1; i >= 0; i--) acc = apG(fmapG(cons, i ? apply(f, l[i]) : first), acc);
  return acc;
}
const LIBFN = {
  '<>': () => prim(2, sappend, '<>'),
  mappend: t => prim(2, (a, b) => { const own = libMethodOf('Monoid', keyOfT(t), 'mappend'); return own ? apply(apply(own, a), b) : sappend(a, b); }, 'mappend'),
  mempty: t => memptyT(t),
  mconcat: t => prim(1, xs => { const own = libMethodOf('Monoid', keyOfT(t), 'mconcat'); return own ? apply(own, xs) : mconcatT(t, xs); }, 'mconcat'),
  foldMap: (t, ex) => prim(2, (f, c) => foldMapG(keyOfT(t), ex && ex.m, f, c), 'foldMap'),
  toList: t => prim(1, c => toListG(keyOfT(t), c), 'toList'),
  traverse: t => prim(2, (f, xs) => traverseG(keyOfT(t), f, xs), 'traverse'),
  mapM: t => prim(2, (f, xs) => traverseG(keyOfT(t), f, xs), 'mapM'),
  forM: t => prim(2, (xs, f) => traverseG(keyOfT(t), f, xs), 'forM'),
  sequence: t => prim(1, xs => traverseG(keyOfT(t), mkFn(x => x), xs), 'sequence'),
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
  const ci = curClasses[ref.cls], name = ref.name;
  let key = null; if (ref.cv) { const t = prune(ref.cv); if (!isVar(t) && !t.rigid && t.con !== '@') key = t.con; }
  if (ci.hkt && !ci.user) {
    if (name === 'pure' || name === 'return') return mkFn(x => pureG(key, x), name);
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
  const c = [];
  if (typeof v === 'number') c.push(...(Number.isInteger(v) ? ['Int', 'Double'] : ['Double', 'Int']));
  else if (typeof v === 'boolean') c.push('Bool');
  else if (typeof v === 'string') { if (v.length === 1) c.push('Char'); c.push('[]'); }
  else if (Array.isArray(v) || isL(v)) c.push('[]');
  else if (v && v.tuple) c.push(v.tuple.length ? '(,)' : '()');
  else if (v && v.con) c.push(curCons[v.con] ? curCons[v.con].typeName : ({ Nothing: 'Maybe', Just: 'Maybe', Left: 'Either', Right: 'Either', LT: 'Ordering', EQ: 'Ordering', GT: 'Ordering' }[v.con]));
  else if (v && v.io) c.push('IO');
  return c.find(k => ci.instances[k]) || null;
}
function dynamicMethod(ci, name) {
  const pos = ci.dispatch[name] || [], ar = ci.arity[name] || 0;
  if (!pos.length || !ar) throw new HsError(`Haskell Town can't tell which instance of \`${ci.name}\` to use for \`${name}\` here. Add a type annotation, like (${name} :: YourType).`);
  return prim(ar, (...args) => {
    for (const p of pos) { const key = valueKey(args[p], ci); if (key) return args.reduce((f, a) => apply(f, a), implFor(ci, key, name)); }
    throw new HsError(`There's no instance of \`${ci.name}\` for ${showShort(args[pos[0]])}.`);
  }, name);
}
const BINOPS = {
  '+': prim(2, (a, b) => a + b), '-': prim(2, (a, b) => a - b), '*': prim(2, (a, b) => a * b),
  '/': prim(2, (a, b) => { if (b === 0) throw new HsError('Division by zero!'); return a / b; }),
  '^': prim(2, (a, b) => { if (b < 0) throw new HsError('Negative exponent: ^ only works with exponents of 0 or more.'); return Math.pow(a, b); }),
  '==': prim(2, (a, b) => deepEq(a, b)), '/=': prim(2, (a, b) => !deepEq(a, b)),
  '<': prim(2, (a, b) => cmp(a, b) < 0), '<=': prim(2, (a, b) => cmp(a, b) <= 0), '>': prim(2, (a, b) => cmp(a, b) > 0), '>=': prim(2, (a, b) => cmp(a, b) >= 0),
  '++': prim(2, append),
  ':': prim(2, (x, xs) => isL(xs) ? cell(x, xs) : (typeof xs === 'string' && typeof x === 'string' && x.length === 1) ? x + xs : [x, ...toList(xs, '(:)')]),
  '!!': prim(2, (xs, n) => { const l = toList(xs, '!!'); if (n < 0 || n >= l.length) throw new HsError(`Index ${n} is too large — the list only has ${l.length} items (counting from 0).`); return l[n]; }),
  '&&': prim(2, (a, b) => a && b), '||': prim(2, (a, b) => a || b),
  '.': prim(3, (f, g, x) => apply(f, apply(g, x))), '$': prim(2, (f, x) => apply(f, x)),
  '>>=': prim(2, (m, f) => bindG(m, f)), '>>': prim(2, (a, b) => bindG(a, mkFn(() => b))),
  '<$>': prim(2, (f, m) => fmapG(f, m)), '<*>': prim(2, (mf, mx) => apG(mf, mx)),
};
const PRELUDE = {};
const def = (name, arity, f) => { PRELUDE[name] = prim(arity, f, name); };
const needNonEmpty = (l, name) => { if (!l.length) throw new HsError(`${name} was called on an empty list — there's nothing there to take!`); return l; };
def('length', 1, xs => toList(xs).length);
def('sum', 1, xs => toList(xs).reduce((a, b) => a + b, 0));
def('product', 1, xs => toList(xs).reduce((a, b) => a * b, 1));
def('map', 2, (f, xs) => fromLike(xs, toList(xs).map(x => apply(f, x))));
def('filter', 2, (p, xs) => fromLike(xs, toList(xs).filter(x => apply(p, x))));
def('foldr', 3, (f, z, xs) => { const l = toList(xs); let acc = z; for (let i = l.length - 1; i >= 0; i--) acc = apply(apply(f, l[i]), acc); return acc; });
def('foldl', 3, (f, z, xs) => { let acc = z; for (const x of toList(xs)) acc = apply(apply(f, acc), x); return acc; });
def('null', 1, xs => toList(xs).length === 0);
def('head', 1, xs => needNonEmpty(toList(xs), 'head')[0]);
def('tail', 1, xs => fromLike(xs, needNonEmpty(toList(xs), 'tail').slice(1)));
def('last', 1, xs => { const l = needNonEmpty(toList(xs), 'last'); return l[l.length - 1]; });
def('init', 1, xs => fromLike(xs, needNonEmpty(toList(xs), 'init').slice(0, -1)));
def('reverse', 1, xs => fromLike(xs, [...toList(xs)].reverse()));
def('elem', 2, (x, xs) => toList(xs).some(y => deepEq(x, y)));
def('notElem', 2, (x, xs) => !toList(xs).some(y => deepEq(x, y)));
def('take', 2, (n, xs) => fromLike(xs, toList(xs).slice(0, Math.max(0, n))));
def('drop', 2, (n, xs) => fromLike(xs, toList(xs).slice(Math.max(0, n))));
def('maximum', 1, xs => needNonEmpty(toList(xs), 'maximum').reduce((a, b) => cmp(a, b) >= 0 ? a : b));
def('minimum', 1, xs => needNonEmpty(toList(xs), 'minimum').reduce((a, b) => cmp(a, b) <= 0 ? a : b));
def('max', 2, (a, b) => cmp(a, b) >= 0 ? a : b); def('min', 2, (a, b) => cmp(a, b) <= 0 ? a : b);
def('even', 1, n => n % 2 === 0); def('odd', 1, n => Math.abs(n % 2) === 1);
def('not', 1, b => !b);
def('show', 1, v => show(v));
def('concat', 1, xss => toList(xss).reduce((a, b) => append(a, b), []));
def('concatMap', 2, (f, xs) => toList(xs).map(x => apply(f, x)).reduce((a, b) => append(a, b), []));
def('zip', 2, (a, b) => { const x = toList(a), y = toList(b); return x.slice(0, Math.min(x.length, y.length)).map((e, i) => ({ tuple: [e, y[i]] })); });
def('zipWith', 3, (f, a, b) => { const x = toList(a), y = toList(b); return x.slice(0, Math.min(x.length, y.length)).map((e, i) => apply(apply(f, e), y[i])); });
def('replicate', 2, (n, x) => { if (n > 100000) throw new HsError('That is a lot of copies! Try a smaller number.'); return Array(Math.max(0, n)).fill(x); });
def('fst', 1, t => tup(t)[0]); def('snd', 1, t => tup(t)[1]);
def('id', 1, x => x); def('const', 2, (a, _b) => a); def('flip', 3, (f, a, b) => apply(apply(f, b), a));
def('abs', 1, n => Math.abs(n)); def('negate', 1, n => -n); def('subtract', 2, (a, b) => b - a);
def('succ', 1, n => n + 1); def('pred', 1, n => n - 1);
const dz = b => { if (b === 0) throw new HsError('Division by zero!'); return b; };
def('div', 2, (a, b) => Math.floor(a / dz(b)));
def('mod', 2, (a, b) => { b = dz(b); return ((a % b) + b) % b; });
def('quot', 2, (a, b) => Math.trunc(a / dz(b)));
def('rem', 2, (a, b) => a % dz(b));
def('fromIntegral', 1, n => n);
def('error', 1, s => { throw new HsError(`error: ${isListV(s) ? strOf(s) : show(s)}`); });
def('words', 1, s => strOf(s).split(/\s+/).filter(Boolean)); def('unwords', 1, ws => toList(ws).map(strOf).join(' '));
def('lines', 1, s => { const r = strOf(s).split('\n'); if (r[r.length - 1] === '') r.pop(); return r; }); def('unlines', 1, ls => toList(ls).map(l => strOf(l) + '\n').join(''));
def('all', 2, (p, xs) => toList(xs).every(x => apply(p, x))); def('any', 2, (p, xs) => toList(xs).some(x => apply(p, x)));
def('and', 1, xs => toList(xs).every(x => x)); def('or', 1, xs => toList(xs).some(x => x));
def('putStrLn', 1, s => io(rt => { emit(rt, strOf(s) + '\n'); return UNIT; }));
def('putStr', 1, s => io(rt => { emit(rt, strOf(s)); return UNIT; }));
def('print', 1, v => io(rt => { emit(rt, show(v) + '\n'); return UNIT; }));
PRELUDE.getLine = io(rt => { if (rt.pos >= rt.input.length) throw new HsError('getLine found no more input — the program asked for more lines than were typed in.'); return rt.input[rt.pos++]; });
def('return', 1, x => PURE(x)); def('pure', 1, x => PURE(x)); def('fmap', 2, (f, m) => fmapG(f, m));
def('compare', 2, (a, b) => { const c = cmp(a, b); return { con: c < 0 ? 'LT' : c > 0 ? 'GT' : 'EQ', args: [] }; });
const asMaybe = m => isPure(m) ? { con: 'Just', args: [m.pureOf] } : m;
def('fromMaybe', 2, (d, m) => { m = asMaybe(m); return m.con === 'Just' ? m.args[0] : d; });
def('catMaybes', 1, xs => toList(xs).map(asMaybe).filter(m => m.con === 'Just').map(m => m.args[0]));
def('mapMaybe', 2, (f, xs) => toList(xs).map(x => asMaybe(apply(f, x))).filter(m => m.con === 'Just').map(m => m.args[0]));
def('isJust', 1, m => asMaybe(m).con === 'Just'); def('isNothing', 1, m => asMaybe(m).con === 'Nothing');
def('either', 3, (f, g, e) => isPure(e) ? apply(g, e.pureOf) : e.con === 'Left' ? apply(f, e.args[0]) : apply(g, e.args[0]));
def('mapM_', 2, (f, xs) => io(rt => { for (const x of toList(xs)) runAction(apply(f, x), rt); return UNIT; }));
def('forM_', 2, (xs, f) => io(rt => { for (const x of toList(xs)) runAction(apply(f, x), rt); return UNIT; }));
def('mapM', 2, (f, xs) => io(rt => toList(xs).map(x => runAction(apply(f, x), rt))));
def('when', 2, (b, a) => b ? a : io(() => UNIT));
def('read', 1, s => readT(strOf(s), null));
def('lookup', 2, (k, xs) => { const hit = toList(xs).find(p => deepEq(p.tuple[0], k)); return hit ? { con: 'Just', args: [hit.tuple[1]] } : { con: 'Nothing', args: [] }; });
def('maybe', 3, (d, f, m) => m.con === 'Just' ? apply(f, m.args[0]) : d);
def('sort', 1, xs => fromLike(xs, [...toList(xs)].sort(cmp)));
def('sortOn', 2, (f, xs) => fromLike(xs, toList(xs).map(x => [apply(f, x), x]).sort((a, b) => cmp(a[0], b[0])).map(p => p[1])));
def('takeWhile', 2, (p, xs) => { const l = toList(xs); let i = 0; while (i < l.length && apply(p, l[i])) i++; return fromLike(xs, l.slice(0, i)); });
def('dropWhile', 2, (p, xs) => { const l = toList(xs); let i = 0; while (i < l.length && apply(p, l[i])) i++; return fromLike(xs, l.slice(i)); });
def('splitAt', 2, (n, xs) => { const l = toList(xs); return { tuple: [fromLike(xs, l.slice(0, Math.max(0, n))), fromLike(xs, l.slice(Math.max(0, n)))] }; });
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
  lz('and', 1, xs => { for (const x of iter(xs)) if (!x) return false; return true; });
  lz('or', 1, xs => { for (const x of iter(xs)) if (x) return true; return false; });
  lz('lookup', 2, (k, xs) => { for (const p of iter(xs)) if (deepEq(p.tuple[0], k)) return Just(p.tuple[1]); return { con: 'Nothing', args: [] }; });
  // zip and zipWith stop at the shorter list, so either one may be endless
  const zipL = (f, a, b) => (isL(a) || isL(b)) ? lazyGen(function* () { const ib = iter(b); for (const x of iter(a)) { const r = ib.next(); if (r.done) return; yield f(x, r.value); } }) : null;
  const oldZip = PRELUDE.zip, oldZipWith = PRELUDE.zipWith;
  PRELUDE.zip = prim(2, (a, b) => zipL((x, y) => ({ tuple: [x, y] }), a, b) || apply(apply(oldZip, a), b), 'zip');
  PRELUDE.zipWith = prim(3, (f, a, b) => zipL((x, y) => apply(apply(f, x), y), a, b) || apply(apply(apply(oldZipWith, f), a), b), 'zipWith');
  const oldIdx = BINOPS['!!'];
  BINOPS['!!'] = prim(2, (xs, n) => { if (!isL(xs)) return apply(apply(oldIdx, xs), n); if (n < 0) throw new HsError('!! needs an index of 0 or more.'); const h = takeN(xs, n + 1); if (h.length <= n) throw new HsError(`Index ${n} is too large — the list only has ${h.length} items (counting from 0).`); return h[n]; });
  BINOPS['++'] = prim(2, append);
}
// endless lists
def('repeat', 1, x => { const c = new LCons(x, null); c.done = true; c.t = c; return c; });
def('cycle', 1, xs => { if (!takeN(xs, 1).length) throw new HsError('cycle was given an empty list — there is nothing to repeat!'); return lazyGen(function* () { for (;;) yield* iter(xs); }); });
def('iterate', 2, (f, x) => { const go = v => new LCons(v, () => go(apply(f, v))); return go(x); });
def('scanl', 3, (f, z, xs) => lazyGen(function* () { let acc = z; yield acc; for (const x of iter(xs)) { acc = apply(apply(f, acc), x); yield acc; } }));
def('scanl1', 2, (f, xs) => lazyGen(function* () { let first = true, acc; for (const x of iter(xs)) { acc = first ? x : apply(apply(f, acc), x); first = false; yield acc; } }));
PRELUDE.otherwise = true;
PRELUDE.undefined = { __thunk: true, compute() { throw new HsError("Reached `undefined` — this part of the function hasn't been written yet. Replace undefined with your own code!", 'undefined'); } };

function conValue(name) {
  if (name === 'True') return true; if (name === 'False') return false;
  if (name === 'Nothing' || name === 'LT' || name === 'EQ' || name === 'GT') return { con: name, args: [] };
  const ar = curCons[name] ? curCons[name].arity : 1;
  if (ar === 0) return { con: name, args: [] };
  return prim(ar, (...xs) => ({ con: name, args: xs }), name);
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function lookup(env, name) {
  if (!(name in env)) throw new HsError(`I don't know anything called \`${name}\`.`);
  const v = env[name];
  if (v && v.__thunk) {
    if (v.done) return v.value;
    if (v.running) throw new HsError(`\`${name}\` is defined in terms of itself, so its value can never be worked out.`);
    v.running = true; try { v.value = v.compute(); v.done = true; } finally { v.running = false; }
    return v.value;
  }
  return v;
}
function directed(name, t) {
  const f = prune(t), a = f.args[0], r = f.args[1];
  if (name === 'show') return mkFn(v => showT(v, a), 'show');
  if (name === 'print') return mkFn(v => io(rt => { emit(rt, showT(v, a) + '\n'); return UNIT; }), 'print');
  return mkFn(s => readT(strOf(s), r), 'read');
}
function opFunction(op, env) { return BINOPS[op] || lookup(env, op); }

function match(p, v, b) {
  switch (p.p) {
    case 'var': b[p.name] = v; return true;
    case 'wild': return true;
    case 'lit': return p.lt === 'str' && isListV(v) && typeof v !== 'string' ? (takeN(v, p.v.length + 1).join('') === p.v) : v === p.v;
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
    const empty = args.some(a => (Array.isArray(a) && !a.length) || a === '');
    throw new HsError(`None of the equations for \`${name}\` match the input ${args.map(showShort).join(' ')}. Is there a case you haven't covered yet${empty ? ', like the empty list []' : ''}?`, 'nomatch');
  };
  if (arity === 0) return { __thunk: true, compute: () => run([]) };
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
function evalE(n, env) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'var': if (n.mref) return methodValue(n.mref); if (n.st) return directed(n.name, n.st); return lookup(env, n.name);
    case 'con': return conValue(n.name);
    case 'paren': case 'ann': return evalE(n.e, env);
    case 'rec': { const info = curCons[n.con]; const args = new Array(info.arity); for (const [f, e] of n.fields) args[info.fieldNames.indexOf(f)] = evalE(e, env); return { con: n.con, args }; }
    case 'upd': {
      const v = evalE(n.e, env); const info = curCons[v.con]; const args = [...v.args];
      for (const [f, e] of n.fields) { const i = info && info.fieldNames ? info.fieldNames.indexOf(f) : -1; if (i < 0) throw new HsError(`This ${v.con} value has no field \`${f}\`.`); args[i] = evalE(e, env); }
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
    case 'list': return n.items.map(i => evalE(i, env));
    case 'tuple': return n.items.length ? { tuple: n.items.map(i => evalE(i, env)) } : UNIT;
    case 'range': {
      const a = evalE(n.from, env), step = n.then ? evalE(n.then, env) - a : 1;
      if (!n.to) { const go = x => new LCons(x, () => go(x + step)); return go(a); } // [1..] and [1, 3 ..] go on forever
      const z = evalE(n.to, env);
      if (step === 0) throw new HsError('That range never moves forward, so it would go on forever.');
      const out = [];
      for (let x = a; step > 0 ? x <= z : x >= z; x += step) { out.push(x); if (out.length > 100000) throw new HsError('That range is too big for this little town (over 100,000 items).'); }
      return out;
    }
    case 'app': return apply(evalE(n.f, env), evalE(n.a, env));
    case 'neg': return -evalE(n.e, env);
    case 'bin': {
      const op = n.op;
      if (op === '&&') return evalE(n.l, env) ? evalE(n.r, env) : false;
      if (op === '||') return evalE(n.l, env) ? true : evalE(n.r, env);
      if (op === '$') return apply(evalE(n.l, env), evalE(n.r, env));
      if (op === ':' && !n.mref) { const h = evalE(n.l, env); return new LCons(h, () => evalE(n.r, env)); } // the rest of the list waits until it's needed
      if (op === '.') { const f = evalE(n.l, env), g = evalE(n.r, env); return mkFn(x => apply(f, apply(g, x))); }
      return apply(apply(n.mref ? methodValue(n.mref) : opFunction(op, env), evalE(n.l, env)), evalE(n.r, env));
    }
    case 'opfn': return n.mref ? methodValue(n.mref) : opFunction(n.op, env);
    case 'lsec': { const v = evalE(n.e, env), f = n.mref ? methodValue(n.mref) : opFunction(n.op, env); return mkFn(y => apply(apply(f, v), y)); }
    case 'rsec': { const v = evalE(n.e, env), f = n.mref ? methodValue(n.mref) : opFunction(n.op, env); return mkFn(x => apply(apply(f, x), v)); }
    case 'if': return evalE(evalE(n.c, env) ? n.t : n.e, env);
    case 'lam': return makeFunction('this lambda', [{ pats: n.pats, body: n.body, line: 0 }], env);
    case 'let': { const e2 = Object.create(env); bindGroup(n.defs, e2); return evalE(n.body, e2); }
    case 'case': {
      const v = evalE(n.scrut, env);
      for (const alt of n.alts) {
        const b = Object.create(env);
        if (!match(alt.pat, v, b)) continue;
        if (alt.guards) { for (const [g, e] of alt.guards) if (evalE(g, b)) return evalE(e, b); continue; }
        return evalE(alt.body, b);
      }
      throw new HsError(`None of the case patterns match ${showShort(v)}. Is there a case you haven't covered yet?`, 'nomatch');
    }
  }
  throw new HsError('Something unexpected happened while running your code.');
}

// ================= Public API =================
function guard(f) {
  try { return f(); }
  catch (e) {
    curLevel = 0;
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
    curLevel++; const pv = {}; d.params.forEach(p => { pv[p] = tvar(); });
    const getVar = n => { if (!pv[n]) throw new HsError(`Line ${c.line}: \`${c.name}\` uses the type variable \`${n}\`, but it isn't listed after the type's name. Write: data ${d.name} ${[...d.params, n].join(' ')} = …`, 'type', c.line); return pv[n]; };
    const fts = c.fields.map(a => buildType(a, getVar, c.line));
    curLevel--;
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
  ctx.methodOwner = {}; PENDING_CLASSES = new Set(classes.map(c => c.name));
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
    if (key === 'String' || curSyn[key]) throw err(L, `instances can't be written for \`${key}\` because it's a type synonym. ${key === 'String' ? 'Write the instance for lists instead: instance ' + inst.cls + ' [a] — or wrap the String in your own data type.' : ''}`);
    if (key === '(,)' || key === '()') throw err(L, `instances for tuples aren't supported in Haskell Town yet.`);
    if (ty.args.some(a => a.k !== 'var') || new Set(ty.args.map(a => a.name)).size !== ty.args.length)
      throw err(L, `in an instance head, the type's arguments must be different type variables, like (Tree a) or (Either e).`);
    const ut = curTypes[key]; const arity = ut ? ut.params.length : key === '[]' ? 1 : TYPE_ARITY[key];
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
      const sc = ctx.classes[sup]; const ut = curTypes[key];
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
      curLevel++; const exp = buildType(sg.ast, n => mv[n] || (mv[n] = rigid(n)), sg.line);
      sg.mctx.forEach(([c, v]) => mv[v] && mv[v].cls.add(c));
      inferEquations(m, eqs, tenv, exp); curLevel--;
    }
    for (const inst of Object.values(ci.instances)) {
      if (inst.builtin) continue;
      for (const [m, eqs] of Object.entries(inst.defs)) {
        const sk = {}; inst.argVars.forEach(v => { sk[v] = rigid(v); }); inst.ctx.forEach(([c, i]) => sk[inst.argVars[i]].cls.add(c));
        const head = TC(inst.key, ...inst.argVars.map(v => sk[v]));
        const sg = ci.sigs[m]; const mv = {};
        curLevel++;
        const exp = buildType(sg.ast, n => n === ci.param ? head : (mv[n] || (mv[n] = rigid(n))), inst.line);
        sg.mctx.forEach(([c, v]) => mv[v] && mv[v].cls.add(c));
        inferEquations(m, eqs, tenv, exp); curLevel--;
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
const accessor = f => prim(1, v => { const info = curCons[v.con]; const i = info && info.fieldNames ? info.fieldNames.indexOf(f) : -1; if (i < 0) throw new HsError(`\`${f}\` doesn't exist on a ${v.con} value.`); return v.args[i]; }, f);
function compile(src) {
  return guard(() => {
    curLevel = 0; setCtx(EMPTY_CTX);
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
function parseExprSrc(src) {
  const p = new Parser(tokenize(src)); const e = p.parseExpr();
  if (p.peek()) p.fail(`I didn't expect ${p.desc(p.peek())} here.`);
  return e;
}
function typeOf(tenv, src) { return guard(() => { curLevel = 0; if (tenv && tenv.__ctx) setCtx(tenv.__ctx); return infer(parseExprSrc(src), tenv || TENV0); }); }
// Evaluate an expression. It is type-checked first (so show/print/read know their types).
function evalIn(env, src) {
  return guard(() => {
    if (env.__ctx) setCtx(env.__ctx);
    const e = parseExprSrc(src);
    const tenv = env === PRELUDE ? TENV0 : env.__tenv;
    if (tenv) { curLevel = 0; infer(e, tenv); }
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
return { compile, evalIn, typeOf, fitsSignature, runMain, runIO, isIO, ppType, show, showT, deepEq, PRELUDE, TENV0, HsError };
})();
