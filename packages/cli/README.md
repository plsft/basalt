# `basalted` — the Basalt CLI

> A local-first second-brain compiler. Walks your Markdown vault, builds an index, writes a weekly Brief about what you believe but never wrote down.

```sh
npm install -g basalted
basalt about
basalt init        # interactive setup → ~/.basalt/config.toml
basalt brief       # writes today's brief into your vault
```

The binary is **`basalt`** (not `basalted` — the npm package matches the domain `basalted.com`).

- **Marketing:** https://basalted.com
- **Docs:** https://docs.basalted.com
- **Source:** https://github.com/plsft/basalt
- **License:** MIT

---

## Which package do I want?

Basalt is published as three npm packages. **Most users want `basalted`**.

| Package | Install | What it gives you | When to use it |
| --- | --- | --- | --- |
| **`basalted`** *(this one)* | `npm i -g basalted` | The `basalt` CLI binary | You want to run Basalt from the terminal. |
| [`basalted-core`](https://www.npmjs.com/package/basalted-core) | `npm i basalted-core` | Library (no binary) — the engine | You're embedding Basalt in your own tool (a new surface, plugin, integration). |
| [`basalted-mcp`](https://www.npmjs.com/package/basalted-mcp) | `npm i -g basalted-mcp` | The `basalt-mcp` server binary | You want Claude Desktop / Cursor / Cline to call Basalt verbs as MCP tools. |

`basalted` transitively depends on `basalted-core`, so installing the CLI gives you the whole engine.

---

## Requirements

- **Node 22+** *or* **Bun 1.3+**
- **Ollama** (optional but recommended) running locally on `http://localhost:11434` with `nomic-embed-text` pulled. The Open tier is fully offline — no network calls outside Ollama.
- A folder of Markdown files (your "vault"). Obsidian, Logseq, plain `~/notes` — Basalt doesn't care about your folder structure.

```sh
# one-time Ollama setup, if you're using it:
ollama pull nomic-embed-text
ollama serve   # leave running in another terminal
```

The CLI degrades gracefully without Ollama (uses a deterministic mock embedder) — verb output quality drops but everything still works end to end.

## Standalone binaries (no Node/Bun required)

Every GitHub release attaches single-file compiled binaries:

```sh
# example: Linux x64
curl -L -o basalt https://github.com/plsft/basalt/releases/latest/download/basalt-linux-x64
chmod +x basalt && ./basalt about
```

Five platforms: `basalt-linux-x64`, `basalt-linux-arm64`, `basalt-darwin-x64`, `basalt-darwin-arm64`, `basalt-windows-x64.exe`.

---

## What it does

Every command runs the same five verbs over your vault. The Brief renders them in this order — matching the [Python reference](https://github.com/virtexvirtuoso/basalt):

| Order | Verb | Element | Question |
| --- | --- | --- | --- |
| I | Implicit Thesis | **Na** | What's the through-line I keep returning to? |
| II | Buried Insight | **Au** | What did I write months ago that my work still mines? |
| III | Drift | **Hg** | Which projects' meaning slid sideways? |
| IV | Contradiction | **Cl** | Where am I disagreeing with myself? |
| V | Connection | **C** | Which notes are secretly the same idea? |

## Commands

| Command | What |
| --- | --- |
| `basalt init` | Interactive setup; writes `~/.basalt/config.toml` |
| `basalt index` | Re-index the vault (incremental, embeds new notes) |
| `basalt brief` | Generate today's brief and write it to the vault |
| `basalt thesis` / `buried` / `drift` / `contradiction` / `connection` | Run a single verb |
| `basalt promote <findingId>` | Promote a finding to a new note (create-only — never overwrites) |
| `basalt audit` | Falsification pass over recent findings; auto-verdict drift |
| `basalt search <query>` | Multi-vault semantic search (via the hosted API) |
| `basalt config show` | Print the resolved config (file + defaults) |
| `basalt doctor` | Pre-flight checks: vault, index, Ollama, embedding model, API token |
| `basalt demo` | Run an offline demo against the bundled fixture vault |
| `basalt about` | Version + bindings |

Run `basalt <command> --help` for flags.

## LLM augmentation (v1.1.0+)

Pass `--llm ollama | openai | anthropic` to a brief command to get a synthesized named thesis and `proven` / `apparent` verdicts on contradictions.

```sh
basalt brief --llm ollama                            # local, no API key needed
basalt thesis --llm anthropic                        # claude-sonnet-4-6 by default
basalt brief --llm openai --llm-model gpt-4o-mini
```

Keys are read from `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — **never** written to disk.

## Pro tier (optional)

When you set `apiUrl`, `apiToken`, and `apiVaultId` in `~/.basalt/config.toml`:

- `basalt snapshot push` — upload your local index to the hosted API
- `basalt search "<query>" --vault-id <id>` — semantic search across multiple uploaded vaults

The Open tier is fully local. Hosted is opt-in.

## Read-only guarantee

Basalt **never modifies your existing notes**. `promote` creates *new* files only — its underlying API (`FilesystemAdapter.createNoteFile`) is strictly create-only, enforced by architectural tests.

---

## License

MIT. © 1556 Ventures LLC.
