// Adapter bridge — hydrates basalted-core's adapters from a VaultSnapshot
// living in R2. The verbs are pure TS and run inside the Workers isolate
// directly; no additional native deps.

import {
  type Embedding,
  type EmbeddingAdapter,
  Engine,
  type Engine as EngineType,
  type FilesystemAdapter,
  MemoryFilesystem,
  MemoryStorage,
  MockEmbedder,
} from "basalted-core";
// Side-effect: registers every verb so Engine.brief({ section: "all" }) sees them.
import "basalted-core/verbs";
import { decodeFloat32LE, type VaultSnapshot } from "./snapshot";

export interface BuildEngineResult {
  engine: EngineType;
  storage: MemoryStorage;
  filesystem: FilesystemAdapter;
  embedding: EmbeddingAdapter;
  noteIdByPath: Map<string, number>;
}

/** Build an Engine seeded with a snapshot's notes, embeddings, and links.
 *  The brief verbs see the snapshot as if it had just been freshly indexed. */
export async function buildEngineFromSnapshot(snapshot: VaultSnapshot): Promise<BuildEngineResult> {
  // Synthesize a virtual filesystem so engine.index({ vault }) walks the
  // expected paths. Content matches the snapshot exactly.
  const files: Record<string, string> = {};
  for (const n of snapshot.notes) {
    files[`/${n.rel_path}`] = n.content;
  }
  const filesystem = new MemoryFilesystem(files);
  const storage = new MemoryStorage();
  const embedding = new MockEmbedder({ dim: 768 });

  const engine = await Engine.create({
    storage,
    embedding,
    filesystem,
    ...(snapshot.today !== undefined ? { options: { today: snapshot.today } } : {}),
  });

  // Walk the synthesized filesystem so storage gets populated with notes +
  // links + the link graph. We're using MemoryStorage so this is fast.
  await engine.index({ vault: "/" });

  // Replace the mock embeddings with the snapshot's real ones (keyed by
  // rel_path → noteId).
  const snap = storage.snapshot();
  const noteIdByPath = new Map<string, number>();
  for (const n of snap.notes) noteIdByPath.set(n.relPath, n.id);

  for (const e of snapshot.embeddings) {
    const id = noteIdByPath.get(e.rel_path);
    if (id === undefined) continue;
    const vec = decodeFloat32LE(e.vec_b64);
    const note = snap.notes.find((n) => n.id === id);
    if (!note) continue;
    const emb: Pick<Embedding, "model" | "contentHash" | "dim" | "vec"> = {
      model: e.model,
      contentHash: note.contentHash,
      dim: e.dim,
      vec,
    };
    await storage.upsertEmbedding(id, emb);
  }

  return { engine, storage, filesystem, embedding, noteIdByPath };
}
