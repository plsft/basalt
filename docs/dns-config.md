# DNS — basalt.dev

Source of truth. All records managed on Cloudflare DNS.

| Type | Name | Target | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `CNAME` | `basalt.dev` (apex) | `basalt-site.pages.dev` | Yes | Marketing site |
| `CNAME` | `www.basalt.dev` | `basalt.dev` | Yes | 301 → apex |
| `CNAME` | `app.basalt.dev` | `basalt-web.pages.dev` | Yes | Web cockpit |
| `CNAME` | `docs.basalt.dev` | `basalt-docs.pages.dev` | Yes | Docs site |
| `CNAME` | `api.basalt.dev` | `basalt-api.<account>.workers.dev` | Yes | Workers (custom domain via wrangler) |
| `CNAME` | `r2-sync.basalt.dev` | `<bucket>.r2.cloudflarestorage.com` | Yes | Vault Sync R2 |

## TLS

Cloudflare Universal SSL — automatic. Strict mode (Origin Server certs on
Workers; Cloudflare-managed on Pages).

## HSTS

```
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

Set via Cloudflare Transform Rules on all `*.basalt.dev` and apex.

Pre-loading list submission is post-launch (need a stable cert chain for at
least 30 days first).

## Email hygiene (lock-only — no mail sent yet)

| Type | Name | Value | Why |
| --- | --- | --- | --- |
| `TXT` | `basalt.dev` | `v=spf1 -all` | No senders authorized |
| `TXT` | `_dmarc.basalt.dev` | `v=DMARC1; p=reject; rua=mailto:postmaster@plsft.com` | Reject anything; report to plsft postmaster |
| `TXT` | `*._domainkey.basalt.dev` | `v=DKIM1; p=` | Empty DKIM until we sign |

## Verification

```sh
dig basalt.dev +short
dig docs.basalt.dev +short
dig api.basalt.dev +short
curl -I https://basalt.dev
curl -I https://docs.basalt.dev
```

All four subdomains must return 200 + `strict-transport-security`.
