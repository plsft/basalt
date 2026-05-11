import { describe, expect, it } from "vitest";
import { cosine } from "./cosine";
import { dot, l2Norm, l2Normalize, mean } from "./vector";

describe("dot", () => {
  it("computes element-wise product sum", () => {
    expect(dot(new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6]))).toBeCloseTo(32, 6);
  });
  it("throws on length mismatch", () => {
    expect(() => dot(new Float32Array([1]), new Float32Array([1, 2]))).toThrow(/length mismatch/);
  });
});

describe("l2Norm", () => {
  it("returns sqrt of sum of squares", () => {
    expect(l2Norm(new Float32Array([3, 4]))).toBeCloseTo(5, 6);
    expect(l2Norm(new Float32Array([0, 0]))).toBe(0);
  });
});

describe("l2Normalize", () => {
  it("scales to unit length", () => {
    const v = new Float32Array([3, 4]);
    l2Normalize(v);
    expect(l2Norm(v)).toBeCloseTo(1, 6);
    expect(v[0]).toBeCloseTo(0.6, 6);
    expect(v[1]).toBeCloseTo(0.8, 6);
  });

  it("inPlace=false returns a copy", () => {
    const v = new Float32Array([3, 4]);
    const copy = l2Normalize(v, false);
    expect(v[0]).toBe(3);
    expect(copy[0]).toBeCloseTo(0.6, 6);
  });

  it("zero vector remains zero", () => {
    const v = new Float32Array([0, 0]);
    l2Normalize(v);
    expect(v[0]).toBe(0);
  });
});

describe("mean", () => {
  it("computes element-wise average", () => {
    const m = mean([new Float32Array([1, 2, 3]), new Float32Array([3, 2, 1])]);
    expect(Array.from(m)).toEqual([2, 2, 2]);
  });
  it("throws on empty input", () => {
    expect(() => mean([])).toThrow(/empty input/);
  });
  it("throws on length mismatch", () => {
    expect(() => mean([new Float32Array([1]), new Float32Array([1, 2])])).toThrow(
      /length mismatch/,
    );
  });
});

describe("cosine", () => {
  it("computes cosine similarity", () => {
    // 45° between (1,0) and (1,1): cos(45°) ≈ 0.7071
    expect(cosine(new Float32Array([1, 0]), new Float32Array([1, 1]))).toBeCloseTo(
      1 / Math.sqrt(2),
      5,
    );
  });

  it("returns 1 for identical vectors", () => {
    expect(cosine(new Float32Array([2, 3]), new Float32Array([2, 3]))).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 6);
  });

  it("assumeNormalized=true skips norm computation", () => {
    const a = l2Normalize(new Float32Array([3, 4]));
    const b = l2Normalize(new Float32Array([4, 3]));
    expect(cosine(a, b, true)).toBeCloseTo(cosine(a, b, false), 6);
  });

  it("returns 0 when one vector is zero (no denom)", () => {
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
  });
});
