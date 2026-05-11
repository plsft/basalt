import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "../adapters/storage-memory";
import type { Verb } from "../types";
import type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Finding,
  ImplicitThesisFinding,
} from "../verbs/types";
import {
  auditPending,
  DEFAULT_BURIED_GRACE_DAYS,
  DEFAULT_CONN_GRACE_DAYS,
  DEFAULT_CONTRA_GRACE_DAYS,
  falsificationRulesFor,
  findingKey,
  recordFinding,
  trackRecord,
} from "./calibration";

function buried(rel: string): BuriedInsightFinding {
  return {
    verb: "buried-insight",
    schema: 1,
    rel_path: rel,
    title: rel,
    stem: rel,
    created: "2024-01-01",
    updated: "2024-06-01",
    word_count: 200,
    score: 1.0,
    hub_density: 0.1,
    hub_penalty: 1.0,
    inbound_recent_count: 3,
    quote: "q",
    quote_provenance: "first prose sentence",
    vault_age_days: 365,
    thresholds: { min_age_days: 180, min_dormant_days: 60, recent_window_days: 180 },
    validators: [],
  };
}

function connection(a: string, b: string): ConnectionFinding {
  return {
    verb: "connection",
    schema: 1,
    similarity: 0.8,
    score: 0.78,
    note_a: {
      rel_path: a,
      title: a,
      quote: "qa",
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
    note_b: {
      rel_path: b,
      title: b,
      quote: "qb",
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
  };
}

function contradiction(a: string, b: string): ContradictionFinding {
  return {
    verb: "contradiction",
    schema: 1,
    version: "v0-heuristic",
    topical_similarity: 0.75,
    contradiction_score: 1.5,
    score: 1.0,
    signals: ["asymmetric negation"],
    note_a: { rel_path: a, title: a, quote: "qa", quote_provenance: "first prose sentence" },
    note_b: { rel_path: b, title: b, quote: "qb", quote_provenance: "first prose sentence" },
  };
}

function thesis(centroid: string, members: string[]): ImplicitThesisFinding {
  return {
    verb: "implicit-thesis",
    schema: 1,
    version: "v0-cluster",
    score: 1.0,
    cluster_size: members.length,
    folder_diversity: 2,
    span_days: 60,
    mean_similarity: 0.78,
    centroid: {
      rel_path: centroid,
      title: centroid,
      quote: "qc",
      quote_provenance: "callout body",
    },
    members: members.map((m) => ({
      rel_path: m,
      title: m,
      folder: m.split("/")[0] ?? "",
      quote: "qm",
      quote_provenance: "first prose sentence",
    })),
  };
}

function drift(over: string | null, under: string | null): DriftFinding {
  return {
    verb: "drift",
    schema: 1,
    version: "v0",
    window_days: 30,
    daily_note_count: 10,
    project_count: 2,
    total_mentions: 20,
    score: 12,
    headline_overworked: over
      ? {
          name: over,
          stated_notes: 4,
          stated_share: 0.4,
          stated_rank: 2,
          lived_mentions: 12,
          lived_share: 0.6,
          lived_rank: 1,
          drift_pct: 20,
        }
      : null,
    headline_underworked: under
      ? {
          name: under,
          stated_notes: 6,
          stated_share: 0.6,
          stated_rank: 1,
          lived_mentions: 8,
          lived_share: 0.4,
          lived_rank: 2,
          drift_pct: -20,
        }
      : null,
    shares: [
      {
        name: over ?? "X",
        stated_notes: 4,
        stated_share: 0.4,
        stated_rank: 2,
        lived_mentions: 12,
        lived_share: 0.6,
        lived_rank: 1,
        drift_pct: 20,
      },
      {
        name: under ?? "Y",
        stated_notes: 6,
        stated_share: 0.6,
        stated_rank: 1,
        lived_mentions: 8,
        lived_share: 0.4,
        lived_rank: 2,
        drift_pct: -20,
      },
    ],
  };
}

describe("falsificationRulesFor", () => {
  it("buried-insight: 3 rules with grace 60d for no_new_validators + 30% drop_pct", () => {
    const rules = falsificationRulesFor("buried-insight", buried("notes/x.md"));
    expect(rules.map((r) => r.kind)).toEqual([
      "no_new_validators",
      "candidate_shrinks",
      "candidate_deleted",
    ]);
    expect(rules[0]?.params.grace_days).toBe(DEFAULT_BURIED_GRACE_DAYS);
    expect(rules[1]?.params.drop_pct).toBe(30);
  });

  it("connection: still_unlinked grace 60d + either_shrinks 50%", () => {
    const rules = falsificationRulesFor("connection", connection("A.md", "B.md"));
    expect(rules.map((r) => r.kind)).toEqual(["still_unlinked", "either_shrinks"]);
    expect(rules[0]?.params.grace_days).toBe(DEFAULT_CONN_GRACE_DAYS);
    expect(rules[1]?.params.drop_pct).toBe(50);
  });

  it("contradiction: neither_edited 60d + still_in_conflict 90d", () => {
    const rules = falsificationRulesFor("contradiction", contradiction("A.md", "B.md"));
    expect(rules.map((r) => r.kind)).toEqual(["neither_edited", "still_in_conflict"]);
    expect(rules[0]?.params.grace_days).toBe(DEFAULT_CONTRA_GRACE_DAYS);
    expect(rules[1]?.params.grace_days).toBe(90);
  });

  it("implicit-thesis: 3 rules with min_remaining = max(2, size-2)", () => {
    const rules = falsificationRulesFor(
      "implicit-thesis",
      thesis("X.md", ["X.md", "A.md", "M.md"]),
    );
    expect(rules.map((r) => r.kind)).toEqual([
      "centroid_deleted",
      "cluster_dispersed",
      "no_new_rephrasing",
    ]);
    expect(rules[1]?.params.min_remaining).toBe(2);
  });

  it("drift: emits drift_resolved per headline + always emits structural_change", () => {
    const both = falsificationRulesFor("drift", drift("Atlas", "Beacon"));
    expect(both.map((r) => r.kind).filter((k) => k === "drift_resolved").length).toBe(2);
    expect(both.find((r) => r.kind === "structural_change")).toBeDefined();
  });

  it("drift: when only over or only under is set, emits one drift_resolved", () => {
    const overOnly = falsificationRulesFor("drift", drift("Atlas", null));
    expect(overOnly.filter((r) => r.kind === "drift_resolved")).toHaveLength(1);
  });
});

describe("findingKey", () => {
  it("buried-insight: prefix + rel_path", () => {
    expect(findingKey("buried-insight", buried("notes/A.md"))).toBe("buried-insight:notes/A.md");
  });
  it("connection / contradiction sort the pair so order doesn't matter", () => {
    expect(findingKey("connection", connection("B.md", "A.md"))).toBe("connection:A.md|B.md");
    expect(findingKey("contradiction", contradiction("Z.md", "A.md"))).toBe(
      "contradiction:A.md|Z.md",
    );
  });
  it("implicit-thesis: members sorted", () => {
    expect(findingKey("implicit-thesis", thesis("X.md", ["X.md", "A.md", "M.md"]))).toBe(
      "implicit-thesis:A.md|M.md|X.md",
    );
  });
  it("drift: under->over@windowDays format", () => {
    expect(findingKey("drift", drift("Atlas", "Beacon"))).toBe("drift:Beacon->Atlas@30d");
    expect(findingKey("drift", drift("Atlas", null))).toBe("drift:-->Atlas@30d");
    expect(findingKey("drift", drift(null, "Beacon"))).toBe("drift:Beacon->-@30d");
  });
});

describe("recordFinding", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("inserts a pending row with serialized payload + rules", async () => {
    const id = await recordFinding(storage, "buried-insight", buried("a.md"), "2026-05-09");
    expect(id).toBe(1);
    const list = await storage.listFindings();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("pending");
    expect(list[0]?.created_at).toBe("2026-05-09");
    expect(JSON.parse(list[0]?.finding_json ?? "null").rel_path).toBe("a.md");
    expect(JSON.parse(list[0]?.falsification ?? "[]")).toHaveLength(3);
  });

  it("is idempotent on (verb, finding_key) while pending", async () => {
    const a = await recordFinding(storage, "buried-insight", buried("a.md"), "2026-05-09");
    const b = await recordFinding(storage, "buried-insight", buried("a.md"), "2026-05-09");
    expect(a).toBe(1);
    expect(b).toBeNull();
  });
});

describe("auditPending", () => {
  it("connection still_unlinked: confirmed when an edge appears", async () => {
    const storage = new MemoryStorage();
    await storage.upsertNote({
      path: "/v/A.md",
      relPath: "A.md",
      stem: "A",
      title: "A",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h1",
    });
    await storage.upsertNote({
      path: "/v/B.md",
      relPath: "B.md",
      stem: "B",
      title: "B",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h2",
    });
    await recordFinding(storage, "connection", connection("A.md", "B.md"), "2026-04-09");
    // Add a link from A → B and resolve.
    await storage.replaceLinks(1, ["B"]);
    await storage.resolveLinkTargets();

    const results = await auditPending(storage, "2026-05-09"); // 30 days later
    expect(results).toHaveLength(1);
    expect(results[0]?.newStatus).toBe("confirmed");
    expect(results[0]?.ruleKind).toBe("still_unlinked");
  });

  it("connection still_unlinked: falsified after grace expires with no link", async () => {
    const storage = new MemoryStorage();
    await storage.upsertNote({
      path: "/v/A.md",
      relPath: "A.md",
      stem: "A",
      title: "A",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h1",
    });
    await storage.upsertNote({
      path: "/v/B.md",
      relPath: "B.md",
      stem: "B",
      title: "B",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h2",
    });
    await recordFinding(storage, "connection", connection("A.md", "B.md"), "2026-01-01");
    const results = await auditPending(storage, "2026-05-09"); // > 60 days later
    expect(results[0]?.newStatus).toBe("falsified");
  });

  it("buried candidate_deleted: falsified when target rel_path no longer exists", async () => {
    const storage = new MemoryStorage();
    await recordFinding(storage, "buried-insight", buried("missing.md"), "2026-05-01");
    // Note never inserted — deletion treated as "doesn't exist".
    const results = await auditPending(storage, "2026-05-09");
    expect(results[0]?.newStatus).toBe("falsified");
    expect(results[0]?.ruleKind).toBe("candidate_deleted");
  });

  it("contradiction neither_edited: falsified after 60d if neither note edited", async () => {
    const storage = new MemoryStorage();
    await storage.upsertNote({
      path: "/v/A.md",
      relPath: "A.md",
      stem: "A",
      title: "A",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h1",
    });
    await storage.upsertNote({
      path: "/v/B.md",
      relPath: "B.md",
      stem: "B",
      title: "B",
      created: "2024-01-01",
      updated: "2024-06-01",
      tags: [],
      content: "body",
      wikilinks: [],
      wordCount: 1,
      contentHash: "h2",
    });
    await recordFinding(storage, "contradiction", contradiction("A.md", "B.md"), "2026-01-01");
    const results = await auditPending(storage, "2026-05-09");
    expect(results[0]?.newStatus).toBe("falsified");
    expect(results[0]?.ruleKind).toBe("neither_edited");
  });
});

describe("trackRecord", () => {
  it("counts confirmed/pending/falsified within window", async () => {
    const storage = new MemoryStorage();
    await recordFinding(storage, "buried-insight", buried("a.md"), "2026-04-15");
    await recordFinding(storage, "buried-insight", buried("b.md"), "2026-04-20");
    await recordFinding(storage, "buried-insight", buried("c.md"), "2026-04-25");
    await storage.updateFindingStatus(1, "confirmed", "2026-05-01", "ok");
    await storage.updateFindingStatus(2, "falsified", "2026-05-02", "no");

    const tr = await trackRecord(storage, 90, "2026-05-09");
    expect(tr.windowDays).toBe(90);
    expect(tr.confirmed).toBe(1);
    expect(tr.falsified).toBe(1);
    expect(tr.pending).toBe(1);
    expect(tr.total).toBe(3);
    expect(tr.confirmedPct).toBeCloseTo(33.3, 1);
    expect(tr.falsifiedPct).toBeCloseTo(33.3, 1);
  });

  it("handles empty history (zero division → 0%)", async () => {
    const storage = new MemoryStorage();
    const tr = await trackRecord(storage, 90, "2026-05-09");
    expect(tr.total).toBe(0);
    expect(tr.confirmedPct).toBe(0);
    expect(tr.falsifiedPct).toBe(0);
  });
});

describe("falsificationRulesFor — exhaustive verb dispatch", () => {
  it("never throws for any of the five verbs", () => {
    const verbs: Verb[] = [
      "buried-insight",
      "connection",
      "contradiction",
      "implicit-thesis",
      "drift",
    ];
    for (const v of verbs) {
      const sample: Finding =
        v === "buried-insight"
          ? buried("x.md")
          : v === "connection"
            ? connection("A.md", "B.md")
            : v === "contradiction"
              ? contradiction("A.md", "B.md")
              : v === "implicit-thesis"
                ? thesis("X.md", ["X.md", "A.md", "M.md"])
                : drift("Atlas", "Beacon");
      expect(() => falsificationRulesFor(v, sample)).not.toThrow();
    }
  });
});
