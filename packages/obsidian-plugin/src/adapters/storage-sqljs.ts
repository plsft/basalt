// sql.js StorageAdapter for the Obsidian sandbox.
//
// Mirrors packages/cli/src/adapters/storage-sqlite.ts byte-for-byte on schema
// and SQL — both use MIGRATIONS from @basalt/core. The only differences are:
//
//  - sql.js runs in-process via WASM; no native module, no fs path
//  - the database file is persisted via Obsidian's DataAdapter (vault-relative
//    path), serialized through Database.export() → Uint8Array on every flush
//  - blob round-trip uses Uint8Array.buffer rather than Node's Buffer
//
// Persistence cadence: flush after every write. (Obsidian sessions are
// long-lived and writes are not bursty; a debounced flush is a future
// optimization.)

import {
  type Embedding,
  type ListFindingsOptions,
  MIGRATIONS,
  type Note,
  type NoteRecord,
  type PersistedFinding,
  type StorageAdapter,
} from "@basalt/core";
import type { Vault } from "obsidian";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

export interface SqlJsStorageOptions {
  /** Obsidian Vault used for DataAdapter persistence. */
  vault: Vault;
  /** Vault-relative path for the SQLite blob. Default `.basalt-index.db`. */
  dbPath?: string;
  /**
   * URL or filesystem path of `sql-wasm.wasm`. In Obsidian we ship the WASM
   * alongside `main.js` (esbuild copies it during build); the plugin loads
   * it as a binary via `Vault.adapter.readBinary` and feeds it to initSqlJs.
   */
  wasmBinary?: Uint8Array;
}

export class SqlJsStorage implements StorageAdapter {
  private db: Database | null = null;
  private readonly vault: Vault;
  private readonly dbPath: string;
  private readonly wasmBinary: Uint8Array | undefined;
  private flushPending = false;

  constructor(opts: SqlJsStorageOptions) {
    this.vault = opts.vault;
    this.dbPath = opts.dbPath ?? ".basalt-index.db";
    this.wasmBinary = opts.wasmBinary;
  }

  async init(): Promise<void> {
    const SQL: SqlJsStatic = await initSqlJs(
      this.wasmBinary !== undefined ? { wasmBinary: this.wasmBinary } : {},
    );
    const adapter = this.vault.adapter;
    const exists = await adapter.exists(this.dbPath);
    if (exists) {
      const buf = await adapter.readBinary(this.dbPath);
      this.db = new SQL.Database(new Uint8Array(buf));
    } else {
      this.db = new SQL.Database();
      for (const migration of MIGRATIONS) {
        this.db.exec(migration.sql);
      }
      await this.flush();
    }
  }

  private requireDb(): Database {
    if (!this.db) throw new Error("SqlJsStorage: init() not called");
    return this.db;
  }

  /** Serialize and write to vault. Called automatically after every mutation. */
  private async flush(): Promise<void> {
    if (!this.db) return;
    if (this.flushPending) return;
    this.flushPending = true;
    try {
      const data = this.db.export();
      await this.vault.adapter.writeBinary(this.dbPath, data.buffer as ArrayBuffer);
    } finally {
      this.flushPending = false;
    }
  }

