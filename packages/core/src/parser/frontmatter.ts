// packages/core/src/parser/frontmatter.ts
// YAML frontmatter parsing. Real implementation lands in TASK-1.2.

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
}

/** Parse YAML frontmatter at the top of a Markdown document. Returns the
 *  metadata dict and the remaining body. Real implementation uses `js-yaml`
 *  with PyYAML-equivalent type coercion. Stub for TASK-1.2. */
export function parseFrontmatter(_raw: string): ParsedFrontmatter {
  throw new Error("parseFrontmatter: not yet implemented (lands in TASK-1.2)");
}
