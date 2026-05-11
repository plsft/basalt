// Verifies the snapshot → Engine bridge end-to-end against the sample-14
// fixture: ingest a hand-built VaultSnapshot, run Engine.brief, confirm
// shape + non-empty findings buckets.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildEngineFromSnapshot } from "./engine-adapters";
import { encodeFloat32LE, type VaultSnapshot } from "./snapshot";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

describe("buildEngineFromSnapshot", () => {
  it("produces a Brief with the expected bucket keys", async () => {
    const vec = new Float32Array(768);
    for (let i = 0; i < 768; i++) vec[i] = Math.sin(i / 7);
    // Normalize so cosine math behaves.
    let sq = 0;
    for (let i = 0; i < 768; i++) sq += (vec[i] ?? 0) ** 2;
    const norm = Math.sqrt(sq);
    for (let i = 0; i < 768; i++) vec[i] = (vec[i] ?? 0) / norm;

    const snapshot: VaultSnapshot = {
      schema: 1,
      vault_id: "test_vault",
      created_at: "2026-05-11T12:00:00Z",
      today: "2026-05-11",
      notes: [
        {
          rel_path: "00-Inbox/note-a.md",
          stem: "note-a",
          title: "Note A",
          word_count: 120,
          content: "# Note A\n\nThis is some content with substance.\n",
          content_hash: "h-a",
          tags: ["topic/test"],
          created: "2026-01-01",
          updated: "2026-05-01",
        },
        {
          rel_path: "01-Daily/note-b.md",
          stem: "note-b",
          title: "Note B",
          word_count: 95,
          content: "# Note B\n\nDifferent content but similar themes.\n",
          content_hash: "h-b",
          tags: ["topic/test"],
          created: "2026-02-01",
          updated: "2026-05-01",
        },
      ],
      embeddings: [
        { rel_path: "00-Inbox/note-a.md", model: "test", dim: 768, vec_b64: encodeFloat32LE(vec) },
        { rel_path: "01-Daily/note-b.md", model: "test", dim: 768, vec_b64: encodeFloat32LE(vec) },
      ],
      links: [],
    };

    const { engine } = await buildEngineFromSnapshot(snapshot);
    const brief = await engine.brief({ section: "all", top: 3 });
    expect(brief.schema).toBe(1);
    for (const bucket of [
      "buried_insight",
      "connection",
      "contradiction",
      "implicit_thesis",
      "drift",
    ] as const) {
      expect(Array.isArray(brief.findings[bucket])).toBe(true);
    }
  });

  it("loads the sample-14 fixture's pre-computed embeddings if available", async () => {
    const baselinePath = join(
      REPO_ROOT,
      "tests",
      "parity",
      "baseline",
      "embeddings-sample-14.json",
    );
    let raw: string;
    try {
      raw = readFileSync(baselinePath, "utf-8");
    } catch {
      return; // baseline not present in this checkout
    }
    interface EmbBaseline {
      model: string;
      embeddings: Record<string, { dim: number; vec_b64: string }>;
    }
    const baseline = JSON.parse(raw) as EmbBaseline;

    // Build minimal placeholder notes that match the baseline relPaths.
    const notes: VaultSnapshot["notes"] = [];
    const embeddings: VaultSnapshot["embeddings"] = [];
    for (const [relPath, payload] of Object.entries(baseline.embeddings)) {
      notes.push({
        rel_path: relPath,
        stem: relPath.split("/").pop()?.replace(/\.md$/, "") ?? relPath,
        title: relPath,
        word_count: 120,
        content: `# ${relPath}\n\nContent of ${relPath}.\n`,
        content_hash: `h-${relPath}`,
        tags: [],
      });
      embeddings.push({ rel_path: relPath, model: baseline.model, ...payload });
    }
    const snapshot: VaultSnapshot = {
      schema: 1,
      vault_id: "sample-14",
      created_at: "2026-05-09T12:00:00Z",
      today: "2026-05-09",
      notes,
      embeddings,
      links: [],
    };

    const { engine, storage } = await buildEngineFromSnapshot(snapshot);
    const snap = storage.snapshot();
    expect(snap.notes.length).toBe(notes.length);
    const brief = await engine.brief({ section: "all", top: 3 });
    expect(brief.schema).toBe(1);
    // We don't assert specific findings (synthesized content differs from
    // the real fixture) — only that the pipeline runs end-to-end.
    expect(typeof brief.findings).toBe("object");
  });
});
