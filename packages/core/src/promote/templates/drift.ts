// packages/core/src/promote/templates/drift.ts
// Drift note template for a Drift finding.

import type { DriftFinding } from "../../verbs/types";

export function renderDriftTemplate(f: DriftFinding): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: drift");
  lines.push(`window_days: ${f.window_days}`);
  lines.push("tags: [basalt, drift]");
  lines.push("---");
  lines.push("");
  lines.push(`# Drift over the last ${f.window_days} days`);
  lines.push("");
  lines.push("> *What you say is the priority versus what you actually spent the week on.*");
  lines.push("");
  lines.push(
    `${f.daily_note_count} daily notes · ${f.project_count} projects · ${f.total_mentions} mentions.`,
  );
  lines.push("");
  if (f.headline_overworked) {
    const o = f.headline_overworked;
    lines.push("## Overworked");
    lines.push("");
    lines.push(
      `**${o.name}** is stated rank ${o.stated_rank} (${pct(o.stated_share)} of project notes) but lived rank ${o.lived_rank} (${pct(o.lived_share)} of daily-note mentions).`,
    );
    lines.push("");
    lines.push(`Drift: ${signed(o.drift_pct)} pp.`);
    lines.push("");
  }
  if (f.headline_underworked) {
    const u = f.headline_underworked;
    lines.push("## Underworked");
    lines.push("");
    lines.push(
      `**${u.name}** is stated rank ${u.stated_rank} (${pct(u.stated_share)} of project notes) but lived rank ${u.lived_rank} (${pct(u.lived_share)} of daily-note mentions).`,
    );
    lines.push("");
    lines.push(`Drift: ${signed(u.drift_pct)} pp.`);
    lines.push("");
  }
  lines.push("## Full breakdown");
  lines.push("");
  lines.push("| Project | Stated rank | Stated share | Lived rank | Lived share | Drift |");
  lines.push("| --- | --: | --: | --: | --: | --: |");
  for (const s of f.shares) {
    lines.push(
      `| ${s.name} | ${s.stated_rank} | ${pct(s.stated_share)} | ${s.lived_rank} | ${pct(s.lived_share)} | ${signed(s.drift_pct)} pp |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}
