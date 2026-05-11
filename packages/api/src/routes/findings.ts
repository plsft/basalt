// packages/api/src/routes/findings.ts
//
// Finding lifecycle endpoints. Every mutation here is owner-scoped through
// the JOIN to briefs (which carries user_id) — clients cannot mutate another
// user's findings even if they guess an ID.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { ulid } from "../lib/ulid";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const findingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

findingsRoutes.use("*", requireAuth);
findingsRoutes.use("*", rateLimit({ scope: "findings" }));

const ListQuery = z.object({
  vault_id: z.string().optional(),
  verb: z
    .enum(["buried-insight", "connection", "contradiction", "implicit-thesis", "drift"])
    .optional(),
  status: z.enum(["pending", "confirmed", "falsified", "snoozed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

findingsRoutes.get("/", zValidator("query", ListQuery), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const q = c.req.valid("query");
  const clauses: string[] = ["b.user_id = ?"];
  const params: unknown[] = [user.id];
  if (q.vault_id) {
    clauses.push("f.vault_id = ?");
    params.push(q.vault_id);
  }
  if (q.verb) {
    clauses.push("f.verb = ?");
    params.push(q.verb);
  }
  if (q.status) {
    clauses.push("f.status = ?");
    params.push(q.status);
  }
  if (q.cursor) {
    clauses.push("f.id < ?");
    params.push(q.cursor);
  }
  const sql = `
    SELECT f.id, f.brief_id, f.vault_id, f.verb, f.finding_key,
           f.finding_json, f.status, f.verdict_at, f.verdict_reason,
           f.created_at
    FROM findings f
    JOIN briefs b ON b.id = f.brief_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY f.id DESC
    LIMIT ?
  `;
  params.push(q.limit);
  const res = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      brief_id: string;
      vault_id: string;
      verb: string;
      finding_key: string;
      finding_json: string;
      status: string;
      verdict_at: string | null;
      verdict_reason: string | null;
      created_at: string;
    }>();
  const items = (res.results ?? []).map((r) => ({
    id: r.id,
    brief_id: r.brief_id,
    vault_id: r.vault_id,
    verb: r.verb,
    finding_key: r.finding_key,
    status: r.status,
    verdict_at: r.verdict_at,
    verdict_reason: r.verdict_reason,
    created_at: r.created_at,
    finding: JSON.parse(r.finding_json),
  }));
  const next = items.length === q.limit ? items[items.length - 1]?.id : null;
  return c.json({ items, cursor: next });
});

const SnoozeInput = z.object({ until: z.string().datetime() });

findingsRoutes.post("/:id/promote", async (c) => {
  // Promote is intentionally NOT a server-side write. The client (web cockpit,
  // CLI, plugin, desktop) calls promoteFindingToNote(finding) locally and
  // writes the file via its own FilesystemAdapter.createNoteFile — per
  // PRD §2.3 the API never mutates user-owned content.
  const id = c.req.param("id");
  return c.json(
    {
      error: "client_side_action",
      message:
        "Promote runs on the client. Fetch the finding via GET /v1/findings, then call promoteFindingToNote(finding) and createNoteFile from your local surface.",
      finding_id: id,
    },
    400,
  );
});

findingsRoutes.post("/:id/snooze", zValidator("json", SnoozeInput), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const { until } = c.req.valid("json");
  const owned = await assertOwned(c.env, id, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare(
    "UPDATE findings SET status = 'snoozed', verdict_at = ?, verdict_reason = 'user-snoozed' WHERE id = ?",
  )
    .bind(until, id)
    .run();
  await audit(c.env, user.id, "finding.snooze", { id, until });
  return c.json({ ok: true, id, until });
});

findingsRoutes.post("/:id/dismiss", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const owned = await assertOwned(c.env, id, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE findings SET status = 'falsified', verdict_at = ?, verdict_reason = 'user-dismissed' WHERE id = ?",
  )
    .bind(now, id)
    .run();
  await audit(c.env, user.id, "finding.dismiss", { id });
  return c.json({ ok: true, id });
});

findingsRoutes.post("/:id/confirm", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const owned = await assertOwned(c.env, id, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE findings SET status = 'confirmed', verdict_at = ?, verdict_reason = 'user-confirmed' WHERE id = ?",
  )
    .bind(now, id)
    .run();
  await audit(c.env, user.id, "finding.confirm", { id });
  return c.json({ ok: true, id });
});

/** Returns true if the finding belongs to the user via brief.user_id. */
async function assertOwned(env: Bindings, findingId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 FROM findings f JOIN briefs b ON b.id = f.brief_id WHERE f.id = ? AND b.user_id = ?",
  )
    .bind(findingId, userId)
    .first();
  return row !== null;
}

async function audit(
  env: Bindings,
  userId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(ulid(), userId, action, JSON.stringify(payload), new Date().toISOString())
    .run();
}
