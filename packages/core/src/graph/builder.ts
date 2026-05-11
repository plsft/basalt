// packages/core/src/graph/builder.ts
// Vault walker + link graph builder.
//
// Mirrors reference/src/basalt/index.py:88-135 (upsert_note, replace_links,
// resolve_link_targets) plus vault.walk_vault. The on-disk index DB lives in
// the storage adapter; the in-memory graph here is the same data shape but
// used by the verbs that don't need persistence (Connection, Implicit Thesis).
//
// Wikilink resolution is **case-insensitive stem match** per SPEC.md §1.3.
// Ambiguous stems (multiple notes with same stem) resolve to the first one
// seen in walk order — matches the Python behavior at
// `index.py:resolve_link_targets:124-135` where the dict overwrite rule
// gives the last note wins. Walk order is alphabetical within each directory
// (FilesystemAdapter contract); ties always break the same way.

import type { FilesystemAdapter, VaultEntry } from "../adapters/filesystem";
import { parseMarkdown } from "../parser/markdown";
import type { Note } from "../types";
import { hubDensity } from "./hub-penalty";

export interface BuiltNote extends Note {
  /** Surrogate ID assigned by walk order (1-based, like SQLite AUTOINCREMENT). */
  id: number;
}

export interface BuiltLink {
  fromId: number;
  /** Raw target string before stem resolution. */
  target: string;
  /** Resolved note ID; null if no matching stem in the vault. */
  targetId: number | null;
}

export interface BuiltGraph {
  notes: BuiltNote[];
  /** Lookup by `relPath`. */
  notesByPath: Map<string, BuiltNote>;
  /** Lookup by id. */
  notesById: Map<number, BuiltNote>;
  /** Outgoing links, in walk order. */
  links: BuiltLink[];
  /** Per-note outgoing-distinct-target count (for hub density). Indexed by id. */
  outLinkCount: Map<number, number>;
  /** Per-note hub density (outgoing distinct links per 100 words). Indexed by id. */
  density: Map<number, number>;
}

/** Build the in-memory link graph by walking the vault. The `vaultRoot`
 *  argument is forwarded to `fs.walk` and used to compute `relPath`s. */
export async function buildLinkGraph(
  fs: FilesystemAdapter,
  vaultRoot: string,
): Promise<BuiltGraph> {
  const notes: BuiltNote[] = [];
  const notesByPath = new Map<string, BuiltNote>();
  const notesById = new Map<number, BuiltNote>();
  const linksRaw: Array<{ fromId: number; target: string }> = [];

  // Materialize the walk first so we can sort it deterministically — the
  // Python walk_vault uses Path.rglob which is FS-order-dependent. The TS
  // memory adapter sorts; we sort here too so all adapters agree.
  const entries: VaultEntry[] = [];
  for await (const e of fs.walk(vaultRoot)) {
    entries.push(e);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));

  let nextId = 1;
  for (const entry of entries) {
    const raw = await fs.readFile(entry.path);
    const stem = entry.path.split(/[\\/]/).pop()!.replace(/\.md$/i, "");
    const parsed = await parseMarkdown(raw, { stem });
    if (parsed === null) continue;
    const id = nextId++;
    const relPath = toForwardSlashes(toRelative(entry.path, vaultRoot));
    const note: BuiltNote = {
      ...parsed,
      id,
      path: entry.path,
      relPath,
    };
    notes.push(note);
    notesByPath.set(relPath, note);
    notesById.set(id, note);
    for (const target of parsed.wikilinks) {
      linksRaw.push({ fromId: id, target });
    }
  }

  // Resolve wikilinks: case-insensitive stem match. mirrors
  // `index.py:resolve_link_targets:124-135` where stem_to_id is built and
  // then iterated; later same-stem notes overwrite earlier ones. We replicate
  // that "last write wins" by walking in id order (== walk order) and
  // letting later notes overwrite the map.
  const stemToId = new Map<string, number>();
  for (const n of notes) {
    stemToId.set(n.stem.toLowerCase(), n.id);
  }
  const links: BuiltLink[] = linksRaw.map(({ fromId, target }) => ({
    fromId,
    target,
    targetId: stemToId.get(target.toLowerCase()) ?? null,
  }));

  // Per-note outgoing-distinct-target count: matches the SQL
  // `SELECT from_note_id, COUNT(DISTINCT target) FROM links GROUP BY from_note_id`
  // at buried.py:471-472 (and equivalents in the other verb modules).
  const distinctTargetsPerNote = new Map<number, Set<string>>();
  for (const l of links) {
    let set = distinctTargetsPerNote.get(l.fromId);
    if (!set) {
      set = new Set();
      distinctTargetsPerNote.set(l.fromId, set);
    }
    set.add(l.target);
  }
  const outLinkCount = new Map<number, number>();
  for (const [id, set] of distinctTargetsPerNote) {
    outLinkCount.set(id, set.size);
  }

  const density = new Map<number, number>();
  for (const n of notes) {
    density.set(n.id, hubDensity(outLinkCount.get(n.id) ?? 0, n.wordCount));
  }

  return { notes, notesByPath, notesById, links, outLinkCount, density };
}

function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Compute `path` relative to `root`, returning a forward-slash path. */
function toRelative(absolute: string, root: string): string {
  const a = toForwardSlashes(absolute);
  const r = toForwardSlashes(root).replace(/\/+$/, "");
  if (a.startsWith(`${r}/`)) return a.slice(r.length + 1);
  if (a === r) return "";
  return a;
}

/** Convenience: lookup the resolved targets for a given note id. */
export function outgoingResolved(graph: BuiltGraph, fromId: number): number[] {
  const out: number[] = [];
  for (const l of graph.links) {
    if (l.fromId === fromId && l.targetId !== null) out.push(l.targetId);
  }
  return out;
}

/** Convenience: lookup all incoming resolved fromIds for a given note id. */
export function incomingResolved(graph: BuiltGraph, toId: number): number[] {
  const out: number[] = [];
  for (const l of graph.links) {
    if (l.targetId === toId) out.push(l.fromId);
  }
  return out;
}
