// packages/core/src/graph/hub-penalty.ts
// Hub-density and hub-penalty primitives. SPEC.md §2.3.
// Source of truth: reference/src/basalt/buried.py:43-46, :497-500, :567-573.

/** Outgoing-links-per-100-words above which a note is hard-excluded as a MOC. */
export const HUB_DENSITY_HARD = 1.5;

/** Below this density, no penalty. Above, inverse-square taper. */
export const HUB_DENSITY_SOFT = 0.5;

/** Outgoing-distinct-wikilinks per 100 words. The `max(... , 1)` floor on the
 *  denominator prevents division blow-up on very short notes; densities for
 *  ≤100-word notes equal `outLinkCount` directly.
 *
 *  Mirrors `_hub_density` at `buried.py:497-500`, `connection.py:70-73`,
 *  `contradiction.py:117-120`, `implicit_thesis.py:73-76`. */
export function hubDensity(outLinkCount: number, wordCount: number): number {
  if (wordCount <= 0) return 0;
  return outLinkCount / Math.max(wordCount / 100, 1);
}

/** Multiplicative penalty in `[0, 1]`. No penalty below `HUB_DENSITY_SOFT`;
 *  inverse-square taper above. Reference table from `buried.py:570-573`:
 *    density 0.5 → 1.00
 *    density 0.7 → 0.86
 *    density 1.0 → 0.50
 *    density 1.3 → 0.28
 *
 *  Mirrors `_hub_penalty` across all four prose-verb modules. */
export function hubPenalty(density: number): number {
  const excess = Math.max(0, density - HUB_DENSITY_SOFT);
  return 1 / (1 + (2 * excess) ** 2);
}
