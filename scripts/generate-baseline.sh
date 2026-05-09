#!/usr/bin/env bash
# generate-baseline.sh
#
# Regenerate the parity baselines that pin the TS port to the Python
# reference's verb output. Run this whenever any of the following changes:
#
#   - reference/ submodule moves to a new tag (it shouldn't — Python is
#     frozen per PRD §10 #3)
#   - tests/parity/fixtures/ contents change (sample-vault-14 or test-vault-large)
#   - the embedding model is intentionally rotated
#
# For each fixture, this script:
#   1. Builds a clean SQLite index in the fixture's .basalt/ folder
#   2. Calls `basalt brief --format json` for every section AND for `--section all`
#   3. Writes the JSON to tests/parity/baseline/<fixture-prefix>-<verb>.json
#
# Defaults assume:
#   - Ollama is running locally on http://localhost:11434
#   - nomic-embed-text is pulled (`ollama pull nomic-embed-text`)
#   - The reference submodule is initialised and pinned at v0.0.11
#
# Inputs (env or flags):
#   BASALT_BIN — path to the basalt CLI binary. Default: ./.venv-reference/Scripts/basalt.exe (Windows uv venv).
#                On macOS/Linux, set to ./.venv-reference/bin/basalt.
#   BASALT_TODAY — YYYY-MM-DD, fed via env to make Drift/Buried thresholds reproducible. Default: 2026-05-09.

set -euo pipefail

# ── Resolve repo root regardless of cwd ──────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ── Defaults ──────────────────────────────────────────────────────────────
DEFAULT_VENV_BASALT="${REPO_ROOT}/.venv-reference/Scripts/basalt.exe"
if [ ! -x "${DEFAULT_VENV_BASALT}" ]; then
  # Fallback for non-Windows venvs.
  DEFAULT_VENV_BASALT="${REPO_ROOT}/.venv-reference/bin/basalt"
fi
BASALT_BIN="${BASALT_BIN:-${DEFAULT_VENV_BASALT}}"
BASALT_TODAY="${BASALT_TODAY:-2026-05-09}"

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

BASELINE_DIR="${REPO_ROOT}/tests/parity/baseline"
mkdir -p "${BASELINE_DIR}"

# ── Pre-flight ────────────────────────────────────────────────────────────
if [ ! -x "${BASALT_BIN}" ] && ! command -v "${BASALT_BIN}" >/dev/null 2>&1; then
  echo "✗ basalt CLI not found at ${BASALT_BIN}." >&2
  echo "  Install: uv pip install -e reference  (after `uv venv .venv-reference --python 3.13`)" >&2
  exit 2
fi

if ! curl -s -m 3 "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
  echo "✗ Ollama not reachable at ${OLLAMA_URL}. Run 'ollama serve' and 'ollama pull nomic-embed-text'." >&2
  exit 2
fi

# ── Per-fixture loop ──────────────────────────────────────────────────────
SECTIONS=("buried-insight" "connection" "contradiction" "implicit-thesis" "drift" "all")

declare -A FIXTURES=(
  ["sample-14"]="${REPO_ROOT}/tests/parity/fixtures/sample-vault-14"
  ["large-200"]="${REPO_ROOT}/tests/parity/fixtures/test-vault-large"
)

# Stable ordering: sample-14 first (small + fast), then large-200.
ORDERED_KEYS=("sample-14" "large-200")

for prefix in "${ORDERED_KEYS[@]}"; do
  vault="${FIXTURES[$prefix]}"
  if [ ! -d "${vault}" ]; then
    echo "✗ fixture vault missing: ${vault}" >&2
    exit 2
  fi
  db="${vault}/.basalt/basalt.db"
  rm -rf "${vault}/.basalt"
  mkdir -p "${vault}/.basalt"

  echo "──────────────────────────────────────────────"
  echo "Indexing fixture: ${prefix}  (${vault})"
  echo "──────────────────────────────────────────────"
  "${BASALT_BIN}" index --vault "${vault}" --db "${db}"

  for section in "${SECTIONS[@]}"; do
    case "${section}" in
      all)             out_name="brief" ;;
      buried-insight)  out_name="buried" ;;
      implicit-thesis) out_name="thesis" ;;
      *)               out_name="${section}" ;;
    esac
    out="${BASELINE_DIR}/${prefix}-${out_name}.json"
    echo "  brief --section ${section}  →  ${out}"
    # Python CLI's brief command writes the JSON document to stdout.
    # `|| true` because some sections may legitimately exit non-zero when
    # they produce no findings (e.g. drift on a vault with no Projects/).
    BASALT_TODAY="${BASALT_TODAY}" \
      "${BASALT_BIN}" brief --db "${db}" --section "${section}" --format json --top 3 \
        > "${out}" || true
    # Sanity-check JSON validity.
    python -c "import json,sys; json.load(open(sys.argv[1]))" "${out}" \
      || { echo "  ✗ produced invalid JSON: ${out}" >&2; exit 3; }
  done
done

echo
echo "──────────────────────────────────────────────"
echo "✓ Baselines written to ${BASELINE_DIR}"
ls -1 "${BASELINE_DIR}"
