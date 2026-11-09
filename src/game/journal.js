// The Journal: a keepsake book of everything the player has made. One page per building, with the
// code that built it, a stamp for each errand solved, and the land that has opened. No scores or
// hint counts: the Journal shows what you made, not how much help you used.
import { CHALLENGES, ERRANDS, EXPANSIONS, FRIENDSHIP, HEARTS, REVIEW_TOPICS, RESIDENTS } from '../content/index.ts';
import { $, esc, save, state } from './state.js';
import { portrait } from './town.js';
import { codeBlock } from './highlight.js';
import { heartRow, hearts, unreadLetters, villageBuilt } from './errands.js';
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
  if (built) html += `<button class="btn-soft" id="printJournal">🖨 Print it, or save it as a PDF</button>`;

  html += friendsHTML();
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
  const pb = el.querySelector('#printJournal'); if (pb) pb.onclick = printJournal;
  el.querySelectorAll('[data-friend]').forEach(d => {
    d.querySelector('.jstamp')?.appendChild(portrait(d.dataset.friend, 30));
    d.addEventListener('toggle', () => { if (d.open && d.dataset.unread) markRead(d); });
  });
  updateBadge();
}

// ---------- Friends: hearts, letters in the mailbox, gifts ----------
function friendsHTML() {
  if (!state.reviews) return `<h4 class="board-h">Friends</h4><p class="board-small">Once the village is built, every errand you solve for a resident earns a heart. Hearts bring letters to Wren's mailbox, gifts, and changes around town.</p>`;
  const h = hearts(), unread = new Set(unreadLetters());
  let html = `<h4 class="board-h">Friends</h4>`;
  for (const f of FRIENDSHIP) {
    const rid = f.resident, n = h[rid] || 0, r = RESIDENTS[rid];
    const next = n < HEARTS.letter ? `${HEARTS.letter - n} errand${HEARTS.letter - n === 1 ? '' : 's'} until a letter` : n < HEARTS.gift ? 'a gift is coming' : n < HEARTS.change ? 'something in town will change' : 'best friends';
    let body = '';
    if (n >= HEARTS.letter) body += `<div class="letter"><p>Dear neighbour,</p><p>${f.letter}</p><p class="sig">— ${r.name}</p></div>`;
    if (n >= HEARTS.gift) body += `<div class="gift"><span>${f.gift.icon}</span><div><b>${f.gift.name}</b><br>${f.gift.note}</div></div>`;
    if (n >= HEARTS.change) body += `<p class="jconcept">On the map: ${f.change}</p>`;
    const meta = `<span class="hearts">${heartRow(n)}</span> · ${next}${unread.has(rid) ? '<b class="new"> · ✉ new letter</b>' : ''}`;
    html += n
      ? `<details class="jpage" data-friend="${rid}"${unread.has(rid) ? ' data-unread="1"' : ''}><summary><span class="jstamp jportrait"></span><span class="jt"><b>${r.name}</b><small>${meta}</small></span></summary><div class="jbody">${body || `<p class="board-small">Solve more of ${r.name}'s errands and a letter will arrive.</p>`}</div></details>`
      : `<div class="jpage jlocked" data-friend="${rid}"><span class="jstamp jportrait"></span><span class="jt"><b>${r.name}</b><small>${meta}</small></span></div>`;
  }
  return html;
}
function markRead(d) {
  (state.lettersRead ||= {})[d.dataset.friend] = true; save();
  delete d.dataset.unread; d.querySelector('.new')?.remove(); updateBadge();
}
function updateBadge() {
  const tab = document.querySelector('.tabs button[data-tab=journal]'), n = unreadLetters().length;
  if (tab) tab.innerHTML = `Journal${n ? ` <span class="tab-badge">${n}</span>` : ''}`;
}
/** Open the Journal at the first unread letter (clicking the mailbox on the map). */
export function openLetters() {
  document.querySelector('.tabs button[data-tab=journal]')?.click();
  const rid = unreadLetters()[0], d = rid && document.querySelector(`#journal details[data-friend="${rid}"]`);
  if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}


