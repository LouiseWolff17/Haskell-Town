// The notebook: the challenge window (problem, hints, editor, results) and the Workshop.
// All Haskell goes through the runner; this file only turns its results into HTML.
import { CHALLENGES, EXPANSIONS, RESIDENTS, WORKSHOP_EXAMPLES } from '../content/index.ts';
import { createRunner } from '../runner/index.ts';
import { $, HINT_LEVELS, MODES, byId, esc, resetProgress, save, state, status } from './state.js';
import { codeBlock, highlight } from './highlight.js';
import { buildAnim, plotLabel, portrait } from './town.js';
import { notSupportedHTML, renderSidebar } from './sidebar.js';
import { ERRANDS_BY_TOPIC, cueHTML, errandById, reviews, today, topicById, villageBuilt, whenText } from './errands.js';
import { completeItem, isOpen, showAnswer } from './schedule.ts';
import { newlyOpened, nextExpansion } from './rewards.ts';

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
  if (current && (current.workshop || current.errand)) { state.mode = m; save(); renderSidebar(); return; }
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
  current = c; $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop', 'is-errand'); $('#runBtn').textContent = '▶ Run tests';
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
export function closeNotebook() { if (activeRun) runner.cancel?.(); $('#notebook').hidden = true; document.body.classList.remove('modal-open'); current = null; revealLand(); }

