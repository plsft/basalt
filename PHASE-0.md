# Phase 0 — Foundation & Spec Extraction

> **Goal:** Stand up the monorepo, tooling, and CI. Extract authoritative specs from Fernando's Python reference. Establish parity test infrastructure. End the phase with a green CI on `main` and `SPEC.md` written.
>
> **Target tag:** `v0.0.1`

This phase is non-negotiable foundation. Skipping or shortcutting it compounds into pain through every subsequent phase. The `SPEC.md` produced here is the contract every TS implementation must satisfy.

---

## TASK-0.1 — Initialize monorepo

**Spec:**
- Push to `github.com/plsft/basalt` per PRD §10 #2 (commercial entity is 1556 Ventures LLC per §10 #1; org transfer to a 1556-owned org is a future no-op).
- Initialize git repo on `main` branch
- Create root `package.json` with Bun workspaces config
- Create `tsconfig.base.json` with strict TS settings (per PRD §6.1)
- Create `biome.json` with project config (formatter + linter)
- Create empty `packages/` directory structure (one folder per package listed in PRD §3.1, each with placeholder `package.json`)
- Create `phases/` directory (already populated with phase files)
- Create `tests/parity/` and `tests/e2e/` empty directory skeletons
- Create `scripts/` directory with executable `generate-baseline.sh` placeholder
- Add `.gitignore` covering `node_modules/`, `dist/`, `.env*`, `target/` (Rust), `.basalt/` (vault index), `*.log`, OS detritus
- Add `LICENSE` (MIT)
- Add `README.md` with project description, install instructions placeholder, status; credits Fernando Villar as engine reference author and 1556 Ventures LLC as commercial entity

**Files created:**
```
basalt/
├── package.json
├── tsconfig.base.json
├── biome.json
├── .gitignore
├── LICENSE
├── README.md
├── CHANGELOG.md
├── packages/{core,cli,obsidian-plugin,mcp,api,web,desktop,site,docs,ui}/package.json
├── tests/parity/
├── tests/e2e/
└── scripts/generate-baseline.sh
```

**Tests:**
- Manual: `bun install` succeeds with no errors
- Manual: `bun run --cwd packages/core build` is a no-op but exits 0
- `biome check .` passes
- `tsc --noEmit -p tsconfig.base.json` produces no errors

**Definition of Done:** Standard DoD per PRD §0.

**Notes:**
- Pin Bun version in `package.json` `engines` field
- Pin Biome version in `package.json` `devDependencies` exact-match
- All package `package.json` files use `"private": true` except those intended for npm publish (cli, mcp, obsidian-plugin, ui, core)

---

## TASK-0.2 — Wire CI

**Spec:**
- Create `.github/workflows/ci.yml` with jobs:
  - `lint`: runs `biome check .`
  - `format`: runs `biome format --check .`
  - `typecheck`: runs `tsc --noEmit -p tsconfig.base.json` and per-package equivalents
  - `test`: runs `bun test` (or `vitest run` once Vitest is set up in TASK-0.5)
  - `parity`: runs parity tests (will be implemented in Phase 1; for now, a placeholder that always passes if the directory is empty)
- All jobs run on PR and on push to `main`
- Workflow fails fast on any job failure
- Cache Bun's install directory keyed by `bun.lockb` hash
- Configure branch protection on `main`:
  - Require PR before merge
  - Require status checks to pass (all CI jobs)
  - Disallow force pushes

**Files created:**
```
.github/
├── workflows/
│   └── ci.yml
└── pull_request_template.md     # references task-id, links to PRD/phase
```

**Tests:**
- Open a trivial PR (e.g. typo fix in README); CI runs and passes
- Try to push directly to `main`; should be rejected by branch protection

**Definition of Done:** Standard DoD + manual verification of branch protection in GitHub settings.

---

## TASK-0.3 — Extract verb specifications from Python reference

**Spec:**

