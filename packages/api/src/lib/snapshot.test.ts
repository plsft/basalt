import { describe, expect, it } from "vitest";
import { decodeFloat32LE, encodeFloat32LE, VaultSnapshot } from "./snapshot";

describe("snapshot float32 round-trip", () => {
  it("encodes and decodes a vector byte-for-byte", () => {
    const vec = new Float32Array(8);
    for (let i = 0; i < 8; i++) vec[i] = i / 7;
    const b64 = encodeFloat32LE(vec);
    const back = decodeFloat32LE(b64);
    expect(Array.from(back)).toEqual(Array.from(vec));
  });

  it("handles a zero-length vector", () => {
    const b64 = encodeFloat32LE(new Float32Array(0));
    const back = decodeFloat32LE(b64);
    expect(back.length).toBe(0);
  });

  it("preserves a 768-dim normalized embedding", () => {
    const vec = new Float32Array(768);
    let sumsq = 0;
    for (let i = 0; i < 768; i++) {
      vec[i] = Math.sin(i / 13);
      sumsq += (vec[i] ?? 0) ** 2;
    }
    const norm = Math.sqrt(sumsq);
    for (let i = 0; i < 768; i++) vec[i] = (vec[i] ?? 0) / norm;
    const round = decodeFloat32LE(encodeFloat32LE(vec));
    expect(round.length).toBe(768);
    for (let i = 0; i < 768; i++) {
      expect(Math.abs((round[i] ?? 0) - (vec[i] ?? 0))).toBeLessThan(1e-6);
    }
  });
});

describe("VaultSnapshot schema", () => {
  it("accepts a minimal valid snapshot", () => {
    const s = {
      schema: 1,
      vault_id: "vault_123",
      created_at: "2026-05-11T12:00:00Z",
      notes: [
        {
          rel_path: "alpha.md",
          stem: "alpha",
          title: "Alpha",
          word_count: 12,
          content: "hello",
          content_hash: "deadbeef",
          tags: [],
        },
      ],
      embeddings: [],
      links: [],
    };
    const parsed = VaultSnapshot.safeParse(s);
    expect(parsed.success).toBe(true);
  });

  it("rejects mismatched schema version", () => {
    const r = VaultSnapshot.safeParse({
      schema: 2,
      vault_id: "v",
      created_at: "2026-05-11T12:00:00Z",
      notes: [],
      embeddings: [],
      links: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative word_count", () => {
    const r = VaultSnapshot.safeParse({
      schema: 1,
      vault_id: "v",
      created_at: "2026-05-11T12:00:00Z",
      notes: [
        {
          rel_path: "a.md",
          stem: "a",
          title: "A",
          word_count: -1,
          content: "",
          content_hash: "h",
          tags: [],
        },
      ],
      embeddings: [],
      links: [],
    });
    expect(r.success).toBe(false);
  });

  it("allows optional today field", () => {
    const r = VaultSnapshot.safeParse({
      schema: 1,
      vault_id: "v",
      created_at: "2026-05-11T12:00:00Z",
      today: "2026-05-11",
      notes: [],
      embeddings: [],
      links: [],
    });
    expect(r.success).toBe(true);
  });
});
