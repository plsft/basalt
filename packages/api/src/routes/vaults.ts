// packages/api/src/routes/vaults.ts

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const vaultsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

vaultsRoutes.use("*", requireAuth);
vaultsRoutes.use("*", rateLimit({ scope: "vaults" }));

const CreateVault = z.object({ name: z.string().min(1).max(120) });

vaultsRoutes.post("/", zValidator("json", CreateVault), async (c) => {
  const user = c.get("user")!;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO vaults (id, user_id, name, sync_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  )
    .bind(id, user.id, c.req.valid("json").name, now, now)
    .run();
  return c.json({ id, name: c.req.valid("json").name, created_at: now }, 201);
});

vaultsRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const result = await c.env.DB.prepare(
    "SELECT id, name, sync_enabled, created_at, updated_at FROM vaults WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();
  return c.json({ vaults: result.results });
});

vaultsRoutes.post("/:id/index", async (c) => {
  const user = c.get("user")!;
  const vaultId = c.req.param("id");
  // Enqueue indexing job — the Worker that consumes basalt-index-jobs runs
  // the actual pipeline. See packages/api/src/queue/index-handler.ts (lands
  // alongside the Workflow definition).
  const jobId = crypto.randomUUID();
  await c.env.INDEX_QUEUE.send({
    jobId,
    userId: user.id,
    vaultId,
    startedAt: new Date().toISOString(),
  });
  return c.json({ jobId, status: "queued" }, 202);
});

vaultsRoutes.get("/:id/index/:jobId", async (c) => {
  // The Workflow updates job status in KV under `index_job:<jobId>`.
  const jobId = c.req.param("jobId");
  const status = await c.env.SESSIONS.get(`index_job:${jobId}`);
  if (!status) return c.json({ error: "job_not_found" }, 404);
  return c.json(JSON.parse(status));
});
