// packages/core/src/adapters/storage-memory.ts
//
// In-memory StorageAdapter for tests. Implements the same logical contract
// as the SQL-backed adapters (sql.js for plugin, better-sqlite3 for CLI,
// Tauri-SQL for desktop) without requiring a SQLite runtime in core's test
// suite. The on-disk schema is exercised by the per-surface adapters (TASK
// 1.15 + 2.2); this module exists to test the *contract* — round-trip
// semantics, idempotency keys, query filters.

import type { Embedding, Note } from "../types";
import type { ListFindingsOptions, NoteRecord, PersistedFinding, StorageAdapter } from "./storage";

interface LinkRow {
  fromNoteId: number;
  target: string;
  targetNoteId: number | null;
}

export class MemoryStorage implements StorageAdapter {
  private notesById = new Map<number, NoteRecord>();
  private notesByPath = new Map<string, NoteRecord>();
  private nextNoteId = 1;
  private embeddings = new Map<number, Embedding>();
  private links: LinkRow[] = [];
  private findings = new Map<number, PersistedFinding>();
  private nextFindingId = 1;
  private meta = new Map<string, string>();

  async init(): Promise<void> {
    // No-op for memory store. SQL-backed adapters run migrations here.
  }

  async upsertNote(note: Note): Promise<number> {
    const existing = this.notesByPath.get(note.relPath);
    if (existing) {
      // Match index.py:88-111 ON CONFLICT — `created` preserved via COALESCE.
      const merged: NoteRecord = {
        ...existing,
        ...note,
        path: note.path,
        relPath: note.relPath,
        stem: note.stem,
        title: note.title,
        // COALESCE(notes.created, excluded.created): keep original
        created: existing.created ?? note.created,
        updated: note.updated,
        wordCount: note.wordCount,
        content: note.content,
        contentHash: note.contentHash,
        tags: note.tags,
        wikilinks: note.wikilinks,
      };
      this.notesById.set(existing.id, merged);
      this.notesByPath.set(merged.relPath, merged);
      return existing.id;
    }
    const id = this.nextNoteId++;
    const record: NoteRecord = { ...note, id };
    this.notesById.set(id, record);
    this.notesByPath.set(note.relPath, record);
    return id;
  }

  async getNote(path: string): Promise<NoteRecord | null> {
    return this.notesByPath.get(path) ?? null;
  }

  async *listNotes(): AsyncIterable<NoteRecord> {
    for (const n of this.notesById.values()) yield n;
  }

  async upsertEmbedding(
    noteId: number,
    embedding: Pick<Embedding, "model" | "contentHash" | "dim" | "vec">,
  ): Promise<void> {
    this.embeddings.set(noteId, {
      noteId,
      model: embedding.model,
      contentHash: embedding.contentHash,
      dim: embedding.dim,
      // Defensive copy — caller may reuse the buffer.
      vec: new Float32Array(embedding.vec),
    });
  }

  async getEmbedding(noteId: number): Promise<Embedding | null> {
    return this.embeddings.get(noteId) ?? null;
  }

  async *listEmbeddings(): AsyncIterable<Embedding> {
    // Emit in note_id order for deterministic behavior parity with the
    // Python `ORDER BY note_id` in embed.py:167.
    const ids = Array.from(this.embeddings.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      yield this.embeddings.get(id)!;
    }
  }

  async replaceLinks(fromNoteId: number, targets: string[]): Promise<void> {
    this.links = this.links.filter((l) => l.fromNoteId !== fromNoteId);
    for (const target of targets) {
      this.links.push({ fromNoteId, target, targetNoteId: null });
    }
  }

  async resolveLinkTargets(): Promise<number> {
    // Build stem → id map; last-stem-wins matches index.py:124-135's dict
    // overwrite semantics.
    const stemToId = new Map<string, number>();
    for (const n of this.notesById.values()) {
      stemToId.set(n.stem.toLowerCase(), n.id);
    }
    let resolved = 0;
    for (const link of this.links) {
      if (link.targetNoteId !== null) continue;
      const id = stemToId.get(link.target.toLowerCase());
      if (id !== undefined) {
        link.targetNoteId = id;
        resolved++;
      }
    }
    return resolved;
  }

  async upsertFinding(finding: PersistedFinding): Promise<number | null> {
    // Idempotency: if an existing pending finding with the same
    // (verb, finding_key) exists, no new row.
    for (const existing of this.findings.values()) {
      if (
        existing.verb === finding.verb &&
        existing.finding_key === finding.finding_key &&
        existing.status === "pending"
      ) {
        return null;
      }
    }
    const id = finding.id ?? this.nextFindingId++;
    const stored: PersistedFinding = { ...finding, id };
    this.findings.set(id, stored);
    return id;
  }

  async listFindings(opts?: ListFindingsOptions): Promise<PersistedFinding[]> {
    let out = Array.from(this.findings.values());
    if (opts?.verb !== undefined) out = out.filter((f) => f.verb === opts.verb);
    if (opts?.status !== undefined) out = out.filter((f) => f.status === opts.status);
    if (opts?.since !== undefined) {
      const since = opts.since;
      out = out.filter((f) => f.created_at >= since);
    }
    out.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit);
    return out;
  }

  async updateFindingStatus(
    id: number,
    status: PersistedFinding["status"],
    verdictAt: string,
    verdictReason: string,
  ): Promise<void> {
    const existing = this.findings.get(id);
    if (!existing) throw new Error(`updateFindingStatus: id ${id} not found`);
    this.findings.set(id, {
      ...existing,
      status,
      verdict_at: verdictAt,
      verdict_reason: verdictReason,
    });
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async close(): Promise<void> {
    // No-op for memory store.
  }

  // ── Test helpers ───────────────────────────────────────────────────────

  /** Snapshot for assertions. */
  snapshot(): {
    notes: NoteRecord[];
    embeddings: Embedding[];
    links: LinkRow[];
    findings: PersistedFinding[];
    meta: Record<string, string>;
  } {
    return {
      notes: Array.from(this.notesById.values()),
      embeddings: Array.from(this.embeddings.values()),
      links: this.links.slice(),
      findings: Array.from(this.findings.values()),
      meta: Object.fromEntries(this.meta),
    };
  }
}
