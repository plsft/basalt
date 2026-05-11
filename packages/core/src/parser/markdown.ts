// packages/core/src/parser/markdown.ts
// Top-level Markdown parser. Mirrors `reference/src/basalt/vault.py:parse_note`.
//
// Design note: the Python reference uses simple regex on the body for
// wikilink extraction (vault.py:14, :49-56). Wikilinks inside fenced code
// blocks ARE detected as links — that's the documented v0.0.11 behaviour.
// The TS port preserves it. (See docs/parsing-decisions.md.)
//
// Word count uses the same "split on whitespace, drop empties" semantics as
// Python's `body.split()` — SPEC.md §1.4 reference test vector:
// "  hello   world\n" → 2.

import type { Note } from "../types";
import { coerceDate, coerceTags, parseFrontmatter } from "./frontmatter";

/** Parser output: everything in `Note` except the filesystem-side fields
 *  (`path`, `relPath`). The vault walker pairs these with the FS-derived
 *  fields to build a full `Note`. */
export interface ParsedNote extends Omit<Note, "path" | "relPath"> {}

/** Wikilink regex from `vault.py:14`. Captures content between `[[` and `]]`. */
export const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Extract wikilink targets from a body. Strips alias suffix (`|`) and anchor
 *  (`#`). `vault.py:49-56`. Empty targets dropped. */
export function extractWikilinks(text: string): string[] {
  const out: string[] = [];
  // .matchAll requires a /g regex; reset state safe via fresh iterator.
  for (const m of text.matchAll(WIKILINK_RE)) {
    const raw = m[1];
    if (!raw) continue;
    const target = raw.split("|")[0]!.split("#")[0]!.trim();
    if (target.length > 0) out.push(target);
  }
  return out;
}

/** Word count via Python's `str.split()` semantics: split on any run of
 *  whitespace, drop empties. */
export function wordCount(s: string): number {
  if (s.length === 0) return 0;
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

/** SHA-256 hex of the UTF-8 encoding of `s`. Matches Python's
 *  `hashlib.sha256(body.encode("utf-8", "replace")).hexdigest()`. */
export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex: string[] = [];
  const view = new Uint8Array(digest);
  for (let i = 0; i < view.length; i++) {
    hex.push(view[i]!.toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

export interface ParseOptions {
  /** Title fallback if frontmatter has no `title` (defaults to caller-provided stem). */
  stem: string;
  /** Filesystem-derived created date if the frontmatter doesn't carry one. */
  fallbackCreated?: string | null;
  /** Filesystem-derived updated date if the frontmatter doesn't carry one. */
  fallbackUpdated?: string | null;
}

/** Normalize CRLF / CR to LF. Matches Python's `Path.read_text` universal-
 *  newlines behavior (used in `vault.py:75`); without this, content_hash
 *  would diverge on Windows checkouts. */
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

/** Parse a single Markdown file into a `ParsedNote`. Returns null if the
 *  body is empty after frontmatter is stripped (matches `vault.walk_vault`'s
 *  `note.word_count > 0` filter at line 131). */
export async function parseMarkdown(raw: string, opts: ParseOptions): Promise<ParsedNote | null> {
  const normalized = normalizeNewlines(raw);
  const { metadata, body } = parseFrontmatter(normalized);

  const title =
    metadata.title !== undefined && metadata.title !== null ? String(metadata.title) : opts.stem;
  const created = coerceDate(metadata.created) ?? opts.fallbackCreated ?? null;
  const updated = coerceDate(metadata.updated) ?? opts.fallbackUpdated ?? null;
  const tags = coerceTags(metadata.tags ?? []);
  const wikilinks = extractWikilinks(body);
  const wc = wordCount(body);
  if (wc === 0) return null;
  const contentHash = await sha256Hex(body);

  return {
    stem: opts.stem,
    title,
    created,
    updated,
    tags,
    content: body,
    wikilinks,
    wordCount: wc,
    contentHash,
  };
}
