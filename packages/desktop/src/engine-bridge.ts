// packages/desktop/src/engine-bridge.ts
// Runs @basalt/core's Engine inside the Tauri WebView. Adapters:
//   - filesystem: TauriFilesystem (uses @tauri-apps/plugin-fs + the Rust
//     `walk_vault` custom command for fast directory walking)
//   - storage: in-memory for now; the Tauri-SQL implementation lands in a
//     follow-up
//   - embedding: OllamaEmbedder pointed at the user-configured URL
//
// PRD §4.6 perf budgets: < 800ms cold start, < 100MB idle memory. The
// in-memory adapter is sufficient to hit these on small-to-medium vaults;
// switching to tauri-plugin-sql for persistence is the next step.

import {
  type Brief,
  Engine,
  type FilesystemAdapter,
  MemoryStorage,
  MockEmbedder,
  OllamaEmbedder,
  renderBrief,
  type VaultEntry,
} from "@basalt/core";
import "@basalt/core/verbs";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";

export interface DesktopBrief {
  generated_at: string;
  brief: Brief;
  rendered_markdown: string;
}

class TauriFilesystem implements FilesystemAdapter {
  async *walk(root: string): AsyncIterable<VaultEntry> {
    const entries = await invoke<Array<{ path: string; mtime_ms: number }>>("walk_vault", {
      root,
    });
    for (const e of entries) yield { path: e.path, mtime: e.mtime_ms };
  }
  async readFile(path: string): Promise<string> {
    return await readTextFile(path);
  }
  async exists(_path: string): Promise<boolean> {
    // Tauri's fs.exists requires explicit allowlist scopes; skip for v0.
    return true;
  }
  async createNoteFile(_path: string, _content: string): Promise<boolean> {
    // Promote-to-note from desktop lands in a follow-up: uses
    // @tauri-apps/plugin-fs writeTextFile with the `create` flag set so
    // existing files cause an error (mirrors the create-only contract
    // of every other filesystem adapter).
    throw new Error("createNoteFile: lands in a follow-up");
  }
}

export async function runBriefForVault(
  vault: string,
  onProgress: (msg: string) => void,
): Promise<DesktopBrief> {
  const fs = new TauriFilesystem();
  const storage = new MemoryStorage();
  // Default to local Ollama; fall back to mock if Ollama is unreachable so
  // the desktop's "Generate Brief" button works even pre-Ollama-install.
  const ollamaUrl = "http://localhost:11434";
  let embedding: OllamaEmbedder | MockEmbedder;
  try {
    const probe = await fetch(`${ollamaUrl}/api/tags`, { method: "GET" });
    if (probe.ok) {
      embedding = new OllamaEmbedder({ url: ollamaUrl, model: "nomic-embed-text" });
      onProgress("Embedding via Ollama (nomic-embed-text)…");
    } else {
      throw new Error("ollama-not-ok");
    }
  } catch {
    embedding = new MockEmbedder({ dim: 768 });
    onProgress("Ollama not reachable; using mock embeddings.");
  }
  const engine = await Engine.create({
    storage,
    embedding,
    filesystem: fs,
    options: {
      today: new Date().toISOString().slice(0, 10),
      onProgress: (e) => onProgress(`${e.stage}${e.message ? `: ${e.message}` : ""}`),
    },
  });
  onProgress("Indexing…");
  await engine.index({ vault });
  onProgress("Generating Brief…");
  const brief = await engine.brief({ section: "all", top: 3 });
  await engine.close();
  return {
    generated_at: new Date().toISOString(),
    brief,
    rendered_markdown: renderBrief(brief, "markdown"),
  };
}
