// Dev-only shortcuts for skipping through the game. Loaded from main.ts only under `npm run dev`.
import { CHALLENGES, ERRANDS, EXPANSIONS } from '../content/index.ts';
import { save, state, status } from './state.js';
import { build, queueLand, revealLand } from './notebook.js';
import { reviews, today } from './errands.js';
import { completeItem, isOpen } from './schedule.ts';
import { newlyOpened } from './rewards.ts';
import { renderSidebar } from './sidebar.js';

// Mark a challenge solved with its reference solution, as if the player had run it and pressed Build.
function solve(c) {
  state.code[c.id] = c.solution;
  state.attempts[c.id] = state.attempts[c.id] || 1;
  build(c);
}
const nextOpen = () => CHALLENGES.find(c => status(c) === 'open');

export function initDevTools() {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:40;display:flex;gap:6px;align-items:center;padding:6px 8px;background:#3b2a2a;color:#fffaf0;border-radius:8px;font:12px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)';
  panel.innerHTML = '<b>DEV</b><button data-a="next">Solve next</button><button data-a="stage">Solve stage</button><button data-a="errands" title="Solve the open errands of today with their reference solutions">Solve errands</button><button data-a="day" title="Move the clock one day forward, for testing the Notice Board">+1 day</button><span data-a="clock"></span>';
  panel.querySelectorAll('button').forEach(b => b.style.cssText = 'font:inherit;padding:3px 8px;border-radius:5px;border:0;cursor:pointer');
  panel.querySelector('[data-a="next"]').onclick = () => { const c = nextOpen(); if (c) solve(c); };
  // solve every open challenge in the stage of the next one, including ones each solve unlocks
  panel.querySelector('[data-a="stage"]').onclick = () => {
    const first = nextOpen(); if (!first) return;
    for (let c = first; c && c.stage === first.stage; c = nextOpen()) solve(c);
  };
  // solve today's errands, as if from memory first try, so new land can be tried quickly
  panel.querySelector('[data-a="errands"]').onclick = () => {
    const rs = reviews(); if (!rs) return;
    const before = rs.log.length;
    for (const item of rs.day.items.filter(isOpen)) {
      item.runs = 1; completeItem(rs, item, today());
      state.code['errand:' + item.errand] = ERRANDS.find(e => e.id === item.errand)?.solution ?? '';
      (state.errandCode ||= {})[item.errand] = state.code['errand:' + item.errand];
    }
    queueLand(newlyOpened(EXPANSIONS, before, rs.log.length)); save(); renderSidebar(); revealLand();
  };
  // move the clock forward, so spaced errands can be tried without waiting for real days
  const clock = panel.querySelector('[data-a="clock"]');
  const showClock = () => { clock.textContent = state.devDays ? `(+${state.devDays}d)` : ''; };
  panel.querySelector('[data-a="day"]').onclick = () => { state.devDays = (state.devDays || 0) + 1; save(); showClock(); renderSidebar(); };
  showClock();
  document.body.appendChild(panel);
}
