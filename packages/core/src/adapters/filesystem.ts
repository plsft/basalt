// FilesystemAdapter interface — read-only on the user's vault by design.
// Implementations:
//   - filesystem-memory.ts (in core, for tests; TASK-1.3)
//   - fs-obsidian.ts (in @basalt/obsidian-plugin, Vault API; TASK-1.14)
//   - fs-node.ts (in @basalt/cli, fs/promises; Phase 2 / TASK-2.2)
//   - fs-tauri.ts (in @basalt/desktop, Tauri plugin-fs; Phase 4)
//   - fs-r2.ts (in @basalt/api, R2 vault sync; Phase 3, opt-in)
//
// `createNoteFile` is the only mutation primitive. It is strictly create-only.
// Implementations MUST reject if the target path exists. PRD §2.1, §3.3.
// CLAUDE.md §5 forbids modifying any of the user's existing `.md` files.

export interface VaultEntry {
  /** Absolute on-disk path, normalized to forward slashes. */
  path: string;
  /** mtime in epoch milliseconds. */
  mtime: number;
}

export interface FilesystemAdapter {
  /** Yield every parseable file under `root`. Implementations apply `EXCLUDE_DIRS`
   *  per SPEC.md §1.1. Returns an async iterable so 100k-note vaults stream. */
  walk(root: string): AsyncIterable<VaultEntry>;

  readFile(path: string): Promise<string>;

  exists(path: string): Promise<boolean>;

  /** Create a new file at `path`. Returns false (without throwing) if the path
   *  already exists. The "create-only" property is the architectural contract:
   *  no implementation may overwrite, modify, rename, move, or delete an
   *  existing file from this method. */
  createNoteFile(path: string, content: string): Promise<boolean>;
}
