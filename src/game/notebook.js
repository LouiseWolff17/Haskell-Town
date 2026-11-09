// The notebook: the challenge window (problem, hints, editor, results) and the Workshop.
// All Haskell goes through the runner; this file only turns its results into HTML.
import { CHALLENGES, RESIDENTS, WORKSHOP_EXAMPLES } from '../content/index.ts';
import { createRunner } from '../runner/index.ts';
import { $, HINT_LEVELS, MODES, byId, esc, resetProgress, save, state, status } from './state.js';
import { codeBlock, highlight } from './highlight.js';
import { buildAnim, plotLabel, portrait } from './town.js';
import { notSupportedHTML, renderSidebar } from './sidebar.js';

const runner = createRunner();

let current = null;
const ed = $('#code'), hl = $('#hl'), gutter = $('#gutter');
function syncEditor() {
  hl.innerHTML = highlight(ed.value) + (ed.value.endsWith('\n') ? ' ' : '');
  const lines = ed.value.split('\n').length; gutter.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  hl.scrollTop = ed.scrollTop; hl.scrollLeft = ed.scrollLeft; gutter.scrollTop = ed.scrollTop;
}
function starterFor(c, mode = state.mode) { return c.starter[mode]; }
export function setMode(m) {
  if (current && current.workshop) { state.mode = m; save(); renderSidebar(); return; }
  const prev = state.mode; state.mode = m; save(); renderSidebar();
  if (current) {
    const code = ed.value; const untouched = !code.trim() || Object.values(current.starter).includes(code);
    if (untouched) { ed.value = starterFor(current); state.code[current.id] = ed.value; save(); syncEditor(); $('#modeNote').textContent = ''; }
    else if (prev !== m) $('#modeNote').textContent = `Your code was kept. Press Reset to load the ${MODES[m].label} starter.`;
    renderProblem(); renderAssistant();
  }
}
export function openChallenge(id) {
  const c = byId(id); if (status(c) === 'locked') return;
  current = c; $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop'); $('#runBtn').textContent = '▶ Run tests';
  $('#nbEyebrow').textContent = `Challenge ${String(c.num).padStart(2, '0')} · ${c.stage}`;
  $('#nbTitle').textContent = c.title;
  ed.value = state.code[id] != null ? state.code[id] : starterFor(c); syncEditor();
  renderProblem(); renderAssistant();
  $('#results').innerHTML = state.done[id]
    ? `<div class="res-empty done-note">You've already built <b>${c.reward}</b>. Feel free to experiment — run the tests any time.</div>`
    : `<div class="res-empty">Write your function, then press <b>Run tests</b> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Mistakes are part of the fun — nothing breaks here.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open');
  setTimeout(() => ed.focus(), 50);
}
export function closeNotebook() { if (activeRun) runner.cancel?.(); $('#notebook').hidden = true; document.body.classList.remove('modal-open'); current = null; }
function renderProblem() {
  const c = current, r = RESIDENTS[c.resident];
  const p = $('#problem');
  p.innerHTML = `<div class="story"><div class="story-p"></div><div><div class="who">${r.name} <span>the ${r.role}</span></div><p>${c.story}</p></div></div>
    <h3>Your task</h3><p>${c.task}${state.mode !== 'independent' || !c.fn ? '' : ` Name it <code>${c.fn}</code>.`}</p>
    ${state.mode !== 'independent' && c.sig ? `<div class="sig-line">Type signature ${codeBlock(c.sig)}</div>` : ''}
    ${c.ioExamples ? `<h3>Example run</h3>${c.ioExamples.map(x => `<div class="io-ex"><div><span>You type</span><pre class="console">${esc(x.input)}</pre></div><div><span>It prints</span><pre class="console">${esc(x.out)}</pre></div></div>`).join('')}`
      : `<h3>Examples</h3>${codeBlock(c.examples.map(([a, b]) => `${a.padEnd(Math.max(...c.examples.map(e => e[0].length)) + 2)}-- ${b}`).join('\n'))}`}`;
  p.querySelector('.story-p').appendChild(portrait(c.resident, 52));
}
function renderAssistant() {
  const c = current, n = state.hints[c.id] || 0;
  const a = $('#assistant');
  const primer = `<div class="primer"><div class="primer-h">Today's concept · ${c.concept}</div><p>${c.primer}</p>${codeBlock(c.primerCode)}</div>`;
  let html = state.mode === 'guided' ? primer : `<details class="primer-d"><summary>Concept refresher · ${c.concept}</summary>${primer}</details>`;
  html += `<div class="hints-h"><span>Hints</span><span class="hint-count">${Math.min(n, 4)} of 4 revealed</span></div><ol class="hints">`;
  for (let i = 0; i < Math.min(n, 4); i++) html += `<li><div class="hint-lv">${i + 1} · ${HINT_LEVELS[i]}</div><div>${c.hints[i]}</div></li>`;
  html += `</ol>`;
  if (n < 4) html += `<button class="btn-soft" id="hintBtn">Reveal hint ${n + 1} · ${HINT_LEVELS[n]}</button>`;
  else if (n === 4) html += `<button class="btn-soft" id="hintBtn">Show a full solution (optional)</button>`;
  else html += `<div class="solution"><div class="hint-lv">Full solution</div>${codeBlock(c.solution)}<button class="btn-soft" id="useSol">Put this in my notebook</button></div>`;
  html += `<p class="no-penalty">Hints never cost anything — the reward is the same however you get there.</p>`;
  a.innerHTML = html;
  const hb = $('#hintBtn'); if (hb) hb.onclick = () => { state.hints[c.id] = n + 1; save(); renderAssistant(); };
  const us = $('#useSol'); if (us) us.onclick = () => { ed.value = c.solution; state.code[c.id] = ed.value; save(); syncEditor(); };
}

