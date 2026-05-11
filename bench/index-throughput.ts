// bench/index-throughput.ts
//
// Measures @basalt/core indexing throughput against generated vaults of
// size N. Reports notes/sec for parse + graph build + (mock) embed. PRD §6.4
// budgets: 1k-note vault indexes in < 30s on commodity hardware.
//
// Usage:
//   bun bench/index-throughput.ts             # default 100, 1000
//   bun bench/index-throughput.ts 100 500 1000 10000

import { performance } from "node:perf_hooks";
import { MockEmbedder } from "../packages/core/src/adapters/embedding-mock";
import { MemoryFilesystem } from "../packages/core/src/adapters/filesystem-memory";
import { MemoryStorage } from "../packages/core/src/adapters/storage-memory";
import { Engine } from "../packages/core/src/engine";
import "../packages/core/src/verbs/index";

const DEFAULT_SIZES = [100, 1000];

function fakeNote(i: number): string {
  // Deterministic-ish content with frontmatter + body + a few wikilinks.
  const tags = ["topic/" + (i % 7), "kind/note"].join(", ");
  const linkA = `[[note-${(i + 3) % 50}]]`;
  const linkB = `[[fragment-${i % 17}]]`;
  return `---
title: "Note ${i}"
created: 2026-01-${String((i % 28) + 1).padStart(2, "0")}
updated: 2026-05-${String((i % 28) + 1).padStart(2, "0")}
tags: [${tags}]
---
# Note ${i}

The interesting thing about idea ${i % 50} is that ${linkA} reframes it.

But ${linkB} disagrees: it argues for the opposite take, and proposes
that the right unit of analysis is the artifact, not the abstraction.

> [!claim] The through-line
> When the work is repeatable, the surprise has already been compiled out.

Cross-referencing ${linkA} and ${linkB} suggests we're circling the same
point at different elevations.
`;
}

function buildFixture(n: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const folder = ["00-Inbox", "01-Daily", "02-Projects", "07-Insights"][i % 4];
    files[`/${folder}/note-${i}.md`] = fakeNote(i);
  }
  return files;
}

async function bench(n: number): Promise<{ ms: number; notesPerSec: number }> {
  const files = buildFixture(n);
  const fs = new MemoryFilesystem(files);
  const storage = new MemoryStorage();
  const engine = await Engine.create({
    storage,
    embedding: new MockEmbedder({ dim: 768 }),
    filesystem: fs,
  });
  const t0 = performance.now();
  await engine.index({ vault: "/" });
  const t1 = performance.now();
  const ms = t1 - t0;
  return { ms, notesPerSec: (n / ms) * 1000 };
}

async function main(): Promise<void> {
  const arg = process.argv.slice(2);
  const sizes = arg.length > 0 ? arg.map((s) => Number.parseInt(s, 10)) : DEFAULT_SIZES;

  console.log(`\nbasalt index-throughput bench — ${new Date().toISOString()}`);
  console.log(`platform: ${process.platform} ${process.arch}  bun ${process.versions.bun ?? "?"}`);
  console.log(`${"size".padEnd(8)} ${"ms".padStart(10)} ${"notes/sec".padStart(12)}`);
  console.log("-".repeat(32));
  const results: Array<{ size: number; ms: number; notesPerSec: number }> = [];
  for (const n of sizes) {
    const r = await bench(n);
    results.push({ size: n, ...r });
    console.log(
      `${String(n).padEnd(8)} ${r.ms.toFixed(1).padStart(10)} ${r.notesPerSec.toFixed(0).padStart(12)}`,
    );
  }
  console.log();

  // PRD §6.4: 1k notes < 30s. 100 notes ~< 3s.
  const budgets: Record<number, number> = { 100: 3_000, 1000: 30_000 };
  let failed = 0;
  for (const r of results) {
    const budget = budgets[r.size];
    if (budget && r.ms > budget) {
      console.error(`BUDGET FAIL: ${r.size} notes took ${r.ms.toFixed(0)}ms (budget ${budget}ms)`);
      failed++;
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

void main();
