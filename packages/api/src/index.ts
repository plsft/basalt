// packages/api/src/index.ts
// `basalt-api` — Hono on Cloudflare Workers. Pro tier backend.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Bindings, Variables } from "./env";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { briefsRoutes } from "./routes/briefs";
import { byokRoutes } from "./routes/byok";
import { findingsRoutes } from "./routes/findings";
import { meRoutes } from "./routes/me";
import { status } from "./routes/status";
import { vaultsRoutes } from "./routes/vaults";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow our own web cockpit + localhost dev.
      if (!origin) return "*";
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin)) return origin;
      if (/^https:\/\/(basalt|web|cockpit)\.[a-z0-9-]+\.pages\.dev$/.test(origin)) return origin;
      if (/^https:\/\/(basalt|app)\.virtuosoai\.dev$/.test(origin)) return origin;
      return "";
    },
    credentials: true,
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    version: "0.0.0",
    schema: 1,
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  }),
);

app.route("/v1/auth", authRoutes);
app.route("/v1/me", meRoutes);
app.route("/v1/vaults", vaultsRoutes);
app.route("/v1/briefs", briefsRoutes);
app.route("/v1/findings", findingsRoutes);
app.route("/v1/billing", billingRoutes);
app.route("/v1/byok", byokRoutes);
app.route("/", status);

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "internal", message: err.message }, 500);
});

export default app;
