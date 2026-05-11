# basalted-obsidian-plugin

Basalt for Obsidian — generate weekly Briefs from your vault, in-vault, fully offline.

## Status

**Phase 1, in progress.** Plugin scaffold lands in TASK-1.13 (this PR). Vault adapter, sql.js storage, BriefView, settings, scheduling, and marketplace submission land in TASK-1.14 through TASK-1.19.

## Architecture

The plugin is a thin surface over `basalted-core`. Indexing, verbs, brief composition, and audit calibration all live in core. The plugin provides three Obsidian-specific implementations of core's adapter interfaces:

- **`fs-obsidian.ts`** (`FilesystemAdapter`) — uses Obsidian's `Vault` API to walk and read `.md` files. `createNoteFile` is strictly create-only; an architectural test verifies the adapter never modifies an existing file.
- **`storage-sqljs.ts`** (`StorageAdapter`) — wraps sql.js (SQLite compiled to WASM) since `better-sqlite3` requires native modules unavailable in Obsidian's Electron sandbox. Database file at `<vault>/.basalt/basalt.db`. Same migrations as the CLI's `better-sqlite3` adapter (single source of truth in `basalted-core/src/migrations/`).
- The HTTP `OllamaEmbedder` is reused directly from `basalted-core` — Ollama works the same in Electron as it does in Node.

## Build

```sh
bun run --cwd packages/obsidian-plugin build      # production bundle
bun run --cwd packages/obsidian-plugin dev        # esbuild watch mode
bun run --cwd packages/obsidian-plugin typecheck  # tsc --noEmit
```

The build produces `main.js` + uses the existing `manifest.json` and `styles.css` — three artifacts the Obsidian plugin loader expects.

## Install (developer / BRAT)

Until the plugin lands in the official community marketplace (TASK-1.19), install via BRAT:

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian.
2. Add the plugin URL: `https://github.com/plsft/basalt`.
3. Pick a release tag (`v0.1.0` or later).

## License

MIT © 1556 Ventures LLC.