// ---------- The printable Journal: a little "what I learned" booklet ----------
// Built into #printArea and printed with the browser's print dialog, which can also save a PDF.
// The print styles (styles.css, @media print) hide the game and show only the booklet.
const pre = code => `<pre>${esc(code.replace(/\s+$/, ''))}</pre>`;
export function printJournal() {
  const log = state.reviews?.log || [], h = hearts(), stamps = errandStamps(log), on = openedOn(EXPANSIONS, log);
  const doneC = CHALLENGES.filter(c => state.done[c.id]);
  const days = [...doneC.map(c => state.journal?.[c.id]?.day), ...log.map(e => e.date)].filter(d => d != null);
  const span = days.length ? `${dateOf(Math.min(...days))} – ${dateOf(Math.max(...days))}` : '';
  const year = new Date().getFullYear();
  const friends = FRIENDSHIP.filter(f => (h[f.resident] || 0) >= HEARTS.letter);

  let html = `<section class="pj-cover"><div class="pj-logo">λ</div><h1>My Haskell Town Journal</h1><p class="pj-span">${span ? `${span} ${year}` : ''}</p>
    <ul class="pj-stats"><li><b>${doneC.length}</b> of ${CHALLENGES.length} buildings</li><li><b>${log.length}</b> errands solved</li><li><b>${friends.length}</b> letters from friends</li><li><b>${Object.keys(on).length}</b> pieces of new land</li></ul>
    <p class="pj-note">Everything here is real Haskell, written by me.</p></section>`;

  html += `<h2>What I learned</h2>`;
  for (const c of doneC) {
    const j = state.journal?.[c.id], code = j?.code || state.code[c.id] || '';
    html += `<article class="pj-page"><div class="pj-h"><span class="pj-stamp">${STAMP[plotOf(c)] || '⭐'}</span><div><h3>${c.num}. ${c.title}</h3><p>${c.concept} · ${c.reward} · for ${RESIDENTS[c.resident].name}${j ? ` · ${dateOf(j.day)}` : ''}</p></div></div>
      <p class="pj-learn"><b>${c.learn.title}.</b> ${c.learn.body}</p>${code.trim() ? pre(code) : ''}</article>`;
  }

  const solved = ERRANDS.filter(e => stamps[e.id]);
  if (solved.length) {
    html += `<h2>Errands from the Notice Board</h2><p class="pj-intro">Small problems on old ideas, solved from memory, days or weeks after first learning them.</p>`;
    for (const e of solved) {
      const code = state.errandCode?.[e.id] || state.code['errand:' + e.id] || '', s = stamps[e.id];
      html += `<article class="pj-page pj-small"><div class="pj-h"><span class="pj-stamp">${topicStamp(e.topic)}</span><div><h3>${e.title}</h3><p>${REVIEW_TOPICS.find(t => t.id === e.topic)?.title ?? ''} · for ${RESIDENTS[e.resident].name} · ${dateOf(s.first)}${s.times > 1 ? ` · solved ${s.times}×` : ''}</p></div></div>${code.trim() ? pre(code) : ''}</article>`;
    }
  }

  if (friends.length) {
    html += `<h2>Letters from friends</h2>`;
    for (const f of friends) {
      const n = h[f.resident], r = RESIDENTS[f.resident];
      html += `<article class="pj-page pj-letter"><p>Dear neighbour,</p><p>${f.letter}</p><p class="pj-sig">— ${r.name}, the ${r.role}</p>
        ${n >= HEARTS.gift ? `<p class="pj-gift">${f.gift.icon} <b>${f.gift.name}.</b> ${f.gift.note}</p>` : ''}${n >= HEARTS.change ? `<p class="pj-gift">🏡 ${f.change}</p>` : ''}</article>`;
    }
  }

  const land = EXPANSIONS.filter(x => on[x.id] != null);
  if (land.length) html += `<h2>New land</h2><ul class="pj-land">${land.map(x => `<li>${LAND[x.id] || '🌿'} <b>${x.title}</b>, ${dateOf(on[x.id])}. ${x.note}</li>`).join('')}</ul>`;

  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = html;
  window.print();
}
