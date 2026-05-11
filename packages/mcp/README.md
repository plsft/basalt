# @basalt/mcp

Basalt MCP server. Exposes Brief, verbs, and audit as MCP tools so Claude Desktop / Cursor / Cline / Zed / VS Code Copilot can run them against your vault.

## Install

```sh
npm install -g @basalt/mcp
```

Or grab the standalone binary from the [GitHub release](https://github.com/plsft/basalt/releases) — `basalt-mcp-{linux,darwin,windows}-{x64,arm64}`.

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

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

See `examples/claude-desktop-config.json` and `examples/cursor-config.json`.

## Tools

| Tool | What it does |
| --- | --- |
| `basalt_brief` | Full Brief (all five verbs). Returns Brief JSON by default. |
| `basalt_connection` | Cross-folder pairs that are the same idea. |
| `basalt_contradiction` | Pairs of notes that can't both be true (v0 candidates). |
| `basalt_drift` | Stated vs lived priority over a 30-day window. |
| `basalt_buried_insight` | Old notes recent work still depends on. |
| `basalt_implicit_thesis` | Tight clusters of notes converging on an unnamed through-line. |
| `basalt_audit` | Re-evaluate pending findings against current vault state. Requires `--allow-write`. |

**Promote-to-note is intentionally NOT exposed.** File creation belongs to a surface where the user can see the result, not a tool that returns text to a chat (PRD §4.3). Use the Obsidian plugin or `basalt promote` from the CLI.

## CLI flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `--vault <path>` | from `~/.basalt/config.toml` | Default vault path. Tools accept a per-call `vault` argument that overrides. |
| `--db <path>` | from config | Index DB location. |
| `--ollama-url <url>` | `http://localhost:11434` | Embedding endpoint. |
| `--embedding-model <m>` | `nomic-embed-text` | Override the embedding model. |
| `--allow-write` | off | Permit `basalt_audit` to mutate calibration state. Read-only by default. |

## License

MIT © 1556 Ventures LLC.
