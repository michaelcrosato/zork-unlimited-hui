import type { Projected } from "./projection.ts";

export interface Knowledge {
  visited: boolean;
  discovered: boolean;
}

/**
 * Paint the fog-of-war texture on the CPU: 0 is uncharted, 255 fully revealed.
 * Visited towns reveal a wide disc, discovered towns a smaller, dimmer one; the
 * result is the maximum over every town so overlapping discs never darken.
 */
export function paintFog(
  size: number,
  extent: number,
  points: readonly Projected[],
  knowledge: ReadonlyMap<string, Knowledge>,
  radii: { visitedRadius: number; discoveredRadius: number },
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size * size);
  const active = points
    .map((p) => ({ p, k: knowledge.get(p.id) }))
    .filter((entry): entry is { p: Projected; k: Knowledge } => entry.k !== undefined && (entry.k.visited || entry.k.discovered));
  const toWorld = (index: number): number => (index / (size - 1)) * extent - extent / 2;
  for (let pz = 0; pz < size; pz++) {
    const z = toWorld(pz);
    for (let px = 0; px < size; px++) {
      const x = toWorld(px);
      let best = 0;
      for (const { p, k } of active) {
        const radius = k.visited ? radii.visitedRadius : radii.discoveredRadius;
        const peak = k.visited ? 255 : 200;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d >= radius) continue;
        const value = peak * (1 - d / radius);
        if (value > best) best = value;
      }
      out[pz * size + px] = Math.round(best);
    }
  }
  // The town's own texel is always fully lit for its class, whatever the grid alignment.
  const toIndex = (value: number): number => Math.min(size - 1, Math.max(0, Math.round(((value + extent / 2) / extent) * (size - 1))));
  for (const { p, k } of active) {
    const i = toIndex(p.z) * size + toIndex(p.x);
    out[i] = Math.max(out[i]!, k.visited ? 255 : 200);
  }
  return out;
}
