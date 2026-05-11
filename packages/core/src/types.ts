// Public types for basalted-core. Mirrors SPEC.md §3, §5–9 + §15.
//
// These types are the engine's public contract. Per-verb finding shapes are
// kept under verbs/types.ts; this module re-exports the union for convenience.

import type { Finding } from "./verbs/types";

export type Verb = "buried-insight" | "connection" | "contradiction" | "implicit-thesis" | "drift";

export type FindingsBucket =
  | "buried_insight"
  | "connection"
  | "contradiction"
  | "implicit_thesis"
  | "drift";

export interface Note {
  /** Absolute on-disk path, normalized to forward slashes. */
  path: string;
  /** Vault-root-relative path, forward slashes. */
  relPath: string;
  /** Filename without `.md`. */
  stem: string;
  /** Frontmatter title or stem. */
  title: string;
  created: string | null;
  updated: string | null;
  tags: string[];
  /** Body, frontmatter stripped. */
  content: string;
  /** Raw wikilink targets after alias/anchor stripping. */
  wikilinks: string[];
  /** Python whitespace `body.split()` length. */
  wordCount: number;
  /** SHA-256 hex of body, UTF-8. */
  contentHash: string;
}

export interface Link {
  fromNoteId: number;
  /** Raw target string before resolution. */
  target: string;
  targetNoteId: number | null;
}

export interface Embedding {
  noteId: number;
  model: string;
  /** Hash at embedding time. */
  contentHash: string;
  dim: number;
  /** L2-normalized vector, length `dim`. */
  vec: Float32Array;
}

export interface TrackRecordSummary {
  schema: 1;
  window_days: number;
  confirmed: number;
  pending: number;
  falsified: number;
  total: number;
  confirmed_pct: number;
  falsified_pct: number;
}

export interface FalsificationRule {
  kind: string;
  params: Record<string, unknown>;
  text: string;
}

export interface Brief {
  schema: 1;
  section: Verb | "all";
  track_record: TrackRecordSummary;
  findings: Partial<Record<FindingsBucket, Finding[]>>;
}

export interface EngineOptions {
  /** Optional today override (ISO YYYY-MM-DD); used for vault-age calculations. */
  today?: string;
  /** Embedding model identifier (default `nomic-embed-text`). */
  embeddingModel?: string;
  /** Per-verb top-N override; default 3. */
  topN?: number;
  /** Optional progress reporter. Called with structured events from `index`/`brief`. */
  onProgress?: (event: {
    stage: string;
    message?: string;
    current?: number;
    total?: number;
  }) => void;
  /** Optional error reporter. Called for non-fatal errors during indexing. */
  onError?: (event: { stage: string; error: Error; relPath?: string }) => void;
}

// Re-export the per-verb finding union under the canonical name. The full
// shape definitions live in verbs/types.ts.
export type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Finding,
  ImplicitThesisFinding,
  PairSide,
  ProjectShare,
} from "./verbs/types";
