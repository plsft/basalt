// packages/core/src/verbs/drift.ts
// Drift (Hg) — SPEC.md §7. Faithful TS port of
// reference/src/basalt/drift.py at tag v0.0.11.

import type { VerbContext } from "../engine";
import type { DriftFinding, ProjectShare } from "./types";

// Constants from drift.py:32-35.
export const DRIFT_DEFAULT_WINDOW_DAYS = 30;
export const DRIFT_MIN_PROJECTS = 2;
export const DRIFT_MIN_DAILY_NOTES = 3;
export const DRIFT_HEADLINE_PP = 5.0;

// drift.py:38 + :40
const PROJECT_PATH_RE = /^(?:\d+[-_])?Projects\/([^/]+)(?:\/|$)/;
const DAILY_FILENAME_RE = /^.*?(\d{4}-\d{2}-\d{2}).*\.md$/;

export interface DriftOptions {
  topN?: number;
  windowDays?: number;
}

export async function findDrift(ctx: VerbContext, opts?: DriftOptions): Promise<DriftFinding[]> {
  const topN = opts?.topN ?? ctx.top;
  const windowDays = opts?.windowDays ?? DRIFT_DEFAULT_WINDOW_DAYS;
  const todayDate = new Date(`${ctx.today.slice(0, 10)}T00:00:00Z`);
  const cutoff = new Date(todayDate.getTime() - windowDays * 86_400_000);

  // 1. Project counts (stated priority).
  const projectNotes = new Map<string, number>();
  for (const n of ctx.graph.notes) {
    const m = n.relPath.match(PROJECT_PATH_RE);
    if (m && m[1] !== undefined) {
      projectNotes.set(m[1], (projectNotes.get(m[1]) ?? 0) + 1);
    }
  }
  if (projectNotes.size < DRIFT_MIN_PROJECTS) return [];

  // 2. Daily notes in window.
  interface DailyNote {
    content: string;
    date: Date | null;
  }
  const dailies: DailyNote[] = [];
  for (const n of ctx.graph.notes) {
    const tagsCsv = (n.tags ?? []).join(",").toLowerCase();
    const isDaily = tagsCsv.includes("daily");
    const filename = n.relPath.split("/").pop() ?? "";
    const filenameMatch = filename.match(DAILY_FILENAME_RE);
    let date: Date | null = null;
    if (filenameMatch && filenameMatch[1] !== undefined) {
      const d = new Date(`${filenameMatch[1]}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) date = d;
    }
    if (!isDaily && !filenameMatch) continue;
    if (date !== null && date.getTime() < cutoff.getTime()) continue;
    dailies.push({ content: n.content, date });
  }
  if (dailies.length < DRIFT_MIN_DAILY_NOTES) return [];

  // 3. Mention regex — sort names by length desc so longer names win.
  const sortedNames = Array.from(projectNotes.keys()).sort((a, b) => b.length - a.length);
  const escaped = sortedNames.map((n) => escapeRegex(n)).filter((n) => n.length > 0);
  const mentionRe =
    escaped.length > 0
      ? new RegExp(`(?<![A-Za-z0-9])(${escaped.join("|")})(?![A-Za-z0-9])`, "gi")
      : /a^/g; // never matches

  const canonicalCase = new Map(Array.from(projectNotes.keys()).map((n) => [n.toLowerCase(), n]));
  const mentionCounts = new Map<string, number>();
  for (const name of projectNotes.keys()) mentionCounts.set(name, 0);

  for (const d of dailies) {
    if (escaped.length === 0) break;
    for (const match of d.content.matchAll(mentionRe)) {
      const captured = match[1];
      if (captured === undefined) continue;
      const canonical = canonicalCase.get(captured.toLowerCase());
      if (canonical) mentionCounts.set(canonical, (mentionCounts.get(canonical) ?? 0) + 1);
    }
  }

  const totalStated = Array.from(projectNotes.values()).reduce((a, b) => a + b, 0) || 1;
  const totalLived = Array.from(mentionCounts.values()).reduce((a, b) => a + b, 0);
  if (totalLived === 0) return [];

  // 4. Shares + ranks.
  const statedSorted = Array.from(projectNotes.entries()).sort((a, b) => b[1] - a[1]);
  const livedSorted = Array.from(mentionCounts.entries()).sort((a, b) => b[1] - a[1]);
  const statedRank = new Map(statedSorted.map(([name], i) => [name, i + 1] as const));
  const livedRank = new Map(livedSorted.map(([name], i) => [name, i + 1] as const));

  const shares: ProjectShare[] = [];
  for (const [name, statedN] of projectNotes) {
    const statedShare = statedN / totalStated;
    const livedN = mentionCounts.get(name) ?? 0;
    const livedShare = livedN / totalLived;
    shares.push({
      name,
      stated_notes: statedN,
      stated_share: statedShare,
      stated_rank: statedRank.get(name) ?? 0,
      lived_mentions: livedN,
      lived_share: livedShare,
      lived_rank: livedRank.get(name) ?? 0,
      drift_pct: (livedShare - statedShare) * 100,
    });
  }
  shares.sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct));

  // 5. Headline picks at ±5pp.
  const overworked = shares.find((s) => s.drift_pct > DRIFT_HEADLINE_PP) ?? null;
  const underworked = shares.find((s) => s.drift_pct < -DRIFT_HEADLINE_PP) ?? null;
  if (overworked === null && underworked === null) return [];

  const score = shares.reduce((acc, s) => Math.max(acc, Math.abs(s.drift_pct)), 0);

  const finding: DriftFinding = {
    verb: "drift",
    schema: 1,
    version: "v0",
    window_days: windowDays,
    daily_note_count: dailies.length,
    project_count: projectNotes.size,
    total_mentions: totalLived,
    score,
    headline_overworked: overworked,
    headline_underworked: underworked,
    shares,
  };
  return [finding].slice(0, Math.max(1, topN));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
