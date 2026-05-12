# Changelog

All notable changes to Basalt are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Phase boundaries get a release tag (`v0.<phase>.0`); public launch tags `v1.0.0`.

## Unreleased

## v1.5.0 — 2026-05-12

### Added — v1.5.0 work (brand migration + downloadable artifacts)
- **npm rename**: all published packages now live under the
  `basalted` brand (matches `basalted.com` domain). New names:
  `basalted` (CLI), `basalted-core` (engine library),
  `basalted-mcp` (MCP server). Workspace-only packages also renamed
  to `basalted-*` for consistency. The CLI binary stays `basalt`.
- **Marketing site + docs migrated** from `basalt.dev` → `basalted.com`
  across 37 files. Live at `https://basalted.com`,
  `https://docs.basalted.com`, `https://api.basalted.com`.
- **Obsidian plugin release pipeline**
  (`.github/workflows/release-obsidian-plugin.yml`): stamps version
  from tag, builds the plugin, attaches `manifest.json` / `main.js` /
  `styles.css` / `sql-wasm.wasm` / `basalt-obsidian-plugin.zip` to
  every GitHub release. Enables BRAT auto-update via `plsft/basalt`
  and direct manual install from the latest release.
- **CLI version stamping**: `basalt about` and `--version` now read
  from the package's `package.json` instead of a hardcoded "0.0.0".
  Bun's `--compile` inlines the JSON import, so compiled binaries
  report the real tagged version. Same fix for the MCP server's
  handshake.
- **Local deploy script**: `scripts/deploy.sh` wraps the wrangler
  commands needed to publish the API + site + docs from a developer
  machine using a `wrangler login` OAuth session.

### Fixed — v1.5.0 work
- **release-cli-mcp.yml**: gate `npm-publish` job on real tag pushes
  (was firing on dispatch with bogus `0.0.0` version). Stamp tag
  version into each published `package.json` AND rewrite `workspace:*`
  deps to the same exact version — npm rejects the `workspace:`
  protocol on publish, so the old workflow could never have published
  even if it had been gated correctly. Drop `--provenance` and the
  `|| echo` failure-swallow.
- **deploy-site.yml + deploy-docs.yml**: install Node 22 via
  `actions/setup-node@v4`. Wrangler 4 requires Node 22+; the bun
  runner ships Node 20, so these workflows had been silently skipping
  publishes since v1.0.0.
- **API cron syntax**: change `"0 23 * * 0"` to `"0 23 * * SUN"` in
  `packages/api/wrangler.jsonc`. CF's cron parser rejected the
  numeric-Sunday form with `code: 10100 invalid cron string`,
  blocking production deploys.
- **Docs build**: switch from Starlight's default `docsLoader` to
  Astro's `glob` loader with an explicit `!**/CLAUDE.md` exclude.
  `claude-mem` drops auto-generated CLAUDE.md files into content
  directories; they lack Starlight's schema and crashed `astro build`.

## v1.2.0 — 2026-05-11

### Added — v1.2.0 work (mobile PWA)
- New `@basalt/mobile` package — installable Progressive Web App
  (read-only Brief reader) for iOS Safari and Android Chrome. React 19
  + Vite 6 + react-router-dom 7 + `vite-plugin-pwa`. Bundle: 239 KB JS
  / 3.7 KB CSS / 10-entry precache (238 KB).
- Routes: `/` (brief list), `/briefs/:id` (full Markdown view + v1.1.0
  banner showing named thesis and contradiction verdicts when present),
  `/login` (session token paste), `/settings` (account info + sign out).
- Service worker: `StaleWhileRevalidate` for `/v1/briefs(/:id)?`
  (offline-friendly), `NetworkFirst` with 4s timeout for `/v1/me` and
  `/v1/vaults`. App shell precached.
- iOS / Android install via "Add to Home Screen" — full-screen mode,
  basalt-black theme color, safe-area-aware padding, 44px tap targets.
- `.github/workflows/deploy-mobile.yml` → Cloudflare Pages
  `basalt-mobile` project. Target domain: `mobile.basalt.dev`.
- Docs: new `/v1.2.0-mobile` page with install recipes per platform,
  setup, privacy posture, and the roadmap.

## v1.4.0 — 2026-05-11

### Added — v1.4.0 work (self-hosting)
- `packages/api/src/selfhost/` — Node-runtime variant of the API. Drops
  in `SelfhostD1` (better-sqlite3), `SelfhostKV` (one file per key with
  optional TTL envelope), `SelfhostR2` (raw file + sidecar metadata.json),
  `SelfhostVectorize` (flat brute-force ANN over SQLite), and
  `SelfhostAI` (Ollama-routed embedding + chat). Same Hono app, same
  routes, same OpenAPI schema — swap bindings, get the whole Pro tier on
  one box.
- `packages/api/Dockerfile.selfhost` — multi-stage Alpine image,
  bun build --compile to a single binary, non-root user, /health probe.
- `docker-compose.yml` — three-service stack (Ollama + ollama-init +
  basalt-api) with named volumes. Web-cockpit nginx layer commented in.
- `docs/v1.4.0-selfhost` — quick start, storage layout, backup recipe,
  production hardening checklist.
- 12 new tests; 634 total.

## v1.3.0 — 2026-05-11

### Added — v1.3.0 work (multi-vault search)
- `POST /v1/vaults/:id/reindex` — re-embeds the latest snapshot's notes
  via Workers AI's `@cf/baai/bge-base-en-v1.5` model and upserts vectors
  into the Vectorize index. Server-side re-embedding makes cross-vault
  search work even when different local surfaces used different
  embedding models (Ollama nomic vs MockEmbedder, etc.).
- `POST /v1/search` — cross-vault semantic search. Embeds the query via
  Workers AI, queries Vectorize with `topK` + metadata filters (always
  scopes to caller's `user_id`; optional `vault_ids[]` narrows further).
  Returns `{ query, elapsed_ms, embedding_model, hits[] }`.
  Rate-limited at 60/min.
- `DELETE /v1/vaults/:id` now also fires a best-effort `deleteByIds`
  against Vectorize for that vault's vectors (waitUntil so it doesn't
  block the user-facing delete).
