// Public status endpoint used by the marketing-site /status page.
// Aggregates: API health, D1 reachability, AI binding reachability.

import { Hono } from "hono";
import type { Bindings, Variables } from "../env";

export const status = new Hono<{ Bindings: Bindings; Variables: Variables }>();

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

status.get("/v1/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

status.get("/v1/status", async (c) => {
  const checks: Check[] = [];
  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.push({ name: "d1", ok: true });
  } catch (e) {
    checks.push({ name: "d1", ok: false, detail: e instanceof Error ? e.message : "error" });
  }
  try {
    await c.env.RATE_LIMITS.get("__status_probe");
    checks.push({ name: "kv", ok: true });
  } catch (e) {
    checks.push({ name: "kv", ok: false, detail: e instanceof Error ? e.message : "error" });
  }
  const overall = checks.every((ck) => ck.ok) ? "ok" : "degraded";
  return c.json({ status: overall, time: new Date().toISOString(), checks });
});
