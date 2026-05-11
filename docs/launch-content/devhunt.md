# DevHunt — listing

**Name:** Basalt
**Tagline:** A second-brain compiler. Compiles you, not the corpus.

**One-paragraph:**
Basalt is a local-first tool that reads your Markdown vault and writes a
one-page weekly Brief about what you're actually working on — the through-line
you keep circling, where you contradict yourself, which projects have drifted,
the notes that are secretly the same idea, and the buried insight from years
ago your current work keeps mining. CLI, Obsidian plugin, MCP server, native
desktop app, hosted web cockpit. MIT-licensed engine.

**Tech stack:** TypeScript, Bun, Tauri 2, SQLite, Hono, Cloudflare Workers,
Astro, optional Ollama.

**Why it's interesting for devs:**
- Single TypeScript engine, five surfaces (CLI / plugin / MCP / desktop / web).
- Bun --compile produces cross-platform single-binary CLI.
- The MCP server intentionally omits write operations — agents can describe
  findings but only humans turn them into notes (PRD §4.3).
- Architectural grep tests enforce "read-only on the vault" as a contract,
  not a convention.

**Links:**
- Site: basalt.dev
- GitHub: github.com/plsft/basalt
- Docs: docs.basalt.dev