const compileTitle = e => e.kind === 'type' ? "The types don't fit together yet" : e.kind === 'scope' ? 'An unknown name' : 'The compiler has a note for you';
const MISSING = {
  type: m => `a data type called <code>${m.name}</code>`,
  constructor: m => `a constructor called <code>${m.name}</code>`,
  field: m => `a record field called <code>${m.name}</code>`,
  class: m => `a class called <code>${m.name}</code>`,
  instance: m => `<code>instance ${m.cls} ${m.type}</code>`,
};

// ---------- Running code ----------
// The runner works in the background (a Web Worker), so while code runs the Run
// button becomes Stop, and slow code is stopped after a while instead of freezing the page.
let activeRun = null;
const runLabel = () => (current && current.workshop ? '▶ Check & run' : '▶ Run tests');
// Run `task` unless something is already running. With restart, stop the current run first.
function whileRunning(task, restart = false) {
  if (activeRun) {
    if (!restart) return activeRun;
    runner.cancel?.();
    return activeRun.then(() => whileRunning(task));
  }
  const btn = $('#runBtn');
  btn.textContent = '■ Stop'; btn.classList.add('stop');
  const slow = setTimeout(() => { $('#results').innerHTML = `<div class="res-empty running">Running your code<span class="dots-anim"></span></div>`; }, 400);
  activeRun = (async () => {
    try { return await task(); }
    finally { clearTimeout(slow); activeRun = null; btn.textContent = runLabel(); btn.classList.remove('stop'); }
  })();
  return activeRun;
}
function stoppedCard(r) {
  if (r.reason === 'cancelled') return noteCard('Stopped', `You stopped your code after ${r.seconds} seconds. Change something and run it again whenever you like.`);
  return noteCard(`Still running after ${r.seconds} seconds`, "I stopped your code so the page wouldn't freeze. It might be stuck in an endless loop, or doing far more work than it needs to: a function that recomputes the same values again and again, like a naive `fib`, can take ages.\nTip: Check that every recursive call gets closer to a base case, and try a smaller input first.");
}

function runTests() { return whileRunning(checkNotebook); }
function workshopRun(forceMain) { return whileRunning(() => doWorkshopRun(forceMain)); }
function workshopEval() { return whileRunning(doWorkshopEval); }

