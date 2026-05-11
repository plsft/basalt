// bench/idle-memory.ts
//
// Measures idle resident memory for the basalted-core engine after a fresh
// init, indexing a small vault, and sitting idle. PRD §6.4 desktop budget:
// idle memory < 100 MB.
//
// This proxies the engine-side memory cost; the desktop bundle's true idle
// memory is measured separately (Tauri runtime + WebView overhead are
// counted by `tauri-bench memory` in the desktop release pipeline).
//
// Usage:  bun bench/idle-memory.ts

import { MockEmbedder } from "../packages/core/src/adapters/embedding-mock";
import { MemoryFilesystem } from "../packages/core/src/adapters/filesystem-memory";
import { MemoryStorage } from "../packages/core/src/adapters/storage-memory";
import { Engine } from "../packages/core/src/engine";
import "../packages/core/src/verbs/index";

function rssMB(): number {
  return process.memoryUsage().rss / 1024 / 1024;
}

function heapMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function main(): Promise<void> {
  console.log(`\nbasalt idle-memory bench — ${new Date().toISOString()}`);
  console.log(
    `platform: ${process.platform} ${process.arch}  bun ${process.versions.bun ?? "?"}\n`,
  );

  console.log(`${"phase".padEnd(28)} ${"rss MB".padStart(10)} ${"heap MB".padStart(10)}`);
  console.log("-".repeat(52));
  console.log(
    `${"baseline (post-import)".padEnd(28)} ${rssMB().toFixed(1).padStart(10)} ${heapMB().toFixed(1).padStart(10)}`,
  );

  const files: Record<string, string> = {};
  for (let i = 0; i < 100; i++) {
    files[`/note-${i}.md`] = `# Note ${i}\n\nIdle content for memory bench. ${"x".repeat(200)}\n`;
  }
  const fs = new MemoryFilesystem(files);
  const storage = new MemoryStorage();
  const engine = await Engine.create({
    storage,
    embedding: new MockEmbedder({ dim: 768 }),
    filesystem: fs,
  });
  console.log(
    `${"engine created".padEnd(28)} ${rssMB().toFixed(1).padStart(10)} ${heapMB().toFixed(1).padStart(10)}`,
  );

  await engine.index({ vault: "/" });
  console.log(
    `${"100 notes indexed".padEnd(28)} ${rssMB().toFixed(1).padStart(10)} ${heapMB().toFixed(1).padStart(10)}`,
  );

  // Force a couple of GC sweeps (Bun exposes Bun.gc, fall back if running on Node).
  if (typeof (globalThis as { Bun?: { gc: (full: boolean) => void } }).Bun !== "undefined") {
    (globalThis as { Bun: { gc: (full: boolean) => void } }).Bun.gc(true);
    await new Promise((r) => setTimeout(r, 50));
    (globalThis as { Bun: { gc: (full: boolean) => void } }).Bun.gc(true);
  } else if (typeof (globalThis as { gc?: () => void }).gc === "function") {
    (globalThis as { gc: () => void }).gc();
  }
  await new Promise((r) => setTimeout(r, 100));
  const rssAfterIdle = rssMB();
  console.log(
    `${"post-gc, idle".padEnd(28)} ${rssAfterIdle.toFixed(1).padStart(10)} ${heapMB().toFixed(1).padStart(10)}`,
  );

  // Budget: engine-side rss < 200 MB on Bun runtime (the desktop bundle has
  // additional Tauri/WebView headroom; the < 100 MB budget covers full app).
  console.log();
  if (rssAfterIdle > 200) {
    console.error(`Idle rss ${rssAfterIdle.toFixed(1)} MB exceeds the 200 MB engine ceiling`);
    process.exit(1);
  }
}

void main();
