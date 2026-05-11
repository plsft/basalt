// scripts/generate-openapi.ts
//
// Generate an OpenAPI 3.1 document for the @basalt/api Hono application.
// Strategy: introspect the routes by static analysis (regex grep + zod schema
// inspection rather than runtime Hono introspection — Hono doesn't ship a
// public route registry, and the Workers runtime can't be booted from Node
// without a wrangler dev session).
//
// The output is written to:
//   packages/docs/src/content/docs/api/openapi.json   (consumed by Starlight)
//   packages/api/openapi.json                          (published at /openapi.json)
//
// Usage:  bun scripts/generate-openapi.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

interface RouteEntry {
  method: "get" | "post" | "delete" | "put" | "patch";
  path: string;
  summary: string;
  description: string;
  auth: boolean;
  rateLimit?: { scope: string; max: number; window: number };
  body?: string;
  response: { status: number; description: string; schema?: string };
}

// Hand-curated registry mirroring packages/api/src/routes/*.ts. We keep this
// in sync with the route files at PR review time; the OpenAPI doc is the
// public contract.
const ROUTES: RouteEntry[] = [
  {
    method: "get",
    path: "/health",
    summary: "Worker health probe",
    description: "Returns the worker's deployed version, schema, and a UTC timestamp.",
    auth: false,
    response: { status: 200, description: "OK", schema: "Health" },
  },
  {
    method: "get",
    path: "/v1/health",
    summary: "Alias for /health",
    description: "Status-page-friendly path.",
    auth: false,
    response: { status: 200, description: "OK", schema: "Health" },
  },
  {
    method: "get",
    path: "/v1/status",
    summary: "Aggregated dependency status",
    description: "Probes D1 + KV, returns overall ok|degraded plus per-check detail.",
    auth: false,
    response: { status: 200, description: "OK or degraded", schema: "Status" },
  },
  {
    method: "post",
    path: "/v1/auth/oauth/start",
    summary: "Begin OAuth login flow",
    description: "Generates a server-side state token + provider authorize_url.",
    auth: false,
    body: "OAuthStartRequest",
    response: { status: 200, description: "Authorize URL", schema: "OAuthStartResponse" },
  },
  {
    method: "post",
    path: "/v1/auth/oauth/callback",
    summary: "Complete OAuth login",
    description:
      "Exchanges the OAuth code, fetches user info, upserts the user, issues a session cookie.",
    auth: false,
    body: "OAuthCallbackRequest",
    response: { status: 200, description: "Session established", schema: "OAuthCallbackResponse" },
  },
  {
    method: "post",
    path: "/v1/auth/logout",
    summary: "End the current session",
    description: "Deletes the session in KV and clears the basalt_session cookie.",
    auth: false,
    response: { status: 200, description: "Logged out", schema: "Ok" },
  },
  {
    method: "get",
    path: "/v1/me",
    summary: "Current user",
    description: "Returns the authenticated user's id, email, and tier.",
    auth: true,
    response: { status: 200, description: "User", schema: "User" },
  },
  {
    method: "delete",
    path: "/v1/me",
    summary: "Soft-delete the current user",
    description: "Sets deleted_at on the user row; data is purged after a 30-day grace window.",
    auth: true,
    response: { status: 200, description: "Deletion scheduled", schema: "Ok" },
  },
  {
    method: "get",
    path: "/v1/vaults",
    summary: "List the user's vaults",
    description: "Excludes soft-deleted vaults.",
    auth: true,
    response: { status: 200, description: "Vault list", schema: "VaultList" },
  },
  {
    method: "post",
    path: "/v1/vaults",
    summary: "Register a new vault",
    description: "Creates a vault row and enqueues an indexing job.",
    auth: true,
    body: "VaultCreateRequest",
    response: { status: 201, description: "Vault created", schema: "Vault" },
  },
  {
    method: "delete",
    path: "/v1/vaults/:id",
    summary: "Soft-delete a vault",
    description:
      "30-day grace before hard purge. Findings + briefs are retained until the grace window expires.",
    auth: true,
    response: { status: 200, description: "Deleted", schema: "Ok" },
  },
  {
    method: "post",
    path: "/v1/vaults/:id/snapshot",
    summary: "Upload a vault snapshot",
    description:
      "Stores a client-built VaultSnapshot (notes + embeddings + links) in R2 keyed by user_id/vault_id. /v1/briefs/generate uses the latest snapshot.",
    auth: true,
    body: "VaultSnapshot",
    response: { status: 200, description: "Stored", schema: "VaultSnapshotAck" },
  },
  {
    method: "get",
    path: "/v1/vaults/:id/snapshot/meta",
    summary: "Snapshot metadata",
    description: "Returns size, upload time, and custom metadata for the latest snapshot.",
    auth: true,
    response: { status: 200, description: "Snapshot meta", schema: "SnapshotMeta" },
  },
  {
    method: "post",
    path: "/v1/briefs/generate",
    summary: "Generate a brief",
    description:
      "Runs the indexer + verbs against the named vault. Pro-tier only. Rate limit 6/min.",
    auth: true,
    rateLimit: { scope: "briefs", max: 6, window: 60 },
    body: "BriefGenerateRequest",
    response: { status: 200, description: "Brief", schema: "Brief" },
  },
  {
    method: "get",
    path: "/v1/briefs",
    summary: "List briefs for a vault",
    description: "Cursor-paginated.",
    auth: true,
    response: { status: 200, description: "Brief list", schema: "BriefList" },
  },
  {
    method: "get",
    path: "/v1/briefs/:id",
    summary: "Fetch a brief by id",
    description: "Returns the full Brief JSON.",
    auth: true,
    response: { status: 200, description: "Brief", schema: "Brief" },
  },
  {
    method: "get",
    path: "/v1/findings",
    summary: "Cross-brief finding timeline",
    description: "Filterable by verb, vault_id, status. Cursor-paginated by finding id.",
    auth: true,
    response: { status: 200, description: "Findings", schema: "FindingList" },
  },
  {
    method: "post",
    path: "/v1/findings/:id/snooze",
    summary: "Snooze a finding until a date",
    description: "Owner-scoped via JOIN to briefs.user_id.",
    auth: true,
    body: "FindingSnoozeRequest",
    response: { status: 200, description: "Snoozed", schema: "Ok" },
  },
  {
    method: "post",
    path: "/v1/findings/:id/dismiss",
    summary: "Mark a finding as falsified by the user",
    description:
      "Owner-scoped; updates status to 'falsified' with a user-dismissed verdict_reason.",
    auth: true,
    response: { status: 200, description: "Dismissed", schema: "Ok" },
  },
  {
    method: "post",
    path: "/v1/findings/:id/confirm",
    summary: "Mark a finding as confirmed",
    description: "Owner-scoped; updates status to 'confirmed' with verdict timestamp.",
    auth: true,
    response: { status: 200, description: "Confirmed", schema: "Ok" },
  },
  {
    method: "post",
    path: "/v1/findings/:id/promote",
    summary: "Promote a finding to a note (client-side)",
    description:
      "Always returns 400 with guidance — promote-to-note runs on the client. The API never mutates user-owned content.",
    auth: true,
    response: { status: 400, description: "Client-side action required", schema: "Error" },
  },
  {
    method: "delete",
    path: "/v1/briefs/:id",
    summary: "Delete a brief and its findings",
    description: "Hard delete (no soft-delete column on briefs).",
    auth: true,
    response: { status: 200, description: "Deleted", schema: "Ok" },
  },
  {
    method: "post",
    path: "/v1/billing/checkout",
    summary: "Create a Stripe Checkout session",
    description: "Plan = pro | founder. Founder is capped at 200 lifetime seats.",
    auth: true,
    body: "BillingCheckoutRequest",
    response: { status: 200, description: "Checkout URL", schema: "BillingCheckoutResponse" },
  },
  {
    method: "post",
    path: "/v1/billing/webhook",
    summary: "Stripe webhook receiver",
    description:
      "HMAC-SHA256 verified. Handles checkout.session.completed and subscription events.",
    auth: false,
    response: { status: 200, description: "Acknowledged", schema: "Ok" },
  },
];

