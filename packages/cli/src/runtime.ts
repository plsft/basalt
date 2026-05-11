// packages/cli/src/runtime.ts
// Shared engine bootstrap for every command. Wires the three CLI-side
// adapters (fs-node, storage-sqlite, ollama-http) into @basalt/core's Engine.

import { Engine, OllamaEmbedder } from "@basalt/core";
import "@basalt/core/verbs"; // side-effect: register all five verbs
import { NodeFilesystem } from "./adapters/fs-node";
import { SqliteStorage } from "./adapters/storage-sqlite";

export interface RuntimeOptions {
  vault: string;
  db: string;
  ollamaUrl: string;
  embeddingModel: string;
}

export async function runEngine(opts: RuntimeOptions): Promise<Engine> {
  const storage = new SqliteStorage(opts.db);
  const embedding = new OllamaEmbedder({
    url: opts.ollamaUrl,
    model: opts.embeddingModel,
  });
  const filesystem = new NodeFilesystem();
  return await Engine.create({
    storage,
    embedding,
    filesystem,
    options: { today: new Date().toISOString().slice(0, 10) },
  });
}
