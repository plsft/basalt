# Phase 4 — Tauri 2 Desktop App

> **Goal:** Ship a standalone desktop application for users who don't use Obsidian but have a folder of markdown. Tauri 2 + Rust shell + system WebView + React + Tailwind v4. Hard performance budgets are non-negotiable: cold start <800ms, idle memory <100MB.
>
> **Target tag:** `v0.4.0`
>
> **Estimated duration:** 4–6 weeks

The desktop app is the only surface that has a Rust component. Keep Rust thin: it exists to give the React frontend filesystem, OS, SQLite, and process-spawning primitives, nothing more. All product logic stays in `basalted-core` running in the WebView.

---

## TASK-4.1 — Scaffold `basalted-desktop` (Tauri 2)

**Spec:**
- Run `bun create tauri-app` (or manual setup) inside `packages/desktop/`
- Configure as Tauri 2 (not 1.x — confirm with `cargo tauri --version` ≥ 2.0)
- Frontend: Vite + React + Tailwind v4 + TypeScript
- Reuse `basalted-core` and `basalted-ui` from the monorepo
- Configure `tauri.conf.json`:
  - `productName`: "Basalt"
  - `identifier`: TBD per Phase 0 brand decision (placeholder `app.basalt.desktop`)
  - `bundle.icon`: provide cross-platform icon set generated from a single Na-tile SVG
  - `app.windows[0]`: minWidth 800, minHeight 600, defaultWidth 1200, defaultHeight 800, fullscreen false, decorations true
  - CSP: explicit allowlist for `localhost:11434` (Ollama) and `https://api.<domain>` (Pro tier)
- Configure Vite to dev-serve at `http://localhost:1420` (Tauri default)

**Files created:**
```
packages/desktop/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   └── basalt-core.ts          # imports basalted-core
│   ├── adapters/                   # Tauri-specific adapter implementations
│   ├── views/
│   │   ├── Onboarding.tsx
│   │   ├── BriefView.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── components/
│   └── i18n/en.json
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── filesystem.rs
│   │       ├── ollama.rs
│   │       └── update.rs
│   ├── icons/                      # generated cross-platform icons
│   └── build.rs
└── README.md
```

**Tests:**
- `bun run --cwd packages/desktop tauri dev` opens an empty app window
- App window renders the React shell with brand styles loaded
- `cargo build --manifest-path packages/desktop/src-tauri/Cargo.toml` succeeds

**Definition of Done:** Standard DoD.

---

## TASK-4.2 — Install + configure Tauri plugins

**Spec:**

Add and initialize all required Tauri 2 plugins per PRD §4.6:

- `@tauri-apps/plugin-fs` — filesystem with scoped permissions
- `@tauri-apps/plugin-sql` — SQLite (sqlite feature, not mysql/postgres)
- `@tauri-apps/plugin-shell` — for spawning Ollama
- `@tauri-apps/plugin-dialog` — folder picker
- `@tauri-apps/plugin-notification` — Brief-ready notifications
- `@tauri-apps/plugin-updater` — signed auto-updates
- `@tauri-apps/plugin-os` — platform detection

For each plugin:
- Add to both `Cargo.toml` (Rust side) and `package.json` (JS bindings)
- Register the plugin in `src-tauri/src/lib.rs` `Builder::default().plugin(...)`
- Configure permissions in `src-tauri/capabilities/main.json`
- Use Tauri 2's capability model — declare exactly which scopes each plugin can use, no wildcards

**Files modified:**
```
packages/desktop/src-tauri/Cargo.toml
packages/desktop/src-tauri/src/lib.rs
packages/desktop/src-tauri/capabilities/main.json
packages/desktop/package.json
```

**Tests:**
- Each plugin loaded successfully (verify via Tauri runtime logs)
- Capabilities config validates against Tauri's schema
- Manual: trigger one method per plugin from the WebView, verify no permission errors

**Definition of Done:** Standard DoD.

**Notes:**
- Tauri 2 capabilities are stricter than Tauri 1's allowlist. Be specific: e.g. `fs:allow-read-text-file` scoped to user-selected vault paths only; never `**/*`.

