// Parser surface — concrete impls land in TASK-1.2.
// Re-exported for use as `basalted-core/parser`.

export { parseFrontmatter } from "./frontmatter";
export type { ParsedNote } from "./markdown";
export { parseMarkdown } from "./markdown";
export { extractClaimQuote, scoreLoadBearing, splitSentences, stripMarkdown } from "./sentences";