// New land opened by an errand is revealed once the notebook closes, so the player sees the mist lift.
let pendingLand = [];
export function queueLand(opened) { pendingLand.push(...opened); }
export function revealLand() {
  if (!pendingLand.length) return;
  const opened = pendingLand; pendingLand = [];
  const t = performance.now();
  opened.forEach(x => { buildAnim['exp-' + x.id] = t + 300; });
  const last = opened[opened.length - 1];
  toast(`<b>${last.title} has opened!</b> ${last.note}`);
  document.querySelector('.town-frame').scrollIntoView({ behavior: 'smooth', block: 'end' });
}
/** One line for the win box: what just opened, or how far it is to the next piece of land. */
function landLine(opened, solved) {
  if (opened.length) return `<div class="land-line opened">🌱 <b>${opened.map(x => x.title).join(' and ')}</b> just opened south of the railway. Close the notebook to see it.</div>`;
  const next = nextExpansion(EXPANSIONS, solved); if (!next) return '';
  const left = next.needs - solved;
  return `<div class="land-line">🌫 ${left} more errand${left === 1 ? '' : 's'} until the mist lifts on new land.</div>`;
}
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
  if (c.errand) return checkErrand();
  state.attempts[c.id] = (state.attempts[c.id] || 0) + 1; save();
  const out = $('#results');
  const r = await runner.check(c, ed.value);
  if (current !== c) return; // the notebook was closed or switched while checking
  let { html, all } = checkHTML(c, r);
  if (all) {
    const hints = Math.min(state.hints[c.id] || 0, 5);
    html += `<div class="win"><h3>What just happened</h3><p>${c.explanation}</p><div class="win-stats">Solved in ${state.attempts[c.id]} run${state.attempts[c.id] === 1 ? '' : 's'} · ${hints} hint${hints === 1 ? '' : 's'} used</div>`;
    html += state.done[c.id] ? `<div class="already">Already built ✓</div>` : `<button class="btn-build" id="buildBtn">Build ${c.reward}</button>`;
    html += `</div>`;
  }
  out.innerHTML = html;
  const bb = $('#buildBtn'); if (bb) bb.onclick = () => build(c);
}
// Turn a CheckResult into HTML. `all` is true when every test passed and no rule was broken.
function checkHTML(c, r) {
  const early = html => ({ html, all: false });
  if (r.status === 'stopped') return early(stoppedCard(r));
  if (r.status === 'compile-error') {
    const e = r.error;
    markLine(e.line);
    return early(noteCard(compileTitle(e), e.message) + `<p class="nudge">${e.kind === 'type' ? 'Like GHC, Haskell Town checks every type before running anything, so none of the tests ran yet.' : 'Fix this and run again — none of the tests ran yet.'}</p>`);
  }
  markLine(null);
  if (r.status === 'missing-function') {
    return early(noteCard(`I couldn't find ${r.fn}`, `The tests call a function named <code>${r.fn}</code>, but there's no definition for it in your notebook yet. Check the spelling — Haskell names are case-sensitive.`));
  }
  if (r.status === 'missing-parts') {
    return early(noteCard('Something the challenge needs is missing', `This challenge needs ${r.missing.map(m => MISSING[m.what](m)).join(', ')} — check the task description and the spelling.`));
  }
  if (r.status === 'signature-mismatch') {
    return early(noteCard("The types don't fit the challenge", r.message) + `<p class="nudge">The tests call <code>${c.fn}</code> with the types above, so they can't run until it fits.</p>`);
  }
  const typeLine = r.fnType ? `<div class="typeok"><span>✓ Types check out</span><code>${esc(r.fnType.fn)} :: ${esc(r.fnType.type)}</code>${r.fnType.hasSignature ? '' : '<em>(worked out by Haskell — you didn\'t even write a signature!)</em>'}</div>`
    : `<div class="typeok"><span>✓ Types check out</span><code>${r.instances.map(i => 'instance ' + esc(i)).join(' · ')}</code></div>`;
  const rows = r.tests;
  const passed = rows.filter(t => t.ok).length, all = r.passed;
  let ruleNote = '';
  if (r.ruleBreak) {
    const who = RESIDENTS[c.resident].name;
    if (r.ruleBreak.rule === 'forbidden') ruleNote = noteCard('It works — but not quite the way ' + who + ' asked', `All the tests pass, but this challenge is about writing it yourself, so please don't use ${r.ruleBreak.used.map(u => '`' + u + '`').join(' or ')}. Try making <code>${c.fn}</code> call itself instead.`);
    else ruleNote = noteCard('It works — but where is the recursion?', `All the tests pass, but this challenge is about recursion: <code>${c.fn}</code> (or a helper) should call itself.${c.hints ? ' Hint 1 shows the two cases to write.' : ''}`);
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
  if (!all && !c.errand && rows.some(r => r.error && /undefined|___/.test(r.error))) {
    html += `<p class="nudge">Not written yet? That's fine — try something, run it, and see what happens. The hints on the left are there if you get stuck.</p>`;
  }
  return { html, all };
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
  state.done[c.id] = true;
  // a Journal page: the code that built it, and the day
  (state.journal ||= {})[c.id] = { code: state.code[c.id] ?? '', day: today() };
  save();
  closeNotebook(); renderSidebar();
  const next = CHALLENGES.filter(x => status(x) === 'open');
  buildAnim[c.upgrade ? c.plot + '-deco' : (c.plot || c.id)] = performance.now();
  const noun = c.upgrade ? `${c.reward} — added!` : `${c.reward} ${['mailbox', 'garden'].includes(c.id) ? 'is ready' : 'has been built'}!`;
  toast(`<b>${noun}</b> ` + (next.length ? `New request from ${[...new Set(next.map(x => RESIDENTS[x.resident].name))].join(' & ')}.`
    : villageBuilt() ? `The whole village is built! From now on, residents pin small errands to the <b>Notice Board</b> (the Errands tab) — a few each day.` : `You've finished every request in town so far. Try the Workshop meanwhile!`));
  if (villageBuilt()) document.querySelector('.tabs button[data-tab=errands]')?.click();
  document.querySelector('.town-frame').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let toastT; function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 5200); }


