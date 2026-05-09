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
│   ├── core/              # @basalt/core — runtime-agnostic engine
│   ├── cli/               # @basalt/cli — Bun-compiled binary
│   ├── obsidian-plugin/   # @basalt/obsidian-plugin
│   ├── mcp/               # @basalt/mcp
│   ├── api/               # @basalt/api — Cloudflare Workers + Hono
│   ├── web/               # @basalt/web — React + Tailwind v4
│   ├── desktop/           # @basalt/desktop — Tauri 2
│   ├── site/              # @basalt/site — marketing
│   ├── docs/              # @basalt/docs — Starlight
│   └── ui/                # @basalt/ui — shared components
├── tests/parity/          # Python ↔ TS golden output tests
├── tests/e2e/             # cross-surface end-to-end tests
└── scripts/               # build + release automation
```

## Credits

- **Engine reference:** the [Python implementation](https://github.com/virtexvirtuoso/basalt) by **Fernando Villar** (MIT). The TypeScript rewrite ports its algorithms; the Python repo is frozen and reference-only during the rewrite.
- **Marketing reference:** [virtuosoai.dev/basalt](https://virtuosoai.dev/basalt/) — Fernando's typographic design language is carried forward.
- **Commercial entity:** **1556 Ventures LLC** — a joint venture between George Rios and Fernando Villar.

## License

[MIT](./LICENSE) © 1556 Ventures LLC.
