# Changelog

All notable changes to Basalt are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Phase boundaries get a release tag (`v0.<phase>.0`); public launch tags `v1.0.0`.

## Unreleased

### Added
- [TASK-0.1] Initialize monorepo: Bun workspaces, strict TypeScript config, Biome formatter+linter, MIT license, gitignore, README, and 10 placeholder package skeletons under `packages/` (core, cli, obsidian-plugin, mcp, api, web, desktop, site, docs, ui). Skeletons for `tests/parity/`, `tests/e2e/`, and `scripts/generate-baseline.sh`.
- [TASK-0.2] Wire CI: `.github/workflows/ci.yml` with five jobs (lint, format, typecheck, test, parity) running on push to `main` and on PRs. PR template at `.github/pull_request_template.md` enforces the Definition of Done checklist, references the task spec, and surfaces verb/perf/schema-specific gates when relevant.
