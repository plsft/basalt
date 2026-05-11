import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockEmbedder } from "./adapters/embedding-mock";
import { MemoryFilesystem } from "./adapters/filesystem-memory";
import { MemoryStorage } from "./adapters/storage-memory";
import { _clearVerbRegistryForTesting, Engine, registerVerb } from "./engine";
import type { BuriedInsightFinding } from "./verbs/types";

const VAULT = "/v";

function fixtureFs(): MemoryFilesystem {
  return new MemoryFilesystem({
    [`${VAULT}/A.md`]: "body of A with some content here today my friend",
    [`${VAULT}/B.md`]: "body of B with [[A]] linked",
    [`${VAULT}/C.md`]: "body of C contains the central idea here today",
  });
}

afterEach(() => {
  _clearVerbRegistryForTesting();
});

describe("Engine.create — adapter validation", () => {
  it("rejects when storage is missing/invalid", async () => {
    const fs = fixtureFs();
    const embed = new MockEmbedder({ dim: 8 });
    await expect(
      Engine.create({
        storage: undefined as unknown as MemoryStorage,
        embedding: embed,
        filesystem: fs,
      }),
    ).rejects.toThrow(/storage/);
  });

  it("rejects when embedding is missing/invalid", async () => {
    const fs = fixtureFs();
    const storage = new MemoryStorage();
    await expect(
      Engine.create({ storage, embedding: undefined as unknown as MockEmbedder, filesystem: fs }),
    ).rejects.toThrow(/embedding/);
  });

  it("rejects when filesystem is missing/invalid", async () => {
    const embed = new MockEmbedder({ dim: 8 });
    const storage = new MemoryStorage();
    await expect(
      Engine.create({
        storage,
        embedding: embed,
        filesystem: undefined as unknown as MemoryFilesystem,
      }),
    ).rejects.toThrow(/filesystem/);
  });

  it("calls storage.init() during create", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    const fakeStorage = Object.assign(new MemoryStorage(), { init });
    await Engine.create({
      storage: fakeStorage,
      embedding: new MockEmbedder({ dim: 4 }),
      filesystem: fixtureFs(),
    });
    expect(init).toHaveBeenCalledTimes(1);
  });
});

