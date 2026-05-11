// packages/api/src/env.ts
// Cloudflare bindings shape — references wrangler.jsonc.

import type {
  Ai,
  D1Database,
  KVNamespace,
  Queue,
  R2Bucket,
  Vectorize,
} from "@cloudflare/workers-types";

export interface Bindings {
  ENVIRONMENT: "staging" | "production";
  DB: D1Database;
  SESSIONS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  BYOK_KEYS: KVNamespace;
  BRIEFS_BUCKET: R2Bucket;
  VAULT_SYNC_BUCKET: R2Bucket;
  VECTORIZE: Vectorize;
  INDEX_QUEUE: Queue<unknown>;
  AI: Ai;
  // Secrets (set via `wrangler secret put`).
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  BYOK_ENCRYPTION_KEY?: string;
  OAUTH_GOOGLE_CLIENT_SECRET?: string;
  OAUTH_GITHUB_CLIENT_SECRET?: string;
  JWT_SIGNING_KEY?: string;
}

export interface Variables {
  user?: {
    id: string;
    email: string;
    tier: "free" | "pro" | "founder";
  };
}
