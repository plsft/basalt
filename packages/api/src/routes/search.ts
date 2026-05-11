// packages/api/src/routes/search.ts
//
// Cross-vault search. Embeds the query via Workers AI, queries Vectorize
// filtered to the user's vaults, returns top-K notes with similarity
// scores. The user can pass vault_ids[] to scope, or omit to search every
// vault they own.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { searchVectors } from "../lib/vectorize";
import { embedQueryWorkers, WORKERS_EMBEDDING_DEFAULT_MODEL } from "../lib/workers-embedding";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const searchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

searchRoutes.use("*", requireAuth);
searchRoutes.use("*", rateLimit({ scope: "search", max: 60 }));

const SearchInput = z.object({
  query: z.string().min(1).max(2000),
  vault_ids: z.array(z.string()).optional(),
  top: z.number().int().min(1).max(50).default(10),
});

searchRoutes.post("/", zValidator("json", SearchInput), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.AI) return c.json({ error: "ai_binding_missing" }, 501);
  const { query, vault_ids, top } = c.req.valid("json");

  // Validate vault ownership for any vault_ids the client passed in.
  if (vault_ids && vault_ids.length > 0) {
    const placeholders = vault_ids.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT id FROM vaults WHERE user_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    )
      .bind(user.id, ...vault_ids)
      .all<{ id: string }>();
    const ownedIds = new Set((rows.results ?? []).map((r) => r.id));
    const unowned = vault_ids.filter((v) => !ownedIds.has(v));
    if (unowned.length > 0) {
      return c.json({ error: "forbidden_vault_ids", unowned }, 403);
    }
  }

  const t0 = Date.now();
  const queryVec = await embedQueryWorkers(c.env.AI, query, WORKERS_EMBEDDING_DEFAULT_MODEL);
  const hits = await searchVectors(c.env.VECTORIZE, user.id, vault_ids ?? [], queryVec, top);
  const elapsed = Date.now() - t0;
  return c.json({
    query,
    elapsed_ms: elapsed,
    embedding_model: WORKERS_EMBEDDING_DEFAULT_MODEL,
    hits: hits.map((h) => ({
      vault_id: h.metadata.vault_id,
      rel_path: h.metadata.rel_path,
      title: h.metadata.title,
      updated: h.metadata.updated || null,
      score: h.score,
    })),
  });
});
