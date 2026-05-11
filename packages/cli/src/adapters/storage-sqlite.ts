// packages/cli/src/adapters/storage-sqlite.ts
// better-sqlite3 StorageAdapter for Node/Bun. Same migrations as the
// plugin's sql.js adapter (single source of truth: @basalt/core/migrations).
// Schema is byte-compatible with Python's ~/.basalt/basalt.db so Python-CLI
// users can swap to this CLI without re-indexing.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Embedding,
  ListFindingsOptions,
  Note,
  NoteRecord,
  PersistedFinding,
  StorageAdapter,
} from "@basalt/core";
import { MIGRATIONS } from "@basalt/core";
import Database from "better-sqlite3";

export class SqliteStorage implements StorageAdapter {
  private db: Database.Database | null = null;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS) {
      this.db.exec(migration.sql);
    }
  }

  private requireDb(): Database.Database {
    if (!this.db) throw new Error("SqliteStorage: init() not called");
    return this.db;
  }

  async upsertNote(note: Note): Promise<number> {
    const db = this.requireDb();
    const stmt = db.prepare(`
      INSERT INTO notes (rel_path, stem, title, created, updated, word_count, content, content_hash, tags)
      VALUES (@rel_path, @stem, @title, @created, @updated, @word_count, @content, @content_hash, @tags)
      ON CONFLICT(rel_path) DO UPDATE SET
        stem=excluded.stem,
        title=excluded.title,
        created=COALESCE(notes.created, excluded.created),
        updated=excluded.updated,
        word_count=excluded.word_count,
        content=excluded.content,
        content_hash=excluded.content_hash,
        tags=excluded.tags
      RETURNING id
    `);
    const row = stmt.get({
      rel_path: note.relPath,
      stem: note.stem,
      title: note.title,
      created: note.created,
      updated: note.updated,
      word_count: note.wordCount,
      content: note.content,
      content_hash: note.contentHash,
      tags: note.tags.join(","),
    }) as { id: number };
    return row.id;
  }

  async getNote(path: string): Promise<NoteRecord | null> {
    const db = this.requireDb();
    const row = db.prepare("SELECT * FROM notes WHERE rel_path = ?").get(path) as
      | RawNoteRow
      | undefined;
    return row ? rowToNote(row) : null;
  }

  async *listNotes(): AsyncIterable<NoteRecord> {
    const db = this.requireDb();
    const rows = db.prepare("SELECT * FROM notes ORDER BY id").all() as RawNoteRow[];
    for (const row of rows) yield rowToNote(row);
  }

  async upsertEmbedding(
    noteId: number,
    embedding: Pick<Embedding, "model" | "contentHash" | "dim" | "vec">,
  ): Promise<void> {
    const db = this.requireDb();
    db.prepare(`
      INSERT INTO embeddings (note_id, model, content_hash, dim, vec)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(note_id) DO UPDATE SET
        model=excluded.model,
        content_hash=excluded.content_hash,
        dim=excluded.dim,
        vec=excluded.vec
    `).run(
      noteId,
      embedding.model,
      embedding.contentHash,
      embedding.dim,
      Buffer.from(embedding.vec.buffer, embedding.vec.byteOffset, embedding.vec.byteLength),
    );
  }

  async getEmbedding(noteId: number): Promise<Embedding | null> {
    const db = this.requireDb();
    const row = db.prepare("SELECT * FROM embeddings WHERE note_id = ?").get(noteId) as
      | RawEmbedRow
      | undefined;
    return row ? rowToEmbedding(row) : null;
  }

  async *listEmbeddings(): AsyncIterable<Embedding> {
    const db = this.requireDb();
    const rows = db.prepare("SELECT * FROM embeddings ORDER BY note_id").all() as RawEmbedRow[];
    for (const row of rows) yield rowToEmbedding(row);
  }

  async replaceLinks(fromNoteId: number, targets: string[]): Promise<void> {
    const db = this.requireDb();
    const del = db.prepare("DELETE FROM links WHERE from_note_id = ?");
    const ins = db.prepare("INSERT INTO links (from_note_id, target) VALUES (?, ?)");
    const tx = db.transaction((id: number, ts: string[]) => {
      del.run(id);
      for (const t of ts) ins.run(id, t);
    });
    tx(fromNoteId, targets);
  }

  async resolveLinkTargets(): Promise<number> {
    const db = this.requireDb();
    const stems = db.prepare("SELECT id, stem FROM notes").all() as { id: number; stem: string }[];
    const stemToId = new Map<string, number>();
    for (const s of stems) stemToId.set(s.stem.toLowerCase(), s.id);
    const unresolved = db
      .prepare("SELECT rowid, target FROM links WHERE target_note_id IS NULL")
      .all() as { rowid: number; target: string }[];
    const upd = db.prepare("UPDATE links SET target_note_id = ? WHERE rowid = ?");
    let resolved = 0;
    const tx = db.transaction(() => {
      for (const u of unresolved) {
        const id = stemToId.get(u.target.toLowerCase());
        if (id !== undefined) {
          upd.run(id, u.rowid);
          resolved++;
        }
      }
    });
    tx();
    return resolved;
  }

  async upsertFinding(finding: PersistedFinding): Promise<number | null> {
    const db = this.requireDb();
    const existing = db
      .prepare("SELECT id FROM briefs WHERE verb = ? AND finding_key = ? AND status = 'pending'")
      .get(finding.verb, finding.finding_key) as { id: number } | undefined;
    if (existing) return null;
    const result = db
      .prepare(`
        INSERT INTO briefs (verb, finding_key, finding_json, falsification, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        finding.verb,
        finding.finding_key,
        finding.finding_json,
        finding.falsification,
        finding.created_at,
        finding.status,
      );
    return Number(result.lastInsertRowid);
  }

  async listFindings(opts?: ListFindingsOptions): Promise<PersistedFinding[]> {
    const db = this.requireDb();
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts?.verb !== undefined) {
      clauses.push("verb = @verb");
      params.verb = opts.verb;
    }
    if (opts?.status !== undefined) {
      clauses.push("status = @status");
      params.status = opts.status;
    }
    if (opts?.since !== undefined) {
      clauses.push("created_at >= @since");
      params.since = opts.since;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts?.limit !== undefined ? `LIMIT @limit` : "";
    if (opts?.limit !== undefined) params.limit = opts.limit;
    const rows = db
      .prepare(`SELECT * FROM briefs ${where} ORDER BY id ${limit}`)
      .all(params) as RawBriefRow[];
    return rows.map(rowToBrief);
  }

  async updateFindingStatus(
    id: number,
    status: PersistedFinding["status"],
    verdictAt: string,
    verdictReason: string,
  ): Promise<void> {
    this.requireDb()
      .prepare("UPDATE briefs SET status = ?, verdict_at = ?, verdict_reason = ? WHERE id = ?")
      .run(status, verdictAt, verdictReason, id);
  }

  async getMeta(key: string): Promise<string | null> {
    const row = this.requireDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.requireDb()
      .prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

interface RawNoteRow {
  id: number;
  rel_path: string;
  stem: string;
  title: string;
  created: string | null;
  updated: string | null;
  word_count: number;
  content: string;
  content_hash: string;
  tags: string | null;
}

interface RawEmbedRow {
  note_id: number;
  model: string;
  content_hash: string;
  dim: number;
  vec: Buffer;
}

interface RawBriefRow {
  id: number;
  verb: string;
  finding_key: string;
  finding_json: string;
  falsification: string;
  created_at: string;
  status: "pending" | "confirmed" | "falsified";
  verdict_at: string | null;
  verdict_reason: string | null;
}

function rowToNote(row: RawNoteRow): NoteRecord {
  return {
    id: row.id,
    path: row.rel_path,
    relPath: row.rel_path,
    stem: row.stem,
    title: row.title,
    created: row.created,
    updated: row.updated,
    tags: row.tags ? row.tags.split(",").filter((t) => t.length > 0) : [],
    content: row.content,
    wikilinks: [],
    wordCount: row.word_count,
    contentHash: row.content_hash,
  };
}

function rowToEmbedding(row: RawEmbedRow): Embedding {
  const buf = row.vec;
  const vec = new Float32Array(buf.byteLength / 4);
  for (let i = 0; i < vec.length; i++) {
    vec[i] = buf.readFloatLE(i * 4);
  }
  return {
    noteId: row.note_id,
    model: row.model,
    contentHash: row.content_hash,
    dim: row.dim,
    vec,
  };
}

function rowToBrief(row: RawBriefRow): PersistedFinding {
  return {
    id: row.id,
    verb: row.verb,
    finding_key: row.finding_key,
    finding_json: row.finding_json,
    falsification: row.falsification,
    created_at: row.created_at,
    status: row.status,
    verdict_at: row.verdict_at,
    verdict_reason: row.verdict_reason,
  };
}