This is the most important task in Phase 0. Read Fernando's Python implementation carefully and produce `SPEC.md` — the algorithmic contract every TS implementation must satisfy.

For each of the five verbs (Implicit Thesis, Contradiction, Drift, Connection, Buried Insight), document:

1. **Input contract**
   - What note structures are required (frontmatter fields, link types, etc.)
   - What index data must be precomputed (embeddings, link graph, hub scores)

2. **Algorithm in plain prose**
   - Step-by-step in numbered list
   - Reference Python source line numbers (e.g. "`src/basalt/verbs/buried.py:42`") for every step
   - Note any non-obvious data structures used

3. **Thresholds**
   - Every magic number that affects output
   - Vault-age-aware formulas (clamp floors, ceilings, exponents)
   - Hub-note penalty curve

4. **Quote extraction rules**
   - Sentence segmentation rules
   - Punchline preference (em-dash, negation, conclusion-opener)
   - Cliffhanger refusal (no `:` or `,` endings)
   - Markdown stripping rules

5. **Output structure**
   - Finding object schema (TypeScript `interface` form is fine)
   - Citation format
   - Falsification rule (how the audit layer re-checks this finding later)

6. **Edge cases observed in the source**
   - Empty vault
   - Vault with one note
   - Notes with no body (frontmatter only)
   - Notes with only frontmatter and links
   - Pathological hub notes (e.g. an index of indexes)
   - Duplicate notes (same path, different content over time)

7. **Output examples from the bundled 14-note sample vault**
   - For each verb, paste an actual JSON output from `python -m basalt brief --section <verb> --json` against the sample vault
   - These become the parity baseline

Also document the **shared primitives** with the same depth:
- Vault parser (frontmatter handling, wiki-link parsing, code-block escaping)
- Link graph construction (resolved vs unresolved links, MOC heuristics)
- Embedding pipeline (model, batching, normalization)
- Sentence-aware quote extraction

**Files created:**
```
SPEC.md
reference/                       # git submodule pointing at virtexvirtuoso/basalt; pinned at the latest stable tag at submodule registration time per PRD §10 #4
```

**Tests:**
- The document is reviewed by the human (George) before merge — include a checklist in the PR description acknowledging each verb has been traced to source
- For every threshold listed, point to the line in Python source where it lives
- For every output example, the JSON must validate against the schema also defined in this doc

**Definition of Done:** Standard DoD + human review of completeness against the Python source.

**Notes:**
- This is documentation-heavy work, but it's load-bearing. Resist the urge to skim. Every threshold matters; every edge case eventually shows up.
- Use the `reference/` git submodule rather than copy-pasting source — it ensures Python source line references stay accurate as we work.
- Per PRD §10 #3, the Python repo is **frozen**. The submodule pin does not move during the rewrite. If a parser or verb edge case requires a fix, land it in TS only and document the divergence in `docs/parsing-decisions.md` rather than reopen the upstream Python repo.

---

## TASK-0.4 — Set up parity test fixtures

**Spec:**
- Create `tests/parity/fixtures/sample-vault-14/` and copy in the 14-note sample vault from `reference/examples/sample-vault/`
- Create `tests/parity/fixtures/test-vault-large/` with a synthetic 200-note vault generated by a script — this fixture exists to stress-test threshold scaling and detect parser disagreements that the small fixture won't surface
- Synthetic vault generator script `scripts/generate-test-vault.ts` produces deterministic output given a seed (so the fixture is reproducible)
- Run the Python CLI against both fixtures and capture JSON output:
  - `tests/parity/baseline/sample-14-brief.json` (and per-verb files)
  - `tests/parity/baseline/large-200-brief.json` (and per-verb files)
- Write `scripts/generate-baseline.sh` that automates this regeneration step
- Document the regeneration procedure in `tests/parity/README.md`

