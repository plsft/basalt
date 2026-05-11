# Phase 5 — Marketing Site + Docs Site

> **Goal:** Ship the marketing site (`basalted-site`) and docs site (`basalted-docs`) under whatever final domain has been chosen. Marketing carries forward Fernando's typographic, dignified design with the sodium/periodic-table layer. Docs is technical reference for every surface.
>
> **Target tag:** `v0.5.0`
>
> **Estimated duration:** 2–3 weeks

The marketing site is the wedge into trust. It must look like the work of someone who would build software you can rely on. No AI-generated hero illustrations, no parallax circus, no Lottie. Real terminal recordings, real anonymized Briefs.

---

## TASK-5.1 — Extract design tokens from Fernando's live CSS

**Spec:**

Before writing any new code, capture Fernando's existing design as concrete tokens:

- Load `https://virtuosoai.dev/basalt/`
- Inspect computed styles for:
  - All used color values (background, foreground, accents, links, borders, code blocks)
  - All font-families and their fallback chains
  - All font-sizes used (build a type scale)
  - All font-weights used
  - All line-heights used
  - All spacing values (padding, margin, gap)
  - All border-radius values
  - All transition durations and easings
- Map captured values to brand tokens defined in PRD §2.4
- Where Fernando's values differ from the PRD's draft palette, prefer Fernando's (he designed the brand) and update PRD §2.4 if a delta is intentional and material
- Write final design tokens into `packages/ui/src/tokens.ts` as exported constants
- Build a Tailwind v4 preset in `packages/ui/src/tailwind.preset.ts` that consumes tokens
- Document any deltas in `docs/brand-decisions.md`

**Files created/modified:**
```
packages/ui/src/tokens.ts                    # finalized tokens
packages/ui/src/tailwind.preset.ts           # Tailwind v4 preset
PRD.md                                        # update §2.4 if any tokens shifted
docs/brand-decisions.md                       # rationale for any deltas
```

**Tests:**
- Visual diff: render a sample component (e.g. ElementTile, Brief title) against a screenshot of Fernando's live site at the same scale; the typographic register must be unmistakably the same
- Unit: tokens.ts exports are typed and complete

**Definition of Done:** Standard DoD + visual comparison verified by George.

**Notes:**
- This task is foundational for both `basalted-site` and `basalted-docs`. It also retroactively informs `basalted-web` and `basalted-desktop` UI — when this lands, run a sweep across all surfaces to update them to the finalized tokens.

---

## TASK-5.2 — Scaffold `basalted-site` (Astro)

**Spec:**
- Set up `packages/site/` with Astro + TypeScript
- Install `@astrojs/tailwind`, `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`
- Configure Tailwind to use `basalted-ui`'s preset
- Create base layout `src/layouts/Default.astro` with:
  - `<head>` metadata: OG tags, Twitter card, favicon (Na-tile), preloaded fonts
  - Header: minimal nav (logo, Install, Pricing, Privacy, Docs)
  - Footer: element strip (Na · Cl · Hg · C · Au), copyright, GitHub link, Privacy link
- Configure deploy to Cloudflare Pages
- Set up CI workflow `.github/workflows/deploy-site.yml`

**Files created:**
```
packages/site/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/
│   ├── favicon.svg                  # Na tile
│   ├── og-image.png                 # generated from a Brief excerpt
│   └── fonts/                       # self-hosted Fraunces, Source Serif 4, JetBrains Mono
├── src/
│   ├── layouts/
│   │   ├── Default.astro
│   │   └── Article.astro            # for blog posts
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── ElementTile.astro
│   │   └── BriefPreview.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── install.astro
│   │   ├── pricing.astro
│   │   ├── privacy.astro
│   │   ├── changelog.astro
│   │   └── blog/
│   │       └── index.astro
│   ├── content/
│   │   ├── blog/                    # MDX blog posts
│   │   └── changelog.mdx
│   └── styles/
│       └── global.css               # base typography, tokens
└── README.md

.github/workflows/deploy-site.yml
```

