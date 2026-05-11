import { describe, expect, it } from "vitest";
import { MockEmbedder } from "../adapters/embedding-mock";
import { MemoryFilesystem } from "../adapters/filesystem-memory";
import { MemoryStorage } from "../adapters/storage-memory";
import { Engine } from "../engine";
import { tightNeighborhoods } from "../graph/cliques";
import "./index"; // side-effect: registers thesis

const VAULT = "/v";
const TODAY = "2026-05-09";

describe("tightNeighborhoods (graph/cliques)", () => {
  it("finds a 3-clique when every pair is above threshold", () => {
    // 3×3 sims, every pair = 0.9, diagonal = -1.
    const sims = new Float32Array([-1, 0.9, 0.9, 0.9, -1, 0.9, 0.9, 0.9, -1]);
    const out = tightNeighborhoods(sims, 3, 0.8, 3, 15);
    expect(out).toHaveLength(1);
    expect(out[0]?.memberIdxs.sort()).toEqual([0, 1, 2]);
  });

  it("rejects a triangle where one pair is below threshold (not a near-clique)", () => {
    const sims = new Float32Array([-1, 0.9, 0.5, 0.9, -1, 0.9, 0.5, 0.9, -1]);
    const out = tightNeighborhoods(sims, 3, 0.8, 3, 15);
    // Possible 2-cliques (0,1) and (1,2) but neither hits min_size=3.
    expect(out).toHaveLength(0);
  });

  it("dedupes by member set across different seeds", () => {
    const sims = new Float32Array([-1, 0.9, 0.9, 0.9, -1, 0.9, 0.9, 0.9, -1]);
    const out = tightNeighborhoods(sims, 3, 0.8, 3, 15);
    // All three centroids would otherwise produce the same {0,1,2} cluster.
    expect(out).toHaveLength(1);
  });

  it("respects maxSize", () => {
    // 5×5, all pairs above threshold; maxSize=3 caps cluster to 3 members.
    const n = 5;
    const sims = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sims[i * n + j] = i === j ? -1 : 0.9;
    const out = tightNeighborhoods(sims, n, 0.8, 3, 3);
    for (const c of out) expect(c.memberIdxs.length).toBeLessThanOrEqual(3);
  });
});

describe("findImplicitTheses — Engine integration", () => {
  it("returns empty when fewer than 3 eligible notes", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/A.md`]: "body content here today friend ".repeat(15),
      [`${VAULT}/B.md`]: "body content here today friend ".repeat(15),
    });
    const engine = await Engine.create({
      storage: new MemoryStorage(),
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    const brief = await engine.brief({ section: "implicit-thesis" });
    expect(brief.findings.implicit_thesis).toEqual([]);
  });

  it("emits a finding when 3+ notes form a tight neighborhood with diversity", async () => {
    // Three notes with controlled embeddings forming a tight cluster, in
    // three different folders → satisfies folder-diversity gate.
    const v = (val: number) => {
      const a = new Float32Array(8);
      a[0] = val;
      // Fill remaining for normalisation.
      const rem = Math.sqrt(1 - val * val);
      a[1] = rem;
      return a;
    };
    const filesPaths = [
      `${VAULT}/folder-a/A.md`,
      `${VAULT}/folder-b/B.md`,
      `${VAULT}/folder-c/C.md`,
    ];
    const files = Object.fromEntries(
      filesPaths.map((p, i) => [p, "body content here today friend ".repeat(15) + ` seed-${i}`]),
    );
    const fs = new MemoryFilesystem(files);
    const storage = new MemoryStorage();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    // Override embeddings — three vectors all close to (1, ε) → pairwise
    // cosine ~ 1.0 → forms a tight 3-clique.
    const snap = storage.snapshot();
    const overrides = [v(0.99), v(0.98), v(0.97)];
    for (let i = 0; i < snap.notes.length; i++) {
      await storage.upsertEmbedding(snap.notes[i]!.id, {
        model: "mock",
        contentHash: snap.notes[i]!.contentHash,
        dim: 8,
        vec: overrides[i]!,
      });
    }
    const brief = await engine.brief({ section: "implicit-thesis", top: 3 });
    expect(brief.findings.implicit_thesis?.length ?? 0).toBeGreaterThan(0);
    const top = brief.findings.implicit_thesis![0]!;
    if (top.verb === "implicit-thesis") {
      expect(top.cluster_size).toBe(3);
      expect(top.folder_diversity).toBeGreaterThanOrEqual(2);
      expect(top.members.map((m) => m.folder).sort()).toEqual(["folder-a", "folder-b", "folder-c"]);
      expect(top.centroid.quote.length).toBeGreaterThan(0);
    }
  });

  it("rejects single-folder, short-time clusters via the diversity gate", async () => {
    const v = (val: number) => {
      const a = new Float32Array(8);
      a[0] = val;
      a[1] = Math.sqrt(1 - val * val);
      return a;
    };
    // All three notes in the same folder with the same date → fails BOTH
    // ≥2-folders AND ≥30d-span. Cluster should be discarded.
    const fs = new MemoryFilesystem({
      [`${VAULT}/folder/A.md`]:
        "---\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n" +
        "body content here today friend ".repeat(15),
      [`${VAULT}/folder/B.md`]:
        "---\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n" +
        "body content here today friend ".repeat(15),
      [`${VAULT}/folder/C.md`]:
        "---\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n" +
        "body content here today friend ".repeat(15),
    });
    const storage = new MemoryStorage();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    const snap = storage.snapshot();
    for (let i = 0; i < snap.notes.length; i++) {
      await storage.upsertEmbedding(snap.notes[i]!.id, {
        model: "mock",
        contentHash: snap.notes[i]!.contentHash,
        dim: 8,
        vec: v(0.99),
      });
    }
    const brief = await engine.brief({ section: "implicit-thesis", top: 3 });
    expect(brief.findings.implicit_thesis).toEqual([]);
  });
});
