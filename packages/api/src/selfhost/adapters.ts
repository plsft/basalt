// Self-host adapters: drop-in equivalents for the Cloudflare bindings the
// API code uses (D1, KV, R2, AI, Vectorize). Each adapter implements
// JUST enough of the Cloudflare interface that our route code already
// depends on — not the whole surface.
//
// File layout under SELFHOST_DATA_DIR:
//   db.sqlite               — D1 replacement (better-sqlite3)
//   kv/<namespace>/<key>    — KV replacement (single file per key)
//   r2/<bucket>/<key>       — R2 replacement (raw file)
//   vectors.sqlite          — Vectorize replacement (flat ANN over SQLite)
//
// This is *not* a clustered production setup. It runs the entire Pro
// stack on one box for self-hosters who want to keep data local.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export class SelfhostD1 {
  private db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }
  prepare(sql: string): SelfhostD1Statement {
    return new SelfhostD1Statement(this.db, sql);
  }
  exec(sql: string): void {
    this.db.exec(sql);
  }
  close(): void {
    this.db.close();
  }
}

export class SelfhostD1Statement {
  private boundArgs: unknown[] = [];
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
  ) {}
  bind(...args: unknown[]): SelfhostD1Statement {
    this.boundArgs = args;
    return this;
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.boundArgs as unknown[])) as T | undefined;
    return row ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.boundArgs as unknown[])) as T[];
    return { results: rows };
  }
  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...(this.boundArgs as unknown[]));
    return { success: true, meta: { changes: info.changes } };
  }
}

export interface KVPutOptions {
  expirationTtl?: number;
}

