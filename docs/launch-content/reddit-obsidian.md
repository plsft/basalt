# r/ObsidianMD — launch post

**Title:** I built a plugin that reads my vault and writes a weekly Brief — would love feedback

Hey r/ObsidianMD — I've been quietly building a tool called **Basalt** that
runs over an Obsidian vault and produces a one-page weekly summary of what
you're actually working on, structurally. Today is the public launch and I'd
love your eyes on it.

It's a community-plugin (search "basalt" — install lands today on the
marketplace). What it does:

Five verbs, five short paragraphs in the Brief:
- **Implicit Thesis** — the through-line you keep circling
- **Contradiction** — notes that disagree with each other across time
- **Drift** — projects whose meaning has slid sideways
- **Connection** — pairs of notes you wrote months apart that are the same idea
- **Buried Insight** — old sentences your current work keeps mining

What it does *not* do: modify your notes (read-only on the vault, by design),
phone home (Open tier makes no network calls), or impose a methodology
(your folder structure / tags / linking habits don't matter to it).

It runs entirely locally with Ollama for embeddings, or BYOK if you'd rather
use OpenAI/Anthropic. The Obsidian plugin uses sql.js for its index so it
doesn't add a runtime dependency.

Open-source, MIT-licensed. Source: github.com/plsft/basalt.

Things I'd genuinely love feedback on:
- Does the Brief format work on your vault? I'm interested in failure modes.
- What's the next verb you'd want?
- Plugin settings I should expose that I haven't?

Thanks for reading — happy to answer anything in the comments.
