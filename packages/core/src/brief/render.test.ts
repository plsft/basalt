import { describe, expect, it } from "vitest";
import type { Brief, TrackRecordSummary } from "../types";
import type { BuriedInsightFinding, ConnectionFinding, DriftFinding } from "../verbs/types";
import { renderBrief } from "./render";

const TR: TrackRecordSummary = {
  schema: 1,
  window_days: 90,
  confirmed: 0,
  pending: 0,
  falsified: 0,
  total: 0,
  confirmed_pct: 0,
  falsified_pct: 0,
};

const TR_WITH: TrackRecordSummary = {
  schema: 1,
  window_days: 90,
  confirmed: 5,
  pending: 2,
  falsified: 3,
  total: 10,
  confirmed_pct: 50,
  falsified_pct: 30,
};

const buried: BuriedInsightFinding = {
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
  quote: "the moat isn't speed alone — it's the user's willingness to keep coming back.",
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

const connection: ConnectionFinding = {
  verb: "connection",
  schema: 1,
  similarity: 0.812,
  score: 0.785,
  note_a: {
    rel_path: "02-Projects/Atlas/HYPOTHESIS.md",
    title: "Atlas Hypothesis",
    quote: "qa",
    quote_provenance: "first prose sentence",
    hub_density: 0.1,
  },
  note_b: {
    rel_path: "07-Reference/Compounding-Patterns.md",
    title: "Compounding Patterns",
    quote: "qb",
    quote_provenance: "first prose sentence",
    hub_density: 0.1,
  },
};

const drift: DriftFinding = {
  verb: "drift",
  schema: 1,
  version: "v0",
  window_days: 30,
  daily_note_count: 30,
  project_count: 4,
  total_mentions: 120,
  score: 22.4,
  headline_overworked: {
    name: "Beacon",
    stated_notes: 4,
    stated_share: 0.1,
    stated_rank: 3,
    lived_mentions: 60,
    lived_share: 0.5,
    lived_rank: 1,
    drift_pct: 40,
  },
  headline_underworked: {
    name: "Atlas",
    stated_notes: 22,
    stated_share: 0.55,
    stated_rank: 1,
    lived_mentions: 12,
    lived_share: 0.1,
    lived_rank: 4,
    drift_pct: -45,
  },
  shares: [],
};

describe("renderBrief — JSON", () => {
  it("emits indented JSON.stringify equivalent of the Brief", () => {
    const brief: Brief = { schema: 1, section: "all", track_record: TR, findings: {} };
    const json = renderBrief(brief, "json");
    expect(JSON.parse(json)).toEqual(brief);
  });
});

describe("renderBrief — Markdown", () => {
  it("renders an empty brief with the no-findings note", () => {
    const brief: Brief = { schema: 1, section: "all", track_record: TR, findings: {} };
    const md = renderBrief(brief, "markdown");
    expect(md).toContain("# Basalt Brief");
    expect(md).toContain("Track record: no past briefs");
    expect(md).toContain("_No findings._");
  });

  it("renders track-record summary when there are past briefs", () => {
    const brief: Brief = { schema: 1, section: "all", track_record: TR_WITH, findings: {} };
    const md = renderBrief(brief, "markdown");
    expect(md).toContain("5 confirmed");
    expect(md).toContain("50% confirmed");
  });

  it("renders Buried Insight finding with quote, score, validator count", () => {
    const brief: Brief = {
      schema: 1,
      section: "buried-insight",
      track_record: TR,
      findings: { buried_insight: [buried] },
    };
    const md = renderBrief(brief, "markdown");
    expect(md).toContain("## Buried Insight (Au)");
    expect(md).toContain("[[Insight 001]]");
    expect(md).toContain("the moat isn't speed alone");
    expect(md).toContain("score 1.234");
    expect(md).toContain("1 validators");
  });

  it("renders Connection finding with both sides", () => {
    const brief: Brief = {
      schema: 1,
      section: "connection",
      track_record: TR,
      findings: { connection: [connection] },
    };
    const md = renderBrief(brief, "markdown");
    expect(md).toContain("## Connection (C)");
    expect(md).toContain("[[Atlas Hypothesis]] ⇄ [[Compounding Patterns]]");
    expect(md).toContain("similarity 0.812");
  });

  it("renders Drift finding with overworked + underworked", () => {
    const brief: Brief = {
      schema: 1,
      section: "drift",
      track_record: TR,
      findings: { drift: [drift] },
    };
    const md = renderBrief(brief, "markdown");
    expect(md).toContain("## Drift (Hg)");
    expect(md).toContain("**Overworked:** Beacon");
    expect(md).toContain("**Underworked:** Atlas");
    expect(md).toContain("Δ +40.0 pp");
    expect(md).toContain("Δ -45.0 pp");
  });

  it("preserves canonical render order across multiple buckets", () => {
    const brief: Brief = {
      schema: 1,
      section: "all",
      track_record: TR,
      findings: {
        drift: [drift],
        buried_insight: [buried],
        connection: [connection],
      },
    };
    const md = renderBrief(brief, "markdown");
    const buriedIdx = md.indexOf("Buried Insight");
    const connIdx = md.indexOf("Connection");
    const driftIdx = md.indexOf("Drift");
    // Canonical order (matches reference/src/basalt/brief.py):
    // implicit-thesis → buried → drift → contradiction → connection.
    expect(buriedIdx).toBeGreaterThan(0);
    expect(driftIdx).toBeGreaterThan(buriedIdx);
    expect(connIdx).toBeGreaterThan(driftIdx);
  });
});

describe("renderBrief — HTML", () => {
  it("wraps the Markdown in an article shell with HTML-escaped content", () => {
    const brief: Brief = {
      schema: 1,
      section: "buried-insight",
      track_record: TR,
      findings: { buried_insight: [{ ...buried, quote: "<script>x</script>" }] },
    };
    const html = renderBrief(brief, "html");
    expect(html).toMatch(/^<article class="basalt-brief">/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });
});
