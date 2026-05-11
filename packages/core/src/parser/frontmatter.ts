// packages/core/src/parser/frontmatter.ts
// YAML frontmatter parser. Mirrors python-frontmatter's `loads` semantics so
// the TS port produces the same metadata + body split for every fixture file.
//
// SPEC.md §1.2:
//   - Recognised keys: title, created, updated, tags
//   - created/updated coerced through _coerce_date (date | datetime | one of
//     three string formats); falls back to filesystem mtime/ctime upstream
//   - tags coerces from string OR list of strings
//
// Python reference: reference/src/basalt/vault.py:33-46, :72-119

import yaml from "js-yaml";

/** Frontmatter delimiter at start of file: three dashes, optional whitespace,
 *  newline. Closes at the next standalone `---` line. */
const FM_OPEN = /^---[ \t]*\r?\n/;
const FM_CLOSE = /\r?\n---[ \t]*(?:\r?\n|$)/;

export interface ParsedFrontmatter {
  /** Raw metadata dict (string keys; values may be coerced types). */
  metadata: Record<string, unknown>;
  /** Body content after the frontmatter block. Frontmatter delimiters stripped. */
  body: string;
}

/** Parse YAML frontmatter at the top of a Markdown document. Returns the
 *  metadata dict and the remaining body. Mirrors `python-frontmatter.parse`
 *  exactly:
 *
 *  - Raw input is `.strip()`-ed before delimiter detection.
 *  - If the document has no frontmatter, metadata is `{}` and body is the
 *    stripped raw text.
 *  - If frontmatter parsing fails, metadata is `{}` and body is the stripped
 *    raw text. (Matches `frontmatter.Post(raw, **{})` fallback in
 *    `vault.py:81-82`, plus `parse`'s `content.strip()` final return.)
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const stripped = raw.trim();
  const open = stripped.match(FM_OPEN);
  if (!open) {
    return { metadata: {}, body: stripped };
  }
  const afterOpen = stripped.slice(open[0].length);
  const close = afterOpen.match(FM_CLOSE);
  if (!close) {
    return { metadata: {}, body: stripped };
  }
  const yamlText = afterOpen.slice(0, close.index ?? 0);
  const body = afterOpen.slice((close.index ?? 0) + close[0].length).trim();

  let metadata: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(yamlText, { schema: yaml.DEFAULT_SCHEMA });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    return { metadata: {}, body: stripped };
  }
  return { metadata, body };
}

/** Coerce a frontmatter `created` / `updated` value to an ISO YYYY-MM-DD
 *  string, mirroring `vault.py:_coerce_date` (lines 33-46).
 *
 *  Accepts:
 *    - null/undefined  → null
 *    - Date instance   → its YYYY-MM-DD (UTC)
 *    - string in `%Y-%m-%d`, `%Y/%m/%d`, or `%Y-%m-%dT%H:%M:%S` (truncated to 19 chars)
 *  Anything else → null.
 *
 *  Note: js-yaml's DEFAULT_SCHEMA auto-parses `2024-01-01` into a Date object
 *  (interpreted as UTC midnight per the YAML 1.2 spec). Python's PyYAML does
 *  the same — both produce the same calendar day. We only diverge if the YAML
 *  contains a timestamp without a timezone; in that case both libraries
 *  default to UTC, so output matches. */
export function coerceDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return isoDate(v);
  }
  if (typeof v === "string") {
    // Truncate to 19 chars (Python: v[:19]) before format probing.
    const candidate = v.slice(0, 19);
    // %Y-%m-%d
    let m = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // %Y/%m/%d  → normalize to ISO
    m = candidate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // %Y-%m-%dT%H:%M:%S  → take the date part
    m = candidate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Coerce frontmatter `tags` to `string[]`. Mirrors `vault.py:99-105`:
 *
 *  - string  → split on comma, trim each, drop empties
 *  - list    → string-each, trim, drop empties
 *  - other   → []
 */
export function coerceTags(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  if (Array.isArray(v)) {
    return v.map((t) => String(t).trim()).filter((t) => t.length > 0);
  }
  return [];
}
