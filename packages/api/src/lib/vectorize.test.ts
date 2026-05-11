import { describe, expect, it } from "vitest";
import { vectorId } from "./vectorize";

describe("vectorize.vectorId", () => {
  it("is deterministic", () => {
    expect(vectorId("u1", "v1", "a.md")).toBe(vectorId("u1", "v1", "a.md"));
  });

  it("differs across users", () => {
    expect(vectorId("u1", "v1", "a.md")).not.toBe(vectorId("u2", "v1", "a.md"));
  });

  it("differs across vaults for the same user", () => {
    expect(vectorId("u1", "v1", "a.md")).not.toBe(vectorId("u1", "v2", "a.md"));
  });

  it("differs across paths within the same user+vault", () => {
    expect(vectorId("u1", "v1", "a.md")).not.toBe(vectorId("u1", "v1", "b.md"));
  });

  it("produces an ASCII-safe ID under 64 chars", () => {
    const id = vectorId(
      "01HXYZ123456789ABCDEF",
      "01HXYZ987654321FEDCBA",
      "deeply/nested/path/with-unicode-ñ-and-spaces.md",
    );
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it("hashes long paths to a fixed-length suffix", () => {
    const short = vectorId("u", "v", "a.md");
    const long = vectorId("u", "v", "/very/long/path/that/keeps/going/forever.md");
    expect(short.length).toBe(long.length);
  });
});
