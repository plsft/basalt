// packages/api/src/routes/auth.ts
// OAuth handshake skeleton. Full implementation requires Google + GitHub
// OAuth app registrations and the corresponding client IDs/secrets stored
// via `wrangler secret put`. The shape here is what the web cockpit calls.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const StartInput = z.object({
  provider: z.enum(["google", "github"]),
  redirect_uri: z.string().url(),
});

authRoutes.post("/oauth/start", zValidator("json", StartInput), async (c) => {
  const { provider, redirect_uri } = c.req.valid("json");
  const state = crypto.randomUUID();
  await c.env.SESSIONS.put(`oauth_state:${state}`, JSON.stringify({ provider, redirect_uri }), {
    expirationTtl: 600,
  });
  const authorizeUrl = providerAuthorizeUrl(provider, state, redirect_uri);
  return c.json({ state, authorize_url: authorizeUrl });
});

const CallbackInput = z.object({
  provider: z.enum(["google", "github"]),
  code: z.string(),
  state: z.string(),
});

authRoutes.post("/oauth/callback", zValidator("json", CallbackInput), async (c) => {
  const { provider, state, code } = c.req.valid("json");
  const stateRaw = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!stateRaw) return c.json({ error: "invalid_state" }, 400);
  await c.env.SESSIONS.delete(`oauth_state:${state}`);

  // TODO(TASK-3.4): exchange `code` for an access token with the provider's
  // token endpoint, then fetch the user info, then upsert in `users`.
  // Requires OAUTH_GOOGLE_CLIENT_SECRET / OAUTH_GITHUB_CLIENT_SECRET to be
  // set via `wrangler secret put`. For now: structured error with guidance.
  return c.json(
    {
      error: "oauth_not_configured",
      message: `Set ${
        provider === "google" ? "OAUTH_GOOGLE_CLIENT_SECRET" : "OAUTH_GITHUB_CLIENT_SECRET"
      } via 'wrangler secret put' to enable login.`,
      code_received: code.slice(0, 8) + "…",
    },
    501,
  );
});

function providerAuthorizeUrl(
  provider: "google" | "github",
  state: string,
  redirectUri: string,
): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: "PLACEHOLDER_GOOGLE_CLIENT_ID",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: "PLACEHOLDER_GITHUB_CLIENT_ID",
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}
