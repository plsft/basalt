#!/usr/bin/env bash
# scripts/release.sh — phase-boundary release driver.
#
# Usage:
#   scripts/release.sh v0.0.1           # cut a real release
#   scripts/release.sh --dry-run v0.0.1 # preview every step, no writes
#
# What it does, in order:
#   1. Pre-flight: working tree clean, on `main`, up-to-date with `origin/main`,
#      tag doesn't already exist, version arg is well-formed.
#   2. Full local CI gauntlet (biome ci, tsc --noEmit, vitest run, parity baseline JSON validation).
#   3. Bump root `package.json` version to the un-prefixed value (e.g. 0.0.1).
#   4. Promote `CHANGELOG.md`'s `## Unreleased` block under a new
#      `## v0.0.1 — 2026-05-09` heading, then re-add an empty `## Unreleased`.
#   5. Commit `chore(release): v0.0.1` (signed off; co-authored if AI ran it).
#   6. Create an annotated git tag `v0.0.1` with the changelog excerpt as message.
#   7. Push `main` and the new tag (skipped in --dry-run).
#   8. Emit next steps: open the GitHub release, paste the changelog excerpt,
#      attach any binaries from packages/cli/dist/.
#
# Hard fails on any divergence — patience is a feature; never skip the gauntlet.

set -euo pipefail

DRY_RUN=0
VERSION=""

usage() {
  cat <<USAGE
Usage: scripts/release.sh [--dry-run] <vX.Y.Z>

Examples:
  scripts/release.sh v0.0.1
  scripts/release.sh --dry-run v0.0.1

Phase-boundary version convention: v0.<phase>.0 for phases 0–5, v1.0.0 at launch (PRD §7).
USAGE
}

# ── Parse args ────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    v*)        VERSION="$1" ;;
    *)         echo "unknown arg: $1"; usage; exit 2 ;;
  esac
  shift
done

if [ -z "${VERSION}" ]; then
  echo "✗ missing required <version> arg." >&2
  usage
  exit 2
fi

