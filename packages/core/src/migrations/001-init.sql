-- Basalt — canonical schema (migration 001).
--
-- Byte-equivalent to reference/src/basalt/index.py:12-72 at tag v0.0.11.
-- Every storage adapter (sql.js for plugin, better-sqlite3 for CLI,
-- @tauri-apps/plugin-sql for desktop) consumes this file as the single
-- source of truth so the on-disk DB layout is identical across surfaces
-- and across the Python ↔ TypeScript boundary.
--
-- Forward-only migrations. Subsequent files (002-..., 003-..., etc.) only
-- ALTER existing tables or CREATE new ones — never DROP.

CREATE TABLE IF NOT EXISTS notes (
    id              INTEGER PRIMARY KEY,
    rel_path        TEXT UNIQUE NOT NULL,
    stem            TEXT NOT NULL,
    title           TEXT NOT NULL,
    created         TEXT,
    updated         TEXT,
    word_count      INTEGER NOT NULL,
    content         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    tags            TEXT
);
CREATE INDEX IF NOT EXISTS idx_notes_stem ON notes(stem);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created);

CREATE TABLE IF NOT EXISTS links (
    from_note_id    INTEGER NOT NULL,
    target          TEXT NOT NULL,
    target_note_id  INTEGER,
    FOREIGN KEY(from_note_id)   REFERENCES notes(id),
    FOREIGN KEY(target_note_id) REFERENCES notes(id)
);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_note_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(target_note_id);

CREATE TABLE IF NOT EXISTS embeddings (
    note_id         INTEGER PRIMARY KEY,
    model           TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    dim             INTEGER NOT NULL,
    vec             BLOB NOT NULL,
    FOREIGN KEY(note_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS meta (
    key             TEXT PRIMARY KEY,
    value           TEXT
);

-- Calibration layer: every Brief finding logged with falsification rules,
-- re-evaluated on `basalt audit`. The longer the user runs Basalt, the
-- more valuable their track record becomes.
CREATE TABLE IF NOT EXISTS briefs (
    id              INTEGER PRIMARY KEY,
    verb            TEXT NOT NULL,
    finding_key     TEXT NOT NULL,        -- stable id for dedup across runs
    finding_json    TEXT NOT NULL,        -- full payload for re-eval + history
    falsification   TEXT NOT NULL,        -- JSON array of {kind, params, text}
    created_at      TEXT NOT NULL,        -- ISO date YYYY-MM-DD
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending/confirmed/falsified
    verdict_at      TEXT,                  -- ISO date when status moved off pending
    verdict_reason  TEXT                   -- why
);
CREATE INDEX IF NOT EXISTS idx_briefs_verb     ON briefs(verb);
CREATE INDEX IF NOT EXISTS idx_briefs_finding  ON briefs(verb, finding_key);
CREATE INDEX IF NOT EXISTS idx_briefs_status   ON briefs(status);
CREATE INDEX IF NOT EXISTS idx_briefs_created  ON briefs(created_at);
