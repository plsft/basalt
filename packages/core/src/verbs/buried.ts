// packages/core/src/verbs/buried.ts
// Buried Insight (Au) — SPEC.md §9. Faithful TS port of
// reference/src/basalt/buried.py:421-659 at tag v0.0.11.
//
// Returns the strongest dormant-but-still-relevant note(s) in the vault.

import type { VerbContext } from "../engine";
import { HUB_DENSITY_HARD, hubDensity, hubPenalty } from "../graph/hub-penalty";
import {
  computeVaultAgeDays,
  computeVaultAwareThresholds,
  DEFAULT_MIN_AGE_DAYS,
  DEFAULT_MIN_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
} from "../math/thresholds";
import { dot } from "../math/vector";
import { extractClaimQuote } from "../parser/sentences";
import type { BuriedInsightFinding } from "./types";

// Constants from buried.py:24-31, :141-142.
export const MIN_VALIDATORS = 3;
export const BURIED_MIN_SIM = 0.62;
export const TOP_K_VALIDATORS = 5;
export const BURIED_MIN_WORD_COUNT = 30;
export const MIN_BODY_FOR_QUOTE = 80;

export interface BuriedOptions {
  /** Override the default top-N. */
  topN?: number;
  /** Skip the vault-age-aware threshold derivation; use static defaults. */
  vaultAware?: boolean;
}

