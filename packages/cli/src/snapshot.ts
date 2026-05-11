// Serialize the CLI's local SQLite index into the API's VaultSnapshot shape.
// The format mirrors packages/api/src/lib/snapshot.ts exactly — keep them in
// lockstep.

import type { Embedding, StorageAdapter } from "@basalt/core";

export interface SnapshotPayload {
  schema: 1;
  vault_id: string;
  created_at: string;
  today: string;
  notes: Array<{
    rel_path: string;
    stem: string;
    title: string;
    created?: string | null | undefined;
    updated?: string | null | undefined;
    word_count: number;
    content: string;
    content_hash: string;
    tags: string[];
  }>;
  embeddings: Array<{
    rel_path: string;
    model: string;
    dim: number;
    vec_b64: string;
  }>;
  links: Array<{ from_rel_path: string; target: string }>;
}

export async function buildSnapshot(
  storage: StorageAdapter,
  vaultId: string,
): Promise<SnapshotPayload> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const notes: SnapshotPayload["notes"] = [];
  const noteIdToRelPath = new Map<number, string>();
  for await (const n of storage.listNotes()) {
    noteIdToRelPath.set(n.id, n.relPath);
    notes.push({
      rel_path: n.relPath,
      stem: n.stem,
      title: n.title,
      created: n.created ?? undefined,
      updated: n.updated ?? undefined,
      word_count: n.wordCount,
      content: n.content,
      content_hash: n.contentHash,
      tags: n.tags,
    });
  }

  const embeddings: SnapshotPayload["embeddings"] = [];
  for await (const e of storage.listEmbeddings()) {
    const relPath = noteIdToRelPath.get(e.noteId);
    if (!relPath) continue;
    embeddings.push({
      rel_path: relPath,
      model: e.model,
      dim: e.dim,
      vec_b64: encodeFloat32LE(e.vec),
    });
  }

  // Links: storage doesn't expose listLinks, so we don't include them by
  // default. The API re-derives the link graph during indexing from the
  // notes' content — wikilinks are re-extracted from each note's body.
  return {
    schema: 1,
    vault_id: vaultId,
    created_at: now.toISOString(),
    today,
    notes,
    embeddings,
    links: [],
  };
}

export function encodeFloat32LE(vec: Embedding["vec"]): string {
  const bytes = new Uint8Array(vec.byteLength);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < vec.length; i++) dv.setFloat32(i * 4, vec[i] ?? 0, true);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return Buffer.from(s, "binary").toString("base64");
}

export interface PushResult {
  ok: boolean;
  note_count: number;
  embedding_count: number;
  link_count: number;
  bytes: number;
}

export async function pushSnapshot(
  apiUrl: string,
  apiToken: string,
  payload: SnapshotPayload,
): Promise<PushResult> {
  const url = `${apiUrl.replace(/\/$/, "")}/v1/vaults/${encodeURIComponent(payload.vault_id)}/snapshot`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `basalt_session=${apiToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Snapshot upload failed: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as PushResult;
}
