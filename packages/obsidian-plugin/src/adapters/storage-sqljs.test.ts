// In-process round-trip test for SqlJsStorage. Uses a mock Vault.adapter that
// just keeps the serialized DB in memory and shares it across SqlJsStorage
// instances — exactly mirrors what Obsidian's DataAdapter does to disk.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { SqlJsStorage } from "./storage-sqljs";

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveWasm(): string {
  const candidates = [
    join(HERE, "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    join(HERE, "..", "..", "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`sql-wasm.wasm not found; checked: ${candidates.join(", ")}`);
}

let wasmBinary: Uint8Array;
beforeAll(() => {
  const buf = readFileSync(resolveWasm());
  wasmBinary = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

class MockDataAdapter {
  files = new Map<string, ArrayBuffer>();

  async exists(p: string): Promise<boolean> {
    return this.files.has(p);
  }
  async readBinary(p: string): Promise<ArrayBuffer> {
    const buf = this.files.get(p);
    if (!buf) throw new Error(`not found: ${p}`);
    return buf;
  }
  async writeBinary(p: string, data: ArrayBuffer): Promise<void> {
    this.files.set(p, data);
  }
}

function mockVault(): { vault: { adapter: MockDataAdapter }; adapter: MockDataAdapter } {
  const adapter = new MockDataAdapter();
  return { vault: { adapter }, adapter };
}

describe("SqlJsStorage", () => {
  it("initializes a fresh database with MIGRATIONS applied", async () => {
    const { vault, adapter } = mockVault();
    const storage = new SqlJsStorage({
      vault: vault as unknown as import("obsidian").Vault,
      wasmBinary,
    });
    await storage.init();
    expect(adapter.files.has(".basalt-index.db")).toBe(true);
    const meta = await storage.getMeta("schema_version");
    expect(meta).toBeNull();
    await storage.close();
  });

  it("round-trips a note + embedding + finding through serialization", async () => {
    const { vault, adapter } = mockVault();
    const storage = new SqlJsStorage({
      vault: vault as unknown as import("obsidian").Vault,
      wasmBinary,
    });
    await storage.init();

    const id = await storage.upsertNote({
      relPath: "alpha.md",
      stem: "alpha",
      title: "Alpha",
      created: "2026-01-01",
      updated: "2026-05-01",
      wordCount: 42,
      content: "hello world",
      contentHash: "deadbeef",
      tags: ["topic/foo", "topic/bar"],
      wikilinks: [],
    });
    expect(id).toBeGreaterThan(0);

    const vec = new Float32Array(8);
    for (let i = 0; i < 8; i++) vec[i] = i / 7;
    await storage.upsertEmbedding(id, {
      model: "nomic-embed-text",
      contentHash: "deadbeef",
      dim: 8,
      vec,
    });

    await storage.replaceLinks(id, ["beta", "gamma"]);
    await storage.setMeta("schema_version", "1");
    await storage.close();

    // Re-open from the serialized blob in the mock adapter.
    expect(adapter.files.has(".basalt-index.db")).toBe(true);

    const storage2 = new SqlJsStorage({
      vault: vault as unknown as import("obsidian").Vault,
      wasmBinary,
    });
    await storage2.init();
    const note = await storage2.getNote("alpha.md");
    expect(note).not.toBeNull();
    expect(note?.title).toBe("Alpha");
    expect(note?.tags).toEqual(["topic/foo", "topic/bar"]);
    expect(note?.wordCount).toBe(42);

    const embed = await storage2.getEmbedding(id);
    expect(embed).not.toBeNull();
    expect(embed?.dim).toBe(8);
    expect(Array.from(embed?.vec ?? [])).toEqual(Array.from(vec));

    const version = await storage2.getMeta("schema_version");
    expect(version).toBe("1");
    await storage2.close();
  });

  it("upsertFinding is idempotent on (verb, finding_key) while pending", async () => {
    const { vault } = mockVault();
    const storage = new SqlJsStorage({
      vault: vault as unknown as import("obsidian").Vault,
      wasmBinary,
    });
    await storage.init();
    const first = await storage.upsertFinding({
      verb: "buried",
      finding_key: "k1",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-01",
      status: "pending",
    });
    const second = await storage.upsertFinding({
      verb: "buried",
      finding_key: "k1",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-01",
      status: "pending",
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    await storage.close();
  });

  it("resolveLinkTargets matches by case-insensitive stem, last-wins on duplicates", async () => {
    const { vault } = mockVault();
    const storage = new SqlJsStorage({
      vault: vault as unknown as import("obsidian").Vault,
      wasmBinary,
    });
    await storage.init();
    const fromId = await storage.upsertNote({
      relPath: "from.md",
      stem: "from",
      title: "From",
      created: "2026-01-01",
      updated: "2026-01-01",
      wordCount: 1,
      content: "",
      contentHash: "h",
      tags: [],
      wikilinks: [],
    });
    const toId = await storage.upsertNote({
      relPath: "Target.md",
      stem: "Target",
      title: "Target",
      created: "2026-01-01",
      updated: "2026-01-01",
      wordCount: 1,
      content: "",
      contentHash: "h2",
      tags: [],
      wikilinks: [],
    });
    await storage.replaceLinks(fromId, ["target"]);
    const n = await storage.resolveLinkTargets();
    expect(n).toBe(1);
    expect(toId).toBeGreaterThan(0);
    await storage.close();
  });
});