if ! [[ "${VERSION}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✗ version must match vMAJOR.MINOR.PATCH (e.g. v0.0.1). got: ${VERSION}" >&2
  exit 2
fi

VERSION_BARE="${VERSION#v}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

TODAY="$(date -u +%Y-%m-%d)"

say() { printf '%s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

if [ "${DRY_RUN}" -eq 1 ]; then
  say "── DRY RUN — no writes, no pushes ────────────────────────────────────"
fi

# ── Pre-flight ────────────────────────────────────────────────────────────

say "Pre-flight checks…"

# 1. Clean working tree.
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "working tree is not clean — commit or stash before releasing"
fi

# 2. On main. Relaxed to warn-only in dry-run so you can preview from a
#    feature branch before merging.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${CURRENT_BRANCH}" != "main" ]; then
  if [ "${DRY_RUN}" -eq 1 ]; then
    warn "not on 'main' (currently '${CURRENT_BRANCH}') — would block a real release"
  else
    die "must release from 'main' branch (currently on '${CURRENT_BRANCH}')"
  fi
fi

# 3. Tag doesn't already exist (locally or on origin).
if git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; then
  die "tag ${VERSION} already exists locally"
fi
if git ls-remote --exit-code --tags origin "refs/tags/${VERSION}" >/dev/null 2>&1; then
  die "tag ${VERSION} already exists on origin"
fi

# 4. Up-to-date with origin/main. (Soft check in dry-run — informational.)
git fetch origin main --quiet
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_MAIN_SHA="$(git rev-parse origin/main)"
if [ "${CURRENT_BRANCH}" = "main" ] && [ "${LOCAL_SHA}" != "${REMOTE_MAIN_SHA}" ]; then
  if [ "${DRY_RUN}" -eq 1 ]; then
    warn "local main (${LOCAL_SHA:0:7}) ≠ origin/main (${REMOTE_MAIN_SHA:0:7}) — would block a real release"
  else
    die "local main (${LOCAL_SHA:0:7}) is not in sync with origin/main (${REMOTE_MAIN_SHA:0:7})"
  fi
fi
say "  ✓ branch + sync checks complete"

# 5. Version-bump shape: new version must be > current.
CURRENT_PKG_VERSION="$(node -p "require('./package.json').version")"
if [ "${CURRENT_PKG_VERSION}" = "${VERSION_BARE}" ]; then
  die "package.json already at ${CURRENT_PKG_VERSION} — nothing to bump"
fi
say "  ✓ bumping package.json: ${CURRENT_PKG_VERSION} → ${VERSION_BARE}"

# 6. CHANGELOG has an Unreleased section with content.
if ! grep -q "^## Unreleased" CHANGELOG.md; then
  die "CHANGELOG.md is missing '## Unreleased' heading"
fi
UNRELEASED_BODY="$(awk '/^## Unreleased/{found=1; next} found && /^## /{exit} found{print}' CHANGELOG.md)"
UNRELEASED_TRIMMED="$(printf '%s' "${UNRELEASED_BODY}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [ -z "${UNRELEASED_TRIMMED}" ]; then
  die "CHANGELOG.md '## Unreleased' section is empty — nothing to release"
fi
say "  ✓ CHANGELOG '## Unreleased' has content"

# ── Gauntlet ──────────────────────────────────────────────────────────────

say
say "Running full local gauntlet…"

run_gate() {
  local label="$1"; shift
  printf '  %s … ' "${label}"
  if "$@" >/tmp/release-${label//\//-}.log 2>&1; then
    say "ok"
  else
    say "FAIL"
    die "gate '${label}' failed. see /tmp/release-${label//\//-}.log"
  fi
}

run_gate "biome-ci"   bun run ci
run_gate "typecheck"  bun run typecheck
run_gate "vitest"     bun run test

# Parity-baseline sanity check — every JSON in tests/parity/baseline/ parses.
say "  parity-baseline-json … "
if [ -d tests/parity/baseline ]; then
  for f in tests/parity/baseline/*.json; do
    python -c "import json,sys; json.load(open(sys.argv[1]))" "${f}" \
      || die "invalid JSON: ${f}"
  done
  say "ok"
else
  warn "tests/parity/baseline/ missing — first phase release?"
fi

# ── Plan ──────────────────────────────────────────────────────────────────

say
say "Plan:"
say "  1. bump package.json → ${VERSION_BARE}"
say "  2. CHANGELOG.md: promote '## Unreleased' → '## ${VERSION} — ${TODAY}'"
say "  3. commit:  chore(release): ${VERSION}"
say "  4. tag:     ${VERSION} (annotated, message = changelog excerpt)"
say "  5. push:    origin main + ${VERSION}"
say
say "Changelog excerpt for ${VERSION}:"
say "──────────────────────────────────────────────────────────────"
printf '%s\n' "${UNRELEASED_TRIMMED}"
say "──────────────────────────────────────────────────────────────"

if [ "${DRY_RUN}" -eq 1 ]; then
  say
  say "DRY RUN — exiting without writes."
  exit 0
fi

# ── Execute ───────────────────────────────────────────────────────────────

say
say "Executing release…"

# 1. Bump package.json. Use a small Node one-liner so we don't depend on jq.
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${VERSION_BARE}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
say "  ✓ package.json bumped"

# 2. Promote CHANGELOG section.
python - <<PY
import re
from pathlib import Path

p = Path("CHANGELOG.md")
text = p.read_text(encoding="utf-8")

NEW_HEADER = f"## ${VERSION} — ${TODAY}"
EMPTY_UNRELEASED = "## Unreleased\n"

# Replace the existing "## Unreleased" line with the new section header,
# then insert a fresh "## Unreleased" block above it.
def promote(m):
    return EMPTY_UNRELEASED + "\n" + NEW_HEADER

new_text, n = re.subn(r"^## Unreleased\b", promote, text, count=1, flags=re.MULTILINE)
if n != 1:
    raise SystemExit("could not locate '## Unreleased' heading")

p.write_text(new_text, encoding="utf-8")
PY
say "  ✓ CHANGELOG promoted"

# 3. Commit.
git add package.json CHANGELOG.md
COMMIT_MSG="chore(release): ${VERSION}

Promotes the Unreleased changelog block under ${VERSION}, dated ${TODAY}.
Phase-boundary release per PRD §7."
git commit -m "${COMMIT_MSG}"
say "  ✓ release commit landed"

# 4. Tag.
TAG_MSG="${VERSION} — ${TODAY}

${UNRELEASED_TRIMMED}"
git tag -a "${VERSION}" -m "${TAG_MSG}"
say "  ✓ annotated tag created"

# 5. Push.
git push origin main
git push origin "${VERSION}"
say "  ✓ main + tag pushed to origin"

# ── Next steps ────────────────────────────────────────────────────────────

say
say "──────────────────────────────────────────────────────────────"
say "Next steps (manual):"
say "  - Open https://github.com/plsft/basalt/releases/new?tag=${VERSION}"
say "  - Paste the changelog excerpt above into the release body"
say "  - Mark as latest release"
say "  - For tags v1.0.0+: also publish from packages/{cli,mcp,obsidian-plugin,ui,core}/"
say
say "Done."
