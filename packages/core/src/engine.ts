// packages/core/src/engine.ts
// Engine orchestrator. Real implementation lands in TASK-1.5.

import type { EmbeddingAdapter, FilesystemAdapter, StorageAdapter } from "./adapters";
import type { Brief, EngineOptions, Verb } from "./types";

export interface EngineDeps {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  filesystem: FilesystemAdapter;
  options?: EngineOptions;
}

export interface IndexOptions {
  /** Vault root path. */
  vault: string;
  /** Re-embed everything regardless of cache. Default false. */
  force?: boolean;
}

export interface BriefOptions {
  /** Section to compute. Default "all". */
  section?: Verb | "all";
  /** Top-N findings per verb. Default 3. */
  top?: number;
}

export class Engine {
  static async create(_deps: EngineDeps): Promise<Engine> {
    throw new Error("Engine.create: not yet implemented (lands in TASK-1.5)");
  }

  index(_opts: IndexOptions): Promise<void> {
    throw new Error("Engine.index: not yet implemented (lands in TASK-1.5)");
  }

  brief(_opts?: BriefOptions): Promise<Brief> {
    throw new Error("Engine.brief: not yet implemented (lands in TASK-1.5)");
  }

  audit(): Promise<void> {
    throw new Error("Engine.audit: not yet implemented (lands in TASK-1.5)");
  }

  close(): Promise<void> {
    throw new Error("Engine.close: not yet implemented (lands in TASK-1.5)");
  }
}
