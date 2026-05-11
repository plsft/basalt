import { describe, expect, it } from "vitest";
import { extractWikilinks, parseMarkdown, sha256Hex, wordCount } from "./markdown";

describe("extractWikilinks", () => {
  it("returns plain targets", () => {
    expect(extractWikilinks("ref [[Note A]] and [[Note B]]")).toEqual(["Note A", "Note B"]);
  });

  it("strips alias suffixes", () => {
    expect(extractWikilinks("[[Note A|alias]] [[Note B|the b]]")).toEqual(["Note A", "Note B"]);
  });

  it("strips anchor suffixes", () => {
    expect(extractWikilinks("[[Note A#section]] [[Note B#sec|alias]]")).toEqual([
      "Note A",
      "Note B",
    ]);
  });

  it("drops empty wikilinks (whitespace-only target)", () => {
    expect(extractWikilinks("[[   ]] [[Real]]")).toEqual(["Real"]);
  });

  it("matches inside fenced code blocks (Python parity — vault.py:14 is regex-only)", () => {
    const body = ["```", "[[InsideCode]]", "```", "[[Outside]]"].join("\n");
    // SPEC.md / docs/parsing-decisions.md: code-block contents are NOT escaped
    // for wikilink detection. Both InsideCode and Outside count.
    expect(extractWikilinks(body)).toEqual(["InsideCode", "Outside"]);
  });
});

describe("wordCount", () => {
  it("returns 0 for empty body", () => {
    expect(wordCount("")).toBe(0);
  });

  it("counts whitespace-separated tokens, dropping empties", () => {
    expect(wordCount("hello world")).toBe(2);
    expect(wordCount("  hello   world\n")).toBe(2);
    expect(wordCount("one\ttwo\nthree")).toBe(3);
  });
});

describe("sha256Hex", () => {
  it("matches the canonical SHA-256 hex of an empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the canonical SHA-256 hex of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("parseMarkdown", () => {
  it("returns null when body is empty (matches walk_vault filter)", async () => {
    expect(await parseMarkdown("---\ntitle: T\n---", { stem: "stem" })).toBeNull();
    expect(await parseMarkdown("", { stem: "stem" })).toBeNull();
  });

  it("uses stem when frontmatter has no title", async () => {
    const r = await parseMarkdown("body content here", { stem: "the-stem" });
    expect(r?.title).toBe("the-stem");
    expect(r?.stem).toBe("the-stem");
  });

  it("uses frontmatter title when present", async () => {
    const r = await parseMarkdown("---\ntitle: Real Title\n---\nbody", { stem: "stem" });
    expect(r?.title).toBe("Real Title");
  });

  it("coerces frontmatter dates", async () => {
    const r = await parseMarkdown("---\ncreated: 2024-01-15\nupdated: 2024-06-30\n---\nbody", {
      stem: "stem",
    });
    expect(r?.created).toBe("2024-01-15");
    expect(r?.updated).toBe("2024-06-30");
  });

  it("falls back to opts.fallback dates when frontmatter missing", async () => {
    const r = await parseMarkdown("body content", {
      stem: "stem",
      fallbackCreated: "2020-01-01",
      fallbackUpdated: "2024-12-31",
    });
    expect(r?.created).toBe("2020-01-01");
    expect(r?.updated).toBe("2024-12-31");
  });

  it("extracts wikilinks from body, not from frontmatter", async () => {
    const r = await parseMarkdown(
      "---\ntitle: T\nlinks: [[InFrontmatter]]\n---\nlink to [[Body]]",
      { stem: "stem" },
    );
    expect(r?.wikilinks).toEqual(["Body"]);
  });

  it("computes word count and content hash on body only", async () => {
    const r = await parseMarkdown("---\ntitle: T\n---\none two three", { stem: "stem" });
    expect(r?.wordCount).toBe(3);
    expect(r?.contentHash).toBe(await sha256Hex("one two three"));
  });

  it("handles code blocks containing wiki-link-looking syntax (parity: regex-only)", async () => {
    const body = ["```", "[[CodeLink]]", "```", "real [[OutsideLink]] here"].join("\n");
    const raw = `---\ntitle: T\n---\n${body}`;
    const r = await parseMarkdown(raw, { stem: "stem" });
    // Per Python reference behavior, both count.
    expect(r?.wikilinks).toEqual(["CodeLink", "OutsideLink"]);
  });
});
