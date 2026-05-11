// packages/cli/src/commands/brief.ts

import type { Verb } from "@basalt/core";
import { renderBrief } from "@basalt/core";
import { loadConfig } from "../config";
import { runEngine } from "../runtime";

export async function briefCommand(opts: {
  vault?: string;
  db?: string;
  section?: string;
  top?: string;
  format?: string;
}): Promise<void> {
  const cfg = loadConfig();
  const vault = opts.vault ?? cfg.vault;
  const db = opts.db ?? cfg.dbPath;
  const section = (opts.section ?? "all") as Verb | "all";
  const top = Number.parseInt(opts.top ?? "3", 10);
  const fmt = (opts.format ?? "markdown") as "markdown" | "html" | "json";

  const engine = await runEngine({
    vault,
    db,
    ollamaUrl: cfg.ollamaUrl,
    embeddingModel: cfg.embeddingModel,
  });
  const brief = await engine.brief({ section, top });
  await engine.close();
  process.stdout.write(`${renderBrief(brief, fmt)}\n`);
}
