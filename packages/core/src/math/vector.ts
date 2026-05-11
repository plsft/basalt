// packages/core/src/math/vector.ts
// Hand-rolled vector helpers. PRD §3.4 chose to hand-roll for runtime
// portability across the plugin (Obsidian/Electron), CLI (Node/Bun), Cloud
// (Workers V8 isolates), and Desktop (Tauri WebView).

/** Dot product of two equal-length Float32Arrays. JS double-precision
 *  accumulator. Good for general use; use `dotF32` when you need byte-for-byte
 *  parity with NumPy's BLAS sgemm (float32 accumulator). */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`dot: length mismatch (${a.length} vs ${b.length})`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/** Dot product with pairwise (tree-reduction) float32 summation. Used in
 *  verbs whose parity baselines were computed via Python's `matrix @ matrix.T`
 *  over float32 embeddings.
 *
 *  BLAS sgemm (OpenBLAS / MKL on x86_64) accumulates via SIMD-vectorized
 *  pairwise summation, which has O(log n × eps) cumulative error rather than
 *  the O(n × eps) of linear left-to-right summation. The gap is small on
 *  768-dim normalized vectors (~5e-5) but enough to flip individual pairs
 *  near a threshold and amplify into entirely different MAX_PAIRS subsets.
 *
 *  Implementation: float32 per-element product, then tree reduction in float32. */
export function dotF32(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`dotF32: length mismatch (${a.length} vs ${b.length})`);
  }
  const n = a.length;
  if (n === 0) return 0;
  const fround = Math.fround;
  const partials = new Float32Array(n);
  for (let i = 0; i < n; i++) partials[i] = fround((a[i] ?? 0) * (b[i] ?? 0));
  let size = n;
  while (size > 1) {
    const half = size >> 1;
    for (let i = 0; i < half; i++) {
      partials[i] = fround((partials[2 * i] ?? 0) + (partials[2 * i + 1] ?? 0));
    }
    if (size & 1) partials[half] = partials[size - 1] ?? 0;
    size = half + (size & 1);
  }
  return partials[0] ?? 0;
}

/** Euclidean (L2) norm. */
export function l2Norm(v: Float32Array): number {
  let sq = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] ?? 0;
    sq += x * x;
  }
  return Math.sqrt(sq);
}

/** Normalize a vector. Defaults to in-place; pass `inPlace=false` for a copy. */
export function l2Normalize(v: Float32Array, inPlace = true): Float32Array {
  const target = inPlace ? v : new Float32Array(v);
  const n = l2Norm(target);
  if (n === 0) return target;
  const inv = 1 / n;
  for (let i = 0; i < target.length; i++) target[i] = (target[i] ?? 0) * inv;
  return target;
}

/** Element-wise mean of an array of vectors. Throws if input is empty or
 *  vectors have mismatched lengths. */
export function mean(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new Error("mean: empty input");
  const dim = vectors[0]!.length;
  const out = new Float32Array(dim);
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new Error(`mean: length mismatch (${v.length} vs ${dim})`);
    }
    for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) + (v[i] ?? 0);
  }
  const inv = 1 / vectors.length;
  for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) * inv;
  return out;
}
