// packages/desktop/src/engine-bridge.ts
// Runs @basalt/core's Engine inside the Tauri WebView. Adapters:
//   - filesystem: TauriFilesystem (uses @tauri-apps/plugin-fs + the Rust
//     `walk_vault` custom command for fast directory walking)
//   - storage: in-memory (Tauri-SQL persistence lands in a follow-up)
//   - embedding: OllamaEmbedder or MockEmbedder fallback
//   - AI (v1 verbs): OllamaAI / OpenAIAI / AnthropicAI based on settings.

import {
  type AIAdapter,
  AnthropicAI,
  type Brief,
  Engine,
  type FilesystemAdapter,
  type Finding,
  findContradictionsV1,
  findImplicitThesesV1,
  MemoryStorage,
  MockEmbedder,
  OllamaAI,
  OllamaEmbedder,
  OpenAIAI,
  promoteFindingToNote,
  renderBrief,
  type VaultEntry,
} from "@basalt/core";
import "@basalt/core/verbs";
import { invoke } from "@tauri-apps/api/core";
import { exists as fsExists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { DesktopSettings } from "./settings";

export interface DesktopBrief {
  generated_at: string;
  brief: Brief;
  rendered_markdown: string;
  /** Filled in when the LLM augmentation succeeds for any verb. */
  llm_used: string | null;
}

class TauriFilesystem implements FilesystemAdapter {
  constructor(private readonly vaultRoot: string) {}

  async *walk(root: string): AsyncIterable<VaultEntry> {
    const entries = await invoke<Array<{ path: string; mtime_ms: number }>>("walk_vault", {
      root,
    });
    for (const e of entries) yield { path: e.path, mtime: e.mtime_ms };
  }

  async readFile(path: string): Promise<string> {
    return await readTextFile(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await fsExists(resolveInVault(this.vaultRoot, path));
    } catch {
      return false;
    }
  }

  /** Create-only: resolves `relPath` against the vault root, creates any
   *  missing parent directories, refuses to overwrite an existing file. */
  async createNoteFile(relPath: string, content: string): Promise<boolean> {
    const abs = resolveInVault(this.vaultRoot, relPath);
    // Refuse to overwrite — match the architectural contract.
    try {
      if (await fsExists(abs)) return false;
    } catch {
      // best-effort; fall through to the create attempt
    }
    // Auto-create parent directory if missing.
    const parent = abs.replace(/[/\\][^/\\]+$/, "");
    if (parent && parent !== abs) {
      try {
        await mkdir(parent, { recursive: true });
      } catch {
        // mkdir on existing dir errors — ignore.
      }
    }
    await writeTextFile(abs, content);
    return true;
  }
}

function resolveInVault(vaultRoot: string, relPath: string): string {
  // Tauri's writeTextFile accepts absolute paths when fs:scope permits.
  // If relPath is already absolute (Windows drive letter or POSIX leading
  // slash), use it as-is; otherwise join against vaultRoot.
  const isAbs =
    relPath.startsWith("/") || /^[a-z]:[/\\]/i.test(relPath) || relPath.startsWith("\\\\");
  if (isAbs) return relPath;
  const root = vaultRoot.replace(/[/\\]+$/, "");
  return `${root}/${relPath}`;
}

function resolveAi(s: DesktopSettings): AIAdapter | null {
  switch (s.llmProvider) {
    case "none":
      return null;
    case "ollama":
      return new OllamaAI({
        url: s.ollamaUrl,
        ...(s.llmModel ? { model: s.llmModel } : {}),
      });
    case "openai":
      if (!s.llmApiKey) return null;
      return new OpenAIAI({
        apiKey: s.llmApiKey,
        ...(s.llmModel ? { model: s.llmModel } : {}),
      });
    case "anthropic":
      if (!s.llmApiKey) return null;
      return new AnthropicAI({
        apiKey: s.llmApiKey,
        ...(s.llmModel ? { model: s.llmModel } : {}),
      });
    default:
      return null;
  }
}

export async function runBriefForVault(
  vault: string,
  settings: DesktopSettings,
  onProgress: (msg: string) => void,
): Promise<DesktopBrief> {
  const fs = new TauriFilesystem(vault);
  const storage = new MemoryStorage();
  let embedding: OllamaEmbedder | MockEmbedder;
  try {
    const probe = await fetch(`${settings.ollamaUrl}/api/tags`, { method: "GET" });
    if (probe.ok) {
      embedding = new OllamaEmbedder({ url: settings.ollamaUrl, model: settings.embeddingModel });
      onProgress(`Embedding via Ollama (${settings.embeddingModel})…`);
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

  const ai = resolveAi(settings);
  let llmUsed: string | null = null;
  if (ai) {
    try {
      const ctx = await engine.verbContext(3);
      onProgress(`Synthesizing thesis via ${ai.modelId()}…`);
      const thesisV1 = await findImplicitThesesV1(ctx, { ai, topN: 3 });
      if (thesisV1.length > 0) brief.findings.implicit_thesis = thesisV1 as unknown as Finding[];
      onProgress(`Verdicts via ${ai.modelId()}…`);
      const contradictionV1 = await findContradictionsV1(ctx, { ai });
      if (contradictionV1.length > 0)
        brief.findings.contradiction = contradictionV1 as unknown as Finding[];
      llmUsed = ai.modelId();
    } catch (e) {
      onProgress(`LLM augmentation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await engine.close();
  return {
    generated_at: new Date().toISOString(),
    brief,
    rendered_markdown: renderBrief(brief, "markdown"),
    llm_used: llmUsed,
  };
}

/** Promote-to-note: write a finding back into the user's vault under the
 *  configured promote folder. Returns the relative path written, or null
 *  if the user has no current brief / a collision was hit. */
export async function promoteFindingFromBrief(
  vault: string,
  brief: Brief,
  findingIndex: number,
  promoteFolder: string,
): Promise<string | null> {
  const allFindings: Finding[] = [];
  for (const arr of Object.values(brief.findings)) if (arr) allFindings.push(...arr);
  const finding = allFindings[findingIndex];
  if (!finding) return null;

  const note = promoteFindingToNote(finding, { folder: promoteFolder });
  const fs = new TauriFilesystem(vault);
  const ok = await fs.createNoteFile(note.relPath, note.body);
  return ok ? note.relPath : null;
}

export async function pushSnapshotForVault(
  vault: string,
  settings: DesktopSettings,
  onProgress: (msg: string) => void,
): Promise<{ ok: boolean; note_count: number; embedding_count: number; bytes: number }> {
  if (!settings.apiToken) throw new Error("API token not set in Settings.");
  if (!settings.apiVaultId) throw new Error("Vault ID not set in Settings.");

  const fs = new TauriFilesystem(vault);
  const storage = new MemoryStorage();
  const embedder = new OllamaEmbedder({
    url: settings.ollamaUrl,
    model: settings.embeddingModel,
  });
  const engine = await Engine.create({
    storage,
    embedding: embedder,
    filesystem: fs,
    options: { today: new Date().toISOString().slice(0, 10) },
  });
  onProgress("Walking vault + embedding…");
  await engine.index({ vault });
  onProgress("Building snapshot…");

  const snap = storage.snapshot();
  const noteIdToRelPath = new Map<number, string>();
  const notes: Array<Record<string, unknown>> = snap.notes.map((n) => {
    noteIdToRelPath.set(n.id, n.relPath);
    return {
      rel_path: n.relPath,
      stem: n.stem,
      title: n.title,
      created: n.created ?? undefined,
      updated: n.updated ?? undefined,
      word_count: n.wordCount,
      content: n.content,
      content_hash: n.contentHash,
      tags: n.tags,
    };
  });
  const embeddings: Array<Record<string, unknown>> = [];
  for await (const e of storage.listEmbeddings()) {
    const relPath = noteIdToRelPath.get(e.noteId);
    if (!relPath) continue;
    embeddings.push({
      rel_path: relPath,
      model: e.model,
      dim: e.dim,
      vec_b64: encodeFloat32LE(e.vec),
    });
  }
  await engine.close();

  const payload = {
    schema: 1,
    vault_id: settings.apiVaultId,
    created_at: new Date().toISOString(),
    today: new Date().toISOString().slice(0, 10),
    notes,
    embeddings,
    links: [],
  };
  const body = JSON.stringify(payload);

  onProgress(`POST ${settings.apiUrl}/v1/vaults/${settings.apiVaultId}/snapshot`);
  const res = await fetch(
    `${settings.apiUrl.replace(/\/$/, "")}/v1/vaults/${encodeURIComponent(settings.apiVaultId)}/snapshot`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `basalt_session=${settings.apiToken}`,
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload failed: HTTP ${res.status} ${await res.text()}`);
  }
  const result = (await res.json()) as {
    note_count: number;
    embedding_count: number;
    bytes: number;
  };
  return { ok: true, ...result };
}

function encodeFloat32LE(vec: Float32Array): string {
  const bytes = new Uint8Array(vec.byteLength);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < vec.length; i++) dv.setFloat32(i * 4, vec[i] ?? 0, true);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
