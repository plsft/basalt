// packages/core/src/verbs/thesis.ts
// Implicit Thesis (Na) — SPEC.md §5. Faithful TS port of
// reference/src/basalt/implicit_thesis.py at tag v0.0.11.

import type { VerbContext } from "../engine";
import { tightNeighborhoods } from "../graph/cliques";
import { HUB_DENSITY_HARD, hubPenalty } from "../graph/hub-penalty";
import { extractClaimQuote } from "../parser/sentences";
import type { ImplicitThesisFinding } from "./types";

// Constants from implicit_thesis.py:40-46.
export const THESIS_DEFAULT_MIN_SIM = 0.72;
export const THESIS_MIN_CLUSTER_SIZE = 3;
export const THESIS_MIN_WORD_COUNT = 60;
export const THESIS_MAX_CLUSTERS_PROBED = 200;
export const THESIS_MAX_CLUSTER_SIZE = 15;
export const THESIS_DIVERSITY_FOLDERS = 2;
export const THESIS_DIVERSITY_SPAN_DAYS = 30;

export interface ThesisOptions {
  topN?: number;
  minSim?: number;
  minClusterSize?: number;
}

export async function findImplicitTheses(
  ctx: VerbContext,
  opts?: ThesisOptions,
): Promise<ImplicitThesisFinding[]> {
  const topN = opts?.topN ?? ctx.top;
  const minSim = opts?.minSim ?? THESIS_DEFAULT_MIN_SIM;
  const minClusterSize = opts?.minClusterSize ?? THESIS_MIN_CLUSTER_SIZE;

  const vecById = new Map<number, Float32Array>();
  for await (const e of ctx.storage.listEmbeddings()) vecById.set(e.noteId, e.vec);

  const eligible = ctx.graph.notes.filter(
    (n) =>
      n.wordCount >= THESIS_MIN_WORD_COUNT &&
      (ctx.graph.density.get(n.id) ?? 0) <= HUB_DENSITY_HARD &&
      vecById.has(n.id),
  );
  if (eligible.length < minClusterSize) return [];

  // Pairwise similarity matrix (with diagonal masked at -1).
  const n = eligible.length;
  const sims = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const vi = vecById.get(eligible[i]!.id)!;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        sims[i * n + j] = -1;
        continue;
      }
      const vj = vecById.get(eligible[j]!.id)!;
      let s = 0;
      for (let k = 0; k < vi.length; k++) s += (vi[k] ?? 0) * (vj[k] ?? 0);
      sims[i * n + j] = s;
    }
  }

  const rawClusters = tightNeighborhoods(sims, n, minSim, minClusterSize, THESIS_MAX_CLUSTER_SIZE);
  if (rawClusters.length === 0) return [];

  interface ClusterScored {
    members: typeof eligible;
    centroidIdx: number;
    centroidLocal: number;
    folderDiversity: number;
    spanDays: number;
    meanSimilarity: number;
    score: number;
    quotes: Array<ReturnType<typeof extractClaimQuote>>;
  }
  const clusters: ClusterScored[] = [];

  for (const { memberIdxs } of rawClusters.slice(0, THESIS_MAX_CLUSTERS_PROBED)) {
    const members = memberIdxs.map((i) => eligible[i]!);

    // Centroid: highest mean similarity to other members.
    let centroidLocal = 0;
    let centroidMean = -Number.POSITIVE_INFINITY;
    for (let i = 0; i < memberIdxs.length; i++) {
      let sum = 0;
      let valid = 0;
      for (let j = 0; j < memberIdxs.length; j++) {
        if (i === j) continue;
        const s = sims[memberIdxs[i]! * n + memberIdxs[j]!] ?? 0;
        if (s > -0.5) {
          sum += s;
          valid++;
        }
      }
      const mean = sum / Math.max(valid, 1);
      if (mean > centroidMean) {
        centroidMean = mean;
        centroidLocal = i;
      }
    }
    const centroidIdx = memberIdxs[centroidLocal]!;

    // Mean intra-cluster similarity (upper triangle).
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i < memberIdxs.length; i++) {
      for (let j = i + 1; j < memberIdxs.length; j++) {
        const s = sims[memberIdxs[i]! * n + memberIdxs[j]!] ?? 0;
        if (s > -0.5) {
          pairSum += s;
          pairCount++;
        }
      }
    }
    const meanSimilarity = pairCount > 0 ? pairSum / pairCount : 0;

    // Folder diversity + span days.
    const folders = new Set<string>();
    let minDate = Number.POSITIVE_INFINITY;
    let maxDate = Number.NEGATIVE_INFINITY;
    for (const m of members) {
      const f = topFolder(m.relPath);
      if (f.length > 0) folders.add(f);
      for (const dStr of [m.created, m.updated]) {
        if (!dStr) continue;
        const d = new Date(`${dStr.slice(0, 10)}T00:00:00Z`).getTime();
        if (Number.isNaN(d)) continue;
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
    }
    const folderDiversity = folders.size;
    const spanDays =
      Number.isFinite(minDate) && Number.isFinite(maxDate)
        ? Math.floor((maxDate - minDate) / 86_400_000)
        : 0;

    // Diversity gate: ≥2 folders OR ≥30d span.
    if (folderDiversity < THESIS_DIVERSITY_FOLDERS && spanDays < THESIS_DIVERSITY_SPAN_DAYS) {
      continue;
    }

    // Quotes per member; if centroid quote is empty, drop the cluster.
    const quotes = members.map((m) => extractClaimQuote(m.content));
    if (!quotes[centroidLocal] || quotes[centroidLocal]!.quote.length === 0) continue;

    // Score: cluster_size × diversity × log(span+1) × mean_sim × hub_pen_mean.
    const sizeFactor = members.length;
    const diversityFactor = folderDiversity >= 2 ? folderDiversity : 1;
    const spanFactor = spanDays > 0 ? Math.log(spanDays + 1) : 1;
    const hubPenMean =
      members.map((m) => hubPenalty(ctx.graph.density.get(m.id) ?? 0)).reduce((a, b) => a + b, 0) /
      members.length;
    const score = meanSimilarity * sizeFactor * diversityFactor * spanFactor * hubPenMean;

    clusters.push({
      members,
      centroidIdx,
      centroidLocal,
      folderDiversity,
      spanDays,
      meanSimilarity,
      score,
      quotes,
    });
  }
  if (clusters.length === 0) return [];
  clusters.sort((a, b) => b.score - a.score);

  const out: ImplicitThesisFinding[] = [];
  for (const c of clusters.slice(0, topN)) {
    const centroidNote = c.members[c.centroidLocal]!;
    const centroidQuote = c.quotes[c.centroidLocal]!;
    out.push({
      verb: "implicit-thesis",
      schema: 1,
      version: "v0-cluster",
      score: c.score,
      cluster_size: c.members.length,
      folder_diversity: c.folderDiversity,
      span_days: c.spanDays,
      mean_similarity: c.meanSimilarity,
      centroid: {
        rel_path: centroidNote.relPath,
        title: centroidNote.title,
        quote: centroidQuote.quote,
        quote_provenance: centroidQuote.provenance,
      },
      members: c.members.map((m, i) => ({
        rel_path: m.relPath,
        title: m.title,
        folder: topFolder(m.relPath),
        quote: c.quotes[i]?.quote ?? "",
        quote_provenance: c.quotes[i]?.provenance ?? "empty",
      })),
    });
  }
  return out;
}

function topFolder(relPath: string): string {
  const idx = relPath.indexOf("/");
  return idx > 0 ? relPath.slice(0, idx) : "";
}
