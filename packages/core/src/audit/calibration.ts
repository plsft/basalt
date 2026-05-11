// packages/core/src/audit/calibration.ts
// Calibration / falsification layer. Ports reference/src/basalt/audit.py.
//
// SPEC.md §10:
//   - falsificationRulesFor(verb, finding) → FalsificationRule[]
//   - findingKey(verb, finding) → stable string for idempotency
//   - recordFinding(storage, verb, finding, today) — log if not already pending
//   - auditPending(storage, today) — walk pending, evaluate rules, update statuses
//   - trackRecord(storage, days, today) — confirmed/pending/falsified counts

import type { StorageAdapter } from "../adapters";
import type { FalsificationRule, TrackRecordSummary, Verb } from "../types";
import type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Finding,
  ImplicitThesisFinding,
} from "../verbs/types";

// Falsification grace defaults (audit.py:24-27).
export const DEFAULT_BURIED_GRACE_DAYS = 60;
export const DEFAULT_CONN_GRACE_DAYS = 60;
export const DEFAULT_CONTRA_GRACE_DAYS = 60;
export const DEFAULT_WORDCOUNT_DROP_PCT = 30;

// ── Rule generation per verb ──────────────────────────────────────────────

export function falsificationRulesFor(verb: Verb, finding: Finding): FalsificationRule[] {
  switch (verb) {
    case "buried-insight":
      return buriedRules(finding as BuriedInsightFinding);
    case "connection":
      return connectionRules(finding as ConnectionFinding);
    case "contradiction":
      return contradictionRules(finding as ContradictionFinding);
    case "implicit-thesis":
      return implicitThesisRules(finding as ImplicitThesisFinding);
    case "drift":
      return driftRules(finding as DriftFinding);
  }
}

function buriedRules(f: BuriedInsightFinding): FalsificationRule[] {
  const rel = f.rel_path;
  return [
    {
      kind: "no_new_validators",
      params: { rel_path: rel, grace_days: DEFAULT_BURIED_GRACE_DAYS },
      text: `wrong if no new note links to or semantically validates ${rel} within ${DEFAULT_BURIED_GRACE_DAYS} days`,
    },
    {
      kind: "candidate_shrinks",
      params: { rel_path: rel, drop_pct: DEFAULT_WORDCOUNT_DROP_PCT },
      text: `wrong if ${rel} loses more than ${DEFAULT_WORDCOUNT_DROP_PCT}% of its content (you actively dismantled the claim)`,
    },
    {
      kind: "candidate_deleted",
      params: { rel_path: rel },
      text: `wrong if ${rel} is deleted (you've moved on from this claim)`,
    },
  ];
}

function connectionRules(f: ConnectionFinding): FalsificationRule[] {
  const a = f.note_a.rel_path;
  const b = f.note_b.rel_path;
  return [
    {
      kind: "still_unlinked",
      params: { a, b, grace_days: DEFAULT_CONN_GRACE_DAYS },
      text: `wrong if you don't link ${a} ↔ ${b} within ${DEFAULT_CONN_GRACE_DAYS} days (you don't agree they're connected)`,
    },
    {
      kind: "either_shrinks",
      params: { a, b, drop_pct: 50 },
      text: `wrong if either note loses more than 50% of its content (the underlying idea was discarded)`,
    },
  ];
}

function contradictionRules(f: ContradictionFinding): FalsificationRule[] {
  const a = f.note_a.rel_path;
  const b = f.note_b.rel_path;
  return [
    {
      kind: "neither_edited",
      params: { a, b, grace_days: DEFAULT_CONTRA_GRACE_DAYS },
      text: `wrong if neither note is edited within ${DEFAULT_CONTRA_GRACE_DAYS} days (you don't think it's a real conflict — heuristic was a false positive)`,
    },
    {
      kind: "still_in_conflict",
      params: { a, b, grace_days: 90 },
      text: `confirmed if both notes still exist with the contradiction signal intact after 90 days (the conflict is real and unresolved)`,
    },
  ];
}

function implicitThesisRules(f: ImplicitThesisFinding): FalsificationRule[] {
  const memberPaths = f.members.map((m) => m.rel_path);
  return [
    {
      kind: "centroid_deleted",
      params: { rel_path: f.centroid.rel_path },
      text: `wrong if ${f.centroid.rel_path} is deleted (the proxy thesis statement is gone — the cluster needs a new centroid)`,
    },
    {
      kind: "cluster_dispersed",
      params: { member_paths: memberPaths, min_remaining: Math.max(2, f.cluster_size - 2) },
      text: `wrong if more than 2 of the ${f.cluster_size} cluster members are deleted within 90 days (the through-line dissolves)`,
    },
    {
      kind: "no_new_rephrasing",
      params: { member_paths: memberPaths, grace_days: 90 },
      text: `wrong if no new note expresses a similar claim within 90 days (the convergence was a snapshot, not a recurring theme)`,
    },
  ];
}

