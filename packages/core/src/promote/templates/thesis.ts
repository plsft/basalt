// packages/core/src/promote/templates/thesis.ts
// Thesis note template for an Implicit Thesis finding.

import type { ImplicitThesisFinding } from "../../verbs/types";

export function renderThesisTemplate(f: ImplicitThesisFinding): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: thesis");
  lines.push(`centroid: ${f.centroid.rel_path}`);
  lines.push("tags: [basalt, thesis]");
  lines.push("---");
  lines.push("");
  lines.push(`# Thesis: ${f.centroid.title}`);
  lines.push("");
  lines.push("> *The thing you keep saying without realizing you're saying the same thing.*");
  lines.push("");
  lines.push(
    `Cluster of ${f.cluster_size} notes across ${f.folder_diversity} folders, spanning ${f.span_days} days.`,
  );
  lines.push(
    `Mean intra-cluster similarity ${f.mean_similarity.toFixed(3)} · score ${f.score.toFixed(3)}.`,
  );
  lines.push("");
  lines.push("## Proxy thesis");
  lines.push("");
  lines.push(`> ${f.centroid.quote}`);
  lines.push("");
  lines.push(`From [[${f.centroid.title}]] (${f.centroid.rel_path}).`);
  lines.push("");
  lines.push("## Members (rephrasings)");
  lines.push("");
  for (const m of f.members) {
    lines.push(`### [[${m.title}]] — ${m.folder}`);
    lines.push("");
    if (m.quote) {
      lines.push(`> ${m.quote}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}
