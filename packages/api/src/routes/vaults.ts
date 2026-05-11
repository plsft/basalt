// packages/api/src/routes/vaults.ts
//
// Vault CRUD + snapshot upload. The snapshot is the client-side index dump
// that lets /v1/briefs/generate run the engine without ever touching raw
// vault files.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { VaultSnapshot } from "../lib/snapshot";
import { ulid } from "../lib/ulid";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const vaultsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

vaultsRoutes.use("*", requireAuth);
vaultsRoutes.use("*", rateLimit({ scope: "vaults" }));

const CreateVault = z.object({ name: z.string().min(1).max(120) });

vaultsRoutes.post("/", zValidator("json", CreateVault), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { name } = c.req.valid("json");
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO vaults (id, user_id, name, sync_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  )
    .bind(id, user.id, name, now, now)
    .run();
  return c.json({ id, name, created_at: now }, 201);
});

vaultsRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const result = await c.env.DB.prepare(
    "SELECT id, name, sync_enabled, created_at, updated_at FROM vaults WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();
  return c.json({ vaults: result.results });
});

vaultsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const vaultId = c.req.param("id");
  const owned = await assertVaultOwned(c.env, vaultId, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE vaults SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, vaultId)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(ulid(), user.id, "vault.soft_delete", JSON.stringify({ vault_id: vaultId }), now)
    .run();
  return c.json({ ok: true, scheduled_hard_delete_at: thirtyDaysFromNow() });
});

vaultsRoutes.post("/:id/snapshot", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const vaultId = c.req.param("id");
  const owned = await assertVaultOwned(c.env, vaultId, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = VaultSnapshot.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: "invalid_snapshot", details: parsed.error.flatten() }, 400);
  }
  if (parsed.data.vault_id !== vaultId) {
    return c.json({ error: "vault_id_mismatch" }, 400);
  }
  const key = `snapshots/${user.id}/${vaultId}.json`;
  const body = JSON.stringify(parsed.data);
  await c.env.BRIEFS_BUCKET.put(key, body, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      user_id: user.id,
      vault_id: vaultId,
      schema: "1",
      note_count: String(parsed.data.notes.length),
    },
  });
  await c.env.DB.prepare("UPDATE vaults SET updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), vaultId)
    .run();
  return c.json({
    ok: true,
    vault_id: vaultId,
    note_count: parsed.data.notes.length,
    embedding_count: parsed.data.embeddings.length,
    link_count: parsed.data.links.length,
    bytes: body.length,
  });
});

vaultsRoutes.get("/:id/snapshot/meta", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const vaultId = c.req.param("id");
  const owned = await assertVaultOwned(c.env, vaultId, user.id);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const key = `snapshots/${user.id}/${vaultId}.json`;
  const obj = await c.env.BRIEFS_BUCKET.head(key);
  if (!obj) return c.json({ error: "no_snapshot" }, 404);
  return c.json({
    key,
    uploaded_at: obj.uploaded?.toISOString(),
    size: obj.size,
    metadata: obj.customMetadata ?? {},
  });
});

export async function assertVaultOwned(
  env: Bindings,
  vaultId: string,
  userId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 FROM vaults WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  )
    .bind(vaultId, userId)
    .first();
  return row !== null;
}

function thirtyDaysFromNow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}
