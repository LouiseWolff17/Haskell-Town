// The Friends panel, left of the town map: each resident's hearts, their letters from Wren's
// mailbox, gifts, and the change their friendship made to the town (src/content/friendship.ts).
import { FRIENDSHIP, HEARTS, RESIDENTS } from '../content/index.ts';
import { $, save, state } from './state.ts';
import { portrait } from './town.ts';
import { heartRow, hearts, unreadLetters } from './errands.ts';

export function renderFriends(): void {
  const el = $('#friends'); if (!el) return;
  if (!state.reviews) {
    el.innerHTML = `<p class="board-small">Once the village is built, every errand you solve for a resident earns a heart. Hearts bring letters to Wren's mailbox, gifts, and changes around town.</p>`;
    updateBadge(); return;
  }
  const h = hearts(), unread = new Set(unreadLetters());
  let html = '';
  for (const f of FRIENDSHIP) {
    const rid = f.resident, n = h[rid] || 0, r = RESIDENTS[rid];
    const next = n < HEARTS.letter ? `${HEARTS.letter - n} errand${HEARTS.letter - n === 1 ? '' : 's'} until a letter` : n < HEARTS.gift ? 'a gift is coming' : n < HEARTS.change ? 'something in town will change' : 'best friends';
    let body = '';
    if (n >= HEARTS.letter) body += `<div class="letter"><p>Dear neighbour,</p><p>${f.letter}</p><p class="sig">— ${r.name}</p></div>`;
    if (n >= HEARTS.gift) body += `<div class="gift"><span>${f.gift.icon}</span><div><b>${f.gift.name}</b><br>${f.gift.note}</div></div>`;
    if (n >= HEARTS.change) body += `<p class="jconcept">On the map: ${f.change}</p>`;
    const meta = `<span class="hearts">${heartRow(n)}</span><br>${next}${unread.has(rid) ? '<b class="new"><br>✉ new letter</b>' : ''}`;
    html += n
      ? `<details class="jpage" data-friend="${rid}"${unread.has(rid) ? ' data-unread="1"' : ''}><summary><span class="jstamp jportrait"></span><span class="jt"><b>${r.name}</b><small>${meta}</small></span></summary><div class="jbody">${body || `<p class="board-small">Solve more of ${r.name}'s errands and a letter will arrive.</p>`}</div></details>`
      : `<div class="jpage jlocked" data-friend="${rid}"><span class="jstamp jportrait"></span><span class="jt"><b>${r.name}</b><small>${meta}</small></span></div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll<HTMLElement>('[data-friend]').forEach(d => {
    d.querySelector('.jstamp')?.appendChild(portrait(d.dataset.friend!, 30));
    d.addEventListener('toggle', () => { if (d instanceof HTMLDetailsElement && d.open && d.dataset.unread) markRead(d); });
  });
  updateBadge();
}
function markRead(d: HTMLElement): void {
  (state.lettersRead ||= {})[d.dataset.friend!] = true; save();
  delete d.dataset.unread; d.querySelector('.new')?.remove(); updateBadge();
}
function updateBadge(): void {
  const b = $('#friendsBadge'), n = unreadLetters().length;
  if (b) { b.textContent = String(n); b.hidden = !n; }
}
/** Open the first unread letter (clicking the mailbox on the map). */
export function openLetters(): void {
  const rid = unreadLetters()[0], d = rid && document.querySelector<HTMLDetailsElement>(`#friends details[data-friend="${rid}"]`);
  if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
