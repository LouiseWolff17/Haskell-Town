// The sidebar: request list, learning library and learning-assistance buttons.
import { CHALLENGES, RESIDENTS, COMING_SOON, NOT_SUPPORTED } from '../content/index.ts';
import { $, MODES, state, status } from './state.js';
import { codeBlock } from './highlight.js';
import { portrait, renderNightBtn } from './town.js';
import { openChallenge, setMode } from './notebook.js';
import { renderBoard } from './errands.js';
import { renderJournal } from './journal.js';
import { renderFriends } from './friends.js';

export function notSupportedHTML() {
  return `<summary>What Haskell Town can't do yet</summary><p class="ns-intro">Your code runs in a small Haskell made for this game, not the full GHC compiler. These parts of real Haskell aren't available yet:</p><ul class="ns-list">${NOT_SUPPORTED.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ul>`;
}

export function renderSidebar() {
  const n = Object.keys(state.done).length;
  $('#progressText').textContent = `${n} of ${CHALLENGES.length} requests`;
  $('#progressBar').style.width = (n / CHALLENGES.length * 100) + '%';
  const list = $('#requests'); list.innerHTML = '';
  let lastStage = null;
  CHALLENGES.forEach(c => {
    if (c.stage !== lastStage) { lastStage = c.stage; const h = document.createElement('div'); h.className = 'stage-h'; h.textContent = c.stage; list.appendChild(h); }
    const s = status(c), r = RESIDENTS[c.resident];
    const b = document.createElement('button'); b.className = `req req-${s}`; b.disabled = s === 'locked';
    b.innerHTML = `<div class="req-body"><div class="req-top"><span class="req-num">#${String(c.num).padStart(2, '0')}</span><span class="chip chip-${s}">${s === 'done' ? 'Built ✓' : s === 'open' ? 'Needs help' : 'Locked'}</span></div><div class="req-title">${c.title}</div><div class="req-meta">${r.name} · <span class="concept">${c.concept}</span></div></div>`;
    b.prepend(portrait(c.resident, 38));
    b.onclick = () => openChallenge(c.id);
    list.appendChild(b);
  });
  const soon = document.createElement('div'); soon.className = 'soon';
  soon.innerHTML = `<div class="soon-h">Coming next in town</div>` + (COMING_SOON.length ? COMING_SOON.map(s => `<div class="soon-i"><b>${s.title}</b> · ${s.concept}<br><span>${s.note}</span></div>`).join('')
    : `<div class="soon-i"><span>Every building in the plan is open. Once they're all built, residents pin errands to the Notice Board (the Errands tab), and the Workshop is always there for your own experiments.</span></div>`);
  list.appendChild(soon);
  const lib = $('#library'); lib.innerHTML = `<p class="lib-intro">Every concept you learn is kept here, so you can come back to it whenever you like.</p>`;
  CHALLENGES.forEach(c => {
    const d = document.createElement('div'); d.className = 'lib-card' + (state.done[c.id] ? '' : ' lib-locked');
    d.innerHTML = state.done[c.id] ? `<h4>${c.learn.title}</h4><p>${c.learn.body}</p>${codeBlock(c.learn.code)}` : `<h4>${c.concept}</h4><p>Unlocks when you finish “${c.title}”.</p>`;
    lib.appendChild(d);
  });
  const ns = document.createElement('details'); ns.className = 'notsup';
  ns.innerHTML = notSupportedHTML(); lib.appendChild(ns);
  renderBoard();
  renderJournal();
  renderFriends();
  renderNightBtn();
  document.querySelectorAll('.mode-seg').forEach(seg => renderSeg(seg));
}
export function renderSeg(seg) {
  seg.innerHTML = Object.entries(MODES).map(([k, m]) => `<button data-mode="${k}" class="${state.mode === k ? 'on' : ''}" title="${m.desc}">${m.label}</button>`).join('');
  seg.querySelectorAll('button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  const d = seg.parentElement.querySelector('.mode-desc'); if (d) d.textContent = MODES[state.mode].desc;
}

export function initSidebar() {
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    for (const id of ['requests', 'errands', 'library', 'journal']) $('#' + id).hidden = b.dataset.tab !== id;
    if (b.dataset.tab === 'errands') renderBoard(); // a new day may have started since the page was opened
  });
}
