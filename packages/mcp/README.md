# `basalted-mcp` — Basalt as an MCP server

> Model Context Protocol server that exposes Basalt's Brief, the five verbs, and audit as tools. Plugs into Claude Desktop, Cursor, Cline, Zed, and VS Code Copilot.

```sh
npm install -g basalted-mcp
basalt-mcp --vault /path/to/your/notes
```

The binary is **`basalt-mcp`**.

- **Marketing:** https://basalted.com
- **Docs:** https://docs.basalted.com
- **Source:** https://github.com/plsft/basalt
- **License:** MIT

---

## Which package do I want?

| Package | Install | What it gives you | When to use it |
| --- | --- | --- | --- |
| [`basalted`](https://www.npmjs.com/package/basalted) | `npm i -g basalted` | The `basalt` CLI binary | You want to run Basalt from the terminal. |
| [`basalted-core`](https://www.npmjs.com/package/basalted-core) | `npm i basalted-core` | Library (no binary) — the engine | You're embedding Basalt in your own tool. |
| **`basalted-mcp`** *(this one)* | `npm i -g basalted-mcp` | The `basalt-mcp` server binary | You want LLM agents (Claude Desktop, Cursor, etc.) to call Basalt verbs as MCP tools. |

`basalted-mcp` transitively depends on `basalted-core`. Install only this if you're wiring up an MCP host.

---

## Requirements

- **Node 22+** *or* **Bun 1.3+** (or use the standalone binary — see below)
- A built Basalt index. Either:
  - Install [`basalted`](https://www.npmjs.com/package/basalted) and run `basalt init && basalt index` once to build it, **or**
  - Let `basalt-mcp` build it on first call by passing `--vault <path>`.
- Optional: **Ollama** at `http://localhost:11434` with `nomic-embed-text` pulled.

## Standalone binary

Every GitHub release attaches single-file compiled MCP server binaries — useful when MCP hosts can't reach Node/Bun on PATH:

```sh
# example: macOS Apple Silicon
curl -L -o basalt-mcp \
  https://github.com/plsft/basalt/releases/latest/download/basalt-mcp-darwin-arm64
chmod +x basalt-mcp
```

Five platforms: `basalt-mcp-linux-x64`, `basalt-mcp-linux-arm64`, `basalt-mcp-darwin-x64`, `basalt-mcp-darwin-arm64`, `basalt-mcp-windows-x64.exe`.

---

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "basalt": {
      "command": "npx",
      "args": ["-y", "basalted-mcp", "--vault", "/path/to/your/obsidian-vault"]
    }
  }
}
```

Or, if you've already `npm i -g basalted-mcp`:

```json
{
  "mcpServers": {
    "basalt": {
      "command": "basalt-mcp",
      "args": ["--vault", "/path/to/your/obsidian-vault"]
    }
  }
}
```

Restart Claude Desktop. The tools below appear in the available-tools list.

## Cursor / Cline / Zed

Same pattern in their respective MCP-server config blocks. See [`examples/`](https://github.com/plsft/basalt/tree/main/packages/mcp/examples) in the source repo for full sample configs.

## CLI flags

```sh
basalt-mcp \
  --vault /path/to/your/vault \
  --db /custom/path/to/basalt.db   \  # default: ~/.basalt/basalt.db
  --ollama-url http://localhost:11434 \
  --embedding-model nomic-embed-text  \
  --allow-write                        # permit `audit` to mutate calibration state
```

## Tools exposed

| Tool | What it does |
| --- | --- |
| `basalt_brief` | Generate today's Brief — all 5 verbs |
| `basalt_thesis` | Implicit Thesis only |
| `basalt_buried` | Buried Insight only |
| `basalt_drift` | Drift only |
| `basalt_contradiction` | Contradiction only |
| `basalt_connection` | Connection only |
| `basalt_audit` *(read by default)* | Pending findings + track record. With `--allow-write`, can also re-grade. |

**Promote-to-note is intentionally NOT exposed via MCP.** Agents can describe a finding; only humans turn a finding into a new vault file (via `basalt promote` in the CLI or the desktop app).

## Read-only guarantee

Basalt never modifies the files in your vault. The MCP server has no `createNoteFile` tool. The underlying engine's only mutation primitive is create-only and enforced by architectural tests.

---

## License

MIT. © 1556 Ventures LLC.
