# Announcing Basalt — a second-brain compiler

I started keeping a Markdown vault in 2019. It is now 2,400 notes deep.
Somewhere around note 800 I stopped being able to hold the whole shape in my
head — and started to feel the specific failure mode of a long-running second
brain: the corpus knows things I don't.

I tried the standard playbooks:

- **Search.** Useful but tautological: I find notes I already remember
  writing.
- **Tag taxonomies.** I built one. I let it rot. Then I built another. Same.
- **Chat with my notes.** The output is fluent paraphrase, not insight. It
  feels like talking to a slightly-too-confident intern who has read the
  same files I have.
- **Manual review.** Once a quarter I'd block out a Sunday and re-read
  recent notes. Useful, but the effort cost climbs faster than the corpus
  size, and I'd consistently fall behind.

None of those tools answered the question I actually had: **what am I really
working on right now, structurally, across the whole vault?**

The thing I wanted didn't seem like a search problem. It was a *compilation*
problem: take the corpus, look at the link graph, look at sentence-level
embeddings, look at recency patterns, look at where I keep returning, and
write a paragraph in my own voice about what's there. Once a week. As a
Markdown file in the same vault it came from.

So I built it. Over the course of about six months — first a Python
prototype to prove the verbs worked, then a TypeScript rewrite for v1.0.

## What it does

Basalt has five verbs. Each maps to an element on the periodic table. Each
answers one question about your own work.

**Implicit Thesis (Sodium · Na).** What's the through-line I keep returning
to? Basalt finds tight semantic neighborhoods in your link graph, applies
hub-penalty smoothing so daily-notes don't dominate, and (optionally) uses
an LLM to write the thesis as a single sentence in your voice.

**Contradiction (Chlorine · Cl).** Where am I disagreeing with myself?
Basalt finds pairs of claim-bearing sentences that take opposing positions,
weighted by how far apart they were written. The slow, quiet kind of
self-disagreement — not the rhetorical kind.

**Drift (Mercury · Hg).** Which projects have changed meaning while I
wasn't looking? Basalt computes the embedding centroid trajectory of each
detected project and surfaces those whose first-window and last-window
centroids have rotated past a threshold. The classic case: a build-log
folder that quietly became a journal.

**Connection (Carbon · C).** Which notes are secretly the same idea?
Basalt finds pairs of notes whose embedded content is highly similar but
whose explicit link graph distance is high — i.e. you wrote the same thing
twice and never connected the two.

**Buried Insight (Gold · Au).** What old sentence does my current work keep
mining? Basalt finds sentences from notes older than a year that match
multiple recent notes within an embedding similarity threshold, and surfaces
them as quotes with parent-paragraph context.

The output is one Markdown file per Brief. Roman-numeral sections, five
short paragraphs, no charts, no dashboards. You read it like a personal
essay about your own thinking.

## What it is not

- **Not a chat interface.** I don't want to "talk to my notes." I want my
  notes to compile to a finding.
- **Not a search engine.** Search is necessary; this is orthogonal.
- **Not methodology software.** Basalt does not care if you use
  Zettelkasten, PARA, LATCH, or no system at all.
- **Not a cloud product.** The Open tier — CLI, Obsidian plugin, MCP server,
  desktop app — never makes a network call. Pro is hosted compute for
  people who don't want to run Ollama, and it's strictly opt-in.

## The three load-bearing properties

1. **No network in Open tier.** This is not a posture, it's a code-level
   guarantee. The engine never imports a network-aware module in the Open
   builds.
2. **Read-only on your vault.** Every adapter that touches the filesystem
   is grep-tested at build time — there is no code path from any adapter to
   `writeFile` or `unlink` against an existing path. Promote-to-note creates
   *new* files only.
3. **No methodology imposed.** The parser handles any plausible Markdown
   shape. Frontmatter is optional. Wikilinks, Markdown links, and inline
   citations are all first-class.

## How it works (briefly)

The engine is a TypeScript monorepo. The core is a small set of pure
modules: a Markdown parser with frontmatter and quote extraction, a link
graph builder, five verb implementations, an embedding adapter (Ollama by
default, BYOK to providers), and a SQLite migration set shared across every
surface.

The surfaces are thin wrappers:

- **CLI** wraps the engine with Commander, a TOML config file, and a Node
  filesystem adapter using `O_CREAT|O_EXCL` for atomic create-only writes.
- **Obsidian plugin** wraps the engine with sql.js for an in-vault index DB
  and an Obsidian Vault API filesystem adapter.
- **MCP server** wraps the engine with `@modelcontextprotocol/sdk` over
  stdio and intentionally omits promote-to-note — agents can describe a
  finding but only humans turn it into a note.
- **Desktop** is Tauri 2 with a Rust shell exposing `walk_vault` and
  `open_external` commands, and a React 19 + Tailwind v4 frontend.
- **Web cockpit** is React + TanStack Query talking to a Hono Workers API
  on Cloudflare, with D1 + KV + R2 + Vectorize for hosted state.

The Python prototype is preserved as a git submodule and used as a parity
oracle: every release runs a parity test suite that asserts the TS engine
produces structurally identical output to the Python original.

## Pricing

- **Open** — free, MIT-licensed, forever. CLI, plugin, MCP, desktop.
- **Pro** — $12/month. Hosted brief generation, E2EE vault sync, web cockpit.
- **Founder** — $240 one-time. Lifetime Pro. First 200 only.

No telemetry. No upsell modals. The Open tier is the actual product; Pro is
convenience layered on top for people who don't want to manage Ollama.

## Why now

I'm done waiting for "AI for your notes" to mean something other than
chat. The wedge here isn't model quality — it's *the right job*. Basalt's
job is to be the thing you read on a Sunday morning to feel oriented about
your own thinking. That job has not existed before in software I trust to
run against my own vault.

If the wedge resonates — try it. The CLI installs in one line.

```sh
npm install -g basalted
basalt init
basalt brief
```

basalted.com · github.com/plsft/basalt · docs.basalted.com

— George
