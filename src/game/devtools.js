// Dev-only shortcuts for skipping through the game. Loaded from main.ts only under `npm run dev`.
import { CHALLENGES } from '../content/index.ts';
import { state, status } from './state.js';
import { build } from './notebook.js';

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
  panel.innerHTML = '<b>DEV</b><button data-a="next">Solve next</button><button data-a="stage">Solve stage</button>';
  panel.querySelectorAll('button').forEach(b => b.style.cssText = 'font:inherit;padding:3px 8px;border-radius:5px;border:0;cursor:pointer');
  panel.querySelector('[data-a="next"]').onclick = () => { const c = nextOpen(); if (c) solve(c); };
  // solve every open challenge in the stage of the next one, including ones each solve unlocks
  panel.querySelector('[data-a="stage"]').onclick = () => {
    const first = nextOpen(); if (!first) return;
    for (let c = first; c && c.stage === first.stage; c = nextOpen()) solve(c);
  };
  document.body.appendChild(panel);
}
