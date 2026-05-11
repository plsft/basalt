// packages/obsidian-plugin/src/adapters/storage-sqljs.ts
// sql.js StorageAdapter for the Obsidian sandbox — full impl in TASK-1.15.

import type { Embedding, Note, NoteRecord, PersistedFinding, StorageAdapter } from "@basalt/core";

export class SqlJsStorage implements StorageAdapter {
  async init(): Promise<void> {
    throw new Error("SqlJsStorage.init: not yet implemented (lands in TASK-1.15)");
  }
  async upsertNote(_note: Note): Promise<number> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async getNote(_path: string): Promise<NoteRecord | null> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async *listNotes(): AsyncIterable<NoteRecord> {
    throw new Error("SqlJsStorage: TASK-1.15");
    // biome-ignore lint/correctness/noUnreachable: signal generator type
    yield {} as NoteRecord;
  }
  async upsertEmbedding(): Promise<void> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async getEmbedding(): Promise<Embedding | null> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async *listEmbeddings(): AsyncIterable<Embedding> {
    throw new Error("SqlJsStorage: TASK-1.15");
    // biome-ignore lint/correctness/noUnreachable: signal generator type
    yield {} as Embedding;
  }
  async replaceLinks(): Promise<void> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async resolveLinkTargets(): Promise<number> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async upsertFinding(_f: PersistedFinding): Promise<number | null> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async listFindings(): Promise<PersistedFinding[]> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async updateFindingStatus(): Promise<void> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async getMeta(): Promise<string | null> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async setMeta(): Promise<void> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
  async close(): Promise<void> {
    throw new Error("SqlJsStorage: TASK-1.15");
  }
}
