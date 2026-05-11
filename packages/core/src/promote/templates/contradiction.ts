// packages/core/src/promote/templates/contradiction.ts
// Tension note template for a Contradiction finding.

import type { ContradictionFinding } from "../../verbs/types";

export function renderContradictionTemplate(f: ContradictionFinding): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: tension");
  lines.push(`a: ${f.note_a.rel_path}`);
  lines.push(`b: ${f.note_b.rel_path}`);
  lines.push("tags: [basalt, tension]");
  lines.push("---");
  lines.push("");
  lines.push(`# Tension: ${f.note_a.title} ↮ ${f.note_b.title}`);
  lines.push("");
  lines.push("> *Two notes that can't both be true.*");
  lines.push("");
  lines.push(
    `Topical similarity ${f.topical_similarity.toFixed(3)} · contradiction-score ${f.contradiction_score.toFixed(3)}.`,
  );
  lines.push("");
  lines.push(`Signals: ${f.signals.join("; ")}`);
  lines.push("");
  lines.push(`## [[${f.note_a.title}]] says`);
  lines.push("");
  lines.push(`> ${f.note_a.quote}`);
  lines.push("");
  lines.push(`## [[${f.note_b.title}]] says`);
  lines.push("");
  lines.push(`> ${f.note_b.quote}`);
  lines.push("");
  lines.push("This is a v0 candidate, not a verdict — read both and decide.");
  return `${lines.join("\n")}\n`;
}
