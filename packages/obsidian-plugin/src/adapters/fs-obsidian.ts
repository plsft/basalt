// packages/obsidian-plugin/src/adapters/fs-obsidian.ts
// Obsidian Vault FilesystemAdapter — full implementation in TASK-1.14.

import type { FilesystemAdapter, VaultEntry } from "@basalt/core";
import type { App } from "obsidian";

export class ObsidianFilesystem implements FilesystemAdapter {
  constructor(private readonly app: App) {}

  async *walk(_root: string): AsyncIterable<VaultEntry> {
    throw new Error("ObsidianFilesystem.walk: not yet implemented (lands in TASK-1.14)");
    // biome-ignore lint/correctness/noUnreachable: signal generator type
    yield { path: "", mtime: 0 };
  }

  async readFile(_path: string): Promise<string> {
    throw new Error("ObsidianFilesystem.readFile: not yet implemented (lands in TASK-1.14)");
  }

  async exists(_path: string): Promise<boolean> {
    throw new Error("ObsidianFilesystem.exists: not yet implemented (lands in TASK-1.14)");
  }

  async createNoteFile(_path: string, _content: string): Promise<boolean> {
    throw new Error("ObsidianFilesystem.createNoteFile: not yet implemented (lands in TASK-1.14)");
  }
}
