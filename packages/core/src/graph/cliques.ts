// packages/core/src/graph/cliques.ts
// Tight-neighborhood (near-clique) detection on a similarity matrix.
// SPEC.md §5.2 step 4 / implicit_thesis.py:115-156.
//
// A "tight neighborhood" is a set { centroid, m1, m2, ... } where every
// pair has cosine ≥ threshold — not just transitively connected. This is
// the right primitive for "themes the user keeps repeating": connected
// components over real-vault similarity graphs collapse into one giant
// component at any practical similarity threshold; near-cliques don't.

export interface TightNeighborhood {
  /** Index of the seed (centroid candidate) within the input matrix. */
  centroidIdx: number;
  /** All cluster member indices, including the centroid. Sorted as discovered. */
  memberIdxs: number[];
}

/** Find tight neighborhoods on a pairwise similarity matrix.
 *
 *  - `sims` is a row-major n×n Float32Array; the diagonal is expected to be
 *    masked at -1 (so a candidate doesn't pull itself in).
 *  - Greedy: for each candidate centroid `c`, sort neighbours by descending
 *    similarity to `c`; add neighbours one at a time if they exceed
 *    threshold to *every* existing member.
 *  - Caller dedupes by member set — multiple seeds may produce the same
 *    cluster; we drop signature duplicates here. */
export function tightNeighborhoods(
  sims: Float32Array,
  n: number,
  threshold: number,
  minSize: number,
  maxSize: number,
): TightNeighborhood[] {
  if (sims.length !== n * n) {
    throw new Error(`tightNeighborhoods: sims length ${sims.length} ≠ n² (${n * n})`);
  }
  const out: TightNeighborhood[] = [];
  const seenSignatures = new Set<string>();

  for (let c = 0; c < n; c++) {
    // Neighbours of c above threshold, sorted by similarity to c (desc).
    const neighbours: Array<{ idx: number; sim: number }> = [];
    for (let j = 0; j < n; j++) {
      if (j === c) continue;
      const s = sims[c * n + j] ?? -1;
      if (s >= threshold) neighbours.push({ idx: j, sim: s });
    }
    neighbours.sort((a, b) => b.sim - a.sim);

    const cluster: number[] = [c];
    for (const nb of neighbours) {
      if (cluster.length >= maxSize) break;
      // Add nb only if it's above threshold to every existing cluster member.
      let qualifies = true;
      for (const m of cluster) {
        const s = sims[nb.idx * n + m] ?? -1;
        if (s < threshold) {
          qualifies = false;
          break;
        }
      }
      if (qualifies) cluster.push(nb.idx);
    }
    if (cluster.length < minSize) continue;
    const sig = cluster
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    out.push({ centroidIdx: c, memberIdxs: cluster });
  }
  return out;
}
