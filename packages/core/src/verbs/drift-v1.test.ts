import { describe, expect, it } from "vitest";
import type { VerbContext } from "../engine";
import { auditDrift, compareDrift } from "./drift-v1";
import type { DriftFinding, ProjectShare } from "./types";

function mkShare(name: string, drift_pct: number): ProjectShare {
  return {
    name,
    stated_notes: 5,
    stated_share: 0.2,
    stated_rank: 1,
    lived_mentions: 12,
    lived_share: 0.3,
    lived_rank: 1,
    drift_pct,
  };
}

describe("compareDrift", () => {
  it("returns confirmed when current drift_pct is within 50% of historical", () => {
    expect(compareDrift(20, 15)).toBe("confirmed");
    expect(compareDrift(-30, -25)).toBe("confirmed");
  });
  it("returns softened when current drift_pct halved or more", () => {
    expect(compareDrift(20, 8)).toBe("softened");
    expect(compareDrift(-30, -5)).toBe("softened");
  });
  it("returns reversed when sign flipped", () => {
    expect(compareDrift(20, -10)).toBe("reversed");
    expect(compareDrift(-15, 5)).toBe("reversed");
  });
  it("handles zero historical drift", () => {
    expect(compareDrift(0, 0)).toBe("confirmed");
    expect(compareDrift(0, 5)).toBe("softened");
  });
});

import { vi } from "vitest";
import * as base from "./drift";

function fakeCtx(): VerbContext {
  return {
    storage: {} as VerbContext["storage"],
    embedding: {} as VerbContext["embedding"],
    graph: {} as VerbContext["graph"],
    top: 3,
    today: "2026-05-09",
  };
}

function mkDrift(overworked: ProjectShare | null, shares: ProjectShare[]): DriftFinding {
  return {
    verb: "drift",
    schema: 1,
    version: "v0",
    window_days: 30,
    daily_note_count: 10,
    project_count: 3,
    total_mentions: 100,
    score: 1.0,
    headline_overworked: overworked,
    headline_underworked: null,
    shares,
  };
}

describe("auditDrift", () => {
  it("verdicts confirmed when the project is still over-worked", async () => {
    const historical = mkDrift(mkShare("Atlas", 30), []);
    const currentShare = mkShare("Atlas", 28);
    vi.spyOn(base, "findDrift").mockResolvedValue([mkDrift(currentShare, [currentShare])]);
    const out = await auditDrift(fakeCtx(), [historical]);
    expect(out[0]?.auto_verdict).toBe("confirmed");
    expect(out[0]?.auto_verdict_pct_now).toBe(28);
    expect(out[0]?.auto_verdict_evaluated_at).toBe("2026-05-09T00:00:00Z");
    vi.restoreAllMocks();
  });

  it("verdicts softened when drift moved back toward zero by half", async () => {
    const historical = mkDrift(mkShare("Atlas", 30), []);
    const currentShare = mkShare("Atlas", 5);
    vi.spyOn(base, "findDrift").mockResolvedValue([mkDrift(currentShare, [currentShare])]);
    const out = await auditDrift(fakeCtx(), [historical]);
    expect(out[0]?.auto_verdict).toBe("softened");
    vi.restoreAllMocks();
  });

  it("verdicts vanished when the project no longer appears in current", async () => {
    const historical = mkDrift(mkShare("Atlas", 30), []);
    vi.spyOn(base, "findDrift").mockResolvedValue([mkDrift(null, [])]);
    const out = await auditDrift(fakeCtx(), [historical]);
    expect(out[0]?.auto_verdict).toBe("vanished");
    expect(out[0]?.auto_verdict_pct_now).toBeNull();
    vi.restoreAllMocks();
  });

  it("verdicts reversed on sign flip", async () => {
    const historical = mkDrift(mkShare("Atlas", 30), []);
    const currentShare = mkShare("Atlas", -10);
    vi.spyOn(base, "findDrift").mockResolvedValue([mkDrift(currentShare, [currentShare])]);
    const out = await auditDrift(fakeCtx(), [historical]);
    expect(out[0]?.auto_verdict).toBe("reversed");
    vi.restoreAllMocks();
  });

  it("returns [] for empty historical input", async () => {
    const out = await auditDrift(fakeCtx(), []);
    expect(out).toEqual([]);
  });

  it("verdicts vanished when historical has no headline projects", async () => {
    const historical = mkDrift(null, []);
    vi.spyOn(base, "findDrift").mockResolvedValue([mkDrift(mkShare("Beta", 5), [])]);
    const out = await auditDrift(fakeCtx(), [historical]);
    expect(out[0]?.auto_verdict).toBe("vanished");
    vi.restoreAllMocks();
  });
});
