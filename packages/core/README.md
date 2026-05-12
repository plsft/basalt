# basalted-core

> Runtime-agnostic engine for Basalt. Vault parser, link graph, embedding pipeline, five verbs, brief composition, calibration layer.

This package is the source of truth for verb behavior. Every other surface — Obsidian plugin, CLI ([`basalted`](https://www.npmjs.com/package/basalted)), MCP server ([`basalted-mcp`](https://www.npmjs.com/package/basalted-mcp)), desktop app, cloud API — is a thin view over this engine. `basalted-core` has no Node APIs, no `fs`, no `process`. Everything filesystem- or environment-specific is behind an adapter interface.

- Marketing: https://basalted.com
- Docs: https://docs.basalted.com
- Source: https://github.com/plsft/basalt

Parity-tested against the [Python reference](https://github.com/virtexvirtuoso/basalt) (frozen at v0.0.15). 292 parity assertions, ε=1e-5 on similarity scores, exact-match on finding set membership and ordering.

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
} from "basalted-core";
```

Sub-path imports for tooling that wants only one slice:

```ts
import { extractClaimQuote } from "basalted-core/parser";
import { hubDensity, HUB_DENSITY_HARD } from "basalted-core/graph";
import { cosine, l2Normalize } from "basalted-core/math";
import { findBuriedInsights } from "basalted-core/verbs";
import { composeBrief, renderBrief } from "basalted-core/brief";
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
