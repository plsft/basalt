// packages/core/src/migrations/index.ts
//
// Bundle the canonical migration SQL as inlined strings so consumers don't
// need to ship the .sql files separately or know the relative path. Real
// SQL adapters (sql.js, better-sqlite3, Tauri-SQL) execute these in order.

export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  {
    id: "001-init",
    // Re-exported via a separate `.sql` file consumed by the build / packaged
    // by tsup; for now we inline the literal so consumers don't depend on
    // bundler-specific asset loading. Keep in sync with
    // src/migrations/001-init.sql — verified by the schema-parity test.
    sql: `CREATE TABLE IF NOT EXISTS notes (
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

CREATE TABLE IF NOT EXISTS briefs (
    id              INTEGER PRIMARY KEY,
    verb            TEXT NOT NULL,
    finding_key     TEXT NOT NULL,
    finding_json    TEXT NOT NULL,
    falsification   TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    verdict_at      TEXT,
    verdict_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_briefs_verb     ON briefs(verb);
CREATE INDEX IF NOT EXISTS idx_briefs_finding  ON briefs(verb, finding_key);
CREATE INDEX IF NOT EXISTS idx_briefs_status   ON briefs(status);
CREATE INDEX IF NOT EXISTS idx_briefs_created  ON briefs(created_at);
`,
  },
];
