import { describe, expect, it } from "vitest";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("produces a 26-character Crockford-base32 string", () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is sortable by leading timestamp", () => {
    const a = ulid(1700000000000);
    const b = ulid(1700000001000);
    expect(a < b).toBe(true);
  });

  it("produces distinct values on rapid calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(ulid());
    expect(ids.size).toBe(1000);
  });

  it("encodes a known timestamp deterministically (first 10 chars)", () => {
    const id1 = ulid(1700000000000);
    const id2 = ulid(1700000000000);
    expect(id1.slice(0, 10)).toBe(id2.slice(0, 10));
  });
});
