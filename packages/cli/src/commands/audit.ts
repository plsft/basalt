// packages/cli/src/commands/audit.ts

import kleur from "kleur";
import { loadConfig } from "../config";
import { runEngine } from "../runtime";

export async function auditCommand(opts: { vault?: string; db?: string }): Promise<void> {
  const cfg = loadConfig();
  const vault = opts.vault ?? cfg.vault;
  const db = opts.db ?? cfg.dbPath;
  const engine = await runEngine({
    vault,
    db,
    ollamaUrl: cfg.ollamaUrl,
    embeddingModel: cfg.embeddingModel,
  });
  const results = await engine.audit();
  await engine.close();
  if (results.length === 0) {
    console.log(kleur.dim("No pending briefs changed state."));
    return;
  }
  for (const r of results) {
    const tag = r.newStatus === "confirmed" ? kleur.green : kleur.red;
    console.log(`${tag(r.newStatus)} ${r.findingKey} — ${r.reason}`);
  }
  console.log(kleur.dim(`${results.length} brief(s) updated.`));
}
