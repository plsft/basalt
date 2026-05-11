// packages/api/src/routes/briefs.ts

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const briefsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

briefsRoutes.use("*", requireAuth);
briefsRoutes.use("*", rateLimit({ scope: "briefs", max: 30 }));

const GenerateInput = z.object({
  vault_id: z.string(),
  section: z
    .enum(["all", "buried-insight", "connection", "contradiction", "implicit-thesis", "drift"])
    .default("all"),
  top: z.number().int().min(1).max(10).default(3),
});

briefsRoutes.post("/generate", zValidator("json", GenerateInput), async (c) => {
  const user = c.get("user")!;
  const { vault_id, section, top } = c.req.valid("json");
  // Pro tier only.
  if (user.tier === "free") {
    return c.json({ error: "upgrade_required", required_tier: "pro" }, 402);
  }
  // The actual brief generation runs in a Worker that has the engine loaded
  // — typically via the same INDEX_QUEUE flow. For Phase 3 v0, return a
  // structured "queued" response; the Workflow handler does the work.
  const briefId = crypto.randomUUID();
  await c.env.INDEX_QUEUE.send({
    type: "brief",
    briefId,
    userId: user.id,
    vaultId: vault_id,
    section,
    top,
    requestedAt: new Date().toISOString(),
  });
  return c.json({ id: briefId, status: "queued" }, 202);
});

briefsRoutes.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM briefs WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first<{
      id: string;
      vault_id: string;
      section: string;
      brief_json: string;
      created_at: string;
    }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: row.id,
    vault_id: row.vault_id,
    section: row.section,
    created_at: row.created_at,
    brief: JSON.parse(row.brief_json),
  });
});

briefsRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const vault = c.req.query("vault");
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "20", 10), 100);
  const params: unknown[] = [user.id];
  let where = "WHERE user_id = ?";
  if (vault) {
    where += " AND vault_id = ?";
    params.push(vault);
  }
  const result = await c.env.DB.prepare(
    `SELECT id, vault_id, section, created_at FROM briefs ${where} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...params, limit)
    .all();
  return c.json({ briefs: result.results });
});
