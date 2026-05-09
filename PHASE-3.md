# Phase 3 — Cloudflare API + Web Cockpit

> **Goal:** Stand up the Pro tier. Ship the Cloudflare API (`@basalt/api`) backed by D1, R2, KV, Vectorize, Workers AI, Workflows, Queues, and Cron Triggers. Ship the web cockpit (`@basalt/web`) where users see their Briefs, history, drift over time, and manage billing.
>
> **Target tag:** `v0.3.0`
>
> **Estimated duration:** 6–8 weeks

This phase introduces the cloud surface. Privacy posture is non-negotiable: the Open tier never breaks. Pro-tier raw notes are processed in-memory in Workers; only derived data persists. Vault Sync is opt-in, never default.

---

## TASK-3.1 — Provision Cloudflare resources (staging + prod)

**Spec:**
- Create two Cloudflare accounts or environments: `basalt-staging` and `basalt-prod`
- Provision per Appendix A in PRD: Workers, Pages, D1, Vectorize, R2 buckets, KV namespaces, Durable Objects, Workers AI access, Workflows, Queues, Cron Triggers
- Use `wrangler.toml` (or `wrangler.jsonc`) per environment with `[env.staging]` and `[env.production]` sections
- Configure secrets via `wrangler secret put`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BYOK_ENCRYPTION_KEY`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GITHUB_CLIENT_SECRET`, `JWT_SIGNING_KEY`
- Create D1 schema migration scripts in `packages/api/migrations/` and apply to staging
- Document the provisioning steps in `packages/api/docs/INFRASTRUCTURE.md`

**Files created:**
```
packages/api/wrangler.jsonc
packages/api/migrations/0001_initial.sql
packages/api/docs/INFRASTRUCTURE.md
```

**Tests:**
- `wrangler d1 execute basalt-staging-db --command "SELECT name FROM sqlite_master"` returns expected tables
- `wrangler vectorize get basalt-staging-vectors` returns the index
- `wrangler r2 bucket list` shows all three buckets
- `wrangler kv:namespace list` shows all three namespaces

**Definition of Done:** Standard DoD + staging environment fully provisioned + prod environment provisioned but empty.

**Notes:**
- D1 schema design is load-bearing. Tables: `users`, `vaults`, `briefs`, `findings`, `byok_keys`, `subscriptions`, `audit_log`. Indexes on `user_id`, `vault_id`, `brief_id`. Soft-delete columns for GDPR compliance.

---

## TASK-3.2 — Scaffold `@basalt/api`

**Spec:**
- Set up `packages/api/` for Cloudflare Workers
- Install `hono`, `@hono/zod-validator`, `zod`, `better-auth`
- Install Cloudflare-specific deps: `@cloudflare/workers-types`
- Create `src/index.ts` with Hono app, basic middleware (CORS, logging, error handling)
- Create directory structure for routes, middleware, services, prompts
- Configure local dev via `wrangler dev`
- Add `bun run --cwd packages/api dev` script

**Files created:**
```
packages/api/
├── package.json
├── tsconfig.json
├── wrangler.jsonc                  # already created in TASK-3.1
├── src/
│   ├── index.ts                    # Hono app entry
│   ├── routes/                     # one file per logical group
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   └── error.ts
│   ├── services/
│   ├── prompts/                    # curated LLM prompts (Phase 1 verbs, deferred)
│   ├── adapters/
│   │   ├── storage-d1.ts
│   │   ├── storage-vectorize.ts
│   │   ├── embedding-workers-ai.ts
│   │   └── fs-r2.ts
│   ├── db/
│   │   └── schema.ts               # Drizzle ORM schema, mirrors migrations
│   └── i18n/en.json
└── README.md
```

**Tests:**
- `wrangler dev` boots the Worker locally
- `curl http://localhost:8787/health` returns 200 with `{ ok: true, version: "..." }`
- `curl http://localhost:8787/v1/me` (unauthenticated) returns 401

**Definition of Done:** Standard DoD.

---

## TASK-3.3 — Implement auth (better-auth + OAuth)

**Spec:**
- Configure `better-auth` with Google and GitHub OAuth providers
- Sessions stored in KV (`basalt-sessions`), JWT for cross-Worker auth
- Endpoints:
  - `POST /v1/auth/oauth/start` → generates state, redirects to provider
  - `POST /v1/auth/oauth/callback` → validates state, exchanges code for token, creates user, returns session
  - `GET /v1/me` → returns current user
  - `DELETE /v1/me` → soft-deletes user, schedules hard-delete via Workflow (30-day grace per GDPR pattern)
