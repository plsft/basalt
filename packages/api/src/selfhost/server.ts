// Node-runtime entrypoint for self-hosted Basalt API. Uses Hono's
// `@hono/node-server` adapter — no Workers runtime needed.
//
// Single-process; suitable for personal / small-team self-hosting on a
// VPS. For larger deployments swap to Workers via wrangler deploy.

import type { ExecutionContext } from "@cloudflare/workers-types";
import { serve } from "@hono/node-server";
import app from "../index";
import { applyMigrationsIfNeeded, buildSelfhostBindings, loadSelfhostConfig } from "./index";

async function main(): Promise<void> {
  const cfg = loadSelfhostConfig();
  console.log(`[basalt-selfhost] data dir: ${cfg.dataDir}`);
  console.log(`[basalt-selfhost] ollama:   ${cfg.ollamaUrl}`);
  console.log(`[basalt-selfhost] env:      ${cfg.environment}`);

  await applyMigrationsIfNeeded(cfg);

  const bindings = await buildSelfhostBindings(cfg);

  // Hono's node-server adapter only passes (req) — we hand-thread the
  // env + a no-op ExecutionContext into app.fetch.
  const noopCtx = {
    waitUntil: (_p: Promise<unknown>) => {
      /* no-op in self-host */
    },
    passThroughOnException: () => {
      /* no-op */
    },
  } as unknown as ExecutionContext;

  serve(
    {
      fetch: (req: Request) => app.fetch(req, bindings, noopCtx),
      port: cfg.port,
    },
    (info: { port: number }) => {
      console.log(`[basalt-selfhost] listening on http://localhost:${info.port}`);
    },
  );
}

void main();