  async upsertNote(note: Note): Promise<number> {
    const db = this.requireDb();
    const stmt = db.prepare(`
      INSERT INTO notes (rel_path, stem, title, created, updated, word_count, content, content_hash, tags)
      VALUES (:rel_path, :stem, :title, :created, :updated, :word_count, :content, :content_hash, :tags)
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
    stmt.bind({
      ":rel_path": note.relPath,
      ":stem": note.stem,
      ":title": note.title,
      ":created": note.created,
      ":updated": note.updated,
      ":word_count": note.wordCount,
      ":content": note.content,
      ":content_hash": note.contentHash,
      ":tags": note.tags.join(","),
    });
    let id = 0;
    if (stmt.step()) {
      const row = stmt.getAsObject() as { id: number };
      id = row.id;
    }
    stmt.free();
    await this.flush();
    return id;
  }

  async getNote(path: string): Promise<NoteRecord | null> {
    const db = this.requireDb();
    const stmt = db.prepare("SELECT * FROM notes WHERE rel_path = :p");
    stmt.bind({ ":p": path });
    const row = stmt.step() ? (stmt.getAsObject() as unknown as RawNoteRow) : null;
    stmt.free();
    return row ? rowToNote(row) : null;
  }

  async *listNotes(): AsyncIterable<NoteRecord> {
    const db = this.requireDb();
    const stmt = db.prepare("SELECT * FROM notes ORDER BY id");
    while (stmt.step()) {
      yield rowToNote(stmt.getAsObject() as unknown as RawNoteRow);
    }
    stmt.free();
  }

  async upsertEmbedding(
    noteId: number,
    embedding: Pick<Embedding, "model" | "contentHash" | "dim" | "vec">,
  ): Promise<void> {
    const db = this.requireDb();
    const stmt = db.prepare(`
      INSERT INTO embeddings (note_id, model, content_hash, dim, vec)
      VALUES (:nid, :model, :ch, :dim, :vec)
      ON CONFLICT(note_id) DO UPDATE SET
        model=excluded.model,
        content_hash=excluded.content_hash,
        dim=excluded.dim,
        vec=excluded.vec
    `);
    const blob = new Uint8Array(
      embedding.vec.buffer,
      embedding.vec.byteOffset,
      embedding.vec.byteLength,
    );
    stmt.bind({
      ":nid": noteId,
      ":model": embedding.model,
      ":ch": embedding.contentHash,
      ":dim": embedding.dim,
      ":vec": blob,
    });
    stmt.step();
    stmt.free();
    await this.flush();
  }

  async getEmbedding(noteId: number): Promise<Embedding | null> {
    const db = this.requireDb();
    const stmt = db.prepare("SELECT * FROM embeddings WHERE note_id = :n");
    stmt.bind({ ":n": noteId });
    const row = stmt.step() ? (stmt.getAsObject() as unknown as RawEmbedRow) : null;
    stmt.free();
    return row ? rowToEmbedding(row) : null;
  }

  async *listEmbeddings(): AsyncIterable<Embedding> {
    const db = this.requireDb();
    const stmt = db.prepare("SELECT * FROM embeddings ORDER BY note_id");
    while (stmt.step()) {
      yield rowToEmbedding(stmt.getAsObject() as unknown as RawEmbedRow);
    }
    stmt.free();
  }

  async replaceLinks(fromNoteId: number, targets: string[]): Promise<void> {
    const db = this.requireDb();
    db.run("BEGIN");
    try {
      const del = db.prepare("DELETE FROM links WHERE from_note_id = :n");
      del.bind({ ":n": fromNoteId });
      del.step();
      del.free();
      const ins = db.prepare("INSERT INTO links (from_note_id, target) VALUES (:n, :t)");
      for (const t of targets) {
        ins.bind({ ":n": fromNoteId, ":t": t });
        ins.step();
        ins.reset();
      }
      ins.free();
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    await this.flush();
  }

  async resolveLinkTargets(): Promise<number> {
    const db = this.requireDb();
    const stemMap = new Map<string, number>();
    {
      const stmt = db.prepare("SELECT id, stem FROM notes");
      while (stmt.step()) {
        const row = stmt.getAsObject() as { id: number; stem: string };
        stemMap.set(row.stem.toLowerCase(), row.id);
      }
      stmt.free();
    }
    const unresolved: { rowid: number; target: string }[] = [];
    {
      const stmt = db.prepare("SELECT rowid, target FROM links WHERE target_note_id IS NULL");
      while (stmt.step()) {
        unresolved.push(stmt.getAsObject() as unknown as { rowid: number; target: string });
      }
      stmt.free();
    }
    let resolved = 0;
    db.run("BEGIN");
    try {
      const upd = db.prepare("UPDATE links SET target_note_id = :id WHERE rowid = :r");
      for (const u of unresolved) {
        const id = stemMap.get(u.target.toLowerCase());
        if (id !== undefined) {
          upd.bind({ ":id": id, ":r": u.rowid });
          upd.step();
          upd.reset();
          resolved++;
        }
      }
      upd.free();
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    await this.flush();
    return resolved;
  }

  async upsertFinding(finding: PersistedFinding): Promise<number | null> {
    const db = this.requireDb();
    const sel = db.prepare(
      "SELECT id FROM briefs WHERE verb = :v AND finding_key = :k AND status = 'pending'",
    );
    sel.bind({ ":v": finding.verb, ":k": finding.finding_key });
    const exists = sel.step();
    sel.free();
    if (exists) return null;
    const ins = db.prepare(`
      INSERT INTO briefs (verb, finding_key, finding_json, falsification, created_at, status)
      VALUES (:v, :k, :j, :f, :ca, :s)
    `);
    ins.bind({
      ":v": finding.verb,
      ":k": finding.finding_key,
      ":j": finding.finding_json,
      ":f": finding.falsification,
      ":ca": finding.created_at,
      ":s": finding.status,
    });
    ins.step();
    ins.free();
    const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
    idStmt.step();
    const id = (idStmt.getAsObject() as { id: number }).id;
    idStmt.free();
    await this.flush();
    return id;
  }

  async listFindings(opts?: ListFindingsOptions): Promise<PersistedFinding[]> {
    const db = this.requireDb();
    const clauses: string[] = [];
    const bindings: Record<string, unknown> = {};
    if (opts?.verb !== undefined) {
      clauses.push("verb = :verb");
      bindings[":verb"] = opts.verb;
    }
    if (opts?.status !== undefined) {
      clauses.push("status = :status");
      bindings[":status"] = opts.status;
    }
    if (opts?.since !== undefined) {
      clauses.push("created_at >= :since");
      bindings[":since"] = opts.since;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts?.limit !== undefined ? `LIMIT :limit` : "";
    if (opts?.limit !== undefined) bindings[":limit"] = opts.limit;
    const stmt = db.prepare(`SELECT * FROM briefs ${where} ORDER BY id ${limit}`);
    stmt.bind(bindings as Record<string, string | number>);
    const rows: PersistedFinding[] = [];
    while (stmt.step()) {
      rows.push(rowToBrief(stmt.getAsObject() as unknown as RawBriefRow));
    }
    stmt.free();
    return rows;
  }

  async updateFindingStatus(
    id: number,
    status: PersistedFinding["status"],
    verdictAt: string,
    verdictReason: string,
  ): Promise<void> {
    const db = this.requireDb();
    const stmt = db.prepare(
      "UPDATE briefs SET status = :s, verdict_at = :va, verdict_reason = :vr WHERE id = :id",
    );
    stmt.bind({ ":s": status, ":va": verdictAt, ":vr": verdictReason, ":id": id });
    stmt.step();
    stmt.free();
    await this.flush();
  }

  async getMeta(key: string): Promise<string | null> {
    const db = this.requireDb();
    const stmt = db.prepare("SELECT value FROM meta WHERE key = :k");
    stmt.bind({ ":k": key });
    const v = stmt.step() ? (stmt.getAsObject() as { value: string }).value : null;
    stmt.free();
    return v;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const db = this.requireDb();
    const stmt = db.prepare(
      "INSERT INTO meta (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    );
    stmt.bind({ ":k": key, ":v": value });
    stmt.step();
    stmt.free();
    await this.flush();
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.flush();
      this.db.close();
      this.db = null;
    }
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
  vec: Uint8Array;
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
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < vec.length; i++) {
    vec[i] = view.getFloat32(i * 4, true);
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
