# Phase 1 — Core Engine + CLI

> **Goal:** Build `@basalt/core` with all five verbs at parity with the Python reference. Wrap in `@basalt/cli`. Cut over the open-source CLI artifact from Python to TypeScript.
>
> **Target tag:** `v0.1.0`
>
> **Estimated duration:** 8–10 weeks

This is the most algorithmically dense phase. Tasks 1.3 through 1.10 port the verbs one at a time, with parity tests gating each. **Do not move to Phase 2 until every parity test passes.**

---

## TASK-1.1 — Scaffold `@basalt/core`

**Spec:**
- Set up `packages/core/` with TypeScript build config
- Install runtime dependencies: `unified`, `remark-parse`, `remark-frontmatter`, `remark-wiki-link`, `graphology`, `graphology-traversal`, `graphology-communities-louvain`, `mdast-util-to-string`
- Install dev dependencies: `vitest`, `@types/node`
- Create `src/index.ts` with empty re-exports
- Create empty stubs for all files in PRD §3.2 internal layout
- Configure `package.json` `exports` field for proper ESM
- Configure build via `tsup` or `tsc` directly to produce `dist/`
- Add npm scripts: `build`, `test`, `test:watch`, `dev`

**Files created:**
```
packages/core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── engine.ts                # stub
│   ├── types.ts                 # initial type definitions
│   ├── adapters/{index,storage,embedding,filesystem,ai}.ts  # interface stubs
│   ├── parser/{markdown,sentences,frontmatter}.ts  # stubs
│   ├── graph/{builder,cliques,hub-penalty}.ts  # stubs
│   ├── math/{cosine,vector,thresholds}.ts  # stubs
│   ├── verbs/{index,types,thesis,contradiction,drift,connection,buried}.ts  # stubs
│   ├── brief/{compose,render}.ts  # stubs
│   └── audit/calibration.ts  # stub
└── README.md
```

**Tests:**
- `bun run --cwd packages/core build` produces `dist/index.js` and `dist/index.d.ts`
- `bun run --cwd packages/core test` passes (no real tests yet, just verifies Vitest runs)
- Empty re-exports are syntactically valid

**Definition of Done:** Standard DoD.

---

## TASK-1.2 — Implement vault parser + parity stress test

**Spec:**

This is the parser-disagreement risk from PRD §9. Land it early.

- Implement `src/parser/markdown.ts`:
  - Parse a markdown file into an AST via `unified` + `remark-parse` + `remark-frontmatter` + `remark-wiki-link`
  - Extract: frontmatter, plain text body, outgoing wiki-links, code-block content (escaped from quote extraction)
  - Return a `ParsedNote` object matching `SPEC.md`
- Implement `src/parser/frontmatter.ts`:
  - YAML frontmatter parsing via `js-yaml`
  - Type coercion to match Python's PyYAML behavior on edge cases
- Implement `src/parser/sentences.ts`:
  - Sentence segmentation (consider `sentence-splitter` library or hand-rolled)
  - Load-bearing sentence selection per `SPEC.md` rules (em-dash, negation, conclusion-opener preference; cliffhanger refusal)
- Build a parser-parity test:
  - For every `.md` file in both fixtures (sample-14, large-200), parse with both Python and TS
  - Diff the parsed structure
  - Document every disagreement in `docs/parsing-decisions.md`
  - Resolve each: either align TS to Python, or align Python to TS (with Fernando), or accept a known-divergence with rationale

**Files created:**
```
packages/core/src/parser/{markdown,frontmatter,sentences}.ts
packages/core/src/parser/{markdown,frontmatter,sentences}.test.ts
docs/parsing-decisions.md
tests/parity/parser.test.ts        # parser-only parity
```

**Tests:**
- Unit tests for each parser module with handcrafted cases:
  - Empty file
  - Frontmatter only
  - Body only
  - Code blocks containing wiki-link-looking syntax (must not parse as links)
  - Nested blockquotes
  - Mixed list types
  - Obsidian callouts (`> [!info]`)
  - Multi-line wiki-links
- Parity test: every `.md` in fixtures parses to the same structure as Python (modulo documented divergences)
- Sentence segmentation test: 50 hand-curated sentences covering em-dash, semicolons, abbreviations, ellipses, quotations

**Definition of Done:** Standard DoD + `docs/parsing-decisions.md` reviewed by George + zero undocumented parser disagreements.

**Notes:**
- Plan to spend 3–5 days here. Parser disagreements compound through every verb. Do not paper over them.

---

## TASK-1.3 — Implement vault walker + link graph builder

