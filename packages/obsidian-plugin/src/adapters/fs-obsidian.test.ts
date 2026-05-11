// Note: this test runs from the workspace-root vitest. The DOM types
// required by the Obsidian SDK aren't available there, so we mock the
// Obsidian surface narrowly via duck-typed objects.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ObsidianFilesystem } from "./fs-obsidian";

const HERE = dirname(fileURLToPath(import.meta.url));

interface MockTFile {
  path: string;
  stat: { mtime: number; ctime: number; size: number };
}

interface MockTFolder {
  path: string;
}

class MockVault {
  files = new Map<string, MockTFile>();
  folders = new Set<string>();

  addFile(path: string, content: string, mtime = 1700000000000): void {
    const file: MockTFile = { path, stat: { mtime, ctime: mtime, size: content.length } };
    this.files.set(path, file);
    (this as unknown as { _content: Map<string, string> })._content ??= new Map<string, string>();
    (this as unknown as { _content: Map<string, string> })._content.set(path, content);
    // Also register parent folders.
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      this.folders.add(parts.slice(0, i).join("/"));
    }
  }

  addFolder(path: string): void {
    this.folders.add(path);
  }

  getMarkdownFiles(): MockTFile[] {
    return Array.from(this.files.values()).filter((f) => f.path.endsWith(".md"));
  }

  getAbstractFileByPath(path: string): MockTFile | MockTFolder | null {
    if (this.files.has(path)) return this.files.get(path) as MockTFile;
    if (this.folders.has(path)) return { path };
    return null;
  }

  async cachedRead(file: MockTFile): Promise<string> {
    const content = (this as unknown as { _content: Map<string, string> })._content?.get(file.path);
    if (content === undefined) throw new Error(`cachedRead: not found: ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<MockTFile> {
    if (this.files.has(path)) throw new Error("already exists");
    this.addFile(path, content);
    return this.files.get(path)!;
  }

  async createFolder(path: string): Promise<void> {
    if (this.folders.has(path)) throw new Error("Folder already exists");
    this.folders.add(path);
  }
}

function makeApp(vault: MockVault): { vault: MockVault } {
  return { vault };
}

describe("ObsidianFilesystem.walk", () => {
  it("yields markdown files in alphabetical-sort order", async () => {
    const v = new MockVault();
    v.addFile("B.md", "b");
    v.addFile("A.md", "a");
    v.addFile("C.md", "c");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    const out: string[] = [];
    for await (const e of fs.walk("/")) out.push(e.path);
    expect(out).toEqual(["A.md", "B.md", "C.md"]);
  });

  it("filters out excluded directories", async () => {
    const v = new MockVault();
    v.addFile(".obsidian/workspace.md", "x");
    v.addFile(".basalt/something.md", "y");
    v.addFile("notes/A.md", "z");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    const out: string[] = [];
    for await (const e of fs.walk("/")) out.push(e.path);
    expect(out).toEqual(["notes/A.md"]);
  });
});

describe("ObsidianFilesystem.readFile + exists", () => {
  it("reads a known file via cachedRead", async () => {
    const v = new MockVault();
    v.addFile("notes/A.md", "the body");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    expect(await fs.readFile("notes/A.md")).toBe("the body");
  });

  it("readFile throws when missing", async () => {
    const fs = new ObsidianFilesystem(makeApp(new MockVault()) as never);
    await expect(fs.readFile("missing.md")).rejects.toThrow(/not found/);
  });

  it("exists returns true for files AND folders", async () => {
    const v = new MockVault();
    v.addFile("notes/A.md", "x");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    expect(await fs.exists("notes/A.md")).toBe(true);
    expect(await fs.exists("notes")).toBe(true);
    expect(await fs.exists("missing.md")).toBe(false);
  });
});

describe("ObsidianFilesystem.createNoteFile", () => {
  it("creates a new file in an existing folder", async () => {
    const v = new MockVault();
    v.addFolder("Basalt");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    const created = await fs.createNoteFile("Basalt/new.md", "content");
    expect(created).toBe(true);
    expect(v.files.has("Basalt/new.md")).toBe(true);
  });

  it("creates the parent folder when missing", async () => {
    const v = new MockVault();
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    await fs.createNoteFile("Basalt/Nested/Deep/x.md", "hi");
    expect(v.folders.has("Basalt/Nested/Deep")).toBe(true);
    expect(v.files.has("Basalt/Nested/Deep/x.md")).toBe(true);
  });

  it("returns false (no throw) when the target file already exists", async () => {
    const v = new MockVault();
    v.addFile("Basalt/exists.md", "old");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    const created = await fs.createNoteFile("Basalt/exists.md", "new");
    expect(created).toBe(false);
    // Original content untouched.
    expect(await fs.readFile("Basalt/exists.md")).toBe("old");
  });

  it("does NOT call any modify/rename/delete API", async () => {
    // Spy: ensure the adapter doesn't invoke forbidden APIs even if mock
    // happens to expose them.
    const v = new MockVault() as MockVault & {
      modify?: (...a: unknown[]) => unknown;
      rename?: (...a: unknown[]) => unknown;
      delete?: (...a: unknown[]) => unknown;
    };
    let modifyCalled = false;
    let renameCalled = false;
    let deleteCalled = false;
    v.modify = () => {
      modifyCalled = true;
    };
    v.rename = () => {
      renameCalled = true;
    };
    v.delete = () => {
      deleteCalled = true;
    };

    v.addFile("Basalt/exists.md", "old");
    const fs = new ObsidianFilesystem(makeApp(v) as never);
    await fs.createNoteFile("Basalt/exists.md", "new");
    await fs.createNoteFile("Basalt/fresh.md", "x");
    await fs.readFile("Basalt/exists.md");

    expect(modifyCalled).toBe(false);
    expect(renameCalled).toBe(false);
    expect(deleteCalled).toBe(false);
  });
});

describe("architectural invariant: fs-obsidian.ts uses no forbidden Vault APIs", () => {
  // The read-only-by-default invariant rests on this adapter never touching
  // existing files. PRD §2.1 / CLAUDE.md §5.
  // Method-call shape: `.foo(` or `.foo \s*(`. Avoids matching string
  // constants like `".trash"` inside DEFAULT_EXCLUDE.
  const FORBIDDEN = [
    /\.modify\s*\(/,
    /\.modifyBinary\s*\(/,
    /\.rename\s*\(/,
    /\.delete\s*\(/,
    /\.trash\s*\(/,
    /\.process\s*\(/,
    /\.append\s*\(/,
    /\.adapter\.write\s*\(/,
    /\.adapter\.append\s*\(/,
    /\.adapter\.remove\s*\(/,
  ];

  it("scans fs-obsidian.ts source for forbidden patterns", () => {
    const src = readFileSync(join(HERE, "fs-obsidian.ts"), "utf-8");
    const offenders: Array<{ pattern: string; line: number; text: string }> = [];
    src.split(/\r?\n/).forEach((line, i) => {
      // Strip line comments to avoid false positives.
      const stripped = line.replace(/\/\/.*$/, "");
      for (const pat of FORBIDDEN) {
        if (pat.test(stripped)) {
          offenders.push({ pattern: pat.source, line: i + 1, text: line.trim() });
        }
      }
    });
    expect(offenders).toEqual([]);
  });
});
