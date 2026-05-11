// packages/mcp/src/vault-context.ts
// Resolves vault path + adapters per call. Priority:
//   1. CLI args at server startup
//   2. Tool input parameter on each call (resolved per-tool, not here)
//   3. Defaults from ~/.basalt/config.toml (shared with @basalt/cli)

import { NodeFilesystem } from "@basalt/cli/src/adapters/fs-node";
import { SqliteStorage } from "@basalt/cli/src/adapters/storage-sqlite";
import { loadConfig } from "@basalt/cli/src/config";
import { Engine, OllamaEmbedder } from "@basalt/core";
import "@basalt/core/verbs";

export interface VaultContextOptions {
  vault?: string | undefined;
  db?: string | undefined;
  ollamaUrl?: string | undefined;
  embeddingModel?: string | undefined;
  allowWrite: boolean;
}

export interface VaultContext {
  vault: string;
  db: string;
  ollamaUrl: string;
  embeddingModel: string;
  allowWrite: boolean;
  /** Build a fresh Engine for a single tool call. Caller close()s when done. */
  buildEngine(override?: { vault?: string }): Promise<Engine>;
}

export async function resolveVaultContext(opts: VaultContextOptions): Promise<VaultContext> {
  const cfg = loadConfig();
  const ctx: VaultContext = {
    vault: opts.vault ?? cfg.vault,
    db: opts.db ?? cfg.dbPath,
    ollamaUrl: opts.ollamaUrl ?? cfg.ollamaUrl,
    embeddingModel: opts.embeddingModel ?? cfg.embeddingModel,
    allowWrite: opts.allowWrite,
    async buildEngine(override) {
      const vault = override?.vault ?? this.vault;
      const storage = new SqliteStorage(this.db);
      const embedding = new OllamaEmbedder({ url: this.ollamaUrl, model: this.embeddingModel });
      const filesystem = new NodeFilesystem();
      const engine = await Engine.create({
        storage,
        embedding,
        filesystem,
        options: { today: new Date().toISOString().slice(0, 10) },
      });
      void vault;
      return engine;
    },
  };
  return ctx;
}
