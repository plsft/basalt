// packages/cli/src/commands/demo.ts
// `basalt demo` — runs against the bundled sample-vault-14 fixture using
// MockEmbedder so no Ollama is required. Output goes to stdout as Markdown.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Engine, MemoryFilesystem, MemoryStorage, MockEmbedder, renderBrief } from "basalted-core";
import "basalted-core/verbs"; // side-effect: register all five verbs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import kleur from "kleur";

function findFixture(): string | null {
  const candidates = [
    "tests/parity/fixtures/sample-vault-14",
    "../tests/parity/fixtures/sample-vault-14",
    "../../tests/parity/fixtures/sample-vault-14",
    "../../../tests/parity/fixtures/sample-vault-14",
  ];
  for (const c of candidates) {
    const abs = resolve(c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function loadIntoMemory(vault: string): MemoryFilesystem {
  const fs = new MemoryFilesystem();
  function walk(dir: string): void {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) {
        fs.addFile(p.replace(/\\/g, "/"), readFileSync(p, "utf-8"));
      }
    }
  }
  walk(vault);
  return fs;
}

export async function demoCommand(): Promise<void> {
  const vault = findFixture();
  if (!vault) {
    console.error(kleur.red("✗ demo: bundled sample vault not found."));
    process.exitCode = 2;
    return;
  }
  console.log(kleur.dim(`Demo using ${vault.replace(/\\/g, "/")}\n`));
  const fs = loadIntoMemory(vault);
  const storage = new MemoryStorage();
  const engine = await Engine.create({
    storage,
    embedding: new MockEmbedder({ dim: 768 }),
    filesystem: fs,
    options: { today: new Date().toISOString().slice(0, 10) },
  });
  await engine.index({ vault: vault.replace(/\\/g, "/") });
  const brief = await engine.brief({ section: "all", top: 3 });
  await engine.close();
  process.stdout.write(`${renderBrief(brief, "markdown")}\n`);
}
