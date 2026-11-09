// The Journal: a keepsake book of everything the player has made. One page per building, with the
// code that built it, a stamp for each errand solved, and the land that has opened. No scores or
// hint counts: the Journal shows what you made, not how much help you used.
import { CHALLENGES, ERRANDS, EXPANSIONS, REVIEW_TOPICS, RESIDENTS } from '../content/index.ts';
import { $, esc, state } from './state.js';
import { codeBlock } from './highlight.js';
import { villageBuilt } from './errands.js';
import { errandStamps, openedOn } from './rewards.ts';

const STAMP = { house: '🏡', mailbox: '📬', bakery: '🥖', garden: '🌱', store: '🛒', library: '📚', school: '🎒', hall: '🏛️', clinic: '🩺', railway: '🚂', park: '🌳', harbour: '⚓', market: '🧺', observatory: '🔭' };
const LAND = { meadow: '🐝', orchard: '🍎', pond: '🦆', windmill: '🌾' };
const plotOf = c => c.plot || c.id;
const topicStamp = topicId => STAMP[plotOf(CHALLENGES.find(c => c.id === REVIEW_TOPICS.find(t => t.id === topicId).from[0]))] || '📌';
/** A day number (see schedule.ts dayNumber) as a short date, e.g. "9 Nov". */
const dateOf = day => new Date(day * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function page(stamp, title, meta, body, open) {
  return open
    ? `<details class="jpage"><summary><span class="jstamp">${stamp}</span><span class="jt"><b>${title}</b><small>${meta}</small></span></summary><div class="jbody">${body}</div></details>`
    : `<div class="jpage jlocked"><span class="jstamp">?</span><span class="jt"><b>${title}</b><small>${meta}</small></span></div>`;
}

export function renderJournal() {
  const el = $('#journal'); if (!el) return;
  const built = CHALLENGES.filter(c => state.done[c.id]).length;
  let html = `<p class="lib-intro">Your keepsake book: everything you've made in Haskell Town, and the code you wrote for it.</p>`;

  html += `<h4 class="board-h">Buildings · ${built} of ${CHALLENGES.length}</h4>`;
  for (const c of CHALLENGES) {
    const r = RESIDENTS[c.resident];
    if (!state.done[c.id]) { html += page('', c.concept, 'Not built yet', '', false); continue; }
    const j = state.journal?.[c.id], code = j?.code || state.code[c.id] || '';
    html += page(STAMP[plotOf(c)] || '⭐', c.reward, `${c.title} · for ${r.name}${j ? ` · ${dateOf(j.day)}` : ''}`,
      `<p class="jconcept">${c.concept}</p>${code.trim() ? codeBlock(code) : '<p class="board-small">(The code from this build wasn\'t saved.)</p>'}`, true);
  }

  html += `<h4 class="board-h">Errand stamps</h4>`;
  if (!state.reviews) {
    html += `<p class="board-small">Once the village is built, every errand you solve from the Notice Board adds a stamp here.</p>`;
  } else {
    const stamps = errandStamps(state.reviews.log), n = Object.keys(stamps).length;
    html += `<p class="board-small">${n} of ${ERRANDS.length} collected.</p><div class="jstamps">${ERRANDS.map(e => `<span class="${stamps[e.id] ? 'on' : ''}" title="${stamps[e.id] ? esc(e.title) : 'Not found yet'}">${stamps[e.id] ? topicStamp(e.topic) : '·'}</span>`).join('')}</div>`;
    for (const e of ERRANDS) {
      const s = stamps[e.id]; if (!s) continue;
      const code = state.errandCode?.[e.id] || state.code['errand:' + e.id] || '';
      html += page(topicStamp(e.topic), e.title, `for ${RESIDENTS[e.resident].name} · ${dateOf(s.first)}${s.times > 1 ? ` · solved ${s.times}×` : ''}`,
        code.trim() ? codeBlock(code) : '<p class="board-small">(No code saved.)</p>', true);
    }
  }

  if (villageBuilt() || state.reviews) {
    const on = openedOn(EXPANSIONS, state.reviews?.log || []);
    html += `<h4 class="board-h">New land</h4>`;
    for (const x of EXPANSIONS) {
      html += on[x.id] != null
        ? page(LAND[x.id] || '🌿', x.title, `opened ${dateOf(on[x.id])} · ${RESIDENTS[x.resident].name} looks after it`, `<p>${x.note}</p>`, true)
        : page('', 'Still in the mist', `opens after ${x.needs} errands`, '', false);
    }
  }
  el.innerHTML = html;
}
