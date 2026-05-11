// Contradiction v1 — LLM verdict on top of the v0 heuristic.
//
// v0 finds pairs of quotes that look like contradictions by lexical signal
// (negation, reversal, polarity-pair). v1 asks an LLM whether the pair is
// *actually* in contradiction or merely overlapping in topic.
//
// Verdict states:
//   - proven      : the LLM judges the pair as genuinely contradictory
//   - apparent    : the LLM judges it as topical overlap, not real conflict
//   - undetermined: the LLM declined (output didn't match the expected JSON)
//
// We do not drop v0 findings — every v0 pair still ships. v1 just decorates
// each with `verdict` + `verdict_reason` so the surface can color them.

import type { AIAdapter } from "../adapters/ai";
import type { VerbContext } from "../engine";
import { type ContradictionOptions, findContradictions } from "./contradiction";
import type { ContradictionFinding } from "./types";

export type ContradictionVerdict = "proven" | "apparent" | "undetermined";

export interface ContradictionV1Options extends ContradictionOptions {
  /** Required: the LLM to query. */
  ai: AIAdapter;
  /** Cap verdict tokens. Default 80. */
  maxTokens?: number;
}

export interface ContradictionV1Finding extends ContradictionFinding {
  verdict: ContradictionVerdict;
  verdict_reason: string;
  verdict_model: string | null;
}

const SYSTEM_PROMPT = `You are evaluating whether two short quotes from the same author's notes actually contradict each other.

Return a single JSON object on one line, no prose:
{"verdict":"proven","reason":"short explanation"} OR {"verdict":"apparent","reason":"short explanation"}

- "proven" means a reader of both quotes would conclude the author has changed position, taken opposing stances, or contradicted themselves.
- "apparent" means the quotes mention overlapping topics but do not actually disagree (rhetorical framing, partial scope, different context, etc.).
- Keep the reason under 25 words.`;

export async function findContradictionsV1(
  ctx: VerbContext,
  opts: ContradictionV1Options,
): Promise<ContradictionV1Finding[]> {
  const base = await findContradictions(ctx, opts);
  if (base.length === 0) return [];

  const maxTokens = opts.maxTokens ?? 80;
  const out: ContradictionV1Finding[] = [];
  for (const f of base) {
    try {
      const resp = await opts.ai.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Quote A (${f.note_a.rel_path}):\n${f.note_a.quote}\n\n` +
              `Quote B (${f.note_b.rel_path}):\n${f.note_b.quote}\n\n` +
              `Heuristic signals fired: ${f.signals.join("; ")}`,
          },
        ],
        temperature: 0.2,
        maxTokens,
      });
      const parsed = parseVerdict(resp.content);
      out.push({
        ...f,
        verdict: parsed.verdict,
        verdict_reason: parsed.reason,
        verdict_model: resp.modelId,
      });
    } catch {
      out.push({
        ...f,
        verdict: "undetermined",
        verdict_reason: "llm-failed",
        verdict_model: null,
      });
    }
  }
  return out;
}

function parseVerdict(raw: string): { verdict: ContradictionVerdict; reason: string } {
  // Find a JSON-like substring anywhere in the response (some models wrap in
  // backticks or add a leading sentence).
  const match = raw.match(/\{[^}]*"verdict"\s*:\s*"(proven|apparent)"[^}]*\}/i);
  if (!match) return { verdict: "undetermined", reason: "no_json_found" };
  try {
    const obj = JSON.parse(match[0]) as { verdict?: string; reason?: string };
    if (obj.verdict === "proven" || obj.verdict === "apparent") {
      return { verdict: obj.verdict, reason: typeof obj.reason === "string" ? obj.reason : "" };
    }
    return { verdict: "undetermined", reason: "verdict_not_recognized" };
  } catch {
    return { verdict: "undetermined", reason: "json_parse_failed" };
  }
}
