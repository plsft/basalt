// packages/core/src/promote/templates/connection.ts
// Bridge note template for a Connection finding.

import type { ConnectionFinding } from "../../verbs/types";

export function renderConnectionTemplate(f: ConnectionFinding): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: bridge");
  lines.push(`a: ${f.note_a.rel_path}`);
  lines.push(`b: ${f.note_b.rel_path}`);
  lines.push("tags: [basalt, bridge]");
  lines.push("---");
  lines.push("");
  lines.push(`# Bridge: ${f.note_a.title} ⇄ ${f.note_b.title}`);
  lines.push("");
  lines.push("> *Two ideas in different folders that turn out to be the same idea.*");
  lines.push("");
  lines.push(`Similarity ${f.similarity.toFixed(3)} · score ${f.score.toFixed(3)}.`);
  lines.push("");
  lines.push(`## [[${f.note_a.title}]]`);
  lines.push("");
  lines.push(`> ${f.note_a.quote}`);
  lines.push("");
  lines.push(`## [[${f.note_b.title}]]`);
  lines.push("");
  lines.push(`> ${f.note_b.quote}`);
  return `${lines.join("\n")}\n`;
}
