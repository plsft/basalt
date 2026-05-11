# Show HN: Basalt — a weekly Brief from your Markdown notes

Basalt is a second-brain compiler. It walks your Markdown vault, indexes the
structure, and once a week (or on demand) writes a one-page **Brief**: the
through-line you've been circling, the places you're disagreeing with yourself,
the projects whose meaning has drifted, the notes that are secretly the same
idea, and the line you wrote two years ago that this week's work keeps mining.

It is not a search engine. It does not retrieve from your notes. It
*compiles* them — structurally — and tells you what you already believe.

Five verbs:
- **Implicit Thesis** (sodium) — the through-line you keep returning to
- **Contradiction** (chlorine) — where you're disagreeing with yourself
- **Drift** (mercury) — projects whose meaning slid sideways
- **Connection** (carbon) — two notes you wrote months apart that are the same idea
- **Buried Insight** (gold) — the line you wrote in 2022 that you keep re-discovering

Three load-bearing properties:
1. **No network in Open tier.** CLI, plugin, MCP, desktop run entirely on your
   machine. Optional Ollama for embeddings. BYOK to any provider if you want
   hosted LLMs.
2. **Read-only on your vault.** Basalt never modifies a `.md` file. An
   architectural test in the codebase enforces this — promote-to-note creates
   *new* files only.
3. **No methodology imposed.** Your folder structure, your tags, your linking
   habits. Basalt does not care.

Open-source CLI is MIT (`basalted`, `basalted-mcp`, desktop, Obsidian plugin).
Pro tier is hosted brief generation + E2EE vault sync + a web cockpit, $12/mo.
First 200 Founders get lifetime Pro for $240.

Built in TypeScript, ports a Python prototype byte-for-byte. Runs on Bun.
Desktop is Tauri 2.

- Site: https://basalted.com
- Docs: https://docs.basalted.com
- GitHub: https://github.com/plsft/basalt

I'll be here for the next four hours — happy to answer anything.
