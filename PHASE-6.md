# Phase 6 — Public Launch

> **Goal:** Take Basalt public. Hit the launch channels, monitor for fires, respond to feedback, ship the first round of post-launch fixes. Tag `v1.0.0`.
>
> **Target tag:** `v1.0.0`
>
> **Estimated duration:** 1–2 weeks pre-launch + 2 weeks post-launch monitoring

This phase is mostly *not* code. It is hardening, content, sequencing, and crisis preparedness. The product is built. The job here is landing it.

---

## TASK-6.1 — Pre-launch hardening sweep

**Spec:**

A focused regression and stress test across all surfaces before public exposure:

- Run full parity test suite against both fixtures + a real 1,000-note vault (use George's anonymized vault if available)
- Stress test the API: simulate 100 concurrent vault registrations, 500 concurrent brief generations, verify no Workflow failures and p95 within budget
- Manual end-to-end on each surface, on each platform where applicable:
  - CLI on macOS, Linux, Windows
  - Plugin on Obsidian latest stable + previous version
  - MCP on Claude Desktop, Cursor (if available)
  - Desktop app on macOS, Linux, Windows
  - Web cockpit on Chrome, Firefox, Safari (latest stable)
- Verify all marketing site CTAs land where intended
- Verify all documented install commands work on a fresh machine
- Verify Stripe checkout works for all three pricing tiers in test mode, then again in live mode (small live test purchases, refunded after)
- Run a security review: HTTP headers (CSP, HSTS, X-Frame-Options), API auth coverage, BYOK key encryption verified end-to-end with a tampered-payload test, rate limits applied to every public endpoint

**Files modified/created:**
```
docs/launch-runbook.md                        # day-of-launch checklist + on-call procedures
docs/security-review-2026-XX.md               # findings and resolutions
```

**Tests:**
- Stress test scripts checked into `tests/load/` and re-runnable
- Security checklist documented and signed off

**Definition of Done:** Standard DoD + green parity tests + green stress tests + signed-off security review.

---

## TASK-6.2 — Founder-tier mechanics live test

**Spec:**

Founder tier (capped at 100, lifetime) is the highest-risk billing flow. Validate end-to-end before launch:

- In live Stripe mode, create one Founder-tier purchase from a personal account
- Verify: subscription record created in D1, Pro entitlements unlocked, lifetime flag set, never expires on subsequent webhook events
- Verify the cap mechanism: simulate 99 existing Founder records in staging D1, attempt purchase, verify allowed; create the 100th, verify blocked with correct error UI; verify refund path if a race condition lets a 101st through
- Document the cap reset / sunset policy in /pricing FAQ: "What if Pro is ever sunset?" → "Lifetime guarantees mean lifetime — anyone can self-host the API; data is exportable; Pro features remain accessible while the service operates."

**Files created:**
```
tests/load/founder-cap.test.ts
docs/founder-tier-policy.md                   # internal sunset policy
```

**Tests:**
- Race-condition test: 5 concurrent purchase attempts at the 99→100 boundary, verify exactly one gets the last slot
- Manual: actual live purchase + refund cycle

**Definition of Done:** Standard DoD + at least one verified live Founder purchase + verified refund.

---

## TASK-6.3 — Author launch content

**Spec:**

Write the public artifacts that go out the door on launch day. Each is a draft now, frozen at start of TASK-6.5 (launch day).

- **HN Show HN post** (target 200–400 words):
  - Title: "Show HN: Basalt — a weekly Brief from your Markdown notes" (or final domain wording)
  - Lead with the wedge from PRD §2.1: structural reasoning across the corpus, not retrieval
  - The five verbs in plain prose, no jargon
  - The three load-bearing properties (no network in Open tier, read-only on vault, no methodology imposed)
  - "Open-source CLI is MIT, paid Pro tier funds the lights"
  - Link to GitHub, link to landing page, link to docs
- **Show HN comment** (longer, 600–900 words): your story — why you built this, what the Python prototype taught you, where it fits among adjacent tools, what's deliberately not included
- **ProductHunt listing**: tagline, description, gallery (3–5 images), maker comment
- **X thread** (8–12 tweets): each tweet self-contained; first tweet is the wedge; closing tweet is the install line
- **LinkedIn post**: longer-form, professional voice — the consulting-leverage angle (Basalt as a tool fractional execs use to keep their own thinking honest)
- **Email to warm network**: list of 50–150 people from your network who'd care; personal note + link
- **Reddit** (r/ObsidianMD, r/PKMS, r/selfhosted, r/Zettelkasten — verify each subreddit's self-promotion rules first): tailored post per sub
- **DevHunt** listing
- **Blog post** for /blog/announcing-basalt: long-form post, 1500–2500 words, the canonical reference for "what is this and why should I care"

**Files created:**
```
docs/launch-content/
├── hn-show-hn-post.md
├── hn-show-hn-comment.md
├── producthunt.md
├── x-thread.md
├── linkedin.md
├── warm-network-email.md
├── reddit-obsidian.md
├── reddit-pkms.md
├── reddit-selfhosted.md
├── devhunt.md
└── blog-announcing.md
packages/site/src/content/blog/announcing-basalt.mdx
```

**Tests:**
- Each piece reviewed for accuracy: every claim either documented in the PRD or directly verifiable
- No "soon" claims — only ship features that are actually live
- All external URLs resolve

**Definition of Done:** Standard DoD + George reviews each piece personally.

---

## TASK-6.4 — Set up post-launch monitoring + on-call rotation

**Spec:**
- Cloudflare Workers Analytics + Logs configured, dashboards saved
- Status page (lightweight — single page on the marketing site reading Worker health) at `<domain>/status`
- Alerts:
  - Worker error rate > 1% over 5min → notification to George (email + push)
  - Workflow failures > 5% → ditto
  - Stripe webhook signature failures → ditto (likely security event)
  - D1 query latency p95 > 1s → ditto
- "On-call" for solo launch: George with phone notifications enabled, target response time 1 hour business hours, 4 hours otherwise, for first two weeks post-launch
- Public incident communication: pinned tweet template, status page update template, email-list template
- Crash reporting opt-in only, off by default (privacy posture). For Open tier this is permanent. For Pro, optional.

**Files created:**
```
packages/api/src/routes/status.ts             # health endpoint
packages/site/src/pages/status.astro          # public status page reading the API
docs/on-call-runbook.md                       # what to do when alerts fire
docs/incident-templates/{pinned-tweet,status-page,email}.md
```

**Tests:**
- Manual: trigger a fake error on staging, verify alert fires
- Manual: visit /status, verify it displays live state
- Verify crash reporting is opt-in only (default off) on every surface

**Definition of Done:** Standard DoD + alert fires verified end-to-end on staging.

---

## TASK-6.5 — Launch day

**Spec:**

Launch sequence (single day, ideally a Tuesday — neither Monday nor Friday). Execute in this order, with at least 30 minutes between each major channel to allow signal monitoring:

1. **T-24h** — final tag and deploy `v1.0.0` to prod. Verify all surfaces.
2. **T-2h** — pre-flight checks: marketing site loads, install commands work on a fresh VM, Stripe live, email warm-up done, X scheduled but not posted yet
3. **T-0** — **Show HN post** goes live first (HN is the highest-leverage channel). George available for comments for the next 4 hours minimum.
4. **T+30min** — Reddit (Obsidian, PKMS, selfhosted, Zettelkasten) — tailored per sub.
5. **T+1h** — X thread.
6. **T+1.5h** — LinkedIn post.
7. **T+2h** — ProductHunt + DevHunt listings (PH benefits from west-coast morning, so adjust timing if launching from a non-PT timezone)
8. **T+2.5h** — Warm-network email blast.
9. **T+4h** — Pinned tweet on the project's account linking to all live channels.

George's job during launch day: respond to every HN comment within 30 minutes, respond to every X reply, monitor alerts, fix small issues fast. Major bugs warrant a hotfix release `v1.0.1` within 24 hours.

**Files created:**
```
docs/launch-day-log.md                        # journal of what happened, captured live
```

**Tests:**
- Pre-flight checks captured in `docs/launch-runbook.md` all pass
- Each channel post matches the frozen content from TASK-6.3

**Definition of Done:** All channels posted as scheduled. Launch day log written before sleep.

---

## TASK-6.6 — Two-week post-launch hardening

**Spec:**

The first two weeks post-launch are the most informative window. Track and respond:

- All install issues reported → fixes prioritized for `v1.0.x` patch releases
- Documentation gaps surfaced by user questions → docs PR per gap
- Performance regressions reported → reproduce + benchmark + fix
- Pricing pushback → measure but don't react quickly; wait 30 days before any pricing change
- Founder-tier sales tracked daily; if hitting cap quickly, prepare a "Founder closed" announcement template
- HN comments + Reddit discussions → respond to substantive critique, ignore trolls, log every actionable critique as a GitHub issue
- Stripe disputes / refunds → handle within 24 hours

Cadence:
- Daily morning standup (with self): triage new issues, prioritize
- Weekly Friday: ship `v1.0.x` patch with the week's fixes
- End of week 2: write `docs/post-launch-retrospective.md` capturing what worked, what didn't, what changes for the next launch

**Files created:**
```
docs/post-launch-retrospective.md
.github/ISSUE_TEMPLATE/                       # bug report, feature request, install help
```

**Tests:**
- At least one `v1.0.x` patch shipped within the two-week window
- Issue tracker has structured templates and is being used

**Definition of Done:** Two-week post-launch retrospective written + signed off + at least one user-reported bug resolved in a patch release.

---

## Phase 6 Exit Criteria

- [ ] All TASK-6.* merged
- [ ] `v1.0.0` tagged and deployed
- [ ] Public launch executed across all planned channels
- [ ] Two-week post-launch monitoring completed
- [ ] At least one `v1.0.x` patch shipped responsively
- [ ] Post-launch retrospective written

When checked, **Basalt is live**. The PRD's job ends here. Forward direction is set in the post-launch retrospective and tracked in normal product cadence (no more PRD-driven phase work; from here it's standard issue-tracker-driven development).

---

## Forward Direction (informational, not in scope of this PRD)

What follows naturally from `v1.0.0`:

- **Phase 1 verbs**: Implicit Thesis v1, Contradiction v1, Drift v1 (LLM-augmented). Shipped as `v1.1.0`.
- **Mobile companion**: read-only Brief reader on iOS/Android via Tauri 2 mobile (when stable) or React Native shell. Shipped as `v1.2.0`.
- **Multi-vault search**: cross-vault retrieval in the Pro tier. Shipped as `v1.3.0`.
- **Self-hosting guide**: docs and helm chart / docker compose for Pro-tier features run privately. Shipped as `v1.4.0`.

These are forward intentions, not commitments. The retrospective and user feedback drive the actual sequencing.