**Tests:**
- `astro build` produces clean static output
- Lighthouse score ≥ 95 across Performance, Accessibility, Best Practices, SEO
- All routes 200 in a local preview server
- OG image renders correctly when shared on social platforms (manual)

**Definition of Done:** Standard DoD.

---

## TASK-5.3 — Implement landing page (`/`)

**Spec:**

The landing page carries forward Fernando's structure with brand layered on top. Roman-numeral sections, monospace-leaning headers, dignified prose, restraint over decoration.

Sections (in order):

- **I — The Promise.** One-sentence headline: "Basalt reads your notes and tells you what you're really working on." Subhead picks up the *"compiles you, not the corpus"* line. Single CTA: "Install".
- **II — The Verbs.** Five element tiles (Na, Cl, Hg, C, Au) in a row. Each tile, when hovered or tapped, reveals the verb's site-language description and a short concrete example.
- **III — A Real Brief.** Anonymized Brief from George's own vault rendered in a `<pre>` block with the actual Markdown formatting. This is the trust artifact.
- **IV — The Demo.** Real terminal recording of `basalt demo` running. Use `asciinema` or a high-quality screen recording, embedded as a `<video>` (autoplay, muted, loop, no controls clutter). Length: 30–60 seconds.
- **V — The Promise (technical).** Three-column layout reaffirming: no network in Open tier, read-only on vault, no methodology imposed.
- **VI — Surfaces.** Cards for CLI, Plugin, MCP, Desktop, Web cockpit. Each card has install line + brief description.
- **VII — Pricing.** Open / Pro / Founder. Founder tier shows live remaining count via fetch from API.
- **VIII — Footer.**

Visual rules:
- No images of fictional people, no AI-generated hero illustrations, no stock photography
- Sodium-yellow used sparingly, only on CTAs and Implicit-Thesis tile
- All section headers use Roman numerals, JetBrains Mono, slight letter-spacing
- Body copy in Source Serif 4
- Terminal recording shown in a dignified frame with macOS-style traffic lights or a flat dark border

**Files created:**
```
packages/site/src/pages/index.astro
packages/site/src/components/sections/
├── Hero.astro
├── Verbs.astro
├── BriefSample.astro
├── Demo.astro
├── Promise.astro
├── Surfaces.astro
└── Pricing.astro
packages/site/public/recordings/
└── basalt-demo.webm
```

**Tests:**
- Visual snapshot comparison vs. an approved design (PR includes a screenshot for human review)
- Lighthouse ≥ 95
- Sodium-yellow CTAs are visible in both light and dark mode (verify contrast ≥ 4.5:1)
- Terminal recording loads and plays on slow 3G simulation

**Definition of Done:** Standard DoD + design review by George.

---

## TASK-5.4 — Implement /install, /pricing, /privacy, /changelog

**Spec:**

- **/install**: per-surface install instructions with copyable commands (`npm install -g basalted`, plugin marketplace link, MCP install command, desktop download links). Auto-detect OS for desktop CTA where possible. Include verification command for each (`basalt about`).

- **/pricing**: full pricing detail.
  - Open: features list, "$0 forever, MIT-licensed"
  - Pro: features list, $12/mo OR $108/yr toggle, CTA to web cockpit signup
  - Founder: $240 one-time, lifetime Pro, live remaining count, CTA to Stripe Checkout
  - FAQ section: privacy, refund policy, what happens to Founder if they ever sunset Pro (lifetime guarantee statement), how Pro pricing might change (grandfathered for founders)