- Auth middleware verifies session token and attaches `c.var.user` for downstream routes

**Files created:**
```
packages/api/src/routes/auth.ts
packages/api/src/routes/me.ts
packages/api/src/middleware/auth.ts
packages/api/src/services/users.ts
```

**Tests:**
- Unit: middleware rejects requests without session, accepts requests with valid session
- Integration (Miniflare or `wrangler dev`): full OAuth flow with mocked provider responses
- Integration: GET /v1/me with valid session returns user profile
- Integration: DELETE /v1/me schedules hard-delete and returns 202

**Definition of Done:** Standard DoD.

---

## TASK-3.4 — Implement vault registration + R2 sync (opt-in)

**Spec:**
- Implement `POST /v1/vaults` to register a vault for cloud indexing:
  - Body: `{ name, sync_enabled: boolean }`
  - Creates a vault record in D1
  - Allocates a Vectorize index namespace per vault (or shared index keyed by vault_id — pick based on Vectorize quotas)
  - If `sync_enabled: true`, returns a presigned R2 upload URL for vault tarball
- Implement `POST /v1/vaults/:id/index` to kick off an indexing job:
  - Creates a Workflow run (`IndexVault`) with vault_id
  - Returns job_id for polling
- Implement `GET /v1/vaults/:id/index/:jobId` to poll status
- Vault sync blobs stored encrypted in R2 (`basalt-vault-sync` bucket); encryption key is user-derived (passed at upload, stored encrypted with user's recovery key — document the key hierarchy in `docs/security.md`)

**Files created:**
```
packages/api/src/routes/vaults.ts
packages/api/src/services/vaults.ts
packages/api/src/services/r2-sync.ts
packages/api/src/workflows/IndexVault.ts
docs/security.md                     # key hierarchy
```

**Tests:**
- Integration: register a vault without sync, verify D1 record
- Integration: register a vault with sync, upload a small tarball via presigned URL, verify R2 blob exists
- Integration: kick off indexing, poll until done, verify Brief metadata in D1 and vectors in Vectorize

**Definition of Done:** Standard DoD.

---

## TASK-3.5 — Implement IndexVault Workflow

**Spec:**
- Implement the `IndexVault` Workflow in `src/workflows/IndexVault.ts`:
  - Step 1: Download vault tarball from R2 (if sync is enabled) OR pull from a registered git remote (future option, stub for now)
  - Step 2: Walk vault, parse markdown using `@basalt/core` adapters
  - Step 3: Compute embeddings via Workers AI (`@cf/baai/bge-m3`)
  - Step 4: Upsert into D1 + Vectorize
  - Step 5: Run all five verbs via `@basalt/core` Engine
  - Step 6: Persist Brief in D1, render artifacts to R2 (`basalt-briefs` bucket)
  - Step 7: Notify user via email or push (later phase; for now, no-op)
- Each step is durable; Workflow retries on failure
- Progress events written to D1 `audit_log` for the user-facing job-status endpoint
- Use Queues for fan-out where appropriate (e.g. embedding batches)

**Files created:**
```
packages/api/src/workflows/IndexVault.ts
packages/api/src/workflows/IndexVault.test.ts
```

**Tests:**
- Unit: each Workflow step in isolation with mocked dependencies
- Integration: end-to-end Workflow run on a small fixture vault uploaded to R2; verify Brief artifact materialized
- Failure injection: kill mid-step and verify Workflow resumes correctly

**Definition of Done:** Standard DoD.

**Notes:**
- This is the most complex task in Phase 3. Budget 1–2 weeks. Don't take shortcuts on durability — the Pro tier promise depends on weekly briefs running reliably.

---

## TASK-3.6 — Implement Brief endpoints

**Spec:**
- `POST /v1/briefs/generate` → triggers ad-hoc brief, returns brief_id immediately, runs IndexVault Workflow async
- `GET /v1/briefs/:id` → returns Brief with findings, citations, render variants
- `GET /v1/briefs?vault=…&limit=…` → list briefs
- `POST /v1/findings/:id/promote` → mark finding as promoted (e.g. thesis promoted to a saved file)
- `POST /v1/findings/:id/snooze` → mark finding as snoozed for N days
- `POST /v1/findings/:id/dismiss` → mark finding as dismissed
- All endpoints require auth and verify ownership

**Files created:**
```
packages/api/src/routes/briefs.ts
packages/api/src/routes/findings.ts
packages/api/src/services/briefs.ts
packages/api/src/services/findings.ts
```

**Tests:**
- Integration: full lifecycle — generate brief, fetch by id, list, promote a finding, verify state in D1
- Integration: ownership enforcement — user A cannot fetch user B's briefs
- Edge: snooze with N=0 returns to pending immediately (clock-tied)

**Definition of Done:** Standard DoD.

---

## TASK-3.7 — Implement Basalt AI endpoints

**Spec:**
- `POST /v1/ai/embed` → embedding via `@cf/baai/bge-m3`; rate-limited per user (KV-backed counters); accepts up to 100 strings per call
- `POST /v1/ai/synthesize` → LLM completion via Workers AI; only callable from Pro tier; gate on subscription state
- Track usage per user in D1 (for billing visibility, not for billing — billing is flat-fee)
- Return clear error structure on rate limits, missing subscription, model unavailability

**Files created:**
```
packages/api/src/routes/ai.ts
packages/api/src/services/ai.ts
packages/api/src/middleware/subscription-gate.ts
```

**Tests:**
- Integration: embed call returns vectors of correct dimension
- Integration: synthesize call returns completion (using a mocked Workers AI binding for deterministic testing in CI)
- Integration: free user calling synthesize returns 402 with upgrade-required structure
- Integration: rate limit triggers after configured threshold

**Definition of Done:** Standard DoD.

---

## TASK-3.8 — Implement BYOK endpoints + key management

**Spec:**
- `POST /v1/keys` → upload a BYOK key; body `{ provider, key }`; key encrypted with `BYOK_ENCRYPTION_KEY` (Workers secret) and stored in KV (`basalt-byok-keys`) keyed by `user_id:provider`
- `DELETE /v1/keys/:provider` → remove
- `GET /v1/keys` → list providers with keys configured (does NOT return actual keys, only provider names)
- When a verb run uses BYOK, decrypt at request time, never log
- Document the encryption envelope in `docs/security.md`

**Files created:**
```
packages/api/src/routes/keys.ts
packages/api/src/services/byok.ts
```

**Tests:**
- Unit: encryption envelope round-trip
- Integration: full key lifecycle (POST, GET, DELETE)
- Integration: verifying that decrypted key never appears in logs (test runs with logging captured, asserts absence)

**Definition of Done:** Standard DoD.

---

## TASK-3.9 — Implement billing (Stripe Checkout)

**Spec:**
- `POST /v1/billing/checkout` → creates a Stripe Checkout session; returns redirect URL; supports `pro_monthly`, `pro_yearly`, `founder_lifetime` price IDs
- `POST /v1/billing/webhook` → Stripe webhook handler; verifies signature with `STRIPE_WEBHOOK_SECRET`; updates `subscriptions` table on `checkout.session.completed`, `customer.subscription.deleted`, etc.
- `GET /v1/billing/portal` → creates a Stripe Customer Portal session for self-service
- Founder tier capped at 100: webhook checks count and rejects if exceeded (with refund logic — document the path)

**Files created:**
```
packages/api/src/routes/billing.ts
packages/api/src/services/billing.ts
```

**Tests:**
- Integration: full checkout flow with Stripe test mode
- Integration: webhook receives signed event, updates subscription state
- Integration: founder cap enforced — submit 101st purchase, verify rejection
- Unit: webhook signature verification rejects tampered payloads

**Definition of Done:** Standard DoD.

**Notes:**
- Founder cap mechanism is tricky because of Stripe race conditions. Use a D1 transaction with a check constraint, or a Durable Object to serialize.

---

## TASK-3.10 — Implement weekly Brief Cron Trigger

**Spec:**
- Configure a Cron Trigger in `wrangler.jsonc`: `0 23 * * 0` (Sunday 23:00 UTC)
- Cron handler:
  - Query D1 for users with `brief_cadence = 'weekly'` and `subscription_active = true`
  - Fan out: enqueue an IndexVault job per user via Queues
  - Workers AI quotas honored — backoff and retry on rate limits
- Cron run logged in `audit_log`

**Files created:**
```
packages/api/src/crons/weekly-brief.ts
```

**Tests:**
- Unit: handler logic with mocked D1 and Queue
- Integration: trigger cron manually via `wrangler trigger`, verify jobs enqueued

**Definition of Done:** Standard DoD.

---

## TASK-3.11 — Scaffold `@basalt/web`

**Spec:**
- Set up `packages/web/` with Vite + React + Tailwind v4
- Install `@basalt/ui` (shared components — built incrementally; create stubs for Brief renderer, ElementTile, etc.)
- Install `react-router-dom`, `@tanstack/react-query`, `@hookform/resolvers`, `zod`
- Configure Vite for Cloudflare Pages deploy (`wrangler pages publish dist`)
- Create `src/main.tsx` entry, `src/App.tsx` with router shell
- Configure auth flow: redirect to API's OAuth start, callback handler, session storage in cookie
- Configure API client with React Query, base URL from env

**Files created:**
```
packages/web/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── api-client.ts
│   │   └── auth.ts
│   ├── views/
│   │   ├── Home.tsx
│   │   ├── BriefList.tsx
│   │   ├── BriefDetail.tsx
│   │   ├── Timeline.tsx
│   │   ├── Vaults.tsx
│   │   └── Settings.tsx
│   ├── components/             # uses @basalt/ui where shared
│   └── i18n/en.json
└── README.md

packages/ui/
├── package.json
├── src/
│   ├── tokens.ts                # brand color/font tokens
│   ├── tailwind.preset.ts       # consumed by web, desktop, marketing
│   └── components/
│       ├── ElementTile.tsx
│       ├── Brief/
│       │   ├── BriefView.tsx
│       │   ├── FindingCard.tsx
│       │   └── Citation.tsx
│       └── (other shared components)
```

**Tests:**
- `bun run --cwd packages/web build` produces dist/
- `bun run --cwd packages/web dev` boots Vite dev server
- Smoke: navigate to localhost, see auth-gated landing
- Visual: ElementTile component renders Na, Cl, Hg, C, Au correctly

**Definition of Done:** Standard DoD.

---

## TASK-3.12 — Implement web views

**Spec:**
- `/` (Home): latest Brief or onboarding if no vaults
- `/briefs`: history with filters (date range, verb, vault)
- `/briefs/:id`: full Brief render with one-click actions (Promote, Snooze, Dismiss)
- `/timeline`: visualizations using a charting library (`recharts` or `visx`):
  - Drift over time (line chart)
  - Theses over time (small-multiples)
  - Connection density (heatmap or chord diagram)
- `/vaults`: list, register new, manage sync
- `/settings`: account info, BYOK keys (add/remove with provider dropdown), billing portal link, privacy preferences

All views use `@basalt/ui` components for visual consistency with desktop and marketing site.

**Files created/modified:**
```
packages/web/src/views/*.tsx
packages/ui/src/components/...
```

**Tests:**
- Unit: each view renders with React Testing Library given mocked API responses
- Integration (Playwright): auth + view-Brief flow against `wrangler dev` API
- Visual snapshot tests for BriefView, Timeline charts

**Definition of Done:** Standard DoD.

---

## TASK-3.13 — Deploy to Cloudflare Pages + connect API

**Spec:**
- Configure Cloudflare Pages project for `@basalt/web`
- Configure custom domain (TBD per PRD §10 open decisions; placeholder `app.basalt-staging.<your-domain>` for staging)
- Configure Pages Functions OR direct API CORS to allow auth callback
- Set up CI workflow `.github/workflows/deploy-web-staging.yml` that builds and deploys on push to `main`

**Files created:**
```
.github/workflows/deploy-web-staging.yml
.github/workflows/deploy-web-prod.yml         # tag-driven, manual approval
packages/web/wrangler.jsonc                   # for Pages config
```

**Tests:**
- Manual: push to a feature branch, verify staging deploy
- Manual: tag, verify prod deploy with approval gate

**Definition of Done:** Standard DoD + staging URL accessible end-to-end.

---

## Phase 3 Exit Criteria

- [ ] All TASK-3.* merged
- [ ] Staging API + web fully functional end-to-end (auth → register vault → upload → brief → view)
- [ ] Stripe checkout works in test mode for all three tiers
- [ ] Weekly cron fires and produces briefs in staging
- [ ] BYOK key lifecycle verified (upload, use, delete, log absence)
- [ ] Performance budgets met (PRD §6.4)
- [ ] Privacy posture verified by integration test: raw notes only in-memory in Workers, never persisted unless vault sync explicitly opted into
- [ ] `scripts/release.sh --dry-run v0.3.0` clean

When all checked, tag `v0.3.0`. Phase 4 begins.
