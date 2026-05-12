#!/usr/bin/env bash
# scripts/deploy.sh — Deploy basalted.com infrastructure from this machine.
#
# Uses the local `wrangler` OAuth session (george@plsft.com). Run
# `bunx wrangler@latest login` first if you've never authed or the
# session has expired. OAuth sessions auto-refresh via the stored
# refresh_token, so a one-time login lasts indefinitely as long as you
# keep using wrangler from this machine.
#
# Custom domains (basalted.com / www.basalted.com / docs.basalted.com /
# api.basalted.com) are attached on first deploy and persist; this script
# does not need to re-attach them.
#
# Run from the repo root:  bash scripts/deploy.sh
# Or selectively:           bash scripts/deploy.sh api|site|docs

set -euo pipefail

# Resolve repo root (script is in scripts/).
cd "$(dirname "$0")/.."

WRANGLER="bunx wrangler@latest"

require_auth() {
  if ! $WRANGLER whoami >/dev/null 2>&1; then
    echo "❌ Not logged in to wrangler."
    echo "   Run: bunx wrangler@latest login"
    exit 1
  fi
}

build_all() {
  echo "▶ bun install"
  bun install --frozen-lockfile
  echo "▶ build @basalted/core"
  bun run --cwd packages/core build
  echo "▶ build site"
  bun run --cwd packages/site build
  echo "▶ build docs"
  bun run --cwd packages/docs build
}

deploy_api() {
  echo "▶ Deploying API to api.basalted.com"
  $WRANGLER deploy --env production --cwd packages/api
}

deploy_site() {
  echo "▶ Deploying site to basalted.com"
  $WRANGLER pages deploy packages/site/dist \
    --project-name=basalt-site \
    --branch=main \
    --commit-dirty=true
}

deploy_docs() {
  echo "▶ Deploying docs to docs.basalted.com"
  $WRANGLER pages deploy packages/docs/dist \
    --project-name=basalt-docs \
    --branch=main \
    --commit-dirty=true
}

main() {
  require_auth
  local target="${1:-all}"
  case "$target" in
    all)
      build_all
      deploy_api
      deploy_site
      deploy_docs
      ;;
    api)
      bun install --frozen-lockfile
      bun run --cwd packages/core build
      deploy_api
      ;;
    site)
      bun install --frozen-lockfile
      bun run --cwd packages/site build
      deploy_site
      ;;
    docs)
      bun install --frozen-lockfile
      bun run --cwd packages/docs build
      deploy_docs
      ;;
    *)
      echo "Usage: bash scripts/deploy.sh [all|api|site|docs]"
      exit 1
      ;;
  esac
  echo ""
  echo "✅ Done. Live at:"
  echo "   https://basalted.com"
  echo "   https://docs.basalted.com"
  echo "   https://api.basalted.com"
}

main "$@"
