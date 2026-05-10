// Per-verb finding shapes. Wire format mirrors SPEC.md §5–9 and the Python
// `serialize.py` shapes. snake_case is intentional — these are I/O-facing.

import type { FalsificationRule } from "../types";

export type QuoteProvenance =
  | "empty"
  | "callout body"
  | "blockquote summary"
  | "first prose sentence"
  | "opening passage";

export interface PairSide {
  rel_path: string;
  title: string;
  quote: string;
  quote_provenance: QuoteProvenance;
}

export interface ProjectShare {
  name: string;
  stated_notes: number;
  stated_share: number;
  stated_rank: number;
  lived_mentions: number;
  lived_share: number;
  lived_rank: number;
  drift_pct: number;
}

export interface BuriedInsightFinding {
  verb: "buried-insight";
  schema: 1;
  rel_path: string;
  title: string;
  stem: string;
  created: string;
  updated: string;
  word_count: number;
  score: number;
  hub_density: number;
  hub_penalty: number;
  inbound_recent_count: number;
  quote: string;
  quote_provenance: QuoteProvenance;
  vault_age_days: number;
  thresholds: {
    min_age_days: number;
    min_dormant_days: number;
    recent_window_days: number;
  };
  validators: Array<{
    rel_path: string;
    title: string;
    updated: string | null;
    explicit_link: boolean;
    similarity: number;
  }>;
  falsification?: FalsificationRule[];
}

export interface ConnectionFinding {
  verb: "connection";
  schema: 1;
  similarity: number;
  score: number;
  note_a: PairSide & { hub_density: number };
  note_b: PairSide & { hub_density: number };
  falsification?: FalsificationRule[];
}

export interface ContradictionFinding {
  verb: "contradiction";
  schema: 1;
  version: "v0-heuristic";
  topical_similarity: number;
  contradiction_score: number;
  score: number;
  signals: string[];
  note_a: PairSide;
  note_b: PairSide;
  falsification?: FalsificationRule[];
}

export interface ImplicitThesisFinding {
  verb: "implicit-thesis";
  schema: 1;
  version: "v0-cluster";
  score: number;
  cluster_size: number;
  folder_diversity: number;
  span_days: number;
  mean_similarity: number;
  centroid: PairSide;
  members: Array<{
    rel_path: string;
    title: string;
    folder: string;
    quote: string;
    quote_provenance: QuoteProvenance;
  }>;
  falsification?: FalsificationRule[];
}

export interface DriftFinding {
  verb: "drift";
  schema: 1;
  version: "v0";
  window_days: number;
  daily_note_count: number;
  project_count: number;
  total_mentions: number;
  score: number;
  headline_overworked: ProjectShare | null;
  headline_underworked: ProjectShare | null;
  shares: ProjectShare[];
  falsification?: FalsificationRule[];
}

export type Finding =
  | BuriedInsightFinding
  | ConnectionFinding
  | ContradictionFinding
  | ImplicitThesisFinding
  | DriftFinding;

/** A verb is a function that takes engine state and returns findings. The
 *  concrete signature lands in TASK-1.6 when the first verb ports. */
export interface VerbResult<F extends Finding = Finding> {
  verb: F["verb"];
  findings: F[];
}
