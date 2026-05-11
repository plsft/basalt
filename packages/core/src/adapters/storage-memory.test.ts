import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { MemoryStorage } from "./storage-memory";

function note(overrides: Partial<Note> = {}): Note {
  return {
    path: "/v/A.md",
    relPath: "A.md",
    stem: "A",
    title: "A",
    created: "2024-01-01",
    updated: "2024-06-01",
    tags: [],
    content: "body",
    wikilinks: [],
    wordCount: 1,
    contentHash: "abc",
    ...overrides,
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("MemoryStorage — notes", () => {
  it("upsertNote returns sequential ids on first insert", async () => {
    const s = new MemoryStorage();
    const a = await s.upsertNote(note({ relPath: "A.md", stem: "A" }));
    const b = await s.upsertNote(note({ relPath: "B.md", stem: "B" }));
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it("upsertNote returns existing id on relPath conflict (upsert behavior)", async () => {
    const s = new MemoryStorage();
    const a = await s.upsertNote(note({ relPath: "A.md", title: "first" }));
    const aAgain = await s.upsertNote(note({ relPath: "A.md", title: "second" }));
    expect(aAgain).toBe(a);
    const stored = await s.getNote("A.md");
    expect(stored?.title).toBe("second");
  });

  it("preserves original `created` on upsert (mirrors COALESCE in index.py:96)", async () => {
    const s = new MemoryStorage();
    await s.upsertNote(note({ relPath: "A.md", created: "2020-01-01", updated: "2020-01-02" }));
    await s.upsertNote(note({ relPath: "A.md", created: "2024-12-31", updated: "2025-01-01" }));
    const stored = await s.getNote("A.md");
    expect(stored?.created).toBe("2020-01-01");
    expect(stored?.updated).toBe("2025-01-01");
  });

  it("listNotes yields all notes", async () => {
    const s = new MemoryStorage();
    await s.upsertNote(note({ relPath: "A.md", stem: "A" }));
    await s.upsertNote(note({ relPath: "B.md", stem: "B" }));
    const notes = await collect(s.listNotes());
    expect(notes.map((n) => n.relPath).sort()).toEqual(["A.md", "B.md"]);
  });

  it("getNote returns null for missing path", async () => {
    const s = new MemoryStorage();
    expect(await s.getNote("nope.md")).toBeNull();
  });
});

describe("MemoryStorage — embeddings", () => {
  it("upsert + get round-trips a Float32Array", async () => {
    const s = new MemoryStorage();
    const id = await s.upsertNote(note());
    const v = new Float32Array([0.1, 0.2, 0.3]);
    await s.upsertEmbedding(id, { model: "nomic", contentHash: "abc", dim: 3, vec: v });
    const got = await s.getEmbedding(id);
    expect(got?.dim).toBe(3);
    expect(Array.from(got?.vec ?? [])).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
    ]);
  });

  it("upsertEmbedding overwrites on conflict (PRIMARY KEY note_id)", async () => {
    const s = new MemoryStorage();
    const id = await s.upsertNote(note());
    await s.upsertEmbedding(id, {
      model: "old",
      contentHash: "h1",
      dim: 2,
      vec: new Float32Array([1, 0]),
    });
    await s.upsertEmbedding(id, {
      model: "new",
      contentHash: "h2",
      dim: 2,
      vec: new Float32Array([0, 1]),
    });
    const got = await s.getEmbedding(id);
    expect(got?.model).toBe("new");
    expect(got?.contentHash).toBe("h2");
  });

  it("listEmbeddings emits in note_id order (matches Python ORDER BY note_id)", async () => {
    const s = new MemoryStorage();
    const a = await s.upsertNote(note({ relPath: "A.md", stem: "A" }));
    const b = await s.upsertNote(note({ relPath: "B.md", stem: "B" }));
    await s.upsertEmbedding(b, {
      model: "m",
      contentHash: "h",
      dim: 2,
      vec: new Float32Array([1, 0]),
    });
    await s.upsertEmbedding(a, {
      model: "m",
      contentHash: "h",
      dim: 2,
      vec: new Float32Array([0, 1]),
    });
    const list = await collect(s.listEmbeddings());
    expect(list.map((e) => e.noteId)).toEqual([a, b]);
  });
});

describe("MemoryStorage — links", () => {
  it("replaceLinks clears prior outgoing edges for the note", async () => {
    const s = new MemoryStorage();
    const a = await s.upsertNote(note());
    await s.replaceLinks(a, ["X", "Y"]);
    await s.replaceLinks(a, ["Z"]);
    const snap = s.snapshot();
    expect(snap.links.filter((l) => l.fromNoteId === a).map((l) => l.target)).toEqual(["Z"]);
  });

  it("resolveLinkTargets matches stems case-insensitively, last-stem-wins on duplicates", async () => {
    const s = new MemoryStorage();
    const linker = await s.upsertNote(note({ relPath: "Linker.md", stem: "Linker" }));
    await s.upsertNote(note({ relPath: "01/Atlas.md", stem: "Atlas", title: "first" }));
    const second = await s.upsertNote(
      note({ relPath: "02/Atlas.md", stem: "Atlas", title: "second" }),
    );
    await s.replaceLinks(linker, ["ATLAS", "Nope"]);
    const resolved = await s.resolveLinkTargets();
    expect(resolved).toBe(1);
    const snap = s.snapshot();
    const link = snap.links.find((l) => l.target === "ATLAS");
    expect(link?.targetNoteId).toBe(second);
    const broken = snap.links.find((l) => l.target === "Nope");
    expect(broken?.targetNoteId).toBeNull();
  });
});

describe("MemoryStorage — findings (calibration)", () => {
  it("upsertFinding inserts; same (verb, finding_key) while pending is no-op", async () => {
    const s = new MemoryStorage();
    const id1 = await s.upsertFinding({
      verb: "buried-insight",
      finding_key: "buried-insight:notes/a.md",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-09",
      status: "pending",
    });
    expect(id1).toBe(1);
    const id2 = await s.upsertFinding({
      verb: "buried-insight",
      finding_key: "buried-insight:notes/a.md",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-09",
      status: "pending",
    });
    expect(id2).toBeNull();
  });

  it("listFindings filters by verb + status + since + limit", async () => {
    const s = new MemoryStorage();
    await s.upsertFinding({
      verb: "buried-insight",
      finding_key: "k1",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-01",
      status: "pending",
    });
    await s.upsertFinding({
      verb: "buried-insight",
      finding_key: "k2",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-09",
      status: "confirmed",
    });
    await s.upsertFinding({
      verb: "drift",
      finding_key: "k3",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-09",
      status: "pending",
    });

    expect((await s.listFindings({ verb: "buried-insight" })).map((f) => f.finding_key)).toEqual([
      "k1",
      "k2",
    ]);
    expect((await s.listFindings({ status: "pending" })).length).toBe(2);
    expect((await s.listFindings({ since: "2026-05-09" })).length).toBe(2);
    expect((await s.listFindings({ limit: 1 })).length).toBe(1);
  });

  it("updateFindingStatus moves a brief off pending and records verdict", async () => {
    const s = new MemoryStorage();
    const id = await s.upsertFinding({
      verb: "connection",
      finding_key: "c1",
      finding_json: "{}",
      falsification: "[]",
      created_at: "2026-05-09",
      status: "pending",
    });
    expect(id).toBe(1);
    await s.updateFindingStatus(id!, "confirmed", "2026-06-08", "you linked them");
    const list = await s.listFindings();
    expect(list[0]?.status).toBe("confirmed");
    expect(list[0]?.verdict_at).toBe("2026-06-08");
    expect(list[0]?.verdict_reason).toBe("you linked them");
  });
});

describe("MemoryStorage — meta", () => {
  it("get/set round-trips arbitrary keys", async () => {
    const s = new MemoryStorage();
    expect(await s.getMeta("missing")).toBeNull();
    await s.setMeta("first_run_seen", "1762291200");
    expect(await s.getMeta("first_run_seen")).toBe("1762291200");
  });
});
