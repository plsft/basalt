// packages/cli/src/commands/config_show.ts
// `basalt config show` — print the resolved CLI config. Mirror of Python's
// `basalt config show` (reference/src/basalt/wizard.py).

import { existsSync } from "node:fs";
import kleur from "kleur";
import { defaultConfigPath, loadConfig } from "../config";

export function configShowCommand(): void {
  const path = defaultConfigPath();
  const present = existsSync(path);
  const cfg = loadConfig();

  console.log(kleur.bold("Basalt config"));
  console.log(kleur.dim(`  source: ${path}${present ? "" : " (defaults — file not present)"}`));
  console.log("");

  const rows: Array<[string, string]> = [
    ["vault", cfg.vault],
    ["dbPath", cfg.dbPath],
    ["embeddingModel", cfg.embeddingModel],
    ["ollamaUrl", cfg.ollamaUrl],
    ["promoteFolder", cfg.promoteFolder],
    ["llmProvider", cfg.llmProvider],
    ["llmModel", cfg.llmModel || kleur.dim("(provider default)")],
    ["apiUrl", cfg.apiUrl],
    ["apiToken", cfg.apiToken ? kleur.green("(set)") : kleur.dim("(unset)")],
    ["apiVaultId", cfg.apiVaultId || kleur.dim("(unset)")],
  ];

  const keyWidth = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  for (const [k, v] of rows) {
    console.log(`  ${kleur.cyan(k.padEnd(keyWidth))}  ${v}`);
  }
}
