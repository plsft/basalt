// Drift v1 — auto-audited.
//
// v0 Drift finds projects whose mention share has shifted across the
// window. v1 re-runs Drift on the *current* window (the trailing N days
// from "today") during `basalt audit` and attaches an auto-verdict to each
// historical Drift finding indicating whether the shift held up.
//
// auto_verdict states:
//   - confirmed: the project is still over/under-worked at ≥ same drift_pct
//   - softened : drift_pct moved back toward 0 by more than 50%
//   - reversed : the project moved past zero in the opposite direction
//   - vanished : the project no longer meets MIN_PROJECTS / mention floors
//
// Unlike Thesis v1 / Contradiction v1, Drift v1 does NOT call an LLM — it's
// purely a re-evaluation against the current window. The name "v1" comes
// from the PRD §2.4 phrasing of the audit step, not from any model use.

import type { VerbContext } from "../engine";
import { type DriftOptions, findDrift } from "./drift";
import type { DriftFinding, ProjectShare } from "./types";

export type DriftVerdict = "confirmed" | "softened" | "reversed" | "vanished";

export interface DriftV1Finding extends DriftFinding {
  auto_verdict: DriftVerdict;
  auto_verdict_pct_now: number | null;
  auto_verdict_evaluated_at: string;
}

/** Compare a historical DriftFinding against the current-window verdict
 *  produced by re-running findDrift. */
export async function auditDrift(
  ctx: VerbContext,
  historical: DriftFinding[],
  opts?: DriftOptions,
): Promise<DriftV1Finding[]> {
  if (historical.length === 0) return [];
  const evaluatedAt = `${ctx.today}T00:00:00Z`;
  const current = await findDrift(ctx, opts);
  // Index current findings' shares by project name for quick lookup.
  const currentByProject = new Map<string, ProjectShare>();
  for (const f of current) {
    for (const s of f.shares) currentByProject.set(s.name, s);
  }

  const out: DriftV1Finding[] = [];
  for (const f of historical) {
    // For each historical finding, the most informative project is the
    // headline_overworked (when present) — that's the one the user was
    // shown. If absent, fall back to headline_underworked. If both are
    // absent, the verdict is "vanished".
    const target = f.headline_overworked ?? f.headline_underworked;
    if (!target) {
      out.push({
        ...f,
        auto_verdict: "vanished",
        auto_verdict_pct_now: null,
        auto_verdict_evaluated_at: evaluatedAt,
      });
      continue;
    }
    const now = currentByProject.get(target.name);
    if (!now) {
      out.push({
        ...f,
        auto_verdict: "vanished",
        auto_verdict_pct_now: null,
        auto_verdict_evaluated_at: evaluatedAt,
      });
      continue;
    }
    const verdict = compareDrift(target.drift_pct, now.drift_pct);
    out.push({
      ...f,
      auto_verdict: verdict,
      auto_verdict_pct_now: now.drift_pct,
      auto_verdict_evaluated_at: evaluatedAt,
    });
  }
  return out;
}

export function compareDrift(historical: number, current: number): DriftVerdict {
  // Sign change: reversed.
  if (historical !== 0 && current !== 0 && Math.sign(historical) !== Math.sign(current)) {
    return "reversed";
  }
  const same = Math.abs(current);
  const before = Math.abs(historical);
  if (before === 0) return current === 0 ? "confirmed" : "softened";
  const ratio = same / before;
  if (ratio < 0.5) return "softened";
  return "confirmed";
}
