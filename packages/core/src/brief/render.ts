// packages/core/src/brief/render.ts
// Brief rendering: Markdown / HTML / JSON.

import type { Brief, FindingsBucket } from "../types";
import type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Finding,
  ImplicitThesisFinding,
} from "../verbs/types";

export type RenderFormat = "markdown" | "html" | "json";

const BUCKET_TITLE: Record<FindingsBucket, string> = {
  buried_insight: "Buried Insight (Au)",
  connection: "Connection (C)",
  contradiction: "Contradiction (Cl)",
  implicit_thesis: "Implicit Thesis (Na)",
  drift: "Drift (Hg)",
};

// Mirror reference/src/basalt/brief.py section ordering (v0.0.14+):
//   implicit-thesis → buried-insight → drift → contradiction → connection
const RENDER_ORDER: FindingsBucket[] = [
  "implicit_thesis",
  "buried_insight",
  "drift",
  "contradiction",
  "connection",
];

export function renderBrief(brief: Brief, format: RenderFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(brief, null, 2);
    case "markdown":
      return renderMarkdown(brief);
    case "html":
      return renderHtml(brief);
  }
}

function renderMarkdown(brief: Brief): string {
  const lines: string[] = [];
  lines.push("# Basalt Brief");
  lines.push("");
  lines.push(renderTrackRecordMd(brief));
  lines.push("");

  let bucketsRendered = 0;
  for (const bucket of RENDER_ORDER) {
    const arr = brief.findings[bucket];
    if (!arr || arr.length === 0) continue;
    bucketsRendered++;
    lines.push(`## ${BUCKET_TITLE[bucket]}`);
    lines.push("");
    for (const f of arr) {
      lines.push(...renderFindingMd(f));
      lines.push("");
    }
  }
  if (bucketsRendered === 0) {
    lines.push("_No findings._");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function renderTrackRecordMd(brief: Brief): string {
  const tr = brief.track_record;
  if (tr.total === 0) {
    return `_Track record: no past briefs in the last ${tr.window_days} days._`;
  }
  return `_Track record (${tr.window_days}d): ${tr.confirmed} confirmed · ${tr.pending} pending · ${tr.falsified} falsified · ${tr.confirmed_pct}% confirmed._`;
}

function renderFindingMd(f: Finding): string[] {
  switch (f.verb) {
    case "buried-insight":
      return renderBuriedMd(f);
    case "connection":
      return renderConnectionMd(f);
    case "contradiction":
      return renderContradictionMd(f);
    case "implicit-thesis":
      return renderThesisMd(f);
    case "drift":
      return renderDriftMd(f);
  }
}

function renderBuriedMd(f: BuriedInsightFinding): string[] {
  return [
    `### [[${f.title}]] — ${f.rel_path}`,
    "",
    `> ${f.quote}`,
    "",
    `_score ${fmt(f.score)} · ${f.inbound_recent_count} inbound · ${f.validators.length} validators_`,
  ];
}

function renderConnectionMd(f: ConnectionFinding): string[] {
  return [
    `### [[${f.note_a.title}]] ⇄ [[${f.note_b.title}]]`,
    "",
    `> A — ${f.note_a.rel_path}: ${f.note_a.quote}`,
    `> B — ${f.note_b.rel_path}: ${f.note_b.quote}`,
    "",
    `_similarity ${fmt(f.similarity)} · score ${fmt(f.score)}_`,
  ];
}

function renderContradictionMd(f: ContradictionFinding): string[] {
  return [
    `### [[${f.note_a.title}]] ↮ [[${f.note_b.title}]]`,
    "",
    `> A — ${f.note_a.rel_path}: ${f.note_a.quote}`,
    `> B — ${f.note_b.rel_path}: ${f.note_b.quote}`,
    "",
    `_signals: ${f.signals.join("; ")} · contradiction-score ${fmt(f.contradiction_score)}_`,
  ];
}

function renderThesisMd(f: ImplicitThesisFinding): string[] {
  const out: string[] = [];
  out.push(`### Through-line: [[${f.centroid.title}]]`);
  out.push("");
  out.push(`> ${f.centroid.quote}`);
  out.push("");
  out.push(
    `Cluster (${f.cluster_size} notes, ${f.folder_diversity} folders, ${f.span_days}d span):`,
  );
  for (const m of f.members) {
    out.push(`- [[${m.title}]] — ${m.rel_path}`);
  }
  return out;
}

function renderDriftMd(f: DriftFinding): string[] {
  const out: string[] = [];
  out.push(`### Drift over the last ${f.window_days}d`);
  out.push("");
  if (f.headline_overworked) {
    const o = f.headline_overworked;
    out.push(
      `- **Overworked:** ${o.name} — stated ${pct(o.stated_share)}, lived ${pct(o.lived_share)} (Δ ${signed(o.drift_pct)} pp)`,
    );
  }
  if (f.headline_underworked) {
    const u = f.headline_underworked;
    out.push(
      `- **Underworked:** ${u.name} — stated ${pct(u.stated_share)}, lived ${pct(u.lived_share)} (Δ ${signed(u.drift_pct)} pp)`,
    );
  }
  out.push("");
  out.push(
    `_${f.daily_note_count} daily notes · ${f.project_count} projects · ${f.total_mentions} mentions_`,
  );
  return out;
}

function fmt(n: number): string {
  return n.toFixed(3);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function renderHtml(brief: Brief): string {
  return `<article class="basalt-brief"><pre>${escapeHtml(renderMarkdown(brief))}</pre></article>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