// ---------- Errands: retrieval practice from the Notice Board ----------
// The player solves a small new problem on an old topic from memory. There are no hints up
// front: a peek at the Library or the full answer is there, but only after trying, and each
// one changes when the topic comes back (see schedule.ts).
const CONF = { unsure: 'Not sure', fairly: 'Fairly sure', sure: 'Sure' };
function errandItem() {
  const rs = reviews(), c = current;
  if (!rs || !c || !c.errand || rs.day.date !== c.date) return null;
  return rs.day.items[c.index] || null;
}
export function openErrand(index) {
  const rs = reviews(); const item = rs && rs.day.items[index]; if (!item) return;
  const e = errandById(item.errand), t = topicById(item.topic);
  current = { ...e, id: 'errand:' + e.id, errandId: e.id, errand: true, index, date: rs.day.date };
  $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop'); $('.nb').classList.add('is-errand'); $('#runBtn').textContent = '▶ Run tests';
  $('#nbEyebrow').textContent = `Errand · ${t.title} · from memory`;
  $('#nbTitle').textContent = e.title;
  ed.value = state.code[current.id] != null ? state.code[current.id] : e.starter; syncEditor(); markLine(null);
  renderErrandProblem(); renderErrandAssistant();
  $('#results').innerHTML = item.outcome ? `<div class="res-empty done-note">You've done this errand today. Feel free to run it again.</div>`
    : item.sawAnswer ? `<div class="res-empty">You've seen the answer to this one. Study it, then try the new errand on ${t.title} on the Notice Board, from memory.</div>`
    : `<div class="res-empty">Write it from memory first, then press <b>Run tests</b>. A wrong first try is fine: trying to remember is what does the work.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open');
  setTimeout(() => ed.focus(), 50);
}
function renderErrandProblem() {
  const c = current, r = RESIDENTS[c.resident];
  const ex = c.ioExamples ? `<h3>Example run</h3>${c.ioExamples.map(x => `<div class="io-ex"><div><span>You type</span><pre class="console">${esc(x.input)}</pre></div><div><span>It prints</span><pre class="console">${esc(x.out)}</pre></div></div>`).join('')}`
    : `<h3>Examples</h3>${codeBlock(c.examples.map(([a, b]) => `${a.padEnd(Math.max(...c.examples.map(e => e[0].length)) + 2)}-- ${b}`).join('\n'))}`;
  $('#problem').innerHTML = `<div class="story"><div class="story-p"></div><div><div class="who">${r.name} <span>the ${r.role}</span></div><p>${c.story}</p></div></div>
    <h3>Your task</h3><p>${c.task}</p>${c.sig ? `<div class="sig-line">Type signature ${codeBlock(c.sig)}</div>` : ''}${ex}`;
  $('#problem').querySelector('.story-p').appendChild(portrait(c.resident, 52));
}
function renderErrandAssistant() {
  const item = errandItem(); if (!item) return;
  const c = current, t = topicById(item.topic), a = $('#assistant');
  let html = `<div class="primer recall"><div class="primer-h">From memory · ${t.title}</div><p>No hints up front this time. Give it a real try before looking anything up: struggling to remember is what makes it stick.</p></div>`;
  html += `<div class="hints-h"><span>How sure are you?</span></div>`;
  if (item.runs === 0 && isOpen(item)) {
    html += `<p class="conf-q">Before you run it: how sure are you that it will pass first time?</p><div class="conf-seg">${Object.entries(CONF).map(([k, l]) => `<button data-conf="${k}" class="${item.confidence === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  } else {
    html += `<p class="conf-q">${item.confidence ? `You said: <b>${CONF[item.confidence]}</b>.` : `You didn't say. Next time, try guessing before you run: it helps you notice what you really know.`}</p>`;
  }
  if (isOpen(item)) {
    html += `<div class="hints-h"><span>Stuck?</span></div>`;
    html += item.cue ? `<div class="cue">${cueHTML(item.topic)}</div>` : `<button class="btn-soft" id="cueBtn">Peek at the Library cards for ${t.title}</button>`;
    html += `<button class="btn-soft ghost" id="answerBtn">I can't remember — show me the answer</button>`;
    html += `<p class="no-penalty">Looking is fine. It only changes when this topic comes back: a peek keeps the gap the same, and after seeing the answer, a new errand on ${t.title} comes back later today.</p>`;
  } else if (item.sawAnswer) {
    html += answerHTML(c);
  }
  a.innerHTML = html;
  a.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => { item.confidence = b.dataset.conf; save(); renderErrandAssistant(); });
  const cb = $('#cueBtn'); if (cb) cb.onclick = () => { item.cue = true; save(); renderErrandAssistant(); };
  const ab = $('#answerBtn'); if (ab) ab.onclick = () => {
    showAnswer(state.reviews, item, ERRANDS_BY_TOPIC[item.topic]); save(); renderSidebar(); renderErrandAssistant();
    $('#results').innerHTML = `<div class="res-empty">Read the answer through and make sense of it. Then close this: a <b>new errand on ${t.title}</b> is now at the end of today's list, to do from memory.</div>`;
  };
}
function answerHTML(c) {
  return `<div class="solution"><div class="hint-lv">One way to write it</div>${codeBlock(c.solution)}<p>${c.explanation}</p></div>`;
}
async function checkErrand() {
  const c = current, item = errandItem();
  if (!item) { $('#results').innerHTML = noteCard('A new day has started', 'Today has new errands. Close this and open one from the Notice Board.'); return; }
  const counts = isOpen(item);
  if (counts) { item.runs++; save(); if (item.runs === 1) renderErrandAssistant(); } // the confidence guess is locked once you run
  const r = await runner.check(c, ed.value);
  if (current !== c) return;
  let { html, all } = checkHTML(c, r);
  if (all && counts) {
    const before = state.reviews.log.length;
    const outcome = completeItem(state.reviews, item, today());
    (state.errandCode ||= {})[c.errandId] = ed.value; // shown on the errand's Journal stamp
    const opened = newlyOpened(EXPANSIONS, before, state.reviews.log.length);
    pendingLand.push(...opened);
    save();
    const p = state.reviews.topics[item.topic], t = topicById(item.topic), who = RESIDENTS[c.resident].name;
    const headline = { recalled: 'Remembered, first try!', effortful: 'Done — and that effort counts.', relearned: 'Relearned!' }[outcome];
    const body = {
      recalled: `You pulled it straight from memory. ${t.title} will come back after a longer gap.`,
      effortful: `Getting there after ${item.runs > 1 ? 'a few runs' : 'a peek'} is still real practice: you had to work to remember, and that strengthens it.`,
      relearned: `You saw an answer earlier and then solved a new one yourself. That second recall is the one that sticks.`,
    }[outcome];
    let conf = '';
    if (item.confidence) {
      const first = outcome === 'recalled';
      conf = `<p class="conf-res">You felt <b>${CONF[item.confidence].toLowerCase()}</b>, and it ${first ? 'passed first time' : "didn't pass first time"}. ${
        item.confidence === 'sure' && !first ? 'Feeling sure and being sure aren\'t the same: worth remembering next time.'
        : item.confidence === 'unsure' && first ? 'You knew more than you thought!' : 'Nicely judged.'}</p>`;
    }
    html += `<div class="win"><h3>${headline}</h3><p>${body}</p>${conf}<details class="compare"><summary>Compare with one way to write it</summary>${answerHTML(c)}</details>
      <div class="win-stats">${who} will pin up another ${t.title} errand <b>${whenText(p.due)}</b>.</div>${landLine(opened, state.reviews.log.length)}<button class="btn-build" id="boardBtn">Back to the Notice Board</button></div>`;
    renderSidebar(); renderErrandAssistant();
  } else if (all) {
    html += `<div class="win"><h3>All tests pass</h3><p>${item.sawAnswer ? `Now try the new ${topicById(item.topic).title} errand on the Notice Board, from memory.` : 'This errand is already done for today.'}</p><button class="btn-build" id="boardBtn">Back to the Notice Board</button></div>`;
  } else if (counts && r.status === 'tested') {
    html += `<p class="nudge">Not quite yet. Look at what failed and try again: a wrong try followed by a fix is still good practice.</p>`;
  }
  $('#results').innerHTML = html;
  const bb = $('#boardBtn'); if (bb) bb.onclick = () => { closeNotebook(); document.querySelector('.tabs button[data-tab=errands]')?.click(); };
}

// ---------- Workshop: free play with the whole language ----------
const WORKSHOP = { id: 'workshop', workshop: true };
function openWorkshop() {
  current = WORKSHOP; $('#modeNote').textContent = '';
  $('.nb').classList.remove('is-errand'); $('.nb').classList.add('is-workshop'); $('#runBtn').textContent = '▶ Check & run';
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
  $('#resetBtn').onclick = () => { if (!current) return; if (current.workshop) { loadExample(0); return; } ed.value = current.errand ? current.starter : starterFor(current); state.code[current.id] = ed.value; save(); syncEditor(); $('#modeNote').textContent = ''; ed.focus(); };
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
