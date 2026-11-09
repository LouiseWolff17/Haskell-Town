// Shared game state and small helpers.
import { CHALLENGES } from '../content/index.ts';

export const KEY = 'haskelltown-v1';
export const MODES = {
  guided: { label: 'Guided', desc: 'Concept explained up front, code with ___ blanks to fill in, step-by-step hints.' },
  balanced: { label: 'Balanced', desc: 'You get the type signature and the tests. Hints whenever you ask.' },
  independent: { label: 'Independent', desc: 'Just the problem and an empty notebook. Hints are still there if you want them.' },
};
export const HINT_LEVELS = ['Concept', 'Direction', 'Structure', 'Almost there'];
export const byId = id => CHALLENGES.find(c => c.id === id);
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The player's progress, saved in localStorage. Always mutate this object; never replace it.
export const state = { done: {}, code: {}, hints: {}, attempts: {}, mode: 'guided', welcomed: false };
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.done) Object.assign(state, s); } catch (e) {}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
// Start the town over, keeping the chosen learning-assistance mode.
export function resetProgress() {
  const mode = state.mode;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, { done: {}, code: {}, hints: {}, attempts: {}, mode, welcomed: true });
  save();
}
export const isUnlocked = c => c.requires.every(r => state.done[r]);
export const status = c => state.done[c.id] ? 'done' : isUnlocked(c) ? 'open' : 'locked';

