// The Notice Board: once the village is built, residents pin up errands — small new problems on
// old topics, solved from memory and spaced out over days. The scheduling rules are in schedule.ts.
import { CHALLENGES, ERRANDS, EXPANSIONS, HEARTS, LEGACY_TOPICS, MAX_HEARTS, REVIEW_TOPICS, RESIDENTS } from '../content/index.ts';
import { heartsByResident, nextExpansion } from './rewards.ts';
import { $, byId, esc, save, state } from './state.js';
import { codeBlock } from './highlight.js';
import { portrait } from './town.js';
import { openErrand } from './notebook.js';
import { DAILY_LIMIT, INTERVALS, MAX_BOX, calibration, dayNumber, ensureDay, isOpen, nextDueDay, startReviews, syncTopics } from './schedule.ts';

export const errandById = id => ERRANDS.find(e => e.id === id);
export const topicById = id => REVIEW_TOPICS.find(t => t.id === id);
export const ERRANDS_BY_TOPIC = Object.fromEntries(REVIEW_TOPICS.map(t => [t.id, ERRANDS.filter(e => e.topic === t.id).map(e => e.id)]));

/** Today's day number. The dev tools can move the clock forward with state.devDays. */
export const today = () => dayNumber(new Date()) + (state.devDays || 0);
export const villageBuilt = () => CHALLENGES.every(c => state.done[c.id]);
/** Errands solved so far, in any way. New land opens as this grows (src/content/expansions.ts). */
export const solvedErrands = () => state.reviews?.log.length || 0;
/** Friendship hearts per resident, from the errands of theirs you've solved. */
export const hearts = (log = state.reviews?.log || []) => heartsByResident(log, id => errandById(id)?.resident, MAX_HEARTS);
/** Residents whose letter has arrived but hasn't been opened yet. */
export const unreadLetters = () => Object.entries(hearts()).filter(([rid, h]) => h >= HEARTS.letter && !state.lettersRead?.[rid]).map(([rid]) => rid);
export const heartRow = n => '♥'.repeat(n) + '♡'.repeat(Math.max(0, MAX_HEARTS - n));

/** The review state, started when the village is finished, with today's errands planned. Null before that. */
export function reviews() {
  if (!villageBuilt() && !state.reviews) return null;
  let changed = false;
  if (!state.reviews) { state.reviews = startReviews(REVIEW_TOPICS.map(t => t.id), today()); changed = true; }
  if (syncTopics(state.reviews, REVIEW_TOPICS.map(t => t.id), today(), LEGACY_TOPICS, id => errandById(id)?.topic)) changed = true;
  if (ensureDay(state.reviews, ERRANDS_BY_TOPIC, today())) changed = true;
  if (changed) save();
  return state.reviews;
}
export const openItems = () => (reviews()?.day.items || []).filter(isOpen);
/** Residents with an errand waiting today (drawn with a ? on the map). */
export const waitingResidents = () => new Set(openItems().map(i => errandById(i.errand).resident));

export function whenText(day) {
  const d = day - today();
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}
const OUTCOME = {
  recalled: { chip: 'Done ✓', note: 'from memory, first try' },
  effortful: { chip: 'Done ✓', note: 'with some effort' },
  relearned: { chip: 'Done ✓', note: 'relearned' },
};

