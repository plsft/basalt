// packages/core/src/math/vector.ts
// Hand-rolled vector helpers. PRD §3.4 chose to hand-roll for runtime
// portability across the plugin (Obsidian/Electron), CLI (Node/Bun), Cloud
// (Workers V8 isolates), and Desktop (Tauri WebView).

/** Dot product of two equal-length Float32Arrays. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`dot: length mismatch (${a.length} vs ${b.length})`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
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
