import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SelfhostD1, SelfhostKV, SelfhostR2, SelfhostVectorize } from "./adapters";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "basalt-selfhost-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("SelfhostKV", () => {
  it("round-trips a value", async () => {
    const kv = new SelfhostKV(join(dir, "kv"));
    await kv.put("k", "v");
    expect(await kv.get("k")).toBe("v");
  });

  it("returns null for missing keys", async () => {
    const kv = new SelfhostKV(join(dir, "kv"));
    expect(await kv.get("missing")).toBeNull();
  });

  it("respects expirationTtl", async () => {
    const kv = new SelfhostKV(join(dir, "kv"));
    // negative ttl = already expired
    await kv.put("k", "v", { expirationTtl: -1 });
    expect(await kv.get("k")).toBeNull();
  });

  it("deletes keys", async () => {
    const kv = new SelfhostKV(join(dir, "kv"));
    await kv.put("k", "v");
    await kv.delete("k");
    expect(await kv.get("k")).toBeNull();
  });
});

describe("SelfhostR2", () => {
  it("round-trips a string body", async () => {
    const r2 = new SelfhostR2(join(dir, "r2"));
    await r2.put("a/b/c.json", "hello", {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { user_id: "u1" },
    });
    const obj = await r2.get("a/b/c.json");
    expect(obj).not.toBeNull();
    expect(await obj?.text()).toBe("hello");
  });

  it("head returns size + customMetadata", async () => {
    const r2 = new SelfhostR2(join(dir, "r2"));
    await r2.put("k", "hello", { customMetadata: { tag: "demo" } });
    const meta = await r2.head("k");
    expect(meta).not.toBeNull();
    expect(meta?.size).toBe(5);
    expect(meta?.customMetadata?.tag).toBe("demo");
  });

  it("get returns null for missing keys", async () => {
    const r2 = new SelfhostR2(join(dir, "r2"));
    expect(await r2.get("nope")).toBeNull();
  });
});

describe("SelfhostD1", () => {
  it("executes DDL + simple queries", async () => {
    const d1 = new SelfhostD1(join(dir, "db.sqlite"));
    d1.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);");
    await d1.prepare("INSERT INTO notes (body) VALUES (?)").bind("hello").run();
    const row = await d1.prepare("SELECT body FROM notes WHERE id = 1").first<{ body: string }>();
    expect(row?.body).toBe("hello");
    d1.close();
  });
});

describe("SelfhostVectorize", () => {
  it("upserts + queries vectors with metadata filter", async () => {
    const v = new SelfhostVectorize(join(dir, "vectors.sqlite"));
    try {
      await v.upsert([
        {
          id: "u1_vault1_a",
          values: [1, 0, 0],
          metadata: { user_id: "u1", vault_id: "vault1", rel_path: "a.md" },
        },
        {
          id: "u1_vault1_b",
          values: [0.95, 0.1, 0],
          metadata: { user_id: "u1", vault_id: "vault1", rel_path: "b.md" },
        },
        {
          id: "u2_vault2_c",
          values: [1, 0, 0],
          metadata: { user_id: "u2", vault_id: "vault2", rel_path: "c.md" },
        },
      ]);
      const res = await v.query([1, 0, 0], {
        topK: 2,
        filter: { user_id: { $eq: "u1" } },
      });
      expect(res.matches.length).toBe(2);
      expect(res.matches[0]?.id).toBe("u1_vault1_a");
      expect(res.matches.every((m) => m.id !== "u2_vault2_c")).toBe(true);
    } finally {
      v.close();
    }
  });

  it("$in filter matches multiple vault ids", async () => {
    const v = new SelfhostVectorize(join(dir, "vectors.sqlite"));
    try {
      await v.upsert([
        { id: "a", values: [1, 0], metadata: { user_id: "u", vault_id: "v1" } },
        { id: "b", values: [1, 0], metadata: { user_id: "u", vault_id: "v2" } },
        { id: "c", values: [1, 0], metadata: { user_id: "u", vault_id: "v3" } },
      ]);
      const res = await v.query([1, 0], {
        topK: 10,
        filter: { user_id: { $eq: "u" }, vault_id: { $in: ["v1", "v2"] } },
      });
      expect(res.matches.length).toBe(2);
      expect(new Set(res.matches.map((m) => m.id))).toEqual(new Set(["a", "b"]));
    } finally {
      v.close();
    }
  });

  it("deleteByIds removes vectors", async () => {
    const v = new SelfhostVectorize(join(dir, "vectors.sqlite"));
    try {
      await v.upsert([{ id: "x", values: [1], metadata: { user_id: "u" } }]);
      await v.deleteByIds(["x"]);
      const res = await v.query([1], { topK: 1, filter: { user_id: { $eq: "u" } } });
      expect(res.matches.length).toBe(0);
    } finally {
      v.close();
    }
  });

  it("upsert replaces existing vectors", async () => {
    const v = new SelfhostVectorize(join(dir, "vectors.sqlite"));
    try {
      await v.upsert([{ id: "x", values: [1, 0], metadata: { user_id: "u" } }]);
      await v.upsert([{ id: "x", values: [0, 1], metadata: { user_id: "u", updated: true } }]);
      const res = await v.query([0, 1], { topK: 1, filter: { user_id: { $eq: "u" } } });
      expect(res.matches[0]?.metadata.updated).toBe(true);
    } finally {
      v.close();
    }
  });
});
