# Phase 1 — Core Engine + Obsidian Plugin (the wedge)

> **Goal:** Build `@basalt/core` with all five verbs at parity with the Python reference. Wrap in `@basalt/obsidian-plugin` — the wedge surface — and ship through BRAT plus the Obsidian community marketplace submission.
>
> **Target tag:** `v0.1.0`
>
> **Estimated duration:** 10–14 weeks

This is the most algorithmically dense phase. Tasks 1.6 through 1.10 port the verbs one at a time, with parity tests gating each. **Do not move to Phase 2 until every parity test passes.** The plugin tasks (1.13–1.19) sit on top of the validated engine — building the surface the audience that has the pain lives in (Obsidian) before the credibility surfaces (CLI, MCP) follow in Phase 2.

Wedge-first ordering rationale: PRD §1, §4.1, §7. The plugin meets the audience where the pain is; CLI + MCP are credibility plays, not distribution wedges, and follow once the engine is validated by real plugin users.

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
│   ├── promote/{index}.ts  # stub for TASK-1.12
│   ├── promote/templates/  # empty dir, populated in TASK-1.12
│   ├── migrations/  # empty dir; first migration lands in TASK-1.4
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
  - Load-bearing sentence selection per `SPEC.md` §2.4 rules (em-dash, negation, conclusion-opener preference; cliffhanger refusal)
