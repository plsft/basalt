import { describe, expect, it } from "vitest";
import { contradictionEvidence, POLARITY_PAIRS } from "./contradiction";

describe("contradictionEvidence — pure unit", () => {
  it("returns 0 / [] when either quote is empty after stripping", () => {
    expect(contradictionEvidence("", "anything goes")).toEqual({ score: 0, signals: [] });
    expect(contradictionEvidence("anything", "")).toEqual({ score: 0, signals: [] });
  });

  it("scores asymmetric negation at +1.0", () => {
    const r = contradictionEvidence("the moat is speed alone", "the moat isn't speed alone");
    expect(r.signals).toContain("asymmetric negation");
    expect(r.score).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire on symmetric negation (both negated or both asserted)", () => {
    const r = contradictionEvidence("isn't great today", "isn't fine either");
    expect(r.signals).not.toContain("asymmetric negation");
  });

  it("scores asymmetric reversal at +1.2", () => {
    const r = contradictionEvidence(
      "the framework actually works in production",
      "the framework is sound in theory and in build",
    );
    expect(r.signals.some((s) => s.includes("reversal"))).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(1.2);
  });

  it("polarity pairs: matches substring semantics on the canonical list", () => {
    for (const [pos, neg] of POLARITY_PAIRS) {
      const r = contradictionEvidence(
        `the strategy ${pos} reliably`,
        `the strategy ${neg} all the time`,
      );
      expect(r.signals.some((s) => s.startsWith("polarity-pair"))).toBe(true);
    }
  });

  it("polarity-pair score caps at 1.6 even with multiple pairs firing", () => {
    const a = "this works and is profitable";
    const b = "this doesn't work and is unprofitable";
    const r = contradictionEvidence(a, b);
    // Two polarity pairs (works/doesn't-work, profitable/unprofitable) → cap = 1.6
    expect(r.score).toBeLessThanOrEqual(1.0 + 1.6 + 1e-9);
  });

  it("substring semantics include matches inside other words (parity with Python)", () => {
    // Python uses `pos in a` substring check — "works" matches inside "frameworks".
    const r = contradictionEvidence("the frameworks are stable", "this doesn't work either");
    expect(r.signals.some((s) => s.includes("polarity-pair"))).toBe(true);
  });

  it("strips markdown before matching", () => {
    const r = contradictionEvidence("**works** here", "[doesn't work](url) there");
    expect(r.signals.some((s) => s.includes("polarity-pair"))).toBe(true);
  });
});
