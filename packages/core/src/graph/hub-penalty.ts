// packages/core/src/graph/hub-penalty.ts
// Hub-density and hub-penalty primitives. SPEC.md §2.3.
// Real implementation lands in TASK-1.3.

/** Outgoing-links-per-100-words above which a note is hard-excluded as a MOC. */
export const HUB_DENSITY_HARD = 1.5;

/** Below this density, no penalty. Above, inverse-square taper. */
export const HUB_DENSITY_SOFT = 0.5;

/** Compute outgoing-links-per-100-words. SPEC.md §2.3. Stub for TASK-1.3. */
export function hubDensity(_outLinkCount: number, _wordCount: number): number {
  throw new Error("hubDensity: not yet implemented (lands in TASK-1.3)");
}

/** Compute the hub-penalty multiplier from a density. SPEC.md §2.3. */
export function hubPenalty(_density: number): number {
  throw new Error("hubPenalty: not yet implemented (lands in TASK-1.3)");
}
