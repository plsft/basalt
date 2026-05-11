#!/usr/bin/env python3
"""generate-embeddings-baseline.py

Dump the Python reference's per-note embeddings for both fixtures so the TS
parity test in tests/parity/brief.test.ts can load them into TS storage and
run the verbs against byte-identical input vectors.

Reads the SQLite indexes built by scripts/generate-baseline.sh
(tests/parity/fixtures/{sample-vault-14,test-vault-large}/.basalt/basalt.db).

Outputs JSON with { rel_path → { dim, vec[] } } per fixture.

Per-fixture file: tests/parity/baseline/embeddings-{sample-14,large-200}.json

The vector is base64-encoded float32 little-endian bytes for compactness.
"""

from __future__ import annotations

import base64
import json
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

FIXTURES = {
    "sample-14": REPO_ROOT / "tests" / "parity" / "fixtures" / "sample-vault-14",
    "large-200": REPO_ROOT / "tests" / "parity" / "fixtures" / "test-vault-large",
}
BASELINE_DIR = REPO_ROOT / "tests" / "parity" / "baseline"


def dump(prefix: str, vault: Path) -> None:
    db = vault / ".basalt" / "basalt.db"
    if not db.is_file():
        print(f"  ! no index DB: {db}", file=sys.stderr)
        return
    conn = sqlite3.connect(db)
    rows = conn.execute(
        "SELECT n.rel_path, e.model, e.dim, e.vec FROM notes n "
        "JOIN embeddings e ON e.note_id = n.id ORDER BY n.id"
    ).fetchall()
    conn.close()
    out: dict = {}
    model_seen = None
    for rel_path, model, dim, vec_blob in rows:
        if model_seen is None:
            model_seen = model
        elif model_seen != model:
            print(f"  ! mixed embedding models in fixture {prefix}", file=sys.stderr)
        out[str(rel_path).replace("\\", "/")] = {
            "dim": int(dim),
            "vec_b64": base64.b64encode(vec_blob).decode("ascii"),
        }
    target = BASELINE_DIR / f"embeddings-{prefix}.json"
    target.write_text(
        json.dumps({"model": model_seen, "embeddings": out}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"  ✓ {prefix}: {len(out)} embeddings → {target.relative_to(REPO_ROOT)}")


def main() -> None:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    for prefix, vault in FIXTURES.items():
        if not vault.is_dir():
            print(f"  ! fixture missing: {vault}", file=sys.stderr)
            continue
        dump(prefix, vault)


if __name__ == "__main__":
    main()