---

## TASK-4.3 — Implement custom Tauri commands (Rust → JS)

**Spec:**

Implement the six custom commands listed in PRD §4.6 in `src-tauri/src/commands/`:

```rust
// commands/filesystem.rs
#[tauri::command]
async fn pick_vault_path(window: Window) -> Result<Option<String>, String>;
// Opens native folder picker dialog. Returns None if user cancels.

#[tauri::command]
async fn walk_vault(path: String, window: Window) -> Result<Vec<VaultFile>, String>;
// Walks the given path, returns list of .md files with metadata.
// For very large vaults, emits progress events via `window.emit("vault-walk-progress", ...)`.

#[tauri::command]
async fn vault_scope_grant(path: String, app: AppHandle) -> Result<(), String>;
// Adds the vault path to the runtime FS scope so plugin-fs can read it.

// commands/ollama.rs
#[tauri::command]
async fn get_ollama_status() -> Result<OllamaStatus, String>;
// Probes localhost:11434/api/version. Returns { running: bool, version?: string, models: string[] }.

#[tauri::command]
async fn start_ollama(app: AppHandle) -> Result<(), String>;
// Attempts to spawn `ollama serve` if not running. Requires user confirmation (handled in JS before invoking).

#[tauri::command]
async fn open_external(url: String) -> Result<(), String>;
// Opens a URL in the default browser via plugin-shell.
```

Define matching TypeScript bindings in `src/lib/tauri-commands.ts` for type safety.

**Files created:**
```
packages/desktop/src-tauri/src/commands/{filesystem,ollama,update}.rs
packages/desktop/src/lib/tauri-commands.ts
```

**Tests:**
- Unit (Rust): test command functions with mocked dependencies where possible
- Integration: invoke each command from the React app, verify expected behavior
- Manual: pick_vault_path opens native dialog on each platform (macOS Finder, Windows Explorer, Linux GTK/portal)

**Definition of Done:** Standard DoD.

---

## TASK-4.4 — Implement Tauri storage + filesystem adapters

**Spec:**
- Implement `src/adapters/storage-tauri-sql.ts` using `@tauri-apps/plugin-sql`:
  - Wraps the same schema as `storage-sqlite.ts` (CLI) using shared migrations from `packages/core/src/migrations/`
  - Database file at OS app-data path (resolved via `appDataDir()` from `@tauri-apps/api/path`)
  - Implements `StorageAdapter` interface
- Implement `src/adapters/fs-tauri.ts` using `@tauri-apps/plugin-fs` + custom `walk_vault` command:
  - For walking, prefer the Rust-side `walk_vault` command for performance on large vaults
  - For reading individual files, use `readTextFile` from plugin-fs
  - Implements `FilesystemAdapter` interface

**Files created:**
```
packages/desktop/src/adapters/storage-tauri-sql.ts
packages/desktop/src/adapters/storage-tauri-sql.test.ts
packages/desktop/src/adapters/fs-tauri.ts
packages/desktop/src/adapters/fs-tauri.test.ts
```

**Tests:**
- Unit: storage adapter round-trips a small fixture
- Integration: index sample-vault-14 via the desktop adapter chain, verify Brief output matches CLI output exactly
- Performance: index 1,000-note synthetic vault in <30 seconds (matches CLI budget)

**Definition of Done:** Standard DoD.

---

## TASK-4.5 — Implement Onboarding + Brief views

**Spec:**

Two views drive the desktop UX:

- **Onboarding** (first-run, or whenever no vault is configured):
  - Step 1: "Welcome to Basalt" — short copy carrying brand voice from marketing site
  - Step 2: "Pick your vault" — invokes `pick_vault_path` command
  - Step 3: "Local AI setup" — checks Ollama via `get_ollama_status`; offers to start Ollama or download it via a link to ollama.com if not installed (open_external)
  - Step 4: "First Brief" — kicks off indexing, shows progress, opens BriefView when done
  - Skippable steps land on a "Resume later" action that persists progress

