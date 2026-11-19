// Your garden plot (docs/gift-items-design.md, section 8b): a small fenced patch by Wren's cottage that appears with your
// first seed packet. Plant a seed in an empty bed and it grows a stage a day on your own clock (seed → sprout → bud →
// ready); a ready plant waits for you, since nothing here wilts. Picking puts a flower or a vegetable in the Satchel, for
// Bram's till. The rules are in garden-rules.ts, the plot on the map (art, walking up to it) in town.ts.
import { FINDS, GARDEN_BEDS, PLANTS } from '../content/index.ts';
import type { Plant } from '../content/index.ts';
import { esc, save, state } from './state.ts';
import { today } from './errands.ts';
import { addFind, haveUseful, satchelSlots, satchelUsed } from './purse.ts';
import { openPop } from './interiors.ts';
import { renderSatchel } from './satchel.ts';
import { bedsOf, daysLeft, plantFor, stageOf } from './garden-rules.ts';
import type { Bed, Stage } from './garden-rules.ts';

export const plantOf = (bed: Bed | null): Plant | undefined => bed ? PLANTS.find(p => p.id === bed.plant) : undefined;
/** The plot is there once Wren's cottage is built and you've had seeds (it stays once something has been planted). */
export const gardenShown = (): boolean => !!state.done.house && (!!state.garden || haveUseful('seeds') > 0);
/** The beds right now, always GARDEN_BEDS of them. */
export const gardenBeds = (): (Bed | null)[] => bedsOf(state.garden?.beds, GARDEN_BEDS);
/** Each bed's stage today. */
export const gardenStages = (): Stage[] => { const d = today(); return gardenBeds().map(b => stageOf(b, d)); };
/** How many beds are ready to pick. */
export const readyCount = (): number => gardenStages().filter(s => s === 'ready').length;

function setBed(i: number, bed: Bed | null): void {
  const g = (state.garden ||= { beds: [] });
  g.beds = gardenBeds(); g.beds[i] = bed;
}
/** Plant a seed from the Satchel in an empty bed. The packet is mixed, so the garden decides what it becomes. */
export function plantSeed(i: number, r = Math.random()): boolean {
  if (i < 0 || i >= GARDEN_BEDS || gardenBeds()[i] || haveUseful('seeds') <= 0) return false;
  state.useful!.seeds--;
  setBed(i, { plant: plantFor(PLANTS, r).id, day: today() });
  save(); renderSatchel();
  return true;
}
/** Pick a ready bed into the Satchel. A full satchel leaves it where it is: it'll still be there, ready, later. */
export function pickBed(i: number): 'ok' | 'full' | 'growing' {
  const bed = gardenBeds()[i], plant = plantOf(bed);
  if (!bed || !plant || stageOf(bed, today()) !== 'ready') return 'growing';
  if (!addFind(plant.find, 1)) return 'full';
  setBed(i, null); state.garden!.picked = (state.garden!.picked || 0) + 1;
  save(); renderSatchel();
  return 'ok';
}

// ---------- The pop-up, when you walk up to the plot ----------
/** A plant's name as a Haskell constructor: "a sweet pea" → SweetPea. */
const con = (p: Plant): string => p.name.replace(/^(a|an) /, '').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join('');
/** A bed as a Haskell value, for `map stage beds`: you only see what it is from the bud on. */
function value(bed: Bed | null, s: Stage): string {
  const p = plantOf(bed);
  return s === 'ready' && p ? `Ready ${con(p)}` : s === 'bud' && p ? `Bud ${con(p)}` : s[0].toUpperCase() + s.slice(1);
}
const STAGE_ICON: Record<Stage, string> = { empty: '🟫', seed: '🫘', sprout: '🌱', bud: '🌿', ready: '' };
const when = (n: number): string => n === 1 ? 'ready tomorrow' : `ready in ${n} days`;
const capFirst = (s: string): string => s[0].toUpperCase() + s.slice(1);
/** What a bed says about itself in the pop-up. */
function bedNote(bed: Bed | null, s: Stage): string {
  const p = plantOf(bed), d = today();
  if (!bed || !p) return 'Empty soil';
  if (s === 'ready') return `${capFirst(p.name)}, ready to pick`;
  if (s === 'bud') return `${capFirst(p.name)} in bud, ${when(daysLeft(bed, d))}`;
  return `A ${s}, ${when(daysLeft(bed, d))}`;
}
const fullLine = (): string => `<code class="in-layers">length satchel == ${satchelSlots()}  -- full</code>`;

