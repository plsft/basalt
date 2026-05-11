// packages/api/src/routes/byok.ts
//
// BYOK key storage for hosted users who want to override the default
// Workers AI inference with their own provider API key. Keys are AES-GCM
// encrypted at rest in BYOK_KEYS KV.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import {
  ALL_PROVIDERS,
  type ByokProvider,
  decryptKey,
  encryptKey,
  isByokProvider,
  kvKey,
} from "../lib/byok";
import { ulid } from "../lib/ulid";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const byokRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

byokRoutes.use("*", requireAuth);
byokRoutes.use("*", rateLimit({ scope: "byok", max: 30 }));

const PutInput = z.object({
  provider: z.enum(ALL_PROVIDERS as unknown as [string, ...string[]]),
  api_key: z.string().min(8).max(4096),
});

byokRoutes.put("/", zValidator("json", PutInput), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.BYOK_ENCRYPTION_KEY) {
    return c.json(
      {
        error: "byok_not_configured",
        message: "Server missing BYOK_ENCRYPTION_KEY secret.",
      },
      501,
    );
  }
  const { provider, api_key } = c.req.valid("json");
  if (!isByokProvider(provider)) return c.json({ error: "invalid_provider" }, 400);

  const envelope = await encryptKey(api_key, c.env.BYOK_ENCRYPTION_KEY);
  await c.env.BYOK_KEYS.put(kvKey(user.id, provider), envelope);
  await c.env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(ulid(), user.id, "byok.put", JSON.stringify({ provider }), new Date().toISOString())
    .run();
  return c.json({ ok: true, provider });
});

byokRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const out: Array<{ provider: ByokProvider; has_key: boolean }> = [];
  for (const provider of ALL_PROVIDERS) {
    const v = await c.env.BYOK_KEYS.get(kvKey(user.id, provider));
    out.push({ provider, has_key: v !== null });
  }
  return c.json({ providers: out });
});

byokRoutes.delete("/:provider", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const provider = c.req.param("provider");
  if (!isByokProvider(provider)) return c.json({ error: "invalid_provider" }, 400);
  await c.env.BYOK_KEYS.delete(kvKey(user.id, provider));
  await c.env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(ulid(), user.id, "byok.delete", JSON.stringify({ provider }), new Date().toISOString())
    .run();
  return c.json({ ok: true, provider });
});

/** Internal helper for verb-augmentation paths to look up a user's
 *  decrypted key. Returns null if unset or BYOK_ENCRYPTION_KEY missing. */
export async function getDecryptedByokKey(
  env: Bindings,
  userId: string,
  provider: ByokProvider,
): Promise<string | null> {
  if (!env.BYOK_ENCRYPTION_KEY) return null;
  const envelope = await env.BYOK_KEYS.get(kvKey(userId, provider));
  if (!envelope) return null;
  try {
    return await decryptKey(envelope, env.BYOK_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}
