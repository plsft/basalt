# Phase 2 — CLI + MCP Server (credibility)

> **Goal:** Ship the credibility surfaces over the same `@basalt/core` engine validated in Phase 1: a Bun-compiled CLI for the HN/Show HN/dev-tools audience, and an MCP server distributed into Claude Desktop / Cursor / Cline / Zed / VS Code Copilot.
>
> **Target tag:** `v0.2.0`
>
> **Estimated duration:** 4–6 weeks

Both surfaces are thin views over the engine. The discipline from PRD §3 stands: no surface forks behavior, no surface adds a verb the others can't run, no surface modifies the user's vault. The schema written by the CLI's SQLite adapter is byte-compatible with both the Python reference (so existing Python users can swap CLIs without re-indexing) and the plugin's sql.js adapter (so a vault indexed by one surface is queryable by the other).

Sequencing rationale (PRD §7): credibility surfaces follow the wedge. Phase 1 put Basalt in front of the audience that has the pain (Obsidian users); Phase 2 wins the dev-tooling audience and the AI-tool integration audience without forking the engine.

---

## TASK-2.1 — Scaffold `@basalt/cli`

**Spec:**
- Set up `packages/cli/` with TypeScript + Bun build
- Install `commander` (or use Bun's argv parsing) for command parsing
- Install `@iarna/toml` for config file parsing
- Install `env-paths` for cross-platform config paths
- Create `src/index.ts` entry point
- Create `src/commands/` with stubs for each command listed in PRD §4.2:
  - `init`, `index`, `brief`, `thesis`, `drift`, `connection`, `contradiction`, `buried`, `promote`, `audit`, `demo`, `about`
- Create `src/config.ts` for `~/.basalt/config.toml` reading/writing
- Configure `bun build --compile` to produce single-binary output for current platform
- Configure `package.json` `bin` field for `npm install -g`

**Files created:**
```
packages/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── commands/{init,index,brief,thesis,drift,connection,contradiction,buried,promote,audit,demo,about}.ts
│   └── adapters/                # populated in TASK-2.2
├── bin/                         # output dir for compiled binaries
└── README.md
```

**Tests:**
- `bun run --cwd packages/cli build` produces `dist/index.js`
- `bun run --cwd packages/cli compile` produces `bin/basalt-<platform>`
- `bin/basalt --help` outputs the command list
- `bin/basalt about` outputs version + schema info

**Definition of Done:** Standard DoD.

---

## TASK-2.2 — Implement CLI adapters (fs-node + better-sqlite3)

**Spec:**
- Implement `src/adapters/fs-node.ts` (CLI's `FilesystemAdapter` using `fs/promises`)
  - Implement `createNoteFile(path, content)` strictly create-only — reject if target exists; do not modify any existing `.md` file. Architectural test required (mirrors TASK-1.14's plugin-side test).
- Implement `src/adapters/storage-sqlite.ts` using `better-sqlite3`:
  - Migrations sourced from `packages/core/src/migrations/` (single source of truth shared with the plugin's sql.js adapter)
  - Embedding column stores Float32Array as binary blob (per SPEC.md §2.1)
  - WAL mode enabled for concurrency
  - Indexes on `rel_path`, `updated`, `created` (per the canonical schema)
- The CLI re-exports `embedding-ollama` from `@basalt/core` (defined in TASK-1.4); no new embedding adapter needed

**Files created:**
```
packages/cli/src/adapters/{fs-node,storage-sqlite}.ts
packages/cli/src/adapters/{fs-node,storage-sqlite}.test.ts
```

**Tests:**
- Unit: fs-node walks a fixture directory, returns expected file list and bytes
- Unit: createNoteFile creates a new file when target doesn't exist; refuses with a typed error when it does
- Architectural: greps `fs-node.ts` source for forbidden write APIs (`fs.rename`, `fs.unlink`, `fs.rm`, `fs.rmdir`, file-deletion shells); presence of any of these fails the build (CLAUDE.md §5)
- Unit: storage-sqlite round-trips notes, embeddings, findings; respects schema constraints
- Integration: full index pipeline (walk → parse → embed-mock → persist) on sample-vault-14 produces the expected number of records
- Parity: storage-sqlite schema is byte-compatible with Python's `~/.basalt/basalt.db` schema (DDL string comparison; Python users must be able to swap CLIs without re-indexing)

**Definition of Done:** Standard DoD.

---

## TASK-2.3 — Implement CLI commands

**Spec:**
- Implement each command in `src/commands/`:
  - `init`: interactive prompts via `@inquirer/prompts`, writes config
  - `index`: progress reporting via stderr, writes index DB
  - `brief`: runs Engine.brief, renders to stdout (Markdown by default; `--format json` for JSON; `--format html` available)
  - `thesis | drift | connection | contradiction | buried`: convenience wrappers around `brief --section X`
  - `promote <finding-id> [--out PATH]`: renders the promoted note via `@basalt/core/promote` and writes via `fs-node.createNoteFile` (refuses to overwrite)
  - `audit`: runs Engine.audit, prints calibration summary
  - `demo`: runs against bundled `tests/parity/fixtures/sample-vault-14/`
  - `about`: ASCII periodic-table animation (small Na tile rendering) + version + schema

**Files modified:**
```
packages/cli/src/commands/*.ts
```

**Tests:**
- Integration: each command runs against sample-vault-14 and produces expected output
- Snapshot test: `basalt brief --section all --format json` output equals the parity baseline `tests/parity/baseline/sample-14-brief.json`
- Integration: `basalt init` walks through prompts and produces a valid config (driven by stdin fixture)
- Integration: `basalt demo` produces output without requiring user config
- Integration: `basalt promote <id>` creates a new file under the configured promote folder; running it twice on the same finding errors with "target exists" (does not overwrite)

**Definition of Done:** Standard DoD + `bin/basalt brief` on a real vault works end-to-end.

---

## TASK-2.4 — Cross-platform binary builds + npm publish prep

**Spec:**
- Configure GitHub Actions release workflow `.github/workflows/release-cli.yml`:
  - Trigger: tag push matching `v0.*.*`
  - Build single-binary for macOS (x64, arm64), Linux (x64, arm64), Windows (x64) via `bun build --compile --target=…`
  - Upload binaries to GitHub release as assets
- Configure npm publish:
  - `npm publish --access public` from CI on tag push
  - Publish `@basalt/cli` (verify the scope is registered or claim it; collision check per PRD §10 #2 / brand collision risk in §9)
  - Document install paths in `packages/cli/README.md` and root `README.md`

**Files created/modified:**
```
.github/workflows/release-cli.yml
packages/cli/README.md
README.md                         # Install section
```

**Tests:**
- Tag a pre-release `v0.2.0-rc1` and verify CI produces all expected binaries
- Manual: `npm install -g @basalt/cli` on a fresh machine works
- Manual: download a Linux binary and run on a test VM
- Manual: confirm Python-CLI users can point the TS CLI at their existing `~/.basalt/basalt.db` and `basalt brief` works without re-indexing (schema-compat smoke test)

**Definition of Done:** Standard DoD + a successful pre-release run.

---

## TASK-2.5 — Scaffold `@basalt/mcp`

**Spec:**
- Set up `packages/mcp/` with TypeScript + Bun build
- Install `@modelcontextprotocol/sdk` (Anthropic's TS SDK)
- Reuse `@basalt/core` plus the same adapters as the CLI (`fs-node`, `embedding-ollama`, `storage-sqlite`)
- Create `src/index.ts` entry point that initializes the MCP server
- Create `src/tools.ts` with tool definitions for: `basalt_brief`, `basalt_connection`, `basalt_contradiction`, `basalt_drift`, `basalt_audit`
- **Promote-to-note is intentionally NOT exposed via MCP** (PRD §4.3) — file creation belongs to a surface where the user can see the result, not a tool that returns text to a chat.
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

## TASK-2.6 — MCP server: vault context + multi-vault handling

**Spec:**
- Vault path can be supplied three ways, in priority order:
  1. CLI args at server startup (`basalt-mcp --vault /path/to/vault`)
  2. Tool input parameter on each call (`basalt_brief({ vault: "..." })`)
  3. Default from `~/.basalt/config.toml` (the same config the CLI uses)
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

## TASK-2.7 — MCP server: Claude Desktop integration smoke test + npm publish

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
- Configure npm publish for `@basalt/mcp` (added to the same release workflow as the CLI in TASK-2.4)

**Files created:**
```
packages/mcp/README.md
packages/mcp/examples/{claude-desktop-config,cursor-config}.json
docs/integration-screenshots/    # for Phase 5 docs site
.github/workflows/release-cli.yml  # extended to also publish @basalt/mcp
```

**Tests:**
- Manual smoke test in Claude Desktop documented in PR description
- Manual smoke test in Cursor (if MCP supported in current Cursor version)

**Definition of Done:** Standard DoD + at least one manual integration verified end-to-end.

---

## Phase 2 Exit Criteria

- [ ] All TASK-2.* merged
- [ ] CLI installable via `npm install -g @basalt/cli` and as a single binary
- [ ] CLI's `basalt promote` creates new files only — no path overwrites or modifies an existing file (architectural test passes)
- [ ] CLI schema is byte-compatible with Python's; Python users can swap to the TS CLI without re-indexing
- [ ] MCP server installable globally and integrates with Claude Desktop end-to-end
- [ ] Promote-to-note remains absent from MCP (intentional per PRD §4.3)
- [ ] No surface modifies the user's `.md` files (verified by tests in TASK-2.2 architectural grep)
- [ ] Performance budgets met (PRD §6.4: engine index + brief on 1k vault)
- [ ] CHANGELOG documents the cutover from the Python CLI to the TS CLI and the migration story
- [ ] `scripts/release.sh --dry-run v0.2.0` produces a clean preview

When all checked, tag `v0.2.0`. Phase 3 (cloud API + web cockpit) begins.
