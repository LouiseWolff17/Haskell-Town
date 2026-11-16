// The five town interiors (docs/gift-items-design.md, section 4). Once a gift has opened a place, its door
// on the map leads inside: the map becomes the room (rooms.ts). Looking at things there either gets a line
// in the dialogue box over the map, or opens a pop-up (the recipe, the till, the letters, …).
// The doormat leads back to town. Every interior is optional: a cozy toy or a small Haskell bonus,
// never a required challenge. Content is in src/content/interiors.ts.
import { CHALLENGES, COTTAGE, EXPANSIONS, FRIENDSHIP, HALL, ITEMS, KITCHEN, MAX_HEARTS, READING, RESIDENTS, STORE } from '../content/index.ts';
import { $, esc, save, state } from './state.ts';
import { codeBlock } from './highlight.ts';
import { hearts, solvedErrands, today } from './errands.ts';
import { openExpansions } from './rewards.ts';
import { runner } from './notebook.ts';
import { portrait } from './town.ts';
import { ROOMS, enterRoom, exitRoom, inRoom } from './rooms.ts';
import type { Spot, View } from './rooms.ts';

/** What a room shows: a line in the dialogue box, or a pop-up. */
interface Room {
  /** Show a line in the dialogue box (HTML). */
  say(html: string): void;
  /** Open the pop-up with this content (or replace what's in it), and return its body. */
  panel(html: string): HTMLElement;
  /** Changes to how the room looks: it redraws every frame. */
  view: View;
}
interface Interior {
  view(): View;
  /** Something in the room was looked at (a Spot id from rooms.ts). */
  act(id: string, room: Room): void;
}
const INTERIORS: Record<string, Interior> = {};
export const hasInterior = (rid: string): boolean => rid in ROOMS;
const placeOf = (rid: string): string => ITEMS.find(i => i.resident === rid)?.place ?? '';

// ---------- The pop-up ----------
const pop = (): HTMLElement => $('#roomPop');
export const popOpen = (): boolean => !pop().hidden;
function openPop(html: string): HTMLElement {
  const body = pop().querySelector<HTMLElement>('.room-pop-body')!, fresh = pop().hidden;
  body.innerHTML = html;
  if (fresh) {
    pop().hidden = false; document.body.classList.add('modal-open');
    pop().querySelector<HTMLElement>('.room-pop')!.scrollTop = 0;
    // straight to the first thing to type in, if there is one
    setTimeout(() => (body.querySelector<HTMLElement>('textarea, input') ?? pop().querySelector<HTMLElement>('.x'))?.focus(), 50);
  }
  return body;
}
export function closePop(): void {
  if (pop().hidden) return;
  pop().hidden = true; pop().querySelector('.room-pop-body')!.innerHTML = '';
  document.body.classList.remove('modal-open');
  $('#town').focus?.();
}
export function initInteriors(): void {
  pop().querySelector<HTMLElement>('.x')!.onclick = closePop;
  pop().addEventListener('click', e => { if (e.target === e.currentTarget) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popOpen()) { e.stopImmediatePropagation(); closePop(); } }, true);
}