function driftRules(f: DriftFinding): FalsificationRule[] {
  const rules: FalsificationRule[] = [];
  if (f.headline_overworked) {
    const name = f.headline_overworked.name;
    rules.push({
      kind: "drift_resolved",
      params: { project: name, direction: "down", grace_days: 30 },
      text: `wrong if ${name}'s share of daily-note mentions drops back toward its stated share within 30 days (the drift was a phase, not a pattern)`,
    });
  }
  if (f.headline_underworked) {
    const name = f.headline_underworked.name;
    rules.push({
      kind: "drift_resolved",
      params: { project: name, direction: "up", grace_days: 30 },
      text: `wrong if ${name}'s share of daily-note mentions rises back toward its stated share within 30 days (you've responded to the drift)`,
    });
  }
  rules.push({
    kind: "structural_change",
    params: { projects_at_log: f.shares.map((s) => s.name) },
    text: `wrong if the project list itself changes materially within 60 days (you renamed/archived projects — the drift was structural, not behavioural)`,
  });
  return rules;
}

// ── Finding key (idempotency) — audit.py:202-224 ──────────────────────────

export function findingKey(verb: Verb, finding: Finding): string {
  switch (verb) {
    case "buried-insight":
      return `buried-insight:${(finding as BuriedInsightFinding).rel_path}`;
    case "connection": {
      const f = finding as ConnectionFinding;
      const [a, b] = [f.note_a.rel_path, f.note_b.rel_path].sort();
      return `connection:${a}|${b}`;
    }
    case "contradiction": {
      const f = finding as ContradictionFinding;
      const [a, b] = [f.note_a.rel_path, f.note_b.rel_path].sort();
      return `contradiction:${a}|${b}`;
    }
    case "implicit-thesis": {
      const f = finding as ImplicitThesisFinding;
      const members = f.members.map((m) => m.rel_path).sort();
      return `implicit-thesis:${members.join("|")}`;
    }
    case "drift": {
      const f = finding as DriftFinding;
      const over = f.headline_overworked?.name ?? "-";
      const under = f.headline_underworked?.name ?? "-";
      return `drift:${under}->${over}@${f.window_days}d`;
    }
  }
}

// ── Recording ─────────────────────────────────────────────────────────────

/** Log a Brief finding to the calibration table. Idempotent on
 *  (verb, finding_key) while pending. Returns the inserted row id, or null
 *  if a pending duplicate already exists. */
export async function recordFinding(
  storage: StorageAdapter,
  verb: Verb,
  finding: Finding,
  today: string,
): Promise<number | null> {
  const rules = falsificationRulesFor(verb, finding);
  return await storage.upsertFinding({
    verb,
    finding_key: findingKey(verb, finding),
    finding_json: JSON.stringify(finding),
    falsification: JSON.stringify(rules),
    created_at: today,
    status: "pending",
  });
}

// ── Auditing ──────────────────────────────────────────────────────────────

export interface AuditResult {
  briefId: number;
  verb: Verb;
  findingKey: string;
  ruleKind: string;
  newStatus: "confirmed" | "falsified" | "pending";
  reason: string;
  ageDays: number;
}

/** Walk every pending brief and apply its falsification rules against the
 *  current vault state. Returns the list of state changes. */
export async function auditPending(storage: StorageAdapter, today: string): Promise<AuditResult[]> {
  const pending = await storage.listFindings({ status: "pending" });
  const state = await snapshotVaultState(storage);
  const links = await snapshotResolvedLinks(storage);
  const todayDate = parseIsoDate(today);
  const results: AuditResult[] = [];

  for (const brief of pending) {
    if (brief.id === undefined) continue;
    let finding: Record<string, unknown>;
    let rules: FalsificationRule[];
    try {
      finding = JSON.parse(brief.finding_json) as Record<string, unknown>;
      rules = JSON.parse(brief.falsification) as FalsificationRule[];
    } catch {
      continue;
    }
    const created = parseIsoDate(brief.created_at);
    if (!Number.isFinite(created.getTime())) continue;
    const ageDays = Math.floor((todayDate.getTime() - created.getTime()) / 86_400_000);

    for (const rule of rules) {
      const { newStatus, reason } = evaluateRule(rule, finding, ageDays, state, links, todayDate);
      if (newStatus !== "pending") {
        await storage.updateFindingStatus(brief.id, newStatus, today, reason);
        results.push({
          briefId: brief.id,
          verb: brief.verb as Verb,
          findingKey: brief.finding_key,
          ruleKind: rule.kind,
          newStatus,
          reason,
          ageDays,
        });
        break;
      }
    }
  }
  return results;
}

