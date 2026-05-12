# basalted

> Basalt CLI — read your Markdown vault, write a weekly Brief about what you believe but never wrote down.

Local-first. No network in the default tier. The CLI is the canonical surface for Basalt — every other surface (Obsidian plugin, MCP server, desktop app, web cockpit, mobile PWA) wraps the same `basalted-core` engine.

- Marketing: https://basalted.com
- Docs: https://docs.basalted.com
- Source: https://github.com/plsft/basalt
- Engine library: [`basalted-core`](https://www.npmjs.com/package/basalted-core)
- MCP server: [`basalted-mcp`](https://www.npmjs.com/package/basalted-mcp)

---

## Install

```sh
npm install -g basalted
# or:  bun add -g basalted
basalt about
```

The binary is named `basalt` (not `basalted`) — npm package is `basalted` because the unscoped name on npm matches the domain.

Standalone single-file binaries are also attached to every GitHub release if you don't want a Node/Bun runtime:

```sh
curl -L -o basalt https://github.com/plsft/basalt/releases/latest/download/basalt-linux-x64
chmod +x basalt && ./basalt about
```

Five platforms: `basalt-linux-x64`, `basalt-linux-arm64`, `basalt-darwin-x64`, `basalt-darwin-arm64`, `basalt-windows-x64.exe`.

## First brief

```sh
cd /path/to/your/vault
basalt init        # walks the vault, builds the index in ~/.basalt/
basalt brief       # writes today's brief into the vault
```

`init` is the slowest step — it embeds every note. On a 1k-note vault with `nomic-embed-text` via Ollama, expect ~30s. The Brief renders five sections in canonical order:

1. **Implicit Thesis** (`Na`) — the through-line you keep returning to
2. **Buried Insight** (`Au`) — the line you wrote months ago that your work still mines
3. **Drift** (`Hg`) — projects whose meaning slid sideways
4. **Contradiction** (`Cl`) — two notes that disagree quietly
5. **Connection** (`C`) — two notes that are secretly the same idea

## Commands

| Command | What |
| --- | --- |
| `basalt init` | Interactive setup — writes `~/.basalt/config.toml` |
| `basalt index` | Re-index the vault (incremental) |
| `basalt brief` | Generate today's brief, write to the vault |
| `basalt thesis` / `connection` / etc. | Run a single verb (`basalt --help` for all five) |
| `basalt promote <findingId>` | Promote a finding to a new note (never overwrites) |
| `basalt audit` | Falsification pass over recent findings |
| `basalt search <query>` | Multi-vault semantic search via the Pro API |
| `basalt config show` | Print the resolved config |
| `basalt doctor` | Pre-flight checks (vault, index, Ollama, model, API token) |
| `basalt demo` | Run an offline demo against a bundled fixture vault |
| `basalt about` | Version + bindings |

## LLM augmentation (v1.1.0+)

Pass `--llm ollama | openai | anthropic` to any brief command to add a synthesized one-sentence Implicit Thesis and an LLM verdict (`proven` / `apparent`) on each Contradiction.

```sh
basalt brief --llm ollama                            # local, no key needed
basalt thesis --llm anthropic                        # claude-sonnet-4-6 by default
basalt brief --llm openai --llm-model gpt-4o-mini
```

Keys come from `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — never written to disk.

## Pro API integration

When you set `apiUrl`, `apiToken`, and `apiVaultId` in `~/.basalt/config.toml`, the CLI can:

- `basalt snapshot push` — upload your local index to the API as a VaultSnapshot for hosted brief generation
- `basalt search "<query>" --vault-id <id>` — semantic search across one or more uploaded vaults

The Open tier (everything above this section) is fully local and never phones home.

## Architecture

The CLI is a thin shell over [`basalted-core`](https://www.npmjs.com/package/basalted-core) — the runtime-agnostic engine. Adapters injected at startup:

- `FilesystemAdapter` → `fs-node` (reads `.md` files from disk)
- `StorageAdapter` → SQLite via `bun:sqlite` on Bun or `better-sqlite3` on Node (runtime-detected)
- `EmbeddingAdapter` → `OllamaEmbedder` against `/api/embed` (with back-compat for the legacy `/api/embeddings` endpoint)
- `AIAdapter` → optional, selected by `--llm`

## License

MIT. © 1556 Ventures LLC.

See https://github.com/plsft/basalt for the rest of the operating contract.
