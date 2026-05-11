// packages/cli/src/commands/index_.ts
// `basalt index` — walks the vault, parses, embeds, persists.

import kleur from "kleur";
import { loadConfig } from "../config";
import { runEngine } from "../runtime";

export async function indexCommand(opts: {
  vault?: string;
  db?: string;
  force?: boolean;
  skipEmbed?: boolean;
}): Promise<void> {
  const cfg = loadConfig();
  const vault = opts.vault ?? cfg.vault;
  const db = opts.db ?? cfg.dbPath;
  const force = opts.force ?? false;
  console.log(kleur.dim(`Indexing ${kleur.bold(vault)} → ${kleur.bold(db)}`));
  const t0 = Date.now();
  const engine = await runEngine({
    vault,
    db,
    ollamaUrl: cfg.ollamaUrl,
    embeddingModel: cfg.embeddingModel,
  });
  await engine.index({ vault, force });
  await engine.close();
  console.log(kleur.green(`✓ indexed in ${((Date.now() - t0) / 1000).toFixed(1)}s`));
  void opts.skipEmbed; // honored via separate flag wiring in TASK-2.3
}
