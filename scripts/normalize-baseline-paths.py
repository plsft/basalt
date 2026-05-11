#!/usr/bin/env python3
"""normalize-baseline-paths.py

The Python baseline JSONs were generated on Windows where
`path.relative_to(vault_root)` returns Windows-style backslash paths. The TS
port normalizes to forward slashes (PRD §1.4 / SPEC.md §1.4). This script
rewrites every committed baseline JSON to use forward slashes.

Idempotent — running twice on a clean tree is a no-op.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINE_DIR = REPO_ROOT / "tests" / "parity" / "baseline"

# Walk the JSON in-place via the parser so we don't need to fight quoting.
# JSON-encoded backslash inside a string is `\\` (two source chars).


def normalise(s: str) -> str:
    data = json.loads(s)

    def walk(v):
        if isinstance(v, str):
            if "\\" in v and v.endswith(".md"):
                return v.replace("\\", "/")
            return v
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(val) for k, val in v.items()}
        return v

    return json.dumps(walk(data), indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    if not BASELINE_DIR.is_dir():
        print(f"  ! baseline dir missing: {BASELINE_DIR}", file=sys.stderr)
        sys.exit(2)
    changed = 0
    for f in sorted(BASELINE_DIR.glob("*.json")):
        text = f.read_text(encoding="utf-8")
        new = normalise(text)
        if new != text:
            # Re-parse to ensure we didn't break JSON.
            json.loads(new)
            f.write_text(new, encoding="utf-8")
            changed += 1
            print(f"  ✓ normalised {f.relative_to(REPO_ROOT)}")
    if changed == 0:
        print("  (no baselines needed normalisation — already forward-slash)")


if __name__ == "__main__":
    main()
