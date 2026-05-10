// packages/core/src/parser/markdown.ts
// Markdown parser. Real implementation lands in TASK-1.2.

import type { Note } from "../types";

export interface ParsedNote extends Omit<Note, "path" | "relPath" | "stem"> {
  /** Outgoing wikilinks before resolution to note IDs. */
  wikilinks: string[];
}

/** Parse a single Markdown file. Returns null if unparseable.
 *  Stub for TASK-1.2 — real implementation uses unified + remark + frontmatter
 *  + remark-wiki-link per SPEC.md §1, §2.4. */
export function parseMarkdown(_raw: string): ParsedNote | null {
  throw new Error("parseMarkdown: not yet implemented (lands in TASK-1.2)");
}
