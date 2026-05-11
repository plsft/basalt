#!/usr/bin/env python3
"""generate-graph-baseline.py

Build the Python reference's link graph for each fixture and emit it as JSON
for the TS graph-parity test in tests/parity/graph.test.ts to diff against.

Inputs:
    tests/parity/fixtures/{sample-vault-14,test-vault-large}/

Outputs:
    tests/parity/baseline/graph-{sample-14,large-200}.json

Per-fixture shape:
    {
        "notes": [
            { "id": int, "rel_path": str, "stem": str, "word_count": int },
            ...
        ],
        "links": [
            { "from_id": int, "target": str, "target_id": int | null },
            ...
        ],
        "out_link_count": { "<id>": int, ... },
        "density":        { "<id>": float, ... }
    }

The walker uses the same alphabetical sort as TS so surrogate IDs line up
1:1 across implementations.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "reference" / "src"))

from basalt.vault import parse_note  # type: ignore[import-untyped]

FIXTURES = {
    "sample-14": REPO_ROOT / "tests" / "parity" / "fixtures" / "sample-vault-14",
    "large-200": REPO_ROOT / "tests" / "parity" / "fixtures" / "test-vault-large",
}
BASELINE_DIR = REPO_ROOT / "tests" / "parity" / "baseline"


def walk_sorted(vault: Path) -> list[Path]:
    """Walk vault in TS-equivalent alphabetical order. Skip .basalt/.obsidian/.git."""
    out: list[Path] = []
    for p in vault.rglob("*.md"):
        rel_parts = p.relative_to(vault).parts
        if any(part in {".basalt", ".obsidian", ".git"} for part in rel_parts):
            continue
        out.append(p)
    out.sort()
    return out


def build(vault: Path) -> dict:
    notes_meta: list[dict] = []
    links: list[dict] = []
    next_id = 1
    stem_to_id: dict[str, int] = {}
    rel_to_id: dict[str, int] = {}

    for path in walk_sorted(vault):
        n = parse_note(path, vault)
        if n is None or n.word_count == 0:
            continue
        nid = next_id
        next_id += 1
        rel_path = str(path.relative_to(vault)).replace("\\", "/")
        notes_meta.append({
            "id": nid,
            "rel_path": rel_path,
            "stem": n.stem,
            "word_count": n.word_count,
        })
        rel_to_id[rel_path] = nid
        # last-seen-stem-wins, matching index.py:resolve_link_targets dict overwrite
        stem_to_id[n.stem.lower()] = nid
        for target in n.wikilinks:
            links.append({"from_id": nid, "target": target, "target_id": None})

    # Resolve target IDs (after the stem map is fully populated).
    for link in links:
        link["target_id"] = stem_to_id.get(str(link["target"]).lower())

    # outLinkCount = COUNT(DISTINCT target) per from_id
    distinct: dict[int, set[str]] = {}
    for link in links:
        distinct.setdefault(int(link["from_id"]), set()).add(str(link["target"]))
    out_link_count = {str(k): len(v) for k, v in distinct.items()}

    # density per note
    density: dict[str, float] = {}
    for note in notes_meta:
        nid = int(note["id"])
        wc = int(note["word_count"])
        olc = len(distinct.get(nid, set()))
        if wc <= 0:
            density[str(nid)] = 0.0
        else:
            density[str(nid)] = olc / max(wc / 100.0, 1.0)

    return {
        "notes": notes_meta,
        "links": links,
        "out_link_count": out_link_count,
        "density": density,
    }


def main() -> None:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    for prefix, vault in FIXTURES.items():
        if not vault.is_dir():
            print(f"  ! fixture missing: {vault}", file=sys.stderr)
            continue
        payload = build(vault)
        target = BASELINE_DIR / f"graph-{prefix}.json"
        target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        n = len(payload["notes"])
        m = len(payload["links"])
        print(f"  ✓ {prefix}: {n} notes / {m} links → {target.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
