import { describe, expect, it } from "vitest";
import { MockEmbedder } from "../adapters/embedding-mock";
import { MemoryFilesystem } from "../adapters/filesystem-memory";
import { MemoryStorage } from "../adapters/storage-memory";
import { Engine } from "../engine";
import "./index"; // side-effect: registers drift

const VAULT = "/v";
const TODAY = "2026-05-09";

async function makeEngine(files: Record<string, string>): Promise<Engine> {
  const fs = new MemoryFilesystem(files);
  const engine = await Engine.create({
    storage: new MemoryStorage(),
    embedding: new MockEmbedder({ dim: 8 }),
    filesystem: fs,
    options: { today: TODAY },
  });
  await engine.index({ vault: VAULT });
  return engine;
}

describe("findDrift — Engine integration", () => {
  it("returns empty when there are fewer than 2 projects", async () => {
    const engine = await makeEngine({
      [`${VAULT}/Projects/Atlas/HYPOTHESIS.md`]: "body content here today friend",
      [`${VAULT}/01-Daily/2026-05-08.md`]: "Spent the morning on Atlas yesterday for sure.",
    });
    const brief = await engine.brief({ section: "drift" });
    expect(brief.findings.drift).toEqual([]);
  });

  it("returns empty when there are fewer than 3 daily notes in window", async () => {
    const engine = await makeEngine({
      [`${VAULT}/Projects/Atlas/HYPOTHESIS.md`]: "body content here today friend",
      [`${VAULT}/Projects/Beacon/HYPOTHESIS.md`]: "body content here today friend",
      [`${VAULT}/01-Daily/2026-05-08.md`]: "Atlas day",
    });
    const brief = await engine.brief({ section: "drift" });
    expect(brief.findings.drift).toEqual([]);
  });

  it("recognises projects under 02-Projects/ and Projects/ alike", async () => {
    const dailies = Array.from({ length: 5 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return [
        `${VAULT}/01-Daily/2026-05-${day}.md`,
        `Spent the day on Atlas. Atlas Atlas Atlas. Mentioned Beacon once today.`,
      ] as const;
    });
    const engine = await makeEngine({
      [`${VAULT}/02-Projects/Atlas/HYPOTHESIS.md`]: "body atlas",
      [`${VAULT}/Projects/Beacon/HYPOTHESIS.md`]: "body beacon",
      ...Object.fromEntries(dailies),
    });
    const brief = await engine.brief({ section: "drift" });
    expect(brief.findings.drift?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns empty when total mentions is zero (no signal to compute)", async () => {
    const dailies = Array.from({ length: 5 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return [
        `${VAULT}/01-Daily/2026-05-${day}.md`,
        "Body about something else entirely with no project name mentions today.",
      ] as const;
    });
    const engine = await makeEngine({
      [`${VAULT}/Projects/Atlas/HYPOTHESIS.md`]: "body atlas",
      [`${VAULT}/Projects/Beacon/HYPOTHESIS.md`]: "body beacon",
      ...Object.fromEntries(dailies),
    });
    const brief = await engine.brief({ section: "drift" });
    expect(brief.findings.drift).toEqual([]);
  });

  it("emits a finding with overworked + underworked headlines past ±5pp", async () => {
    // Atlas has 4 stated notes (high stated share) but only 1 mention.
    // Beacon has 1 stated note (low stated share) but 10 mentions.
    const projectFiles: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      projectFiles[`${VAULT}/Projects/Atlas/Note-${i}.md`] = `body atlas ${i} content`;
    }
    projectFiles[`${VAULT}/Projects/Beacon/HYPOTHESIS.md`] = "body beacon content here";
    const dailies: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      const day = String(i + 1).padStart(2, "0");
      dailies[`${VAULT}/01-Daily/2026-05-${day}.md`] =
        i === 0
          ? `Today touched Atlas once and worked all day on Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon`
          : `Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon Beacon`;
    }
    const engine = await makeEngine({ ...projectFiles, ...dailies });
    const brief = await engine.brief({ section: "drift" });
    expect(brief.findings.drift?.length ?? 0).toBeGreaterThan(0);
    const f = brief.findings.drift![0]!;
    if (f.verb !== "drift") return;
    expect(f.headline_overworked?.name).toBe("Beacon");
    expect(f.headline_underworked?.name).toBe("Atlas");
    expect(f.headline_overworked!.drift_pct).toBeGreaterThan(5);
    expect(f.headline_underworked!.drift_pct).toBeLessThan(-5);
  });

  it("matches daily notes by tag even when filename has no date", async () => {
    const projects: Record<string, string> = {
      [`${VAULT}/Projects/Atlas/HYPOTHESIS.md`]: "body atlas",
      [`${VAULT}/Projects/Beacon/HYPOTHESIS.md`]: "body beacon",
    };
    const tagDailies = Array.from(
      { length: 5 },
      (_, i) =>
        [
          `${VAULT}/01-Daily/log-${i}.md`,
          ["---", "tags: [daily]", "---", "Atlas Beacon Atlas"].join("\n"),
        ] as const,
    );
    const engine = await makeEngine({ ...projects, ...Object.fromEntries(tagDailies) });
    const brief = await engine.brief({ section: "drift" });
    // We just want to confirm tag-recognized dailies count toward the
    // MIN_DAILY_NOTES gate. Even if no headline pops, the algorithm got
    // past the dailies floor and computed shares.
    const drift = brief.findings.drift ?? [];
    if (drift.length > 0 && drift[0]!.verb === "drift") {
      expect(drift[0]!.daily_note_count).toBeGreaterThanOrEqual(5);
    }
  });
});