export function renderBoard() {
  const el = $('#errands'); if (!el) return;
  const tab = document.querySelector('.tabs button[data-tab=errands]');
  const rs = reviews();
  if (!rs) {
    const n = CHALLENGES.filter(c => state.done[c.id]).length;
    if (tab) tab.textContent = 'Errands';
    el.innerHTML = `<div class="board-locked"><div class="board-pin">📌</div><h4>The Notice Board</h4>
      <p>Once the whole village is built, residents will pin small errands here: new problems on the ideas you learned, to solve from memory, a few each day.</p>
      <p class="board-prog">${n} of ${CHALLENGES.length} requests done</p></div>`;
    return;
  }
  const items = rs.day.items, open = items.filter(isOpen);
  if (tab) tab.innerHTML = `Errands${open.length ? ` <span class="tab-badge">${open.length}</span>` : ''}`;

  let html = `<p class="lib-intro">${open.length
    ? `Today's errands. Solve each one <b>from memory</b> first: the effort of remembering is what makes it stick.`
    : items.length ? `All of today's errands are done.` : `Nothing is pinned up today.`}</p>`;
  html += `<div class="errand-list"></div>`;
  const solved = rs.log.length, next = nextExpansion(EXPANSIONS, solved);
  if (next) {
    const prev = Math.max(0, ...EXPANSIONS.filter(x => x.needs <= solved).map(x => x.needs)), pct = Math.round((solved - prev) / (next.needs - prev) * 100);
    html += `<div class="land-prog"><div><b>New land</b> · ${next.needs - solved} more errand${next.needs - solved === 1 ? '' : 's'} until the mist lifts south of the railway</div><span class="cal-bar"><i style="width:${pct}%"></i></span></div>`;
  } else html += `<div class="land-prog"><div><b>All the land is open.</b> Errands still keep your memory fresh.</div></div>`;
  if (!open.length) {
    html += `<div class="board-rest"><b>Next errands: ${whenText(nextDueDay(rs, today()))}.</b> Coming back after a gap, when things are a little forgotten, does more for your memory than doing extra today.</div>`;
  }

  // how well each topic is remembered
  html += `<h4 class="board-h">Your memory of each topic</h4><ul class="topic-list">`;
  for (const t of REVIEW_TOPICS) {
    const p = rs.topics[t.id];
    const pips = Array.from({ length: MAX_BOX }, (_, i) => `<i class="${i < p.box ? 'on' : ''}"></i>`).join('');
    const inToday = items.some(x => x.topic === t.id && isOpen(x));
    html += `<li><span class="topic-name">${t.title}</span><span class="pips" title="Box ${p.box} of ${MAX_BOX}">${pips}</span><span class="topic-next">${p.reviews === 0 && !inToday ? 'not yet' : inToday ? 'today' : whenText(Math.max(p.due, today() + 1))}</span></li>`;
  }
  html += `</ul>`;

  // calibration: did confidence match results?
  const cal = calibration(rs.log), rated = Object.values(cal).reduce((a, b) => a + b.total, 0);
  if (rated >= 3) {
    const label = { sure: 'Sure', fairly: 'Fairly sure', unsure: 'Not sure' };
    html += `<h4 class="board-h">Were you as sure as you thought?</h4><ul class="cal-list">${['sure', 'fairly', 'unsure'].filter(k => cal[k].total).map(k =>
      `<li><span>${label[k]}</span><span class="cal-bar"><i style="width:${Math.round(cal[k].firstTry / cal[k].total * 100)}%"></i></span><span>${cal[k].firstTry} of ${cal[k].total} right first time</span></li>`).join('')}</ul>
      <p class="board-small">Most people feel surer than their results show, especially right after reading something. If your “Sure” bar isn't full, that's worth knowing.</p>`;
  }

  html += `<details class="board-why"><summary>Why do errands come back?</summary>
    <p>The Notice Board uses two of the most reliable findings about learning:</p>
    <p><b>Retrieval practice.</b> Pulling an idea out of your memory strengthens it far more than reading it again. So errands come without hints, and the answer comes <i>after</i> you've tried.</p>
    <p><b>Spacing.</b> Practice spread over days beats the same practice crammed into one sitting. Each time you solve a topic first try, it comes back after a longer gap: ${INTERVALS.slice(1).join(', ')} days.</p>
    <p>Both feel harder than re-reading, and that's why people tend to avoid them: effort feels like not learning. It's the opposite. A struggle that ends in remembering is the useful kind.</p>
    <p>A few more things it does: at most ${DAILY_LIMIT} errands a day, on mixed topics; a fresh problem each time, not the same one again; and if you see an answer, a new errand on that topic comes back later the same day, so you finish by recalling it yourself.</p>
    <p class="board-small">Based on Carpenter, Pan &amp; Butler (2022), “The science of effective learning with spacing and retrieval practice”, <i>Nature Reviews Psychology</i> 1, 496–511.</p>
  </details>`;
  el.innerHTML = html;

  const list = el.querySelector('.errand-list');
  items.forEach((item, i) => {
    const e = errandById(item.errand), t = topicById(item.topic), r = RESIDENTS[e.resident];
    const s = item.outcome ? 'done' : item.sawAnswer ? 'seen' : 'open';
    const chip = s === 'done' ? OUTCOME[item.outcome].chip : s === 'seen' ? 'Answer seen' : item.retry ? 'Try again' : 'To do';
    const b = document.createElement('button'); b.className = `req req-${s === 'open' ? 'open' : 'done'}`;
    b.innerHTML = `<div class="req-body"><div class="req-top"><span class="req-num">${esc(t.title)}</span><span class="chip chip-${s === 'open' ? 'open' : 'done'}">${chip}</span></div><div class="req-title">${e.title}</div><div class="req-meta">${r.name}${s === 'done' ? ` · ${OUTCOME[item.outcome].note}` : s === 'seen' ? ' · a new one is below' : ''}</div></div>`;
    b.prepend(portrait(e.resident, 38));
    b.onclick = () => openErrand(i);
    list.appendChild(b);
  });
}

/** The Library cards that taught a topic: the cue a player can peek at. */
export function cueHTML(topicId) {
  return topicById(topicId).from.map(id => byId(id)).map(c => `<div class="lib-card"><h4>${c.learn.title}</h4><p>${c.learn.body}</p>${codeBlock(c.learn.code)}</div>`).join('');
}
