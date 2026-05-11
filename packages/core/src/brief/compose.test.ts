import { describe, expect, it } from "vitest";
import type { TrackRecordSummary } from "../types";
import { bucketForVerb, composeBrief } from "./compose";

const TR: TrackRecordSummary = {
  schema: 1,
  window_days: 90,
  confirmed: 0,
  pending: 0,
  falsified: 0,
  total: 0,
  confirmed_pct: 0,
  falsified_pct: 0,
};

describe("bucketForVerb", () => {
  it("maps each verb to its snake_case bucket name", () => {
    expect(bucketForVerb("buried-insight")).toBe("buried_insight");
    expect(bucketForVerb("connection")).toBe("connection");
    expect(bucketForVerb("contradiction")).toBe("contradiction");
    expect(bucketForVerb("implicit-thesis")).toBe("implicit_thesis");
    expect(bucketForVerb("drift")).toBe("drift");
  });
});

describe("composeBrief", () => {
  it("preserves canonical render order regardless of input order", () => {
    const brief = composeBrief({
      section: "all",
      trackRecord: TR,
      findings: {
        drift: [],
        connection: [],
        buried_insight: [],
      },
    });
    expect(Object.keys(brief.findings)).toEqual(["buried_insight", "connection", "drift"]);
  });

  it("drops buckets that are absent from input (vs. present-but-empty)", () => {
    const brief = composeBrief({
      section: "all",
      trackRecord: TR,
      findings: {
        buried_insight: [],
        // connection intentionally absent
      },
    });
    expect("buried_insight" in brief.findings).toBe(true);
    expect("connection" in brief.findings).toBe(false);
  });

  it("attaches schema=1 and the supplied section + track_record", () => {
    const brief = composeBrief({
      section: "buried-insight",
      trackRecord: TR,
      findings: {},
    });
    expect(brief.schema).toBe(1);
    expect(brief.section).toBe("buried-insight");
    expect(brief.track_record).toEqual(TR);
  });
});
