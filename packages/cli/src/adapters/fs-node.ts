// packages/cli/src/adapters/fs-node.ts
// fs/promises FilesystemAdapter for Node/Bun. createNoteFile is STRICTLY
// create-only — uses fs.open with the "wx" flag, which fails atomically if
// the target exists.
//
// PRD §2.1 / CLAUDE.md §5: this adapter must never modify any existing .md
// file. Architectural test in fs-node.test.ts greps for forbidden write
// APIs (unlink, rename, rm, rmdir, fs.write to an existing path).

import { open, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type { FilesystemAdapter, VaultEntry } from "basalted-core";

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

export interface NodeFilesystemOptions {
  excludeDirs?: ReadonlySet<string>;
}

export class NodeFilesystem implements FilesystemAdapter {
  private readonly excludeDirs: ReadonlySet<string>;

  constructor(opts?: NodeFilesystemOptions) {
    this.excludeDirs = opts?.excludeDirs ?? DEFAULT_EXCLUDE;
  }

  async *walk(root: string): AsyncIterable<VaultEntry> {
    const normalised = normalize(root).replace(/\\/g, "/");
    const entries: VaultEntry[] = [];
    await this.collect(normalised, entries);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    for (const e of entries) yield e;
  }

  private async collect(dir: string, out: VaultEntry[]): Promise<void> {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (this.excludeDirs.has(dirent.name)) continue;
      const full = join(dir, dirent.name).replace(/\\/g, "/");
      if (dirent.isDirectory()) {
        await this.collect(full, out);
      } else if (dirent.isFile() && dirent.name.endsWith(".md")) {
        try {
          const s = await stat(full);
          out.push({ path: full, mtime: s.mtimeMs });
        } catch {
          // Skip unreadable entries.
        }
      }
    }
  }

  async readFile(path: string): Promise<string> {
    return await readFile(path, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /** STRICTLY create-only. Uses fs.open with the "wx" flag — POSIX-atomic
   *  fail-if-exists. Returns false (no throw) on EEXIST; rethrows other errors. */
  async createNoteFile(path: string, content: string): Promise<boolean> {
    const parent = dirname(path);
    if (parent && parent !== "." && !(await this.exists(parent))) {
      const fsmod = await import("node:fs/promises");
      await fsmod.mkdir(parent, { recursive: true });
    }
    let handle: import("node:fs/promises").FileHandle | undefined;
    try {
      handle = await open(path, "wx");
      await handle.writeFile(content, { encoding: "utf-8" });
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return false;
      throw err;
    } finally {
      if (handle) await handle.close();
    }
  }
}
