// StorageAdapter interface — runtime-agnostic. Implementations:
//   - storage-memory.ts (in core, sql.js :memory: for tests; TASK-1.4)
//   - storage-sqljs.ts (in basalted-obsidian-plugin; TASK-1.15)
//   - storage-sqlite.ts (in basalted, better-sqlite3; Phase 2 / TASK-2.2)
//   - storage-tauri-sql.ts (in basalted-desktop; Phase 4)
//   - storage-d1.ts (in basalted-api; Phase 3)
//
// All implementations consume the canonical migrations under
// `basalted-core/src/migrations/` (seeded in TASK-1.4) so the on-disk schema
// is byte-equivalent to the Python reference's (SPEC.md §2.1).

import type { Embedding, Note } from "../types";

export interface NoteRecord extends Note {
  /** Surrogate key from the `notes` table (auto-incremented INTEGER PRIMARY KEY). */
  id: number;
}

export interface PersistedFinding {
  id?: number;
  verb: string;
  /** Stable per-finding key; mirrors Python `audit.py:_finding_key`. */
  finding_key: string;
  finding_json: string;
  falsification: string;
  created_at: string;
  status: "pending" | "confirmed" | "falsified";
  verdict_at?: string | null;
  verdict_reason?: string | null;
}

export interface ListFindingsOptions {
  verb?: string;
  status?: PersistedFinding["status"];
  /** ISO date inclusive lower bound on `created_at`. */
  since?: string;
  /** Hard cap on returned rows. */
  limit?: number;
}

export interface StorageAdapter {
  init(): Promise<void>;

  upsertNote(note: Note): Promise<number>;
  getNote(path: string): Promise<NoteRecord | null>;
  listNotes(): AsyncIterable<NoteRecord>;

  upsertEmbedding(
    noteId: number,
    embedding: Pick<Embedding, "model" | "contentHash" | "dim" | "vec">,
  ): Promise<void>;
  getEmbedding(noteId: number): Promise<Embedding | null>;
  listEmbeddings(): AsyncIterable<Embedding>;

  /** Replace all outgoing wikilinks for a note. */
  replaceLinks(fromNoteId: number, targets: string[]): Promise<void>;
  /** Resolve raw link targets to note IDs (case-insensitive stem match). Returns count resolved. */
  resolveLinkTargets(): Promise<number>;

  upsertFinding(finding: PersistedFinding): Promise<number | null>;
  listFindings(opts?: ListFindingsOptions): Promise<PersistedFinding[]>;
  updateFindingStatus(
    id: number,
    status: PersistedFinding["status"],
    verdictAt: string,
    verdictReason: string,
  ): Promise<void>;

  /** Read/write metadata key-value pairs. Used by audit + first-run greeting. */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  close(): Promise<void>;
}