// Check the notebook against the current challenge (via the runner) and show the results.
async function checkNotebook() {
  const c = current; if (!c) return;
  if (c.workshop) return doWorkshopRun();
  state.attempts[c.id] = (state.attempts[c.id] || 0) + 1; save();
  const out = $('#results');
  const r = await runner.check(c, ed.value);
  if (current !== c) return; // the notebook was closed or switched while checking
  if (r.status === 'stopped') { out.innerHTML = stoppedCard(r); return; }
  if (r.status === 'compile-error') {
    const e = r.error;
    out.innerHTML = noteCard(compileTitle(e), e.message) + `<p class="nudge">${e.kind === 'type' ? 'Like GHC, Haskell Town checks every type before running anything, so none of the tests ran yet.' : 'Fix this and run again — none of the tests ran yet.'}</p>`;
    markLine(e.line); return;
  }
  markLine(null);
  if (r.status === 'missing-function') {
    out.innerHTML = noteCard(`I couldn't find ${r.fn}`, `The tests call a function named <code>${r.fn}</code>, but there's no definition for it in your notebook yet. Check the spelling — Haskell names are case-sensitive.`); return;
  }
  if (r.status === 'missing-parts') {
    out.innerHTML = noteCard('Something the challenge needs is missing', `This challenge needs ${r.missing.map(m => MISSING[m.what](m)).join(', ')} — check the task description and the spelling.`); return;
  }
  if (r.status === 'signature-mismatch') {
    out.innerHTML = noteCard("The types don't fit the challenge", r.message) + `<p class="nudge">The tests call <code>${c.fn}</code> with the types above, so they can't run until it fits.</p>`; return;
  }
  const typeLine = r.fnType ? `<div class="typeok"><span>✓ Types check out</span><code>${esc(r.fnType.fn)} :: ${esc(r.fnType.type)}</code>${r.fnType.hasSignature ? '' : '<em>(worked out by Haskell — you didn\'t even write a signature!)</em>'}</div>`
    : `<div class="typeok"><span>✓ Types check out</span><code>${r.instances.map(i => 'instance ' + esc(i)).join(' · ')}</code></div>`;
  const rows = r.tests;
  const passed = rows.filter(t => t.ok).length, all = r.passed;
  let ruleNote = '';
  if (r.ruleBreak) {
    const who = RESIDENTS[c.resident].name;
    if (r.ruleBreak.rule === 'forbidden') ruleNote = noteCard('It works — but not quite the way ' + who + ' asked', `All the tests pass, but this challenge is about writing it yourself, so please don't use ${r.ruleBreak.used.map(u => '`' + u + '`').join(' or ')}. Try making <code>${c.fn}</code> call itself instead.`);
    else ruleNote = noteCard('It works — but where is the recursion?', `All the tests pass, but this challenge is about recursion: <code>${c.fn}</code> (or a helper) should call itself. Hint 1 shows the two cases to write.`);
  }
  let html = `<div class="res-head ${all ? 'ok' : ''}"><span>${all ? 'All tests pass!' : `${passed} of ${rows.length} tests pass`}</span><span class="dots">${rows.map(r => `<i class="${r.ok ? 'ok' : 'no'}"></i>`).join('')}</span></div>${typeLine}<ul class="tests">`;
  rows.forEach(r => {
    html += `<li class="${r.ok ? 'ok' : 'no'}"><span class="mark">${r.ok ? '✓' : '✗'}</span><div><code class="expr">${esc(r.expr)}</code>`;
    if (r.ok) html += `<div class="val">gave <code>${esc(r.got)}</code></div>`;
    else if (r.error) html += `<div class="val err">${esc(r.error)}</div>`;
    else html += `<div class="val">expected <code>${esc(r.want)}</code>, but got <code>${esc(r.got)}</code></div>`;
    html += `</div></li>`;
  });
  html += '</ul>' + ruleNote;
  if (all) {
    const hints = Math.min(state.hints[c.id] || 0, 5);
    html += `<div class="win"><h3>What just happened</h3><p>${c.explanation}</p><div class="win-stats">Solved in ${state.attempts[c.id]} run${state.attempts[c.id] === 1 ? '' : 's'} · ${hints} hint${hints === 1 ? '' : 's'} used</div>`;
    html += state.done[c.id] ? `<div class="already">Already built ✓</div>` : `<button class="btn-build" id="buildBtn">Build ${c.reward}</button>`;
    html += `</div>`;
  } else if (rows.some(r => r.error && /undefined|___/.test(r.error))) {
    html += `<p class="nudge">Not written yet? That's fine — try something, run it, and see what happens. The hints on the left are there if you get stuck.</p>`;
  }
  out.innerHTML = html;
  const bb = $('#buildBtn'); if (bb) bb.onclick = () => build(c);
}
function noteCard(title, msg) {
  const [first, ...rest] = msg.split('\n');
  const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const exp = rest.filter(l => /^\s+(Expected|Found):/.test(l)).map(l => { const m = l.trim().match(/^(Expected|Found):\s*(.*)$/); return `<div class="tm-row"><span>${m[1]}</span><code>${esc(m[2])}</code></div>`; }).join('');
  const tip = rest.filter(l => l.startsWith('Tip:')).map(l => `<div class="tip">💡 ${fmt(l.slice(4).trim())}</div>`).join('');
  const codeLines = rest.filter(l => !/^\s+(Expected|Found):/.test(l) && !l.startsWith('Tip:'));
  const code = codeLines.length ? codeBlock(codeLines.map(l => l.replace(/^  /, '')).join('\n')) : '';
  return `<div class="note"><div class="note-h">${title}</div><div>${fmt(first)}</div>${exp ? `<div class="tm">${exp}</div>` : ''}${code}${tip}</div>`;
}
function markLine(line) { gutter.querySelectorAll('.bad').forEach(x => x.classList.remove('bad')); if (!line) return; const lines = ed.value.split('\n').length; gutter.innerHTML = Array.from({ length: lines }, (_, i) => i + 1 === line ? `<span class="bad">${i + 1}</span>` : i + 1).join('<br>'); }