- **BriefView** (the main view after onboarding):
  - Reuses `<Brief>` and `<FindingCard>` from `basalted-ui` (shared with web cockpit)
  - Periodic-table tile sidebar showing which verbs found findings this week
  - "Generate new Brief" button in the title bar
  - Findings have inline actions: Promote, Snooze, Dismiss (calls Engine.audit)
  - Click on a citation opens the source note in the user's default markdown editor (via `open_external` with `file://` URL OR a configurable preferred editor command)

**Files created:**
```
packages/desktop/src/views/Onboarding.tsx
packages/desktop/src/views/BriefView.tsx
packages/desktop/src/components/Sidebar.tsx
packages/desktop/src/components/TitleBar.tsx
packages/desktop/src/state/                 # Zustand or React Context for app state
```

**Tests:**
- Unit (React Testing Library): each step of Onboarding renders correctly; navigation flows
- Unit: BriefView renders given a mock Brief
- Visual snapshot tests against fixture briefs
- Manual: full onboarding on each platform with a real Ollama install

**Definition of Done:** Standard DoD.

---

## TASK-4.6 — Implement History + Settings views

**Spec:**

- **History view** (`/history`):
  - Lists past briefs with date, verb counts, vault
  - Click → opens that brief in BriefView
  - Filter by date range, vault
- **Settings view** (`/settings`):
  - Vaults: list configured vaults, add new (re-invoke onboarding), remove
  - Local AI: Ollama URL, embedding model selection
  - BYOK: provider keys stored in OS keychain via Tauri's `@tauri-apps/plugin-store` + native secure storage layer (use `keytar` equivalent — Tauri 2 community plugin or write a thin Rust command using `keyring` crate)
  - Pro tier: link to web cockpit for billing; show subscription state if signed in
  - Updates: check now, current version, auto-update toggle
  - Privacy: telemetry off-by-default (and architectural — there is no telemetry; the toggle is informational and reaffirms the open-tier promise)

**Files created:**
```
packages/desktop/src/views/History.tsx
packages/desktop/src/views/Settings.tsx
packages/desktop/src-tauri/src/commands/keychain.rs    # using `keyring` crate for OS keychain
packages/desktop/src/lib/keychain.ts                    # JS bindings
```

**Tests:**
- Unit: each settings panel saves and loads correctly
- Integration: BYOK round-trip via OS keychain (manual on each platform)
- Unit: History filters work as expected

**Definition of Done:** Standard DoD.

---

## TASK-4.7 — Implement auto-updater

**Spec:**
- Configure Tauri updater in `tauri.conf.json` to point at a manifest hosted on R2 (`basalt-releases`)
- Manifest format: standard Tauri updater v2 JSON, signed with offline ed25519 key
- Updater checks on app start (with 24-hour throttle stored in app config) and on user demand from Settings
- Update flow:
  - Check → download → verify signature → install → relaunch
  - User confirmation required before download for updates that the user hasn't already opted into via "auto-update" setting
- Release script (`scripts/release-desktop.sh`) builds binaries for all platforms, signs them, generates manifest, uploads to R2

**Files created:**
```
packages/desktop/src-tauri/tauri.conf.json    # updater config
packages/desktop/src/lib/updater.ts            # JS-side update orchestration
scripts/release-desktop.sh
.github/workflows/release-desktop.yml          # builds + signs + uploads on tag
```

**Tests:**
- Manual: deploy a test update to staging R2, verify app detects + installs it
- Unit: update orchestration logic with mocked updater plugin
- Verify signing: a tampered binary is rejected by the updater

**Definition of Done:** Standard DoD + at least one successful staging update cycle.

**Notes:**
- ed25519 key generation done once, offline. Public key embedded in `tauri.conf.json`. Private key kept in a secure password manager + offline backup; never in CI environment. Releases signed manually as part of `scripts/release-desktop.sh` with prompt for the key passphrase.

---

## TASK-4.8 — Cross-platform packaging + signing

**Spec:**