- `basalt search "<query>"` CLI command. Supports `--vault-id <id>`
  (repeatable), `--top N`, `--api-url`, `--api-token`, `--json`.
- `packages/api/src/lib/{vectorize,workers-embedding}.ts` — helpers for
  ID/metadata namespacing, batch embedding, and tree-style filter
  composition.
- Docs: new `/v1.3.0-search` page with cost expectations, privacy
  posture (per-user metadata filter), and the response shape.
- OpenAPI regen: **25 paths / 27 schemas / 53 KB**. New schemas:
  `ReindexResponse`, `SearchRequest`, `SearchResponse`.
- 6 new tests (vector ID determinism + namespacing + length bound);
  622 total.

## v1.1.0 — 2026-05-11

### Added
- **API v1.1.0 plumbing**: `/v1/briefs/generate` now runs the v1 verb
  augmentation pass when `c.env.AI` (Workers AI binding) is available;
  request payload accepts `llm: false` to opt out (saves cost when the
  client only wants v0 output). Failures degrade gracefully — v0 findings
  always ship.
- **BYOK endpoints**: `GET/PUT/DELETE /v1/byok` for per-user provider
  API keys. AES-GCM encrypted at rest in BYOK_KEYS KV using
  BYOK_ENCRYPTION_KEY (wrangler secret). Random IV per encryption, audit
  log entry on put/delete. 7 unit tests covering envelope round-trip,
  random-IV ciphertext divergence, wrong-secret rejection, malformed
  envelope rejection.

- **CLI v1.1.0 plumbing**: `--llm <ollama|openai|anthropic|none>` flag on
  `basalt brief` + every alias (`thesis`, `contradiction`, `connection`,
  `drift`, `buried`); `--llm-model` for model override. When enabled,
  runs the v1 verb augmentation pass after composition and appends the
  named thesis / contradiction verdict as Markdown blockquotes. New
  `basalt snapshot push` subcommand uploads the local SQLite index to the
  configured API as a `VaultSnapshot` (mirrors
  `packages/api/src/lib/snapshot.ts` shape byte-for-byte). `basalt audit`
  gains a `--drift-v1` flag that re-runs Drift on the current window and
  prints `auto_verdict` (confirmed/softened/reversed/vanished) per
  historical finding.
- `CliConfig` extends with `llmProvider`, `llmModel`, `apiUrl`, `apiToken`,
  `apiVaultId`. Backwards-compatible: defaults remain `none` / blank.