const SCHEMAS: Record<string, unknown> = {
  Health: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      version: { type: "string" },
      schema: { type: "integer" },
      environment: { type: "string", enum: ["staging", "production"] },
      timestamp: { type: "string", format: "date-time" },
    },
    required: ["ok", "version", "schema", "timestamp"],
  },
  Status: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["ok", "degraded"] },
      time: { type: "string", format: "date-time" },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            ok: { type: "boolean" },
            detail: { type: "string" },
          },
          required: ["name", "ok"],
        },
      },
    },
    required: ["status", "time", "checks"],
  },
  Ok: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  User: {
    type: "object",
    properties: {
      id: { type: "string" },
      email: { type: "string", format: "email" },
      tier: { type: "string", enum: ["free", "pro", "founder"] },
    },
    required: ["id", "email", "tier"],
  },
  OAuthStartRequest: {
    type: "object",
    properties: {
      provider: { type: "string", enum: ["google", "github"] },
      redirect_uri: { type: "string", format: "uri" },
    },
    required: ["provider", "redirect_uri"],
  },
  OAuthStartResponse: {
    type: "object",
    properties: {
      state: { type: "string" },
      authorize_url: { type: "string", format: "uri" },
    },
    required: ["state", "authorize_url"],
  },
  OAuthCallbackRequest: {
    type: "object",
    properties: {
      provider: { type: "string", enum: ["google", "github"] },
      code: { type: "string" },
      state: { type: "string" },
    },
    required: ["provider", "code", "state"],
  },
  OAuthCallbackResponse: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      tier: { type: "string", enum: ["free", "pro", "founder"] },
    },
    required: ["user_id", "tier"],
  },
  Vault: {
    type: "object",
    properties: {
      id: { type: "string" },
      user_id: { type: "string" },
      name: { type: "string" },
      sync_enabled: { type: "boolean" },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
    required: ["id", "user_id", "name", "created_at", "updated_at"],
  },
  VaultList: { type: "array", items: { $ref: "#/components/schemas/Vault" } },
  VaultCreateRequest: {
    type: "object",
    properties: {
      name: { type: "string" },
      source: { type: "string", enum: ["upload", "sync"] },
    },
    required: ["name"],
  },
  BriefGenerateRequest: {
    type: "object",
    properties: {
      vault_id: { type: "string" },
      window_days: { type: "integer", default: 30, minimum: 1, maximum: 365 },
      verbs: {
        type: "array",
        items: {
          type: "string",
          enum: ["buried-insight", "connection", "contradiction", "drift", "implicit-thesis"],
        },
      },
    },
    required: ["vault_id"],
  },
  Brief: {
    type: "object",
    properties: {
      schema: { type: "integer", const: 1 },
      section: { type: "string" },
      track_record: { type: "object" },
      findings: { type: "object" },
    },
    required: ["schema", "section", "findings"],
  },
  BriefList: {
    type: "object",
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/Brief" } },
      cursor: { type: "string", nullable: true },
    },
    required: ["items"],
  },
  FindingList: {
    type: "object",
    properties: {
      items: { type: "array", items: { type: "object" } },
      cursor: { type: "string", nullable: true },
    },
    required: ["items"],
  },
  FindingSnoozeRequest: {
    type: "object",
    properties: { until: { type: "string", format: "date-time" } },
    required: ["until"],
  },
  VaultSnapshot: {
    type: "object",
    description:
      "Client-built snapshot of the user's local index — notes, embeddings (base64-float32), and wikilinks.",
    properties: {
      schema: { type: "integer", const: 1 },
      vault_id: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      today: { type: "string", description: "ISO date the engine should treat as today." },
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rel_path: { type: "string" },
            stem: { type: "string" },
            title: { type: "string" },
            created: { type: "string", nullable: true },
            updated: { type: "string", nullable: true },
            word_count: { type: "integer", minimum: 0 },
            content: { type: "string" },
            content_hash: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["rel_path", "stem", "title", "word_count", "content", "content_hash", "tags"],
        },
      },
      embeddings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rel_path: { type: "string" },
            model: { type: "string" },
            dim: { type: "integer", minimum: 1 },
            vec_b64: { type: "string", description: "Base64-encoded little-endian float32." },
          },
          required: ["rel_path", "model", "dim", "vec_b64"],
        },
      },
      links: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from_rel_path: { type: "string" },
            target: { type: "string" },
          },
          required: ["from_rel_path", "target"],
        },
      },
    },
    required: ["schema", "vault_id", "created_at", "notes", "embeddings", "links"],
  },
  VaultSnapshotAck: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      vault_id: { type: "string" },
      note_count: { type: "integer" },
      embedding_count: { type: "integer" },
      link_count: { type: "integer" },
      bytes: { type: "integer" },
    },
    required: ["ok", "vault_id", "note_count", "embedding_count", "link_count", "bytes"],
  },
  SnapshotMeta: {
    type: "object",
    properties: {
      key: { type: "string" },
      uploaded_at: { type: "string", format: "date-time" },
      size: { type: "integer" },
      metadata: { type: "object", additionalProperties: { type: "string" } },
    },
    required: ["key", "size"],
  },
  BillingCheckoutRequest: {
    type: "object",
    properties: {
      plan: { type: "string", enum: ["pro", "founder"] },
      success_url: { type: "string", format: "uri" },
      cancel_url: { type: "string", format: "uri" },
    },
    required: ["plan", "success_url", "cancel_url"],
  },
  BillingCheckoutResponse: {
    type: "object",
    properties: {
      id: { type: "string" },
      url: { type: "string", format: "uri" },
    },
    required: ["id", "url"],
  },
  Error: {
    type: "object",
    properties: {
      error: { type: "string" },
      message: { type: "string" },
    },
    required: ["error"],
  },
};