- **macOS** (universal binary: x64 + arm64):
  - Apple Developer ID Application certificate enrolled
  - `codesign` + `notarytool` integration in release script
  - Output: `.dmg` with proper LaunchServices metadata
- **Windows**:
  - Authenticode certificate (EV preferred for SmartScreen reputation; standard if budget-constrained)
  - `signtool` integration
  - Output: `.msi`
- **Linux**:
  - Output: `.deb`, `.rpm`, AppImage
  - No signing needed for AppImage; `.deb`/`.rpm` use repo-level signing if/when self-hosting an apt/dnf repo (post-launch)
- All artifacts uploaded to GitHub release as part of tag-driven CI

**Files created:**
```
.github/workflows/release-desktop.yml
packages/desktop/src-tauri/tauri.conf.json     # bundle config per platform
docs/release-runbook.md                         # step-by-step for human operator
```

**Tests:**
- Tag a `v0.4.0-rc1` pre-release, verify all artifacts produced
- Manual: install each artifact on each target platform, verify launches, verify auto-updater detects subsequent updates
- Manual on macOS: Gatekeeper does not block; verify with `spctl --assess --type install <Basalt.dmg>`

**Definition of Done:** Standard DoD + successful pre-release for all three platforms.

---

## TASK-4.9 — Verify performance budgets

**Spec:**

Run cold-start and idle-memory benchmarks on each platform to verify PRD §6.4 budgets:

- **Cold start <800ms to interactive**:
  - Measure from process spawn to first paint of the React app shell
  - Method: Tauri instrumented hooks + `performance.mark` on first React render
  - Median over 10 cold launches per platform; budget is on median, not max
- **Idle memory <100MB**:
  - Measure RSS after 60 seconds of idle (no user interaction, no indexing)
  - Method: platform-specific RSS readout (`ps -o rss=` on macOS/Linux; `Get-Process` on Windows)
  - Budget on each platform independently

If any platform misses, profile and fix before tagging:
- Cold start: usually about reducing JS bundle size, deferring non-essential work, lazy-loading routes
- Idle memory: usually about WebView decisions and Rust-side caches

**Files created:**
```
packages/desktop/bench/
├── cold-start.ts                # automation script
└── idle-memory.ts                # automation script
docs/perf-results.md              # measured numbers per platform per release
```

**Tests:**
- Bench scripts produce reproducible numbers
- CI integration: bench scripts run in matrix workflow on macOS/Windows/Linux runners; failure on regression

**Definition of Done:** Standard DoD + recorded numbers in `docs/perf-results.md` showing all platforms within budget.

---

## TASK-4.10 — Connect desktop to Pro tier (optional sign-in)

**Spec:**
- Add a "Sign in to Pro" entry in Settings
- Sign-in flow:
  - User clicks → desktop opens external browser to `https://app.<domain>/auth/desktop`
  - Web flow handles OAuth, returns a one-time code
  - Desktop polls `/v1/auth/desktop-token-exchange?code=...` to retrieve a session token
  - Session token stored in OS keychain
- When signed in, desktop unlocks: cloud-side backups of briefs (push to R2 via API), multi-device sync, Basalt-AI synthesis (when Phase 1 verbs ship)
- Open tier remains the default; sign-in is purely additive

**Files created:**
```
packages/desktop/src/views/SignIn.tsx
packages/desktop/src/lib/auth.ts
packages/api/src/routes/auth-desktop.ts        # token exchange endpoint
```

**Tests:**
- Integration: full sign-in flow against staging API
- Unit: token exchange polling logic with retry/backoff

**Definition of Done:** Standard DoD.

---

## Phase 4 Exit Criteria

- [ ] All TASK-4.* merged
- [ ] Cold-start <800ms verified on macOS, Windows, Linux
- [ ] Idle-memory <100MB verified on macOS, Windows, Linux
- [ ] Auto-updater verified end-to-end on staging
- [ ] Brief output identical between desktop and CLI on the same vault
- [ ] All three platforms have signed installable artifacts
- [ ] `scripts/release.sh --dry-run v0.4.0` clean

When all checked, tag `v0.4.0`. Phase 5 begins.