export function build(c) {
  state.done[c.id] = true; save();
  closeNotebook(); renderSidebar();
  const next = CHALLENGES.filter(x => status(x) === 'open');
  buildAnim[c.upgrade ? c.plot + '-deco' : (c.plot || c.id)] = performance.now();
  const noun = c.upgrade ? `${c.reward} — added!` : `${c.reward} ${['mailbox', 'garden'].includes(c.id) ? 'is ready' : 'has been built'}!`;
  toast(`<b>${noun}</b> ` + (next.length ? `New request from ${[...new Set(next.map(x => RESIDENTS[x.resident].name))].join(' & ')}.` : `You've finished every request in town so far. More neighbourhoods are on the way — try the Workshop meanwhile!`));
  document.querySelector('.town-frame').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let toastT; function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 5200); }

// ---------- Workshop: free play with the whole language ----------
const WORKSHOP = { id: 'workshop', workshop: true };
function openWorkshop() {
  current = WORKSHOP; $('#modeNote').textContent = '';
  $('.nb').classList.add('is-workshop'); $('#runBtn').textContent = '▶ Check & run';
  $('#nbEyebrow').textContent = 'Free play · no tests, no pressure';
  $('#nbTitle').textContent = 'The Workshop';
  ed.value = state.code.workshop != null ? state.code.workshop : WORKSHOP_EXAMPLES[0].code; syncEditor();
  $('#problem').innerHTML = `<p>The Workshop is your own corner of town for trying anything: your own <b>data types</b>, <b>records</b>, <b>list comprehensions</b> and <b>IO with do blocks</b>. These are the tools for the School, the Library and City Hall later on.</p>
    <details class="notsup ws-ns">${notSupportedHTML()}</details>
    <h3>Start from an example</h3><div class="ex-list">${WORKSHOP_EXAMPLES.map((x, i) => `<button class="ex" data-i="${i}"><b>${x.title}</b><span>${x.blurb}</span></button>`).join('')}</div>`;
  $('#problem').querySelectorAll('.ex').forEach(b => b.onclick = () => loadExample(+b.dataset.i));
  $('#assistant').innerHTML = `<h3 style="margin-top:0">Try an expression</h3>
    <div class="evalrow"><span class="prompt">λ&gt;</span><input id="wsExpr" spellcheck="false" autocomplete="off" placeholder="e.g. map area [Circle 1]"><button class="btn-soft" id="wsEval">Evaluate</button></div>
    <h3>Input for getLine</h3><textarea id="wsInput" spellcheck="false" rows="3" placeholder="One line per getLine"></textarea>
    <button class="btn-soft" id="wsMain" style="margin-top:8px">▶ Run main</button>
    <p class="no-penalty">Everything here is checked for types first, just like in the challenges.</p>`;
  $('#wsExpr').value = state.wsExpr || ''; $('#wsInput').value = state.wsInput || '';
  $('#wsExpr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); workshopEval(); } });
  $('#wsExpr').addEventListener('input', e => { state.wsExpr = e.target.value; save(); });
  $('#wsInput').addEventListener('input', e => { state.wsInput = e.target.value; save(); });
  $('#wsEval').onclick = workshopEval; $('#wsMain').onclick = () => workshopRun(true);
  $('#results').innerHTML = `<div class="res-empty">Press <b>Check &amp; run</b> to type-check your code (and run <code>main</code> if there is one), or evaluate an expression on the left.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open'); setTimeout(() => ed.focus(), 50);
}
function loadExample(i) {
  const x = WORKSHOP_EXAMPLES[i];
  ed.value = x.code; state.code.workshop = x.code; syncEditor();
  $('#wsExpr').value = state.wsExpr = x.expr || ''; $('#wsInput').value = state.wsInput = x.input || ''; save();
  markLine(null);
  whileRunning(x.expr ? doWorkshopEval : () => doWorkshopRun(true), true);
}
function showCompileError(e) { $('#results').innerHTML = noteCard(compileTitle(e), e.message); markLine(e.line); }
// summary: a ProgramSummary from the runner
function typesBlock(summary) {
  const names = Object.keys(summary.types);
  const lines = [...summary.datas.map(d => `data ${d.name}${d.params.map(p => ' ' + p).join('')}  -- ${d.cons.join(' | ')}`),
    ...summary.classes.flatMap(c => [`class ${c.name} ${c.param}`, ...c.methods.map(m => '  ' + m)]), ...summary.instances.map(i => `instance ${i}`),
    ...names.map(n => `${/^[a-z_]/.test(n) ? n : '(' + n + ')'} :: ${summary.types[n]}`)];
  return lines.length ? `<div class="typeok ws"><span>✓ Types check out</span></div>${codeBlock(lines.join('\n'))}` : `<div class="typeok ws"><span>✓ Nothing to check yet</span></div>`;
}
function outputBlock(r) {
  return `<div class="ws-h">Output</div><pre class="console">${esc(r.out || '')}${r.out ? '' : '<span class="dim">(nothing printed)</span>'}</pre>${r.error ? noteCard('The program stopped', r.error.message) : ''}`;
}
async function doWorkshopRun(forceMain) {
  const r = await runner.runMain(ed.value, $('#wsInput') ? $('#wsInput').value : '');
  if (current !== WORKSHOP) return;
  if (r.status === 'stopped') { $('#results').innerHTML = stoppedCard(r); return; }
  if (r.status === 'compile-error') { showCompileError(r.error); return; }
  markLine(null);
  let html = typesBlock(r.summary);
  if (r.status === 'ran') html += outputBlock(r.output);
  else if (forceMain === true) html += noteCard('No main yet', 'There is no `main` to run. Write one, like:  main = putStrLn "Hello!"');
  $('#results').innerHTML = html;
}
async function doWorkshopEval() {
  const expr = $('#wsExpr').value.trim(); if (!expr) return doWorkshopRun();
  const r = await runner.evaluate(ed.value, expr, $('#wsInput').value);
  if (current !== WORKSHOP) return;
  if (r.status === 'stopped') { $('#results').innerHTML = `<div class="ws-h">λ&gt; ${esc(expr)}</div>` + stoppedCard(r); return; }
  if (r.status === 'compile-error') { showCompileError(r.error); return; }
  markLine(null);
  if (r.status === 'expr-error') { $('#results').innerHTML = noteCard(r.error.kind === 'type' ? "The types don't fit together yet" : 'The compiler has a note for you', r.error.message.replace(/^Line 1: /, '')); return; }
  let html = `<div class="ws-h">λ&gt; ${esc(expr)}</div>`;
  if (r.runtimeError) html += noteCard('It stopped while running', r.runtimeError.message);
  else {
    html += r.output ? outputBlock(r.output) : `<pre class="console result">${esc(r.value)}</pre>`;
    html += `<div class="ws-type">it :: <code>${esc(r.type)}</code></div>`;
  }
  $('#results').innerHTML = html + `<details class="ws-defs"><summary>Types in your file</summary>${typesBlock(r.summary)}</details>`;
}

export function initNotebook() {
  ed.addEventListener('input', () => { if (current) { state.code[current.id] = ed.value; save(); } syncEditor(); });
  ed.addEventListener('scroll', syncEditor);
  ed.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart; ed.setRangeText('  ', s, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runTests(); }
  });
  $('#nbClose').onclick = closeNotebook;
  $('#notebook').addEventListener('click', e => { if (e.target.id === 'notebook') closeNotebook(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#notebook').hidden) closeNotebook(); });
  $('#resetBtn').onclick = () => { if (!current) return; if (current.workshop) { loadExample(0); return; } ed.value = starterFor(current); state.code[current.id] = ed.value; save(); syncEditor(); $('#modeNote').textContent = ''; ed.focus(); };
  $('#runBtn').onclick = () => (activeRun ? runner.cancel?.() : runTests());

  // reset progress (two-step, no confirm dialog)
  let resetArmed = false;
  $('#resetProgress').onclick = () => {
    const b = $('#resetProgress');
    if (!resetArmed) { resetArmed = true; b.textContent = 'Click again to start over'; setTimeout(() => { resetArmed = false; b.textContent = 'Start town over'; }, 3000); return; }
    resetProgress(); resetArmed = false; b.textContent = 'Start town over'; renderSidebar();
  };

  $('#workshopBtn').onclick = openWorkshop;

  $('#nsLink').onclick = () => {
    document.querySelector('.tabs button[data-tab=library]').click();
    const d = document.querySelector('#library .notsup'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
}
