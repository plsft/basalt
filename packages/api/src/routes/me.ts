// packages/api/src/routes/me.ts

import { Hono } from "hono";
import type { Bindings, Variables } from "../env";
import { requireAuth } from "../middleware/auth";

export const meRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", (c) => c.json(c.get("user")));

meRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  // GDPR soft-delete; 30-day grace period before hard-delete (Workflow).
  await c.env.DB.prepare("UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), user.id)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), user.id, "account.soft_delete", new Date().toISOString())
    .run();
  return c.json({ ok: true, scheduled_hard_delete_at: thirtyDaysFromNow() });
});

function thirtyDaysFromNow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}
