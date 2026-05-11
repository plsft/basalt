# r/selfhosted — launch post

**Title:** Basalt — local-first second-brain compiler, MIT-licensed, runs on your machine

What it is: a tool that reads your Markdown notes, indexes them in a local
SQLite database, and writes a weekly one-page Brief about what you're working
on (implicit thesis, contradictions, drift, etc.). Five verbs, five short
sections.

Why r/selfhosted will care:

- **Open tier makes zero network calls.** The CLI, plugin, MCP server, and
  desktop app run entirely on your machine.
- **Optional Ollama for embeddings.** Or BYOK to OpenAI/Anthropic if you'd
  rather. Your machine talks to the provider directly; nothing proxies
  through us.
- **Read-only on your vault.** Architectural test in the codebase enforces
  this.
- **MIT-licensed.** Engine is open-source. Pro tier is hosted convenience for
  people who don't want to run Ollama.
- **Bun-compiled single binary for the CLI.** No npm runtime required if you
  grab the binary release.

Stack: TypeScript on Bun, Tauri 2 for the desktop, SQLite for the index,
optional Ollama for local embeddings.

Source: github.com/plsft/basalt

Open to feedback on what other self-host integrations would be valuable.
Right now it ships with: env-var config, TOML config file, `~/.basalt/`
data directory, and clean integration with Obsidian / MCP hosts.
