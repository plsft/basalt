import { MemoryStorage } from "basalted-core";
import { describe, expect, it } from "vitest";
import { buildSnapshot, encodeFloat32LE } from "./snapshot";

describe("encodeFloat32LE", () => {
  it("round-trips through base64 little-endian", () => {
    const vec = new Float32Array([1, -1, 0.5, 0]);
    const b64 = encodeFloat32LE(vec);
    const bytes = Buffer.from(b64, "base64");
    expect(bytes.byteLength).toBe(16);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(0, true)).toBe(1);
    expect(view.getFloat32(4, true)).toBe(-1);
    expect(view.getFloat32(8, true)).toBe(0.5);
    expect(view.getFloat32(12, true)).toBe(0);
  });

  it("handles a zero-length vector", () => {
    expect(encodeFloat32LE(new Float32Array(0))).toBe("");
  });
});

describe("buildSnapshot", () => {
  it("serializes notes + embeddings into the on-the-wire shape", async () => {
    const storage = new MemoryStorage();
    await storage.init();
    const id = await storage.upsertNote({
      path: "/v/a.md",
      relPath: "a.md",
      stem: "a",
      title: "A",
      created: "2026-01-01",
      updated: "2026-05-01",
      wordCount: 100,
      content: "body",
      contentHash: "h-a",
      tags: ["t1"],
      wikilinks: [],
    });
    const vec = new Float32Array(8);
    for (let i = 0; i < 8; i++) vec[i] = i / 7;
    await storage.upsertEmbedding(id, {
      model: "nomic",
      contentHash: "h-a",
      dim: 8,
      vec,
    });

    const snap = await buildSnapshot(storage, "vault_demo");
    expect(snap.schema).toBe(1);
    expect(snap.vault_id).toBe("vault_demo");
    expect(snap.notes).toHaveLength(1);
    expect(snap.notes[0]?.rel_path).toBe("a.md");
    expect(snap.notes[0]?.word_count).toBe(100);
    expect(snap.embeddings).toHaveLength(1);
    expect(snap.embeddings[0]?.dim).toBe(8);
    expect(snap.embeddings[0]?.vec_b64.length).toBeGreaterThan(0);
    expect(snap.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("skips orphan embeddings whose noteId no longer maps to a note", async () => {
    const storage = new MemoryStorage();
    await storage.init();
    // No note inserted — embedding for a nonexistent noteId should be dropped.
    await storage.upsertEmbedding(999, {
      model: "x",
      contentHash: "y",
      dim: 4,
      vec: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    });
    const snap = await buildSnapshot(storage, "vault_empty");
    expect(snap.notes).toHaveLength(0);
    expect(snap.embeddings).toHaveLength(0);
  });

  it("preserves tag ordering and null dates", async () => {
    const storage = new MemoryStorage();
    await storage.init();
    await storage.upsertNote({
      path: "/v/b.md",
      relPath: "b.md",
      stem: "b",
      title: "B",
      created: null,
      updated: null,
      wordCount: 50,
      content: "x",
      contentHash: "h-b",
      tags: ["zeta", "alpha", "beta"],
      wikilinks: [],
    });
    const snap = await buildSnapshot(storage, "v");
    expect(snap.notes[0]?.tags).toEqual(["zeta", "alpha", "beta"]);
    expect(snap.notes[0]?.created).toBeUndefined();
  });
});
