import { describe, expect, it } from "vitest";
import { MemoryFilesystem } from "../adapters/filesystem-memory";
import { buildLinkGraph, incomingResolved, outgoingResolved } from "./builder";

const VAULT = "/v";

function note(stem: string, body: string): [string, string] {
  return [`${VAULT}/${stem}.md`, body];
}

describe("buildLinkGraph", () => {
  it("walks, parses, and assigns sequential ids in path-sorted order", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/B.md`]: "body of B",
      [`${VAULT}/A.md`]: "body of A",
      [`${VAULT}/C.md`]: "body of C",
    });
    const g = await buildLinkGraph(fs, VAULT);
    expect(g.notes.map((n) => n.stem)).toEqual(["A", "B", "C"]);
    expect(g.notes.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("computes relPath relative to the vault root", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/01-Daily/2026-05-09.md`]: "daily body",
      [`${VAULT}/02-Projects/Atlas/HYPOTHESIS.md`]: "hypothesis body",
    });
    const g = await buildLinkGraph(fs, VAULT);
    expect(g.notes.map((n) => n.relPath).sort()).toEqual([
      "01-Daily/2026-05-09.md",
      "02-Projects/Atlas/HYPOTHESIS.md",
    ]);
  });

  it("resolves wikilinks by case-insensitive stem match", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Source.md`]: "links to [[Target]] and [[TARGET]]",
      [`${VAULT}/Target.md`]: "the target body content here",
    });
    const g = await buildLinkGraph(fs, VAULT);
    const source = g.notesByPath.get("Source.md")!;
    const target = g.notesByPath.get("Target.md")!;
    const out = outgoingResolved(g, source.id);
    expect(out).toEqual([target.id, target.id]);
  });

  it("preserves unresolved wikilinks (target stem doesn't exist)", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Source.md`]: "broken link to [[Nonexistent]] page",
    });
    const g = await buildLinkGraph(fs, VAULT);
    expect(g.links).toHaveLength(1);
    expect(g.links[0]?.target).toBe("Nonexistent");
    expect(g.links[0]?.targetId).toBeNull();
  });

  it("on duplicate stems, last seen wins (mirrors index.py:resolve_link_targets)", async () => {
    // Two Atlas.md files; later in walk order takes the stem.
    const fs = new MemoryFilesystem({
      [`${VAULT}/01-First/Atlas.md`]: "first atlas body content here today",
      [`${VAULT}/02-Second/Atlas.md`]: "second atlas body content right now",
      [`${VAULT}/Linker.md`]: "ref [[Atlas]] here",
    });
    const g = await buildLinkGraph(fs, VAULT);
    const second = g.notesByPath.get("02-Second/Atlas.md")!;
    const linker = g.notesByPath.get("Linker.md")!;
    expect(outgoingResolved(g, linker.id)).toEqual([second.id]);
  });

  it("computes outLinkCount as DISTINCT targets per source (matches SQL DISTINCT)", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Source.md`]:
        "two refs to [[Target]] and [[Target]] count as one for hub density purposes",
      [`${VAULT}/Target.md`]: "target body content here today",
    });
    const g = await buildLinkGraph(fs, VAULT);
    const source = g.notesByPath.get("Source.md")!;
    expect(g.outLinkCount.get(source.id)).toBe(1);
  });

  it("populates incomingResolved correctly for back-link traversal", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Hub.md`]: "[[A]] [[B]] [[C]]",
      [`${VAULT}/A.md`]: "a body content here today friend",
      [`${VAULT}/B.md`]: "b body content here today friend",
      [`${VAULT}/C.md`]: "c body content here today friend",
    });
    const g = await buildLinkGraph(fs, VAULT);
    const hub = g.notesByPath.get("Hub.md")!;
    for (const stem of ["A", "B", "C"]) {
      const target = g.notesByPath.get(`${stem}.md`)!;
      expect(incomingResolved(g, target.id)).toEqual([hub.id]);
    }
  });

  it("computes hub density per note via the canonical formula", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Many.md`]: "[[A]] [[B]] [[C]] [[D]] words " + "and ".repeat(40),
      [`${VAULT}/A.md`]: "a body content here today friend",
      [`${VAULT}/B.md`]: "b body content here today friend",
      [`${VAULT}/C.md`]: "c body content here today friend",
      [`${VAULT}/D.md`]: "d body content here today friend",
    });
    const g = await buildLinkGraph(fs, VAULT);
    const many = g.notesByPath.get("Many.md")!;
    // 4 distinct outgoing targets; word_count of "Many" body ≈ 5 + 40*2 = 85.
    // density = 4 / max(85/100, 1) = 4 / 1 = 4.
    expect(g.outLinkCount.get(many.id)).toBe(4);
    expect(g.density.get(many.id)).toBeCloseTo(4, 5);
  });

  it("skips empty-body notes (matches walk_vault's word_count > 0 filter)", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/Empty.md`]: "---\ntitle: T\n---\n",
      [`${VAULT}/Real.md`]: "real body content here today my friend",
    });
    const g = await buildLinkGraph(fs, VAULT);
    expect(g.notes.map((n) => n.stem)).toEqual(["Real"]);
  });
});