**Spec:**
- Implement `FilesystemAdapter` interface (already declared in TASK-1.1; flesh out)
- Implement `fs-node.ts` adapter (CLI/MCP). Lives in `packages/cli/src/adapters/` (not core — keep core runtime-agnostic)
- Implement `src/graph/builder.ts`:
  - Walk vault via FilesystemAdapter
  - Parse each note via parser
  - Build a directed link graph using `graphology`
  - Resolve wiki-links to actual notes by name (handling case-sensitivity, aliases, ambiguity per Python reference)
- Implement `src/graph/hub-penalty.ts`:
  - Calculate per-note outgoing-link-density (per 100 words)
  - Hard-exclude notes >1.5
  - Soft-penalize 0.5–1.5 (returns a penalty multiplier in `[0, 1]`)

**Files created:**
```
packages/core/src/graph/{builder,hub-penalty}.ts
packages/core/src/graph/{builder,hub-penalty}.test.ts
packages/cli/src/adapters/fs-node.ts
```

**Tests:**
- Unit: graph builder with synthetic 5-note vault verifies link resolution, ambiguity handling, broken links
- Unit: hub-penalty with synthetic notes at known link densities returns expected scores
- Parity: link graph built from sample-vault-14 matches Python's link graph (node IDs + edges as a sorted set)
- Parity: hub-penalty scores within ε=1e-5 of Python output for every note

**Definition of Done:** Standard DoD.

---

## TASK-1.4 — Implement embedding adapter + storage adapter (SQLite)

**Spec:**
- Implement `EmbeddingAdapter` interface (declared; flesh out)
- Implement `embedding-ollama.ts` (lives in `packages/cli/src/adapters/`):
  - Ollama HTTP client (`fetch` against `localhost:11434`)
  - Batch embedding requests (configurable batch size, default 32)
  - Health check method
  - Error handling for Ollama not running (clear message, exit code 2)
- Implement `embedding-mock.ts` for deterministic tests (in `packages/core/src/adapters/`)
- Implement `StorageAdapter` interface (declared; flesh out)
- Implement `storage-sqlite.ts` (in `packages/cli/src/adapters/`) using `better-sqlite3`:
  - Schema: `notes`, `embeddings`, `links`, `findings`
  - Migrations versioned and forward-only
  - Embedding column stores Float32Array as binary blob
  - WAL mode enabled for concurrency
  - Indexes on `path`, `mtime`, `vault_id`

**Files created:**
```
packages/core/src/adapters/embedding-mock.ts
packages/cli/src/adapters/embedding-ollama.ts
packages/cli/src/adapters/storage-sqlite.ts
packages/cli/src/adapters/storage-sqlite.migrations/{001-init,002-…}.sql
```

**Tests:**
- Unit: embedding-mock returns deterministic vectors for the same input
- Unit: embedding-ollama uses fetch mocking to verify request format, batching, error handling
- Unit: storage-sqlite round-trips notes, embeddings, findings; respects schema constraints
- Integration: full index pipeline (walk → parse → embed-mock → persist) on sample-vault-14 produces the expected number of records
- Parity: storage-sqlite schema matches Python's `~/.basalt/basalt.db` schema (table names, columns, types)

**Definition of Done:** Standard DoD.

**Notes:**
- The schema must be byte-compatible with Python's so users can swap CLIs. If it's not, document the migration tool path in PRD §10 open decisions.

---

## TASK-1.5 — Implement the Engine orchestrator

**Spec:**
- Implement `src/engine.ts`:
  - `Engine.create(opts)` static constructor takes adapters, validates, returns instance
  - `engine.index({ vault, force? })` — full or incremental index pipeline
  - `engine.brief({ section?, top? })` — orchestrates verb execution + composition
  - `engine.audit()` — re-runs calibration on past findings
  - Lifecycle hooks: `onProgress`, `onError` for surface-side reporting
- Implement `src/brief/compose.ts` and `src/brief/render.ts`:
  - Compose: take VerbResults, build a `Brief` object
  - Render: produce Markdown, HTML, or JSON variants
- Implement `src/audit/calibration.ts`:
  - For each persisted finding with status `pending`: re-evaluate against current vault
  - Update status: `proven`, `falsified`, `still-pending`
  - Output a calibration summary

**Files created:**
```
packages/core/src/engine.ts
packages/core/src/engine.test.ts
packages/core/src/brief/{compose,render}.ts
packages/core/src/brief/{compose,render}.test.ts
packages/core/src/audit/calibration.ts
packages/core/src/audit/calibration.test.ts
```