export async function findBuriedInsights(
  ctx: VerbContext,
  opts?: BuriedOptions,
): Promise<BuriedInsightFinding[]> {
  const topN = opts?.topN ?? ctx.top;
  const vaultAware = opts?.vaultAware ?? true;

  const today = ctx.today;
  const todayDate = parseIsoUtc(today);

  // Derive thresholds.
  let thresholds: { min_age_days: number; min_dormant_days: number; recent_window_days: number };
  let vaultAgeDays: number;
  if (vaultAware) {
    vaultAgeDays = computeVaultAgeDays(
      ctx.graph.notes.map((n) => n.created),
      today,
    );
    const t = computeVaultAwareThresholds(vaultAgeDays);
    thresholds = {
      min_age_days: t.min_age_days,
      min_dormant_days: t.min_dormant_days,
      recent_window_days: t.recent_window_days,
    };
  } else {
    vaultAgeDays = computeVaultAgeDays(
      ctx.graph.notes.map((n) => n.created),
      today,
    );
    thresholds = {
      min_age_days: DEFAULT_MIN_AGE_DAYS,
      min_dormant_days: DEFAULT_MIN_DORMANT_DAYS,
      recent_window_days: DEFAULT_RECENT_WINDOW_DAYS,
    };
  }

  const ageCutoff = subDays(todayDate, thresholds.min_age_days);
  const dormantCutoff = subDays(todayDate, thresholds.min_dormant_days);
  const recentCutoff = subDays(todayDate, thresholds.recent_window_days);

  // Load embeddings keyed by note id.
  const vecById = new Map<number, Float32Array>();
  for await (const e of ctx.storage.listEmbeddings()) {
    vecById.set(e.noteId, e.vec);
  }

  // Candidate filter (buried.py:502-508).
  const recentIds: number[] = [];
  const candidateIds: number[] = [];
  for (const n of ctx.graph.notes) {
    if (n.wordCount < BURIED_MIN_WORD_COUNT) continue;
    const updated = parseIsoUtcOrNull(n.updated);
    const created = parseIsoUtcOrNull(n.created);

    if (updated && updated.getTime() >= recentCutoff.getTime()) {
      recentIds.push(n.id);
    }
    if (
      created &&
      updated &&
      created.getTime() <= ageCutoff.getTime() &&
      updated.getTime() <= dormantCutoff.getTime() &&
      (ctx.graph.density.get(n.id) ?? 0) <= HUB_DENSITY_HARD
    ) {
      candidateIds.push(n.id);
    }
  }
  if (candidateIds.length === 0 || recentIds.length === 0) return [];

  // Inbound-recent count + ids per candidate (from links table — graph
  // already has resolved link targets via buildLinkGraph).
  const inboundRecentCount = new Map<number, number>();
  const inboundRecentIds = new Map<number, Set<number>>();
  const candidateSet = new Set(candidateIds);
  const recentSet = new Set(recentIds);
  for (const link of ctx.graph.links) {
    if (link.targetId === null) continue;
    if (!candidateSet.has(link.targetId)) continue;
    if (!recentSet.has(link.fromId)) continue;
    inboundRecentCount.set(link.targetId, (inboundRecentCount.get(link.targetId) ?? 0) + 1);
    if (!inboundRecentIds.has(link.targetId)) inboundRecentIds.set(link.targetId, new Set());
    inboundRecentIds.get(link.targetId)!.add(link.fromId);
  }

  // Semantic validators per candidate (buried.py:530-548).
  const semantic = new Map<number, Array<{ id: number; sim: number }>>();
  const recentVecs = recentIds
    .map((id) => ({ id, vec: vecById.get(id) }))
    .filter((x): x is { id: number; vec: Float32Array } => x.vec !== undefined);

  for (const cid of candidateIds) {
    const cv = vecById.get(cid);
    if (!cv) continue;
    const hits: Array<{ id: number; sim: number }> = [];
    for (const r of recentVecs) {
      const s = dot(cv, r.vec);
      if (s >= BURIED_MIN_SIM) hits.push({ id: r.id, sim: s });
    }
    if (hits.length === 0) continue;
    hits.sort((a, b) => b.sim - a.sim);
    semantic.set(cid, hits.slice(0, TOP_K_VALIDATORS));
  }

  // Score each candidate (buried.py:551-589).
  interface Cand {
    id: number;
    score: number;
    explicit: number;
    sem: Array<{ id: number; sim: number }>;
    density: number;
    penalty: number;
  }
  const scored: Cand[] = [];
  for (const cid of candidateIds) {
    const note = ctx.graph.notesById.get(cid);
    if (!note) continue;
    const explicit = inboundRecentCount.get(cid) ?? 0;
    const sem = semantic.get(cid) ?? [];
    const explicitIds = inboundRecentIds.get(cid) ?? new Set<number>();
    const allValidators = new Set<number>([...explicitIds, ...sem.map((s) => s.id)]);
    if (allValidators.size < MIN_VALIDATORS) continue;
    const semScore = sem.reduce((acc, s) => acc + s.sim, 0);
    const updated = parseIsoUtcOrNull(note.updated);
    const ageBonus = updated
      ? (0.05 * Math.floor((todayDate.getTime() - updated.getTime()) / 86_400_000)) / 30
      : 0;
    const rawScore = explicit * 2.0 + semScore + ageBonus;
    const density = hubDensity(ctx.graph.outLinkCount.get(cid) ?? 0, note.wordCount);
    const penalty = hubPenalty(density);
    scored.push({ id: cid, score: rawScore * penalty, explicit, sem, density, penalty });
  }
  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score);

  // Materialize top-N findings (buried.py:595-636).
  const out: BuriedInsightFinding[] = [];
  for (const cand of scored) {
    if (out.length >= topN) break;
    const note = ctx.graph.notesById.get(cand.id);
    if (!note) continue;
    if (note.content.length < MIN_BODY_FOR_QUOTE) continue;
    const { quote, provenance } = extractClaimQuote(note.content);
    if (!quote) continue;

    // Validators — explicit first (sim=1), then semantic; sort by
    // (-explicit, -sim, updated asc), capped at TOP_K_VALIDATORS.
    interface Validator {
      id: number;
      relPath: string;
      title: string;
      updated: string | null;
      sim: number;
      explicitLink: boolean;
    }
    const validators: Validator[] = [];
    const seen = new Set<number>();
    for (const vid of inboundRecentIds.get(cand.id) ?? new Set<number>()) {
      if (seen.has(vid)) continue;
      seen.add(vid);
      const v = ctx.graph.notesById.get(vid);
      if (!v) continue;
      validators.push({
        id: vid,
        relPath: v.relPath,
        title: v.title,
        updated: v.updated,
        sim: 1,
        explicitLink: true,
      });
    }
    for (const s of cand.sem) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const v = ctx.graph.notesById.get(s.id);
      if (!v) continue;
      validators.push({
        id: s.id,
        relPath: v.relPath,
        title: v.title,
        updated: v.updated,
        sim: s.sim,
        explicitLink: false,
      });
    }
    validators.sort((a, b) => {
      const e = Number(b.explicitLink) - Number(a.explicitLink);
      if (e !== 0) return e;
      const s = b.sim - a.sim;
      if (s !== 0) return s;
      return (a.updated ?? "").localeCompare(b.updated ?? "");
    });
    const validatorOutput = validators.slice(0, TOP_K_VALIDATORS).map((v) => ({
      rel_path: v.relPath,
      title: v.title,
      updated: v.updated,
      explicit_link: v.explicitLink,
      similarity: v.sim,
    }));

    out.push({
      verb: "buried-insight",
      schema: 1,
      rel_path: note.relPath,
      title: note.title,
      stem: note.stem,
      created: note.created ?? "",
      updated: note.updated ?? "",
      word_count: note.wordCount,
      score: cand.score,
      hub_density: cand.density,
      hub_penalty: cand.penalty,
      inbound_recent_count: cand.explicit,
      quote,
      quote_provenance: provenance,
      vault_age_days: vaultAgeDays,
      thresholds,
      validators: validatorOutput,
    });
  }
  return out;
}

function parseIsoUtc(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

function parseIsoUtcOrNull(s: string | null): Date | null {
  if (!s) return null;
  const d = parseIsoUtc(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function subDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 86_400_000);
}