let leaving: (() => void) | null = null;
/** Go inside `rid`'s place. `onLeave` puts you back outside its door. */
export function enterInterior(rid: string, onLeave: () => void): void {
  const it = INTERIORS[rid]; if (!it) return;
  leaving = onLeave;
  const sayBox = $('#roomSay');
  const room: Room = {
    say: html => {
      sayBox.innerHTML = `<div class="room-say-who"></div><p>${html}</p>`;
      sayBox.querySelector('.room-say-who')!.append(portrait(rid, 44));
      sayBox.hidden = false;
    },
    panel: openPop,
    view: it.view(),
  };
  enterRoom(rid, room.view, id => id === 'leave' ? leaveInterior() : it.act(id, room), () => { sayBox.hidden = true; });
  $('#hoverLabel').innerHTML = roomLabel(null);
  $('#town').setAttribute('aria-label', `Inside ${placeOf(rid)}. Walk with the arrow keys, press E to look at things, and go back out by the doormat.`);
  room.say(esc(ITEMS.find(i => i.resident === rid)?.visit ?? ''));
}
/** Step back out through the door. */
export function leaveInterior(): void {
  if (!inRoom()) return;
  closePop(); exitRoom();
  $('#roomSay').hidden = true; $('#town').setAttribute('aria-label', 'Pixel-art map of Haskell Town');
  const f = leaving; leaving = null; f?.();
}
/** The line under the map while you're inside: what the mouse is over, or how to get about. */
export function roomLabel(s: Spot | null): string {
  if (s) return `<b>${esc(s.label)}</b>: click to ${s.id === 'leave' ? 'go back out' : 'look'}, or stand next to it and press <kbd>E</kbd>.`;
  return `Inside <b>${esc(placeOf(inRoom() ?? ''))}</b>. Walk with <kbd>←↑↓→</kbd> or <kbd>WASD</kbd> (or click), and press <kbd>E</kbd> to look at things. The doormat takes you back to town.`;
}
const inside = (): NonNullable<typeof state.inside> => (state.inside ||= {});
/** The next line of a list each time, so repeat visits don't feel the same. */
const cycler = (lines: string[]) => { let n = 0; return (): string => lines[n++ % lines.length]; };
/** A result from the runner, shown like the Workshop console. */
const consoleOut = (s: string, cls = ''): string => `<pre class="console in-console ${cls}">${esc(s)}</pre>`;
const codeHTML = (s: string): string => s.replace(/`([^`]+)`/g, '<code>$1</code>');

// ---------- Wren's cottage: tea, the cat, her letters pinned up ----------
INTERIORS.wren = {
  view: () => ({ letters: FRIENDSHIP.filter(f => state.lettersRead?.[f.resident]).length }),
  act: (() => {
    const tea = cycler(COTTAGE.tea), cat = cycler(COTTAGE.cat);
    return (id: string, room: Room) => {
      if (id === 'tea') room.say(esc(tea()));
      if (id === 'cat') room.say(esc(cat()));
      if (id === 'letters') {
        const pinned = FRIENDSHIP.filter(f => state.lettersRead?.[f.resident]).map(f => RESIDENTS[f.resident].name);
        room.panel(`<h4 class="board-h">Pinned up by the window</h4>${pinned.length
          ? `<p class="in-pins">${pinned.map(n => `<span>✉️ ${esc(n)}</span>`).join('')}</p><p class="board-small">Wren keeps every letter that came through her mailbox for you. She has read none of them. Probably.</p>`
          : `<p class="board-small">A row of empty pins, waiting for letters.</p>`}`);
      }
    };
  })(),
};

// ---------- The bakery kitchen: fold the dough, then write `layers` yourself and bake ----------
INTERIORS.hazel = {
  view: () => ({ folds: 0, baked: !!state.inside?.baked }),
  act(id, room) {
    if (id === 'dough') {
      const n = room.view.folds = Number(room.view.folds) < KITCHEN.maxFolds ? Number(room.view.folds) + 1 : 0;
      room.say(`${esc(KITCHEN.folds[n])} <code class="in-layers">layers ${n} = ${3 ** n}</code>`);
    }
    if (id === 'oven') room.say(esc(room.view.baked ? KITCHEN.ovenBaked : KITCHEN.oven));
    if (id === 'recipe') recipe(room);
  },
};
function recipe(room: Room): void {
  const key = 'interior:bakery';
  const el = room.panel(`<h4 class="board-h">Hazel's recipe, in Haskell</h4>
    <p class="board-small">"Fold the butter in like a recursive function, one layer at a time." Every fold makes three of what you had before. Write it down, and it can go in the oven.</p>
    <textarea class="in-code" spellcheck="false" rows="4" aria-label="Your layers function">${esc(state.code[key] ?? KITCHEN.starter)}</textarea>
    <div class="in-row"><button class="btn-soft">🔥 Bake it</button><span class="board-small">${state.inside?.baked ? 'Baked before. Hazel is happy to bake again.' : 'Optional. Ctrl+Enter bakes too.'}</span></div>
    <div data-result aria-live="polite"></div>`);
  const ed = el.querySelector<HTMLTextAreaElement>('.in-code')!, bakeBtn = el.querySelector<HTMLButtonElement>('.btn-soft')!, result = el.querySelector<HTMLElement>('[data-result]')!;
  ed.addEventListener('input', () => { state.code[key] = ed.value; save(); });
  ed.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); ed.setRangeText('  ', ed.selectionStart, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); bake(); }
  });
  const bake = async () => {
    bakeBtn.disabled = true; result.innerHTML = `<p class="board-small">Into the oven…</p>`;
    const r = await runner.check(KITCHEN.puzzle, ed.value);
    bakeBtn.disabled = false;
    if (!ed.isConnected) return;
    if (r.status === 'stopped') { result.innerHTML = `<p class="in-line">The oven timer went off after ${r.seconds} seconds and nothing came out. Does every fold get closer to <code>layers 0</code>?</p>`; return; }
    if (r.status === 'compile-error') { result.innerHTML = consoleOut(r.error.message, 'in-err'); return; }
    if (r.status !== 'tested') { result.innerHTML = `<p class="in-line">Hazel's recipe needs a function called <code>layers :: Int -> Int</code>.</p>`; return; }
    // each error once, after the rows (an unfilled blank would otherwise repeat under every test)
    const errors = [...new Set(r.tests.flatMap(t => t.error && !t.ok ? [t.error] : []))];
    const rows = r.tests.map(t => `${t.ok ? '✓' : '✗'} ${t.expr} = ${t.ok ? t.got : `${t.got ?? '…'}  (Hazel expects ${t.want})`}`).join('\n')
      + errors.map(e => `\n\n${e}`).join('');
    if (r.passed) {
      inside().baked ||= today(); save(); room.view.baked = true;
      result.innerHTML = consoleOut(rows, 'in-ok') + `<p class="in-line">${KITCHEN.baked}</p>`;
      room.say(esc(KITCHEN.baked));
    } else {
      result.innerHTML = consoleOut(rows) + `<p class="in-line">${r.ruleBreak?.rule === 'recursion' ? codeHTML(KITCHEN.recursion) : KITCHEN.notYet}</p>`;
    }
  };
  bakeBtn.onclick = bake;
}

