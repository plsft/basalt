// Vectorize index helpers. Vector IDs are namespaced by user + vault so a
// single Workers Vectorize index serves every user safely with metadata
// filtering — never share user vectors across query results.

import type { Vectorize } from "@cloudflare/workers-types";

export interface VaultVectorMetadata {
  user_id: string;
  vault_id: string;
  rel_path: string;
  title: string;
  /** ISO date string; let Vectorize use string comparison for recency filters. */
  updated: string | null;
}

export function vectorId(userId: string, vaultId: string, relPath: string): string {
  // Vectorize IDs must be ≤ 64 chars and ASCII-safe. Hash the path so the
  // result is bounded; prefix with user/vault to make manual inspection
  // useful in logs.
  const hash = simpleHash(relPath);
  return `${userId.slice(0, 12)}_${vaultId.slice(0, 12)}_${hash}`;
}

function simpleHash(s: string): string {
  // 32-bit FNV-1a → 8 hex chars. Collisions within a vault are
  // possible but rare; the rel_path is also stored in metadata so we
  // can dedupe at query time if needed.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface UpsertNote {
  rel_path: string;
  title: string;
  updated: string | null;
  vec: Float32Array;
}

export async function upsertVectorsForVault(
  vectorize: Vectorize,
  userId: string,
  vaultId: string,
  notes: UpsertNote[],
): Promise<{ inserted: number; updated: number }> {
  if (notes.length === 0) return { inserted: 0, updated: 0 };
  const records = notes.map((n) => ({
    id: vectorId(userId, vaultId, n.rel_path),
    values: Array.from(n.vec),
    metadata: {
      user_id: userId,
      vault_id: vaultId,
      rel_path: n.rel_path,
      title: n.title,
      updated: n.updated ?? "",
    } satisfies Record<string, string | number | boolean>,
  }));
  // Vectorize upsert behavior: insert-or-replace. We don't distinguish
  // insert vs update because the API doesn't tell us; report both as the
  // total batch size for callers.
  const res = await vectorize.upsert(records);
  // The shape of `res` differs by Vectorize SDK version; expose count
  // safely.
  const total =
    typeof res === "object" && res !== null && "count" in res
      ? (res as { count: number }).count
      : records.length;
  return { inserted: total, updated: 0 };
}

export interface SearchHit {
  id: string;
  score: number;
  metadata: VaultVectorMetadata;
}

export async function searchVectors(
  vectorize: Vectorize,
  userId: string,
  vaultIds: string[],
  queryVec: Float32Array,
  topK: number,
): Promise<SearchHit[]> {
  // Vectorize supports metadata filtering with $eq / $in. We always
  // filter on user_id; vault_ids is optional.
  type FilterValue =
    | string
    | number
    | boolean
    | { $eq?: string | number | boolean | null; $in?: Array<string | number | boolean> };
  const filter: Record<string, FilterValue> = { user_id: { $eq: userId } };
  if (vaultIds.length > 0) {
    filter.vault_id =
      vaultIds.length === 1 && vaultIds[0] !== undefined ? { $eq: vaultIds[0] } : { $in: vaultIds };
  }

  const result = await vectorize.query(Array.from(queryVec), {
    topK: Math.max(1, Math.min(100, topK)),
    filter: filter as unknown as Parameters<typeof vectorize.query>[1] extends infer T
      ? T extends { filter?: infer F }
        ? F
        : never
      : never,
    returnMetadata: "all",
  });
  return (result.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score,
    metadata: (m.metadata ?? {}) as unknown as VaultVectorMetadata,
  }));
}

export async function deleteVectorsForVault(
  vectorize: Vectorize,
  userId: string,
  vaultId: string,
  relPaths: string[],
): Promise<number> {
  if (relPaths.length === 0) return 0;
  const ids = relPaths.map((p) => vectorId(userId, vaultId, p));
  await vectorize.deleteByIds(ids);
  return ids.length;
}
