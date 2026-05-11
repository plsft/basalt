# @basalt/desktop

Basalt desktop app — Tauri 2 (Rust shell, system WebView) + React + Tailwind v4.

## Status

**Phase 4, in progress.** Scaffold + Rust shell with `walk_vault`/`open_external` commands + React frontend that runs `@basalt/core` end-to-end via the `TauriFilesystem` adapter. macOS code signing wired in `.github/workflows/release-desktop.yml` (needs Apple Dev ID secrets).

## Performance budgets (PRD §6.4)

- **Cold start:** < 800 ms to interactive
- **Idle memory:** < 100 MB

These drove the Tauri 2 choice over Electron + CEF.

## Dev

```sh
bun install
bun run --cwd packages/core build
bun run --cwd packages/desktop tauri:dev
```

## Build

```sh
bun run --cwd packages/desktop tauri:build
# Platform-specific:
bun run --cwd packages/desktop tauri:build:macos
bun run --cwd packages/desktop tauri:build:linux
bun run --cwd packages/desktop tauri:build:windows
```

## Code signing

### macOS — Apple Dev ID

The release workflow at `.github/workflows/release-desktop.yml` reads:

| Secret | What |
| --- | --- |
| `APPLE_ID` | Apple ID (e.g. `george.rios@pluralsoftware.com`) |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Team ID from developer.apple.com/account |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` exported from Keychain |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <Name> (<TeamID>)` |

Add these via:
```
gh secret set APPLE_ID --body "george.rios@pluralsoftware.com"
gh secret set APPLE_TEAM_ID --body "<your-team-id>"
gh secret set APPLE_PASSWORD --body "<app-specific-password>"
base64 -i Certificates.p12 | gh secret set APPLE_CERTIFICATE
gh secret set APPLE_CERTIFICATE_PASSWORD --body "<.p12 password>"
gh secret set APPLE_SIGNING_IDENTITY --body "Developer ID Application: ..."
```

### Windows — Authenticode (optional)

`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The workflow runs unsigned if these aren't present; users will see SmartScreen warnings until you ship a real cert.

## Updater

`tauri.conf.json` `plugins.updater` is currently `active: false`. To enable signed auto-updates:

1. Generate an updater key pair with `tauri signer generate`
2. Set `pubkey` in `tauri.conf.json`
3. Stash the private key as `TAURI_SIGNING_PRIVATE_KEY` GitHub secret
4. Host the update manifest at `basalt-releases.plsft.com` (R2 — already provisioned, see `wrangler r2 bucket list`)
5. Flip `active: true` and re-release

## License

MIT © 1556 Ventures LLC.