function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
}

function buildPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const operation: Record<string, unknown> = {
      summary: r.summary,
      description: r.description,
      tags: tagOf(r.path),
      responses: {
        [String(r.response.status)]: {
          description: r.response.description,
          content: r.response.schema
            ? {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${r.response.schema}` },
                },
              }
            : undefined,
        },
        "4XX": {
          description: "Client error",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Error" } },
          },
        },
        "5XX": {
          description: "Server error",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Error" } },
          },
        },
      },
    };
    if (r.auth) operation.security = [{ session: [] }];
    if (r.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${r.body}` },
          },
        },
      };
    }
    if (r.rateLimit) {
      operation["x-rate-limit"] = r.rateLimit;
    }
    paths[r.path] ??= {};
    paths[r.path]![r.method] = operation;
  }
  return paths;
}

function tagOf(path: string): string[] {
  if (path.startsWith("/v1/auth")) return ["Auth"];
  if (path.startsWith("/v1/me")) return ["Identity"];
  if (path.startsWith("/v1/vaults")) return ["Vaults"];
  if (path.startsWith("/v1/briefs")) return ["Briefs"];
  if (path.startsWith("/v1/findings")) return ["Findings"];
  if (path.startsWith("/v1/billing")) return ["Billing"];
  if (path.startsWith("/v1/status") || path === "/health" || path === "/v1/health")
    return ["System"];
  return ["Default"];
}

function buildDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Basalt API",
      version: readPackageVersion(),
      description:
        "Pro-tier hosted backend for Basalt. Runs on Cloudflare Workers; Open-tier surfaces (CLI, plugin, MCP, desktop) do not call this API.",
      license: { name: "MIT", url: "https://github.com/plsft/basalt/blob/main/LICENSE" },
      contact: { name: "Basalt", url: "https://basalt.dev" },
    },
    servers: [
      { url: "https://api.basalt.dev", description: "Production" },
      { url: "https://api-staging.basalt.dev", description: "Staging" },
    ],
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "basalt_session",
          description: "HttpOnly session cookie set by /v1/auth/oauth/callback.",
        },
      },
    },
    paths: buildPaths(),
  };
}

function main(): void {
  const doc = buildDocument();
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  const outputs = [
    join(REPO_ROOT, "packages", "api", "openapi.json"),
    join(REPO_ROOT, "packages", "docs", "src", "content", "docs", "api", "openapi.json"),
  ];
  for (const out of outputs) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
    console.log(`wrote ${out} (${json.length} bytes)`);
  }
}

main();