describe("Engine.index — pipeline", () => {
  let storage: MemoryStorage;
  let progressEvents: string[];
  beforeEach(() => {
    storage = new MemoryStorage();
    progressEvents = [];
  });

  it("walks, parses, persists, embeds, and resolves links", async () => {
    const fs = fixtureFs();
    const embed = new MockEmbedder({ dim: 8 });
    const engine = await Engine.create({
      storage,
      embedding: embed,
      filesystem: fs,
      options: { onProgress: (e) => progressEvents.push(e.stage) },
    });
    await engine.index({ vault: VAULT });

    const snap = storage.snapshot();
    expect(snap.notes.map((n) => n.relPath).sort()).toEqual(["A.md", "B.md", "C.md"]);
    expect(snap.embeddings).toHaveLength(3);
    // B → A is the only resolved link.
    const resolved = snap.links.filter((l) => l.targetNoteId !== null);
    expect(resolved).toHaveLength(1);
    expect(progressEvents).toContain("index:start");
    expect(progressEvents).toContain("index:done");
  });

  it("incremental embed: skips embeddings whose content_hash is unchanged", async () => {
    const fs = fixtureFs();
    const embed = new MockEmbedder({ dim: 8 });
    const embedSpy = vi.spyOn(embed, "embed");
    const engine = await Engine.create({ storage, embedding: embed, filesystem: fs });

    await engine.index({ vault: VAULT });
    const firstCallTexts = embedSpy.mock.calls[0]?.[0] ?? [];
    expect(firstCallTexts).toHaveLength(3);
    embedSpy.mockClear();

    await engine.index({ vault: VAULT });
    const secondCallTexts = embedSpy.mock.calls[0]?.[0] ?? [];
    expect(secondCallTexts).toHaveLength(0);
  });

  it("force=true re-embeds every note regardless of cache", async () => {
    const fs = fixtureFs();
    const embed = new MockEmbedder({ dim: 8 });
    const engine = await Engine.create({ storage, embedding: embed, filesystem: fs });
    await engine.index({ vault: VAULT });

    const embedSpy = vi.spyOn(embed, "embed");
    await engine.index({ vault: VAULT, force: true });
    expect(embedSpy.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("onError fires for adapter failures (e.g. bad upsert)", async () => {
    const fs = fixtureFs();
    const embed = new MockEmbedder({ dim: 8 });
    const errors: Array<{ relPath: string | undefined }> = [];
    const failingStorage = new MemoryStorage();
    let calls = 0;
    const original = failingStorage.upsertNote.bind(failingStorage);
    failingStorage.upsertNote = async (n) => {
      calls++;
      if (calls === 2) throw new Error("simulated upsert failure");
      return original(n);
    };
    const engine = await Engine.create({
      storage: failingStorage,
      embedding: embed,
      filesystem: fs,
      options: { onError: (e) => errors.push({ relPath: e.relPath }) },
    });
    await engine.index({ vault: VAULT });
    expect(errors).toHaveLength(1);
  });
});

describe("Engine.brief — verb registry + composition", () => {
  let storage: MemoryStorage;
  beforeEach(async () => {
    storage = new MemoryStorage();
    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
    });
    await engine.index({ vault: VAULT });
  });

  it("invokes registered verbs and composes Brief in canonical order", async () => {
    const fakeBuried: BuriedInsightFinding = {
      verb: "buried-insight",
      schema: 1,
      rel_path: "A.md",
      title: "A",
      stem: "A",
      created: "2024-01-01",
      updated: "2024-06-01",
      word_count: 50,
      score: 1.0,
      hub_density: 0.1,
      hub_penalty: 1,
      inbound_recent_count: 1,
      quote: "q",
      quote_provenance: "first prose sentence",
      vault_age_days: 365,
      thresholds: { min_age_days: 180, min_dormant_days: 60, recent_window_days: 180 },
      validators: [],
    };
    registerVerb("buried-insight", async () => [fakeBuried]);
    registerVerb("connection", async () => []);
    registerVerb("contradiction", async () => []);
    registerVerb("implicit-thesis", async () => []);
    registerVerb("drift", async () => []);

    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: "2026-05-09" },
    });
    const brief = await engine.brief({ section: "all", top: 3 });

    expect(brief.schema).toBe(1);
    expect(brief.section).toBe("all");
    expect(Object.keys(brief.findings)).toEqual([
      "buried_insight",
      "connection",
      "contradiction",
      "implicit_thesis",
      "drift",
    ]);
    expect(brief.findings.buried_insight).toHaveLength(1);
    const first = brief.findings.buried_insight?.[0];
    expect(first?.verb).toBe("buried-insight");
    if (first?.verb === "buried-insight") {
      expect(first.rel_path).toBe("A.md");
    }
    expect(brief.track_record.schema).toBe(1);
  });

  it("emits empty bucket for unregistered verbs", async () => {
    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: "2026-05-09" },
    });
    const brief = await engine.brief({ section: "all" });
    for (const v of [
      "buried_insight",
      "connection",
      "contradiction",
      "implicit_thesis",
      "drift",
    ] as const) {
      expect(brief.findings[v]).toEqual([]);
    }
  });

  it("section=<single> only invokes that verb", async () => {
    const buriedFn = vi.fn(async () => []);
    const driftFn = vi.fn(async () => []);
    registerVerb("buried-insight", buriedFn);
    registerVerb("drift", driftFn);

    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: "2026-05-09" },
    });
    await engine.brief({ section: "drift" });
    expect(buriedFn).not.toHaveBeenCalled();
    expect(driftFn).toHaveBeenCalledTimes(1);
  });

  it("records each finding to calibration storage", async () => {
    const fakeBuried: BuriedInsightFinding = {
      verb: "buried-insight",
      schema: 1,
      rel_path: "A.md",
      title: "A",
      stem: "A",
      created: "2024-01-01",
      updated: "2024-06-01",
      word_count: 50,
      score: 1.0,
      hub_density: 0.1,
      hub_penalty: 1,
      inbound_recent_count: 1,
      quote: "q",
      quote_provenance: "first prose sentence",
      vault_age_days: 365,
      thresholds: { min_age_days: 180, min_dormant_days: 60, recent_window_days: 180 },
      validators: [],
    };
    registerVerb("buried-insight", async () => [fakeBuried]);

    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: "2026-05-09" },
    });
    await engine.brief({ section: "buried-insight" });
    const findings = await storage.listFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]?.verb).toBe("buried-insight");
    expect(findings[0]?.status).toBe("pending");
  });

  it("isolates verb errors via onError; other verbs still run", async () => {
    const errors: string[] = [];
    registerVerb("buried-insight", async () => {
      throw new Error("boom");
    });
    registerVerb("drift", async () => []);

    const fs = fixtureFs();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: {
        today: "2026-05-09",
        onError: (e) => errors.push(e.stage),
      },
    });
    const brief = await engine.brief({ section: "all" });
    expect(errors).toContain("verb:buried-insight");
    expect(brief.findings.buried_insight).toEqual([]);
    expect(brief.findings.drift).toEqual([]);
  });
});

describe("Engine.audit", () => {
  it("returns empty audit results when no pending findings", async () => {
    const fs = fixtureFs();
    const storage = new MemoryStorage();
    const engine = await Engine.create({
      storage,
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: "2026-05-09" },
    });
    const results = await engine.audit();
    expect(results).toEqual([]);
  });
});
