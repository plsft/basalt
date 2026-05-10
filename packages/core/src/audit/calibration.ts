// packages/core/src/audit/calibration.ts
// Calibration / falsification layer. SPEC.md §10. Real impl lands in TASK-1.5.

import type { FalsificationRule, Verb } from "../types";
import type { Finding } from "../verbs/types";

export interface AuditResult {
  briefId: number;
  verb: Verb;
  findingKey: string;
  ruleKind: string;
  newStatus: "confirmed" | "falsified" | "pending";
  reason: string;
  ageDays: number;
}

export interface TrackRecord {
  windowDays: number;
  confirmed: number;
  pending: number;
  falsified: number;
  total: number;
  /** Rounded to 1 decimal place to match Python's `round(_, 1)` (banker's rounding). */
  confirmedPct: number;
  falsifiedPct: number;
}

/** Derive falsification rules for a finding, dispatched on `verb`. SPEC.md §10. */
export function falsificationRulesFor(_verb: Verb, _finding: Finding): FalsificationRule[] {
  throw new Error("falsificationRulesFor: not yet implemented (lands in TASK-1.5)");
}

/** Persist a finding to the calibration table. Idempotent via the finding key. */
export function recordFinding(): number | null {
  throw new Error("recordFinding: not yet implemented (lands in TASK-1.5)");
}

/** Walk pending briefs, apply falsification rules against current vault state. */
export function auditPending(): Promise<AuditResult[]> {
  throw new Error("auditPending: not yet implemented (lands in TASK-1.5)");
}

/** Track-record summary over a rolling window of past findings. */
export function trackRecord(): TrackRecord {
  throw new Error("trackRecord: not yet implemented (lands in TASK-1.5)");
}
