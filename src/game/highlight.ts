// Haskell syntax highlighting for the editor and code blocks.
import { esc } from './state.ts';

const TOKEN_CLASSES = ['hole', 'com', 'str', 'str', 'num', 'kw', 'ty', 'fnd', 'undef', 'sym'];

/** Haskell source as HTML, each token wrapped in a `t-<kind>` span. */
export function highlight(src: string): string {
  const re = /(___)|(--[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)')|(\b\d+(?:\.\d+)?\b)|(\b(?:if|then|else|let|in|case|of|where|data|type|newtype|module|import|do|otherwise|class|instance|deriving|infixl|infixr|infix)\b)|(\b[A-Z][A-Za-z0-9_']*)|((?:^|(?<=\n))[a-z_][A-Za-z0-9_']*)|(\b(?:undefined)\b)|(::|->|=>|<-|\\)/g;
  let out = '', last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const g = m.slice(1).findIndex(x => x !== undefined);
    out += `<span class="t-${TOKEN_CLASSES[g]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}
export const codeBlock = (s: string): string => `<pre class="code">${highlight(s)}</pre>`;
