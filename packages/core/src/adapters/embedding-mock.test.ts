import { describe, expect, it } from "vitest";
import { MockEmbedder } from "./embedding-mock";

describe("MockEmbedder", () => {
  it("returns a vector of the requested dimension", async () => {
    const e = new MockEmbedder({ dim: 16 });
    const [v] = await e.embed(["hello"]);
    expect(v).toBeDefined();
    expect(v?.length).toBe(16);
  });

  it("defaults to dim 768 (matches nomic-embed-text)", async () => {
    const e = new MockEmbedder();
    expect(e.dimension()).toBe(768);
    const [v] = await e.embed(["x"]);
    expect(v?.length).toBe(768);
  });

  it("is deterministic — same input → byte-identical output", async () => {
    const e1 = new MockEmbedder({ dim: 32 });
    const e2 = new MockEmbedder({ dim: 32 });
    const [v1] = await e1.embed(["determine me"]);
    const [v2] = await e2.embed(["determine me"]);
    expect(Array.from(v1!)).toEqual(Array.from(v2!));
  });

  it("returns L2-normalized vectors", async () => {
    const e = new MockEmbedder({ dim: 64 });
    const [v] = await e.embed(["norm test"]);
    let normSq = 0;
    for (const x of v!) normSq += x * x;
    expect(normSq).toBeCloseTo(1.0, 5);
  });

  it("distinct inputs produce distinct vectors", async () => {
    const e = new MockEmbedder({ dim: 32 });
    const vecs = await e.embed(["alpha", "beta", "gamma"]);
    const a = Array.from(vecs[0]!);
    const b = Array.from(vecs[1]!);
    const c = Array.from(vecs[2]!);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });

  it("embed() preserves input order", async () => {
    const e = new MockEmbedder({ dim: 16 });
    const inputs = ["one", "two", "three", "four", "five"];
    const vecs = await e.embed(inputs);
    expect(vecs).toHaveLength(inputs.length);
    // Recompute one-by-one and verify positional match.
    for (let i = 0; i < inputs.length; i++) {
      const [single] = await e.embed([inputs[i]!]);
      expect(Array.from(vecs[i]!)).toEqual(Array.from(single!));
    }
  });

  it("modelId() returns the configured model", () => {
    const e = new MockEmbedder({ modelId: "custom-mock" });
    expect(e.modelId()).toBe("custom-mock");
  });
});
