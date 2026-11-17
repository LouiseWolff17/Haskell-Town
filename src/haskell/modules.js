// Modules and imports (Glaschu's library and map room).
// Everything in Haskell Town is already loaded, so most import lines change nothing. Data.Map and Data.Set are the
// exception: their functions share names with the Prelude's (lookup, filter, map …), so they are used qualified,
// like Map.lookup. Every qualified name is rewritten to one spelling, Map.x or Set.x, whatever alias the program
// picked (import qualified Data.Map as M makes M.insert mean Map.insert). Names from the always-loaded modules
// (Data.Char, Data.List …) lose their qualifier: C.toUpper is toUpper.
import { HsError } from './errors.js';

// module → the prefix its names get (Map.insert, Set.member)
const CONTAINER_MODULES = { 'Data.Map': 'Map', 'Data.Map.Strict': 'Map', 'Data.Map.Lazy': 'Map', 'Data.Set': 'Set' };
// the type each container module is named after: Map.Map and M.Map are both just Map
const MODULE_TYPE = { Map: 'Map', Set: 'Set' };
// modules whose functions are part of the built-in Prelude already
const PRELUDE_MODULES = ['Prelude', 'Data.Char', 'Data.List', 'Data.Maybe', 'Data.Either', 'Data.Foldable', 'Data.Traversable', 'Data.Functor',
  'Data.Monoid', 'Data.Semigroup', 'Data.Ord', 'Data.Function', 'Data.Tuple', 'Control.Monad', 'Control.Applicative'];
// what every program can use without an import line: Map.x and Set.x, and the full module names
const DEFAULT_ALIASES = Object.freeze({ Map: 'Map', Set: 'Set', ...CONTAINER_MODULES, ...Object.fromEntries(PRELUDE_MODULES.map(m => [m, ''])) });
const KNOWN = 'Data.Map and Data.Set (the Prelude, Data.Char, Data.List and Data.Maybe are always loaded)';

const startsLine = t => t.bol && t.col === 0;
// The program's import lines: import [qualified] Data.Map [qualified] [as M] [hiding] [(Map, fromList, (!))]
function readImports(toks) {
  const aliases = { ...DEFAULT_ALIASES }; const unqualified = [];
  for (let i = 0; i < toks.length; i++) {
    const t0 = toks[i];
    if (!(startsLine(t0) && t0.t === 'kw' && t0.v === 'import')) continue;
    const line = t0.line; let end = i + 1; while (end < toks.length && !startsLine(toks[end])) end++;
    const fail = m => { throw new HsError(`Line ${line}: ${m}`, 'parse', line); };
    let j = i + 1; const word = w => j < end && toks[j].t === 'id' && toks[j].v === w && ++j;
    let qualified = !!word('qualified');
    const m = toks[j];
    if (j >= end || m.t !== 'con') fail('after `import`, write the name of a module, like: import qualified Data.Map as Map');
    const mod = m.v; j++;
    if (word('qualified')) qualified = true;
    let alias = null;
    if (word('as')) { if (j >= end || toks[j].t !== 'con') fail(`after \`as\`, write a short name for the module, starting with a capital letter, like: import qualified ${mod} as M`); alias = toks[j++].v; }
    const hiding = !!word('hiding');
    let names = null;
    if (j < end && toks[j].t === 'p' && toks[j].v === '(') {
      names = []; j++;
      while (j < end && !(toks[j].t === 'p' && toks[j].v === ')')) {
        const k = toks[j];
        if (k.t === 'con' || k.t === 'id') { names.push(k.v); j++; if (k.t === 'con' && toks[j] && toks[j].t === 'p' && toks[j].v === '(') { while (j < end && toks[j].v !== ')') j++; j++; } } // Maybe(..)
        else if (k.t === 'p' && k.v === '(' && toks[j + 1] && toks[j + 1].t === 'op') { names.push(toks[j + 1].v); j += 3; } // (!)
        else j++;
      }
      j++;
    }
    if (j < end) fail(`I didn't expect \`${toks[j].v}\` in this import line.`);
    const pre = CONTAINER_MODULES[mod] !== undefined ? CONTAINER_MODULES[mod] : PRELUDE_MODULES.includes(mod) ? '' : undefined;
    if (qualified || alias) aliases[alias || mod] = pre !== undefined ? pre : { unknown: mod };
    if (!pre || qualified) continue;
    if (!alias && (!names || hiding))
      fail(`\`import ${mod}\` on its own would bring in names like lookup, filter and map, which clash with the Prelude's own. Import it qualified instead:\n  import qualified ${mod} as ${pre}\nand write ${pre}.insert, ${pre}.lookup … Or import just the names you need, like: import ${mod} (${pre}, fromList)`);
    if (names && !hiding) unqualified.push({ mod, prefix: pre, names, line });
  }
  return { aliases, unqualified };
}
// Rewrite every qualified name (M.insert, Data.Map.Map, Map.!) to the one spelling the type checker and the runtime know.
function resolveNames(toks, aliases) {
  let inImport = false;
  for (const t of toks) {
    if (startsLine(t)) inImport = t.t === 'kw' && t.v === 'import';
    if (inImport || t.q === undefined) continue;
    const pre = aliases[t.q], L = `Line ${t.line}: `;
    if (pre === undefined) throw new HsError(`${L}I don't know a module called \`${t.q}\` (in \`${t.v}\`). To use one, add an import line at the top, like: import qualified Data.Map as ${t.q}${t.t === 'id' ? `\nIf you meant to join two functions together, put spaces around the dot: ${t.q} . ${t.base}` : ''}`, 'scope', t.line);
    if (typeof pre === 'object') throw new HsError(`${L}Haskell Town doesn't have the module ${pre.unknown}, so \`${t.v}\` isn't available. The modules you can import are ${KNOWN}.`, 'scope', t.line);
    t.v = !pre || (t.t === 'con' && MODULE_TYPE[pre] === t.base) ? t.base : `${pre}.${t.base}`;
    delete t.q;
  }
  return toks;
}

export { DEFAULT_ALIASES, MODULE_TYPE, readImports, resolveNames };
