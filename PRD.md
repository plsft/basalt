# Basalt — Product Requirements Document

> *Reads your Markdown vault and surfaces what you believe but never wrote down.*
>
> A second-brain compiler that compiles the user, not the corpus.

| Field | Value |
| --- | --- |
| Document version | 1.1 |
| Owner | George Rios (tech lead) |
| Commercial entity | 1556 Ventures LLC (JV between George Rios and Fernando Villar) |
| Repository | `github.com/plsft/basalt` |
| Engine reference | [virtexvirtuoso/basalt](https://github.com/virtexvirtuoso/basalt) (Python, MIT — Fernando Villar). Frozen at the time of TS rewrite kickoff; iteration paused upstream; reference-only. |
| Marketing reference | [virtuosoai.dev/basalt](https://virtuosoai.dev/basalt/) |
| Target stack | TypeScript everywhere; Rust at the desktop shell; Cloudflare for cloud |
| Document status | Approved for execution |

---

## 0. How to Use This PRD With Claude Code

This document is the source of truth for product, architecture, and engineering principles. **Per-phase task lists live in `phases/PHASE-N.md`** and are loaded into context one phase at a time. Always read this PRD plus the active phase file together. The operating manual for Claude Code lives at `CLAUDE.md` at the repo root and is the contract for every session.

**Operating rules:**

1. Work one task at a time. A task is identified `TASK-X.Y` (Phase X, Task Y).
2. For every task, follow this exact loop:
   1. Create a git branch `task/<task-id>-<short-slug>`.
   2. Implement the task's *Spec*.
   3. Write or update tests as listed in the task's *Tests* section.
   4. Run the full relevant test suite. **All tests must pass.**
   5. Run `biome check`, `biome format`, `tsc --noEmit`. All must pass.
   6. Update `CHANGELOG.md` under the active `## Unreleased` heading.
   7. Commit with the prefix `[TASK-X.Y]`.
   8. Open a PR (or fast-forward merge for solo work) into `main`.
   9. Only after merge, move to the next task.
3. **Never skip a test gate.** If a test reveals an unanticipated dependency, write a follow-up task and surface it in the PR description; do not silently expand scope.
4. If a spec is ambiguous, stop and surface the ambiguity. Ambiguity is a defect.
5. Phase boundaries get a release tag: `v0.<phase>.0`. Public launch tags `v1.0.0`.

**Definition of Done (every task):**

- [ ] Code implements the task's *Spec*
- [ ] Tests in the *Tests* section are written and passing
- [ ] `tsc --noEmit` passes
- [ ] `biome check` passes
- [ ] `biome format --write` produces no diff
- [ ] No new dependencies added without justification in PR description
- [ ] CHANGELOG updated
- [ ] Branch merged into `main`

---

## 1. Executive Summary

Basalt is a local-first, read-only-by-default second-brain compiler. It reads a folder of Markdown — Obsidian vault, Logseq graph, plain `~/notes` — and produces *The Brief*: a finite, weekly, human-readable document about the user, with citation-grounded findings across five named verbs.

The reference Python implementation (Fernando Villar, MIT) ships Phase 0 of the five verbs, validated on a 1,683-note vault, with a working MCP server and calibration layer. **This PRD specifies the production rewrite in TypeScript**, single codebase across all surfaces, Cloudflare-native cloud tier, Tauri 2 desktop shell with system WebView.

**Wedge-first surface order** (see §7 for phasing): the Obsidian plugin is the first public surface, because the market is asking for it and because it is the lowest-friction way for the audience that has the pain to experience the product. The CLI and MCP follow as open-source credibility and AI-tool integration plays. Cloud, desktop, and marketing land on top of a validated wedge.

**Surfaces in scope for v1:**

| # | Surface | Stack | First ships in |
| --- | --- | --- | --- |
| 1 | Obsidian plugin | TypeScript + esbuild, Obsidian community marketplace | Phase 1 |
| 2 | CLI | TypeScript, Bun-compiled binary, npm-distributed | Phase 2 |
| 3 | MCP server | TypeScript, npm-distributed | Phase 2 |
| 4 | Cloud API | Cloudflare Workers + Hono | Phase 3 |
| 5 | Web cockpit | React + Tailwind v4 on Cloudflare Pages | Phase 3 |
| 6 | Desktop app | Tauri 2 (Rust shell, system WebView) + React + Tailwind v4 | Phase 4 |
| 7 | Marketing site | Astro static, carries forward Fernando's typographic design | Phase 5 |
| 8 | Docs site | Astro + Starlight, technical reference | Phase 5 |

**AI strategy:** Local-first by default (Ollama). BYOK supported. Basalt AI is the in-house Pro tier backed by Cloudflare Workers AI with curated prompts.

**Brand:** Carries forward Fernando's typographic, dignified, monospace-leaning design. Layered on top: a periodic-table motif anchored on **Sodium (Na)**, with each verb assigned an element identity.

**Out of scope for v1:** Mobile apps, real-time collaboration, multi-user shared vaults, browser extension, Phase-1 LLM-augmented verbs, full Action Layer (modify-existing-files capability).

---

## 2. Product Foundation

### 2.1 The Wedge

Every other tool in this space ships either *retrieval* ("find related notes") or *generation* ("summarize / extend this note") or *agent crews* (continuous chat-driven vault management). Basalt ships **structural reasoning across the corpus** — it figures out, without the user typing a query, what their projects are, what state they're in, what changed, what conflicts. The output is a Brief, not a chat. Set-and-forget, not always-on.

Three load-bearing properties — every other shipped product gives up at least one:

1. **No network calls in the Open tier.** Reading, embedding, reasoning all run on the user's machine.
2. **Read-only on the vault by default.** Basalt creates two artifacts (a Brief file, an index database) inside a single hidden folder. Existing `.md` files are never renamed, moved, modified, or rewritten. Promoting a finding to a new note creates a *new* file but does not modify any existing one. An optional Action Layer (post-v1) may permit explicit, user-approved edits to existing files; when off — and it is off by default — the read-only property holds absolutely.
3. **No methodology imposed.** No PARA, no Zettelkasten, no Building a Second Brain.

### 2.2 The Verbs

The Brief is composed of findings produced by named *verbs*. v1 ships five.

| Verb | Site language | Algorithm summary |
| --- | --- | --- |
| **Implicit Thesis** | *"The thing you keep saying without realizing you're saying the same thing."* | Tight-neighborhood (near-clique) clusters of 3–15 notes converging on an unnamed through-line. Centroid's load-bearing sentence is the proxy thesis. |
| **Contradiction** | *"The two notes you wrote that can't both be true."* | Pairs of same-topic notes whose load-bearing sentences carry asymmetric negation, reversal markers, or polarity pairs. v0 is heuristic — output is candidates. |
| **Drift** | *"What you say is the priority versus what you actually spent the week on."* | Stated priority (project-folder note count) vs lived priority (daily-note mentions over a 30-day window). Surfaces the largest divergence. |
| **Connection** | *"The two ideas in different folders that turn out to be the same idea."* | Pairs of notes across different top-level folders, no wikilink between them, embedding similarity ≥ 0.78. |
| **Buried Insight** | *"The note you forgot you wrote that recent work still depends on."* | A note older than the dormancy floor with N recent citations and no return visit since authorship. Vault-age-aware thresholds. |

Each verb shares primitives:

- **Sentence-aware quote extraction** — picks the punchline (em-dash, negation, conclusion-opener) over the setup line; strips Markdown noise; refuses cliffhangers.
- **Hub-note penalty** — outgoing-link-density per 100 words. Hard-excludes Maps of Content above 1.5; soft-penalizes 0.5–1.5 gray zone.
- **Vault-age-aware thresholds** — Buried Insight derives age/dormancy windows from the oldest note's date; clamped to sensible floors and ceilings.

Authoritative byte-level detail lives in `SPEC.md`, produced in TASK-0.3.

### 2.3 Promote-to-Note (Phase 1, ships with the plugin)

Findings can be promoted into the vault as **new** notes. Examples:
- An Implicit Thesis cluster's proxy sentence becomes a `Thesis: <topic>.md` note with the cluster's notes as wikilinks
- A Buried Insight becomes a `Resurfaced: <title>.md` note with the recent citing notes
- A Connection pair becomes a `Bridge: A ⇄ B.md` note with both notes wikilinked

Promotion is strictly file-creation. The new file goes into a user-configurable folder (default `<vault>/Basalt/`). If the target file already exists, promotion fails — Basalt never overwrites. This preserves §2.1's read-only-by-default property absolutely.

### 2.4 Phase-1 Verbs (deferred, architected in)

| Verb | Promotion | Requires |
| --- | --- | --- |
| **Implicit Thesis v1** | *named* — not a cluster, an actual sentence | LLM synthesis pass over v0 cluster |
| **Contradiction v1** | *proven* — not a candidate, a verdict | LLM pairwise compatibility classifier |
| **Drift v1** | *auto-audited* | Re-run on current window during `audit` |

(Note: "Phase 1" here refers to *verb generation*, not the project phase. These ship after `v1.0.0`.)

### 2.5 Brand Identity — Periodic Table of Sodium (Na)

Fernando's existing design language stays primary:
- Roman-numeral section headers (I · II · III)
- Monospace-leaning typography
- Lyrical, dignified copy
- Restraint over decoration
- Dark mode by default; light mode available

**Periodic table layer added on top.** Sodium is the anchor. Atomic number 11. Group 1 (alkali metals). The metaphor: Basalt extracts the elemental structure from your notes.

| Verb | Element | Symbol | Rationale |
| --- | --- | --- | --- |
| Implicit Thesis | Sodium | **Na** (11) | Foundational alkali. The through-line you keep seasoning your work with. |
| Contradiction | Chlorine | **Cl** (17) | Sodium's opposite. The two combine to form salt — the resolution. |
| Drift | Mercury | **Hg** (80) | The only metal liquid at room temperature. Drifts. |
| Connection | Carbon | **C** (6) | Forms more bonds than any other element. The connector. |
| Buried Insight | Gold | **Au** (79) | The buried treasure recent work keeps mining. |

**Color palette:**

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0E0D0C` | Primary background (basalt-black) |
| `--bg-raised` | `#181613` | Cards, modals, raised surfaces |
| `--ink` | `#F5F1E8` | Primary text (warm bone) |
| `--ink-dim` | `#A89F8E` | Secondary text |
| `--rule` | `#2A2622` | Borders, dividers |
| `--accent-na` | `#F2C75C` | Sodium gold — primary accent, CTAs, Implicit Thesis |
| `--accent-cl` | `#7CC4A1` | Chlorine green — Contradiction |
| `--accent-hg` | `#9CA3AF` | Mercury silver — Drift |
| `--accent-c` | `#5B6677` | Carbon graphite — Connection |
| `--accent-au` | `#D4A857` | Gold patina — Buried Insight |
| `--danger` | `#C8553D` | Errors, destructive actions |

Final palette is tuned in TASK-5.1 against Fernando's live CSS.

**Typography:**

| Role | Family |
| --- | --- |
| Display | `Fraunces` (variable) — large headlines |
| Body | `Source Serif 4` — long-form prose in the Brief |
| UI / mono | `JetBrains Mono` — code, terminal, periodic tile labels |

### 2.6 Positioning & Voice

The PRD's working one-liner is *"compiles you, not the corpus."* Test alternatives in TASK-5.3 against the audience that the PDF market research surfaced:

- *"Stop managing your system. Let the system manage itself."*
- *"Your vault already knows. Basalt just tells you."*
- *"The weekly editor for your second brain."*
- *"One Brief per week. Read-only on your vault. No chat. No maintenance."*

The winning copy is whichever produces highest engagement on a side-by-side test in seed channels (X replies, Reddit, founder warm network) before launch. Lock the choice before TASK-5.3.

**Tonal anchors:**
- Dignified, not breathless
- Concrete, not aspirational
- Restraint over decoration — no Lottie, no parallax, no AI-generated hero imagery
- Real artifacts (terminal recordings, anonymized Briefs) over staged screenshots

---

## 3. Technical Architecture

### 3.1 Monorepo Structure

Single repo, Bun workspaces, TypeScript everywhere except the Rust shell of the desktop app.

```
basalt/
├── package.json                # workspace root, bun workspaces
├── biome.json                  # lint + format
├── tsconfig.base.json          # shared TS config
├── CLAUDE.md                   # operating manual for Claude Code
├── PRD.md                      # this document
├── SPEC.md                     # verb algorithm spec (produced in TASK-0.3)
├── CHANGELOG.md
├── README.md
├── LICENSE                     # MIT
│
├── reference/                  # git submodule → virtexvirtuoso/basalt, pinned at a tag
│
├── phases/                     # per-phase task files
│   ├── PHASE-0.md
│   ├── PHASE-1.md
│   ├── PHASE-2.md
│   ├── PHASE-3.md
│   ├── PHASE-4.md
│   ├── PHASE-5.md
│   └── PHASE-6.md
│
├── packages/
│   ├── core/                   # basalted-core — runtime-agnostic engine
│   ├── obsidian-plugin/        # basalted-obsidian-plugin
│   ├── cli/                    # basalted — Bun-compiled binary
│   ├── mcp/                    # basalted-mcp
│   ├── api/                    # basalted-api — Cloudflare Workers + Hono
│   ├── web/                    # basalted-web — React + Tailwind v4 on Pages
│   ├── desktop/                # basalted-desktop — Tauri 2 + React + Tailwind v4
│   ├── site/                   # basalted-site — marketing site (Astro)
│   ├── docs/                   # basalted-docs — docs site (Astro + Starlight)
│   └── ui/                     # basalted-ui — shared React components, brand tokens
│
├── tests/
│   ├── parity/                 # Python ↔ TS golden output tests
│   └── e2e/                    # cross-surface end-to-end tests
│
├── docs/
│   ├── decisions/              # ADRs
│   ├── parsing-decisions.md    # parser TS-vs-Python deltas
│   └── perf-results.md
│
└── scripts/
    ├── generate-baseline.sh    # runs Python CLI to regenerate parity baselines
    └── release.sh              # orchestrates phase-tag releases
```

### 3.2 Core Engine — `basalted-core`

The single source of truth. Runtime-agnostic. No Node APIs. No `fs`, no `process`. Everything filesystem- or environment-specific is behind an adapter interface.

**Public surface:**

```typescript
export { Engine } from "./engine";
export type { EngineOptions, Brief, Finding } from "./types";
export { verbs } from "./verbs";
export type { Verb, VerbResult } from "./verbs/types";
export { promoteFindingToNote } from "./promote";
export type { NoteContent, PromoteOptions } from "./promote";
export type { StorageAdapter, EmbeddingAdapter, FilesystemAdapter, AIAdapter } from "./adapters";
```

**Internal layout:**

```
packages/core/src/
├── index.ts
├── engine.ts                   # orchestrator: index, brief, audit
├── types.ts                    # Brief, Finding, Note, Link, Embedding
├── adapters/
│   ├── index.ts                # interfaces only
│   ├── storage.ts
│   ├── embedding.ts
│   ├── filesystem.ts
│   └── ai.ts
├── parser/
│   ├── markdown.ts             # unified + remark + frontmatter + wiki-link
│   ├── sentences.ts            # sentence segmentation + load-bearing extraction
│   └── frontmatter.ts
├── graph/
│   ├── builder.ts              # vault → link graph
│   ├── cliques.ts              # near-clique detection
│   └── hub-penalty.ts          # MOC detection
├── math/
│   ├── cosine.ts
│   ├── vector.ts               # dot, norm, mean
│   └── thresholds.ts           # vault-age-aware threshold derivation
├── verbs/
│   ├── index.ts
│   ├── types.ts
│   ├── thesis.ts               # Implicit Thesis (Na)
│   ├── contradiction.ts        # Contradiction (Cl)
│   ├── drift.ts                # Drift (Hg)
│   ├── connection.ts           # Connection (C)
│   └── buried.ts               # Buried Insight (Au)
├── brief/
│   ├── compose.ts
│   └── render.ts               # render to Markdown / HTML / JSON
├── promote/
│   ├── index.ts                # promoteFindingToNote(finding) → NoteContent
│   └── templates/              # per-verb note templates
└── audit/
    └── calibration.ts
```

### 3.3 Adapter Pattern

```typescript
// StorageAdapter
export interface StorageAdapter {
  init(): Promise<void>;
  upsertNote(note: NoteRecord): Promise<void>;
  getNote(path: string): Promise<NoteRecord | null>;
  upsertEmbedding(path: string, vector: Float32Array): Promise<void>;
  getEmbedding(path: string): Promise<Float32Array | null>;
  listNotes(): AsyncIterable<NoteRecord>;
  listEmbeddings(): AsyncIterable<{ path: string; vector: Float32Array }>;
  upsertFinding(finding: PersistedFinding): Promise<void>;
  listFindings(opts?: ListFindingsOptions): Promise<PersistedFinding[]>;
  close(): Promise<void>;
}

// EmbeddingAdapter
export interface EmbeddingAdapter {
  embed(texts: string[]): Promise<Float32Array[]>;
  dimension(): number;
  modelId(): string;
}

// FilesystemAdapter — read-only by design
export interface FilesystemAdapter {
  walk(root: string): AsyncIterable<{ path: string; mtime: number }>;
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  // create-only, never overwrite. Returns false if target exists.
  createNoteFile(path: string, content: string): Promise<boolean>;
}

// AIAdapter (post-v1 LLM verbs)
export interface AIAdapter {
  complete(opts: CompletionRequest): Promise<CompletionResponse>;
  modelId(): string;
}
```

`createNoteFile` is the only mutation primitive in `FilesystemAdapter`. It is strictly create-only: implementations must reject if the target path exists. This preserves §2.1's read-only-by-default while enabling §2.3 promote-to-note.

**Implementations by surface:**

| Adapter | Plugin (Phase 1) | CLI / MCP (Phase 2) | Cloud (Phase 3) | Desktop (Phase 4) |
| --- | --- | --- | --- | --- |
| Storage | sql.js / IndexedDB | better-sqlite3 | D1 + Vectorize | @tauri-apps/plugin-sql |
| Embedding | Ollama HTTP | Ollama HTTP | Workers AI | Ollama HTTP |
| Filesystem | Obsidian Vault API | fs/promises | R2 (opt-in sync) | @tauri-apps/plugin-fs |

### 3.4 Stack Decisions

| Concern | Choice | Rationale |
| --- | --- | --- |
| Package manager + workspaces | Bun | Fast install, native TS, monorepo support |
| Lint + format | Biome | Single binary, faster than ESLint+Prettier |
| Test runner | Vitest | Fast, ESM-native, watch mode |
| Markdown parsing | unified + remark + remark-frontmatter + remark-wiki-link | De facto standard, AST-based, deterministic |
| Graph operations | graphology + graphology-traversal + graphology-communities-louvain | Well-tested, browser+node |
| Vector math | Hand-rolled | Runtime portability matters |
| HTTP client | Native `fetch` | Universal across runtimes |
| SQL (plugin) | sql.js | WASM SQLite for Obsidian's Electron sandbox |
| SQL (CLI/MCP) | better-sqlite3 | Standard, fast, single-file |
| SQL (desktop) | @tauri-apps/plugin-sql | First-class Tauri SQLite |
| SQL (cloud) | D1 | Native to Workers |
| API framework | Hono | Cloudflare-native, edge-friendly |
| React build | Vite | Fast dev, Tauri-aligned |
| Styling | Tailwind v4 + brand-tokens preset | Consistent across surfaces |
| Component library | Custom in `basalted-ui` | Brand too specific for off-the-shelf |
| Auth (cloud) | better-auth + Google/GitHub OAuth | Cloud-tier only |
| Billing | Stripe Checkout | Standard, low integration cost |
| Desktop shell | Tauri 2 + system WebView (Rust) | Fastest cold start, lowest idle memory; mac/Linux/Windows day one; aligns with Workjet |
| Marketing/Docs | Astro / Astro+Starlight | Static, content-friendly, MDX |

---

## 4. Surfaces

Order below reflects v1 ship order (Phase 1 → Phase 5).

### 4.1 Obsidian Plugin — `basalted-obsidian-plugin`

**Purpose:** First public surface and primary distribution wedge. The audience that has the pain lives inside Obsidian; meet them there.

**Architecture:** Thin surface over `basalted-core`. Engine runs in-process inside Obsidian's Electron host. Storage: Obsidian `Vault` API for read + `sql.js` (WASM SQLite) for write. The plugin's `FilesystemAdapter` implementation calls `createNoteFile` (and only `createNoteFile`) when the user clicks Promote.

**UI:**
- Custom view: "Basalt Brief" (full-pane)
- Sidebar: Na-tile button in the left ribbon triggers `Generate Brief`
- Settings tab: vault paths, Ollama URL, BYOK keys, brief cadence, promote-to folder
- Status bar: indexing progress
- Per-finding inline actions: **Promote** (creates a new note), Snooze, Dismiss

**Constraints (architectural, non-configurable):**
- The plugin must not modify the user's existing `.md` files. Ever.
- The plugin must work fully offline (Open tier).
- Index lives at `<vault>/.basalt/`.
- Promotion creates new files only; if a target file already exists, promotion fails with a clear error.

**Distribution:** PR to `obsidian-releases` for community marketplace; pre-marketplace distribution via BRAT (Beta Reviewers Auto-update Tool) for early access.

### 4.2 CLI — `basalted`

**Purpose:** Open-source credibility artifact for the HN/Show HN/dev-tools audience. Replaces Fernando's Python CLI as the open-source flagship.

**Distribution:** `npm install -g basalted`; single-binary builds for macOS/Linux/Windows via `bun build --compile`; Homebrew formula post-launch.

**Commands (mirror Fernando's Python surface):**

```
basalt init [--vault PATH]
basalt index [--vault PATH] [--force]
basalt brief [--section SECTION] [--top N]
basalt thesis | drift | connection | contradiction | buried
basalt promote <finding-id> [--out PATH]      # writes a new note from a finding
basalt audit
basalt demo
basalt about
```

**Configuration:** `~/.basalt/config.toml` (cross-platform via `env-paths`).

### 4.3 MCP Server — `basalted-mcp`

**Purpose:** Distribution into Claude Desktop, Cursor, Cline, Zed, VS Code Copilot.

**Tools exposed:** `basalt_brief`, `basalt_connection`, `basalt_contradiction`, `basalt_drift`, `basalt_audit`. Read-only on vault. Promote is intentionally not exposed via MCP — file creation belongs to a surface where the user can see the result, not a tool that returns text to a chat.

**Distribution:** `npm install -g basalted-mcp` + Claude Desktop config snippet at the docs site.

### 4.4 Cloud API — `basalted-api`

**Purpose:** Pro tier backend. Cloud-side indexing, scheduled brief generation, BYOK pass-through, Basalt-AI inference, billing.

**Stack:** Hono on Cloudflare Workers.

**Cloudflare resources:** see Appendix A.

**Endpoints (v1):**

```
POST   /v1/auth/oauth/start
POST   /v1/auth/oauth/callback
GET    /v1/me
DELETE /v1/me

POST   /v1/vaults
POST   /v1/vaults/:id/index
GET    /v1/vaults/:id/index/:jobId

POST   /v1/briefs/generate
GET    /v1/briefs/:id
GET    /v1/briefs?vault=…&limit=…

POST   /v1/findings/:id/promote
POST   /v1/findings/:id/snooze
POST   /v1/findings/:id/dismiss

POST   /v1/ai/embed
POST   /v1/ai/synthesize

POST   /v1/billing/checkout
POST   /v1/billing/webhook

POST   /v1/keys
DELETE /v1/keys/:provider
```

**Privacy posture:** Pro-tier raw notes processed in-memory in Workers; only derived index data and finding metadata persist. Raw Markdown never durably stored unless user opts into "vault sync" — separate, opt-in, never default.

### 4.5 Web Cockpit — `basalted-web`

**Stack:** React + Tailwind v4 + Vite. Deploys to Cloudflare Pages. Talks to `basalted-api`.

| Route | Purpose |
| --- | --- |
| `/` | Latest Brief |
| `/briefs` | History |
| `/briefs/:id` | Full Brief render with citations and one-click actions |
| `/timeline` | Drift, theses-over-time, connection density chart |
| `/vaults` | Multi-vault management |
| `/settings` | Account, BYOK, billing, privacy |

Brief renderer must be visually consistent with plugin and desktop (shared `basalted-ui`).

### 4.6 Desktop App — `basalted-desktop` (Tauri 2)

**Purpose:** Standalone app for users who don't use Obsidian but have a folder of markdown.

**Stack:** Tauri 2 (Rust shell, system WebView) + React + Tailwind v4 + Vite.

**Performance targets (hard requirements):**
- **Cold start: < 800 ms to interactive**
- **Idle memory: < 100 MB**

These targets drove the framework selection. Electron and CEF-bundled options were rejected on these grounds. System WebView is fast enough for Brief rendering.

**Tauri plugins:**

| Plugin | Use |
| --- | --- |
| `@tauri-apps/plugin-fs` | Vault read access, scoped paths |
| `@tauri-apps/plugin-sql` | SQLite for index storage |
| `@tauri-apps/plugin-shell` | Spawning local Ollama if absent |
| `@tauri-apps/plugin-dialog` | Native folder picker |
| `@tauri-apps/plugin-notification` | Brief-ready notifications |
| `@tauri-apps/plugin-updater` | Signed auto-updates |
| `@tauri-apps/plugin-os` | Platform detection |

**Custom Tauri commands (Rust → JS):**

| Command | Purpose |
| --- | --- |
| `pick_vault_path` | Folder picker, returns absolute path |
| `walk_vault(root)` | Async iterator emitter for vault walk |
| `get_ollama_status` | Check if local Ollama HTTP is reachable |
| `start_ollama` | Spawn Ollama (user-confirmed) |
| `open_external(url)` | Open URL in default browser |
| `vault_scope_grant(path)` | Add vault path to allowed FS scope |

**Packaging:**
- macOS: signed `.dmg` via Apple Developer ID, notarized
- Windows: signed `.msi` via Authenticode
- Linux: `.deb`, `.rpm`, AppImage
- Auto-update via Tauri updater pointing at a release manifest hosted on R2

### 4.7 Marketing Site — `basalted-site`

**Stack:** Astro, deployed to Cloudflare Pages.

**Pages:** `/`, `/install`, `/pricing`, `/privacy`, `/changelog`, `/blog`, `/compat` (compatibility narratives, including obsidian-skills).

**Design directives:**
- Roman numeral section markers (I · II · III)
- Monospace headers + serif body for prose
- Dark-default, brand palette from §2.5
- Periodic-table tiles as section anchors
- Dignified micro-interactions; no Lottie/parallax/AI hero illustrations
- Real terminal recording of `basalt demo` as the hero artifact
- Real anonymized Brief shown as a `<pre>` block

Visual fidelity confirmed against Fernando's CSS in TASK-5.1.

### 4.8 Docs Site — `basalted-docs`

**Stack:** Astro + Starlight, Cloudflare Pages, `docs.<domain>`.

**Sections:** Getting Started (per surface), Verbs reference, Promote-to-note guide, BYOK setup, Privacy & threat model, API reference, Compatibility (obsidian-skills, Claude Code), Migration guide (Python → TS).

---

## 5. AI Strategy

### 5.1 Local-First (Open tier)

- Default: Ollama with `nomic-embed-text` (768-dim)
- Optional: `bge-m3` via Ollama (multilingual, longer context)
- Post-v1 LLM verbs not in v1 scope but architected: any local Ollama-served model can power synthesis when added

### 5.2 BYOK (Bring Your Own Key)

| Provider | Embeddings | LLM (post-v1) |
| --- | --- | --- |
| OpenAI | text-embedding-3-small, -large | gpt-4o, gpt-4o-mini |
| Anthropic | (Voyage when available) | claude-sonnet-4-6, claude-opus-4-7 |
| Google | text-embedding-005 | gemini-2.5-pro, gemini-2.5-flash |
| Mistral | mistral-embed | mistral-large |
| Cohere | embed-v4.0 | command-r-plus |
| Self-hosted Ollama | any | any |

**Key storage:**
- Plugin: encrypted at rest in Obsidian's settings storage (limitation documented; not OS keychain on this surface)
- CLI / MCP / Desktop: OS keychain (macOS Keychain, libsecret, Windows Credential Manager)
- Web: encrypted at rest in Cloudflare KV, encryption key in Workers Secrets

### 5.3 Basalt AI (Pro tier)

Backed by Cloudflare Workers AI with curated prompts.

| Capability | Workers AI model |
| --- | --- |
| Embeddings | `@cf/baai/bge-m3` (1024 dim, multilingual) |
| Synthesis (post-v1) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Cheap synthesis | `@cf/qwen/qwen2.5-coder-32b-instruct` |
| Long-context fallback | `@cf/google/gemma-3-12b-it` |

Curated prompts in `packages/api/src/prompts/`, versioned with the API.

### 5.4 Privacy guarantees by tier

| Tier | What leaves the device |
| --- | --- |
| Open (default) | Nothing. No telemetry, no analytics, no error reports. |
| Open + BYOK | Note text → user's chosen provider per their own ToS |
| Pro (default) | Only the *distilled brief structure* (finding objects, citations) |
| Pro + Vault Sync (opt-in) | Raw notes encrypted at rest in R2 |

---

## 6. Engineering Principles

### 6.1 Code Style

- TypeScript strict mode. `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- No `any`. Use `unknown` and narrow with type guards.
- No default exports in libraries. Named exports only.
- Single-purpose modules. Files over ~400 lines are usually doing too much.
- No global state. Inject dependencies.
- Errors are typed (`Result<T, E>` via `neverthrow` or hand-rolled).

### 6.2 Testing Discipline

- Unit tests colocated (`foo.test.ts` next to `foo.ts`)
- Parity tests in `tests/parity/`, compare TS output to Python baseline
- Integration tests in each package's `__tests__/integration/`
- E2E tests in `tests/e2e/`
- Coverage: 85%+ on `basalted-core`, 70%+ elsewhere
- Every bug fix gets a regression test before the fix

### 6.3 Git Workflow

- Trunk-based. `main` always shippable.
- Branch per task: `task/<task-id>-<slug>`
- Squash-merge to `main`. Tag at phase boundaries.
- No force-pushes to `main`.
- Hooks via `lefthook`:
  - `pre-commit`: biome format + biome check
  - `pre-push`: vitest run on changed packages

### 6.4 Performance Budgets

| Surface | Budget |
| --- | --- |
| Engine `index` on 1,000-note vault | < 30s cold, < 5s warm |
| Engine `brief --section all` | < 5s after index |
| Plugin idle memory | < 50 MB above Obsidian baseline |
| Plugin index on 10,000-note vault | < 5 minutes |
| Desktop cold start | **< 800 ms to interactive** |
| Desktop idle memory | **< 100 MB** |
| API `/v1/briefs/generate` p95 | < 8s |
| Marketing site Lighthouse | ≥ 95 across all categories |

Budgets enforced in CI via fixture benchmarks.

### 6.5 Accessibility

- Keyboard-navigable, screen-reader friendly
- Color is never the only signal (verbs distinguishable by text + element symbol)
- WCAG AA contrast minimum
- Reduced-motion respected

### 6.6 Internationalization

- v1 ships English only.
- All user-facing strings in `packages/<surface>/src/i18n/en.json` from day one.

---

## 7. Phased Execution Plan

| Phase | Goal | File | Target tag |
| --- | --- | --- | --- |
| **0** | Foundation, monorepo, spec extraction, parity baselines | `phases/PHASE-0.md` | `v0.0.1` |
| **1** | Core engine + Obsidian plugin (the wedge) | `phases/PHASE-1.md` | `v0.1.0` |
| **2** | CLI + MCP server (OSS credibility + AI integration) | `phases/PHASE-2.md` | `v0.2.0` |
| **3** | Cloudflare API + Web cockpit (Pro tier) | `phases/PHASE-3.md` | `v0.3.0` |
| **4** | Tauri 2 desktop app | `phases/PHASE-4.md` | `v0.4.0` |
| **5** | Marketing site + docs site | `phases/PHASE-5.md` | `v0.5.0` |
| **6** | Public launch | `phases/PHASE-6.md` | `v1.0.0` |

**Sequencing rationale:**
- Phase 0 establishes the parity contract and CI gates.
- Phase 1 ships the wedge surface — the Obsidian plugin — backed by a fully validated engine. The plugin is the surface the market is asking for; landing it first puts Basalt in the conversation while the category is forming.
- Phase 2 ships the credibility surfaces — CLI for the HN/dev audience, MCP for the AI-tool integration audience. Both reuse the engine validated in Phase 1.
- Phase 3 introduces the Pro tier. Plugin and CLI get optional cloud sync.
- Phase 4 ships the desktop app for non-Obsidian markdown users.
- Phase 5 produces the marketing and docs surfaces against a shipped product, not against speculation.
- Phase 6 executes the public launch.

Phases 0–1 are critical path. Phases 2–5 can interleave once Phase 1 ships, but the recommended order (2 → 3 → 4 → 5) keeps cognitive load manageable and respects the dependency from Pro-tier (Phase 3) on CLI/MCP infrastructure (Phase 2).

---

## 8. Test Strategy

### 8.1 Parity Tests (Python ↔ TypeScript)

```
tests/parity/
├── fixtures/
│   ├── sample-vault-14/        # bundled with Fernando's repo
│   └── test-vault-large/       # synthetic 200-note vault
├── baseline/
│   ├── sample-14-brief.json
│   ├── sample-14-thesis.json
│   ├── sample-14-contradiction.json
│   ├── sample-14-drift.json
│   ├── sample-14-connection.json
│   ├── sample-14-buried.json
│   ├── large-200-brief.json
│   └── large-200-{thesis,contradiction,drift,connection,buried}.json
├── ts.test.ts
└── README.md
```

**Tolerance:**
- Embedding similarity scores: ε = 1e-5
- Set membership of returned findings: exact match required
- Ordering: exact match (ties broken deterministically)
- Citation paths: exact match
- Quote extraction: exact match

**Regenerating baselines:** `scripts/generate-baseline.sh` runs Python CLI against fixtures, writes JSON into `tests/parity/baseline/`. Baselines checked into git. Intentional algorithm changes regenerate baseline + CHANGELOG entry.

### 8.2 Unit / Integration / E2E

- Unit: per-module, colocated, fast, deterministic
- Integration: per-package, real SQLite (in-memory), real fetch against mocks
- E2E: `wrangler dev` for API, web app against it, desktop via Tauri test driver, plugin in test Obsidian instance
- Performance: `packages/core/bench/`, CI fails on >10% regression

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Markdown parser disagreement Python ↔ TS on edge cases | High | High | Stress-test parser early (TASK-1.2); maintain `docs/parsing-decisions.md` |
| Embedding non-determinism between Ollama runs | Low | Medium | ε-tolerance in tests; pin Ollama model versions in CI |
| `sql.js` performance in Obsidian plugin on large vaults | High | High | Benchmark on 10k vault in TASK-1.4 (early); fall back to flat IndexedDB if needed; budget gate the phase |
| Vectorize index size limits for >100k-note vaults | Medium | Medium | Document supported size per tier; multiple indices keyed by vault id |
| Tauri auto-update signing key compromise | Low | High | Offline signing key, separate identity, rotate annually |
| Fernando's Python repo evolves during rewrite | Low | Medium | Mitigated by §10 #3 — Python repo frozen; submodule pin held; divergences land in TS only and are recorded in `docs/parsing-decisions.md` |
| Workers AI model deprecation | Medium | Medium | Synthesis adapter abstracts logical → physical model name |
| Brand collision — "Basalt" exists as other software | High | Medium | Trademark check in productivity software class; alternates ready |
| Market window closes before Phase 1 plugin ships | Medium | High | Plugin is Phase 1 (was Phase 2 in v1.0 of the PRD); critical-path tasks identified; consider parallel Python-plugin teaser if Fernando agrees |
| Audience confusion between Python repo and TS rewrite | Medium | Medium | Clear migration page on docs site; coordinated launch messaging; `reference/` submodule visible from main repo |

---

## 10. Decisions

Status tags: **[RESOLVED]** — locked, work to this answer. **[DEFERRED]** — call deliberately postponed; not blocking. **[OPEN]** — needs a founder-level call before the referenced phase.

1. **[RESOLVED] Brand & entity ownership.** Commercial entity is **1556 Ventures LLC**, a JV between George Rios and Fernando Villar. Equity, IP, brand ownership, and the relationship between 1556 Ventures and `virtuosoai.dev/basalt` are governed by the JV operating agreement. All Basalt artifacts (TS rewrite, marketing site under final domain, Pro-tier billing) operate under 1556 Ventures.
2. **[RESOLVED] Repo location.** `github.com/plsft/basalt` for now. Migration to a 1556-Ventures-owned org may happen later but is not gating; transfer is a one-line git operation.
3. **[RESOLVED] Fernando's Python repo during the rewrite.** **Frozen, for reference only.** Fernando pauses Python iteration. The TS rewrite is the forward path. `reference/` submodule pins to whatever tag is current at TASK-0.1 and stays there. No parity churn from upstream. If a parser or verb edge case surfaces during porting and requires a Python-side fix, the choice is to land it in TS only and document the divergence in `docs/parsing-decisions.md` rather than reopen the Python repo.
4. **[DEFERRED] Reference tag.** Choose the latest stable Python tag at start of TASK-0.1. Not blocking; pick at the moment of submodule registration.
5. **[OPEN — Phase 0] Domain.** `basalt.computer`, `basaltapp.io`, `basalt.so`, or stay under virtuosoai.dev? Trademark check first.
6. **[OPEN — Phase 1] Promote-to-note default folder.** `<vault>/Basalt/`? `<vault>/Briefs/`? User-configurable in settings is the answer; the default needs to be picked and documented.
7. **[OPEN — Phase 3] Pro tier price.** Site copy says $12/mo. Validate against actual Workers AI cost; adjust if margin <60%.
8. **[OPEN — Phase 3] Founder tier mechanics.** $240 lifetime, capped at 100. Confirm Stripe one-time pricing and lifetime entitlement.
9. **[OPEN — Phase 5] Positioning lock.** Test the alternatives in §2.6 against seed-channel engagement; lock the winning one-liner before TASK-5.3.
10. **[OPEN — Phase 5] obsidian-skills compatibility.** Confirm with the obsidian-skills maintainer (kepano / Steph Ango at Obsidian) before publishing the compatibility narrative. Goodwill outreach, not a partnership ask.
11. **[OPEN — Phase 6] Launch sequencing.** HN + Show HN + ProductHunt + X + warm-network blast — order TBD by readiness. PDF market research lists specific high-engagement X posts to seed; reference them in TASK-6.3.
12. **[OPEN — Post-v1] Action Layer scope.** When v1 has shipped and feedback is in, decide whether to ship a full Action Layer (modify existing files under user approval) or hold the line at promote-only. The PDF flagged this as audience demand; the architectural cost is real (read-only-by-default becomes "by default but with an off-switch"). Default position: hold the line until shipped product validates the promote-only approach.

---

## Appendix A — Cloudflare Resource Map

```
Cloudflare account
└── basalt-prod/
    ├── Workers
    │   └── basalt-api
    ├── Pages
    │   ├── basalt-web
    │   ├── basalt-site
    │   └── basalt-docs
    ├── D1
    │   └── basalt-prod-db
    ├── Vectorize
    │   └── basalt-prod-vectors             # 1024-dim, bge-m3
    ├── R2
    │   ├── basalt-briefs
    │   ├── basalt-releases
    │   └── basalt-vault-sync
    ├── KV
    │   ├── basalt-sessions
    │   ├── basalt-rate-limits
    │   └── basalt-byok-keys
    ├── Durable Objects
    │   └── VaultIndexer
    ├── Workers AI
    ├── Workflows
    │   └── IndexVault
    ├── Queues
    │   └── basalt-index-jobs
    └── Cron Triggers
        └── weekly-brief                    # Sunday 23:00 UTC
```

A `basalt-staging` account mirrors with `staging-` prefixes.

---

## Appendix B — Glossary

| Term | Definition |
| --- | --- |
| Brief | The single weekly artifact Basalt produces. |
| Verb | A named cognitive operation that produces findings. |
| Finding | A single instance of a verb's output. |
| Citation | A reference from a finding back to a vault note, by exact path + line range. |
| Promote | Action to create a new vault note from a finding. Strictly create-only. |
| Action Layer | Hypothetical post-v1 capability to modify existing vault files under user approval. Off by default. Out of scope for v1. |
| Vault | The user's folder of Markdown files. |
| Vault age | Days since the oldest note in the vault. Drives age-aware thresholds. |
| Hub note | A Map of Content — high outgoing-link density, low prose. Excluded from most verb outputs. |
| Load-bearing sentence | The sentence in a note most representative of its claim. |
| Calibration | The audit layer's track record of past findings. |
| Element | The periodic-table identity assigned to each verb (Na, Cl, Hg, C, Au). |
| Open tier | Free, local, MIT-licensed plugin/CLI/MCP/desktop. No accounts, no network. |
| Pro tier | Paid, cloud-augmented. $12/mo. Brief-structure leaves device, never raw notes. |
| Founder tier | $240 one-time, lifetime Pro, first 100 only. |
| Vault Sync | Optional Pro feature: encrypted raw vault upload to R2. |
| Wedge | The first surface that lands the product in the audience that has the pain — the Obsidian plugin. |