/** Open the plot: the beds, with Plant and Pick buttons, and what happened below them. */
export function openGarden(): void {
  const el = openPop(`<h4 class="board-h">🌱 Your garden plot</h4>
    <p class="board-small">A little fenced patch by Wren's cottage. A seed grows a stage every day, and once it's ready it waits for you: nothing here ever wilts.</p>
    <code class="in-layers" data-beds></code>
    <div class="in-shelfrow" data-row="beds"></div>
    <div class="in-row" data-all></div>
    <p class="board-small">🌱 Seed packets: <b data-seeds></b> · In your satchel: <b data-slots></b></p>
    <div class="in-receipt" aria-live="polite"></div>`);
  const out = (html: string): void => { el.querySelector('.in-receipt')!.innerHTML = html; };
  const fill = (focus = ''): void => {
    const beds = gardenBeds(), stages = gardenStages(), seeds = haveUseful('seeds');
    el.querySelector('[data-beds]')!.textContent = `map stage beds  -- [${beds.map((b, i) => value(b, stages[i])).join(', ')}]`;
    el.querySelector('[data-seeds]')!.textContent = String(seeds);
    el.querySelector('[data-slots]')!.textContent = `${satchelUsed()} of ${satchelSlots()}`;
    el.querySelector('[data-row="beds"]')!.innerHTML = beds.map((b, i) => {
      const s = stages[i], p = plantOf(b);
      const btn = s === 'ready' ? `<button class="btn-soft in-buy" data-pick="${i}" aria-label="Pick ${esc(p!.name)} from bed ${i + 1}">Pick</button>`
        : s === 'empty' ? (seeds ? `<button class="btn-soft in-buy" data-plant="${i}" aria-label="Plant a seed in bed ${i + 1}">Plant a seed</button>` : `<small class="in-have">No seeds left</small>`)
        : '';
      return `<div class="in-item garden-bed ${s}"><span aria-hidden="true">${s === 'ready' ? p!.icon : STAGE_ICON[s]}</span><b>Bed ${i + 1}</b><small>${esc(bedNote(b, s))}</small>${btn}</div>`;
    }).join('');
    const ready = stages.filter(s => s === 'ready').length;
    el.querySelector('[data-all]')!.innerHTML = ready > 1 ? `<button class="btn-soft" data-pickall>Pick everything that's ready (${ready})</button>` : '';
    el.querySelectorAll<HTMLElement>('[data-plant]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.plant);
      if (plantSeed(i)) out(`<p class="in-line">🫘 You press a seed into bed ${i + 1} and pat the soil down. <span class="toast-aside">Something will be poking up by tomorrow.</span></p>`);
      fill(`[data-plant], [data-pick]`);
    });
    el.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.pick), p = plantOf(gardenBeds()[i])!, f = FINDS.find(x => x.id === p.find)!;
      const r = pickBed(i);
      out(r === 'ok' ? `<p class="in-line">${p.icon} ${esc(capFirst(p.name))}, picked. <span class="toast-aside">It's in your satchel as a ${esc(f.name)}: Bram buys those at his till.</span></p>`
        : `<p class="in-line">Your satchel is full, so ${esc(p.name)} stays in its bed for now. <span class="toast-aside">It won't wilt.</span></p>${fullLine()}`);
      fill(`[data-pick], [data-plant]`);
    });
    el.querySelector<HTMLElement>('[data-pickall]')?.addEventListener('click', () => {
      const got: Plant[] = [];
      gardenBeds().forEach((b, i) => { const p = plantOf(b); if (p && pickBed(i) === 'ok') got.push(p); });
      const left = readyCount();
      out(`<p class="in-line">${got.map(p => p.icon).join(' ')} ${got.length ? `${got.length} picked, and in your satchel.` : ''}${left ? ` ${got.length ? 'The rest stay' : 'Your satchel is full, so they stay'} in their beds for now; they won't wilt.` : ''}</p>`
        + (got.length ? `<code class="in-layers">map pick (filter ready beds)  -- [${got.map(con).join(', ')}]</code>` : '') + (left ? fullLine() : ''));
      fill(`[data-pick], [data-plant]`);
    });
    if (focus) (el.querySelector<HTMLElement>(focus) ?? el.closest('.room-pop')?.querySelector<HTMLElement>('.x'))?.focus();
  };
  fill();
}

/** Is there anything to do at the plot: a bed to plant (with seeds in hand) or one to pick? For the line under the map. */
export const gardenWaiting = (): { plant: number; pick: number } => {
  const st = gardenStages();
  return { plant: haveUseful('seeds') > 0 ? st.filter(s => s === 'empty').length : 0, pick: st.filter(s => s === 'ready').length };
};
