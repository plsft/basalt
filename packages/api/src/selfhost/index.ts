// Self-host entry point. Boots the same Hono app the Workers deploy uses,
// but with the SelfhostD1/KV/R2/Vectorize/AI adapters wired in via env
// configuration. Run via:
//
//   node packages/api/dist/selfhost/server.js
//
// or in dev:
//
//   bun packages/api/src/selfhost/server.ts
//
// Env:
//   BASALT_SELFHOST_DATA_DIR    Default ~/.basalt-selfhost
//   BASALT_SELFHOST_PORT        Default 8787
//   BASALT_SELFHOST_OLLAMA_URL  Default http://localhost:11434
//   BASALT_SELFHOST_ENV         "development" | "production". Default "production".

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Bindings } from "../env";
import { SelfhostAI, SelfhostD1, SelfhostKV, SelfhostR2, SelfhostVectorize } from "./adapters";

export interface SelfhostConfig {
  dataDir: string;
  port: number;
  ollamaUrl: string;
  environment: "development" | "production";
  /** Optional override secrets — these populate the Bindings interface. */
  secrets: Partial<{
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_PRICE_PRO: string;
    STRIPE_PRICE_FOUNDER: string;
    BYOK_ENCRYPTION_KEY: string;
    OAUTH_GOOGLE_CLIENT_ID: string;
    OAUTH_GOOGLE_CLIENT_SECRET: string;
    OAUTH_GITHUB_CLIENT_ID: string;
    OAUTH_GITHUB_CLIENT_SECRET: string;
  }>;
}

export function loadSelfhostConfig(): SelfhostConfig {
  const dataDir = process.env.BASALT_SELFHOST_DATA_DIR ?? join(homedir(), ".basalt-selfhost");
  const port = Number.parseInt(process.env.BASALT_SELFHOST_PORT ?? "8787", 10);
  const ollamaUrl = process.env.BASALT_SELFHOST_OLLAMA_URL ?? "http://localhost:11434";
  const environment =
    (process.env.BASALT_SELFHOST_ENV as "development" | "production") ?? "production";

  // Optionally also read secrets from a .env-style file in the data dir.
  const secrets: SelfhostConfig["secrets"] = {};
  for (const k of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_FOUNDER",
    "BYOK_ENCRYPTION_KEY",
    "OAUTH_GOOGLE_CLIENT_ID",
    "OAUTH_GOOGLE_CLIENT_SECRET",
    "OAUTH_GITHUB_CLIENT_ID",
    "OAUTH_GITHUB_CLIENT_SECRET",
  ] as const) {
    const v = process.env[k];
    if (v) secrets[k] = v;
  }
  const envPath = join(dataDir, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m?.[1] && m[2] && m[1] in secrets) {
        const key = m[1] as keyof SelfhostConfig["secrets"];
        if (!secrets[key]) secrets[key] = m[2].replace(/^"|"$/g, "");
      }
    }
  }

  return { dataDir, port, ollamaUrl, environment, secrets };
}

export async function buildSelfhostBindings(cfg: SelfhostConfig): Promise<Bindings> {
  const dataDir = cfg.dataDir;
  const db = new SelfhostD1(join(dataDir, "db.sqlite"));
  await db.init();
  const vectorize = new SelfhostVectorize(join(dataDir, "vectors.sqlite"));
  await vectorize.init();
  const ai = new SelfhostAI({ ollamaUrl: cfg.ollamaUrl });

  const bindings = {
    ENVIRONMENT: cfg.environment === "development" ? "staging" : "production",
    DB: db as unknown as Bindings["DB"],
    SESSIONS: new SelfhostKV(join(dataDir, "kv", "sessions")) as unknown as Bindings["SESSIONS"],
    RATE_LIMITS: new SelfhostKV(
      join(dataDir, "kv", "rate-limits"),
    ) as unknown as Bindings["RATE_LIMITS"],
    BYOK_KEYS: new SelfhostKV(join(dataDir, "kv", "byok")) as unknown as Bindings["BYOK_KEYS"],
    BRIEFS_BUCKET: new SelfhostR2(
      join(dataDir, "r2", "briefs"),
    ) as unknown as Bindings["BRIEFS_BUCKET"],
    VAULT_SYNC_BUCKET: new SelfhostR2(
      join(dataDir, "r2", "vault-sync"),
    ) as unknown as Bindings["VAULT_SYNC_BUCKET"],
    VECTORIZE: vectorize as unknown as Bindings["VECTORIZE"],
    INDEX_QUEUE: {
      send: async () => {
        /* no-op in self-host — queue work runs inline or via cron */
      },
    } as unknown as Bindings["INDEX_QUEUE"],
    AI: ai as unknown as Bindings["AI"],
    ...cfg.secrets,
  } satisfies Partial<Bindings>;
  return bindings as Bindings;
}

export async function applyMigrationsIfNeeded(cfg: SelfhostConfig): Promise<void> {
  const sqlPath = join(join(import.meta.dirname, "..", "..", "migrations"), "0001_initial.sql");
  if (!existsSync(sqlPath)) {
    console.warn(`[selfhost] migrations file not found at ${sqlPath}; skipping`);
    return;
  }
  const sql = readFileSync(sqlPath, "utf-8");
  const db = new SelfhostD1(join(cfg.dataDir, "db.sqlite"));
  await db.init();
  db.exec(sql);
  db.close();
}
