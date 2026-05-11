import { describe, expect, it } from "vitest";
import { coerceDate, coerceTags, parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty metadata + raw body when no frontmatter present", () => {
    const r = parseFrontmatter("# heading\n\nbody text");
    expect(r.metadata).toEqual({});
    expect(r.body).toBe("# heading\n\nbody text");
  });

  it("extracts metadata + body when frontmatter present (body trimmed)", () => {
    const raw = ["---", "title: Hello", "tags: [a, b]", "---", "", "body line 1", ""].join("\n");
    const r = parseFrontmatter(raw);
    expect(r.metadata).toMatchObject({ title: "Hello", tags: ["a", "b"] });
    // python-frontmatter applies `.strip()` on body before returning.
    expect(r.body).toBe("body line 1");
  });

  it("returns empty metadata + stripped raw body when YAML is invalid", () => {
    const raw = ["---", "title: [unbalanced", "---", "body"].join("\n");
    const r = parseFrontmatter(raw);
    expect(r.metadata).toEqual({});
    // Matches python-frontmatter's split-failure path: body = stripped raw.
    expect(r.body).toBe(raw.trim());
  });

  it("handles closing fence at the end of the file (no trailing newline)", () => {
    const raw = "---\ntitle: A\n---";
    const r = parseFrontmatter(raw);
    expect(r.metadata).toEqual({ title: "A" });
    expect(r.body).toBe("");
  });

  it("treats a frontmatter that doesn't open with --- as no frontmatter", () => {
    const r = parseFrontmatter("title: nope\nbody");
    expect(r.metadata).toEqual({});
    expect(r.body).toBe("title: nope\nbody");
  });

  it("returns empty metadata when YAML root is a scalar (not a mapping)", () => {
    const r = parseFrontmatter("---\nstring scalar\n---\nbody");
    expect(r.metadata).toEqual({});
    expect(r.body).toBe("body");
  });
});

describe("coerceDate", () => {
  it("returns null for null/undefined", () => {
    expect(coerceDate(null)).toBeNull();
    expect(coerceDate(undefined)).toBeNull();
  });

  it("formats Date instances as YYYY-MM-DD UTC", () => {
    expect(coerceDate(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01-15");
    expect(coerceDate(new Date(Date.UTC(2024, 11, 31)))).toBe("2024-12-31");
  });

  it("returns null for invalid Date", () => {
    expect(coerceDate(new Date("not a date"))).toBeNull();
  });

  it("accepts %Y-%m-%d strings", () => {
    expect(coerceDate("2026-05-09")).toBe("2026-05-09");
  });

  it("accepts %Y/%m/%d strings (normalises to ISO)", () => {
    expect(coerceDate("2026/05/09")).toBe("2026-05-09");
  });

  it("accepts %Y-%m-%dT%H:%M:%S strings (date part only)", () => {
    expect(coerceDate("2026-05-09T14:30:00")).toBe("2026-05-09");
  });

  it("truncates over-long strings to 19 chars before probing", () => {
    expect(coerceDate("2026-05-09T14:30:00.123456+00:00")).toBe("2026-05-09");
  });

  it("returns null for unrecognised string format", () => {
    expect(coerceDate("May 9, 2026")).toBeNull();
    expect(coerceDate("")).toBeNull();
  });

  it("returns null for non-string non-Date inputs", () => {
    expect(coerceDate(123)).toBeNull();
    expect(coerceDate({})).toBeNull();
    expect(coerceDate([])).toBeNull();
  });
});

describe("coerceTags", () => {
  it("splits comma-separated string into trimmed array", () => {
    expect(coerceTags("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("drops empty entries from string split", () => {
    expect(coerceTags("a,,b,")).toEqual(["a", "b"]);
  });

  it("string-coerces and trims list items", () => {
    expect(coerceTags(["a", " b ", 42, ""])).toEqual(["a", "b", "42"]);
  });

  it("returns empty for non-string non-list", () => {
    expect(coerceTags(null)).toEqual([]);
    expect(coerceTags(undefined)).toEqual([]);
    expect(coerceTags({})).toEqual([]);
    expect(coerceTags(0)).toEqual([]);
  });

  it("returns empty for empty string and empty array", () => {
    expect(coerceTags("")).toEqual([]);
    expect(coerceTags([])).toEqual([]);
  });
});
