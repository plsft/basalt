// packages/core/src/promote/index.ts
// Promote-to-note. PRD §2.3, §3.3.
//
// Architectural invariant: this module is *pure*. It produces a
// `NoteContent { relPath, body }` object describing a NEW note that
// preserves the read-only-by-default property of the engine. The surface
// (plugin / CLI / desktop) calls `FilesystemAdapter.createNoteFile`, which
// rejects if the target path already exists.
//
// No path inside `promote/` may import `node:fs`, `fs/promises`, or any
// other write API. The architectural test in `promote/index.test.ts`
// enforces this with a directory grep.

import type { Finding } from "../verbs/types";
import { renderBuriedTemplate } from "./templates/buried";
import { renderConnectionTemplate } from "./templates/connection";
import { renderContradictionTemplate } from "./templates/contradiction";
import { renderDriftTemplate } from "./templates/drift";
import { renderThesisTemplate } from "./templates/thesis";

export interface NoteContent {
  /** Vault-root-relative target path. The surface joins to vault root. */
  relPath: string;
  /** Markdown body, including frontmatter. */
  body: string;
}

export interface PromoteOptions {
  /** Folder under the vault root where promoted notes live. Default `"Basalt"`
   *  per PRD §10 #6 (open decision pending; this is the working default). */
  folder?: string;
  /** Override the per-verb template. Rare; prefer the default. */
  template?: (finding: Finding) => string;
}

/** Produce a `NoteContent` object for the given finding. The surface
 *  (plugin / CLI / desktop) calls `FilesystemAdapter.createNoteFile` to
 *  actually write the file — this function never touches the filesystem. */
export function promoteFindingToNote(finding: Finding, opts?: PromoteOptions): NoteContent {
  const folder = (opts?.folder ?? "Basalt").replace(/\/+$/, "");
  const stem = stemFor(finding);
  const relPath = `${folder}/${stem}.md`;
  const body = opts?.template ? opts.template(finding) : defaultTemplate(finding);
  return { relPath, body };
}

function defaultTemplate(finding: Finding): string {
  switch (finding.verb) {
    case "buried-insight":
      return renderBuriedTemplate(finding);
    case "connection":
      return renderConnectionTemplate(finding);
    case "contradiction":
      return renderContradictionTemplate(finding);
    case "implicit-thesis":
      return renderThesisTemplate(finding);
    case "drift":
      return renderDriftTemplate(finding);
  }
}

function stemFor(finding: Finding): string {
  switch (finding.verb) {
    case "buried-insight":
      return `Resurfaced - ${sanitize(finding.title)}`;
    case "connection":
      return `Bridge - ${sanitize(finding.note_a.title)} and ${sanitize(finding.note_b.title)}`;
    case "contradiction":
      return `Tension - ${sanitize(finding.note_a.title)} and ${sanitize(finding.note_b.title)}`;
    case "implicit-thesis":
      return `Thesis - ${sanitize(finding.centroid.title)}`;
    case "drift":
      return `Drift - ${finding.window_days}d`;
  }
}

/** Sanitize a string for use as a filename stem. Strips characters that are
 *  illegal on common filesystems (Windows: `<>:"/\|?*`, plus control chars). */
export function sanitize(s: string): string {
  return s
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { renderBuriedTemplate } from "./templates/buried";
export { renderConnectionTemplate } from "./templates/connection";
export { renderContradictionTemplate } from "./templates/contradiction";
export { renderDriftTemplate } from "./templates/drift";
export { renderThesisTemplate } from "./templates/thesis";
