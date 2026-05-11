import { describe, expect, it } from "vitest";
import { MockEmbedder } from "../adapters/embedding-mock";
import { MemoryFilesystem } from "../adapters/filesystem-memory";
import { MemoryStorage } from "../adapters/storage-memory";
import { Engine } from "../engine";
import "./index"; // side-effect: registers buried-insight

const VAULT = "/v";
const TODAY = "2026-05-09";

/** Build a vault with one obvious "buried insight" candidate (old, dormant,
 *  validated by 3 recent notes). Returns the engine ready to run brief. */
async function vaultWithBuriedCandidate(): Promise<Engine> {
  // Old + dormant: created 18 months ago, last updated 12 months ago
  const oldNote = [
    "---",
    "title: Worth pinning",
    "created: 2024-11-09",
    "updated: 2025-05-09",
    "---",
    "The moat isn't speed alone — it's the user's willingness to keep coming back.",
    "Compounding only happens to people who don't optimize for the next quarter.",
    "Trust is not a metric; it's a side effect of doing the boring thing for years.",
    "What you measure is what you incentivize, what you publicize is what you actually value.",
    "The cheapest correction happens when the constraint is still legible.",
  ].join("\n");

  // Three recent notes that link to the old one. Each must have ≥30 words
  // (MIN_WORD_COUNT) to count as a "recent" note in the buried algorithm.
  const recent1 = [
    "---",
    "title: Recent A",
    "created: 2026-04-09",
    "updated: 2026-04-09",
    "---",
    "Re-reading [[Worth pinning]] — the moat point still lands today.",
    "Spent the morning reflecting on the through-line of trust over speed.",
    "The argument that compounding requires patience matters more than ever.",
    "I keep coming back to this note when planning the quarter ahead.",
  ].join("\n");
  const recent2 = [
    "---",
    "title: Recent B",
    "created: 2026-04-15",
    "updated: 2026-04-15",
    "---",
    "Linking to [[Worth pinning]] from this week's planning note for the team.",
    "Compounding is about patience and refusing to optimize for the next quarter.",
    "Trust-as-side-effect is the line that keeps surfacing in my retrospectives.",
    "We should make this part of the strategy doc when the new cycle starts.",
  ].join("\n");
  const recent3 = [
    "---",
    "title: Recent C",
    "created: 2026-05-01",
    "updated: 2026-05-01",
    "---",
    "Yet another reflection — see [[Worth pinning]] for the original framing.",
    "The trust-as-side-effect line keeps coming back to my weekly review.",
    "What we measure shapes the team — but what we publicize shapes culture.",
    "Boring software for a decade is a moat the loud competition can't copy.",
  ].join("\n");

  const fs = new MemoryFilesystem({
    [`${VAULT}/Worth pinning.md`]: oldNote,
    [`${VAULT}/Recent A.md`]: recent1,
    [`${VAULT}/Recent B.md`]: recent2,
    [`${VAULT}/Recent C.md`]: recent3,
  });
  const storage = new MemoryStorage();
  const embed = new MockEmbedder({ dim: 16 });
  const engine = await Engine.create({
    storage,
    embedding: embed,
    filesystem: fs,
    options: { today: TODAY },
  });
  await engine.index({ vault: VAULT });
  return engine;
}

describe("findBuriedInsights — integration via Engine", () => {
  it("surfaces an old + dormant note with ≥3 explicit recent validators", async () => {
    const engine = await vaultWithBuriedCandidate();
    const brief = await engine.brief({ section: "buried-insight", top: 3 });
    expect(brief.findings.buried_insight).toBeDefined();
    expect(brief.findings.buried_insight!.length).toBeGreaterThan(0);
    const top = brief.findings.buried_insight![0]!;
    expect(top.verb).toBe("buried-insight");
    if (top.verb === "buried-insight") {
      expect(top.rel_path).toBe("Worth pinning.md");
      expect(top.inbound_recent_count).toBeGreaterThanOrEqual(3);
      expect(top.thresholds.min_age_days).toBeGreaterThanOrEqual(60);
      expect(top.quote.length).toBeGreaterThan(0);
    }
  });

  it("returns empty when no candidate has ≥3 validators", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/old.md`]: [
        "---",
        "title: Old",
        "created: 2024-01-01",
        "updated: 2024-06-01",
        "---",
        "Body content here today my friend with enough words to clear the floor.",
      ].join("\n"),
      [`${VAULT}/recent.md`]: [
        "---",
        "title: Recent",
        "created: 2026-04-09",
        "updated: 2026-04-09",
        "---",
        "Single recent note — not enough validators for buried.",
      ].join("\n"),
    });
    const engine = await Engine.create({
      storage: new MemoryStorage(),
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    const brief = await engine.brief({ section: "buried-insight" });
    expect(brief.findings.buried_insight).toEqual([]);
  });

  it("returns empty on an empty vault", async () => {
    const fs = new MemoryFilesystem({
      [`${VAULT}/x.md`]: "ignore me",
    });
    const engine = await Engine.create({
      storage: new MemoryStorage(),
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    // Single note can't validate anything.
    const brief = await engine.brief({ section: "buried-insight" });
    expect(brief.findings.buried_insight).toEqual([]);
  });

  it("excludes hub-density notes (above HUB_DENSITY_HARD = 1.5) from candidates", async () => {
    // Build an old note that LOOKS buried but is actually a MOC (high
    // outgoing link density). It should be excluded.
    const moc = [
      "---",
      "title: MOC Old",
      "created: 2024-01-01",
      "updated: 2024-06-01",
      "---",
      ...Array.from({ length: 30 }, (_, i) => `- [[Target-${i}]]`),
    ].join("\n");
    const targets = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `${VAULT}/Target-${i}.md`,
        `---\ncreated: 2026-04-${String((i % 28) + 1).padStart(2, "0")}\nupdated: 2026-04-${String((i % 28) + 1).padStart(2, "0")}\n---\nbody content here today friend ${i} for ${"word ".repeat(20)}`,
      ]),
    );
    const fs = new MemoryFilesystem({
      [`${VAULT}/MOC Old.md`]: moc,
      ...targets,
    });
    const engine = await Engine.create({
      storage: new MemoryStorage(),
      embedding: new MockEmbedder({ dim: 8 }),
      filesystem: fs,
      options: { today: TODAY },
    });
    await engine.index({ vault: VAULT });
    const brief = await engine.brief({ section: "buried-insight" });
    // MOC Old must not appear as a buried finding.
    expect(
      (brief.findings.buried_insight ?? []).every(
        (f) => f.verb !== "buried-insight" || f.rel_path !== "MOC Old.md",
      ),
    ).toBe(true);
  });
});
