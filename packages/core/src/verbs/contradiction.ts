// packages/core/src/verbs/contradiction.ts
// Contradiction (Cl) — SPEC.md §6. Faithful TS port of
// reference/src/basalt/contradiction.py at tag v0.0.11.

import type { VerbContext } from "../engine";
import { HUB_DENSITY_HARD, hubPenalty } from "../graph/hub-penalty";
import { dot } from "../math/vector";
import { extractClaimQuote, stripMarkdown } from "../parser/sentences";
import type { ContradictionFinding } from "./types";

// Constants from contradiction.py:39-42.
export const CONTRADICTION_DEFAULT_MIN_SIM = 0.72;
export const CONTRADICTION_MIN_WORD_COUNT = 60;
export const CONTRADICTION_MAX_PAIRS = 200;

// contradiction.py:53-58 — _NEGATION
const NEGATION =
  /\b(isn't|aren't|wasn't|weren't|doesn't|don't|won't|can't|shouldn't|wouldn't|hasn't|haven't|never|no\s+longer|not\s+(just|merely|only|simply|enough|the|a))\b/i;

// contradiction.py:62-69 — _REVERSAL
const REVERSAL =
  /\b(actually|in\s+fact|turns?\s+out|on\s+reflection|i\s+was\s+wrong|i\s+changed\s+my\s+mind|the\s+opposite|opposite\s+is\s+true|contrary|nevertheless|however|but\s+actually|updated|revisited|second\s+thoughts|reconsider)\b/i;

// contradiction.py:74-96 — _POLARITY_PAIRS (verbatim, 21 pairs)
export const POLARITY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["works", "doesn't work"],
  ["works", "broken"],
  ["worth it", "not worth"],
  ["buy", "sell"],
  ["ship", "kill"],
  ["ship", "shelve"],
  ["keep", "drop"],
  ["validated", "invalidated"],
  ["validated", "failed"],
  ["scales", "doesn't scale"],
  ["profitable", "unprofitable"],
  ["profitable", "loses money"],
  ["rising", "falling"],
  ["up", "down"],
  ["bullish", "bearish"],
  ["succeed", "fail"],
  ["right", "wrong"],
  ["true", "false"],
  ["possible", "impossible"],
  ["simple", "complex"],
  ["safe", "risky"],
];

export interface ContradictionEvidence {
  score: number;
  signals: string[];
}

/** Evidence scorer. SPEC.md §6.3 / contradiction.py:128-172.
 *  score in [0, 3.0]; signals is the human-readable list of evidence labels. */
export function contradictionEvidence(quoteA: string, quoteB: string): ContradictionEvidence {
  const a = stripMarkdown(quoteA ?? "").toLowerCase();
  const b = stripMarkdown(quoteB ?? "").toLowerCase();
  if (a.length === 0 || b.length === 0) return { score: 0, signals: [] };

  let score = 0;
  const signals: string[] = [];

  // Asymmetric negation
  const aNeg = NEGATION.test(a);
  const bNeg = NEGATION.test(b);
  if (aNeg !== bNeg) {
    score += 1.0;
    signals.push("asymmetric negation");
  }

  // Asymmetric reversal
  const aRev = REVERSAL.test(a);
  const bRev = REVERSAL.test(b);
  if (aRev !== bRev) {
    score += 1.2;
    signals.push("asymmetric reversal marker");
  }

  // Polarity pairs — substring semantics (matches Python `pos in a`).
  const fired: string[] = [];
  for (const [pos, neg] of POLARITY_PAIRS) {
    const aPos = a.includes(pos);
    const aNegPhrase = a.includes(neg);
    const bPos = b.includes(pos);
    const bNegPhrase = b.includes(neg);
    if ((aPos && bNegPhrase) || (aNegPhrase && bPos)) {
      fired.push(`'${pos}' ↔ '${neg}'`);
    }
  }
  if (fired.length > 0) {
    score += Math.min(0.8 * fired.length, 1.6);
    signals.push(`polarity-pair: ${fired.join("; ")}`);
  }

  return { score, signals };
}

