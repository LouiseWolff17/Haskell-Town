// The notebook: the challenge window (problem, hints, editor, results) and the Workshop.
// All Haskell goes through the runner; this file only turns its results into HTML.
import { CHALLENGES, COINS, EXPANSIONS, FRIENDSHIP, HEARTS, LIFE, RESIDENTS, WORKSHOP_EXAMPLES } from '../content/index.ts';
import { createRunner } from '../runner/index.ts';
import { $, HINT_LEVELS, MODES, byId, esc, resetProgress, save, state, status } from './state.ts';
import { codeBlock, highlight } from './highlight.ts';
import { buildAnim, portrait, showLand } from './town.ts';
import { notSupportedHTML, renderSidebar } from './sidebar.ts';
import { RETRY_ERRANDS, cueHTML, errandById, heartRow, hearts, practised, reviews, today, topicById, topicLabel, villageBuilt, whenText } from './errands.ts';
import { completeItem, isOpen, showAnswer } from './schedule.ts';
import { newFriendRewards, newlyOpened, nextExpansion } from './rewards.ts';
import { coinWord, coins } from './purse.ts';
import { passStep, progressOf, projectById, projectKey, projectState } from './projects.ts';
import { projectStarter, stepsToCheck } from './project-rules.ts';
import type { FriendReward } from './rewards.ts';
import type { AssistMode, Challenge, Errand, Expansion, IOTest, ExprTest, LifeTouch, Project } from '../content/index.ts';
import type { CheckResult, Diagnostic, MissingPart, ProgramSummary, RunOutput, Stopped } from '../runner/index.ts';
import type { Confidence, Outcome } from './schedule.ts';

/** What the notebook has open: a challenge, an errand from the Notice Board, a City Hall project, or the Workshop. */
type ChallengeSession = Challenge & { workshop?: never; errand?: never; project?: never };
interface ErrandSession extends Omit<Errand, 'id'> {
  /** The key for state.code: `errand:<errand id>`. */
  id: string;
  errandId: string;
  errand: true;
  workshop?: never;
  project?: never;
  /** Where it is in the day's list, and which day, so a new day can be noticed. */
  index: number;
  date: number;
}
interface WorkshopSession { id: 'workshop'; workshop: true; errand?: never; project?: never }
/** A City Hall project: one file, built a step at a time. `id` is its key in state.code (`project:<id>`). */
interface ProjectSession { id: string; project: Project; workshop?: never; errand?: never }
type Session = ChallengeSession | ErrandSession | WorkshopSession | ProjectSession;

/** The one runner for the whole game (the interiors use it too). Calls are queued, one at a time. */
export const runner = createRunner();

