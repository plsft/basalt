// tests/parity/utils.ts
//
// Helpers for the Python ↔ TypeScript parity test suite. The TS implementations
// of the verbs land in Phase 1; until then this module is exercised by its own
// unit tests (utils.test.ts) and by ts.test.ts which loads + schema-validates
// each baseline JSON.
//
// The full Finding / Brief types live in @basalt/core (lands in Phase 1). The
// minimal shapes here mirror SPEC.md §3, §5–9 and are sufficient for the
// runtime validation done in this directory. The `import` side switches over
// to @basalt/core once the package's public surface stabilises.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ─────────────────────────────────────────────────────────────────

export type Verb = "buried-insight" | "connection" | "contradiction" | "implicit-thesis" | "drift";

/** Tolerance used when comparing similarity scores across the Python ↔ TS
 *  boundary. PRD §8.1, SPEC.md §0. */
export const DEFAULT_TOLERANCE = 1e-5;

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
  quote_provenance: string;
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
    quote_provenance: string;
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

export interface PairSide {
  rel_path: string;
  title: string;
  quote: string;
  quote_provenance: string;
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

export type Finding =
  | BuriedInsightFinding
  | ConnectionFinding
  | ContradictionFinding
  | ImplicitThesisFinding
  | DriftFinding;

export type FindingsBucket =
  | "buried_insight"
  | "connection"
  | "contradiction"
  | "implicit_thesis"
  | "drift";

export interface Brief {
  schema: 1;
  section: Verb | "all";
  track_record: TrackRecordSummary;
  findings: Partial<Record<FindingsBucket, Finding[]>>;
}

// ── Loading ───────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = join(HERE, "baseline");

/** Load a single baseline JSON file. The `name` argument is the file's stem
 *  *without* extension — e.g. `loadBaseline("sample-14-brief")`. */
export function loadBaseline(name: string): Brief {
  const path = join(BASELINE_DIR, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`baseline not found: ${path}`);
  }
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`baseline ${name} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isBriefShape(parsed)) {
    throw new Error(`baseline ${name} does not match Brief shape`);
  }
  return parsed;
}

// ── Validation ────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBriefShape(v: unknown): v is Brief {
  if (!isObject(v)) return false;
  if (v.schema !== 1) return false;
  if (typeof v.section !== "string") return false;
  if (!isObject(v.track_record)) return false;
  if (!isObject(v.findings)) return false;
  return true;
}

/** Stable per-finding key. Mirrors `_finding_key` in
 *  `reference/src/basalt/audit.py:202-224`. */
export function findingKey(f: Finding): string {
  switch (f.verb) {
    case "buried-insight":
      return `buried-insight:${f.rel_path}`;
    case "connection": {
      const [a, b] = [f.note_a.rel_path, f.note_b.rel_path].sort();
      return `connection:${a}|${b}`;
    }
    case "contradiction": {
      const [a, b] = [f.note_a.rel_path, f.note_b.rel_path].sort();
      return `contradiction:${a}|${b}`;
    }
    case "implicit-thesis": {
      const members = f.members.map((m) => m.rel_path).sort();
      return `implicit-thesis:${members.join("|")}`;
    }
    case "drift": {
      const over = f.headline_overworked?.name ?? "-";
      const under = f.headline_underworked?.name ?? "-";
      return `drift:${under}->${over}@${f.window_days}d`;
    }
  }
}

// ── Comparison ────────────────────────────────────────────────────────────

export interface CompareResult {
  ok: boolean;
  errors: string[];
}

/** Numeric closeness within `ε`. Treats `NaN`/`Infinity` strictly: any non-finite
 *  pair is unequal. Used for similarity scores and drift percentages. */
export function nearlyEqual(a: number, b: number, tolerance: number = DEFAULT_TOLERANCE): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

/** Compare two arrays of findings under PRD §8.1 tolerances:
 *  - exact set membership by `findingKey`
 *  - exact ordering by `findingKey` (ties broken deterministically inside the verb)
 *  - score numbers within `tolerance` (default ε = 1e-5)
 *  - quotes, paths, provenances: byte-identical
 */
export function compareFindings(
  actual: Finding[],
  baseline: Finding[],
  tolerance: number = DEFAULT_TOLERANCE,
): CompareResult {
  const errors: string[] = [];

  const actualKeys = actual.map(findingKey);
  const baselineKeys = baseline.map(findingKey);

  if (actualKeys.length !== baselineKeys.length) {
    errors.push(`length mismatch: actual=${actualKeys.length} baseline=${baselineKeys.length}`);
  }

  // Ordering: position-by-position equality of keys.
  const len = Math.max(actualKeys.length, baselineKeys.length);
  for (let i = 0; i < len; i++) {
    const a = actualKeys[i];
    const b = baselineKeys[i];
    if (a !== b) {
      errors.push(`order[${i}]: actual=${a ?? "(missing)"}  baseline=${b ?? "(missing)"}`);
    }
  }

  // Field-level equality on aligned positions.
  const aligned = Math.min(actualKeys.length, baselineKeys.length);
  for (let i = 0; i < aligned; i++) {
    const a = actual[i];
    const b = baseline[i];
    if (!a || !b) continue;
    errors.push(...compareSingle(a, b, tolerance, `[${i}]`));
  }

  return { ok: errors.length === 0, errors };
}

function compareSingle(
  actual: Finding,
  baseline: Finding,
  tolerance: number,
  prefix: string,
): string[] {
  const errs: string[] = [];
  if (actual.verb !== baseline.verb) {
    errs.push(`${prefix}.verb: actual=${actual.verb} baseline=${baseline.verb}`);
    return errs;
  }
  // Score: tolerated.
  if (!nearlyEqual(actual.score, baseline.score, tolerance)) {
    errs.push(
      `${prefix}.score: actual=${actual.score} baseline=${baseline.score} (Δ=${Math.abs(actual.score - baseline.score)})`,
    );
  }

  switch (baseline.verb) {
    case "buried-insight": {
      const a = actual as BuriedInsightFinding;
      const b = baseline;
      if (a.rel_path !== b.rel_path) {
        errs.push(`${prefix}.rel_path: actual=${a.rel_path} baseline=${b.rel_path}`);
      }
      if (a.quote !== b.quote) {
        errs.push(`${prefix}.quote: not byte-identical`);
      }
      if (a.quote_provenance !== b.quote_provenance) {
        errs.push(
          `${prefix}.quote_provenance: actual=${a.quote_provenance} baseline=${b.quote_provenance}`,
        );
      }
      break;
    }
    case "connection": {
      const a = actual as ConnectionFinding;
      const b = baseline;
      if (a.note_a.rel_path !== b.note_a.rel_path) {
        errs.push(`${prefix}.note_a.rel_path mismatch`);
      }
      if (a.note_b.rel_path !== b.note_b.rel_path) {
        errs.push(`${prefix}.note_b.rel_path mismatch`);
      }
      if (a.note_a.quote !== b.note_a.quote) {
        errs.push(`${prefix}.note_a.quote not byte-identical`);
      }
      if (a.note_b.quote !== b.note_b.quote) {
        errs.push(`${prefix}.note_b.quote not byte-identical`);
      }
      if (!nearlyEqual(a.similarity, b.similarity, tolerance)) {
        errs.push(`${prefix}.similarity Δ exceeds tolerance`);
      }
      break;
    }
    case "contradiction": {
      const a = actual as ContradictionFinding;
      const b = baseline;
      if (a.note_a.rel_path !== b.note_a.rel_path) {
        errs.push(`${prefix}.note_a.rel_path mismatch`);
      }
      if (a.note_b.rel_path !== b.note_b.rel_path) {
        errs.push(`${prefix}.note_b.rel_path mismatch`);
      }
      if (a.note_a.quote !== b.note_a.quote) {
        errs.push(`${prefix}.note_a.quote not byte-identical`);
      }
      if (a.note_b.quote !== b.note_b.quote) {
        errs.push(`${prefix}.note_b.quote not byte-identical`);
      }
      if (!nearlyEqual(a.topical_similarity, b.topical_similarity, tolerance)) {
        errs.push(`${prefix}.topical_similarity Δ exceeds tolerance`);
      }
      break;
    }
    case "implicit-thesis": {
      const a = actual as ImplicitThesisFinding;
      const b = baseline;
      if (a.centroid.rel_path !== b.centroid.rel_path) {
        errs.push(`${prefix}.centroid.rel_path mismatch`);
      }
      const aMembers = a.members.map((m) => m.rel_path).sort();
      const bMembers = b.members.map((m) => m.rel_path).sort();
      if (aMembers.join("|") !== bMembers.join("|")) {
        errs.push(`${prefix}.members set mismatch`);
      }
      if (!nearlyEqual(a.mean_similarity, b.mean_similarity, tolerance)) {
        errs.push(`${prefix}.mean_similarity Δ exceeds tolerance`);
      }
      break;
    }
    case "drift": {
      const a = actual as DriftFinding;
      const b = baseline;
      if (a.headline_overworked?.name !== b.headline_overworked?.name) {
        errs.push(`${prefix}.headline_overworked mismatch`);
      }
      if (a.headline_underworked?.name !== b.headline_underworked?.name) {
        errs.push(`${prefix}.headline_underworked mismatch`);
      }
      if (a.shares.length !== b.shares.length) {
        errs.push(`${prefix}.shares length mismatch`);
      }
      break;
    }
  }
  return errs;
}

/** Compare two full Briefs: schema, section, every populated `findings.*` bucket. */
export function compareBrief(
  actual: Brief,
  baseline: Brief,
  tolerance: number = DEFAULT_TOLERANCE,
): CompareResult {
  const errors: string[] = [];

  if (actual.schema !== baseline.schema) {
    errors.push(`schema: actual=${actual.schema} baseline=${baseline.schema}`);
  }
  if (actual.section !== baseline.section) {
    errors.push(`section: actual=${actual.section} baseline=${baseline.section}`);
  }

  const buckets: FindingsBucket[] = [
    "buried_insight",
    "connection",
    "contradiction",
    "implicit_thesis",
    "drift",
  ];

  for (const bucket of buckets) {
    const a = actual.findings[bucket] ?? [];
    const b = baseline.findings[bucket] ?? [];
    if (a.length === 0 && b.length === 0) continue;
    const r = compareFindings(a, b, tolerance);
    for (const e of r.errors) {
      errors.push(`${bucket}${e}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
