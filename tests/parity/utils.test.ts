// tests/parity/utils.test.ts — unit tests for the comparison helpers.

import { describe, expect, it } from "vitest";
import {
  type BuriedInsightFinding,
  type ConnectionFinding,
  type ContradictionFinding,
  compareBrief,
  compareFindings,
  type DriftFinding,
  findingKey,
  type ImplicitThesisFinding,
  loadBaseline,
  nearlyEqual,
  type ProjectShare,
  type TrackRecordSummary,
} from "./utils";

const TR_EMPTY: TrackRecordSummary = {
  schema: 1,
  window_days: 90,
  confirmed: 0,
  pending: 0,
  falsified: 0,
  total: 0,
  confirmed_pct: 0,
  falsified_pct: 0,
};

function buried(rel: string, quote: string, score: number): BuriedInsightFinding {
  return {
    verb: "buried-insight",
    schema: 1,
    rel_path: rel,
    title: rel,
    stem: rel,
    created: "2024-01-01",
    updated: "2024-06-01",
    word_count: 200,
    score,
    hub_density: 0.1,
    hub_penalty: 1.0,
    inbound_recent_count: 3,
    quote,
    quote_provenance: "first prose sentence",
    vault_age_days: 365,
    thresholds: { min_age_days: 180, min_dormant_days: 60, recent_window_days: 180 },
    validators: [],
  };
}

