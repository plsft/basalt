// packages/api/src/routes/briefs.ts
//
// Synchronous brief generation against the latest vault snapshot. The
// snapshot lives in R2 (uploaded via POST /v1/vaults/:id/snapshot); we
// hydrate the engine's in-memory adapters from it, run Engine.brief, and
// persist the result + findings to D1.
//
// Latency budget: PRD §6.4 says p95 < 8 s on a 1k-note vault. The engine
// itself indexes 1k notes in ~250 ms (bench/index-throughput); verb passes
// add ~500-1500 ms. R2 fetch + D1 writes round out the budget.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { buildEngineFromSnapshot } from "../lib/engine-adapters";
import { type VaultSnapshot, VaultSnapshot as VaultSnapshotSchema } from "../lib/snapshot";
import { ulid } from "../lib/ulid";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { assertVaultOwned } from "./vaults";

export const briefsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

briefsRoutes.use("*", requireAuth);
briefsRoutes.use("*", rateLimit({ scope: "briefs", max: 30 }));

const GenerateInput = z.object({
  vault_id: z.string(),
  section: z
    .enum(["all", "buried-insight", "connection", "contradiction", "implicit-thesis", "drift"])
    .default("all"),
  top: z.number().int().min(1).max(10).default(3),
});

briefsRoutes.post(
  "/generate",
  rateLimit({ scope: "briefs:generate", max: 6 }),
  zValidator("json", GenerateInput),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const { vault_id, section, top } = c.req.valid("json");

    if (user.tier === "free") {
      return c.json({ error: "upgrade_required", required_tier: "pro" }, 402);
    }
    const owned = await assertVaultOwned(c.env, vault_id, user.id);
    if (!owned) return c.json({ error: "vault_not_found" }, 404);

    const snapshotKey = `snapshots/${user.id}/${vault_id}.json`;
    const snapshotObj = await c.env.BRIEFS_BUCKET.get(snapshotKey);
    if (!snapshotObj) {
      return c.json(
        {
          error: "no_snapshot",
          message:
            "Upload a vault snapshot via POST /v1/vaults/:id/snapshot before generating a brief.",
        },
        409,
      );
    }
    const snapshotRaw = await snapshotObj.text();
    let snapshot: VaultSnapshot;
    try {
      snapshot = VaultSnapshotSchema.parse(JSON.parse(snapshotRaw));
    } catch (e) {
      return c.json(
        { error: "snapshot_corrupt", detail: e instanceof Error ? e.message : String(e) },
        500,
      );
    }

    const t0 = Date.now();
    const { engine } = await buildEngineFromSnapshot(snapshot);
    const brief = await engine.brief({ section, top });
    const elapsedMs = Date.now() - t0;

    const briefId = ulid();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO briefs (id, vault_id, user_id, schema_version, section, brief_json, created_at) VALUES (?, ?, ?, 1, ?, ?, ?)",
    )
      .bind(briefId, vault_id, user.id, section, JSON.stringify(brief), now)
      .run();

    // Persist findings — one row per finding so /v1/findings can list +
    // filter. The finding_key matches @basalt/core's calibration key.
    const findingInserts: Array<Promise<unknown>> = [];
    for (const [bucket, arr] of Object.entries(brief.findings)) {
      if (!arr) continue;
      for (const f of arr) {
        findingInserts.push(
          c.env.DB.prepare(
            "INSERT INTO findings (id, brief_id, vault_id, verb, finding_key, finding_json, falsification, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
          )
            .bind(
              ulid(),
              briefId,
              vault_id,
              f.verb,
              findingKey(f),
              JSON.stringify(f),
              JSON.stringify(("falsification" in f ? f.falsification : []) ?? []),
              now,
            )
            .run(),
        );
        // Bucket prefix is unused but useful for log debugging.
        void bucket;
      }
    }
    await Promise.all(findingInserts);

    await c.env.DB.prepare(
      "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        ulid(),
        user.id,
        "brief.generated",
        JSON.stringify({ brief_id: briefId, vault_id, section, elapsed_ms: elapsedMs }),
        now,
      )
      .run();

    return c.json({
      id: briefId,
      vault_id,
      section,
      created_at: now,
      elapsed_ms: elapsedMs,
      brief,
    });
  },
);

briefsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM briefs WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first<{
      id: string;
      vault_id: string;
      section: string;
      brief_json: string;
      created_at: string;
    }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: row.id,
    vault_id: row.vault_id,
    section: row.section,
    created_at: row.created_at,
    brief: JSON.parse(row.brief_json),
  });
});

briefsRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const vault = c.req.query("vault");
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "20", 10), 100);
  const params: unknown[] = [user.id];
  let where = "WHERE user_id = ?";
  if (vault) {
    where += " AND vault_id = ?";
    params.push(vault);
  }
  const result = await c.env.DB.prepare(
    `SELECT id, vault_id, section, created_at FROM briefs ${where} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...params, limit)
    .all();
  return c.json({ briefs: result.results });
});

briefsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const res = await c.env.DB.prepare("DELETE FROM briefs WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .run();
  if (!res.success || (res.meta.changes ?? 0) === 0) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("DELETE FROM findings WHERE brief_id = ?").bind(id).run();
  return c.json({ ok: true, id });
});

/** Stable per-finding key for idempotency + status tracking. Mirrors
 *  @basalt/core's `findingKey` in audit/calibration.ts. */
function findingKey(f: import("@basalt/core").Finding): string {
  const parts: string[] = [f.verb];
  if ("note_a" in f && f.note_a) parts.push(f.note_a.rel_path);
  if ("note_b" in f && f.note_b) parts.push(f.note_b.rel_path);
  if ("rel_path" in f && typeof f.rel_path === "string") parts.push(f.rel_path);
  if ("centroid" in f && f.centroid) parts.push(f.centroid.rel_path);
  if (f.verb === "drift") {
    if (f.headline_overworked) parts.push(`over:${f.headline_overworked.name}`);
    if (f.headline_underworked) parts.push(`under:${f.headline_underworked.name}`);
  }
  return parts.join("|");
}