interface VaultState {
  notes: Map<string, { wordCount: number; updated: string | null }>;
}

interface ResolvedLinks {
  edges: Set<string>;
}

async function snapshotVaultState(storage: StorageAdapter): Promise<VaultState> {
  const notes = new Map<string, { wordCount: number; updated: string | null }>();
  for await (const n of storage.listNotes()) {
    notes.set(n.relPath, { wordCount: n.wordCount, updated: n.updated });
  }
  return { notes };
}

async function snapshotResolvedLinks(storage: StorageAdapter): Promise<ResolvedLinks> {
  // Storage adapters that surface resolved-link tables expose a `snapshot()`
  // helper (see MemoryStorage). SQL-backed adapters can override this with a
  // SELECT JOIN; for now we treat the absence as "no resolved links yet".
  const edges = new Set<string>();
  const snapStorage = storage as unknown as {
    snapshot?: () => {
      notes: Array<{ id: number; relPath: string }>;
      links: Array<{ fromNoteId: number; targetNoteId: number | null }>;
    };
  };
  if (typeof snapStorage.snapshot === "function") {
    const snap = snapStorage.snapshot();
    const idToPath = new Map(snap.notes.map((n) => [n.id, n.relPath] as const));
    for (const l of snap.links) {
      if (l.targetNoteId === null) continue;
      const a = idToPath.get(l.fromNoteId);
      const b = idToPath.get(l.targetNoteId);
      if (a !== undefined && b !== undefined) edges.add(`${a}|${b}`);
    }
  }
  return { edges };
}

