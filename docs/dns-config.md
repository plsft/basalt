# DNS — basalted.com

Source of truth. All records managed on Cloudflare DNS.

| Type | Name | Target | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `CNAME` | `basalted.com` (apex) | `basalt-site.pages.dev` | Yes | Marketing site |
| `CNAME` | `www.basalted.com` | `basalted.com` | Yes | 301 → apex |
| `CNAME` | `app.basalted.com` | `basalt-web.pages.dev` | Yes | Web cockpit |
| `CNAME` | `docs.basalted.com` | `basalt-docs.pages.dev` | Yes | Docs site |
| `CNAME` | `api.basalted.com` | `basalt-api.<account>.workers.dev` | Yes | Workers (custom domain via wrangler) |
| `CNAME` | `r2-sync.basalted.com` | `<bucket>.r2.cloudflarestorage.com` | Yes | Vault Sync R2 |

## TLS

Cloudflare Universal SSL — automatic. Strict mode (Origin Server certs on
Workers; Cloudflare-managed on Pages).

## HSTS

```
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

Set via Cloudflare Transform Rules on all `*.basalted.com` and apex.

Pre-loading list submission is post-launch (need a stable cert chain for at
least 30 days first).

## Email hygiene (lock-only — no mail sent yet)

| Type | Name | Value | Why |
| --- | --- | --- | --- |
| `TXT` | `basalted.com` | `v=spf1 -all` | No senders authorized |
| `TXT` | `_dmarc.basalted.com` | `v=DMARC1; p=reject; rua=mailto:postmaster@plsft.com` | Reject anything; report to plsft postmaster |
| `TXT` | `*._domainkey.basalted.com` | `v=DKIM1; p=` | Empty DKIM until we sign |

## Verification

```sh
dig basalted.com +short
dig docs.basalted.com +short
dig api.basalted.com +short
curl -I https://basalted.com
curl -I https://docs.basalted.com
```

All four subdomains must return 200 + `strict-transport-security`.
