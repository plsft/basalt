// packages/cli/src/commands/brief.ts
//
// Generate the Brief. With --llm <provider>, runs the v1 verb augmentations
// (named_thesis on Implicit Thesis; verdict on Contradiction). v0 findings
// always ship; v1 fields are nullable so failures degrade gracefully.

import type { ContradictionFinding, Finding, ImplicitThesisFinding, Verb } from "@basalt/core";
import { findContradictionsV1, findImplicitThesesV1, renderBrief } from "@basalt/core";
import kleur from "kleur";
import { loadConfig } from "../config";
import { resolveLlm } from "../llm";
import { runEngine } from "../runtime";

export async function briefCommand(opts: {
  vault?: string;
  db?: string;
  section?: string;
  top?: string;
  format?: string;
  llm?: string;
  llmModel?: string;
}): Promise<void> {
  const cfg = loadConfig();
  const vault = opts.vault ?? cfg.vault;
  const db = opts.db ?? cfg.dbPath;
  const section = (opts.section ?? "all") as Verb | "all";
  const top = Number.parseInt(opts.top ?? "3", 10);
  const fmt = (opts.format ?? "markdown") as "markdown" | "html" | "json";

  const overrides: { provider?: string; model?: string } = {};
  if (opts.llm !== undefined) overrides.provider = opts.llm;
  if (opts.llmModel !== undefined) overrides.model = opts.llmModel;
  const ai = resolveLlm(cfg, overrides);

  const engine = await runEngine({
    vault,
    db,
    ollamaUrl: cfg.ollamaUrl,
    embeddingModel: cfg.embeddingModel,
  });
  const brief = await engine.brief({ section, top });

  if (ai) {
    const ctx = await engine.verbContext(top);
    if (section === "all" || section === "implicit-thesis") {
      const v1 = await findImplicitThesesV1(ctx, { ai, topN: top });
      if (v1.length > 0) brief.findings.implicit_thesis = v1 as unknown as Finding[];
      const synthesized = (v1 as Array<{ named_thesis: string | null }>).filter(
        (f) => f.named_thesis !== null,
      ).length;
      if (synthesized > 0) {
        console.error(
          kleur.dim(`  ✓ synthesized ${synthesized}/${v1.length} named theses via ${ai.modelId()}`),
        );
      }
    }
    if (section === "all" || section === "contradiction") {
      const v1 = await findContradictionsV1(ctx, { ai });
      if (v1.length > 0) brief.findings.contradiction = v1 as unknown as Finding[];
      const proven = (v1 as Array<{ verdict: string }>).filter(
        (f) => f.verdict === "proven",
      ).length;
      if (v1.length > 0) {
        console.error(
          kleur.dim(
            `  ✓ contradiction verdicts: ${proven} proven / ${v1.length} total via ${ai.modelId()}`,
          ),
        );
      }
    }
  }

  await engine.close();
  process.stdout.write(`${renderBrief(brief, fmt)}\n`);
  if (fmt === "markdown" && ai) {
    appendV1Markdown(brief.findings.implicit_thesis, brief.findings.contradiction);
  }
}

function appendV1Markdown(
  thesis: Finding[] | undefined,
  contradiction: Finding[] | undefined,
): void {
  const lines: string[] = [];
  if (thesis) {
    for (const f of thesis as Array<
      ImplicitThesisFinding & { named_thesis?: string | null; named_thesis_model?: string | null }
    >) {
      if (f.named_thesis) {
        lines.push("");
        lines.push(`> **Implicit Thesis (LLM):** ${f.named_thesis}`);
        if (f.named_thesis_model) lines.push(`> _model: ${f.named_thesis_model}_`);
      }
    }
  }
  if (contradiction) {
    for (const f of contradiction as Array<
      ContradictionFinding & { verdict?: string; verdict_reason?: string }
    >) {
      if (f.verdict && f.verdict !== "undetermined") {
        lines.push("");
        lines.push(`> **Contradiction verdict:** \`${f.verdict}\` — ${f.verdict_reason ?? ""}`);
      }
    }
  }
  if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
}
