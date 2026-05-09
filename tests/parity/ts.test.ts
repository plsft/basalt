// tests/parity/ts.test.ts
//
// The TS-vs-Python parity test entry point. In Phase 1 this file imports
// `@basalt/core`, runs each verb against the parity fixtures, and compares
// the output to the frozen JSON baselines under `baseline/`.
//
// In Phase 0 the TS verbs don't exist yet; this file's job is to:
//   - prove every committed baseline loads as a Brief
//   - prove `findings.<bucket>` arrays exist (possibly empty) per the schema
//   - prove every finding's `verb` discriminator matches its bucket name
// so the parity infrastructure has skin in the CI game on every PR — not
// just from TASK-1.6 onward.

import { describe, expect, it } from "vitest";
import { type FindingsBucket, loadBaseline, type Verb } from "./utils";

const FIXTURE_PREFIXES = ["sample-14", "large-200"] as const;

const PER_VERB_FILES: Array<{ stem: string; verb: Verb; bucket: FindingsBucket }> = [
  { stem: "buried", verb: "buried-insight", bucket: "buried_insight" },
  { stem: "connection", verb: "connection", bucket: "connection" },
  { stem: "contradiction", verb: "contradiction", bucket: "contradiction" },
  { stem: "thesis", verb: "implicit-thesis", bucket: "implicit_thesis" },
  { stem: "drift", verb: "drift", bucket: "drift" },
];

const ALL_BUCKETS: FindingsBucket[] = [
  "buried_insight",
  "connection",
  "contradiction",
  "implicit_thesis",
  "drift",
];

describe("parity baselines — schema validation", () => {
  for (const prefix of FIXTURE_PREFIXES) {
    describe(`fixture: ${prefix}`, () => {
      it(`${prefix}-brief.json: section is "all" and every bucket is an array (possibly empty)`, () => {
        const brief = loadBaseline(`${prefix}-brief`);
        expect(brief.schema).toBe(1);
        expect(brief.section).toBe("all");
        for (const bucket of ALL_BUCKETS) {
          const arr = brief.findings[bucket];
          expect(arr === undefined || Array.isArray(arr)).toBe(true);
        }
      });

      it(`${prefix}-brief.json: track_record is well-formed`, () => {
        const brief = loadBaseline(`${prefix}-brief`);
        expect(brief.track_record.schema).toBe(1);
        expect(typeof brief.track_record.window_days).toBe("number");
        expect(typeof brief.track_record.total).toBe("number");
        expect(
          brief.track_record.confirmed + brief.track_record.pending + brief.track_record.falsified,
        ).toBe(brief.track_record.total);
      });

      for (const { stem, verb, bucket } of PER_VERB_FILES) {
        it(`${prefix}-${stem}.json: section matches verb, findings under correct bucket`, () => {
          const brief = loadBaseline(`${prefix}-${stem}`);
          expect(brief.schema).toBe(1);
          expect(brief.section).toBe(verb);
          // Some sections produce zero findings (Drift on a vault with no
          // Projects/, Connection on a tiny vault) — the bucket key must still
          // be present, with an empty array.
          const arr = brief.findings[bucket];
          expect(arr).toBeDefined();
          expect(Array.isArray(arr)).toBe(true);
        });

        it(`${prefix}-${stem}.json: every finding has matching verb discriminator`, () => {
          const brief = loadBaseline(`${prefix}-${stem}`);
          const arr = brief.findings[bucket] ?? [];
          for (const f of arr) {
            expect(f.verb).toBe(verb);
            expect(f.schema).toBe(1);
            expect(typeof f.score).toBe("number");
          }
        });
      }
    });
  }
});

// Phase 1: replace the placeholder with TS-vs-baseline runs.
//
// import { Engine } from "@basalt/core";
// describe("parity: TS engine ↔ Python baselines", () => {
//   for (const prefix of FIXTURE_PREFIXES) {
//     it(`${prefix}: brief matches baseline`, async () => {
//       const engine = new Engine({ ... });
//       await engine.index();
//       const actual: Brief = await engine.brief({ section: "all", top: 3 });
//       const baseline = loadBaseline(`${prefix}-brief`);
//       const result = compareBrief(actual, baseline);
//       expect(result.errors).toEqual([]);
//       expect(result.ok).toBe(true);
//     });
//   }
// });
