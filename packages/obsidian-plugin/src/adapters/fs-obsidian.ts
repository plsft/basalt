// packages/obsidian-plugin/src/adapters/fs-obsidian.ts
//
// Obsidian Vault FilesystemAdapter. Walks markdown files via Obsidian's
// Vault API, reads them via cachedRead (faster than raw `Vault.read`), and
// creates new files via `Vault.create`.
//
// PRD §2.1 / CLAUDE.md §5: this adapter MUST NOT modify any of the user's
// existing `.md` files. The architectural test in `fs-obsidian.test.ts`
// greps the source for forbidden Vault APIs (`Vault.modify`, `.modifyBinary`,
// `.rename`, `.delete`, `.trash`, `.process`) — any reference fails CI.

import type { FilesystemAdapter, VaultEntry } from "basalted-core";
import type { App, TFile, Vault } from "obsidian";

export interface ObsidianFilesystemOptions {
  /** Directories to skip (matches SPEC.md §1.1's EXCLUDE_DIRS). */
  excludeDirs?: ReadonlySet<string>;
}

const DEFAULT_EXCLUDE: ReadonlySet<string> = new Set([
  ".git",
  ".obsidian",
  ".stversions",
  ".stfolder",
  ".trash",
  "node_modules",
  ".claude",
  ".basalt",
]);

export class ObsidianFilesystem implements FilesystemAdapter {
  private readonly vault: Vault;
  private readonly excludeDirs: ReadonlySet<string>;

  constructor(app: App, opts?: ObsidianFilesystemOptions) {
    this.vault = app.vault;
    this.excludeDirs = opts?.excludeDirs ?? DEFAULT_EXCLUDE;
  }

  async *walk(_root: string): AsyncIterable<VaultEntry> {
    // Obsidian's Vault is rooted at the user's selected vault; the `root`
    // argument is effectively ignored here. The Engine pre-computes
    // relPath relative to its own notion of the vault root, but inside
    // Obsidian the Vault paths ARE already vault-root-relative.
    const files = this.vault.getMarkdownFiles();
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    for (const f of sorted) {
      if (this.isExcluded(f.path)) continue;
      yield { path: f.path, mtime: f.stat.mtime };
    }
  }

  async readFile(path: string): Promise<string> {
    const file = this.fileFor(path);
    if (!file) throw new Error(`ObsidianFilesystem.readFile: not found: ${path}`);
    return await this.vault.cachedRead(file);
  }

  async exists(path: string): Promise<boolean> {
    return this.fileFor(path) !== null || this.folderFor(path) !== null;
  }

  /** STRICTLY create-only. Returns false (without throwing) if the target
   *  exists. Architectural invariant: never modifies an existing file. */
  async createNoteFile(path: string, content: string): Promise<boolean> {
    if (this.fileFor(path) !== null) return false;
    const parent = path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    if (parent.length > 0 && this.folderFor(parent) === null) {
      try {
        await this.vault.createFolder(parent);
      } catch (err) {
        const msg = (err as { message?: string } | undefined)?.message ?? "";
        if (!/already exists/i.test(msg)) throw err;
      }
    }
    await this.vault.create(path, content);
    return true;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private isExcluded(path: string): boolean {
    const parts = path.replace(/\\/g, "/").split("/");
    for (const p of parts) if (this.excludeDirs.has(p)) return true;
    return false;
  }

  private fileFor(path: string): TFile | null {
    const af = this.vault.getAbstractFileByPath(path);
    if (!af) return null;
    if (af && "stat" in af) return af as TFile;
    return null;
  }

  private folderFor(path: string): unknown {
    const af = this.vault.getAbstractFileByPath(path);
    if (!af) return null;
    if (!("stat" in af)) return af;
    return null;
  }
}