- **/privacy**: detailed privacy posture.
  - Open tier: literal "what leaves your computer" statement (nothing)
  - BYOK: where the keys go, how they're stored
  - Pro: in-memory processing in Workers, what persists, what doesn't
  - Vault Sync: explicit opt-in, encryption envelope details, key derivation
  - Verifiability section: hash-chained audit log, BLAKE3 manifests, optional OpenTimestamps anchoring (carry forward from Fernando's reference)
  - Threat model: what we protect against, what we don't

- **/changelog**: MDX-rendered, sourced from `src/content/changelog.mdx`, generated by a script that reads tagged releases from git + CHANGELOG.md.

**Files created:**
```
packages/site/src/pages/{install,pricing,privacy,changelog}.astro
packages/site/src/content/changelog.mdx
scripts/sync-changelog.ts                     # CHANGELOG.md → changelog.mdx
```

**Tests:**
- All pages render at 200
- /pricing Founder count fetches and displays correctly (mock API endpoint in tests)
- /changelog sync script keeps content current

**Definition of Done:** Standard DoD.

---

## TASK-5.5 — Scaffold `basalted-docs` (Astro + Starlight)

**Spec:**
- Set up `packages/docs/` with Astro + Starlight
- Configure Starlight with custom theme matching brand tokens (extends `basalted-ui` preset)
- Configure deploy to Cloudflare Pages at `docs.<domain>`
- Set up CI workflow `.github/workflows/deploy-docs.yml`
- Configure search (Starlight ships with Pagefind by default — confirm it's the right fit)

**Files created:**
```
packages/docs/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/
├── src/
│   ├── content/
│   │   ├── docs/                   # markdown content
│   │   │   ├── index.mdx
│   │   │   ├── getting-started/
│   │   │   ├── verbs/
│   │   │   ├── byok/
│   │   │   ├── privacy/
│   │   │   ├── api/
│   │   │   └── migration/
│   │   └── config.ts                # Starlight content config
│   └── styles/
│       └── custom.css
└── README.md

.github/workflows/deploy-docs.yml
```

**Tests:**
- `astro build` produces clean output
- Search index builds and works on local preview
- All in-page anchors resolve
- All cross-doc links resolve

**Definition of Done:** Standard DoD.

---

## TASK-5.6 — Author Getting Started + Verb reference

**Spec:**

Write the foundational docs content:

- **Getting Started** (one page per surface):
  - CLI: install, init, first brief, common flags, troubleshooting (Ollama not running, etc.)
  - Plugin: install via Obsidian, settings walkthrough, first brief
  - MCP: install, Claude Desktop config snippet, Cursor config snippet, troubleshooting
  - Desktop: download, first launch, onboarding walkthrough
  - Web cockpit: sign up, register vault, first brief, BYOK setup

- **Verbs reference**:
  - One page per verb (Implicit Thesis, Contradiction, Drift, Connection, Buried Insight)
  - Each page: site-language description, algorithm overview, thresholds (with rationale), example finding, what causes false positives, how to interpret confidence
  - This is the public version of `SPEC.md` — keep it readable, with links to source code for users who want to dig
  - Element tile rendered next to title

- **BYOK setup**:
  - Per-provider walkthroughs with screenshots: where to get the API key, what to paste where
  - Cost expectations per provider
  - Privacy note: Basalt never proxies BYOK calls through its servers in the local-first surfaces

- **Privacy & threat model**:
  - Mirror /privacy on marketing site at deeper technical depth
  - Cryptographic detail of the verifiable privacy layer
  - Recovery scenarios

- **Migration guide** (Python → TS CLI):
  - One-paragraph why
  - Drop-in command equivalence
  - Schema compatibility (the index DB is byte-compatible — migration source defined in TASK-1.4, CLI-side compat asserted in TASK-2.2)
  - Caveats / known divergences from `docs/parsing-decisions.md`

**Files created:**
```
packages/docs/src/content/docs/
├── index.mdx
├── getting-started/
│   ├── cli.mdx
│   ├── plugin.mdx
│   ├── mcp.mdx
│   ├── desktop.mdx
│   └── web.mdx
├── verbs/
│   ├── index.mdx
│   ├── thesis.mdx
│   ├── contradiction.mdx
│   ├── drift.mdx
│   ├── connection.mdx
│   └── buried.mdx
├── byok/
│   ├── index.mdx
│   ├── openai.mdx
│   ├── anthropic.mdx
│   ├── google.mdx
│   ├── mistral.mdx
│   └── cohere.mdx
├── privacy/
│   ├── index.mdx
│   └── threat-model.mdx
└── migration/
    └── python-to-ts.mdx
```

**Tests:**
- All pages render at 200
- Code blocks have syntax highlighting
- Internal links resolve
- Pagefind search returns relevant results for common queries ("install", "drift", "BYOK", "privacy")

**Definition of Done:** Standard DoD + content review by George.

---

## TASK-5.7 — Auto-generate API reference

**Spec:**
- Script that introspects Hono routes in `basalted-api` and produces an OpenAPI 3.1 spec
- Render the OpenAPI spec into Starlight using a plugin or custom integration (e.g. `@scalar/api-reference` or hand-rolled)
- Auto-runs on every API change via CI; output checked into `packages/docs/src/content/docs/api/`

**Files created:**
```
scripts/generate-openapi.ts
packages/docs/src/content/docs/api/
├── index.mdx
└── reference.mdx                    # auto-generated from OpenAPI
```

**Tests:**
- OpenAPI spec validates against the 3.1 schema
- Reference page renders all known endpoints
- Endpoint examples work when copy-pasted into curl

**Definition of Done:** Standard DoD.

---

## TASK-5.8 — Domain configuration + DNS

**Spec:**
- Final domain decision (per PRD §10 open decisions) closes here
- Configure DNS for:
  - `<domain>` → marketing site (Pages)
  - `app.<domain>` → web cockpit (Pages)
  - `docs.<domain>` → docs site (Pages)
  - `api.<domain>` → Workers (workers.dev custom domain)
- All on Cloudflare DNS for unified management
- HSTS, redirects from `www.` to apex (or vice versa, decide and stick to it)
- Email DNS hygiene if domain is to send mail (DMARC, SPF, DKIM) — even if not sending yet, lock the records to prevent spoofing

**Files created:**
```
docs/dns-config.md                            # source of truth for DNS records
```

**Tests:**
- All four subdomains resolve and serve correct content
- TLS certs valid (auto via Cloudflare)
- HSTS preload submission ready (post-launch consideration)

**Definition of Done:** Standard DoD + manual verification of all four subdomains.

---

## TASK-5.9 — Pre-launch SEO + analytics setup

**Spec:**
- `robots.txt` and `sitemap.xml` for marketing + docs
- Schema.org JSON-LD on key pages (SoftwareApplication, FAQPage on /pricing FAQ, Article on blog posts)
- Cloudflare Web Analytics enabled (privacy-preserving, no third-party trackers)
- No Google Analytics, no Mixpanel, no Segment — explicitly. Privacy posture demands this.
- Search Console / Bing Webmaster verification (post-launch, not blocking this phase)

**Files created:**
```
packages/site/public/robots.txt
packages/site/src/pages/sitemap.xml.ts        # generated
packages/docs/public/robots.txt
packages/docs/src/pages/sitemap.xml.ts
```

**Tests:**
- robots.txt allows expected paths
- sitemap.xml validates against XML schema
- JSON-LD validates via Schema.org structured data validator

**Definition of Done:** Standard DoD.

---

## Phase 5 Exit Criteria

- [ ] All TASK-5.* merged
- [ ] Marketing site live at final domain, Lighthouse ≥ 95
- [ ] Docs site live at `docs.<domain>`, search functional
- [ ] All four subdomains resolve correctly
- [ ] Brand fidelity verified against Fernando's live site
- [ ] No third-party trackers on any page
- [ ] OpenAPI reference auto-generated and published
- [ ] `scripts/release.sh --dry-run v0.5.0` clean

When all checked, tag `v0.5.0`. Phase 6 is launch.
