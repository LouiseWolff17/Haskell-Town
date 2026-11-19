// Where a decoration may go (docs/gift-items-design.md, section 8a): pure rules, so they can be tested without a map.
// Positions are the top-left of a footprint in map pixels, always on the GRID. town.ts supplies the zones that aren't
// open ground (roads, water, buildings, trees, other decorations), each with a reason to show the player.

/** The grid decorations snap to, in map pixels. */
export const GRID = 8;
export interface Box { x: number; y: number; w: number; h: number }
/** Ground a decoration can't go on, and why (shown under the map). */
export interface Zone extends Box { why: string }

/** The nearest grid line. */
export const snap = (v: number): number => Math.round(v / GRID) * GRID || 0;
/** The footprint (w×h map pixels) centred, as near as the grid allows, on a point: where the mouse puts it. */
export const cellFor = (px: number, py: number, w: number, h: number): [x: number, y: number] => [snap(px - w / 2), snap(py - h / 2)];
/** Do two boxes share any pixels? Boxes that only touch along an edge don't. */
export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Why a footprint can't go here, or null if it can: it has to be on the grid, inside `bounds`, and clear of every zone. */
export function whyNot(fp: Box, zones: readonly Zone[], bounds: Box, outside = 'That is off the edge of town.'): string | null {
  if (fp.x % GRID || fp.y % GRID) return 'It has to sit on the grid.';
  if (fp.x < bounds.x || fp.y < bounds.y || fp.x + fp.w > bounds.x + bounds.w || fp.y + fp.h > bounds.y + bounds.h) return outside;
  return zones.find(z => overlaps(fp, z))?.why ?? null;
}
/** The free grid spot nearest a point (searching outwards up to `reach` pixels), for placing with the keyboard. */
export function nearestFree(px: number, py: number, w: number, h: number, zones: readonly Zone[], bounds: Box, reach = 160): [x: number, y: number] | null {
  const [cx, cy] = cellFor(px, py, w, h);
  let best: [number, number] | null = null, bestD = Infinity;
  for (let dy = -reach; dy <= reach; dy += GRID) for (let dx = -reach; dx <= reach; dx += GRID) {
    const d = Math.hypot(dx, dy);
    if (d >= bestD || d > reach) continue;
    if (!whyNot({ x: cx + dx, y: cy + dy, w, h }, zones, bounds)) { best = [cx + dx, cy + dy]; bestD = d; }
  }
  return best;
}
