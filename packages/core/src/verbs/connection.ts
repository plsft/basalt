// packages/core/src/verbs/connection.ts
// Connection (C) — SPEC.md §8. Faithful TS port of
// reference/src/basalt/connection.py at tag v0.0.11.

import type { VerbContext } from "../engine";
import { HUB_DENSITY_HARD, hubPenalty } from "../graph/hub-penalty";
import { dot } from "../math/vector";
import { extractClaimQuote } from "../parser/sentences";
import type { ConnectionFinding } from "./types";

// Constants from connection.py:35-38.
export const CONNECTION_DEFAULT_MIN_SIM = 0.78;
export const CONNECTION_MIN_WORD_COUNT = 60;
export const CONNECTION_MAX_PAIRS = 200;

export interface ConnectionOptions {
  topN?: number;
  /** Override the cosine floor. Default 0.78. */
  minSim?: number;
  /** Default true; set false to allow same-top-folder pairs. */
  requireDifferentTopFolder?: boolean;
}

export async function findConnections(
  ctx: VerbContext,
  opts?: ConnectionOptions,
): Promise<ConnectionFinding[]> {
  const topN = opts?.topN ?? ctx.top;
  const minSim = opts?.minSim ?? CONNECTION_DEFAULT_MIN_SIM;
  const crossFolder = opts?.requireDifferentTopFolder ?? true;

  // Pull notes + embeddings.
  const vecById = new Map<number, Float32Array>();
  for await (const e of ctx.storage.listEmbeddings()) vecById.set(e.noteId, e.vec);

  // Eligible candidates: meet word-count + hub filter + have an embedding.
  const eligible = ctx.graph.notes.filter(
    (n) =>
      n.wordCount >= CONNECTION_MIN_WORD_COUNT &&
      (ctx.graph.density.get(n.id) ?? 0) <= HUB_DENSITY_HARD &&
      vecById.has(n.id),
  );
  if (eligible.length < 2) return [];

  // Existing resolved-link set: connection.py:117-123.
  // Both directions excluded — once linked either way, the pair isn't
  // "an idea you didn't realise you'd already connected".
  const linked = new Set<string>();
  for (const l of ctx.graph.links) {
    if (l.targetId === null) continue;
    if (l.fromId === l.targetId) continue;
    const [a, b] = [l.fromId, l.targetId].sort((x, y) => x - y);
    linked.add(`${a}|${b}`);
  }

  // Pairwise enumeration — iu = upper-triangle, k=1.
  interface Pair {
    a: (typeof eligible)[number];
    b: (typeof eligible)[number];
    sim: number;
  }
  const qualifying: Pair[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i]!;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j]!;
      const sim = dot(vecById.get(a.id)!, vecById.get(b.id)!);
      if (sim < minSim) continue;
      const [low, high] = [a.id, b.id].sort((x, y) => x - y);
      if (linked.has(`${low}|${high}`)) continue;
      if (crossFolder && topFolder(a.relPath) === topFolder(b.relPath)) continue;
      qualifying.push({ a, b, sim });
      if (qualifying.length >= CONNECTION_MAX_PAIRS) break;
    }
    if (qualifying.length >= CONNECTION_MAX_PAIRS) break;
  }
  if (qualifying.length === 0) return [];

  // Score + quote per pair.
  interface Scored extends Pair {
    score: number;
    aQuote: string;
    aProv: ReturnType<typeof extractClaimQuote>["provenance"];
    bQuote: string;
    bProv: ReturnType<typeof extractClaimQuote>["provenance"];
    aDensity: number;
    bDensity: number;
  }
  const scored: Scored[] = [];
  for (const p of qualifying) {
    const aDensity = ctx.graph.density.get(p.a.id) ?? 0;
    const bDensity = ctx.graph.density.get(p.b.id) ?? 0;
    const pa = hubPenalty(aDensity);
    const pb = hubPenalty(bDensity);
    const score = p.sim * Math.sqrt(pa * pb);
    const aQ = extractClaimQuote(p.a.content);
    const bQ = extractClaimQuote(p.b.content);
    if (!aQ.quote || !bQ.quote) continue;
    scored.push({
      ...p,
      score,
      aQuote: aQ.quote,
      aProv: aQ.provenance,
      bQuote: bQ.quote,
      bProv: bQ.provenance,
      aDensity,
      bDensity,
    });
  }
  scored.sort((x, y) => y.score - x.score);

  // Diversity: drop a pair if either endpoint already appeared.
  const seen = new Set<number>();
  const out: ConnectionFinding[] = [];
  for (const p of scored) {
    if (seen.has(p.a.id) || seen.has(p.b.id)) continue;
    out.push({
      verb: "connection",
      schema: 1,
      similarity: p.sim,
      score: p.score,
      note_a: {
        rel_path: p.a.relPath,
        title: p.a.title,
        quote: p.aQuote,
        quote_provenance: p.aProv,
        hub_density: p.aDensity,
      },
      note_b: {
        rel_path: p.b.relPath,
        title: p.b.title,
        quote: p.bQuote,
        quote_provenance: p.bProv,
        hub_density: p.bDensity,
      },
    });
    seen.add(p.a.id);
    seen.add(p.b.id);
    if (out.length >= topN) break;
  }
  return out;
}

function topFolder(relPath: string): string {
  const idx = relPath.indexOf("/");
  return idx > 0 ? relPath.slice(0, idx) : "";
}
