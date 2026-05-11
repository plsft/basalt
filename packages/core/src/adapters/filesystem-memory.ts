// packages/core/src/adapters/filesystem-memory.ts
// In-memory FilesystemAdapter for tests. Does not implement any actual fs
// access; the test seeds files via constructor / addFile.

import type { FilesystemAdapter, VaultEntry } from "./filesystem";

interface MemoryFile {
  content: string;
  mtime: number;
}

export class MemoryFilesystem implements FilesystemAdapter {
  private files = new Map<string, MemoryFile>();

  constructor(seed?: Record<string, string>) {
    if (seed) {
      for (const [path, content] of Object.entries(seed)) {
        this.addFile(path, content);
      }
    }
  }

  addFile(path: string, content: string, mtime: number = Date.now()): void {
    this.files.set(this.normalize(path), { content, mtime });
  }

  removeFile(path: string): void {
    this.files.delete(this.normalize(path));
  }

  // ── FilesystemAdapter ──────────────────────────────────────────────────

  async *walk(root: string): AsyncIterable<VaultEntry> {
    const r = this.normalize(root).replace(/\/+$/, "");
    const matches: VaultEntry[] = [];
    for (const [path, file] of this.files) {
      if (path === r) continue;
      if (path.startsWith(`${r}/`) && path.endsWith(".md")) {
        matches.push({ path, mtime: file.mtime });
      }
    }
    matches.sort((a, b) => a.path.localeCompare(b.path));
    for (const m of matches) yield m;
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(this.normalize(path));
    if (!f) throw new Error(`MemoryFilesystem.readFile: not found: ${path}`);
    return f.content;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(this.normalize(path));
  }

  async createNoteFile(path: string, content: string): Promise<boolean> {
    const p = this.normalize(path);
    if (this.files.has(p)) return false;
    this.files.set(p, { content, mtime: Date.now() });
    return true;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private normalize(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  /** Test helper: snapshot every (path, content) pair currently in memory. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.files) out[k] = v.content;
    return out;
  }
}