**Tests:**
- Unit: Engine.create validates adapter compatibility (throws on missing methods, dimension mismatches)
- Unit: index pipeline emits onProgress events at expected intervals
- Unit: brief composition assembles findings in the expected order
- Unit: render Markdown matches the expected output format (snapshot test against fixture)
- Unit: calibration correctly transitions finding states given mocked verb re-runs

**Definition of Done:** Standard DoD.

**Notes:**
- Verbs are not implemented yet (next 5 tasks). Engine.brief stubs verb calls behind a registry that's empty for now; tests use mock verbs.

---

## TASK-1.6 — Port verb: Buried Insight (Au)

**Spec:**

Port the Buried Insight verb from `reference/src/basalt/verbs/buried.py`, following SPEC.md.

- Implement `src/verbs/buried.ts` per SPEC.md
- Register in `src/verbs/index.ts`
- Vault-age-aware threshold derivation in `src/math/thresholds.ts` if not yet complete
- Parity test against `tests/parity/baseline/sample-14-buried.json` — must match exactly per PRD §8.1 tolerances

**Files created:**
```
packages/core/src/verbs/buried.ts
packages/core/src/verbs/buried.test.ts
packages/core/src/math/thresholds.ts (if not done)
```

**Tests:**
- Unit: synthetic vaults exercise dormancy threshold, citation count, hub-note exclusion
- Parity: exact match against `sample-14-buried.json` baseline
- Parity: exact match against `large-200-buried.json` baseline
- Edge: empty vault → empty result, no errors
- Edge: vault with one note → empty result (no citations possible)
- Performance: bench/buried.bench.ts records runtime for the 200-note fixture; budget < 500ms

**Definition of Done:** Standard DoD + parity tests green.

**Notes:**
- Buried is first because it's the simplest, sharpest, most-validated of the five verbs. Establish the porting pattern here.

---

## TASK-1.7 — Port verb: Connection (C)

**Spec:**
- Implement `src/verbs/connection.ts` per SPEC.md
- Cosine similarity threshold ≥ 0.78 (verify against SPEC.md)
- Cross-folder pair detection
- No-existing-wikilink filter
- Parity test against `tests/parity/baseline/sample-14-connection.json`

**Tests:**
- Unit: cross-folder pair detection
- Unit: similarity threshold edge cases (ε around 0.78)
- Parity: exact match on both fixtures
- Performance bench; budget < 1s on 200-note fixture (pairwise comparison)

**Definition of Done:** Standard DoD + parity tests green.

---

## TASK-1.8 — Port verb: Drift (Hg)

**Spec:**
- Implement `src/verbs/drift.ts` per SPEC.md
- Stated priority: project-folder note count over 30-day window
- Lived priority: daily-note mention count over same window
- Largest divergence detection
- Daily-note recognition (frontmatter `type: daily` or filename matching `YYYY-MM-DD` patterns — match Python exactly)
- Parity test against `tests/parity/baseline/sample-14-drift.json`

**Tests:**
- Unit: daily-note recognition heuristics
- Unit: divergence math
- Parity: exact match on both fixtures
- Edge: vault with no daily notes → empty result, no errors
- Edge: project folders with zero mentions → handled gracefully

**Definition of Done:** Standard DoD + parity tests green.

---

## TASK-1.9 — Port verb: Contradiction (Cl)

**Spec:**
- Implement `src/verbs/contradiction.ts` per SPEC.md (v0 heuristic)
- Same-topic pair detection (similarity-based)
- Asymmetric negation detection
- Reversal markers and polarity pairs (e.g. `ship`/`kill`, `works`/`broken`) — list lives in SPEC.md, mirror Python's exact word list
- Output: candidates, not verdicts (output structure includes `confidence: "candidate"`)
- Parity test against `tests/parity/baseline/sample-14-contradiction.json`

**Tests:**
- Unit: negation detection on hand-curated pairs (English negation patterns)
- Unit: polarity pair lookup
- Parity: exact match on both fixtures
- Edge: vaults with zero same-topic pairs → empty result

**Definition of Done:** Standard DoD + parity tests green.

---

## TASK-1.10 — Port verb: Implicit Thesis (Na)

**Spec:**
- Implement `src/verbs/thesis.ts` per SPEC.md (v0 cluster heuristic)
- Tight-neighborhood (near-clique) cluster detection over the embedding similarity graph
- Cluster size 3–15
- Centroid identification (most-central note in the cluster)
- Centroid load-bearing sentence as proxy thesis
- Parity test against `tests/parity/baseline/sample-14-thesis.json`

