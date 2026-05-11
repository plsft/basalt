# Launch-day runbook

**Target launch date:** TBD (Tuesday preferred — neither Mon nor Fri)
**On-call:** George
**Hotfix tag:** `v1.0.1` (cut within 24h if a P0 surfaces)

## T-24h — Pre-flight

- [ ] All `phases/PHASE-6.md` tasks merged
- [ ] `scripts/release.sh --dry-run v1.0.0` clean
- [ ] Marketing site live at `basalt.dev`, Lighthouse ≥ 95
- [ ] Docs site live at `docs.basalt.dev`
- [ ] API live at `api.basalt.dev`, `/v1/health` returns 200
- [ ] Web cockpit live at `app.basalt.dev`
- [ ] Stripe live mode keys deployed (verify via test purchase + refund)
- [ ] OAuth apps configured (GitHub, Google) with prod redirect URIs
- [ ] Obsidian plugin pending in community marketplace
- [ ] Desktop releases published on GitHub (macOS signed, Linux unsigned, Windows signed-if-cert)
- [ ] CLI / MCP published to npm
- [ ] All launch content frozen — last review by George

## T-2h — Final checks

- [ ] `curl -I https://basalt.dev` → 200
- [ ] `curl -I https://docs.basalt.dev` → 200
- [ ] `curl -s https://api.basalt.dev/v1/health` → `{"status":"ok"}`
- [ ] Fresh-VM install: `npm i -g basalted && basalt init && basalt brief` → green
- [ ] HN post drafted in tab, ready to submit
- [ ] X thread queued
- [ ] LinkedIn post queued
- [ ] Reddit posts ready (4 subreddits)
- [ ] ProductHunt + DevHunt drafts ready
- [ ] Warm-network email list loaded, merge tags verified

## T-0 — HN

Post **Show HN: Basalt — a weekly Brief from your Markdown notes**.

George available for the next 4 hours minimum. Target HN comment reply
time: < 30 minutes.

## T+30min — Reddit

Post tailored versions to:
- r/ObsidianMD
- r/PKMS
- r/selfhosted
- r/Zettelkasten

(Verify each subreddit's self-promo rules on the morning of launch — they
change.)

## T+1h — X thread

Post the 10-tweet thread. Pin the first tweet on the project account.

## T+1.5h — LinkedIn

Post longer-form version. Tag relevant connections sparingly.

## T+2h — ProductHunt + DevHunt

Submit listings. Maker comment in within 5 min of going live.

## T+2.5h — Warm-network email

Send personalized email to ~50–150 people.

## T+4h — Pinned tweet roundup

On the project account, pin a tweet linking to HN, X thread, ProductHunt,
site.

## During launch — monitoring

- **Cloudflare dashboard:** Worker error rate, request count, p95 latency
- **Stripe dashboard:** subscriptions, payments, disputes
- **HN comments tab** — open in dedicated browser tab
- **X notifications** — push enabled

Triage rules:
- **P0 (site down, API down, Stripe broken):** hotfix immediately, communicate via pinned X
- **P1 (install bug on a platform, doc error):** log as GitHub issue, fix within 24h, roll into v1.0.1
- **P2 (feature request, design feedback):** log as GitHub issue, no commitment

## Day-of-launch log

Write events live into `docs/launch-day-log.md` as they happen. Easier to
write a retro from a timestamped log than from memory.

## Hotfix path

If a P0 emerges:

```sh
git checkout -b hotfix/v1.0.1
# fix
git commit -m "[HOTFIX] <description>"
git tag v1.0.1
git push origin main --tags
```

CI builds and publishes automatically. Communicate via pinned tweet +
status page.
