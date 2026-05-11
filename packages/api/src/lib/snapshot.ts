// Vault snapshot — the on-the-wire format that lets the API run @basalt/core
// over a user's vault without ever touching their filesystem.
//
// The client (CLI / plugin / desktop / cockpit) serializes its local index
// into this shape and POSTs it to /v1/vaults/:id/snapshot; the API stores
// it as a single R2 object keyed by vault_id. /v1/briefs/generate reads
// the latest snapshot for a vault, hydrates the engine's in-memory
// adapters, and runs the verbs.
//
// We intentionally keep this format deliberately simple — JSON only, no
// streaming, no chunking — because the cockpit's pro-tier vault sizes
// (capped at 10k notes for Pro / 50k for Founder) are well under the
// Workers 100 MB body limit when gzipped.

import { z } from "zod";

/** A single note record on the wire. Mirrors NoteRecord from @basalt/core
 *  with explicit JSON-safe types (Float32Array → base64 string for the
 *  embedding payload). */
export const SnapshotNote = z.object({
  rel_path: z.string(),
  stem: z.string(),
  title: z.string(),
  created: z.string().nullable().optional(),
  updated: z.string().nullable().optional(),
  word_count: z.number().int().nonnegative(),
  content: z.string(),
  content_hash: z.string(),
  tags: z.array(z.string()),
});
export type SnapshotNote = z.infer<typeof SnapshotNote>;

export const SnapshotEmbedding = z.object({
  rel_path: z.string(),
  model: z.string(),
  dim: z.number().int().positive(),
  /** Base64-encoded little-endian float32 vector. */
  vec_b64: z.string(),
});
export type SnapshotEmbedding = z.infer<typeof SnapshotEmbedding>;

export const SnapshotLink = z.object({
  from_rel_path: z.string(),
  /** Wikilink target text (may be unresolved). */
  target: z.string(),
});
export type SnapshotLink = z.infer<typeof SnapshotLink>;

export const VaultSnapshot = z.object({
  schema: z.literal(1),
  vault_id: z.string(),
  created_at: z.string().datetime(),
  /** ISO date the engine should treat as "today" when computing
   *  recency/age. Defaults to created_at if omitted. */
  today: z.string().optional(),
  notes: z.array(SnapshotNote),
  embeddings: z.array(SnapshotEmbedding),
  links: z.array(SnapshotLink),
});
export type VaultSnapshot = z.infer<typeof VaultSnapshot>;

export function decodeFloat32LE(b64: string): Float32Array {
  // atob → binary string → ArrayBuffer → Float32Array view.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const out = new Float32Array(bytes.byteLength / 4);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

export function encodeFloat32LE(vec: Float32Array): string {
  const bytes = new Uint8Array(vec.byteLength);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < vec.length; i++) dv.setFloat32(i * 4, vec[i] ?? 0, true);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