**Tests:**
- Unit: clique detection on synthetic graphs with known structure
- Unit: cluster-size filter
- Parity: exact match on both fixtures
- Edge: dense vaults producing many clusters → top-N filter works
- Edge: sparse vaults producing zero clusters → empty result
- Performance bench; budget < 2s on 200-note fixture (clique detection is the heaviest operation)

**Definition of Done:** Standard DoD + parity tests green.

---

## TASK-1.11 — Wire all verbs into Engine + brief composition

**Spec:**
- Register all five verbs in `src/verbs/index.ts`
- Implement `Engine.brief()` end-to-end: index → load → run all verbs → compose → render
- Verify the full Brief from `Engine.brief({ section: "all" })` matches `tests/parity/baseline/sample-14-brief.json` exactly

**Tests:**
- Integration: full Brief end-to-end matches `sample-14-brief.json`
- Integration: full Brief end-to-end matches `large-200-brief.json`
- Render snapshot tests for Markdown / HTML / JSON outputs

**Definition of Done:** Standard DoD + full-Brief parity tests green.

---

## TASK-1.12 — Scaffold `@basalt/cli`

**Spec:**
- Set up `packages/cli/` with TypeScript + Bun build
- Install `commander` (or use Bun's argv parsing) for command parsing
- Install `@iarna/toml` for config file parsing
- Install `env-paths` for cross-platform config paths
- Create `src/index.ts` entry point
- Create `src/commands/` with stubs for each command listed in PRD §4.1
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
│   ├── commands/{init,index,brief,thesis,drift,connection,contradiction,buried,audit,demo,about}.ts
│   └── adapters/{fs-node,embedding-ollama,storage-sqlite}.ts  # already created in earlier tasks
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

## TASK-1.13 — Implement CLI commands

**Spec:**
- Implement each command in `src/commands/`:
  - `init`: interactive prompts via `@inquirer/prompts`, writes config
  - `index`: progress reporting via stderr, writes index DB
  - `brief`: runs Engine.brief, renders to stdout (Markdown by default; `--json` flag for JSON)
  - `thesis | drift | connection | contradiction | buried`: convenience wrappers around `brief --section X`
  - `audit`: runs Engine.audit, prints calibration summary
  - `demo`: runs against bundled `tests/parity/fixtures/sample-vault-14/`
  - `about`: ASCII periodic-table animation (small Na tile rendering) + version + schema

**Files modified:**
```
packages/cli/src/commands/*.ts
```

**Tests:**
- Integration: each command runs against sample-vault-14 and produces expected output
- Snapshot test: `basalt brief --section all --json` output equals the parity baseline
- Integration: `basalt init` walks through prompts and produces a valid config (driven by stdin fixture)
- Integration: `basalt demo` produces output without requiring user config

**Definition of Done:** Standard DoD + `bin/basalt brief` on a real vault works end-to-end.

---

## TASK-1.14 — Cross-platform binary builds + npm publish prep

**Spec:**
- Configure GitHub Actions release workflow `.github/workflows/release.yml`:
  - Trigger: tag push matching `v0.*.*`
  - Build single-binary for macOS (x64, arm64), Linux (x64, arm64), Windows (x64) via `bun build --compile --target=…`
  - Upload binaries to GitHub release as assets
- Configure npm publish:
  - `npm publish --access public` from CI on tag push
  - Verify scope `@basalt` is registered or use unscoped `basalt` (collision check — see PRD §10)
- Document install paths in `README.md`

**Files created/modified:**
```
.github/workflows/release.yml
README.md                         # Install section
```

**Tests:**
- Tag a pre-release `v0.1.0-rc1` and verify CI produces all expected binaries
- Manual: `npm install -g basalt` (or `@basalt/cli`) on a fresh machine works
- Manual: download a Linux binary and run on a test VM

**Definition of Done:** Standard DoD + a successful pre-release run.

---

## Phase 1 Exit Criteria

Before tagging `v0.1.0`:

- [ ] All TASK-1.* merged
- [ ] All five verbs at parity with Python (exact match on baselines)
- [ ] Full Brief at parity with Python on both fixtures
- [ ] CLI installable via `npm install -g` and as a single binary
- [ ] Performance budgets met (PRD §6.4)
- [ ] CHANGELOG documents the cutover from Python CLI to TS CLI
- [ ] README updated with install instructions and migration note for existing Python CLI users
- [ ] `scripts/release.sh --dry-run v0.1.0` produces a clean preview

When all checked, tag `v0.1.0`. Announce on GitHub release notes only — public marketing waits until Phase 6.
