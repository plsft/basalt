// packages/core/src/promote/templates/buried.ts
// Resurfaced note template for a Buried Insight finding.

import type { BuriedInsightFinding } from "../../verbs/types";

export function renderBuriedTemplate(f: BuriedInsightFinding): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: resurfaced");
  lines.push(`source: ${quote(f.rel_path)}`);
  lines.push("tags: [basalt, resurfaced]");
  lines.push("---");
  lines.push("");
  lines.push(`# Resurfaced: ${f.title}`);
  lines.push("");
  lines.push("> *The note you forgot you wrote that recent work still depends on.*");
  lines.push("");
  lines.push("## Original claim");
  lines.push("");
  lines.push(`> ${f.quote}`);
  lines.push("");
  lines.push(`From [[${f.title}]] (${f.rel_path}).`);
  lines.push("");
  lines.push(
    `Score ${f.score.toFixed(3)} · ${f.inbound_recent_count} explicit inbound · ${f.validators.length} validators total.`,
  );
  lines.push("");
  if (f.validators.length > 0) {
    lines.push("## Recent notes that validate it");
    lines.push("");
    for (const v of f.validators) {
      const tag = v.explicit_link ? "linked" : `sim ${v.similarity.toFixed(3)}`;
      lines.push(`- [[${v.title}]] — ${tag}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function quote(s: string): string {
  if (/[":\n]/.test(s)) return JSON.stringify(s);
  return s;
}
