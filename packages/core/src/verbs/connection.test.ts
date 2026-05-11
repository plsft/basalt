import { describe, expect, it } from "vitest";
import { MockEmbedder } from "../adapters/embedding-mock";
import { MemoryFilesystem } from "../adapters/filesystem-memory";
import { MemoryStorage } from "../adapters/storage-memory";
import { Engine } from "../engine";
import "./index"; // side-effect: registers connection

const VAULT = "/v";
const TODAY = "2026-05-09";

/** A minimal note body the parser will accept (≥ MIN_WORD_COUNT_60). */
function body(seed: string): string {
  return [
    `Body about ${seed} number one with enough words to clear the floor.`,
    `Body about ${seed} number two with enough words to clear the floor.`,
    `Body about ${seed} number three with enough words to clear the floor.`,
    `Body about ${seed} number four with enough words to clear the floor.`,
    `Body about ${seed} number five with enough words to clear the floor.`,
  ].join("\n");
}

async function makeEngine(
  files: Record<string, string>,
  overrides?: Record<string, Float32Array>,
): Promise<Engine> {
  const fs = new MemoryFilesystem(files);
  const storage = new MemoryStorage();
  const engine = await Engine.create({
    storage,
    embedding: new MockEmbedder({ dim: 16 }),
    filesystem: fs,
    options: { today: TODAY },
  });
  await engine.index({ vault: VAULT });
  // Optionally override stored embeddings to control similarities.
  if (overrides) {
    const snap = storage.snapshot();
    for (const [relPath, vec] of Object.entries(overrides)) {
      const note = snap.notes.find((n) => n.relPath === relPath);
      if (!note) throw new Error(`overrides: no note ${relPath}`);
      await storage.upsertEmbedding(note.id, {
        model: "mock",
        contentHash: note.contentHash,
        dim: vec.length,
        vec,
      });
    }
  }
  return engine;
}

describe("findConnections — Engine integration", () => {
  it("returns empty when no embedding pair clears the threshold", async () => {
    // Two notes in different folders, but mock embedder produces orthogonal-
    // ish vectors for distinct inputs, so similarity stays well below 0.78.
    const engine = await makeEngine({
      [`${VAULT}/folder-a/note-a.md`]: body("alpha"),
      [`${VAULT}/folder-b/note-b.md`]: body("beta"),
    });
    const brief = await engine.brief({ section: "connection", top: 3 });
    expect(brief.findings.connection).toEqual([]);
  });

  it("excludes pairs in the same top-level folder", async () => {
    // Force above-threshold similarity but same folder.
    const v = new Float32Array(16);
    v[0] = 1;
    const w = new Float32Array(16);
    w[0] = 0.95;
    w[1] = Math.sqrt(1 - 0.95 * 0.95);
    const engine = await makeEngine(
      {
        [`${VAULT}/folder-a/note-x.md`]: body("x-content"),
        [`${VAULT}/folder-a/note-y.md`]: body("y-content"),
      },
      { "folder-a/note-x.md": v, "folder-a/note-y.md": w },
    );
    const brief = await engine.brief({ section: "connection", top: 3 });
    expect(brief.findings.connection).toEqual([]);
  });

  it("excludes pairs that already have a wikilink between them", async () => {
    const v = new Float32Array(16);
    v[0] = 1;
    const w = new Float32Array(16);
    w[0] = 0.95;
    w[1] = Math.sqrt(1 - 0.95 * 0.95);
    const engine = await makeEngine(
      {
        [`${VAULT}/folder-a/Linker.md`]: `${body("linker")}\nlink to [[Other]] here`,
        [`${VAULT}/folder-b/Other.md`]: body("other"),
      },
      { "folder-a/Linker.md": v, "folder-b/Other.md": w },
    );
    const brief = await engine.brief({ section: "connection", top: 3 });
    expect(brief.findings.connection).toEqual([]);
  });

  it("emits a finding when two cross-folder notes share content (high cosine)", async () => {
    // Override embeddings so the algorithm sees a clear above-threshold pair.
    const v = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const w = new Float32Array([
      0.95,
      Math.sqrt(1 - 0.95 * 0.95),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    const engine = await makeEngine(
      {
        [`${VAULT}/folder-a/Atlas.md`]: body("atlas-content"),
        [`${VAULT}/folder-b/Bridge.md`]: body("bridge-content"),
      },
      {
        "folder-a/Atlas.md": v,
        "folder-b/Bridge.md": w,
      },
    );
    const brief = await engine.brief({ section: "connection", top: 3 });
    expect(brief.findings.connection?.length).toBeGreaterThan(0);
    const top = brief.findings.connection![0]!;
    expect(top.verb).toBe("connection");
    if (top.verb === "connection") {
      const a = top.note_a.rel_path;
      const b = top.note_b.rel_path;
      expect(new Set([a, b])).toEqual(new Set(["folder-a/Atlas.md", "folder-b/Bridge.md"]));
      expect(top.similarity).toBeCloseTo(0.95, 4);
    }
  });

  it("respects diversity — does not return two pairs sharing an endpoint", async () => {
    // Hub is highly similar to both B and C; diversity pass should keep only
    // one pair touching Hub.
    const hub = new Float32Array(16);
    hub[0] = 1;
    const bVec = new Float32Array(16);
    bVec[0] = 0.95;
    bVec[1] = Math.sqrt(1 - 0.95 * 0.95);
    const cVec = new Float32Array(16);
    cVec[0] = 0.9;
    cVec[2] = Math.sqrt(1 - 0.9 * 0.9);
    const engine = await makeEngine(
      {
        [`${VAULT}/folder-a/Hub.md`]: body("hub"),
        [`${VAULT}/folder-b/B.md`]: body("b"),
        [`${VAULT}/folder-c/C.md`]: body("c"),
      },
      { "folder-a/Hub.md": hub, "folder-b/B.md": bVec, "folder-c/C.md": cVec },
    );
    const brief = await engine.brief({ section: "connection", top: 3 });
    const findings = brief.findings.connection ?? [];
    const seen = new Set<string>();
    for (const f of findings) {
      if (f.verb !== "connection") continue;
      expect(seen.has(f.note_a.rel_path)).toBe(false);
      expect(seen.has(f.note_b.rel_path)).toBe(false);
      seen.add(f.note_a.rel_path);
      seen.add(f.note_b.rel_path);
    }
    expect(findings.length).toBeLessThanOrEqual(1);
  });
});
