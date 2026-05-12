# `basalted-core` — the Basalt engine

> Runtime-agnostic engine for Basalt. Parser, link graph, embedding pipeline, the five verbs, brief composer, calibration layer.

```sh
npm install basalted-core
```

This is a **library**, not a CLI. If you want to run Basalt from the terminal, install **[`basalted`](https://www.npmjs.com/package/basalted)** instead.

- **Marketing:** https://basalted.com
- **Docs:** https://docs.basalted.com
- **Source:** https://github.com/plsft/basalt
- **License:** MIT

---

## Which package do I want?

| Package | Install | What it gives you | When to use it |
| --- | --- | --- | --- |
| [`basalted`](https://www.npmjs.com/package/basalted) | `npm i -g basalted` | The `basalt` CLI binary | You want to run Basalt from the terminal. |
| **`basalted-core`** *(this one)* | `npm i basalted-core` | Library (no binary) — the engine | You're embedding Basalt in your own tool. |
| [`basalted-mcp`](https://www.npmjs.com/package/basalted-mcp) | `npm i -g basalted-mcp` | The `basalt-mcp` server binary | You want LLM agents to call Basalt verbs as MCP tools. |

If you're just *using* Basalt, you don't need this package directly — `basalted` and `basalted-mcp` already depend on it. **Install this only if you're writing your own surface** (new plugin, custom CI integration, batch tool, alternate UI).

---

## Why a separate engine package?

The engine has **no Node APIs**, no `fs`, no `process`. Everything filesystem-, runtime-, or environment-specific is behind an adapter interface. The same `basalted-core` build runs in:

- The Obsidian plugin (via `sql.js` WASM + Obsidian Vault API)
- The `basalted` CLI (via `better-sqlite3` or `bun:sqlite` + `fs/promises`)
- The Tauri desktop app (via Tauri SQL + plugin-fs)
- The hosted API on Cloudflare Workers (via D1 + Workers AI + R2)

Parity-tested against the [Python reference](https://github.com/virtexvirtuoso/basalt). 292 parity assertions, ε=1e-5 on similarity, exact-match on finding-set membership and ordering.

## Quick start

```ts
import {
  Engine,
  type Brief,
  type Finding,
  type StorageAdapter,
  type EmbeddingAdapter,
  type FilesystemAdapter,
  type AIAdapter,
} from "basalted-core";

const engine = new Engine({
  storage,        // your StorageAdapter implementation
  embedding,      // your EmbeddingAdapter
  filesystem,     // your FilesystemAdapter
  options: { today: "2026-05-12" },
});

await engine.index({ vault: "/path/to/vault" });
const brief: Brief = await engine.brief({ section: "all", top: 3 });
```

Sub-path imports for tooling that only needs one slice:

```ts
import { extractClaimQuote } from "basalted-core/parser";
import { hubDensity, HUB_DENSITY_HARD } from "basalted-core/graph";
import { cosine, l2Normalize } from "basalted-core/math";
import { findBuriedInsights } from "basalted-core/verbs";
import { composeBrief, renderBrief } from "basalted-core/brief";
import { auditPending, trackRecord } from "basalted-core/audit";
```

## Adapters

The engine is parameterized by four adapters:

| Adapter | What it does | Shipping implementations |
| --- | --- | --- |
| `StorageAdapter` | Persist notes, embeddings, links, findings | sql.js, better-sqlite3, bun:sqlite, Tauri SQL, Cloudflare D1, in-memory |
| `EmbeddingAdapter` | Embed note text → `Float32Array` | Ollama HTTP (`/api/embed`), Cloudflare Workers AI, deterministic mock |
| `FilesystemAdapter` | Walk vault, read note, **create-only** new file write | Obsidian Vault API, `fs/promises`, Tauri plugin-fs, R2, in-memory |
| `AIAdapter` | Optional LLM completion (v1.1.0+ LLM-augmented verbs) | Ollama, OpenAI, Anthropic, Workers AI |

`FilesystemAdapter.createNoteFile` is the **only** mutation primitive. It is strictly create-only — every implementation rejects if the target path exists. Read-only-by-default rests on this invariant; an architectural test in the repo enforces it.

## Dependencies

Runtime deps (all small, MIT/ISC):

- `graphology` + `graphology-communities-louvain` + `graphology-traversal` — link graph + Louvain clustering
- `js-yaml` — frontmatter
- `remark-parse` + `remark-frontmatter` + `remark-wiki-link` + `mdast-util-to-string` + `unified` — Markdown parsing
- *(no fetch, no `fs`, no `process` — runtime-neutral)*

## License

MIT. © 1556 Ventures LLC.
