# Changelog

All notable changes to Basalt are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Phase boundaries get a release tag (`v0.<phase>.0`); public launch tags `v1.0.0`.

## Unreleased

### Added
- [TASK-0.1] Initialize monorepo: Bun workspaces, strict TypeScript config, Biome formatter+linter, MIT license, gitignore, README, and 10 placeholder package skeletons under `packages/` (core, cli, obsidian-plugin, mcp, api, web, desktop, site, docs, ui). Skeletons for `tests/parity/`, `tests/e2e/`, and `scripts/generate-baseline.sh`.
- [TASK-0.2] Wire CI: `.github/workflows/ci.yml` with five jobs (lint, format, typecheck, test, parity) running on push to `main` and on PRs. PR template at `.github/pull_request_template.md` enforces the Definition of Done checklist, references the task spec, and surfaces verb/perf/schema-specific gates when relevant.
- [TASK-0.3] Add `reference/` git submodule pinned at the Python implementation's `v0.0.11` tag (commit `42d340c`). Extract the algorithmic contract for all five verbs (Implicit Thesis, Contradiction, Drift, Connection, Buried Insight) plus shared primitives (vault parser, link graph, embedding pipeline, hub-density, load-bearing quote extraction) and the calibration layer into `SPEC.md`. Every threshold and regex is referenced back to a Python source line at the pinned tag. JSON output examples land in `tests/parity/baseline/` in TASK-0.4.
- [TASK-0.4] Set up parity test fixtures and frozen JSON baselines. `tests/parity/fixtures/sample-vault-14/` holds 24 hand-written notes copied from `reference/examples/sample-vault/` (PRD's "14-note" name preserved for test-stability). `scripts/generate-test-vault.ts` produces the 200-note `test-vault-large/` deterministically from a mulberry32-seeded PRNG. `scripts/generate-baseline.sh` rebuilds both fixtures' SQLite indexes via the Python CLI and writes 12 JSON baselines (one per fixture × {brief, buried, connection, contradiction, thesis, drift}) into `tests/parity/baseline/`. `tests/parity/README.md` documents the regeneration workflow, prerequisites (Python venv at `.venv-reference/`, Ollama at `localhost:11434` with `nomic-embed-text`), and the tolerance contract from PRD §8.1.