export interface ContradictionOptions {
  topN?: number;
  minSim?: number;
}

export async function findContradictions(
  ctx: VerbContext,
  opts?: ContradictionOptions,
): Promise<ContradictionFinding[]> {
  const topN = opts?.topN ?? ctx.top;
  const minSim = opts?.minSim ?? CONTRADICTION_DEFAULT_MIN_SIM;

  const vecById = new Map<number, Float32Array>();
  for await (const e of ctx.storage.listEmbeddings()) vecById.set(e.noteId, e.vec);

  const eligible = ctx.graph.notes.filter(
    (n) =>
      n.wordCount >= CONTRADICTION_MIN_WORD_COUNT &&
      (ctx.graph.density.get(n.id) ?? 0) <= HUB_DENSITY_HARD &&
      vecById.has(n.id),
  );
  if (eligible.length < 2) return [];

  // Pair pre-filter on similarity.
  interface Pair {
    a: (typeof eligible)[number];
    b: (typeof eligible)[number];
    sim: number;
  }
  const qualifying: Pair[] = [];
  outer: for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i]!;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j]!;
      const sim = dot(vecById.get(a.id)!, vecById.get(b.id)!);
      if (sim < minSim) continue;
      qualifying.push({ a, b, sim });
      if (qualifying.length >= CONTRADICTION_MAX_PAIRS) break outer;
    }
  }
  if (qualifying.length === 0) return [];

  // Per-pair: extract quotes, compute evidence, score.
  interface Scored extends Pair {
    aQuote: string;
    aProv: ReturnType<typeof extractClaimQuote>["provenance"];
    bQuote: string;
    bProv: ReturnType<typeof extractClaimQuote>["provenance"];
    contradiction_score: number;
    signals: string[];
    score: number;
  }
  const quoteCache = new Map<number, ReturnType<typeof extractClaimQuote>>();
  const quoteOf = (id: number, content: string) => {
    let q = quoteCache.get(id);
    if (!q) {
      q = extractClaimQuote(content);
      quoteCache.set(id, q);
    }
    return q;
  };
  const scored: Scored[] = [];
  for (const p of qualifying) {
    const aQ = quoteOf(p.a.id, p.a.content);
    const bQ = quoteOf(p.b.id, p.b.content);
    if (!aQ.quote || !bQ.quote) continue;
    const ev = contradictionEvidence(aQ.quote, bQ.quote);
    if (ev.score <= 0) continue;
    const pa = hubPenalty(ctx.graph.density.get(p.a.id) ?? 0);
    const pb = hubPenalty(ctx.graph.density.get(p.b.id) ?? 0);
    const rank = p.sim * ev.score * Math.sqrt(pa * pb);
    scored.push({
      ...p,
      aQuote: aQ.quote,
      aProv: aQ.provenance,
      bQuote: bQ.quote,
      bProv: bQ.provenance,
      contradiction_score: ev.score,
      signals: ev.signals,
      score: rank,
    });
  }
  scored.sort((x, y) => y.score - x.score);

  // Diversity pass — same as connection.
  const seen = new Set<number>();
  const out: ContradictionFinding[] = [];
  for (const p of scored) {
    if (seen.has(p.a.id) || seen.has(p.b.id)) continue;
    out.push({
      verb: "contradiction",
      schema: 1,
      version: "v0-heuristic",
      topical_similarity: p.sim,
      contradiction_score: p.contradiction_score,
      score: p.score,
      signals: p.signals,
      note_a: {
        rel_path: p.a.relPath,
        title: p.a.title,
        quote: p.aQuote,
        quote_provenance: p.aProv,
      },
      note_b: {
        rel_path: p.b.relPath,
        title: p.b.title,
        quote: p.bQuote,
        quote_provenance: p.bProv,
      },
    });
    seen.add(p.a.id);
    seen.add(p.b.id);
    if (out.length >= topN) break;
  }
  return out;
}