// ---------- The library reading room: your own section, with the sunflower as a bookmark ----------
INTERIORS.moss = {
  view: () => ({}),
  act: (() => {
    const chair = cycler(READING.chair);
    return (id: string, room: Room) => { if (id === 'chair') room.say(esc(chair())); else section(room); };
  })(),
};
function section(room: Room): void {
  const built = CHALLENGES.filter(c => state.done[c.id]);
  if (!built.length) { room.panel(`<p class="board-small">Your section is empty for now.</p>`); return; }
  const last = [...built].sort((a, b) => (state.journal?.[a.id]?.day ?? 0) - (state.journal?.[b.id]?.day ?? 0)).at(-1)!;
  const at = built.some(c => c.id === state.inside?.bookmark) ? state.inside!.bookmark! : last.id;
  const c = built.find(c => c.id === at)!, code = state.journal?.[at]?.code || state.code[at] || '';
  const el = room.panel(`<h4 class="board-h">Your section · ${built.length} ${built.length === 1 ? 'book' : 'books'}</h4>
    <p class="board-small">One book for everything you've built. Pick one and the sunflower moves to it.</p>
    <div class="in-shelf">${built.map(b => `<button class="in-book${b.id === at ? ' marked' : ''}" data-book="${b.id}" aria-pressed="${b.id === at}">${b.id === at ? '🌻 ' : ''}${esc(b.reward)}</button>`).join('')}</div>
    <h4 class="board-h">${esc(c.reward)} · ${esc(c.concept)}</h4>
    ${code.trim() ? codeBlock(code) : `<p class="board-small">This page is blank. The code from this build wasn't saved.</p>`}`);
  el.querySelectorAll<HTMLElement>('[data-book]').forEach(b => b.onclick = () => {
    inside().bookmark = b.dataset.book; save(); section(room);
    el.querySelector<HTMLElement>(`[data-book="${b.dataset.book}"]`)?.focus();
  });
}

// ---------- Bram's store: the shelf as a list, and the till as a λ> prompt ----------
INTERIORS.bram = {
  view: () => ({}),
  act: (() => {
    const bram = cycler(STORE.bram);
    return (id: string, room: Room) => {
      if (id === 'bram') room.say(esc(bram()));
      if (id === 'shelf') room.panel(`<h4 class="board-h">On the shelf</h4>
        <div class="in-shelfrow">${STORE.shelf.map(s => `<div class="in-item"><span aria-hidden="true">${s.icon}</span><b>${s.name}</b><small>${s.price} <s>coins</s></small></div>`).join('')}</div>
        <p class="board-small">${esc(STORE.till)}</p>`);
      if (id === 'till') till(room);
    };
  })(),
};
function till(room: Room): void {
  const key = 'interior:store';
  const el = room.panel(`<h4 class="board-h">Bram's till</h4>
    <p class="board-small">Bram keeps the shelf as a list. Ask the till anything about it.</p>
    ${codeBlock(STORE.source)}
    <div class="in-row in-prompt"><label for="tillExpr"><code>λ&gt;</code></label><input id="tillExpr" class="in-input" spellcheck="false" autocomplete="off" value="${esc(state.code[key] ?? STORE.tries[0])}"><button class="btn-soft">Ask the till</button></div>
    <div class="in-row in-tries">${STORE.tries.map(t => `<button class="linkbtn" data-try="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div data-result aria-live="polite"></div>`);
  const input = el.querySelector<HTMLInputElement>('#tillExpr')!, go = el.querySelector<HTMLButtonElement>('.in-prompt .btn-soft')!, result = el.querySelector<HTMLElement>('[data-result]')!;
  const ask = async () => {
    const expr = input.value.trim(); if (!expr) return;
    state.code[key] = expr; save(); go.disabled = true;
    const r = await runner.evaluate(STORE.source, expr, '');
    go.disabled = false;
    if (!input.isConnected) return;
    if (r.status === 'stopped') result.innerHTML = `<p class="in-line">The till is still counting after ${r.seconds} seconds. Bram gives it a gentle tap.</p>`;
    else if (r.status === 'evaluated') result.innerHTML = r.runtimeError ? consoleOut(r.runtimeError.message, 'in-err') : consoleOut(`${r.value ?? r.output?.out ?? ''}\n  :: ${r.type}`, 'in-ok');
    else result.innerHTML = consoleOut(r.error.message.replace(/^Line 1: /, ''), 'in-err');
  };
  go.onclick = ask;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
  el.querySelectorAll<HTMLElement>('[data-try]').forEach(b => b.onclick = () => { input.value = b.dataset.try!; ask(); });
}

// ---------- City Hall: Fern, the town records, the proposed holiday, and the visitors' book ----------
INTERIORS.fern = {
  view: () => ({}),
  act: (() => {
    const fern = cycler(HALL.fern);
    return (id: string, room: Room) => {
      if (id === 'fern') room.say(esc(fern()));
      if (id === 'records') records(room);
      if (id === 'proposal') room.panel(`<h4 class="board-h">On the notice board</h4>${proposal()}`);
      if (id === 'book') visitorsBook(room);
    };
  })(),
};
function records(room: Room): void {
  const best = Object.values(hearts()).filter(n => n >= MAX_HEARTS).length;
  room.panel(`<h4 class="board-h">The town records</h4>
    <ul class="in-records">
      <li><b>${CHALLENGES.filter(c => state.done[c.id]).length}</b> of ${CHALLENGES.length} buildings</li>
      <li><b>${solvedErrands()}</b> errands solved</li>
      <li><b>${openExpansions(EXPANSIONS, solvedErrands()).length}</b> of ${EXPANSIONS.length} new lands opened</li>
      <li><b>${best}</b> ${best === 1 ? 'friend' : 'friends'} with every heart</li>
    </ul>`);
}
function proposal(): string {
  const name = state.inside?.name;
  return `<div class="in-proposal"><b>Proposed holiday:</b> ${name ? `<i>${esc(name)} Day</i>, in honour of ${esc(name)}, who built most of this town.` : '<i>[name to be confirmed]</i> Day.'} Proposed by Fern. Seconded by Fern. Under review by the council (Fern).</div>`
    + (name ? '' : `<p class="board-small">Fern needs a name. Perhaps the visitors' book by the door would help.</p>`);
}
function visitorsBook(room: Room): void {
  const el = room.panel(`<h4 class="board-h">The visitors' book</h4>
    <p class="board-small">The hall greets everyone who signs in. This is how:</p>
    ${codeBlock(HALL.program)}
    <div class="in-row in-prompt"><label for="hallName">Your name</label><input id="hallName" class="in-input" maxlength="30" autocomplete="off" value="${esc(state.inside?.name ?? '')}"><button class="btn-soft">▶ Run main</button></div>
    <div data-result aria-live="polite"></div>`);
  const input = el.querySelector<HTMLInputElement>('#hallName')!, go = el.querySelector<HTMLButtonElement>('.in-prompt .btn-soft')!, res = el.querySelector<HTMLElement>('[data-result]')!;
  const run = async () => {
    const typed = input.value.trim().replace(/\s+/g, ' '); go.disabled = true;
    const r = await runner.runMain(HALL.program, typed);
    go.disabled = false;
    if (!input.isConnected) return;
    if (r.status === 'ran') {
      const ok = !r.output.error && !!typed;
      if (ok) { inside().name = typed; save(); }
      res.innerHTML = consoleOut(r.output.out + (r.output.error ? r.output.error.message : ''), ok ? 'in-ok' : 'in-err')
        + (ok ? `<p class="in-line">Fern updates the holiday proposal at once.</p>${proposal()}` : `<p class="in-line">The hall waited for a name on the line, but none came. Type one in and run it again.</p>`);
    } else if (r.status === 'stopped') res.innerHTML = `<p class="in-line">The hall is still thinking. Fern says it does that.</p>`;
    else res.innerHTML = consoleOut('The hall cleared its throat but said nothing.', 'in-err');
  };
  go.onclick = run;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
}
