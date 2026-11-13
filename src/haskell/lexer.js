// Lexer: source text → tokens { t, v, line, col, bol }.
import { HsError } from './errors.js';

const OPCHARS = '+-*/<>=!&|:.$^\\@~%#?';
const KW = new Set(['if','then','else','let','in','case','of','where','data','type','newtype','module','import','do','class','instance','deriving']);
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

export { tokenize };
