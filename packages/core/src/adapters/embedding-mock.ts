// packages/core/src/adapters/embedding-mock.ts
// Deterministic mock for tests. Hashes the input via FNV-1a + cycles the
// 64-bit state across the vector to fill `dim` dimensions, then L2-normalizes.
// Same input + dim → same vector, byte-for-byte. No network IO.

import type { EmbeddingAdapter } from "./embedding";

export interface MockEmbeddingOptions {
  /** Output dimension. Default 768 (matches `nomic-embed-text`). */
  dim?: number;
  /** Model identifier returned by `modelId()`. Default `"mock"`. */
  modelId?: string;
}

const FNV_OFFSET_64_HI = 0xcbf2_9ce4;
const FNV_OFFSET_64_LO = 0x8422_2325;
const FNV_PRIME_64_HI = 0x0000_0100;
const FNV_PRIME_64_LO = 0x0000_01b3;

/** 64-bit FNV-1a as two 32-bit halves (avoids BigInt for hot-loop perf). */
function fnv1a64(text: string): { hi: number; lo: number } {
  let hi = FNV_OFFSET_64_HI;
  let lo = FNV_OFFSET_64_LO;
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    // XOR
    lo ^= b;
    // Multiply by FNV prime: (hi:lo) *= (PRIME_HI:PRIME_LO)
    const lo16a = lo & 0xffff;
    const lo16b = (lo >>> 16) & 0xffff;
    const hi16a = hi & 0xffff;
    const hi16b = (hi >>> 16) & 0xffff;
    const p0 = lo16a * FNV_PRIME_64_LO;
    const p1 = lo16b * FNV_PRIME_64_LO + lo16a * FNV_PRIME_64_HI;
    const p2 = hi16a * FNV_PRIME_64_LO + lo16b * FNV_PRIME_64_HI + Math.floor(p1 / 0x10000);
    const p3 = hi16b * FNV_PRIME_64_LO + hi16a * FNV_PRIME_64_HI + Math.floor(p2 / 0x10000);
    lo = ((p1 & 0xffff) << 16) | (p0 & 0xffff);
    hi = ((p3 & 0xffff) << 16) | (p2 & 0xffff);
    lo >>>= 0;
    hi >>>= 0;
  }
  return { hi, lo };
}

/** mulberry32 keyed by the 32-bit `lo` of the FNV hash, biased by `hi`. */
function makePrng(seedLo: number, seedHi: number): () => number {
  let s = (seedLo ^ seedHi) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockEmbedder implements EmbeddingAdapter {
  private readonly dim: number;
  private readonly model: string;

  constructor(opts?: MockEmbeddingOptions) {
    this.dim = opts?.dim ?? 768;
    this.model = opts?.modelId ?? "mock";
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.deterministicVector(t));
  }

  dimension(): number {
    return this.dim;
  }

  modelId(): string {
    return this.model;
  }

  private deterministicVector(text: string): Float32Array {
    const { hi, lo } = fnv1a64(text);
    const prng = makePrng(lo, hi);
    const v = new Float32Array(this.dim);
    let normSq = 0;
    for (let i = 0; i < this.dim; i++) {
      // Map uniform [0, 1) → standard-normal-ish via Box-Muller-lite (uses
      // pairs; we collapse to a single-output mapping that's enough for
      // determinism + uniqueness-of-vector across distinct inputs).
      const u = prng();
      const x = u * 2 - 1; // [-1, 1)
      v[i] = x;
      normSq += x * x;
    }
    if (normSq > 0) {
      const inv = 1 / Math.sqrt(normSq);
      for (let i = 0; i < this.dim; i++) {
        v[i] = (v[i] ?? 0) * inv;
      }
    }
    return v;
  }
}
