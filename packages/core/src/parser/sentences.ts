// packages/core/src/parser/sentences.ts
// Sentence-aware load-bearing-quote extraction. Real implementation lands in TASK-1.2.
// SPEC.md §2.4 is the source of truth for every regex and weight.

import type { QuoteProvenance } from "../verbs/types";

/** Strip Markdown decoration (bold, italic, inline code, wikilinks, images,
 *  highlight, strike) per SPEC.md §2.4.2. */
export function stripMarkdown(_raw: string): string {
  throw new Error("stripMarkdown: not yet implemented (lands in TASK-1.2)");
}

/** Split a passage into sentences using SPEC.md §2.4.3's boundary regex. */
export function splitSentences(_passage: string): string[] {
  throw new Error("splitSentences: not yet implemented (lands in TASK-1.2)");
}

/** Score a single sentence's load-bearing-ness per SPEC.md §2.4.5. */
export function scoreLoadBearing(
  _sentence: string,
  _position: number,
  _total: number,
  _preferLast: boolean,
): number {
  throw new Error("scoreLoadBearing: not yet implemented (lands in TASK-1.2)");
}

/** Extract the load-bearing claim from a Markdown body. Returns the chosen
 *  quote and a provenance label. SPEC.md §2.4.7. */
export function extractClaimQuote(_body: string): { quote: string; provenance: QuoteProvenance } {
  throw new Error("extractClaimQuote: not yet implemented (lands in TASK-1.2)");
}
