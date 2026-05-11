// bench/cold-start.ts
//
// Measures cold-start latency for surfaces that need to be fast on launch:
//   1. basalted-core module import + Engine.create
//   2. basalted `basalt about` end-to-end (forks a child process)
//
// PRD §6.4 budget: desktop cold-start < 800ms median (measured separately
// via the Tauri build); this script targets the engine + CLI portion that
// runs inside Bun.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const REPO = resolve(import.meta.dirname, "..");

async function benchEngineImport(): Promise<number> {
  // Fresh process so the import cost is paid. We spawn Bun with a tiny
  // probe script and measure wall time.
  const probe = `
const t0 = Bun.nanoseconds();
const { Engine } = await import("${REPO.replace(/\\/g, "/")}/packages/core/src/engine.ts");
const { MockEmbedder } = await import("${REPO.replace(/\\/g, "/")}/packages/core/src/adapters/embedding-mock.ts");
const { MemoryFilesystem } = await import("${REPO.replace(/\\/g, "/")}/packages/core/src/adapters/filesystem-memory.ts");
const { MemoryStorage } = await import("${REPO.replace(/\\/g, "/")}/packages/core/src/adapters/storage-memory.ts");
await import("${REPO.replace(/\\/g, "/")}/packages/core/src/verbs/index.ts");
const t1 = Bun.nanoseconds();
await Engine.create({ storage: new MemoryStorage(), embedding: new MockEmbedder(), filesystem: new MemoryFilesystem({}) });
const t2 = Bun.nanoseconds();
console.log(JSON.stringify({ importNs: t1 - t0, createNs: t2 - t1 }));
`;
  const res = spawnSync("bun", ["-e", probe], { encoding: "utf-8" });
  if (res.status !== 0) {
    console.error("engine import probe failed:", res.stderr);
    return Number.NaN;
  }
  const parsed = JSON.parse(res.stdout.trim()) as { importNs: number; createNs: number };
  return (parsed.importNs + parsed.createNs) / 1_000_000;
}

function benchCliAbout(): number {
  const cli = resolve(REPO, "packages/cli/src/index.ts");
  const t0 = performance.now();
  const res = spawnSync("bun", ["run", cli, "about"], { encoding: "utf-8" });
  const t1 = performance.now();
  if (res.status !== 0) {
    console.error("`basalt about` failed:", res.stderr);
    return Number.NaN;
  }
  return t1 - t0;
}

const ITERATIONS = 5;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
}

async function main(): Promise<void> {
  console.log(`\nbasalt cold-start bench — ${new Date().toISOString()}`);
  console.log(`platform: ${process.platform} ${process.arch}  bun ${process.versions.bun ?? "?"}`);
  console.log(`iterations: ${ITERATIONS}\n`);

  const engineImport: number[] = [];
  const cliAbout: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    engineImport.push(await benchEngineImport());
    cliAbout.push(benchCliAbout());
  }

  console.log(
    `${"target".padEnd(28)} ${"median (ms)".padStart(14)} ${"min".padStart(8)} ${"max".padStart(8)}`,
  );
  console.log("-".repeat(60));
  for (const [name, vals] of [
    ["basalted-core import + create", engineImport] as const,
    ["`basalt about` (CLI)", cliAbout] as const,
  ]) {
    if (vals.some(Number.isNaN)) {
      console.error(`${name}  FAILED`);
      continue;
    }
    const med = median(vals);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    console.log(
      `${name.padEnd(28)} ${med.toFixed(1).padStart(14)} ${min.toFixed(1).padStart(8)} ${max.toFixed(1).padStart(8)}`,
    );
  }
  console.log();

  // PRD §6.4: desktop cold start < 800ms median. The CLI is a reasonable
  // proxy for the engine-import portion of that budget.
  const cliMedian = median(cliAbout);
  if (Number.isFinite(cliMedian) && cliMedian > 1500) {
    console.error(`CLI cold-start median ${cliMedian.toFixed(0)}ms exceeds 1500ms`);
    process.exit(1);
  }
}

void main();
