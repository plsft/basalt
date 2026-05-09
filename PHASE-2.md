# Phase 2 — MCP Server + Obsidian Plugin

> **Goal:** Ship two new surfaces over the same `@basalt/core` engine: an MCP server (replacing Fernando's Python MCP) and an Obsidian community plugin (the distribution wedge into non-technical users).
>
> **Target tag:** `v0.2.0`
>
> **Estimated duration:** 4–6 weeks

Both surfaces are thin views over the engine. The discipline from PRD §3 stands: no surface forks behavior, no surface adds a verb the others can't run, no surface modifies the user's vault.

---

## TASK-2.1 — Scaffold `@basalt/mcp`

**Spec:**
- Set up `packages/mcp/` with TypeScript + Bun build
- Install `@modelcontextprotocol/sdk` (Anthropic's TS SDK)
- Reuse `@basalt/core` plus the same adapters as CLI (`fs-node`, `embedding-ollama`, `storage-sqlite`)
- Create `src/index.ts` entry point that initializes the MCP server
- Create `src/tools.ts` with tool definitions for: `basalt_brief`, `basalt_connection`, `basalt_contradiction`, `basalt_drift`, `basalt_audit`
- Each tool's input/output schema is declared via Zod and converted to JSON Schema for the MCP protocol
- Configure `package.json` `bin` field for `npm install -g`
- Configure `bun build --compile` for single-binary distribution

**Files created:**
```
packages/mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # MCP server boot
│   ├── tools.ts                 # tool registrations
│   ├── tools/
│   │   ├── brief.ts
│   │   ├── connection.ts
│   │   ├── contradiction.ts
│   │   ├── drift.ts
│   │   └── audit.ts
│   └── config.ts                # config from CLI's config.toml or env
└── README.md
```

**Tests:**
- Unit: each tool's input schema validates expected inputs
- Unit: each tool's output matches Engine output with the right shape
- Integration: spawn the MCP server, send `initialize` and `tools/list` JSON-RPC calls, verify response
- Integration: spawn the MCP server, call each tool against `tests/parity/fixtures/sample-vault-14/`, verify output structure

**Definition of Done:** Standard DoD.

**Notes:**
- Verify against Anthropic's MCP spec for protocol version compatibility — pin in `package.json`.

---

## TASK-2.2 — MCP server: vault context + multi-vault handling

**Spec:**
- Vault path can be supplied three ways, in priority order:
  1. CLI args at server startup (`basalt-mcp --vault /path/to/vault`)
  2. Tool input parameter on each call (`basalt_brief({ vault: "..." })`)
  3. Default from `~/.basalt/config.toml`
- If multiple vaults are configured, tools accept a `vault_id` parameter; `tools/list` advertises configured vault IDs
- Calls without a resolved vault path return a structured error (not an exception) with guidance
- Index database is read-only when reached via MCP; write paths (e.g. `audit` updating finding statuses) are explicit and gated behind a `--allow-write` server flag

**Files modified:**
```
packages/mcp/src/index.ts
packages/mcp/src/config.ts
packages/mcp/src/tools/*.ts
```

**Tests:**
- Unit: resolution priority logic
- Integration: spawn MCP server with no vault config, verify graceful error
- Integration: spawn MCP server with multiple vaults, verify vault_id routing
- Integration: verify `--allow-write` is required for `audit` to mutate finding state

**Definition of Done:** Standard DoD.

---

## TASK-2.3 — MCP server: Claude Desktop integration smoke test

**Spec:**
- Document the Claude Desktop config snippet in `packages/mcp/README.md`:
  ```json
  {
    "mcpServers": {
      "basalt": {
        "command": "basalt-mcp",
        "args": ["--vault", "/path/to/vault"]
      }
    }
  }
  ```
- Manual test: install MCP server globally, configure Claude Desktop, ask Claude "run a Basalt brief on my vault" and verify all five tools resolve
- Capture screenshots/transcript for the docs site (Phase 5 will reference these)
- Add `examples/claude-desktop-config.json` and `examples/cursor-config.json` (Cursor MCP integration if available)

**Files created:**
```
packages/mcp/README.md
packages/mcp/examples/{claude-desktop-config,cursor-config}.json
docs/integration-screenshots/    # for Phase 5 docs site
```

**Tests:**
- Manual smoke test in Claude Desktop documented in PR description
- Manual smoke test in Cursor (if MCP supported in current Cursor version)

**Definition of Done:** Standard DoD + at least one manual integration verified end-to-end.

---

## TASK-2.4 — Scaffold `@basalt/obsidian-plugin`

**Spec:**
- Set up `packages/obsidian-plugin/` with TypeScript + esbuild
- Use Obsidian's official sample plugin template as a starting point
- Install `obsidian` types as devDependency
- Create `manifest.json`:
  ```json
  {
    "id": "basalt",
    "name": "Basalt",
    "version": "0.2.0",
    "minAppVersion": "1.6.0",
    "description": "A weekly Brief compiled from your notes. Reads what you've written and surfaces what you believe but never wrote down.",
    "author": "Basalt",
    "authorUrl": "https://basalt.<domain>",
    "isDesktopOnly": false
  }
  ```
- Configure esbuild to produce `main.js` + `styles.css` per Obsidian plugin convention
- Create `src/main.ts` extending Obsidian's `Plugin` class with empty stubs for `onload`/`onunload`

**Files created:**
```
packages/obsidian-plugin/
├── package.json
├── tsconfig.json
├── manifest.json
├── esbuild.config.mjs
├── src/
│   ├── main.ts                  # Plugin class
│   ├── adapters/
│   │   ├── fs-obsidian.ts       # Vault API adapter
│   │   ├── storage-sqljs.ts     # sql.js adapter
│   │   └── embedding-ollama.ts  # reused HTTP client
│   ├── views/
│   │   └── BriefView.ts         # custom view
│   ├── settings.ts              # settings tab
│   └── i18n/en.json
├── styles.css
└── README.md
```

**Tests:**
- esbuild produces `main.js` and `styles.css`
- Plugin loads in a test Obsidian vault without errors (manual smoke test)

**Definition of Done:** Standard DoD.

---

## TASK-2.5 — Implement Obsidian Vault adapter (filesystem)

**Spec:**
- Implement `src/adapters/fs-obsidian.ts`:
  - Use Obsidian's `Vault` API to walk and read markdown files
  - Convert Obsidian's relative paths to canonical absolute paths for citations
  - Respect Obsidian's `.obsidian/` and any user-configured ignore patterns
  - Implement the `FilesystemAdapter` interface from `@basalt/core`
- Use `MetadataCache` for fast frontmatter access where possible (perf optimization)

**Files created:**
```
packages/obsidian-plugin/src/adapters/fs-obsidian.ts
packages/obsidian-plugin/src/adapters/fs-obsidian.test.ts  # unit tests with mock Vault
```

**Tests:**
- Unit: walk produces expected file list given a mock Vault
- Unit: readFile returns content given a mock TFile
- Integration: against a real Obsidian instance with the sample-vault-14 fixture, walk and read produce identical bytes to fs-node adapter

**Definition of Done:** Standard DoD.

---

## TASK-2.6 — Implement sql.js storage adapter for Obsidian sandbox

**Spec:**
- Implement `src/adapters/storage-sqljs.ts`:
  - Wrap `sql.js` (SQLite compiled to WASM) since `better-sqlite3` requires native modules unavailable in Obsidian
  - Database file at `<vault>/.basalt/basalt.db`
  - Persist via Obsidian's `Vault.adapter.writeBinary` for the underlying file
  - Same schema and migrations as `storage-sqlite.ts` from CLI (single source of truth in `packages/core/src/migrations/` to avoid drift)
- Benchmark on a 10,000-note vault: indexing must complete in < 5 minutes; querying < 1 second per verb

**Files created:**
```
packages/obsidian-plugin/src/adapters/storage-sqljs.ts
packages/obsidian-plugin/src/adapters/storage-sqljs.test.ts
packages/core/src/migrations/                # moved from cli; single source
```

**Tests:**
- Unit: round-trip writes/reads against an in-memory sql.js instance
- Performance bench: 10,000-note synthetic vault, full index in < 5 min, full Brief in < 5s
- If perf budget is missed, document fallback plan in PR (flat IndexedDB store with batched writes per PRD §9 risks)

**Definition of Done:** Standard DoD + perf budget met OR documented fallback.

**Notes:**
- This is the highest-risk technical task in Phase 2. If sql.js is too slow, the fallback is a leaner persistence layer; that's a follow-up task, not a blocker for this one. Document the choice in `docs/parsing-decisions.md` or a new `docs/storage-decisions.md`.

---

## TASK-2.7 — Implement BriefView + ribbon + status bar

**Spec:**
- Implement `src/views/BriefView.ts`:
  - Extends Obsidian's `ItemView`
  - Renders the latest Brief using `@basalt/core`'s render pipeline
  - Click handlers on findings: Promote, Snooze, Dismiss
  - "Open citation" links navigate to source notes via `app.workspace.openLinkText(...)`
- Add ribbon icon: small Na-tile SVG in `styles.css`, click triggers Generate Brief
- Add status bar item: shows indexing progress during background indexing
- All UI strings in `src/i18n/en.json`

**Files created/modified:**
```
packages/obsidian-plugin/src/views/BriefView.ts
packages/obsidian-plugin/src/main.ts                # register view, ribbon, status bar
packages/obsidian-plugin/styles.css                  # Na-tile, brand colors
packages/obsidian-plugin/src/i18n/en.json
```

**Tests:**
- Unit: BriefView renders given a mock Brief object
- Integration (manual): plugin loads, ribbon icon visible, click triggers brief generation against a real vault, BriefView opens with output
- Visual snapshot test: BriefView matches expected DOM structure for a fixture Brief

**Definition of Done:** Standard DoD + manual smoke test recorded in PR.

---

## TASK-2.8 — Implement Settings tab

**Spec:**
- Implement `src/settings.ts`:
  - Vault path (default: current vault, override with secondary vault path)
  - Ollama URL (default: `http://localhost:11434`)
  - Embedding model selection (dropdown: `nomic-embed-text`, `bge-m3`, custom)
  - BYOK provider keys (encrypted at rest using Obsidian's settings storage; document the limitation that this is not OS keychain on this surface)
  - Brief cadence (manual / weekly auto on a schedule)
  - Privacy preferences (opt out of any non-essential network calls — should already be true by default)
- All settings persist via Obsidian's `loadData`/`saveData`

**Files created:**
```
packages/obsidian-plugin/src/settings.ts
packages/obsidian-plugin/src/settings.test.ts
```

**Tests:**
- Unit: settings save/load round-trip preserves all fields
- Unit: invalid Ollama URL produces validation error
- Integration: settings UI renders and edits persist across plugin reload

**Definition of Done:** Standard DoD.

---

## TASK-2.9 — Implement weekly brief scheduling (in-plugin)

**Spec:**
- If user enables auto-cadence in settings, schedule a weekly brief via Obsidian's `setInterval`-equivalent
- Schedule is best-effort (Obsidian must be running); document limitation
- On trigger: run index (if vault has changed since last index) → run brief → notify user via Obsidian Notice + status bar update
- Allow manual override at any time via the ribbon

**Files modified:**
```
packages/obsidian-plugin/src/main.ts
```

**Tests:**
- Unit: scheduling logic with mocked time
- Integration (manual): set cadence to 60 seconds for testing, verify brief generates automatically

**Definition of Done:** Standard DoD.

---

## TASK-2.10 — Plugin packaging + community marketplace submission

**Spec:**
- Configure release script for the plugin:
  - Tag-driven release builds `main.js`, `manifest.json`, `styles.css` into a release artifact
  - Push to a `obsidian-releases` PR (separate from the monorepo's tag releases — Obsidian community releases are GitHub-release-driven)
- Open the community submission PR to `obsidianmd/obsidian-releases` per Obsidian's community plugin guidelines
- Set up the plugin's own GitHub repo or subdirectory release path that Obsidian's plugin browser can resolve
- Document installation instructions in `packages/obsidian-plugin/README.md`

**Files created/modified:**
```
.github/workflows/release-obsidian.yml
packages/obsidian-plugin/README.md
```

**Tests:**
- Tag a pre-release, verify the GitHub release contains the expected three artifacts
- Manual: install the plugin from the GitHub release URL via Obsidian's "Install from URL" beta channel

**Definition of Done:** Standard DoD + plugin installable via Obsidian's BRAT (Beta Reviewers Auto-update Tool) for testing before community marketplace approval.

**Notes:**
- The Obsidian community marketplace submission can take 1–4 weeks to be reviewed/merged. Begin the submission as part of this task; the marketplace listing itself is gating only for public launch, not for `v0.2.0` tag.

---

## Phase 2 Exit Criteria

- [ ] All TASK-2.* merged
- [ ] MCP server installable globally and integrates with Claude Desktop end-to-end
- [ ] Obsidian plugin installable via BRAT and produces correct Briefs
- [ ] sql.js perf budget met on 10k-note vault
- [ ] No surface modifies the user's `.md` files (verified by tests)
- [ ] Community marketplace submission opened (review pending is OK)
- [ ] `scripts/release.sh --dry-run v0.2.0` clean

When all checked, tag `v0.2.0`. Phase 3 begins.
