// packages/core/src/brief/compose.ts
// Brief composition. SPEC.md §3.

import type { Brief, FindingsBucket, TrackRecordSummary, Verb } from "../types";
import type { Finding } from "../verbs/types";

export interface ComposeInput {
  /** Section the brief was generated for. `"all"` means every verb ran. */
  section: Verb | "all";
  /** Findings keyed by canonical bucket name. Empty arrays preserved. */
  findings: Partial<Record<FindingsBucket, Finding[]>>;
  trackRecord: TrackRecordSummary;
}

const RENDER_ORDER: FindingsBucket[] = [
  "buried_insight",
  "connection",
  "contradiction",
  "implicit_thesis",
  "drift",
];

export function bucketForVerb(verb: Verb): FindingsBucket {
  switch (verb) {
    case "buried-insight":
      return "buried_insight";
    case "connection":
      return "connection";
    case "contradiction":
      return "contradiction";
    case "implicit-thesis":
      return "implicit_thesis";
    case "drift":
      return "drift";
  }
}

/** Build a Brief object. Always preserves the canonical render order
 *  (buried-insight → connection → contradiction → implicit-thesis → drift)
 *  per SPEC.md §3, regardless of the order findings were discovered in. */
export function composeBrief(input: ComposeInput): Brief {
  const findings: Partial<Record<FindingsBucket, Finding[]>> = {};
  for (const bucket of RENDER_ORDER) {
    const arr = input.findings[bucket];
    if (arr === undefined) continue;
    findings[bucket] = arr;
  }
  return {
    schema: 1,
    section: input.section,
    track_record: input.trackRecord,
    findings,
  };
}
