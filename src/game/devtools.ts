// Dev-only shortcuts for skipping through the game. Loaded from main.ts only under `npm run dev`.
import { CHALLENGES, EXPANSIONS, HEARTS, LIFE } from '../content/index.ts';
import { save, state, status } from './state.ts';
import { build, queueFriend, queueLand, queueLife, revealLand } from './notebook.ts';
import { ERRANDS_BY_TOPIC, errandById, hearts, practised, reviews, today } from './errands.ts';
import { completeItem, isOpen, nextDueDay, showAnswer } from './schedule.ts';
import { nextExpansion, newFriendRewards, newlyOpened } from './rewards.ts';
import { renderSidebar } from './sidebar.ts';
import type { Challenge } from '../content/index.ts';
import type { Confidence, DayItem, Outcome, ReviewState } from './schedule.ts';
 
// Mark a challenge solved with its reference solution, as if the player had run it and pressed Build.
function solve(c: Challenge): void {
  state.code[c.id] = c.solution;
  state.attempts[c.id] = state.attempts[c.id] || 1;
  build(c);
}
const nextOpen = () => CHALLENGES.find(c => status(c) === 'open');
 
const CONFIDENCES: Confidence[] = ['sure', 'fairly', 'unsure'];
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
 
// Solve one errand with its reference solution, the way the player would reach the given outcome:
// recalled = first run, no peek; effortful = a wrong run first; relearned = see the answer, then do the retry.
function solveErrand(rs: ReviewState, item: DayItem, how: Outcome | 'mixed'): void {
  const outcome = how === 'mixed' ? pick<Outcome>(['recalled', 'recalled', 'effortful', 'relearned']) : how;
  item.confidence = pick(CONFIDENCES); // so the calibration panel has something to show
  if (outcome === 'relearned') {
    const retry = showAnswer(rs, item, ERRANDS_BY_TOPIC[item.topic]);
    if (!retry) return;
    item = retry;
    item.confidence = pick(CONFIDENCES);
  }
  item.runs = outcome === 'effortful' ? 2 : 1;
  completeItem(rs, item, today());
  state.code['errand:' + item.errand] = errandById(item.errand)?.solution ?? '';
  (state.errandCode ||= {})[item.errand] = state.code['errand:' + item.errand]; // shown on the Journal stamp
}
 
export function initDevTools(): void {
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
      <button data-a="hour" title="Move the time of day 3 hours forward, to try the day/night cycle">+3 h</button>
      <span data-a="clock"></span></div>`;
  panel.querySelectorAll<HTMLElement>('button, select').forEach(b => b.style.cssText = 'font:inherit;padding:3px 8px;border-radius:5px;border:0;cursor:pointer');
  const on = (a: string, f: () => void): void => { panel.querySelector<HTMLElement>(`[data-a="${a}"]`)!.onclick = f; };
 
  on('next', () => { const c = nextOpen(); if (c) solve(c); });
  // solve every open challenge in the stage of the next one, including ones each solve unlocks
  on('stage', () => {
    const first = nextOpen(); if (!first) return;
    for (let c: Challenge | undefined = first; c && c.stage === first.stage; c = nextOpen()) solve(c);
  });
  on('village', () => { for (let c = nextOpen(); c; c = nextOpen()) solve(c); });
 
  // move the clock forward, so spaced errands can be tried without waiting for real days
  const clock = panel.querySelector<HTMLElement>('[data-a="clock"]')!;
  const outcomeSel = panel.querySelector<HTMLSelectElement>('[data-a="outcome"]')!;
  const outcome = (): Outcome | 'mixed' => outcomeSel.value as Outcome | 'mixed';
  const showClock = () => {
    const rs = state.reviews;
    clock.textContent = [
      state.devDays ? `+${state.devDays}d` : '',
      state.devHour != null ? `${state.devHour}:00` : '',
      rs ? `${rs.log.length} solved` : '',
    ].filter(Boolean).join(' · ');
  };
  const refresh = () => { save(); renderSidebar(); showClock(); };
  const setDay = (d: number): void => { state.devDays = (state.devDays || 0) + Math.max(1, d - today()); };
 
  // Solve errands, then queue the land, friendship rewards and town life they brought,
  // so everything shows up the same way it does in play.
  const withLand = (f: (rs: ReviewState) => void) => (): void => {
    const rs = reviews(); if (!rs) { clock.textContent = 'build the village first'; return; }
    const before = rs.log.length, hBefore = hearts(), lBefore = practised();
    f(rs);
    queueLand(newlyOpened(EXPANSIONS, before, rs.log.length));
    const hAfter = hearts();
    for (const rid of Object.keys(hAfter)) queueFriend(rid, newFriendRewards(hBefore[rid] || 0, hAfter[rid], HEARTS));
    const lAfter = practised();
    queueLife(LIFE.filter(l => lAfter.has(l.topic) && !lBefore.has(l.topic)));
    refresh(); revealLand();
  };
  on('one', withLand(rs => { const item = rs.day?.items.find(isOpen); if (item) solveErrand(rs, item, outcome()); }));
  on('errands', withLand(rs => { for (let item; (item = rs.day?.items.find(isOpen));) solveErrand(rs, item, outcome()); }));
  on('land', withLand(start => {
    let rs = start;
    const target = nextExpansion(EXPANSIONS, rs.log.length); if (!target) return;
    for (let guard = 0; rs.log.length < target.needs && guard < 500; guard++) {
      const item = rs.day?.items.find(isOpen);
      if (item) solveErrand(rs, item, outcome());
      else { setDay(nextDueDay(rs, today())); rs = reviews() ?? rs; }
    }
  }));
  on('day', () => { state.devDays = (state.devDays || 0) + 1; refresh(); });
  on('due', () => { const rs = reviews(); if (rs) setDay(nextDueDay(rs, today())); refresh(); });
  on('hour', () => { state.devHour = ((state.devHour ?? new Date().getHours()) + 3) % 24; refresh(); });
 
  showClock();
  document.body.appendChild(panel);
}
 