function parseIsoDate(s: string | undefined | null): Date {
  if (!s) return new Date(Number.NaN);
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

function evaluateRule(
  rule: FalsificationRule,
  finding: Record<string, unknown>,
  ageDays: number,
  state: VaultState,
  links: ResolvedLinks,
  todayDate: Date,
): { newStatus: "confirmed" | "falsified" | "pending"; reason: string } {
  void finding;
  const { kind, params } = rule;
  const p = params as Record<string, unknown>;

  switch (kind) {
    case "candidate_deleted": {
      const rel = String(p.rel_path);
      if (!state.notes.has(rel)) {
        return { newStatus: "falsified", reason: `${rel} no longer exists in the vault` };
      }
      return { newStatus: "pending", reason: "" };
    }
    case "candidate_shrinks":
      return { newStatus: "pending", reason: "" };

    case "no_new_validators":
      if (ageDays < Number(p.grace_days)) return { newStatus: "pending", reason: "" };
      return {
        newStatus: "pending",
        reason: "v0: needs manual review (auto-evaluation not implemented)",
      };

    case "still_unlinked": {
      const a = String(p.a);
      const b = String(p.b);
      if (links.edges.has(`${a}|${b}`) || links.edges.has(`${b}|${a}`)) {
        return { newStatus: "confirmed", reason: `you linked ${a} ↔ ${b} — connection confirmed` };
      }
      if (ageDays >= Number(p.grace_days)) {
        return {
          newStatus: "falsified",
          reason: `no link between ${a} and ${b} after ${ageDays}d`,
        };
      }
      return { newStatus: "pending", reason: "" };
    }
    case "either_shrinks":
      return { newStatus: "pending", reason: "" };

    case "neither_edited": {
      const a = state.notes.get(String(p.a));
      const b = state.notes.get(String(p.b));
      if (!a || !b) return { newStatus: "falsified", reason: "one of the notes no longer exists" };
      const grace = Number(p.grace_days);
      if (ageDays < grace) return { newStatus: "pending", reason: "" };
      const cutoff = todayDate.getTime() - grace * 86_400_000;
      const aRecent = a.updated
        ? new Date(`${a.updated.slice(0, 10)}T00:00:00Z`).getTime() >= cutoff
        : false;
      const bRecent = b.updated
        ? new Date(`${b.updated.slice(0, 10)}T00:00:00Z`).getTime() >= cutoff
        : false;
      if (!aRecent && !bRecent) {
        return {
          newStatus: "falsified",
          reason: `neither note edited in ${grace}+d — heuristic false positive`,
        };
      }
      return { newStatus: "pending", reason: "" };
    }

    case "still_in_conflict": {
      const grace = Number(p.grace_days);
      if (ageDays < grace) return { newStatus: "pending", reason: "" };
      const a = state.notes.get(String(p.a));
      const b = state.notes.get(String(p.b));
      if (a && b) {
        return {
          newStatus: "confirmed",
          reason: `both ${p.a} and ${p.b} still exist after ${ageDays}d — unresolved conflict`,
        };
      }
      return { newStatus: "pending", reason: "" };
    }

    case "centroid_deleted": {
      const rel = String(p.rel_path);
      if (!state.notes.has(rel)) {
        return { newStatus: "falsified", reason: `thesis centroid ${rel} no longer exists` };
      }
      return { newStatus: "pending", reason: "" };
    }

    case "cluster_dispersed": {
      const members = (p.member_paths as string[]) ?? [];
      const remaining = members.filter((m) => state.notes.has(m)).length;
      const minRemaining = Number(p.min_remaining ?? 2);
      if (ageDays >= 90 && remaining < minRemaining) {
        return {
          newStatus: "falsified",
          reason: `only ${remaining} of ${members.length} cluster members remain after ${ageDays}d`,
        };
      }
      return { newStatus: "pending", reason: "" };
    }

    case "no_new_rephrasing":
      if (ageDays < Number(p.grace_days ?? 90)) return { newStatus: "pending", reason: "" };
      return {
        newStatus: "pending",
        reason: "v0: needs manual review (auto-evaluation not implemented)",
      };

    case "drift_resolved":
      if (ageDays < Number(p.grace_days ?? 30)) return { newStatus: "pending", reason: "" };
      return {
        newStatus: "pending",
        reason: "v0: re-run `basalt drift` to compare shares (auto-evaluation not implemented)",
      };

    case "structural_change": {
      const logged = new Set((p.projects_at_log as string[]) ?? []);
      if (logged.size === 0) return { newStatus: "pending", reason: "" };
      const projectRe = /^(?:\d+[-_])?Projects\/([^/]+)(?:\/|$)/;
      const current = new Set<string>();
      for (const path of state.notes.keys()) {
        const m = path.match(projectRe);
        if (m && m[1] !== undefined) current.add(m[1]);
      }
      if (current.size === 0) return { newStatus: "pending", reason: "" };
      let intersect = 0;
      for (const proj of current) if (logged.has(proj)) intersect++;
      const union = new Set([...current, ...logged]).size;
      if (union === 0) return { newStatus: "pending", reason: "" };
      const jaccard = intersect / union;
      if (jaccard < 0.75) {
        return {
          newStatus: "falsified",
          reason: `project list changed materially since log time (jaccard ${jaccard.toFixed(2)}); drift was structural, not behavioural`,
        };
      }
      return { newStatus: "pending", reason: "" };
    }

    default:
      return { newStatus: "pending", reason: `unknown rule kind ${kind}` };
  }
}

// ── Track-record summary ──────────────────────────────────────────────────

export interface TrackRecord {
  windowDays: number;
  confirmed: number;
  pending: number;
  falsified: number;
  total: number;
  /** Rounded to 1 decimal place (Python: `round(_, 1)` banker's rounding). */
  confirmedPct: number;
  falsifiedPct: number;
}

export async function trackRecord(
  storage: StorageAdapter,
  days: number,
  today: string,
): Promise<TrackRecord> {
  const cutoff = isoNDaysBefore(today, days);
  const all = await storage.listFindings({ since: cutoff });
  let confirmed = 0;
  let pending = 0;
  let falsified = 0;
  for (const f of all) {
    if (f.status === "confirmed") confirmed++;
    else if (f.status === "pending") pending++;
    else if (f.status === "falsified") falsified++;
  }
  const total = confirmed + pending + falsified;
  const confirmedPct = total > 0 ? round1(100 * (confirmed / total)) : 0;
  const falsifiedPct = total > 0 ? round1(100 * (falsified / total)) : 0;
  return { windowDays: days, confirmed, pending, falsified, total, confirmedPct, falsifiedPct };
}

/** Convert to the `TrackRecordSummary` wire shape (snake_case, schema 1). */
export function toTrackRecordSummary(tr: TrackRecord): TrackRecordSummary {
  return {
    schema: 1,
    window_days: tr.windowDays,
    confirmed: tr.confirmed,
    pending: tr.pending,
    falsified: tr.falsified,
    total: tr.total,
    confirmed_pct: tr.confirmedPct,
    falsified_pct: tr.falsifiedPct,
  };
}

function isoNDaysBefore(today: string, days: number): string {
  const t = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

/** Round to 1 decimal place using banker's rounding (matches Python's `round`). */
function round1(n: number): number {
  const scaled = n * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / 10;
}
