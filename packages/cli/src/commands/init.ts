// packages/cli/src/commands/init.ts

import { input, select } from "@inquirer/prompts";
import kleur from "kleur";
import {
  type CliConfig,
  defaultConfig,
  defaultConfigPath,
  loadConfig,
  saveConfig,
} from "../config";

export async function initCommand(opts: { vault?: string }): Promise<void> {
  const existing = loadConfig();
  const current: CliConfig = { ...existing };
  if (opts.vault) current.vault = opts.vault;

  console.log(kleur.bold("Basalt setup\n"));

  current.vault = await input({
    message: "Vault path",
    default: current.vault,
  });
  current.embeddingModel = await select({
    message: "Embedding model",
    choices: [
      { name: "nomic-embed-text (default)", value: "nomic-embed-text" },
      { name: "bge-m3 (multilingual, longer context)", value: "bge-m3" },
    ],
    default: current.embeddingModel,
  });
  current.ollamaUrl = await input({
    message: "Ollama URL",
    default: current.ollamaUrl,
  });
  current.promoteFolder = await input({
    message: "Promote-to folder (relative to vault)",
    default: current.promoteFolder,
  });

  const written = saveConfig(current);
  console.log("");
  console.log(kleur.green(`✓ wrote ${written}`));
  console.log(kleur.dim("Run 'basalt index' next."));
}

export function _resetForTesting(): void {
  // Hook for vitest to clear cached state; reserved.
  void defaultConfig;
  void defaultConfigPath;
}