let current: Session | null = null;
const ed = $<HTMLTextAreaElement>('#code'), hl = $('#hl'), gutter = $('#gutter');
function syncEditor(): void {
  hl.innerHTML = highlight(ed.value) + (ed.value.endsWith('\n') ? ' ' : '');
  const lines = ed.value.split('\n').length; gutter.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  hl.scrollTop = ed.scrollTop; hl.scrollLeft = ed.scrollLeft; gutter.scrollTop = ed.scrollTop;
}
function starterFor(c: Challenge, mode: AssistMode = state.mode): string { return c.starter[mode]; }
export function setMode(m: AssistMode): void {
  if (current && (current.workshop || current.errand)) { state.mode = m; save(); renderSidebar(); return; }
  if (current?.project) { projectMode(current, m); return; }
  const prev = state.mode; state.mode = m; save(); renderSidebar();
  if (current) {
    const code = ed.value; const untouched = !code.trim() || Object.values(current.starter).includes(code);
    if (untouched) { ed.value = starterFor(current); state.code[current.id] = ed.value; save(); syncEditor(); $('#modeNote').textContent = ''; }
    else if (prev !== m) $('#modeNote').textContent = `Your code was kept. Press Reset to load the ${MODES[m].label} starter.`;
    renderProblem(); renderAssistant();
  }
}
export function openChallenge(id: string): void {
  const c = byId(id); if (!c || status(c) === 'locked') return;
  current = c; $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop', 'is-errand', 'is-project'); $('#runBtn').textContent = '▶ Run tests';
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
export function closeNotebook(): void { if (activeRun) runner.cancel?.(); $('#notebook').hidden = true; document.body.classList.remove('modal-open'); current = null; revealLand(); }

// New land opened by an errand is revealed once the notebook closes, so the player sees the mist lift.
let pendingLand: Expansion[] = [], pendingFriends: [rid: string, rewards: FriendReward[]][] = [], pendingLife: LifeTouch[] = [], pendingProjects: Project[] = [];
/** A City Hall project just finished: its bunting goes up when the notebook closes. */
export function queueProject(p: Project): void { pendingProjects.push(p); }
/** A new bit of life on the map (src/content/life.ts), announced when the notebook closes. */
export function queueLife(touches: LifeTouch[]): void { pendingLife.push(...touches); }
export function queueLand(opened: Expansion[]): void { pendingLand.push(...opened); }
/** After an errand: [resident, rewards just reached] for the friendship toast and the map change. */
export function queueFriend(rid: string, rewards: FriendReward[]): void { if (rewards.length) pendingFriends.push([rid, rewards]); }
export function revealLand(): void {
  if (!pendingLand.length && !pendingFriends.length && !pendingLife.length && !pendingProjects.length) return;
  const opened = pendingLand, friends = pendingFriends, life = pendingLife, projects = pendingProjects; pendingLand = []; pendingFriends = []; pendingLife = []; pendingProjects = [];
  const t = performance.now(), msgs: string[] = [];
  for (const p of projects) { buildAnim['project-' + p.id] = t + 300; msgs.push(`🏛 <b>${p.title} is finished!</b> ${p.reward} goes up.`); }
  opened.forEach(x => { buildAnim['exp-' + x.id] = t + 300; });
  if (opened.length) { const last = opened[opened.length - 1]; msgs.push(`<b>${last.title} has opened!</b> ${last.note}`); }
  for (const [rid, rewards] of friends) {
    const name = RESIDENTS[rid].name, f = FRIENDSHIP.find(x => x.resident === rid)!;
    if (rewards.includes('change')) { buildAnim['friend-' + rid] = t + 300; msgs.push(`<b>${f.change}</b>`); }
    if (rewards.includes('letter')) msgs.push(`📬 <b>A letter from ${name}</b> is in Wren's mailbox.`);
    if (rewards.includes('gift')) msgs.push(`🎁 ${name} left you a gift: <b>${f.gift.name}</b> (in your Journal).`);
  }
  for (const l of life) msgs.push(`✨ ${l.note}`);
  toast(msgs.join(' '));
  if (opened.length) showLand(opened[opened.length - 1].id);
  $('.town-frame').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
/** One line for the win box: the coins this errand brought, and what's in the purse now. */
function coinLine(): string {
  return `<div class="land-line coin-line">🪙 <b>+${coinWord(COINS.errand)}</b> · ${coinWord(coins())} in your purse</div>`;
}
/** One line for the win box: the resident's hearts, and anything their friendship just brought. */
function friendLine(rid: string, rewards: FriendReward[]): string {
  const name = RESIDENTS[rid].name, f = FRIENDSHIP.find(x => x.resident === rid)!, h = hearts()[rid] || 0;
  const what: Record<FriendReward, string> = { letter: `${name} has written you a letter`, gift: `${name} left you a gift: ${f.gift.icon} ${f.gift.name}`, change: f.change };
  return `<div class="land-line friend-line"><span class="hearts">${heartRow(h)}</span> ${name}${rewards.length ? ` · <b>${rewards.map(k => what[k]).join('. ')}.</b> Close the notebook to see.` : h >= HEARTS.change ? ' · best friends' : ''}</div>`;
}
/** One line for the win box: what just opened, or how far it is to the next piece of land. */
function landLine(opened: Expansion[], solved: number): string {
  if (opened.length) return `<div class="land-line opened">🌱 <b>${opened.map(x => x.title).join(' and ')}</b> just opened south of the railway. Close the notebook to see it.</div>`;
  const next = nextExpansion(EXPANSIONS, solved); if (!next) return '';
  const left = next.needs - solved;
  return `<div class="land-line">🌫 ${left} more errand${left === 1 ? '' : 's'} until the mist lifts on new land.</div>`;
}
function renderProblem(): void {
  const c = current; if (!c || c.workshop || c.errand || c.project) return;
  const r = RESIDENTS[c.resident];
  const p = $('#problem');
  p.innerHTML = `<div class="story"><div class="story-p"></div><div><div class="who">${r.name} <span>the ${r.role}</span></div><p>${c.story}</p></div></div>
    <h3>Your task</h3><p>${c.task}${state.mode !== 'independent' || !c.fn ? '' : ` Name it <code>${c.fn}</code>.`}</p>
    ${state.mode !== 'independent' && c.sig ? `<div class="sig-line">Type signature ${codeBlock(c.sig)}</div>` : ''}
    ${examplesHTML(c)}`;
  p.querySelector('.story-p')!.appendChild(portrait(c.resident, 52));
}
function renderAssistant(): void {
  const c = current; if (!c || c.workshop || c.errand || c.project) return;
  const n = state.hints[c.id] || 0;
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

/** The Examples (or Example run) section of a challenge or errand. */
function examplesHTML(c: { ioExamples?: IOTest[]; examples?: ExprTest[] }): string {
  if (c.ioExamples) return `<h3>Example run</h3>${c.ioExamples.map(x => `<div class="io-ex"><div><span>You type</span><pre class="console">${esc(x.input)}</pre></div><div><span>It prints</span><pre class="console">${esc(x.out)}</pre></div></div>`).join('')}`;
  const ex = c.examples ?? [], width = Math.max(...ex.map(e => e[0].length)) + 2;
  return `<h3>Examples</h3>${codeBlock(ex.map(([a, b]) => `${a.padEnd(width)}-- ${b}`).join('\n'))}`;
}

const compileTitle = (e: Diagnostic): string => e.kind === 'type' ? "The types don't fit together yet" : e.kind === 'scope' ? 'An unknown name' : 'The compiler has a note for you';
const MISSING: Record<Exclude<MissingPart['what'], 'instance'>, string> = {
  type: 'a data type called',
  constructor: 'a constructor called',
  field: 'a record field called',
  class: 'a class called',
};
const missingHTML = (m: MissingPart): string => m.what === 'instance' ? `<code>instance ${m.cls} ${m.type}</code>` : `${MISSING[m.what]} <code>${m.name}</code>`;

// ---------- Running code ----------
// The runner works in the background (a Web Worker), so while code runs the Run
// button becomes Stop, and slow code is stopped after a while instead of freezing the page.
let activeRun: Promise<unknown> | null = null;
const runLabel = (): string => (current && current.workshop ? '▶ Check & run' : '▶ Run tests');
// Run `task` unless something is already running. With restart, stop the current run first.
function whileRunning(task: () => Promise<unknown>, restart = false): Promise<unknown> {
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
function stoppedCard(r: Stopped): string {
  if (r.reason === 'cancelled') return noteCard('Stopped', `You stopped your code after ${r.seconds} seconds. Change something and run it again whenever you like.`);
  return noteCard(`Still running after ${r.seconds} seconds`, "I stopped your code so the page wouldn't freeze. It might be stuck in an endless loop, or doing far more work than it needs to: a function that recomputes the same values again and again, like a naive `fib`, can take ages.\nTip: Check that every recursive call gets closer to a base case, and try a smaller input first.");
}

function runTests(): Promise<unknown> { return whileRunning(checkNotebook); }
function workshopRun(forceMain: boolean): Promise<unknown> { return whileRunning(() => doWorkshopRun(forceMain)); }
function workshopEval(): Promise<unknown> { return whileRunning(doWorkshopEval); }

// Check the notebook against the current challenge (via the runner) and show the results.
async function checkNotebook(): Promise<void> {
  const c = current; if (!c) return;
  if (c.workshop) return doWorkshopRun();
  if (c.errand) return checkErrand();
  if (c.project) return checkProject();
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
/** What checkHTML needs to know about what was checked: a challenge, an errand or a project step. */
interface Checked { fn: string | null; resident: string; errand?: boolean; hints?: string[] }
// Turn a CheckResult into HTML. `all` is true when every test passed and no rule was broken.
function checkHTML(c: Checked, r: CheckResult): { html: string; all: boolean } {
  const early = (html: string) => ({ html, all: false });
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
    return early(noteCard('Something the challenge needs is missing', `This challenge needs ${r.missing.map(missingHTML).join(', ')} — check the task description and the spelling.`));
  }
  if (r.status === 'signature-mismatch') {
    return early(noteCard("The types don't fit the challenge", r.message) + `<p class="nudge">The tests call <code>${c.fn}</code> with the types above, so they can't run until it fits.</p>`);
  }
  const typeLine = r.fnType ? `<div class="typeok"><span>✓ Types check out</span><code>${esc(r.fnType.fn)} :: ${esc(r.fnType.type)}</code>${r.fnType.hasSignature ? '' : '<em>(worked out by Haskell — you didn\'t even write a signature!)</em>'}</div>`
    : `<div class="typeok"><span>✓ Types check out</span><code>${(r.instances ?? []).map(i => 'instance ' + esc(i)).join(' · ')}</code></div>`;
  const rows = r.tests;
  const passed = rows.filter(t => t.ok).length, all = r.passed;
  let ruleNote = '';
  if (r.ruleBreak) {
    const who = RESIDENTS[c.resident].name;
    if (r.ruleBreak.rule === 'forbidden') ruleNote = noteCard('It works — but not quite the way ' + who + ' asked', `All the tests pass, but this challenge is about writing it yourself, so please don't use ${r.ruleBreak.used.map(u => '`' + u + '`').join(' or ')}. Try making <code>${c.fn}</code> call itself instead.`);
    else ruleNote = noteCard('It works — but where is the recursion?', `All the tests pass, but this challenge is about recursion: <code>${c.fn}</code> (or a helper) should call itself.${!c.errand && c.hints ? ' Hint 1 shows the two cases to write.' : ''}`);
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
function noteCard(title: string, msg: string): string {
  const [first, ...rest] = msg.split('\n');
  const fmt = (s: string): string => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const exp = rest.filter(l => /^\s+(Expected|Found):/.test(l)).map(l => { const m = l.trim().match(/^(Expected|Found):\s*(.*)$/)!; return `<div class="tm-row"><span>${m[1]}</span><code>${esc(m[2])}</code></div>`; }).join('');
  const tip = rest.filter(l => l.startsWith('Tip:')).map(l => `<div class="tip">💡 ${fmt(l.slice(4).trim())}</div>`).join('');
  const codeLines = rest.filter(l => !/^\s+(Expected|Found):/.test(l) && !l.startsWith('Tip:'));
  const code = codeLines.length ? codeBlock(codeLines.map(l => l.replace(/^  /, '')).join('\n')) : '';
  return `<div class="note"><div class="note-h">${title}</div><div>${fmt(first)}</div>${exp ? `<div class="tm">${exp}</div>` : ''}${code}${tip}</div>`;
}
function markLine(line: number | null): void { gutter.querySelectorAll('.bad').forEach(x => x.classList.remove('bad')); if (!line) return; const lines = ed.value.split('\n').length; gutter.innerHTML = Array.from({ length: lines }, (_, i) => i + 1 === line ? `<span class="bad">${i + 1}</span>` : i + 1).join('<br>'); }

export function build(c: Challenge): void {
  state.done[c.id] = true;
  // a Journal page: the code that built it, and the day
  (state.journal ||= {})[c.id] = { code: state.code[c.id] ?? '', day: today() };
  save();
  closeNotebook(); renderSidebar();
  const next = CHALLENGES.filter(x => status(x) === 'open');
  buildAnim[c.upgrade ? (c.plot ?? c.id) + '-deco' : (c.plot || c.id)] = performance.now();
  const noun = c.upgrade ? `${c.reward} — added!` : `${c.reward} ${['mailbox', 'garden'].includes(c.id) ? 'is ready' : 'has been built'}!`;
  toast(`<b>${noun}</b> ` + (next.length ? `New request from ${[...new Set(next.map(x => RESIDENTS[x.resident].name))].join(' & ')}.`
    : villageBuilt() ? `The whole village is built! From now on, residents pin small errands to the <b>Notice Board</b> (the Errands tab), a few each day, and Mayor Fern has a bigger <b>project</b> waiting at City Hall.` : `You've finished every request in town so far. Try the Workshop meanwhile!`));
  if (villageBuilt()) document.querySelector<HTMLElement>('.tabs button[data-tab=errands]')?.click();
  $('.town-frame').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(html: string): void { const t = $('#toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 5200); }


// ---------- Errands: retrieval practice from the Notice Board ----------
// The player solves a small new problem on an old topic from memory. There are no hints up
// front: a peek at the Library or the full answer is there, but only after trying, and each
// one changes when the topic comes back (see schedule.ts).
const CONF: Record<Confidence, string> = { unsure: 'Not sure', fairly: 'Fairly sure', sure: 'Sure' };
function errandItem() {
  const rs = reviews(), c = current;
  if (!rs?.day || !c?.errand || rs.day.date !== c.date) return null;
  return rs.day.items[c.index] || null;
}
export function openErrand(index: number): void {
  const rs = reviews(), item = rs?.day?.items[index]; if (!rs?.day || !item) return;
  const e = errandById(item.errand)!, t = topicById(item.topic)!;
  const session: ErrandSession = { ...e, id: 'errand:' + e.id, errandId: e.id, errand: true, index, date: rs.day.date };
  current = session;
  $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop', 'is-project'); $('.nb').classList.add('is-errand'); $('#runBtn').textContent = '▶ Run tests';
  $('#nbEyebrow').textContent = `Errand · ${topicLabel(e)} · from memory`;
  $('#nbTitle').textContent = e.title;
  ed.value = state.code[session.id] != null ? state.code[session.id] : e.starter; syncEditor(); markLine(null);
  renderErrandProblem(); renderErrandAssistant();
  $('#results').innerHTML = item.outcome ? `<div class="res-empty done-note">You've done this errand today. Feel free to run it again.</div>`
    : item.sawAnswer ? `<div class="res-empty">You've seen the answer to this one. Study it, then try the new errand on ${t.title} on the Notice Board, from memory.</div>`
    : `<div class="res-empty">Write it from memory first, then press <b>Run tests</b>. A wrong first try is fine: trying to remember is what does the work.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open');
  setTimeout(() => ed.focus(), 50);
}
function renderErrandProblem(): void {
  const c = current; if (!c?.errand) return;
  const r = RESIDENTS[c.resident], ex = examplesHTML(c);
  $('#problem').innerHTML = `<div class="story"><div class="story-p"></div><div><div class="who">${r.name} <span>the ${r.role}</span></div><p>${c.story}</p></div></div>
    <h3>Your task</h3><p>${c.task}</p>${c.sig ? `<div class="sig-line">Type signature ${codeBlock(c.sig)}</div>` : ''}${ex}`;
  $('#problem').querySelector('.story-p')!.appendChild(portrait(c.resident, 52));
}
function renderErrandAssistant(): void {
  const item = errandItem(), c = current; if (!item || !c?.errand) return;
  const t = topicById(item.topic)!, a = $('#assistant'), e = errandById(item.errand)!, label = topicLabel(e);
  let html = `<div class="primer recall"><div class="primer-h">From memory · ${label}</div>${e.mix ? `<p>This one needs two ideas together: ${label.replace(' + ', ' and ')}.</p>` : ''}<p>No hints up front this time. Give it a real try before looking anything up: struggling to remember is what makes it stick.</p></div>`;
  html += `<div class="hints-h"><span>How sure are you?</span></div>`;
  if (item.runs === 0 && isOpen(item)) {
    html += `<p class="conf-q">Before you run it: how sure are you that it will pass first time?</p><div class="conf-seg">${Object.entries(CONF).map(([k, l]) => `<button data-conf="${k}" class="${item.confidence === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  } else {
    html += `<p class="conf-q">${item.confidence ? `You said: <b>${CONF[item.confidence]}</b>.` : `You didn't say. Next time, try guessing before you run: it helps you notice what you really know.`}</p>`;
  }
  if (isOpen(item)) {
    html += `<div class="hints-h"><span>Stuck?</span></div>`;
    html += item.cue ? `<div class="cue">${cueHTML(e)}</div>` : `<button class="btn-soft" id="cueBtn">Peek at the Library cards for ${label}</button>`;
    html += `<button class="btn-soft ghost" id="answerBtn">I can't remember — show me the answer</button>`;
    html += `<p class="no-penalty">Looking is fine. It only changes when this topic comes back: a peek keeps the gap the same, and after seeing the answer, a new errand on ${t.title} comes back later today.</p>`;
  } else if (item.sawAnswer) {
    html += answerHTML(c);
  }
  a.innerHTML = html;
  a.querySelectorAll<HTMLElement>('[data-conf]').forEach(b => b.onclick = () => { item.confidence = b.dataset.conf as Confidence; save(); renderErrandAssistant(); });
  const cb = $('#cueBtn'); if (cb) cb.onclick = () => { item.cue = true; save(); renderErrandAssistant(); };
  const ab = $('#answerBtn'); if (ab) ab.onclick = () => {
    showAnswer(state.reviews!, item, RETRY_ERRANDS[item.topic]); save(); renderSidebar(); renderErrandAssistant();
    $('#results').innerHTML = `<div class="res-empty">Read the answer through and make sense of it. Then close this: a <b>new errand on ${t.title}</b> is now at the end of today's list, to do from memory.</div>`;
  };
}
function answerHTML(c: ErrandSession): string {
  return `<div class="solution"><div class="hint-lv">One way to write it</div>${codeBlock(c.solution)}<p>${c.explanation}</p></div>`;
}
async function checkErrand(): Promise<void> {
  const c = current, item = errandItem(); if (!c?.errand) return;
  if (!item) { $('#results').innerHTML = noteCard('A new day has started', 'Today has new errands. Close this and open one from the Notice Board.'); return; }
  const counts = isOpen(item);
  if (counts) { item.runs++; save(); if (item.runs === 1) renderErrandAssistant(); } // the confidence guess is locked once you run
  const r = await runner.check(c, ed.value);
  if (current !== c) return;
  let { html, all } = checkHTML(c, r);
  const rs = state.reviews!;
  if (all && counts) {
    const before = rs.log.length, heartsBefore = hearts()[c.resident] || 0, lifeBefore = practised();
    const outcome = completeItem(rs, item, today());
    (state.errandCode ||= {})[c.errandId] = ed.value; // shown on the errand's Journal stamp
    const opened = newlyOpened(EXPANSIONS, before, rs.log.length);
    pendingLand.push(...opened);
    const friendNew = newFriendRewards(heartsBefore, hearts()[c.resident] || 0, HEARTS);
    queueFriend(c.resident, friendNew);
    const lifeNew = LIFE.filter(l => practised().has(l.topic) && !lifeBefore.has(l.topic));
    queueLife(lifeNew);
    save();
    const p = rs.topics[item.topic], t = topicById(item.topic)!, who = RESIDENTS[c.resident].name;
    const headline = ({ recalled: 'Remembered, first try!', effortful: 'Done — and that effort counts.', relearned: 'Relearned!' } satisfies Record<Outcome, string>)[outcome];
    const body = ({
      recalled: `You pulled it straight from memory. ${t.title} will come back after a longer gap.`,
      effortful: `Getting there after ${item.runs > 1 ? 'a few runs' : 'a peek'} is still real practice: you had to work to remember, and that strengthens it.`,
      relearned: `You saw an answer earlier and then solved a new one yourself. That second recall is the one that sticks.`,
    } satisfies Record<Outcome, string>)[outcome];
    let conf = '';
    if (item.confidence) {
      const first = outcome === 'recalled';
      conf = `<p class="conf-res">You felt <b>${CONF[item.confidence].toLowerCase()}</b>, and it ${first ? 'passed first time' : "didn't pass first time"}. ${
        item.confidence === 'sure' && !first ? 'Feeling sure and being sure aren\'t the same: worth remembering next time.'
        : item.confidence === 'unsure' && first ? 'You knew more than you thought!' : 'Nicely judged.'}</p>`;
    }
    html += `<div class="win"><h3>${headline}</h3><p>${body}</p>${conf}<details class="compare"><summary>Compare with one way to write it</summary>${answerHTML(c)}</details>
      <div class="win-stats">${who} will pin up another ${t.title} errand <b>${whenText(p.due)}</b>.</div>${coinLine()}${friendLine(c.resident, friendNew)}${lifeNew.map(l => `<div class="land-line opened">✨ <b>Life in town:</b> ${l.note}</div>`).join('')}${landLine(opened, rs.log.length)}<button class="btn-build" id="boardBtn">Back to the Notice Board</button></div>`;
    renderSidebar(); renderErrandAssistant();
  } else if (all) {
    html += `<div class="win"><h3>All tests pass</h3><p>${item.sawAnswer ? `Now try the new ${topicById(item.topic)?.title} errand on the Notice Board, from memory.` : 'This errand is already done for today.'}</p><button class="btn-build" id="boardBtn">Back to the Notice Board</button></div>`;
  } else if (counts && r.status === 'tested') {
    html += `<p class="nudge">Not quite yet. Look at what failed and try again: a wrong try followed by a fix is still good practice.</p>`;
  }
  $('#results').innerHTML = html;
  const bb = $('#boardBtn'); if (bb) bb.onclick = () => { closeNotebook(); document.querySelector<HTMLElement>('.tabs button[data-tab=errands]')?.click(); };
}

// ---------- City Hall projects: a whole program, a step at a time ----------
// One file grows step by step. Each run checks every step so far, in order, so the earlier steps'
// tests keep guarding what's already there; once the project is finished they guard any refactoring.
const stepWord = (n: number): string => `Step ${n + 1}`;
const projectEyebrow = (p: Project): string => {
  const pr = progressOf(p);
  return pr.done != null ? `City Hall project · finished · ${p.concepts}` : `City Hall project · ${stepWord(pr.passed)} of ${p.steps.length} · ${p.concepts}`;
};
export function openProject(pid: string): void {
  const p = projectById(pid); if (!p || projectState(p) === 'locked') return;
  const pr = progressOf(p), key = projectKey(p);
  current = { id: key, project: p };
  $('#modeNote').textContent = ''; $('.nb').classList.remove('is-workshop', 'is-errand'); $('.nb').classList.add('is-project'); $('#runBtn').textContent = '▶ Run tests';
  $('#nbEyebrow').textContent = projectEyebrow(p);
  $('#nbTitle').textContent = p.title;
  if (state.code[key] == null) { state.code[key] = projectStarter(p, state.mode); save(); }
  ed.value = state.code[key]; syncEditor(); markLine(null);
  renderProjectProblem(); renderProjectAssistant();
  const step = p.steps[pr.passed];
  $('#results').innerHTML = pr.done != null
    ? `<div class="res-empty done-note">Finished! Change anything you like: <b>Run tests</b> still checks all ${p.steps.length} steps, so you'll know at once if something broke.</div>`
    : `<div class="res-empty">${pr.passed ? `Steps 1–${pr.passed} are done. ` : ''}Write <b>${stepWord(pr.passed)}: ${step.title}</b> at the bottom of your file, then press <b>Run tests</b>. Each run checks every step so far.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open');
  setTimeout(() => ed.focus(), 50);
}
function renderProjectProblem(): void {
  const c = current; if (!c?.project) return;
  const p = c.project, pr = progressOf(p), r = RESIDENTS[p.resident];
  let html = `<div class="story"><div class="story-p"></div><div><div class="who">${r.name} <span>the ${r.role}</span></div><p>${p.story}</p></div></div>
    <p class="proj-concepts">A whole program in one file, built a step at a time. It brings together: <b>${p.concepts}</b>.</p><h3>The plan</h3><ol class="proj-steps">`;
  p.steps.forEach((s, i) => {
    if (i < pr.passed) html += `<li class="done"><details><summary><span class="proj-tick">✓</span> ${stepWord(i)} · ${s.title}${s.fn ? ` <code>${s.fn}</code>` : ''}</summary><p>${s.task}</p></details></li>`;
    else if (i === pr.passed) html += `<li class="now"><div class="proj-step-h">${stepWord(i)} · ${s.title}</div><p>${s.task}</p>${state.mode !== 'independent' && s.sig ? `<div class="sig-line">Type signature ${codeBlock(s.sig)}</div>` : ''}${examplesHTML(s)}</li>`;
    else html += `<li class="later">${stepWord(i)} · ${s.title}</li>`;
  });
  html += `</ol>`;
  $('#problem').innerHTML = html;
  $('#problem').querySelector('.story-p')!.appendChild(portrait(p.resident, 52));
}
let copyArmed: ReturnType<typeof setTimeout> | null = null;
function renderProjectAssistant(): void {
  const c = current; if (!c?.project) return;
  const p = c.project, pr = progressOf(p), a = $('#assistant');
  if (pr.done != null) {
    a.innerHTML = `<div class="primer"><div class="primer-h">Finished · ${p.reward}</div><p>${p.wrapUp}</p></div>
      <div class="hints-h"><span>Make it yours</span></div>
      <p class="proj-note">The project's tests stay with it. Change anything, press <b>Run tests</b>, and all ${p.steps.length} steps are checked again: that's what makes refactoring safe.</p>
      <ul class="proj-ideas">${p.ideas.map(x => `<li>${x}</li>`).join('')}</ul>
      <button class="btn-soft" id="toWorkshop">Copy this program to the Workshop</button>
      <p class="no-penalty">The Workshop has no tests, so you can change what <code>main</code> prints and try it out freely. Copying replaces what's in the Workshop now.</p>`;
    const tw = $('#toWorkshop');
    tw.onclick = () => {
      if (!copyArmed) { tw.textContent = 'Click again to replace the Workshop\'s code'; copyArmed = setTimeout(() => { copyArmed = null; if (tw.isConnected) tw.textContent = 'Copy this program to the Workshop'; }, 3000); return; }
      clearTimeout(copyArmed); copyArmed = null;
      state.code.workshop = ed.value; state.wsExpr = ''; state.wsInput = ''; save(); openWorkshop();
    };
    return;
  }
  const i = pr.passed, s = p.steps[i], n = Math.min(pr.hints[i] || 0, s.hints.length + 1);
  let html = `<div class="primer"><div class="primer-h">${stepWord(i)} of ${p.steps.length} · ${s.title}</div><p>Write it at the bottom of your file. You can use every function from the steps before: that's what they're for.</p><p>Each run checks the earlier steps again too, so if a change breaks one, you'll know straight away.</p></div>`;
  html += `<div class="hints-h"><span>Hints for this step</span><span class="hint-count">${Math.min(n, s.hints.length)} of ${s.hints.length} revealed</span></div><ol class="hints">`;
  for (let k = 0; k < Math.min(n, s.hints.length); k++) html += `<li><div class="hint-lv">${k + 1} · ${HINT_LEVELS[k]}</div><div>${s.hints[k]}</div></li>`;
  html += `</ol>`;
  if (n < s.hints.length) html += `<button class="btn-soft" id="hintBtn">Reveal hint ${n + 1} · ${HINT_LEVELS[n]}</button>`;
  else if (n === s.hints.length) html += `<button class="btn-soft" id="hintBtn">Show this step's code (optional)</button>`;
  else html += `<div class="solution"><div class="hint-lv">${stepWord(i)}, one way to write it</div>${codeBlock(s.solution)}<p class="board-small">Copy what you need into the bottom of your file, in place of the step's starting lines.</p></div>`;
  html += `<p class="no-penalty">Hints never cost anything: the project is finished the same way however you get there.</p>`;
  a.innerHTML = html;
  const hb = $('#hintBtn'); if (hb) hb.onclick = () => { pr.hints[i] = n + 1; save(); renderProjectAssistant(); };
}
function projectMode(c: ProjectSession, m: AssistMode): void {
  const prev = state.mode; state.mode = m; save(); renderSidebar();
  const p = c.project, pr = progressOf(p);
  // a file nobody has touched yet starts again with the new mode's first step
  if (pr.passed === 0 && prev !== m && ed.value === projectStarter(p, prev)) { ed.value = projectStarter(p, m); state.code[c.id] = ed.value; save(); syncEditor(); }
  renderProjectProblem();
}
function resetProject(c: ProjectSession): void {
  const p = c.project, pr = progressOf(p);
  ed.value = pr.checkpoint ?? projectStarter(p, state.mode); state.code[c.id] = ed.value; save(); syncEditor(); markLine(null);
  $('#modeNote').textContent = pr.passed ? `Back to how your file was when ${stepWord(pr.passed - 1).toLowerCase()} passed.` : '';
  ed.focus();
}
async function checkProject(): Promise<void> {
  const c = current; if (!c?.project) return;
  const p = c.project, pr = progressOf(p), code = ed.value, finishedBefore = pr.done != null;
  pr.runs++; save();
  const steps = stepsToCheck(p, pr.passed);
  let failed: { i: number; r: CheckResult } | null = null;
  for (let i = 0; i < steps.length; i++) {
    const r = await runner.check(steps[i], code);
    if (current !== c) return; // the notebook was closed or switched while checking
    if (r.status === 'stopped') { $('#results').innerHTML = stoppedCard(r); return; }
    if (!(r.status === 'tested' && r.passed)) { failed = { i, r }; break; }
  }
  const passedList = (n: number): string => n ? `<ul class="proj-pass">${p.steps.slice(0, n).map((s, i) => `<li>✓ ${stepWord(i)} · ${s.title}</li>`).join('')}</ul>` : '';
  if (failed) {
    const { i, r } = failed, s = p.steps[i];
    const { html } = checkHTML({ fn: s.fn, resident: p.resident, hints: s.hints }, r);
    // a compile error isn't any one step's fault, so it isn't put on one
    const head = r.status === 'compile-error' ? ''
      : i < pr.passed ? noteCard(`${stepWord(i)} used to pass`, `${stepWord(i)} (${s.title}) passed before, but not with the file as it is now: a change since then has broken it. The tests below show where. Reset takes the file back to how it was when the last step passed.`)
      : `${passedList(i)}<div class="proj-step-h">${stepWord(i)} · ${s.title}</div>`;
    $('#results').innerHTML = head + html;
    return;
  }
  markLine(null);
  if (finishedBefore) {
    $('#results').innerHTML = `<div class="res-head ok"><span>All ${p.steps.length} steps still pass!</span></div>${passedList(p.steps.length)}<p class="nudge">Whatever you changed, the program still does everything it did before.</p>`;
    return;
  }
  const i = pr.passed, s = p.steps[i], { code: next, finished } = passStep(p, code);
  ed.value = next; syncEditor();
  let html = `<div class="res-head ok"><span>${stepWord(i)} passes${i ? `, and steps 1–${i} still do` : ''}!</span></div>${passedList(i + 1)}`;
  if (finished) {
    queueProject(p);
    html += `<div class="win"><h3>${p.title}: finished!</h3><p>${s.explanation}</p><p style="margin-top:8px">${p.wrapUp}</p>
      <div class="win-stats">${p.steps.length} steps · ${pr.runs} run${pr.runs === 1 ? '' : 's'}</div>
      <div class="land-line opened">🏛 <b>${p.reward}.</b> Close the notebook to see it.</div></div>`;
  } else {
    const ns = p.steps[pr.passed];
    html += `<div class="win"><h3>${stepWord(i)} done: ${s.title}</h3><p>${s.explanation}</p>
      <div class="land-line">Next, <b>${stepWord(pr.passed)}: ${ns.title}</b>. ${state.mode === 'independent' ? 'A heading for it is' : 'Its starting lines are'} at the bottom of your file now.</div></div>`;
  }
  $('#results').innerHTML = html;
  $('#nbEyebrow').textContent = projectEyebrow(p);
  renderSidebar(); renderProjectProblem(); renderProjectAssistant();
}

// ---------- Workshop: free play with the whole language ----------
// The expression and stdin boxes only exist while the Workshop is open.
const wsExpr = () => $<HTMLInputElement>('#wsExpr');
const wsInput = () => $<HTMLTextAreaElement>('#wsInput');
const WORKSHOP: WorkshopSession = { id: 'workshop', workshop: true };
// Lines typed into the console while a program waits for input. They go after the lines typed ahead in the input box,
// and a fresh run clears them. Each line runs the program again from the start with that line added (see RunOutput.waiting).
let liveLines: string[] = [];
const aheadLines = (): string[] => { const l = (wsInput()?.value ?? '').split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
const allLines = (): string[] => [...aheadLines(), ...liveLines];
const inputText = (): string => allLines().map(l => l + '\n').join('');
function openWorkshop(): void {
  current = WORKSHOP; $('#modeNote').textContent = '';
  $('.nb').classList.remove('is-errand', 'is-project'); $('.nb').classList.add('is-workshop'); $('#runBtn').textContent = '▶ Check & run';
  $('#nbEyebrow').textContent = 'Free play · no tests, no pressure';
  $('#nbTitle').textContent = 'The Workshop';
  ed.value = state.code.workshop != null ? state.code.workshop : WORKSHOP_EXAMPLES[0].code; syncEditor();
  $('#problem').innerHTML = `<p>The Workshop is your own corner of town for trying anything: your own <b>data types</b>, <b>records</b>, <b>list comprehensions</b> and <b>IO with do blocks</b>. These are the tools for the School, the Library and City Hall later on.</p>
    <details class="notsup ws-ns">${notSupportedHTML()}</details>
    <h3>Start from an example</h3><div class="ex-list">${WORKSHOP_EXAMPLES.map((x, i) => `<button class="ex" data-i="${i}"><b>${x.title}</b><span>${x.blurb}</span></button>`).join('')}</div>`;
  $('#problem').querySelectorAll<HTMLElement>('.ex').forEach(b => b.onclick = () => loadExample(Number(b.dataset.i)));
  $('#assistant').innerHTML = `<h3 style="margin-top:0">Try an expression</h3>
    <div class="evalrow"><span class="prompt">λ&gt;</span><input id="wsExpr" spellcheck="false" autocomplete="off" placeholder="e.g. map area [Circle 1]"><button class="btn-soft" id="wsEval">Evaluate</button></div>
    <h3>Input typed ahead <span class="dim-h">(optional)</span></h3><textarea id="wsInput" spellcheck="false" rows="3" placeholder="One line per getLine or readLn. Or leave it empty: main waits for you to type each line."></textarea>
    <button class="btn-soft" id="wsMain" style="margin-top:8px">▶ Run main</button>
    <p class="no-penalty">Everything here is checked for types first, just like in the challenges.</p>`;
  const ex = wsExpr(), inp = wsInput();
  ex.value = state.wsExpr || ''; inp.value = state.wsInput || '';
  ex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); workshopEval(); } });
  ex.addEventListener('input', () => { state.wsExpr = ex.value; save(); });
  inp.addEventListener('input', () => { state.wsInput = inp.value; save(); });
  $('#wsEval').onclick = workshopEval; $('#wsMain').onclick = () => workshopRun(true);
  $('#results').innerHTML = `<div class="res-empty">Press <b>Check &amp; run</b> to type-check your code (and run <code>main</code> if there is one), or evaluate an expression on the left.</div>`;
  $('#notebook').hidden = false; document.body.classList.add('modal-open'); setTimeout(() => ed.focus(), 50);
}
function loadExample(i: number): void {
  const x = WORKSHOP_EXAMPLES[i];
  ed.value = x.code; state.code.workshop = x.code; syncEditor();
  wsExpr().value = state.wsExpr = x.expr || ''; wsInput().value = state.wsInput = x.input || ''; save();
  markLine(null);
  whileRunning(x.expr ? doWorkshopEval : () => doWorkshopRun(true), true);
}
function showCompileError(e: Diagnostic): void { $('#results').innerHTML = noteCard(compileTitle(e), e.message); markLine(e.line); }
// summary: a ProgramSummary from the runner
function typesBlock(summary: ProgramSummary): string {
  const names = Object.keys(summary.types);
  const lines = [...summary.datas.map(d => `data ${d.name}${d.params.map(p => ' ' + p).join('')}  -- ${d.cons.join(' | ')}`),
    ...summary.classes.flatMap(c => [`class ${c.name} ${c.param}`, ...c.methods.map(m => '  ' + m)]), ...summary.instances.map(i => `instance ${i}`),
    ...names.map(n => `${/^[a-z_]/.test(n) ? n : '(' + n + ')'} :: ${summary.types[n]}`)];
  return lines.length ? `<div class="typeok ws"><span>✓ Types check out</span></div>${codeBlock(lines.join('\n'))}` : `<div class="typeok ws"><span>✓ Nothing to check yet</span></div>`;
}
// What the program printed, with each line it read shown where it read it, as in a terminal.
function transcript(r: RunOutput, lines: string[]): string {
  let html = '', at = 0;
  (r.reads || []).forEach((pos, i) => { html += esc(r.out.slice(at, pos)) + `<span class="typed">${esc(lines[i] ?? '')}</span>\n`; at = pos; });
  return html + esc(r.out.slice(at));
}
// live: a waiting program gets a line to type into, instead of the "no more input" error.
function outputBlock(r: RunOutput, lines: string[] = [], live = false): string {
  const waiting = live && r.waiting, empty = !r.out && !r.reads?.length;
  const end = waiting ? '<input class="stdin-live" spellcheck="false" autocomplete="off" aria-label="The next line for your program">' : empty ? '<span class="dim">(nothing printed)</span>' : '';
  return `<div class="ws-h">Output</div><pre class="console">${transcript(r, lines)}${end}</pre>`
    + (waiting ? `<p class="ws-wait">Your program is waiting for a line (<code>getLine</code> or <code>readLn</code>). Type it in the console and press Enter.</p>`
      : r.error ? noteCard('The program stopped', r.error.message) : '');
}
// Hook up the console's input line, if the program is waiting: Enter runs it again with the line added.
function wireStdin(again: () => Promise<void>): void {
  const box = $('#results').querySelector<HTMLInputElement>('.stdin-live');
  const con = box?.closest<HTMLElement>('pre.console'); if (con) con.scrollTop = con.scrollHeight;
  if (!box) return;
  box.focus();
  box.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || box.disabled) return;
    e.preventDefault(); liveLines.push(box.value); box.disabled = true; whileRunning(again);
  });
}
async function doWorkshopRun(forceMain = false, more = false): Promise<void> {
  if (!more) liveLines = [];
  const lines = allLines();
  const r = await runner.runMain(ed.value, inputText());
  if (current !== WORKSHOP) return;
  if (r.status === 'stopped') { $('#results').innerHTML = stoppedCard(r); return; }
  if (r.status === 'compile-error') { showCompileError(r.error); return; }
  markLine(null);
  let html = typesBlock(r.summary);
  if (r.status === 'ran') html += outputBlock(r.output, lines, true);
  else if (forceMain) html += noteCard('No main yet', 'There is no `main` to run. Write one, like:  main = putStrLn "Hello!"');
  $('#results').innerHTML = html;
  wireStdin(() => doWorkshopRun(forceMain, true));
}
async function doWorkshopEval(more = false): Promise<void> {
  const expr = wsExpr().value.trim(); if (!expr) return doWorkshopRun();
  if (!more) liveLines = [];
  const lines = allLines();
  const r = await runner.evaluate(ed.value, expr, inputText());
  if (current !== WORKSHOP) return;
  if (r.status === 'stopped') { $('#results').innerHTML = `<div class="ws-h">λ&gt; ${esc(expr)}</div>` + stoppedCard(r); return; }
  if (r.status === 'compile-error') { showCompileError(r.error); return; }
  markLine(null);
  if (r.status === 'expr-error') { $('#results').innerHTML = noteCard(r.error.kind === 'type' ? "The types don't fit together yet" : 'The compiler has a note for you', r.error.message.replace(/^Line 1: /, '')); return; }
  let html = `<div class="ws-h">λ&gt; ${esc(expr)}</div>`;
  if (r.runtimeError) html += noteCard('It stopped while running', r.runtimeError.message);
  else {
    html += r.output ? outputBlock(r.output, lines, true) : `<pre class="console result">${esc(r.value)}</pre>`;
    html += `<div class="ws-type">it :: <code>${esc(r.type)}</code></div>`;
  }
  $('#results').innerHTML = html + `<details class="ws-defs"><summary>Types in your file</summary>${typesBlock(r.summary)}</details>`;
  wireStdin(() => doWorkshopEval(true));
}

export function initNotebook(): void {
  ed.addEventListener('input', () => { if (current) { state.code[current.id] = ed.value; save(); } syncEditor(); });
  ed.addEventListener('scroll', syncEditor);
  ed.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart; ed.setRangeText('  ', s, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runTests(); }
  });
  $('#nbClose').onclick = closeNotebook;
  $('#notebook').addEventListener('click', e => { if ((e.target as Element).id === 'notebook') closeNotebook(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#notebook').hidden) closeNotebook(); });
  $('#resetBtn').onclick = () => { if (!current) return; if (current.workshop) { loadExample(0); return; } if (current.project) { resetProject(current); return; } ed.value = current.errand ? current.starter : starterFor(current); state.code[current.id] = ed.value; save(); syncEditor(); $('#modeNote').textContent = ''; ed.focus(); };
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
    $('.tabs button[data-tab=library]').click();
    const d = document.querySelector<HTMLDetailsElement>('#library .notsup'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
}
