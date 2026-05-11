// packages/api/src/middleware/auth.ts
// Bearer-token / session-cookie auth. Sessions live in KV (basalt-sessions).
// Full OAuth wiring lands when the Google/GitHub OAuth apps are registered
// at console.cloud.google.com + github.com/settings/developers.

import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "../env";

export const requireAuth: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  const auth = c.req.header("authorization");
  const cookie = c.req.header("cookie");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  else if (cookie) {
    const m = cookie.match(/basalt_session=([^;]+)/);
    if (m) token = m[1] ?? null;
  }
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const sessionRaw = await c.env.SESSIONS.get(`session:${token}`);
  if (!sessionRaw) return c.json({ error: "session_expired" }, 401);

  const session = JSON.parse(sessionRaw) as { userId: string };
  const userRow = await c.env.DB.prepare(
    "SELECT id, email, tier FROM users WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(session.userId)
    .first<{ id: string; email: string; tier: string }>();
  if (!userRow) return c.json({ error: "user_not_found" }, 401);

  c.set("user", {
    id: userRow.id,
    email: userRow.email,
    tier: userRow.tier as "free" | "pro" | "founder",
  });
  await next();
  return;
};
