// packages/core/src/promote/index.ts
// Promote-to-note. PRD §2.3, §3.3. The only mutation primitive in the
// engine — and even then, this module is *pure*: it produces a NoteContent
// object. The surface (plugin / CLI / desktop) calls
// FilesystemAdapter.createNoteFile to actually create the file.
//
// Architectural invariant (TASK-1.12): no path inside `promote/` may
// import or call any filesystem write API. The promote module composes
// content; the surface decides where it lives.
//
// Real implementation lands in TASK-1.12.

import type { Finding } from "../verbs/types";

export interface NoteContent {
  /** Vault-root-relative target path. The surface joins to vault root. */
  relPath: string;
  /** Markdown body, including frontmatter. */
  body: string;
}

export interface PromoteOptions {
  /** Folder under the vault root where promoted notes live. Default `"Basalt"`. */
  folder?: string;
  /** Override the per-verb template. Rare; prefer the default. */
  template?: (finding: Finding) => NoteContent;
}

export function promoteFindingToNote(_finding: Finding, _opts?: PromoteOptions): NoteContent {
  throw new Error("promoteFindingToNote: not yet implemented (lands in TASK-1.12)");
}