- Build a parser-parity test:
  - For every `.md` file in both fixtures (sample-14, large-200), parse with both Python and TS
  - Diff the parsed structure
  - Document every disagreement in `docs/parsing-decisions.md`
  - Resolve each: align TS to Python, OR document the divergence with rationale (Python repo is frozen per PRD §10 #3)

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
- Flesh out the `FilesystemAdapter` interface declared in TASK-1.1
- Provide an in-memory mock adapter in `src/adapters/filesystem-memory.ts` for tests (real filesystem adapters land per surface: Obsidian Vault in TASK-1.14, fs-node in Phase 2)
- Implement `src/graph/builder.ts`:
  - Walk vault via FilesystemAdapter
  - Parse each note via parser
  - Build a directed link graph using `graphology`
  - Resolve wiki-links to actual notes by name (case-insensitive stem match per `SPEC.md` §1.3)
- Implement `src/graph/hub-penalty.ts`:
  - Calculate per-note outgoing-link-density (per 100 words) per `SPEC.md` §2.3
  - Hard-exclude notes > `HUB_DENSITY_HARD = 1.5`
  - Soft-penalize 0.5–1.5 (returns penalty multiplier in `[0, 1]`)

**Files created:**
```
packages/core/src/adapters/filesystem-memory.ts
packages/core/src/graph/{builder,hub-penalty}.ts
packages/core/src/graph/{builder,hub-penalty}.test.ts
```

**Tests:**
- Unit: graph builder with synthetic 5-note vault verifies link resolution, ambiguity handling, broken links
- Unit: hub-penalty with synthetic notes at known link densities returns expected scores
- Parity: link graph built from sample-vault-14 matches Python's link graph (node IDs + edges as a sorted set)
- Parity: hub-penalty scores within ε=1e-5 of Python output for every note

**Definition of Done:** Standard DoD.

---

## TASK-1.4 — Implement storage primitives + embedding adapter

**Spec:**
- Flesh out the `StorageAdapter` and `EmbeddingAdapter` interfaces declared in TASK-1.1
- Implement `embedding-mock.ts` (deterministic; lives in `packages/core/src/adapters/`)
- Implement `embedding-ollama.ts` (lives in `packages/core/src/adapters/` — used by plugin, CLI, desktop; cloud has its own Workers AI implementation):
  - Ollama HTTP client (`fetch` against the configured endpoint, default `http://localhost:11434`)
  - Batched async with semaphore (default `EMBED_CONCURRENCY = 6` per SPEC.md §2.2)
  - Health check method
  - Error handling for Ollama not running (clear error type, surface-side decides exit code)
- Author canonical schema migrations under `packages/core/src/migrations/`:
  - `001-init.sql` matching Python's `~/.basalt/basalt.db` schema byte-for-byte (SPEC.md §2.1)
  - Migrations are forward-only; per-surface storage adapters (sql.js for plugin, better-sqlite3 for CLI in Phase 2, Tauri-SQL for desktop in Phase 4) reuse this single source
- Provide an in-memory `storage-memory.ts` adapter (sql.js compiled to `:memory:` so the migrations exercise the real DDL) for tests

**Files created:**
```
packages/core/src/adapters/{embedding-mock,embedding-ollama,storage-memory}.ts
packages/core/src/migrations/001-init.sql
packages/core/src/adapters/{embedding-mock,embedding-ollama,storage-memory}.test.ts
```

**Tests:**
- Unit: embedding-mock returns deterministic vectors for the same input
- Unit: embedding-ollama uses fetch mocking to verify request format, batching, error handling
- Unit: storage-memory round-trips notes, embeddings, findings via the canonical migrations; respects schema constraints
- Parity: schema in `001-init.sql` is byte-equivalent to the schema in `reference/src/basalt/index.py:12-72` (asserted via DDL string comparison)

**Definition of Done:** Standard DoD.

**Notes:**
- The schema must remain byte-compatible with Python's so users can swap CLIs in Phase 2 without re-indexing. Any deliberate divergence requires a `docs/decisions/` ADR.

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
  - Compose: take VerbResults, build a `Brief` object matching SPEC.md §3
  - Render: produce Markdown, HTML, or JSON variants
- Implement `src/audit/calibration.ts`:
  - For each persisted finding with status `pending`: re-evaluate against current vault per SPEC.md §10
  - Update status: `confirmed`, `falsified`, `pending`
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

Port the Buried Insight verb from `reference/src/basalt/buried.py`, following SPEC.md §9.

- Implement `src/verbs/buried.ts` per SPEC.md
- Register in `src/verbs/index.ts`
- Vault-age-aware threshold derivation in `src/math/thresholds.ts`
- Parity test against `tests/parity/baseline/sample-14-buried.json` — must match exactly per PRD §8.1 tolerances

**Files created:**
```
packages/core/src/verbs/buried.ts
packages/core/src/verbs/buried.test.ts
packages/core/src/math/thresholds.ts
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
- Implement `src/verbs/connection.ts` per SPEC.md §8
- Cosine similarity threshold ≥ 0.78
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
- Implement `src/verbs/drift.ts` per SPEC.md §7
- Stated priority: project-folder note count
- Lived priority: daily-note mention count over a 30-day window
- Largest divergence detection
- Daily-note recognition (frontmatter `tags: [daily]` or filename matching `YYYY-MM-DD` patterns — match Python's regex exactly)
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
- Implement `src/verbs/contradiction.ts` per SPEC.md §6 (v0 heuristic)
- Same-topic pair detection (similarity ≥ 0.72)
- Asymmetric negation detection
- Reversal markers and the 21 polarity pairs from SPEC.md §6.2
- Output: candidates, not verdicts (`version: "v0-heuristic"` in the schema)
- Parity test against `tests/parity/baseline/sample-14-contradiction.json`

**Tests:**
- Unit: negation detection on hand-curated pairs (English negation patterns)
- Unit: polarity pair lookup (substring semantics — match Python's `pos in a` behavior)
- Parity: exact match on both fixtures
- Edge: vaults with zero same-topic pairs → empty result

**Definition of Done:** Standard DoD + parity tests green.

---

## TASK-1.10 — Port verb: Implicit Thesis (Na)

**Spec:**
- Implement `src/verbs/thesis.ts` per SPEC.md §5 (v0 cluster heuristic)
- Tight-neighborhood (near-clique) cluster detection over the embedding similarity graph
- Cluster size 3–15
- Centroid identification (highest mean intra-cluster similarity)
- Centroid load-bearing sentence as proxy thesis
- Parity test against `tests/parity/baseline/sample-14-thesis.json`

**Tests:**
- Unit: tight-neighborhood detection on synthetic graphs with known structure
- Unit: cluster-size + diversity gates
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

## TASK-1.12 — Promote-to-note primitive + per-verb templates

**Spec:**

Implement the *only* mutation primitive in the read-only-by-default engine (PRD §2.1, §2.3, §3.3).

- Implement `src/promote/index.ts`:
  - Public function `promoteFindingToNote(finding, opts)` returns a `NoteContent { path, body }` object
  - Accepts a target folder (configurable; default `<vault>/Basalt/` per PRD §10 #6 — open decision; surface this as a halt if unresolved before this task runs)
  - Routes per-verb to a template
  - Pure: produces content without writing. The surface (plugin) calls `FilesystemAdapter.createNoteFile(path, content)` to actually create the file. `createNoteFile` is **strictly create-only** — implementations must reject if target exists (PRD §3.3, CLAUDE.md §5)
- Implement `src/promote/templates/{thesis,contradiction,drift,connection,buried}.ts`:
  - Each takes a finding, returns a Markdown body string
  - Templates use stable wikilinks back to the cited notes (this is what makes the new note "earn its keep" — bidirectional links from the promoted note to the source notes)
  - Per PRD §2.3 examples:
    - Implicit Thesis cluster → `Thesis: <topic>.md` with cluster members as wikilinks
    - Buried Insight → `Resurfaced: <title>.md` with recent citing notes
    - Connection pair → `Bridge: A ⇄ B.md` with both notes wikilinked
    - Contradiction pair → `Tension: A ⇄ B.md`
    - Drift → `Drift: <project> <under|over>.md`
- Architectural test: assert that no public path inside `promote/` writes to the filesystem directly. The only IO surface is the returned `NoteContent`, which the surface must hand to `FilesystemAdapter.createNoteFile`.

**Files created:**
```
packages/core/src/promote/index.ts
packages/core/src/promote/templates/{thesis,contradiction,drift,connection,buried}.ts
packages/core/src/promote/index.test.ts
packages/core/src/promote/templates/*.test.ts
```

**Tests:**
- Unit: each template produces deterministic output for a fixture finding (snapshot)
- Unit: promoteFindingToNote routes by `verb` discriminator and surfaces a clear error for unknown verbs
- Architectural: a static `grep`-driven test asserts `promote/` source contains no `fs/promises`, `node:fs`, or other write APIs (the surface enforces creation; core just plans content)

**Definition of Done:** Standard DoD.

**Notes:**
- This is the load-bearing test of the read-only architecture (PRD §2.1). If anything inside `core/` writes a file directly, the property breaks.

---

## TASK-1.13 — Scaffold `@basalt/obsidian-plugin`

**Spec:**
- Set up `packages/obsidian-plugin/` with TypeScript + esbuild
- Use Obsidian's official sample plugin template as a starting point
- Install `obsidian` types as devDependency
- Create `manifest.json`:
  ```json
  {
    "id": "basalt",
    "name": "Basalt",
    "version": "0.1.0",
    "minAppVersion": "1.6.0",
    "description": "A weekly Brief compiled from your notes. Reads what you've written and surfaces what you believe but never wrote down.",
    "author": "1556 Ventures LLC",
    "authorUrl": "https://virtuosoai.dev/basalt/",
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
│   │   ├── fs-obsidian.ts       # stub — TASK-1.14
│   │   ├── storage-sqljs.ts     # stub — TASK-1.15
│   │   └── embedding-ollama.ts  # re-export of @basalt/core's adapter
│   ├── views/
│   │   └── BriefView.ts         # stub — TASK-1.16
│   ├── settings.ts              # stub — TASK-1.17
│   └── i18n/en.json
├── styles.css
└── README.md
```

**Tests:**
- esbuild produces `main.js` and `styles.css`
- Plugin loads in a test Obsidian vault without errors (manual smoke test)

**Definition of Done:** Standard DoD.

---

## TASK-1.14 — Implement Obsidian Vault adapter (filesystem)

**Spec:**
- Implement `src/adapters/fs-obsidian.ts`:
  - Use Obsidian's `Vault` API to walk and read markdown files
  - Convert Obsidian's relative paths to canonical absolute paths for citations
  - Respect Obsidian's `.obsidian/` and any user-configured ignore patterns (mirror SPEC.md §1.1's `EXCLUDE_DIRS`)
  - Implement the `FilesystemAdapter` interface from `@basalt/core`
  - Implement `createNoteFile(path, content)` strictly create-only — reject if target exists; do not modify any existing `.md` file. **Architectural test required.**
- Use `MetadataCache` for fast frontmatter access where possible (perf optimization)

**Files created:**
```
packages/obsidian-plugin/src/adapters/fs-obsidian.ts
packages/obsidian-plugin/src/adapters/fs-obsidian.test.ts  # unit tests with mock Vault
```

**Tests:**
- Unit: walk produces expected file list given a mock Vault
- Unit: readFile returns content given a mock TFile
- Unit: createNoteFile creates a new file when target doesn't exist; refuses with a typed error when it does
- Architectural test: greps the adapter source for forbidden Vault APIs (`modify`, `rename`, `delete`, `trash`, `process`); presence of any of these fails the build (CLAUDE.md §5: "Modifying any of the user's existing `.md` files" forbidden)
- Integration: against a real Obsidian instance with the sample-vault-14 fixture, walk and read produce identical bytes to the in-memory adapter

**Definition of Done:** Standard DoD.

---

## TASK-1.15 — Implement sql.js storage adapter for Obsidian sandbox

**Spec:**
- Implement `src/adapters/storage-sqljs.ts`:
  - Wrap `sql.js` (SQLite compiled to WASM) since `better-sqlite3` requires native modules unavailable in Obsidian
  - Database file at `<vault>/.basalt/basalt.db`
  - Persist via Obsidian's `Vault.adapter.writeBinary` for the underlying file
  - Same migrations as core's canonical migration set (`packages/core/src/migrations/`); single source of truth
- Benchmark on a 10,000-note vault: indexing must complete in < 5 minutes; querying < 1 second per verb (PRD §6.4)

**Files created:**
```
packages/obsidian-plugin/src/adapters/storage-sqljs.ts
packages/obsidian-plugin/src/adapters/storage-sqljs.test.ts
packages/obsidian-plugin/bench/storage-sqljs.bench.ts
```

**Tests:**
- Unit: round-trip writes/reads against an in-memory sql.js instance
- Performance bench: 10,000-note synthetic vault, full index in < 5 min, full Brief in < 5s
- Schema parity: the resulting `.basalt/basalt.db` is byte-compatible with Python's (DDL output diff — same as TASK-1.4 assertion)
- If perf budget is missed, document fallback plan in PR (flat IndexedDB store with batched writes per PRD §9 risks)

**Definition of Done:** Standard DoD + perf budget met OR documented fallback.

**Notes:**
- This is the highest-risk technical task in Phase 1. If sql.js is too slow on 10k vaults, the fallback is a leaner persistence layer (flat IndexedDB); that's a follow-up task. Document the choice in `docs/decisions/`.

---

## TASK-1.16 — Implement BriefView + ribbon + status bar

**Spec:**
- Implement `src/views/BriefView.ts`:
  - Extends Obsidian's `ItemView`
  - Renders the latest Brief using `@basalt/core`'s render pipeline
  - Click handlers on findings: Promote (calls `promoteFindingToNote` + `FilesystemAdapter.createNoteFile`), Snooze, Dismiss
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
- Unit: Promote click triggers `createNoteFile` once with the expected path; rejects gracefully if the file exists
- Integration (manual): plugin loads, ribbon icon visible, click triggers brief generation against a real vault, BriefView opens with output
- Visual snapshot test: BriefView matches expected DOM structure for a fixture Brief

**Definition of Done:** Standard DoD + manual smoke test recorded in PR.

---

## TASK-1.17 — Implement Settings tab

**Spec:**
- Implement `src/settings.ts`:
  - Vault path (default: current vault, override with secondary vault path)
  - Ollama URL (default: `http://localhost:11434`)
  - Embedding model selection (dropdown: `nomic-embed-text`, `bge-m3`, custom)
  - Promote-to folder (default per PRD §10 #6 — surface as halt if unresolved)
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

## TASK-1.18 — Implement weekly brief scheduling (in-plugin)

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

## TASK-1.19 — Plugin packaging + community marketplace submission

**Spec:**
- Configure release workflow `.github/workflows/release-obsidian.yml`:
  - Tag-driven release builds `main.js`, `manifest.json`, `styles.css` into a release artifact
  - Upload to the GitHub release tied to the monorepo's `v0.1.0` tag (or a separate plugin-tag if Obsidian's resolver requires it; pick whichever the marketplace tooling expects)
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
- Manual: install the plugin from the GitHub release URL via Obsidian's "Install from URL" / BRAT beta channel

**Definition of Done:** Standard DoD + plugin installable via Obsidian's BRAT (Beta Reviewers Auto-update Tool) for testing before community marketplace approval.

**Notes:**
- The Obsidian community marketplace submission can take 1–4 weeks to be reviewed/merged. Begin the submission as part of this task; the marketplace listing itself is gating only for public launch (Phase 6), not for `v0.1.0` tag. BRAT is enough for `v0.1.0`.

---

## Phase 1 Exit Criteria

Before tagging `v0.1.0`:

- [ ] All TASK-1.* merged
- [ ] All five verbs at parity with Python (exact match on baselines)
- [ ] Full Brief at parity with Python on both fixtures
- [ ] Promote-to-note creates new files only — architectural test passes; no path inside `core/promote/` writes directly
- [ ] Plugin installable via BRAT and produces correct Briefs against a real Obsidian vault
- [ ] sql.js perf budget met on 10k-note vault (or documented fallback shipping in 1.15)
- [ ] No surface modifies the user's existing `.md` files (architectural test in TASK-1.14 + TASK-1.16)
- [ ] Community marketplace submission opened (review pending is OK)
- [ ] Performance budgets met (PRD §6.4 — engine index + brief, plugin idle memory + 10k-vault index)
- [ ] CHANGELOG documents the wedge launch
- [ ] `scripts/release.sh --dry-run v0.1.0` produces a clean preview

When all checked, tag `v0.1.0`. The plugin lives on BRAT for ~1–4 weeks while the community marketplace PR is reviewed. Phase 2 begins immediately — the CLI and MCP credibility surfaces don't need to wait for marketplace approval.
