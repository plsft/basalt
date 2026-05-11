// packages/api/src/routes/auth.ts
// OAuth handshake — real code exchange + userinfo + user upsert + session.
// Needs the following wrangler secrets set:
//   OAUTH_GOOGLE_CLIENT_ID / OAUTH_GOOGLE_CLIENT_SECRET
//   OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET
// State is double-stored: server-side in KV (one-time, 10min TTL) and the
// client returns it as a parameter; mismatch → 400 invalid_state.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { authorizeUrl, exchangeCode, fetchUserInfo, type Provider } from "../lib/oauth";
import {
  buildSessionCookie,
  clearSessionCookie,
  newSessionToken,
  SESSION_TTL_SECONDS,
} from "../lib/session";
import { ulid } from "../lib/ulid";

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const StartInput = z.object({
  provider: z.enum(["google", "github"]),
  redirect_uri: z.string().url(),
});

authRoutes.post("/oauth/start", zValidator("json", StartInput), async (c) => {
  const { provider, redirect_uri } = c.req.valid("json");
  const clientId = providerClientId(c.env, provider);
  if (!clientId) {
    return c.json(
      {
        error: "oauth_not_configured",
        message: `Set OAUTH_${provider.toUpperCase()}_CLIENT_ID via 'wrangler secret put'.`,
      },
      501,
    );
  }
  const state = ulid();
  await c.env.SESSIONS.put(`oauth_state:${state}`, JSON.stringify({ provider, redirect_uri }), {
    expirationTtl: 600,
  });
  return c.json({
    state,
    authorize_url: authorizeUrl(provider, clientId, state, redirect_uri),
  });
});

const CallbackInput = z.object({
  provider: z.enum(["google", "github"]),
  code: z.string().min(1),
  state: z.string().min(1),
});

authRoutes.post("/oauth/callback", zValidator("json", CallbackInput), async (c) => {
  const { provider, state, code } = c.req.valid("json");

  const stateRaw = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!stateRaw) return c.json({ error: "invalid_state" }, 400);
  await c.env.SESSIONS.delete(`oauth_state:${state}`);
  const stateData = JSON.parse(stateRaw) as { provider: Provider; redirect_uri: string };
  if (stateData.provider !== provider) return c.json({ error: "state_provider_mismatch" }, 400);

  const clientId = providerClientId(c.env, provider);
  const clientSecret = providerClientSecret(c.env, provider);
  if (!clientId || !clientSecret) {
    return c.json(
      { error: "oauth_not_configured", message: `Missing OAuth secrets for ${provider}.` },
      501,
    );
  }

  let accessToken: string;
  try {
    accessToken = await exchangeCode(
      provider,
      clientId,
      clientSecret,
      code,
      stateData.redirect_uri,
    );
  } catch (e) {
    return c.json({ error: "oauth_exchange_failed", detail: errMsg(e) }, 502);
  }

  let info: Awaited<ReturnType<typeof fetchUserInfo>>;
  try {
    info = await fetchUserInfo(provider, accessToken);
  } catch (e) {
    return c.json({ error: "oauth_userinfo_failed", detail: errMsg(e) }, 502);
  }

  // Upsert user. (provider, provider_sub) UNIQUE wins on re-login; email is
  // refreshed on every login to track upstream changes.
  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE provider = ? AND provider_sub = ? AND deleted_at IS NULL",
  )
    .bind(provider, info.providerSub)
    .first<{ id: string }>();
  let userId: string;
  if (existing) {
    userId = existing.id;
    await c.env.DB.prepare("UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?")
      .bind(info.email, info.name, now, userId)
      .run();
  } else {
    userId = ulid();
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, name, provider, provider_sub, tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(userId, info.email, info.name, provider, info.providerSub, "free", now, now)
      .run();
    await c.env.DB.prepare(
      "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(ulid(), userId, "user.created", JSON.stringify({ provider }), now)
      .run();
  }

  const token = newSessionToken();
  await c.env.SESSIONS.put(`session:${token}`, JSON.stringify({ userId, createdAt: Date.now() }), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  c.header("Set-Cookie", buildSessionCookie(token, { secure: c.env.ENVIRONMENT === "production" }));
  return c.json({ user_id: userId, tier: "free" });
});

authRoutes.post("/logout", async (c) => {
  const cookie = c.req.header("cookie");
  const token = cookie?.match(/basalt_session=([^;]+)/)?.[1];
  if (token) await c.env.SESSIONS.delete(`session:${token}`);
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

function providerClientId(env: Bindings, provider: Provider): string | undefined {
  return provider === "github" ? env.OAUTH_GITHUB_CLIENT_ID : env.OAUTH_GOOGLE_CLIENT_ID;
}

function providerClientSecret(env: Bindings, provider: Provider): string | undefined {
  return provider === "github" ? env.OAUTH_GITHUB_CLIENT_SECRET : env.OAUTH_GOOGLE_CLIENT_SECRET;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
