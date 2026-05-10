# @basalt/core

> Runtime-agnostic engine for Basalt. Vault parser, link graph, embedding pipeline, five verbs, brief composition, calibration layer.

This package is the source of truth for verb behavior. Every other surface — Obsidian plugin, CLI, MCP server, desktop app, cloud API — is a thin view over this engine. Per PRD §3.2, `@basalt/core` has no Node APIs, no `fs`, no `process`. Everything filesystem- or environment-specific is behind an adapter interface.

## Status

**Phase 1, in progress.** The package surface is wired (TASK-1.1). The parser, graph, math, verbs, and brief composer ship in TASK-1.2 through TASK-1.11. Until then, calling any of the exported functions throws `not yet implemented`.

See [`SPEC.md`](../../SPEC.md) for the algorithmic contract every implementation must satisfy.

## Public surface

```ts
import {
  Engine,
  type Brief,
  type Finding,
  verbs,
  promoteFindingToNote,
  type NoteContent,
  type PromoteOptions,
  type StorageAdapter,
  type EmbeddingAdapter,
  type FilesystemAdapter,
  type AIAdapter,
} from "@basalt/core";
```

Sub-path imports for tooling that wants only one slice:

```ts
import { extractClaimQuote } from "@basalt/core/parser";
import { hubDensity, HUB_DENSITY_HARD } from "@basalt/core/graph";
import { cosine, l2Normalize } from "@basalt/core/math";
import { findBuriedInsights } from "@basalt/core/verbs";
import { composeBrief, renderBrief } from "@basalt/core/brief";
```

## Adapters

The engine is parameterized by four adapters (PRD §3.3):

| Adapter | What it does | Implementations |
| --- | --- | --- |
| `StorageAdapter` | Persist notes, embeddings, links, findings | sql.js (plugin), better-sqlite3 (CLI), Tauri SQL (desktop), D1 (cloud), in-memory mock (tests) |
| `EmbeddingAdapter` | Embed note text → Float32Array | Ollama HTTP (plugin/CLI/desktop), Workers AI (cloud), deterministic mock (tests) |
| `FilesystemAdapter` | Walk vault, read file, **create-only** new file write | Obsidian Vault API (plugin), fs/promises (CLI), Tauri plugin-fs (desktop), R2 (cloud, opt-in), in-memory (tests) |
| `AIAdapter` | LLM completion (post-v1 LLM verbs only) | Ollama (Open), BYOK providers, Workers AI |

`FilesystemAdapter.createNoteFile` is the *only* mutation primitive. It is strictly create-only — every implementation rejects if the target path exists. PRD §2.1's read-only-by-default invariant rests on this.

## Build

```sh
bun run --cwd packages/core build      # → dist/index.js + .d.ts
bun run --cwd packages/core typecheck  # tsc --noEmit
bun run --cwd packages/core test       # tests run via root vitest
```

## License

MIT © 1556 Ventures LLC.
