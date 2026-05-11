// Implicit Thesis v1 — LLM-augmented synthesis on top of the v0 cluster output.
//
// The v0 verb returns clusters: tight neighborhoods of notes with high
// pairwise similarity, a centroid note, member quotes, and a diversity-gate
// pass. v1 keeps all of that AND adds a single English-sentence "thesis" that
// names what the cluster is *about* in the user's voice.
//
// We do NOT change v0's ranking or filtering — v1 is a strict superset.
// Surfaces that opt out of LLM (basalt brief --no-llm, BYOK key unset,
// offline mode) receive v0 output with `named_thesis: null`.
//
// Prompt design rationale:
//   - System message anchors voice: "the author's own words, not a label".
//   - User message includes only the load-bearing quotes per member, in
//     order, with the centroid first — verbatim, no paraphrase.
//   - Temperature 0.4: high enough to produce fluent prose, low enough to
//     stay anchored to the input.
//   - We cap maxTokens at 120 to keep the thesis a single sentence.

import type { AIAdapter } from "../adapters/ai";
import type { VerbContext } from "../engine";
import { findImplicitTheses, type ThesisOptions } from "./thesis";
import type { ImplicitThesisFinding } from "./types";

export interface ThesisV1Options extends ThesisOptions {
  /** Required: the LLM to synthesize with. */
  ai: AIAdapter;
  /** Cap synthesis tokens. Default 120 — single sentence. */
  maxTokens?: number;
}

export interface ImplicitThesisV1Finding extends ImplicitThesisFinding {
  /** v1-only: named, one-sentence thesis written by the LLM. */
  named_thesis: string | null;
  /** Provenance: which model produced the thesis. */
  named_thesis_model: string | null;
}

const SYSTEM_PROMPT = `You read a small set of quotes the same author has written across multiple notes. Your job is to name the through-line they share — in one sentence, in the author's voice, without paraphrasing.

Rules:
- One sentence. No preamble, no quotation marks.
- Stay close to the actual words used; do not invent vocabulary.
- If the quotes do not actually share a single position, say so plainly.
- Never start with "The author" or "This author" — write as if it were the author writing their own through-line.`;

export async function findImplicitThesesV1(
  ctx: VerbContext,
  opts: ThesisV1Options,
): Promise<ImplicitThesisV1Finding[]> {
  const baseFindings = await findImplicitTheses(ctx, opts);
  if (baseFindings.length === 0) return [];

  const maxTokens = opts.maxTokens ?? 120;
  const out: ImplicitThesisV1Finding[] = [];
  for (const finding of baseFindings) {
    const quotes = collectQuotes(finding);
    if (quotes.length === 0) {
      out.push({ ...finding, named_thesis: null, named_thesis_model: null });
      continue;
    }
    try {
      const resp = await opts.ai.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Quotes (centroid first):\n\n${quotes.map((q, i) => `${i + 1}. ${q}`).join("\n\n")}`,
          },
        ],
        temperature: 0.4,
        maxTokens,
      });
      const thesis = resp.content.trim().replace(/^"|"$/g, "");
      out.push({
        ...finding,
        named_thesis: thesis.length > 0 ? thesis : null,
        named_thesis_model: resp.modelId,
      });
    } catch {
      // LLM failures are not fatal — v0 finding still ships.
      out.push({ ...finding, named_thesis: null, named_thesis_model: null });
    }
  }
  return out;
}

function collectQuotes(finding: ImplicitThesisFinding): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  // Centroid first.
  if (finding.centroid?.quote && finding.centroid.quote.length > 0) {
    seen.add(finding.centroid.quote);
    ordered.push(finding.centroid.quote);
  }
  for (const m of finding.members ?? []) {
    if (m.quote && !seen.has(m.quote)) {
      seen.add(m.quote);
      ordered.push(m.quote);
    }
  }
  return ordered;
}