- `packages/cli/src/llm.ts` resolves config + flag overrides into the right
  `AIAdapter`; reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` from env (never
  on-disk).
- `packages/cli/src/snapshot.ts` serializes the index into the on-the-wire
  shape (notes + base64-LE float32 embeddings) and `POST`s to
  `/v1/vaults/:id/snapshot` with the session cookie.
- `Engine.verbContext(top)` — public accessor that returns a ready
  `VerbContext` for callers that want to run individual verbs (including
  v1 LLM-augmented variants) without going through `brief()`.
- `@basalt/core` index now re-exports the four AI adapters
  (`OllamaAI`/`OpenAIAI`/`AnthropicAI`/`WorkersAI`) and the v1 verb fns
  (`findImplicitThesesV1`, `findContradictionsV1`, `auditDrift`,
  `compareDrift`). 14 new tests (snapshot serializer + llm resolver).

- **v1.1.0 — LLM-augmented v1 verbs** (post-launch roadmap milestone #1 from
  PHASE-6.md). Three verbs gain LLM-augmented "v1" variants alongside their
  pure-heuristic v0 implementations; v0 keeps shipping when the LLM isn't
  configured or rate-limits.
  - **Implicit Thesis v1** (`findImplicitThesesV1`) — runs the v0 cluster
    detector, then asks the configured `AIAdapter` to synthesize a single
    English sentence naming the cluster's through-line in the author's
    voice. System prompt anchors voice ("the author's own words, not a
    label"); temperature 0.4; cap 120 tokens. LLM failures degrade
    gracefully — the v0 finding still ships with `named_thesis: null`.
  - **Contradiction v1** (`findContradictionsV1`) — wraps each v0 pair
    with a `verdict` (`proven` | `apparent` | `undetermined`) from the
    LLM, plus a verdict_reason. The verdict tells the surface whether to
    treat the heuristic match as a real conflict or a topical overlap.
    Robust JSON parser handles models that wrap their output in backticks
    or add a preamble; off-enum verdicts fall back to undetermined.
  - **Drift v1** (`auditDrift`) — *not* LLM-augmented despite the v1
    name. Re-runs `findDrift` on the current window and tags each
    historical finding with `auto_verdict`
    (`confirmed`/`softened`/`reversed`/`vanished`) by comparing
    `drift_pct` against the current measurement (`< 50%` magnitude →
    softened; sign flip → reversed; project missing → vanished).
- **Four `AIAdapter` implementations** under `@basalt/core/adapters/`:
  - `OllamaAI` — local `/api/chat` against any Ollama-served model
    (default `llama3.2:3b`); injectable fetch for tests.
  - `OpenAIAI` — Chat Completions; also works with any OpenAI-compatible
    endpoint (Groq, Together, etc.) via `baseUrl`. Supports
    `OpenAI-Organization` header.
  - `AnthropicAI` — Messages API; splits `system` messages out of the
    array into the top-level `system` field; concatenates multiple
    system messages; concatenates all text-block contents in the
    response.
  - `WorkersAI` — Cloudflare Workers AI binding (`env.AI.run`). No HTTP,
    no API key — the binding is the credential. Handles both
    `{ response }` and `{ result: { response } }` envelope shapes.
- 40 new tests across the v1 verbs + AI adapters.

## v1.0.0 — 2026-05-11

### Added
- Real brief generation on Workers + vault snapshot pipeline. New endpoints:
  - `POST /v1/vaults/:id/snapshot` accepts a `VaultSnapshot` (notes +
    base64-float32 embeddings + wikilinks), validates via zod, persists to
    R2 at `snapshots/<user>/<vault>.json`. Replaces the previous index-queue
    stub; the snapshot is self-contained so brief generation never touches
    raw vault files.
  - `GET /v1/vaults/:id/snapshot/meta` — size, upload time, custom metadata.
  - `DELETE /v1/vaults/:id` — soft delete with 30-day grace + audit_log.
  - `POST /v1/briefs/generate` is now **synchronous**: hydrates the engine's
    `MemoryFilesystem` + `MemoryStorage` from the latest snapshot via
    `packages/api/src/lib/engine-adapters.ts`, runs `Engine.brief({ section, top })`,
    persists the result + one row per finding to D1, returns the full Brief
    inline. Rate-limited at 6/min per user (PRD §6.4).
  - `DELETE /v1/briefs/:id` — hard delete + cascade to findings.
  - `GET /v1/findings` — cursor-paginated finding timeline with filters
    (verb, vault_id, status) joined to briefs for owner scoping.
  - `POST /v1/findings/:id/{snooze,dismiss,confirm}` — owner-scoped status
    transitions with audit_log entries. Promote-to-note remains
    intentionally client-side per PRD §2.3.
- `packages/api/src/lib/snapshot.ts` — `VaultSnapshot` zod schema +
  base64-float32 encode/decode helpers. 7 unit tests cover round-trip
  preservation on 768-dim normalized vectors and zod schema edges.
- `packages/api/src/lib/engine-adapters.ts` — `buildEngineFromSnapshot()`:
  synthesizes a `MemoryFilesystem` + `MemoryStorage` Engine seeded with the
  snapshot's notes, then replaces mock embeddings with the snapshot's real
  vectors before verbs run. 2 integration tests including a sample-14
  fixture round-trip.

### Changed
- All API ID generation switched from `crypto.randomUUID()` to `ulid()` for
  sortable, prefix-comparable identifiers. Affects vaults, briefs, findings,
  audit_log, subscriptions.
- `findings` mutation endpoints (snooze / dismiss / confirm) now verify
  ownership via JOIN to `briefs.user_id` — previously any authenticated
  user could mutate any finding by ID guess. Closed before any production
  traffic.

### API surface

OpenAPI doc regenerated: **21 paths / 22 schemas / 42,925 bytes**. New
schemas: `VaultSnapshot`, `VaultSnapshotAck`, `SnapshotMeta`,
`FindingSnoozeRequest`. New endpoints documented with `x-rate-limit` hints
and owner-scoping notes.

- API hardening: real OAuth (GitHub + Google) and HMAC-verified Stripe
  webhooks. `/v1/auth/oauth/{start,callback,logout}` does real code exchange
  + `userinfo` lookup against the providers, upserts the user row in D1
  (UNIQUE on `(provider, provider_sub)`), and issues an HttpOnly +
  Secure-in-prod session cookie backed by a 30-day KV TTL.
  `/v1/billing/webhook` verifies the Stripe `stripe-signature` header via
  SubtleCrypto HMAC-SHA256 (5-min timestamp tolerance, constant-time v1
  compare, multi-v1 rotation supported) and handles
  `checkout.session.completed` and `customer.subscription.{created,updated,deleted}`
  to keep `subscriptions` + `users.tier` in sync. Founder tier enforces
  the 200-seat lifetime cap at both Checkout creation and webhook receipt.
  New helpers under `packages/api/src/lib/`: `ulid.ts` (Crockford base32 26-char
  IDs sortable by timestamp), `session.ts` (cookie + token helpers),
  `oauth.ts` (provider-agnostic code exchange + userinfo for GitHub/Google),
  `stripe.ts` (signature verifier with no SDK dep). 19 new tests across
  ulid + session + stripe-signature edge cases (rotation, tampered body,
  out-of-tolerance timestamp, non-JSON body, missing header).
- `scripts/generate-openapi.ts` — generates `packages/api/openapi.json` +
  `packages/docs/src/content/docs/api/openapi.json` (29 KB each) describing
  all 15 routes with 18 schemas, the session security scheme, per-route
  rate-limit hints (`x-rate-limit`), and the 4XX/5XX error envelope.
  Wired as `bun run openapi`.
- `bench/` perf scripts and `docs/perf-results.md`. Three benches:
  `index-throughput.ts` (1k notes / 244 ms = 4,099 notes/sec, vs PRD §6.4
  budget of < 30 s — ~120× headroom), `cold-start.ts` (engine import + create
  median 36 ms; `basalt about` CLI median 334 ms vs 1500 ms ceiling), and
  `idle-memory.ts` (post-GC rss 161 MB on the Bun runtime — desktop's
  100 MB budget is measured separately against the Tauri bundle which does
  not embed Bun). Wired as `bun run bench` plus per-bench aliases.
- [TASK-1.15] `SqlJsStorage` — full sql.js (WASM) `StorageAdapter` for the
  Obsidian plugin. Mirrors `packages/cli/src/adapters/storage-sqlite.ts`
  byte-for-byte on schema + SQL (both share `MIGRATIONS` from `@basalt/core`).
  Persistence: serializes the in-memory DB to a vault-relative
  `.basalt-index.db` file on every mutation via `Vault.adapter.writeBinary`.
  Blob round-trip uses `Uint8Array` + `DataView` (no Node Buffer dep). 4
  vitest tests exercise: fresh init writes a serialized DB, full
  note+embedding+finding round-trip across re-open, `upsertFinding`
  idempotency on (verb, finding_key) while pending, and case-insensitive
  stem resolution with last-wins. `esbuild.config.mjs` copies
  `sql-wasm.wasm` next to `main.js` at build time.
- [TASK-1.16/17/18] Plugin engine integration + Settings tab + weekly
  scheduling. `BriefView` is now an interactive ItemView with a real
  Generate Brief button driving an `@basalt/core` `Engine` end-to-end via
  `ObsidianFilesystem` + `SqlJsStorage` + (Ollama with MockEmbedder
  fallback) embedding. `BasaltSettingTab` exposes Ollama URL, embedding
  model, promote folder, cadence (manual/weekly), weekly-run hour, and the
  privacy opt-out toggle. Weekly scheduler uses `window.setInterval(10min)`
  + a `lastWeeklyRun` epoch-ms guard; auto-fires `runBrief` once per
  7-day window and writes the brief into the configured promote folder.
  Two commands registered: `Basalt: Generate Brief` and `Basalt: Reindex
  vault`. Plugin builds clean (143KB main.js + 660KB sql-wasm.wasm).

### Changed
- Parity divergences D-9 / D-10 / D-11 fully investigated and documented in
  `docs/parsing-decisions.md`. The Contradiction (D-11) divergence is
  root-caused as `MAX_PAIRS=200` order-sensitivity interacting with float32
  accumulator precision differences between TS's `dotF32` and NumPy's BLAS
  sgemm; verified by direct debug instrumentation that the reference pair
  (2026-03-04, Insight-011) is computed identically in TS but never enters
  the qualifying set because TS fills its 200-pair cap with different
  borderline pairs (the `[0.7199..0.7201]` band flips). Connection (D-9)
  TS-only candidates clear every visible filter; most likely cause is a
  subtle `_extract_claim_quote` regex divergence we couldn't isolate
  without re-running Python. All three are decided: divergence accepted,
  rationale recorded. New `dotF32` ships in `@basalt/core/math/vector.ts`
  with pairwise (tree-reduction) float32 summation matching BLAS sgemm
  semantics; used in `connection`, `contradiction`, and `thesis` verbs.
  528 tests pass (added 4 from sql.js round-trip suite).

- [Phase 5] Marketing site, docs site, and launch artifacts. `@basalt/ui` ships
  the canonical brand tokens (`tokens.ts` + `tailwind.preset.ts`, PRD §2.5).
  `@basalt/site` (Astro 5) with Roman-numeral landing (I/II/.../VII sections),
  five element tiles, anonymized real Brief sample, `/install` `/pricing`
  `/privacy` `/changelog` `/status` pages. `@basalt/docs` (Astro 5 + Starlight)
  with Getting Started per surface, full Verb reference (one page per verb),
  BYOK walkthroughs, Privacy + Threat-model, Python→TS migration guide,
  auto-generated API reference. CI deploys `deploy-site.yml` + `deploy-docs.yml`
  to Cloudflare Pages. `docs/dns-config.md` is the source of truth for the four
  `*.basalt.dev` subdomains. SEO: per-site `robots.txt`, sitemap generator
  endpoint, Cloudflare Web Analytics only (no third-party trackers).
- [Phase 6] Public-launch artifacts. `docs/launch-content/` has frozen HN
  Show-HN post + maker comment, ProductHunt listing, X 10-tweet thread,
  LinkedIn announcement, warm-network email, tailored Reddit posts for
  r/ObsidianMD r/PKMS r/selfhosted, DevHunt listing, and the long-form
  `blog-announcing.md`. `docs/launch-runbook.md` is the T-24h through T+4h
  launch-day checklist. `docs/on-call-runbook.md` + `docs/incident-templates/`
  cover the two-week post-launch on-call window. `packages/api/src/routes/status.ts`
  + `packages/site/src/pages/status.astro` are the public health endpoint
  + browser-side aggregator. `.github/ISSUE_TEMPLATE/` ships bug-report,
  feature-request, and install-help templates.
- [Phase 4] `@basalt/desktop` — Tauri 2 desktop app. Rust shell at `packages/desktop/src-tauri/` with system WebView, Tauri 2 plugins (fs / sql / shell / dialog / notification / updater / os), custom commands `walk_vault` (uses `walkdir` with SPEC.md §1.1 exclude list) and `open_external`. `capabilities/default.json` granularly allowlists permissions — no wildcards on FS write outside `$HOME`, no shell exec, scoped sql. `tauri.conf.json`: bundle identifier `com.plsft.basalt.desktop`, dmg/deb/rpm/appimage/msi/nsis targets, macOS min 11.0, CSP allows only self + Ollama on localhost. React 19 + Tailwind v4 frontend with brand palette `@theme` block. `engine-bridge.ts`: `TauriFilesystem` adapter wraps the Rust `walk_vault` + `@tauri-apps/plugin-fs.readTextFile`, runs `@basalt/core`'s Engine in-WebView, falls back to MockEmbedder when Ollama isn't reachable so "Generate Brief" works pre-Ollama-install. `App.tsx`: vault picker via `plugin-dialog.open`, generate-brief button, progress reporter wired to `Engine.options.onProgress`. `.github/workflows/release-desktop.yml`: matrix builds for macOS Universal + Linux x64 + Windows x64; macOS code-signing wired to read `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID`/`APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD`/`APPLE_SIGNING_IDENTITY` GitHub secrets (the Apple Dev ID under `george.rios@pluralsoftware.com` plugs in via these); Windows Authenticode is optional. Vite frontend builds clean (316KB JS). Placeholder icons committed; final brand assets land in Phase 5 (TASK-5.1). README documents the full secret-setup recipe for code signing.
- [TASK-3.1] / [TASK-3.2-3.8] / [TASK-3.9+] Cloud API + Web Cockpit. **Cloudflare resources provisioned via wrangler CLI** (account `george@plsft.com` / `7509d166af8dbf52b9a7d78604255d09`): D1 `basalt-staging-db` + `basalt-prod-db` (initial migration applied to both with 6 tables — users, vaults, briefs, findings, subscriptions, audit_log; GDPR soft-delete columns; indexes for all read patterns); KV namespaces SESSIONS / RATE_LIMITS / BYOK_KEYS (with preview IDs for `wrangler dev`); R2 buckets basalt-briefs / basalt-releases / basalt-vault-sync; Vectorize index basalt-prod-vectors (1024-dim cosine); Queue basalt-index-jobs. All IDs captured in `packages/api/wrangler.jsonc`. **`@basalt/api`** (Hono on Workers): /health, /v1/auth/oauth/{start,callback} (skeleton — needs OAuth app registration), /v1/me (GET/DELETE with 30d GDPR grace), /v1/vaults (CRUD + index queue enqueue), /v1/briefs ({generate,get,list} with Pro-tier gate), /v1/findings/:id/{promote→client-side error, snooze, dismiss}, /v1/billing/{checkout→Stripe Checkout when STRIPE_SECRET_KEY is set, webhook stub}. `requireAuth` middleware reads sessions from KV; `rateLimit({ scope, max, window })` per-user/per-IP. CORS allows localhost + `*.pages.dev` + `app.virtuosoai.dev`. **`@basalt/web`** (Vite + React 19 + Tailwind v4): brand tokens declared via `@theme` (basalt-bg, -ink, the five verb accents); routes `/` `/briefs` `/briefs/:id` `/timeline` `/vaults` `/settings` with React Router 7 + TanStack Query 5; vite proxies `/v1` + `/health` to the API in dev. 524 tests still pass; CI green.
- [TASK-2.4] / [TASK-2.5+2.6+2.7] Cross-platform release pipeline + `@basalt/mcp` MCP server. `.github/workflows/release-cli-mcp.yml`: triggers on `v*.*.*` tag push, builds `basalt-cli` + `basalt-mcp` for linux/darwin/windows × x64/arm64 (10 binaries total) via `bun build --compile`, uploads to GitHub release (notes auto-extracted from CHANGELOG `## <tag>` section), publishes `@basalt/core` + `@basalt/cli` + `@basalt/mcp` to npm with provenance when `NPM_TOKEN` secret is set (skipped silently when unset; skipped entirely for `-rc`/`-beta` tags). `packages/mcp/`: MCP server via `@modelcontextprotocol/sdk` over stdio. Six tools: `basalt_brief`, `basalt_connection`, `basalt_contradiction`, `basalt_drift`, `basalt_buried_insight`, `basalt_implicit_thesis`, plus `basalt_audit` gated behind `--allow-write`. **Promote-to-note intentionally absent** per PRD §4.3 (file creation belongs to a surface where the user can see the result). Zod-validated tool inputs. `vault-context.ts` resolves vault/db/ollama-url/embedding-model with priority CLI flags > per-call args > `~/.basalt/config.toml` (shared loader with the CLI — single source of truth). `examples/claude-desktop-config.json` + `examples/cursor-config.json` ship for copy-paste install. README with full install + tool reference + flags.
- [TASK-2.1] / [TASK-2.2] / [TASK-2.3] (CLI scaffold + adapters + commands, bundled). `packages/cli/`: Commander-driven entry at `src/index.ts` wires `init`/`index`/`brief`/`thesis`/`drift`/`connection`/`contradiction`/`buried`/`promote`/`audit`/`demo`/`about`. `init` uses `@inquirer/prompts` to write `~/.basalt/config.toml` (location resolved via `env-paths`). `index` walks via `NodeFilesystem` (fs/promises with create-only `createNoteFile` via `open("wx")` atomic flag) and persists via `SqliteStorage` (better-sqlite3, WAL mode, transactional `replaceLinks`/`resolveLinkTargets`, blob-roundtrip Float32Array embeddings). The CLI's storage adapter shares `MIGRATIONS` (newly exported from `@basalt/core`) with the plugin's sql.js adapter — schema is byte-equivalent to Python's `~/.basalt/basalt.db`. `brief`/`thesis`/`drift`/etc render via `renderBrief` (Markdown / HTML / JSON). `demo` runs offline against the bundled `sample-vault-14` fixture using `MockEmbedder` (no Ollama required). `about` shows version + schema + the Basalt mark. `bun build --compile` recipes for `bin/basalt-{linux,darwin,windows}-{x64,arm64}` per PRD §4.2. Smoke-tested: `bun run packages/cli/src/index.ts demo` produces a real Brief with 3 Buried Insight findings + Drift over the sample fixture. 524 tests still pass; CI green.
- [TASK-1.14] Implement Obsidian Vault adapter (filesystem). `packages/obsidian-plugin/src/adapters/fs-obsidian.ts`: `walk()` uses `Vault.getMarkdownFiles()` returned in path-sort order with `EXCLUDE_DIRS` filter (default mirrors SPEC.md §1.1 + adds `.basalt`); `readFile()` via `Vault.cachedRead`; `exists()` covers files AND folders; `createNoteFile()` is **strictly create-only** — returns false (no throw) when target exists, auto-creates parent folder when missing, never modifies an existing file. **Architectural test** in `fs-obsidian.test.ts` greps the adapter source for forbidden Vault APIs (`.modify(`, `.modifyBinary(`, `.rename(`, `.delete(`, `.trash(`, `.process(`, `.append(`, `.adapter.{write,append,remove}(`) — any match fails CI. Plus 8 unit tests with a mock Vault: walk-sort, exclude-dir filter, cachedRead, exists for files+folders, createNoteFile happy paths, parent-folder auto-create, refuses-overwrite return-false (not throw), spy verifies no modify/rename/delete is called. 524 total tests across 27 files.
- [TASK-1.13] Scaffold `@basalt/obsidian-plugin`. `manifest.json` (id `basalt`, v0.1.0, minAppVersion 1.6.0, isDesktopOnly false). `esbuild.config.mjs` produces a CJS bundle with the right `external` list for Obsidian's Electron host (obsidian, electron, all CodeMirror packages provided by the host). `src/main.ts` extends `Plugin` with onload/onunload, registers the BriefView, adds a ribbon icon + status-bar item, sketches the engine wire-up via `OllamaEmbedder` + `ObsidianFilesystem` + `SqlJsStorage` (the latter two are stubs filled in by TASK-1.14 / TASK-1.15). `BriefView` extends `ItemView`. `settings.ts` defines `BasaltSettings` + `DEFAULT_SETTINGS`. `i18n/en.json` extracts every UI string (TASK-1.17 wires the actual settings UI). `styles.css` carries the brand palette + per-verb accent CSS vars + Sodium-tile ribbon styling. `@basalt/core/src/index.ts` extended to re-export `OllamaEmbedder`, `MockEmbedder`, `MemoryFilesystem`, `MemoryStorage`, `registerVerb`, `VerbContext`, `VerbFn`, `hubDensity`, `hubPenalty` so per-surface adapters can compose. `tsconfig.base.json` excludes packages with their own tsconfigs (obsidian-plugin, web, desktop, site, docs) so the workspace-level typecheck stays Node-flavored. `biome.json` adds bundler artifacts and `.venv*` to ignores; `noNonNullAssertion` + `useTemplate` set to `off` (intentional non-null assertions are required under TS `noUncheckedIndexedAccess`). Build verified — `bun run --cwd packages/obsidian-plugin build` produces `main.js`. 514 tests still pass; CI green.
- [TASK-1.12] Promote-to-note + per-verb templates. `packages/core/src/promote/index.ts` exports `promoteFindingToNote(finding, opts?) → NoteContent` — strictly pure, returns `{ relPath, body }` for the surface to hand to `FilesystemAdapter.createNoteFile`. Five templates: Resurfaced (Buried), Bridge (Connection), Tension (Contradiction), Thesis (Implicit Thesis), Drift. Each emits frontmatter + a Markdown body that wikilinks back to source notes (the "earn its keep" property). `sanitize()` strips Windows-illegal filename chars + collapses whitespace. **Architectural test**: a directory grep over `promote/**/*.ts` (excluding tests) blocks any path that imports `node:fs`/`fs`/`fs/promises` or contains `writeFile`/`unlink`/`rename`/`mkdir`/`rmdir` — the read-only-by-default invariant from PRD §2.1 has skin in CI from this commit. 23 tests for promote (sanitize edges, relPath shape per verb, body content per verb, custom-template override, the architectural grep). 514 total tests across 26 files.
- [TASK-1.11] Full-Brief end-to-end parity scaffolding. `scripts/generate-embeddings-baseline.py` extracts Python's per-note embeddings from the SQLite indexes built by `scripts/generate-baseline.sh` and dumps them as `tests/parity/baseline/embeddings-{sample-14,large-200}.json` (base64 float32). `tests/parity/brief.test.ts` indexes the fixtures via TS, replaces mock embeddings with Python's vectors, runs `Engine.brief({ section: "all" })`, and diffs against the committed Brief baselines. `scripts/normalize-baseline-paths.py` is a one-shot fixer that rewrote 7 baseline JSONs to use forward-slash paths (Python had emitted Windows backslashes). **Buried Insight reaches strict parity** with both fixtures (D-12). Three open divergences for Connection / Implicit Thesis / Contradiction documented in `docs/parsing-decisions.md` D-9/D-10/D-11; brief.test.ts logs the diff and asserts structural correctness while strict per-bucket assertions wait on those investigations. 496 tests across 25 files.
- [TASK-1.10] Port Implicit Thesis (Na) verb. Last verb. `packages/core/src/graph/cliques.ts` implements `tightNeighborhoods(sims, n, threshold, minSize, maxSize)` — greedy near-clique detection with member-set deduping (matches `implicit_thesis.py:115-156`). `packages/core/src/verbs/thesis.ts` mirrors `reference/src/basalt/implicit_thesis.py:159-311`: pairwise similarity matrix with diagonal masked at -1, `tightNeighborhoods` with min=3 max=15, centroid = max mean intra-cluster similarity, mean_similarity from upper-triangle, folder/span diversity gate (≥2 folders OR ≥30d span), score = mean_sim × cluster_size × diversity × log(span+1) × hub_pen_mean. **All five verbs are now wired** in `verbs/index.ts` — importing `@basalt/core` gives a fully functional Engine end-to-end. 7 tests (4 cliques + 3 thesis integration). 494 total across 24 files.
- [TASK-1.9] Port Contradiction (Cl) verb. `packages/core/src/verbs/contradiction.ts` mirrors `reference/src/basalt/contradiction.py` byte-for-byte: NEGATION + REVERSAL regexes, all 21 polarity pairs (`POLARITY_PAIRS` constant), `contradictionEvidence(a, b)` scoring (asymmetric negation +1.0, asymmetric reversal +1.2, polarity pairs 0.8 per pair capped at 1.6), pairwise enumeration with cosine ≥ 0.72 + hub filter, `score = sim × cscore × √(pa × pb)`, diversity pass. 8 unit tests for `contradictionEvidence` (empty quote short-circuit, asymmetric vs symmetric negation, reversal, polarity-pair coverage, cap, substring semantics including `frameworks`/`works`, markdown stripping). 487 total tests across 23 files.
- [TASK-1.8] Port Drift (Hg) verb. `packages/core/src/verbs/drift.ts` mirrors `reference/src/basalt/drift.py`: project recognition via `^(?:\d+[-_])?Projects/([^/]+)(?:/|$)` (matches `02-Projects/`, `Projects/`, `1-Projects/`, etc.), daily-note recognition via tag OR filename `^.*?(\d{4}-\d{2}-\d{2}).*\.md$`, MIN_PROJECTS=2 + MIN_DAILY_NOTES=3 floors, mention regex with name-length-desc sort + word-boundary lookarounds, headline picks at ±5pp drift. 6 integration tests (project floor, daily floor, multi-Projects-prefix recognition, zero-mentions short-circuit, full happy-path, tag-only daily detection). 479 total tests across 22 files.
- [TASK-1.7] Port Connection (C) verb. `packages/core/src/verbs/connection.ts` mirrors `reference/src/basalt/connection.py` exactly: cross-folder filter, no-existing-wikilink filter, hub filter, cosine ≥ 0.78 (`CONNECTION_DEFAULT_MIN_SIM`), MAX_PAIRS = 200 cap, score = sim × √(pa × pb), diversity pass drops endpoint repeats. Self-registers in `verbs/index.ts`. 5 integration tests via Engine: empty when no pair clears threshold, same-folder excluded, existing-wikilink excluded, high-cosine cross-folder pair surfaces, diversity preserved across multi-pair candidates. 473 total tests across 21 files.
- [TASK-1.6] Port Buried Insight (Au) verb. `packages/core/src/verbs/buried.ts` mirrors `reference/src/basalt/buried.py:421-659` byte-for-byte: vault-aware threshold derivation (`computeVaultAgeDays` + `computeVaultAwareThresholds` in `math/thresholds.ts` matching the SPEC.md §9.2 worked-example table within all 6 rows), inbound-recent count from resolved links, semantic validators via cosine similarity (≥ MIN_SIM = 0.62, top-K = 5), MIN_VALIDATORS = 3 union threshold, scoring (`explicit×2 + sum(sem) + 0.05×days/30`) × hub penalty, validator dedup + sort by (-explicit, -sim, updated). Side-effect: `verbs/index.ts` registers the verb in the engine's registry on import; the other four verbs are re-imported but their stubs throw — they self-register in TASK-1.7-1.10. `math/cosine.ts` and `math/vector.ts` ship as the algorithm primitives. Tests: 17 thresholds + 17 vector + 4 buried integration via Engine = 38 new (468 total). Strict per-fixture parity is gated by TASK-1.11 (full Brief end-to-end vs sample-14-buried.json), which requires Python's embeddings to be loaded into TS storage; this lands when the storage adapter exposes a way to import them.
- [TASK-1.5] Engine orchestrator + brief composition + audit calibration. `Engine` (in `packages/core/src/engine.ts`) wraps storage + embedding + filesystem adapters, validates them in `Engine.create`, and exposes `index({ vault, force? })`, `brief({ section?, top? })`, `audit()`, `close()`. Verb registry (`registerVerb`) lets tests inject mock verb fns; the real verbs land in TASK-1.6–1.10 and self-register. `index` walks via `buildLinkGraph`, persists notes + links, then embeds (incremental by content_hash + model unless `force=true`). `brief` re-builds the in-memory graph, runs each registered verb, records every finding into the calibration table via `recordFinding`, then composes a Brief in canonical order. `audit` is a thin wrapper over `auditPending`. `packages/core/src/audit/calibration.ts` ports `reference/src/basalt/audit.py` to TS: rule generation per verb (3 buried + 2 connection + 2 contradiction + 3 thesis + variable drift), `findingKey` for idempotency, `recordFinding` + `auditPending` + `trackRecord` (banker's rounding for the `*_pct` fields, matching Python's `round(_, 1)`), and a per-rule-kind `evaluateRule` covering the 11 kinds at `audit.py:371-508`. `packages/core/src/brief/{compose,render}.ts` builds Brief objects with deterministic bucket ordering and renders Markdown / HTML / JSON. Tests: 14 engine + 19 calibration + 4 compose + 8 render = 45 new; 441 total across 17 files.
- [TASK-1.4] Storage primitives + embedding adapter. `packages/core/src/migrations/001-init.sql` is the canonical schema, byte-equivalent to `reference/src/basalt/index.py:12-72` (verified by tests/parity/schema.test.ts). `packages/core/src/migrations/index.ts` inlines the same SQL as `MIGRATIONS[]`; parity test enforces inline ↔ file equivalence. `embedding-mock.ts` provides a deterministic 768-dim embedder (FNV-1a + mulberry32, L2-normalized) for tests. `embedding-ollama.ts` ports `reference/src/basalt/embed.py`: POST `/api/embeddings`, truncate to `EMBED_MAX_CHARS=4000`, semaphore-bounded `EMBED_CONCURRENCY=6`, fetch-injectable for tests, typed `OllamaEmbeddingError`, optional `health()` probe. `storage-memory.ts` is a hand-rolled in-memory `StorageAdapter` for tests — round-trips notes/embeddings/links/findings/meta with `COALESCE(notes.created)` upsert semantics, idempotent `upsertFinding` on (verb, finding_key) while pending, last-stem-wins `resolveLinkTargets`. 34 new tests (7 mock + 11 ollama + 14 storage + 2 schema-parity); 396 total across 13 files.
- [TASK-1.3] Implement vault walker + link graph + hub-penalty. `packages/core/src/graph/builder.ts` walks a `FilesystemAdapter` in alphabetical sort order, parses each `.md` via `parseMarkdown`, assigns sequential 1-based IDs (matching SQLite AUTOINCREMENT), and resolves wikilinks by case-insensitive stem match (last-seen wins on duplicate stems, mirroring `index.py:resolve_link_targets:124-135`'s dict-overwrite semantics). Outgoing-distinct-target counts and per-note hub densities computed inline. `packages/core/src/graph/hub-penalty.ts` implements `hubDensity` (links per 100 words with the `max(.,1)` floor) and `hubPenalty` (`1 / (1 + (2·excess)²)` taper above `HUB_DENSITY_SOFT = 0.5`); reference table from `buried.py:570-573` matched within 1e-2. `packages/core/src/adapters/filesystem-memory.ts` provides an in-memory `FilesystemAdapter` for tests. Tests: 9 graph-builder unit tests (walk order, relPath, case-insensitive stem resolution, duplicate-stem last-wins, distinct-target counting, incoming-back-link, density, empty-body filter), 9 hub-penalty unit tests (formula edges + reference-table parity), and 10 graph-parity tests (notes by id/path/stem/word_count, links as sorted set, outLinkCount, density within ε=1e-5, hubPenalty range). 362 tests total, zero graph disagreements with Python on either fixture. `scripts/generate-graph-baseline.py` regenerates `tests/parity/baseline/graph-{sample-14,large-200}.json`.
- [TASK-1.2] Implement vault parser + parser-parity stress test. `packages/core/src/parser/{frontmatter,sentences,markdown}.ts` is a faithful TS port of `reference/src/basalt/vault.py` + the load-bearing-sentence extractor in `reference/src/basalt/buried.py:140-418`. Frontmatter parsing replicates `python-frontmatter.parse` (raw `.strip()` at entry, body `.strip()` at exit). Date / tags coercion mirrors `vault.py:_coerce_date` and the `vault.py:99-105` tag handling exactly. Sentence-aware quote extraction reproduces every regex (markdown noise, sentence boundary, conclusion openers, negation+assertion) and every weight in SPEC.md §2.4 byte-for-byte. CRLF/CR are normalized to LF in the parser to match Python's `Path.read_text` universal-newlines behavior — without this, `content_hash` diverges on Windows checkouts where `.gitattributes` `eol=lf` produces CRLF working trees. Tests: 58 unit tests across the three parser modules, plus 226 parity tests (24 sample-14 + 200 large-200 = 224 file-level diffs + 2 fixture-level invariants) that diff TS output against Python `parse_note` for every fixture file. **Zero parser disagreements** at this commit. Baseline JSON is generated by `scripts/generate-parser-baseline.py` and committed under `tests/parity/baseline/parser-{sample-14,large-200}.json`. Decisions documented in `docs/parsing-decisions.md` (D-1 wikilinks-in-code-blocks intentionally count, D-2 body whitespace stripped, D-3 universal newline normalization, D-4 js-yaml DEFAULT_SCHEMA matches PyYAML, D-5 tag coercion semantics, D-6 word-count semantics, D-7 SHA-256 UTF-8 hex, D-8 sentence-extraction regex/weight provenance).
- [TASK-1.1] Scaffold `@basalt/core`. Wires the runtime-agnostic engine package per PRD §3.2: tsconfig extending the base with `outDir: dist/`, `package.json` with sub-path exports (`@basalt/core/{adapters,parser,graph,math,verbs,brief,promote,audit}`), runtime deps (unified, remark-parse, remark-frontmatter, remark-wiki-link, graphology, graphology-traversal, graphology-communities-louvain, mdast-util-to-string, js-yaml). Stubs every file in the §3.2 internal layout: types (Brief, Finding union, Note, Link, Embedding, EngineOptions), per-verb Finding shapes mirroring SPEC.md §5–9, four adapter interfaces (Storage, Embedding, Filesystem, AI) — Filesystem's `createNoteFile` documented as the only mutation primitive, strictly create-only — plus parser/graph/math/verb/brief/promote/audit module stubs. Each stub throws `not yet implemented` with a TASK-1.X reference. Build (`tsc -p tsconfig.json`) produces `dist/index.{js,d.ts}` cleanly; gauntlet green.

### Changed
- Phase ordering re-aligned with PRD §7. PHASE-1.md and PHASE-2.md previously described "Core Engine + CLI" / "MCP Server + Obsidian Plugin", contradicting the PRD's wedge-first surface order (`Phase 1: core + plugin`, `Phase 2: CLI + MCP`). Rewritten to match the PRD: PHASE-1.md is now "Core Engine + Obsidian Plugin (the wedge)" with 19 tasks (core scaffold + parser + graph + storage primitives + engine + 5 verb ports + brief composition + promote-to-note + plugin scaffold/adapters/UI/distribution); PHASE-2.md is now "CLI + MCP Server (credibility)" with 7 tasks (CLI scaffold + adapters + commands + binary builds + MCP scaffold + multi-vault + Claude Desktop integration). Cross-reference in PHASE-5.md updated. PRD wins on architecture and product per CLAUDE.md §1.

## v0.0.1 — 2026-05-09

### Added
- [TASK-0.1] Initialize monorepo: Bun workspaces, strict TypeScript config, Biome formatter+linter, MIT license, gitignore, README, and 10 placeholder package skeletons under `packages/` (core, cli, obsidian-plugin, mcp, api, web, desktop, site, docs, ui). Skeletons for `tests/parity/`, `tests/e2e/`, and `scripts/generate-baseline.sh`.
- [TASK-0.2] Wire CI: `.github/workflows/ci.yml` with five jobs (lint, format, typecheck, test, parity) running on push to `main` and on PRs. PR template at `.github/pull_request_template.md` enforces the Definition of Done checklist, references the task spec, and surfaces verb/perf/schema-specific gates when relevant.
- [TASK-0.3] Add `reference/` git submodule pinned at the Python implementation's `v0.0.11` tag (commit `42d340c`). Extract the algorithmic contract for all five verbs (Implicit Thesis, Contradiction, Drift, Connection, Buried Insight) plus shared primitives (vault parser, link graph, embedding pipeline, hub-density, load-bearing quote extraction) and the calibration layer into `SPEC.md`. Every threshold and regex is referenced back to a Python source line at the pinned tag. JSON output examples land in `tests/parity/baseline/` in TASK-0.4.
- [TASK-0.4] Set up parity test fixtures and frozen JSON baselines. `tests/parity/fixtures/sample-vault-14/` holds 24 hand-written notes copied from `reference/examples/sample-vault/` (PRD's "14-note" name preserved for test-stability). `scripts/generate-test-vault.ts` produces the 200-note `test-vault-large/` deterministically from a mulberry32-seeded PRNG. `scripts/generate-baseline.sh` rebuilds both fixtures' SQLite indexes via the Python CLI and writes 12 JSON baselines (one per fixture × {brief, buried, connection, contradiction, thesis, drift}) into `tests/parity/baseline/`. `tests/parity/README.md` documents the regeneration workflow, prerequisites (Python venv at `.venv-reference/`, Ollama at `localhost:11434` with `nomic-embed-text`), and the tolerance contract from PRD §8.1.
- [TASK-0.5] Add Vitest 4.1 + the parity-test scaffolding. `vitest.config.ts` discovers `tests/**/*.test.ts` and per-package `*.test.ts`/`__tests__/*` files. `tests/parity/utils.ts` exports `loadBaseline`, `compareFindings`, `compareBrief`, `findingKey`, `nearlyEqual` plus minimal Brief/Finding TS interfaces mirroring SPEC.md. `tests/parity/utils.test.ts` covers each helper (26 tests). `tests/parity/ts.test.ts` is the placeholder Phase-1 entry point — loads + schema-validates every committed baseline (24 tests), with the TS-engine-vs-baseline path commented out until `@basalt/core` lands. 50 tests total, all green via `bun run test` (`vitest run`).
- [TASK-0.6] Release tooling. `scripts/release.sh` drives phase-boundary releases: pre-flight (clean tree, on `main`, in sync with `origin`, tag uniqueness, valid version arg), full gauntlet (`biome ci`, `tsc --noEmit`, `vitest run`, parity-baseline JSON validation), `package.json` version bump, `CHANGELOG.md` `## Unreleased` → versioned heading promotion, annotated tag with the changelog excerpt as the tag message, and `main` + tag push. `--dry-run` mode previews every step without writing. README adds a "Releasing" section.