**Files created:**
```
tests/parity/
├── fixtures/
│   ├── sample-vault-14/         # copied from reference repo
│   └── test-vault-large/        # generated, seeded
├── baseline/
│   ├── sample-14-brief.json
│   ├── sample-14-thesis.json
│   ├── sample-14-contradiction.json
│   ├── sample-14-drift.json
│   ├── sample-14-connection.json
│   ├── sample-14-buried.json
│   ├── large-200-brief.json
│   └── large-200-{thesis,contradiction,drift,connection,buried}.json
├── README.md                    # how to regenerate
scripts/
├── generate-baseline.sh
└── generate-test-vault.ts
```

**Tests:**
- `scripts/generate-baseline.sh` runs cleanly against both fixtures
- Generated baseline JSON validates against the finding schema from SPEC.md
- `scripts/generate-test-vault.ts` produces identical output across two runs with the same seed (determinism check)

**Definition of Done:** Standard DoD + baselines committed to git.

---

## TASK-0.5 — Set up Vitest + first parity test scaffold

**Spec:**
- Add Vitest to root devDependencies
- Configure Vitest at workspace root (`vitest.workspace.ts`) to discover tests across all packages
- Create `tests/parity/ts.test.ts` with a single placeholder test that:
  - Loads `baseline/sample-14-brief.json`
  - Asserts the file exists and is valid JSON conforming to the finding schema
  - Does NOT yet attempt to run TS verbs (those don't exist yet) — that's Phase 1
- The placeholder test exists so the parity CI job has something real to run starting now
- Write a short helper module `tests/parity/utils.ts` with:
  - `loadBaseline(name: string): Brief` — loads a baseline JSON file
  - `compareFindings(actual: Finding[], baseline: Finding[], tolerance?: number)` — set/order/score comparison with ε-tolerance (used in Phase 1)
  - `compareBrief(actual: Brief, baseline: Brief, tolerance?: number)` — full Brief comparison

**Files created:**
```
vitest.workspace.ts
tests/parity/
├── ts.test.ts                   # placeholder + schema validation
└── utils.ts                     # comparison helpers
```

**Tests:**
- `vitest run` discovers and runs the parity test file
- Placeholder test passes (baseline files load and validate)
- The `compareFindings` helper has its own unit tests (`utils.test.ts`) that verify it correctly identifies set differences, order differences, and score-tolerance failures

**Definition of Done:** Standard DoD.

---

## TASK-0.6 — Configure release tooling

**Spec:**
- Add `scripts/release.sh` that:
  - Verifies `main` is clean and up to date with origin
  - Reads version from root `package.json`
  - Runs full test suite; exits if anything fails
  - Bumps version per phase convention (`v0.<phase>.0`)
  - Updates CHANGELOG (moves `## Unreleased` content under a new versioned heading with date)
  - Creates an annotated git tag
  - Pushes tag and main
  - Outputs next steps (manual: create GitHub release with notes)
- Add `scripts/release.sh --dry-run` mode that previews actions without executing
- Document release procedure in root `README.md` under a "Releasing" section

**Files created/modified:**
```
scripts/release.sh
README.md                        # add Releasing section
```

**Tests:**
- `scripts/release.sh --dry-run` produces a sensible preview
- Run `scripts/release.sh` to cut `v0.0.1` at the end of Phase 0 (this is the phase exit gate, not part of this task)

**Definition of Done:** Standard DoD + dry-run executes cleanly.

---

## Phase 0 Exit Criteria

Before tagging `v0.0.1`, all of the following must be true:

- [ ] `main` is green on CI
- [ ] All TASK-0.* are merged
- [ ] `SPEC.md` exists and has been reviewed by George
- [ ] `tests/parity/baseline/` contains baseline JSON for all 5 verbs across both fixtures
- [ ] `vitest run` exits 0
- [ ] `biome check .` exits 0
- [ ] `tsc --noEmit -p tsconfig.base.json` exits 0
- [ ] `scripts/release.sh --dry-run v0.0.1` produces a clean preview

When all checked, run `scripts/release.sh` and tag `v0.0.1`. Begin Phase 1 immediately after.
