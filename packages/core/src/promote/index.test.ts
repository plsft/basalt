import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  ImplicitThesisFinding,
} from "../verbs/types";
import { promoteFindingToNote, sanitize } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));

function buried(): BuriedInsightFinding {
  return {
    verb: "buried-insight",
    schema: 1,
    rel_path: "07-Insights/Insight-001.md",
    title: "Insight 001",
    stem: "Insight-001",
    created: "2024-01-01",
    updated: "2024-06-01",
    word_count: 240,
    score: 1.234,
    hub_density: 0.1,
    hub_penalty: 1,
    inbound_recent_count: 2,
    quote: "the moat isn't speed alone — it's willingness to keep coming back.",
    quote_provenance: "callout body",
    vault_age_days: 365,
    thresholds: { min_age_days: 180, min_dormant_days: 60, recent_window_days: 180 },
    validators: [
      {
        rel_path: "01-Daily/2026-04-01.md",
        title: "2026-04-01",
        updated: "2026-04-01",
        explicit_link: true,
        similarity: 1,
      },
    ],
  };
}

function connection(): ConnectionFinding {
  return {
    verb: "connection",
    schema: 1,
    similarity: 0.8,
    score: 0.78,
    note_a: {
      rel_path: "a/A.md",
      title: "A",
      quote: "qa",
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
    note_b: {
      rel_path: "b/B.md",
      title: "B",
      quote: "qb",
      quote_provenance: "first prose sentence",
      hub_density: 0.1,
    },
  };
}

function contradiction(): ContradictionFinding {
  return {
    verb: "contradiction",
    schema: 1,
    version: "v0-heuristic",
    topical_similarity: 0.75,
    contradiction_score: 1.5,
    score: 1,
    signals: ["asymmetric negation"],
    note_a: {
      rel_path: "a/A.md",
      title: "A",
      quote: "works fine",
      quote_provenance: "first prose sentence",
    },
    note_b: {
      rel_path: "b/B.md",
      title: "B",
      quote: "doesn't work at all",
      quote_provenance: "first prose sentence",
    },
  };
}

function thesis(): ImplicitThesisFinding {
  return {
    verb: "implicit-thesis",
    schema: 1,
    version: "v0-cluster",
    score: 1,
    cluster_size: 3,
    folder_diversity: 2,
    span_days: 60,
    mean_similarity: 0.78,
    centroid: {
      rel_path: "X.md",
      title: "Centroid",
      quote: "qc",
      quote_provenance: "callout body",
    },
    members: [
      {
        rel_path: "X.md",
        title: "Centroid",
        folder: "X",
        quote: "qc",
        quote_provenance: "callout body",
      },
      {
        rel_path: "A.md",
        title: "A",
        folder: "A",
        quote: "qa",
        quote_provenance: "first prose sentence",
      },
      {
        rel_path: "M.md",
        title: "M",
        folder: "M",
        quote: "qm",
        quote_provenance: "first prose sentence",
      },
    ],
  };
}

function drift(): DriftFinding {
  return {
    verb: "drift",
    schema: 1,
    version: "v0",
    window_days: 30,
    daily_note_count: 30,
    project_count: 2,
    total_mentions: 40,
    score: 30,
    headline_overworked: {
      name: "Beacon",
      stated_notes: 4,
      stated_share: 0.2,
      stated_rank: 2,
      lived_mentions: 30,
      lived_share: 0.75,
      lived_rank: 1,
      drift_pct: 55,
    },
    headline_underworked: {
      name: "Atlas",
      stated_notes: 12,
      stated_share: 0.6,
      stated_rank: 1,
      lived_mentions: 5,
      lived_share: 0.125,
      lived_rank: 2,
      drift_pct: -47.5,
    },
    shares: [],
  };
}

describe("sanitize", () => {
  it("strips illegal filename chars", () => {
    expect(sanitize('A<B>C:D"E/F\\G|H?I*J')).toBe("ABCDEFGHIJ");
  });
  it("collapses runs of whitespace", () => {
    expect(sanitize("a   b\tc\nd")).toBe("a b c d");
  });
  it("trims surrounding whitespace", () => {
    expect(sanitize("  hello  ")).toBe("hello");
  });
});

describe("promoteFindingToNote — relPath shape", () => {
  it("defaults to Basalt folder", () => {
    const r = promoteFindingToNote(buried());
    expect(r.relPath).toMatch(/^Basalt\//);
  });

  it("respects custom folder", () => {
    const r = promoteFindingToNote(buried(), { folder: "Briefs" });
    expect(r.relPath).toMatch(/^Briefs\//);
  });

  it("trailing slash on custom folder is stripped", () => {
    const r = promoteFindingToNote(buried(), { folder: "Briefs/" });
    expect(r.relPath).toMatch(/^Briefs\//);
    expect(r.relPath).not.toMatch(/^Briefs\/\//);
  });

  it("buried → Resurfaced - <title>.md", () => {
    expect(promoteFindingToNote(buried()).relPath).toBe("Basalt/Resurfaced - Insight 001.md");
  });

  it("connection → Bridge - <a> and <b>.md", () => {
    expect(promoteFindingToNote(connection()).relPath).toBe("Basalt/Bridge - A and B.md");
  });

  it("contradiction → Tension - <a> and <b>.md", () => {
    expect(promoteFindingToNote(contradiction()).relPath).toBe("Basalt/Tension - A and B.md");
  });

  it("thesis → Thesis - <centroid>.md", () => {
    expect(promoteFindingToNote(thesis()).relPath).toBe("Basalt/Thesis - Centroid.md");
  });

  it("drift → Drift - <windowDays>d.md", () => {
    expect(promoteFindingToNote(drift()).relPath).toBe("Basalt/Drift - 30d.md");
  });
});

describe("promoteFindingToNote — body shape", () => {
  it("buried body includes quote, source link, validator listing", () => {
    const body = promoteFindingToNote(buried()).body;
    expect(body).toContain("type: resurfaced");
    expect(body).toContain("# Resurfaced: Insight 001");
    expect(body).toContain("the moat isn't speed alone");
    expect(body).toContain("[[Insight 001]]");
    expect(body).toContain("[[2026-04-01]]");
  });

  it("connection body includes both wikilinks + similarity", () => {
    const body = promoteFindingToNote(connection()).body;
    expect(body).toContain("# Bridge: A ⇄ B");
    expect(body).toContain("[[A]]");
    expect(body).toContain("[[B]]");
    expect(body).toContain("0.800");
  });

  it("contradiction body lists signals + 'candidate not verdict' disclosure", () => {
    const body = promoteFindingToNote(contradiction()).body;
    expect(body).toContain("# Tension: A ↮ B");
    expect(body).toContain("asymmetric negation");
    expect(body).toContain("v0 candidate, not a verdict");
  });

  it("thesis body lists every cluster member with wikilink + folder", () => {
    const body = promoteFindingToNote(thesis()).body;
    expect(body).toContain("# Thesis: Centroid");
    expect(body).toContain("[[Centroid]]");
    expect(body).toContain("[[A]]");
    expect(body).toContain("[[M]]");
  });

  it("drift body has signed pp deltas + full breakdown table", () => {
    const body = promoteFindingToNote(drift()).body;
    expect(body).toContain("# Drift over the last 30 days");
    expect(body).toContain("**Beacon**");
    expect(body).toContain("**Atlas**");
    expect(body).toContain("+55.0");
    expect(body).toContain("-47.5");
    expect(body).toContain("Stated rank");
  });

  it("custom template overrides default", () => {
    const r = promoteFindingToNote(buried(), { template: () => "custom body" });
    expect(r.body).toBe("custom body");
  });
});

describe("architectural invariant: promote/ does not import any fs write API", () => {
  // Walk every .ts file under promote/ (excluding tests) and grep for any
  // import that could mutate the filesystem. The architectural test for
  // PRD §2.1 / CLAUDE.md §5 — promote-to-note must be PURE; the surface
  // (plugin / CLI / desktop) is the only layer that calls createNoteFile.
  const FORBIDDEN = [
    /from\s+["']node:fs/,
    /from\s+["']node:fs\/promises/,
    /from\s+["']fs["']/,
    /from\s+["']fs\/promises/,
    /\bwriteFileSync\b/,
    /\bwriteFile\b/,
    /\bopenSync\b.*"w/,
    /\bappendFile/,
    /\bunlink/,
    /\brename/,
    /\brmdir/,
    /\bmkdir/,
  ];

  it("scans promote/**/*.ts for forbidden write patterns", () => {
    const root = HERE; // packages/core/src/promote
    const offenders: Array<{ file: string; pattern: string; line: number }> = [];

    function walk(dir: string) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && p.endsWith(".ts") && !p.endsWith(".test.ts")) {
          const lines = readFileSync(p, "utf-8").split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? "";
            for (const pat of FORBIDDEN) {
              if (pat.test(line)) {
                offenders.push({ file: p, pattern: pat.source, line: i + 1 });
              }
            }
          }
        }
      }
    }
    walk(root);
    if (offenders.length > 0) {
      console.error("Forbidden write APIs in promote/:", offenders);
    }
    expect(offenders).toEqual([]);
  });
});
