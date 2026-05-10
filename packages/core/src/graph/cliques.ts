// packages/core/src/graph/cliques.ts
// Tight-neighborhood (near-clique) detection on a similarity matrix.
// Real implementation lands in TASK-1.10 (Implicit Thesis verb).
// SPEC.md §5.2 step 4.

/** Find tight neighborhoods on a pairwise similarity matrix.
 *  Stub for TASK-1.10. */
export function tightNeighborhoods(
  _sims: Float32Array,
  _n: number,
  _threshold: number,
  _minSize: number,
  _maxSize: number,
): Array<{ centroidIdx: number; memberIdxs: number[] }> {
  throw new Error("tightNeighborhoods: not yet implemented (lands in TASK-1.10)");
}
