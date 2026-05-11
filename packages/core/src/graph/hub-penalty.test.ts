import { describe, expect, it } from "vitest";
import { HUB_DENSITY_HARD, HUB_DENSITY_SOFT, hubDensity, hubPenalty } from "./hub-penalty";

describe("hubDensity", () => {
  it("returns 0 for non-positive wordCount", () => {
    expect(hubDensity(5, 0)).toBe(0);
    expect(hubDensity(5, -1)).toBe(0);
  });

  it("returns outLinkCount directly for ≤100 word notes (max(.,1) floor)", () => {
    expect(hubDensity(3, 50)).toBe(3);
    expect(hubDensity(7, 100)).toBe(7);
  });

  it("returns links per 100 words for >100 word notes", () => {
    expect(hubDensity(5, 500)).toBeCloseTo(1.0, 10);
    expect(hubDensity(10, 1000)).toBeCloseTo(1.0, 10);
    expect(hubDensity(0, 200)).toBe(0);
  });
});

describe("hubPenalty", () => {
  it("is 1.0 below HUB_DENSITY_SOFT", () => {
    expect(hubPenalty(0)).toBe(1);
    expect(hubPenalty(0.3)).toBe(1);
    expect(hubPenalty(HUB_DENSITY_SOFT)).toBe(1);
  });

  it("matches the buried.py:570-573 reference table within 1e-2", () => {
    expect(hubPenalty(0.5)).toBeCloseTo(1.0, 4);
    expect(hubPenalty(0.7)).toBeCloseTo(0.86, 2);
    expect(hubPenalty(1.0)).toBeCloseTo(0.5, 4);
    expect(hubPenalty(1.3)).toBeCloseTo(0.28, 2);
  });

  it("monotonically decreases as density grows above SOFT", () => {
    expect(hubPenalty(0.6)).toBeGreaterThan(hubPenalty(0.7));
    expect(hubPenalty(1.0)).toBeGreaterThan(hubPenalty(1.5));
    expect(hubPenalty(1.5)).toBeGreaterThan(hubPenalty(2.0));
  });

  it("HUB_DENSITY_HARD is 1.5 (PRD §6.4 / SPEC.md §2.3)", () => {
    expect(HUB_DENSITY_HARD).toBe(1.5);
  });
});
