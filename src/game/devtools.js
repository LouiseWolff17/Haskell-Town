// Dev-only shortcuts for skipping through the game. Loaded from main.ts only under `npm run dev`.
import { CHALLENGES, EXPANSIONS } from '../content/index.ts';
import { save, state, status } from './state.js';
import { build, queueLand, revealLand } from './notebook.js';
import { ERRANDS_BY_TOPIC, errandById, reviews, today } from './errands.js';
import { completeItem, isOpen, nextDueDay, showAnswer } from './schedule.ts';
import { nextExpansion, newlyOpened } from './rewards.ts';
import { renderSidebar } from './sidebar.js';

// Mark a challenge solved with its reference solution, as if the player had run it and pressed Build.
function solve(c) {
  state.code[c.id] = c.solution;
  state.attempts[c.id] = state.attempts[c.id] || 1;
  build(c);
}
const nextOpen = () => CHALLENGES.find(c => status(c) === 'open');

const CONFIDENCES = ['sure', 'fairly', 'unsure'];
const pick = xs => xs[Math.floor(Math.random() * xs.length)];

// Solve one errand with its reference solution, the way the player would reach the given outcome:
// recalled = first run, no peek; effortful = a wrong run first; relearned = see the answer, then do the retry.
function solveErrand(rs, item, outcome) {
  if (outcome === 'mixed') outcome = pick(['recalled', 'recalled', 'effortful', 'relearned']);
  item.confidence = pick(CONFIDENCES); // so the calibration panel has something to show
  if (outcome === 'relearned') {
    item = showAnswer(rs, item, ERRANDS_BY_TOPIC[item.topic]);
    if (!item) return;
    item.confidence = pick(CONFIDENCES);
  }
  item.runs = outcome === 'effortful' ? 2 : 1;
  completeItem(rs, item, today());
  state.code['errand:' + item.errand] = errandById(item.errand)?.solution ?? '';
  (state.errandCode ||= {})[item.errand] = state.code['errand:' + item.errand]; // shown on the Journal stamp
}

export function initDevTools() {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:40;display:flex;flex-direction:column;gap:5px;padding:6px 8px;background:#3b2a2a;color:#fffaf0;border-radius:8px;font:12px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)';
  panel.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center"><b>DEV</b>
      <button data-a="next">Solve next</button><button data-a="stage">Solve stage</button>
      <button data-a="village" title="Solve every request, so the Notice Board opens">Build village</button></div>
    <div style="display:flex;gap:6px;align-items:center"><b>Errands</b>
      <select data-a="outcome" title="How dev-solved errands count">
        <option value="recalled">first try</option><option value="effortful">with effort</option>
        <option value="relearned">relearned</option><option value="mixed">mixed</option></select>
      <button data-a="one" title="Solve the first open errand of today">Solve 1</button>
      <button data-a="errands" title="Solve all the open errands of today">Solve all</button>
      <button data-a="day" title="Move the clock one day forward">+1 day</button>
      <button data-a="due" title="Move the clock to the next day that has errands">Next due</button>
      <button data-a="land" title="Solve errands and skip days until the next piece of land opens">Next land</button>
      <span data-a="clock"></span></div>`;
  panel.querySelectorAll('button, select').forEach(b => b.style.cssText = 'font:inherit;padding:3px 8px;border-radius:5px;border:0;cursor:pointer');
  const on = (a, f) => { panel.querySelector(`[data-a="${a}"]`).onclick = f; };

  on('next', () => { const c = nextOpen(); if (c) solve(c); });
  // solve every open challenge in the stage of the next one, including ones each solve unlocks
  on('stage', () => {
    const first = nextOpen(); if (!first) return;
    for (let c = first; c && c.stage === first.stage; c = nextOpen()) solve(c);
  });
  on('village', () => { for (let c = nextOpen(); c; c = nextOpen()) solve(c); });

  // move the clock forward, so spaced errands can be tried without waiting for real days
  const clock = panel.querySelector('[data-a="clock"]');
  const outcome = panel.querySelector('[data-a="outcome"]');
  const showClock = () => {
    const rs = state.reviews;
    clock.textContent = (state.devDays ? `+${state.devDays}d` : '') + (rs ? ` · ${rs.log.length} solved` : '');
  };
  const refresh = () => { save(); renderSidebar(); showClock(); };
  const setDay = d => { state.devDays = (state.devDays || 0) + Math.max(1, d - today()); };

  // Solve errands, then queue any land they opened, so the mist lifts the same way it does in play.
  const withLand = f => () => {
    const rs = reviews(); if (!rs) { clock.textContent = 'build the village first'; return; }
    const before = rs.log.length;
    f(rs);
    queueLand(newlyOpened(EXPANSIONS, before, rs.log.length)); refresh(); revealLand();
  };
  on('one', withLand(rs => { const item = rs.day.items.find(isOpen); if (item) solveErrand(rs, item, outcome.value); }));
  on('errands', withLand(rs => { for (let item; (item = rs.day.items.find(isOpen));) solveErrand(rs, item, outcome.value); }));
  on('land', withLand(rs => {
    const target = nextExpansion(EXPANSIONS, rs.log.length); if (!target) return;
    for (let guard = 0; rs.log.length < target.needs && guard < 500; guard++) {
      const item = rs.day.items.find(isOpen);
      if (item) solveErrand(rs, item, outcome.value);
      else { setDay(nextDueDay(rs, today())); rs = reviews(); }
    }
  }));
  on('day', () => { state.devDays = (state.devDays || 0) + 1; refresh(); });
  on('due', () => { const rs = reviews(); if (rs) setDay(nextDueDay(rs, today())); refresh(); });

  showClock();
  document.body.appendChild(panel);
}
