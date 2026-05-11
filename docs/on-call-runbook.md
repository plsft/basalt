# On-call runbook

**Coverage:** George, two-week post-launch window.
**Response targets:**
- Business hours (9-6 ET): 1 hour
- Other: 4 hours

## Alert sources

- Cloudflare Workers Analytics — error rate, latency
- Cloudflare Pages deploy notifications
- Stripe webhook failure emails
- GitHub Actions failure emails
- Uptime check on `https://basalt.dev/`, `https://api.basalt.dev/v1/health`

## Alert → action map

### Worker error rate > 1% over 5 min

1. Open Cloudflare dashboard → Workers → basalt-api → Logs
2. Filter to recent errors; look for stack traces
3. Common causes:
   - D1 query timeout — increase `EXEC_TIMEOUT_MS` or batch the query
   - KV rate-limit miss — fall back to in-memory bucket
   - AI binding 429 — Workers AI throttling; degrade to mock embedder
4. If root cause obvious + small fix: hotfix v1.0.X
5. If not: communicate via pinned tweet, investigate

### Workflow failures > 5%

Likely a Queue → Worker stall. Check:
- Queue depth growing? Worker consuming slowly → check CPU usage
- DLQ filling? Move to investigate poison messages

### Stripe webhook signature failures

**Treat as security event.** Possible causes:
1. Webhook secret rotated and not deployed
2. Replay attack (check timestamp window)
3. Misconfigured proxy stripping headers

Action: temporarily disable the route, investigate. Do not auto-recover.

### D1 query latency p95 > 1s

Possible runaway scan. Check:
1. Cloudflare D1 metrics → which query is slow?
2. Add an index, rerun migration

## Communicating incidents

1. Update status page (`/status` on marketing site) — auto-reads API health
2. Pinned tweet using template at `docs/incident-templates/pinned-tweet.md`
3. If > 30 min outage: email-list announcement using `docs/incident-templates/email.md`

## Post-incident

Write a brief incident report at `docs/incidents/YYYY-MM-DD-<slug>.md`:
- Timeline (UTC timestamps)
- Root cause
- Customer impact
- Fix
- Prevention

Mention in next CHANGELOG.
