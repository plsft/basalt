// packages/api/src/middleware/rate-limit.ts
// Per-user (or per-IP) rate limit via KV. Window = 60s, default 60 req.

import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "../env";

export interface RateLimitOptions {
  window?: number;
  max?: number;
  scope?: string;
}

export function rateLimit(opts: RateLimitOptions = {}): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  const window = opts.window ?? 60;
  const max = opts.max ?? 60;
  const scope = opts.scope ?? "default";
  return async (c, next) => {
    const user = c.get("user");
    const id = user?.id ?? c.req.header("cf-connecting-ip") ?? "unknown";
    const bucket = `${scope}:${id}:${Math.floor(Date.now() / 1000 / window)}`;
    const current = await c.env.RATE_LIMITS.get(bucket);
    const count = current ? Number.parseInt(current, 10) : 0;
    if (count >= max) {
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: "rate_limited", scope, retry_after: window }, 429);
    }
    await c.env.RATE_LIMITS.put(bucket, String(count + 1), { expirationTtl: window });
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(max - count - 1));
    await next();
    return;
  };
}