function connection(a: string, b: string, sim: number, score: number): ConnectionFinding {
  return {
    verb: "connection",
    schema: 1,
    similarity: sim,
    score,
    note_a: {
      rel_path: a,
      title: a,
      quote: `q-${a}`,
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
    note_b: {
      rel_path: b,
      title: b,
      quote: `q-${b}`,
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
  };
}

function contradiction(a: string, b: string, sim: number, score: number): ContradictionFinding {
  return {
    verb: "contradiction",
    schema: 1,
    version: "v0-heuristic",
    topical_similarity: sim,
    contradiction_score: 1.5,
    score,
    signals: ["asymmetric negation"],
    note_a: { rel_path: a, title: a, quote: `q-${a}`, quote_provenance: "first prose sentence" },
    note_b: { rel_path: b, title: b, quote: `q-${b}`, quote_provenance: "first prose sentence" },
  };
}

function thesis(centroid: string, members: string[], score: number): ImplicitThesisFinding {
  return {
    verb: "implicit-thesis",
    schema: 1,
    version: "v0-cluster",
    score,
    cluster_size: members.length,
    folder_diversity: 2,
    span_days: 60,
    mean_similarity: 0.78,
    centroid: {
      rel_path: centroid,
      title: centroid,
      quote: `q-${centroid}`,
      quote_provenance: "callout body",
    },
    members: members.map((m) => ({
      rel_path: m,
      title: m,
      folder: m.split("/")[0] ?? "",
      quote: `q-${m}`,
      quote_provenance: "first prose sentence",
    })),
  };
}

function drift(over: string | null, under: string | null, score: number): DriftFinding {
  const share = (
    name: string,
    sn: number,
    ln: number,
    srank: number,
    lrank: number,
  ): ProjectShare => ({
    name,
    stated_notes: sn,
    stated_share: sn / 10,
    stated_rank: srank,
    lived_mentions: ln,
    lived_share: ln / 10,
    lived_rank: lrank,
    drift_pct: (ln - sn) * 10,
  });
  return {
    verb: "drift",
    schema: 1,
    version: "v0",
    window_days: 30,
    daily_note_count: 30,
    project_count: 2,
    total_mentions: 40,
    score,
    headline_overworked: over ? share(over, 4, 8, 2, 1) : null,
    headline_underworked: under ? share(under, 6, 2, 1, 2) : null,
    shares: [],
  };
}

// ── nearlyEqual ───────────────────────────────────────────────────────────

describe("nearlyEqual", () => {
  it("returns true when |a-b| ≤ tolerance", () => {
    expect(nearlyEqual(1.0, 1.000001, 1e-5)).toBe(true);
    expect(nearlyEqual(0.78, 0.780009, 1e-5)).toBe(true);
  });
  it("returns false when |a-b| > tolerance", () => {
    expect(nearlyEqual(1.0, 1.001, 1e-5)).toBe(false);
    expect(nearlyEqual(0.78, 0.79, 1e-5)).toBe(false);
  });
  it("returns false on non-finite inputs", () => {
    expect(nearlyEqual(Number.NaN, 0)).toBe(false);
    expect(nearlyEqual(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
  it("uses default ε = 1e-5", () => {
    expect(nearlyEqual(0.7, 0.700009)).toBe(true);
    expect(nearlyEqual(0.7, 0.700011)).toBe(false);
  });
});

// ── findingKey ────────────────────────────────────────────────────────────

describe("findingKey", () => {
  it("buried insight: prefix + rel_path", () => {
    expect(findingKey(buried("notes/A.md", "q", 1))).toBe("buried-insight:notes/A.md");
  });
  it("connection: sorts pair so order doesn't matter", () => {
    expect(findingKey(connection("B.md", "A.md", 0.8, 1))).toBe("connection:A.md|B.md");
    expect(findingKey(connection("A.md", "B.md", 0.8, 1))).toBe("connection:A.md|B.md");
  });
  it("contradiction: same shape as connection but tagged contradiction", () => {
    expect(findingKey(contradiction("Z.md", "A.md", 0.75, 1))).toBe("contradiction:A.md|Z.md");
  });
  it("implicit-thesis: sorts member paths", () => {
    expect(findingKey(thesis("X.md", ["X.md", "A.md", "M.md"], 1))).toBe(
      "implicit-thesis:A.md|M.md|X.md",
    );
  });
  it("drift: under->over@windowDays format with '-' fallbacks", () => {
    expect(findingKey(drift("Atlas", "Beacon", 1))).toBe("drift:Beacon->Atlas@30d");
    expect(findingKey(drift(null, "Beacon", 1))).toBe("drift:Beacon->-@30d");
    // No headline_underworked → "under" defaults to "-", then literal "->Atlas".
    expect(findingKey(drift("Atlas", null, 1))).toBe("drift:-->Atlas@30d");
  });
});

// ── compareFindings ───────────────────────────────────────────────────────

describe("compareFindings", () => {
  it("passes on identical input", () => {
    const a = buried("a.md", "q", 1.0);
    const b = buried("b.md", "q", 0.9);
    expect(compareFindings([a, b], [a, b]).ok).toBe(true);
  });

  it("fails when set membership differs", () => {
    const a = buried("a.md", "q", 1.0);
    const b = buried("b.md", "q", 0.9);
    const c = buried("c.md", "q", 0.8);
    const r = compareFindings([a, c], [a, b]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("order"))).toBe(true);
  });

  it("fails when ordering differs", () => {
    const a = buried("a.md", "q", 1.0);
    const b = buried("b.md", "q", 0.9);
    const r = compareFindings([b, a], [a, b]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/order\[0\]/);
  });

  it("fails when score Δ exceeds tolerance", () => {
    const a = buried("a.md", "q", 1.0);
    const aDrift = buried("a.md", "q", 1.001);
    const r = compareFindings([aDrift], [a]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/score/);
  });

  it("passes when score Δ is below tolerance", () => {
    const a = buried("a.md", "q", 1.0);
    const aDrift = buried("a.md", "q", 1.000001);
    expect(compareFindings([aDrift], [a]).ok).toBe(true);
  });

  it("fails when quotes differ even when scores match", () => {
    const a = buried("a.md", "Quote A.", 1.0);
    const b = buried("a.md", "Quote B.", 1.0);
    const r = compareFindings([a], [b]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("quote"))).toBe(true);
  });

  it("respects custom tolerance", () => {
    const a = buried("a.md", "q", 1.0);
    const aDrift = buried("a.md", "q", 1.0001);
    expect(compareFindings([aDrift], [a]).ok).toBe(false);
    expect(compareFindings([aDrift], [a], 1e-3).ok).toBe(true);
  });

  it("compares connection note paths", () => {
    const ok = connection("A.md", "B.md", 0.8, 1.0);
    const flipped = connection("A.md", "C.md", 0.8, 1.0); // wrong B
    const r = compareFindings([flipped], [ok]);
    expect(r.ok).toBe(false);
  });

  it("compares thesis member sets order-independently", () => {
    const t1 = thesis("X.md", ["X.md", "A.md", "M.md"], 1.0);
    const t2 = thesis("X.md", ["A.md", "M.md", "X.md"], 1.0); // same set, different order
    expect(compareFindings([t1], [t2]).ok).toBe(true);
  });
});

// ── compareBrief ──────────────────────────────────────────────────────────

describe("compareBrief", () => {
  it("passes on equivalent briefs", () => {
    const brief = {
      schema: 1 as const,
      section: "all" as const,
      track_record: TR_EMPTY,
      findings: {
        buried_insight: [buried("a.md", "q", 1.0)],
        connection: [connection("a.md", "b.md", 0.8, 0.7)],
      },
    };
    expect(compareBrief(brief, brief).ok).toBe(true);
  });

  it("fails on schema mismatch", () => {
    const a = {
      schema: 1 as const,
      section: "all" as const,
      track_record: TR_EMPTY,
      findings: {},
    };
    const b = { ...a, schema: 2 as unknown as 1 };
    const r = compareBrief(a, b);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/schema/);
  });

  it("fails on section mismatch", () => {
    const a = {
      schema: 1 as const,
      section: "all" as const,
      track_record: TR_EMPTY,
      findings: {},
    };
    const b = { ...a, section: "buried-insight" as const };
    const r = compareBrief(a, b);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/section/);
  });

  it("ignores buckets that are empty on both sides", () => {
    const a = { schema: 1 as const, section: "all" as const, track_record: TR_EMPTY, findings: {} };
    const b = {
      schema: 1 as const,
      section: "all" as const,
      track_record: TR_EMPTY,
      findings: { buried_insight: [], connection: [] },
    };
    expect(compareBrief(a, b).ok).toBe(true);
  });
});

// ── loadBaseline ──────────────────────────────────────────────────────────

describe("loadBaseline", () => {
  it("loads sample-14-brief.json and validates Brief shape", () => {
    const brief = loadBaseline("sample-14-brief");
    expect(brief.schema).toBe(1);
    expect(brief.section).toBe("all");
    expect(brief.track_record).toBeDefined();
    expect(brief.findings).toBeDefined();
  });

  it("loads each per-verb baseline for sample-14", () => {
    for (const verb of ["buried", "connection", "contradiction", "thesis", "drift"]) {
      const brief = loadBaseline(`sample-14-${verb}`);
      expect(brief.schema).toBe(1);
    }
  });

  it("loads each per-verb baseline for large-200", () => {
    for (const verb of ["brief", "buried", "connection", "contradiction", "thesis", "drift"]) {
      const brief = loadBaseline(`large-200-${verb}`);
      expect(brief.schema).toBe(1);
    }
  });

  it("throws on missing baseline", () => {
    expect(() => loadBaseline("does-not-exist")).toThrow(/not found/);
  });
});
