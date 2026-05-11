# Basalt

> *Reads your Markdown vault and surfaces what you believe but never wrote down.*
>
> A second-brain compiler that compiles the user, not the corpus.

[![status: in development](https://img.shields.io/badge/status-in%20development-yellow)](#status)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Basalt is a local-first, read-only-by-default second-brain compiler. It reads a folder of Markdown — Obsidian vault, Logseq graph, plain `~/notes` — and produces *The Brief*: a finite, weekly, human-readable document about the user, with citation-grounded findings across five named verbs.

## The Verbs

| Verb | Element | What it surfaces |
| --- | --- | --- |
| **Implicit Thesis** | Sodium (Na) | The thing you keep saying without realizing you're saying the same thing. |
| **Contradiction** | Chlorine (Cl) | The two notes you wrote that can't both be true. |
| **Drift** | Mercury (Hg) | What you say is the priority versus what you actually spent the week on. |
| **Connection** | Carbon (C) | The two ideas in different folders that turn out to be the same idea. |
| **Buried Insight** | Gold (Au) | The note you forgot you wrote that recent work still depends on. |

See [`PRD.md`](./PRD.md) §2.2 for algorithm summaries, and [`SPEC.md`](./SPEC.md) (produced in TASK-0.3) for byte-level detail.

## Status

In active development. The build proceeds in numbered phases, each tagged at completion:

- **Phase 0** — Foundation, monorepo, spec extraction, parity baselines (`v0.0.1`)
- **Phase 1** — Core engine + Obsidian plugin (`v0.1.0`)
- **Phase 2** — CLI + MCP server (`v0.2.0`)
- **Phase 3** — Cloudflare API + web cockpit (`v0.3.0`)
- **Phase 4** — Tauri 2 desktop app (`v0.4.0`)
- **Phase 5** — Marketing + docs sites (`v0.5.0`)
- **Phase 6** — Public launch (`v1.0.0`)

Track progress in [`CHANGELOG.md`](./CHANGELOG.md) and the per-phase task files (`PHASE-N.md`).

## Install

Install instructions land per-surface starting in Phase 1. Until then this repository is a build-in-progress, not a usable product.

## Repository layout

```
basalt/
├── PRD.md                 # product + architecture contract
├── PHASE-{0..6}.md        # per-phase task lists
├── CLAUDE.md              # operating manual for Claude Code
├── SPEC.md                # algorithmic contract (produced in TASK-0.3)
├── packages/              # workspace packages
│   ├── core/              # basalted-core — runtime-agnostic engine
│   ├── cli/               # basalted — Bun-compiled binary
│   ├── obsidian-plugin/   # basalted-obsidian-plugin
│   ├── mcp/               # basalted-mcp
│   ├── api/               # basalted-api — Cloudflare Workers + Hono
│   ├── web/               # basalted-web — React + Tailwind v4
│   ├── desktop/           # basalted-desktop — Tauri 2
│   ├── site/              # basalted-site — marketing
│   ├── docs/              # basalted-docs — Starlight
│   └── ui/                # basalted-ui — shared components
├── tests/parity/          # Python ↔ TS golden output tests
├── tests/e2e/             # cross-surface end-to-end tests
└── scripts/               # build + release automation
```

## Releasing

Phase boundaries get an annotated tag (`v0.<phase>.0`); the public launch tags `v1.0.0`. Releases are driven by [`scripts/release.sh`](./scripts/release.sh).

```sh
# Preview every step; no writes, no pushes. Run from any branch.
bash scripts/release.sh --dry-run v0.0.1

# Cut the real release. Must be on `main`, clean, in sync with `origin/main`.
bash scripts/release.sh v0.0.1
```

The script:

1. Pre-flights: clean tree, on `main`, in sync with `origin`, tag doesn't already exist.
2. Runs the full local gauntlet — `bun run ci` (Biome lint+format), `bun run typecheck` (`tsc --noEmit -p tsconfig.base.json`), `bun run test` (Vitest), parity-baseline JSON sanity check.
3. Bumps `package.json` to the unprefixed version (e.g. `0.0.1`).
4. Promotes `## Unreleased` in `CHANGELOG.md` under `## v0.0.1 — YYYY-MM-DD`, then re-adds an empty `## Unreleased`.
5. Commits `chore(release): v0.0.1`.
6. Creates an annotated git tag with the changelog excerpt as message.
7. Pushes `main` + the new tag.
8. Prints a link to draft the GitHub Release page.

Phase exit checklist (per `PHASE-N.md`'s *Phase Exit Criteria* section) must be ticked before tagging. Don't skip it — the release script does not enforce phase-exit completeness, only repo-level sanity.

Per CLAUDE.md §5, never force-push to `main` and never tag a release with red CI on `main`.

## Credits

- **Engine reference:** the [Python implementation](https://github.com/virtexvirtuoso/basalt) by **Fernando Villar** (MIT). The TypeScript rewrite ports its algorithms; the Python repo is frozen and reference-only during the rewrite.
- **Marketing reference:** [virtuosoai.dev/basalt](https://virtuosoai.dev/basalt/) — Fernando's typographic design language is carried forward.
- **Commercial entity:** **1556 Ventures LLC** — a joint venture between George Rios and Fernando Villar.

## License

[MIT](./LICENSE) © 1556 Ventures LLC.