export class SelfhostKV {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  private pathFor(key: string): string {
    return join(this.root, encodeURIComponent(key));
  }
  async get(key: string): Promise<string | null> {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    try {
      const env = JSON.parse(raw) as { expires?: number; value: string };
      if (env.expires && env.expires < Date.now()) {
        rmSync(path, { force: true });
        return null;
      }
      return env.value;
    } catch {
      return raw;
    }
  }
  async put(key: string, value: string, opts: KVPutOptions = {}): Promise<void> {
    const path = this.pathFor(key);
    const env: { value: string; expires?: number } = { value };
    if (opts.expirationTtl) env.expires = Date.now() + opts.expirationTtl * 1000;
    writeFileSync(path, JSON.stringify(env));
  }
  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

export interface R2HttpMetadata {
  contentType?: string;
}

export interface R2PutOptions {
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectMeta {
  size: number;
  uploaded: Date;
  customMetadata: Record<string, string>;
}

export class SelfhostR2 {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  private pathFor(key: string): string {
    return join(this.root, encodeURIComponent(key.replace(/\//g, "_")));
  }
  private metaPathFor(key: string): string {
    return `${this.pathFor(key)}.meta.json`;
  }
  async put(
    key: string,
    body: string | ArrayBuffer | Uint8Array,
    opts: R2PutOptions = {},
  ): Promise<void> {
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    let buf: Buffer;
    if (typeof body === "string") buf = Buffer.from(body, "utf-8");
    else if (body instanceof Uint8Array) buf = Buffer.from(body);
    else buf = Buffer.from(body);
    writeFileSync(path, buf);
    writeFileSync(
      this.metaPathFor(key),
      JSON.stringify({
        uploaded: new Date().toISOString(),
        size: buf.byteLength,
        customMetadata: opts.customMetadata ?? {},
        httpMetadata: opts.httpMetadata ?? {},
      }),
    );
  }
  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    const buf = readFileSync(path);
    return { text: async () => buf.toString("utf-8") };
  }
  async head(key: string): Promise<R2ObjectMeta | null> {
    const path = this.metaPathFor(key);
    if (!existsSync(path)) return null;
    const m = JSON.parse(readFileSync(path, "utf-8")) as {
      uploaded: string;
      size: number;
      customMetadata: Record<string, string>;
    };
    return {
      size: m.size,
      uploaded: new Date(m.uploaded),
      customMetadata: m.customMetadata,
    };
  }
  async delete(key: string): Promise<void> {
    const p = this.pathFor(key);
    if (existsSync(p)) rmSync(p, { force: true });
    const meta = this.metaPathFor(key);
    if (existsSync(meta)) rmSync(meta, { force: true });
  }
}

/** Flat vector index — brute-force cosine over an in-memory matrix.
 *  Suitable for single-box self-hosting up to ~100k vectors.
 *  Cluster-grade replacement (pg_vector, Qdrant, etc.) is a follow-up. */
export class SelfhostVectorize {
  private db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        dim INTEGER NOT NULL,
        vec BLOB NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vectors_metadata ON vectors(id);
    `);
  }
  close(): void {
    this.db.close();
  }
  async upsert(
    records: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
  ): Promise<{ count: number }> {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO vectors (id, dim, vec, metadata_json) VALUES (?, ?, ?, ?)",
    );
    const tx = this.db.transaction((batch: typeof records) => {
      for (const r of batch) {
        const f32 = new Float32Array(r.values);
        const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
        stmt.run(r.id, r.values.length, buf, JSON.stringify(r.metadata));
      }
    });
    tx(records);
    return { count: records.length };
  }
  async deleteByIds(ids: string[]): Promise<void> {
    const stmt = this.db.prepare("DELETE FROM vectors WHERE id = ?");
    const tx = this.db.transaction((batch: string[]) => {
      for (const id of batch) stmt.run(id);
    });
    tx(ids);
  }
  async query(
    queryVec: number[],
    opts: { topK?: number; filter?: Record<string, unknown>; returnMetadata?: string },
  ): Promise<{ matches: Array<{ id: string; score: number; metadata: Record<string, unknown> }> }> {
    const topK = Math.max(1, Math.min(1000, opts.topK ?? 10));
    const rows = this.db.prepare("SELECT id, dim, vec, metadata_json FROM vectors").all() as Array<{
      id: string;
      dim: number;
      vec: Buffer;
      metadata_json: string;
    }>;
    const q = new Float32Array(queryVec);
    const filter = compileFilter(opts.filter);
    const scored: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];
    for (const row of rows) {
      const meta = JSON.parse(row.metadata_json) as Record<string, unknown>;
      if (!filter(meta)) continue;
      const v = new Float32Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength / 4);
      let dot = 0;
      const n = Math.min(q.length, v.length);
      for (let i = 0; i < n; i++) dot += (q[i] ?? 0) * (v[i] ?? 0);
      scored.push({ id: row.id, score: dot, metadata: meta });
    }
    scored.sort((a, b) => b.score - a.score);
    return { matches: scored.slice(0, topK) };
  }
}

function compileFilter(
  filter: Record<string, unknown> | undefined,
): (meta: Record<string, unknown>) => boolean {
  if (!filter) return () => true;
  return (meta) => {
    for (const [key, op] of Object.entries(filter)) {
      const v = meta[key];
      if (typeof op !== "object" || op === null) {
        if (v !== op) return false;
        continue;
      }
      const cond = op as { $eq?: unknown; $in?: unknown[] };
      if ("$eq" in cond && v !== cond.$eq) return false;
      if ("$in" in cond && Array.isArray(cond.$in) && !cond.$in.includes(v)) return false;
    }
    return true;
  };
}

/** Stub AI binding for self-host. The real implementation routes to either
 *  Ollama (default for self-host) or a user-supplied OpenAI-compatible
 *  endpoint via the BASALT_SELFHOST_AI_URL env var. */
export class SelfhostAI {
  constructor(
    private readonly opts: { ollamaUrl?: string; openaiUrl?: string; openaiKey?: string },
  ) {}
  async run(
    model: string,
    input: { messages?: Array<{ role: string; content: string }>; text?: string[] },
  ): Promise<unknown> {
    if (input.text && Array.isArray(input.text)) {
      // Embedding path: route to Ollama's /api/embeddings.
      const url = `${(this.opts.ollamaUrl ?? "http://localhost:11434").replace(/\/$/, "")}/api/embeddings`;
      const out: number[][] = [];
      for (const text of input.text) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
        });
        if (!res.ok) throw new Error(`selfhost embedding failed: HTTP ${res.status}`);
        const data = (await res.json()) as { embedding: number[] };
        out.push(data.embedding);
      }
      return { shape: [out.length, out[0]?.length ?? 0], data: out };
    }
    if (input.messages && Array.isArray(input.messages)) {
      // Chat path: route to Ollama's /api/chat.
      const url = `${(this.opts.ollamaUrl ?? "http://localhost:11434").replace(/\/$/, "")}/api/chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.replace("@cf/meta/", ""),
          messages: input.messages,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`selfhost chat failed: HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content: string } };
      return { response: data.message?.content ?? "" };
    }
    throw new Error("selfhost AI: unrecognized input shape");
  }
}
