// packages/core/src/math/cosine.ts
// Cosine similarity. For L2-normalized vectors, this collapses to dot
// product (which is what the embedding pipeline at SPEC.md §2.2 produces).

import { dot, l2Norm } from "./vector";

/** Cosine similarity between two vectors.
 *
 *  Fast path: if both inputs are L2-normalized (always true for vectors
 *  that came out of `EmbeddingAdapter.embed`), pass `assumeNormalized=true`
 *  and we skip the norm computation entirely. */
export function cosine(a: Float32Array, b: Float32Array, assumeNormalized = false): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: length mismatch (${a.length} vs ${b.length})`);
  }
  const numerator = dot(a, b);
  if (assumeNormalized) return numerator;
  const denom = l2Norm(a) * l2Norm(b);
  if (denom === 0) return 0;
  return numerator / denom;
}
