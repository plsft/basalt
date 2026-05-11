#!/usr/bin/env python3
"""generate-parser-baseline.py

Emit a JSON baseline of the Python reference's parser output for every .md
file in tests/parity/fixtures/{sample-vault-14,test-vault-large}/. The TS
parity test in tests/parity/parser.test.ts diffs the TypeScript port's
output against this baseline file-by-file.

Run after any change to:
  - reference/ submodule pin (Python parser source)
  - the fixture contents (sample-vault-14 or test-vault-large)

Usage:
    python scripts/generate-parser-baseline.py

Writes:
    tests/parity/baseline/parser-sample-14.json
    tests/parity/baseline/parser-large-200.json

Per-entry shape (mirrors basalt.vault.Note minus on-disk timestamps so the
baseline is reproducible across machines):

    {
        "rel_path":     str,              # forward slashes
        "stem":         str,
        "title":        str,
        "created":      str | null,       # YYYY-MM-DD
        "updated":      str | null,
        "tags":         [str],
        "wikilinks":    [str],
        "word_count":   int,
        "content_hash": str               # sha256 hex
    }

Note: the baseline excludes the `path` field (machine-specific absolute
path) and `content` (large; we don't need to store it — both parsers read
the same fixture file). Filesystem-fallback `created`/`updated` (used when
frontmatter doesn't carry them) are intentionally normalized to
None here so we don't bake the baseline-generator's wall clock into a
committed file.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Make the reference src/ importable.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "reference" / "src"))

import frontmatter  # type: ignore[import-untyped]

from basalt.vault import _coerce_date, _extract_wikilinks  # type: ignore[import-untyped]
import hashlib

FIXTURES = {
    "sample-14": REPO_ROOT / "tests" / "parity" / "fixtures" / "sample-vault-14",
    "large-200": REPO_ROOT / "tests" / "parity" / "fixtures" / "test-vault-large",
}
BASELINE_DIR = REPO_ROOT / "tests" / "parity" / "baseline"


def _date_str(d):
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()
    return str(d)


def parse_one(path: Path, vault_root: Path) -> dict | None:
    """Mirror basalt.vault.parse_note but normalise filesystem dates to None
    so the baseline is reproducible across machines."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    try:
        post = frontmatter.loads(raw)
    except Exception:
        post = frontmatter.Post(raw, **{})

    fm = post.metadata or {}
    body = post.content or ""

    if not body or len(body.split()) == 0:
        # walk_vault filters notes with word_count == 0 (vault.py:131)
        return None

    rel_path = str(path.relative_to(vault_root)).replace("\\", "/")
    stem = path.stem
    title = str(fm.get("title") or stem)
    created = _date_str(_coerce_date(fm.get("created")))
    updated = _date_str(_coerce_date(fm.get("updated")))

    tags_raw = fm.get("tags", [])
    if isinstance(tags_raw, str):
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    elif isinstance(tags_raw, list):
        tags = [str(t).strip() for t in tags_raw if str(t).strip()]
    else:
        tags = []

    wikilinks = _extract_wikilinks(body)
    word_count = len(body.split())
    content_hash = hashlib.sha256(body.encode("utf-8", "replace")).hexdigest()

    return {
        "rel_path": rel_path,
        "stem": stem,
        "title": title,
        "created": created,
        "updated": updated,
        "tags": tags,
        "wikilinks": wikilinks,
        "word_count": word_count,
        "content_hash": content_hash,
    }


def main() -> None:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    for prefix, vault in FIXTURES.items():
        if not vault.is_dir():
            print(f"  ! fixture missing: {vault}", file=sys.stderr)
            continue
        out: list[dict] = []
        for md in sorted(vault.rglob("*.md")):
            # Skip the .basalt index database directory.
            if any(p in {".basalt", ".obsidian", ".git"} for p in md.relative_to(vault).parts):
                continue
            row = parse_one(md, vault)
            if row is not None:
                out.append(row)
        out.sort(key=lambda r: r["rel_path"])
        target = BASELINE_DIR / f"parser-{prefix}.json"
        target.write_text(
            json.dumps(out, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  ✓ {prefix}: {len(out)} notes → {target.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
