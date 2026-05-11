// packages/api/src/routes/findings.ts

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const findingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

findingsRoutes.use("*", requireAuth);
findingsRoutes.use("*", rateLimit({ scope: "findings" }));

const SnoozeInput = z.object({ until: z.string().datetime() });

findingsRoutes.post("/:id/promote", async (c) => {
  // Promote is intentionally NOT a server-side write — it returns the
  // NoteContent the client (web cockpit / plugin) should write into the
  // user's vault. Per PRD §2.3.
  const id = c.req.param("id");
  return c.json(
    {
      error: "client_side_action",
      message:
        "Promote is a client-side action. Fetch the finding, call promoteFindingToNote(finding) on the client.",
      finding_id: id,
    },
    400,
  );
});

findingsRoutes.post("/:id/snooze", zValidator("json", SnoozeInput), async (c) => {
  const id = c.req.param("id");
  const { until } = c.req.valid("json");
  await c.env.DB.prepare(
    "UPDATE findings SET status = 'snoozed', verdict_at = ?, verdict_reason = ? WHERE id = ?",
  )
    .bind(until, "user-snoozed", id)
    .run();
  return c.json({ ok: true, id, until });
});

findingsRoutes.post("/:id/dismiss", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE findings SET status = 'falsified', verdict_at = ?, verdict_reason = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), "user-dismissed", id)
    .run();
  return c.json({ ok: true, id });
});
