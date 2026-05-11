# SPEC.md — Basalt Verb Algorithm Specification

> The algorithmic contract every Basalt implementation must satisfy.
>
> Source of truth: this file. Reference implementation: the Python repo at `reference/`, pinned at tag `v0.0.11` (commit `42d340c`). All Python line-number citations refer to that pin. The Python repo is **frozen** per PRD §10 #3 — divergences land in TS only, recorded in `docs/parsing-decisions.md`.
>
> **Schema version: 1** (matches `reference/src/basalt/serialize.py:17`).

---

## 0. Document conventions

- File paths in citations are relative to `reference/` (the submodule root).
- Line citations use the form `path:line` or `path:line-line`.
- Threshold names in `UPPER_SNAKE_CASE` are the literal Python identifiers; carry them across to TS so a future reader can grep both repos with the same name.
- All verbs share five mechanical primitives — vault parser, link graph, embedding pipeline, hub-density, load-bearing quote extraction. Section 2 defines them once; verb sections (5–9) reference them.
- Where the Python reference computes a value with floating-point math, the TS port must produce the same result up to `ε = 1e-5` on similarity scores. Set membership and ordering of returned findings: exact match required (PRD §8.1, CLAUDE.md §8).

---

## 1. Input contract

### 1.1 Vault layout

A **vault** is any directory of `.md` files. Sub-directories are walked recursively. The reference excludes the following directory names anywhere in the path (`reference/src/basalt/vault.py:15`):

```
.git  .obsidian  .stversions  .stfolder  .trash  node_modules  .claude
```

A note is **parseable** when it has at least one word in its body after frontmatter is stripped. Notes with zero words are silently dropped (`vault.py:131`).

### 1.2 Frontmatter

Frontmatter parsing uses `python-frontmatter` (YAML). Recognised keys:

| Key | Type | Treatment |
| --- | --- | --- |
| `title` | string | Falls back to the file stem if absent (`vault.py:97`). |
| `created` | date / ISO string | Coerced through `_coerce_date`. Falls back to filesystem birth time / ctime (`vault.py:33-46, 89-92`). |
| `updated` | date / ISO string | Same coercion. Falls back to filesystem mtime (`vault.py:33-46, 89-93`). |
| `tags` | string OR list | Comma-split when string; stringified+stripped when list (`vault.py:99-105`). |

Date coercion accepts the formats `%Y-%m-%d`, `%Y/%m/%d`, `%Y-%m-%dT%H:%M:%S` and the dateutil-derived `date` and `datetime` instances. Truncate strings at 19 chars before parsing (`vault.py:43`).

### 1.3 Wikilinks

Pattern: `\[\[([^\]]+)\]\]` (`vault.py:14`). For each match, the link target is the text **before** the first `|` (alias separator) or `#` (anchor), trimmed (`vault.py:53`). Examples:

| Wikilink | Target |
| --- | --- |
| `[[Note Name]]` | `Note Name` |
| `[[Note\|Display]]` | `Note` |
| `[[Note#Section]]` | `Note` |
| `[[Note\|Display#Section]]` | `Note` |

Wikilink resolution to `note_id` is by **case-insensitive stem match** at index time (`index.py:124-135`). Unresolved targets are kept in the `links` table with `target_note_id = NULL` so they participate in stem-resolution after later notes are indexed.

### 1.4 Note record

```ts
interface Note {
  path: string;            // absolute, normalized
  relPath: string;         // forward-slash, vault-root-relative
  stem: string;            // filename without ".md"
  title: string;           // frontmatter title or stem
  created: string | null;  // ISO date YYYY-MM-DD
  updated: string | null;  // ISO date YYYY-MM-DD
  tags: string[];
  content: string;         // body, frontmatter stripped
  wikilinks: string[];     // raw target strings post alias/anchor stripping
  wordCount: number;       // body.split() length (Python whitespace split)
  contentHash: string;     // SHA-256 hex of body, UTF-8
}
```

**Path canonicalisation:** TS port uses forward slashes everywhere, including on Windows. `relPath` is the path relative to the resolved vault root (Python: `path.relative_to(vault_root)`; `vault.py:95`).

**Word count:** Python `len(body.split())` — splits on any run of whitespace, drops empties. TS port must produce the same value. Reference test vector: `"  hello   world\n"` → `2`.

---

## 2. Shared primitives

### 2.1 Index schema

All four runtime adapters (sql.js, better-sqlite3, @tauri-apps/plugin-sql, D1) target the same logical schema. SQL is from `reference/src/basalt/index.py:12-72`.

```sql
CREATE TABLE notes (
  id           INTEGER PRIMARY KEY,
  rel_path     TEXT UNIQUE NOT NULL,
  stem         TEXT NOT NULL,
  title        TEXT NOT NULL,
  created      TEXT,                  -- ISO YYYY-MM-DD
  updated      TEXT,
  word_count   INTEGER NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags         TEXT                   -- comma-joined
);
CREATE INDEX idx_notes_stem    ON notes(stem);
CREATE INDEX idx_notes_updated ON notes(updated);
CREATE INDEX idx_notes_created ON notes(created);

CREATE TABLE links (
  from_note_id   INTEGER NOT NULL,
  target         TEXT NOT NULL,        -- raw target string before resolution
  target_note_id INTEGER,              -- NULL until resolved by stem match
  FOREIGN KEY(from_note_id)   REFERENCES notes(id),
  FOREIGN KEY(target_note_id) REFERENCES notes(id)
);
CREATE INDEX idx_links_from   ON links(from_note_id);
CREATE INDEX idx_links_target ON links(target);
CREATE INDEX idx_links_to     ON links(target_note_id);

CREATE TABLE embeddings (
  note_id      INTEGER PRIMARY KEY,
  model        TEXT NOT NULL,
  content_hash TEXT NOT NULL,          -- the hash at embedding time
  dim          INTEGER NOT NULL,
  vec          BLOB NOT NULL,          -- float32 little-endian, length dim
  FOREIGN KEY(note_id) REFERENCES notes(id)
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE briefs (
  id              INTEGER PRIMARY KEY,
  verb            TEXT NOT NULL,
  finding_key     TEXT NOT NULL,
  finding_json    TEXT NOT NULL,
  falsification   TEXT NOT NULL,        -- JSON array
  created_at      TEXT NOT NULL,        -- ISO YYYY-MM-DD
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | falsified
  verdict_at      TEXT,
  verdict_reason  TEXT
);
CREATE INDEX idx_briefs_verb    ON briefs(verb);
CREATE INDEX idx_briefs_finding ON briefs(verb, finding_key);
CREATE INDEX idx_briefs_status  ON briefs(status);
CREATE INDEX idx_briefs_created ON briefs(created_at);
```

**Upsert semantics for `notes`** (`index.py:88-111`): on `rel_path` conflict, every column updates EXCEPT `created`, which uses `COALESCE(notes.created, excluded.created)` — preserve the original creation date even if the file's filesystem birthtime moves.

**Vector serialisation:** `float32` little-endian, byte-packed; `dim` columns equals the model output dimension (`embed.py:52-57`). The TS port uses `Float32Array` and `DataView.getFloat32(offset, true)` (little-endian explicit) for cross-runtime parity.

### 2.2 Embedding pipeline

Default model: `nomic-embed-text` (Ollama). Endpoint: `http://localhost:11434/api/embeddings` (`embed.py:13-14`).

For each note:

1. Concatenate `title + "\n\n" + content`, strip surrounding whitespace (`embed.py:75`).
2. Truncate to `EMBED_MAX_CHARS = 4000` characters (`embed.py:15, 20-21, 37-38`).
3. POST `{ model, prompt: text }`. Read `embedding` field as `float32`.
4. **L2-normalise.** If `||v||₂ > 0`, divide by norm. Zero-vector inputs stay zero (`embed.py:29-31, 47-49`).
5. Persist as `vec` blob in `embeddings`, record `model` + `content_hash` (the content's SHA-256 at embed time).

**Concurrency:** `EMBED_CONCURRENCY = 6`. Use a semaphore across `httpx.AsyncClient` (`embed.py:16, 60-93`). The TS port uses `Promise.allSettled` over a chunked queue with the same width.

**Re-embed trigger** (`embed.py:113-116`): a note is re-embedded if `cached_hash != content_hash` OR `cached_model != target_model`. Otherwise skipped.

**Pairwise similarity:** because vectors are pre-normalised, cosine similarity is the simple dot product. Verbs build a `Float32Array` matrix and compute `M · Mᵀ` via fused multiply-add.

### 2.3 Hub-density and hub-penalty

A note's **hub density** is *outgoing distinct wikilinks per 100 words* (`buried.py:497-500`, `connection.py:70-73`, `contradiction.py:117-120`, `implicit_thesis.py:73-76`):

```
density = out_link_count / max(word_count / 100, 1)
```

The `max(... , 1)` floor prevents division-by-zero blow-up on very short notes; densities for ≤100-word notes are equal to `out_link_count` directly.

Empirical thresholds from Fernando's vault (`buried.py:43-46`):

| Constant | Value | Meaning |
| --- | --- | --- |
| `HUB_DENSITY_HARD` | `1.5` | Above this, the note is excluded from candidate pools entirely (a Map-of-Content). |
| `HUB_DENSITY_SOFT` | `0.5` | Below this, no penalty. Above, inverse-square taper. |

The hub-penalty function (identical across `buried.py:567-573`, `connection.py:76-79`, `contradiction.py:123-125`, `implicit_thesis.py:79-81`):

```
excess  = max(0, density - HUB_DENSITY_SOFT)
penalty = 1 / (1 + (2 * excess)²)
```

Reference table (Python comment, `buried.py:570-573`):

| Density | Penalty |
| --- | --- |
| 0.5 | 1.00 |
| 0.7 | 0.86 |
| 1.0 | 0.50 |
| 1.3 | 0.28 |

### 2.4 Quote extraction (load-bearing sentence detection)

Authoritative implementation: `reference/src/basalt/buried.py:140-418`. Used by all four prose-verbs (Buried Insight, Connection, Contradiction, Implicit Thesis). Drift does not extract quotes.

#### 2.4.1 Bounds and constants

```
_MIN_QUOTE_CHARS = 40
_MAX_QUOTE_CHARS = 320
```

(`buried.py:141-142`)

#### 2.4.2 Markdown-noise stripping

Applied before sentence segmentation (`buried.py:163-190`). Each pattern below is replaced with the captured inner text (or a chosen capture group):

| Pattern | Replacement |
| --- | --- |
| `!\[[^\]\n]*\]\([^)\n]+\)` (image) | dropped |
| `\*\*([^*\n]+)\*\*` | group 1 |
| `(?<!\*)\*([^*\n]+)\*(?!\*)` | group 1 |
| `` `([^`\n]+)` `` | group 1 |
| `==([^=\n]+)==` | group 1 |
| `~~([^~\n]+)~~` | group 1 |
| `\[([^\]\n]+)\]\([^)\n]+\)` (md link) | group 1 |
| `\[\[([^\]\n\|]+)(?:\|([^\]\n]+))?\]\]` (wikilink) | group 2 if present, else group 1 |

After substitution, runs of whitespace are collapsed via `re.sub(r"\s+", " ", s).strip()` (`buried.py:190`).

#### 2.4.3 Sentence segmentation

Boundary regex (`buried.py:175`):

```
(?<=[.!?])\s+(?=[A-Z0-9"'(\[])
```

Splits on `.`, `!`, or `?` followed by whitespace and a capital letter, digit, opening quote, paren, or bracket. Dropped fragments (whitespace-only) are removed.

A sentence is **complete** if it ends with one of (`buried.py:178`):

```
. ! ? ” ’ " '
```

Colons, commas, and semicolons do **not** count as completions (no cliffhangers).

#### 2.4.4 Passage aggregation

The note body is decomposed into two independent passage streams:

- **Blockquote / callout passages** (`buried.py:298-333`):
  - Lines starting `> [!` open a callout group; later non-`>` line closes it.
  - Lines starting `> ` continue the current group; the inner text is `line[2:].strip()`.
  - Lines `>` alone close the group.
  - Inside a callout group, lines beginning with `-`, `*`, `#`, `|`, `>` flush the group (bullets/headers aren't claim prose).
  - Each emitted passage carries an `is_callout` boolean.

- **Prose paragraphs** (`buried.py:336-358`):
  - Skip lines starting with `#`, `-`, `*`, `|`, `>`, `<!--`, `---`, `+++`, or four spaces (code block).
  - Toggle in/out on lines starting `` ``` ``.
  - Contiguous non-skipped lines join with single spaces into one paragraph.

#### 2.4.5 Sentence scoring

For each passage, every complete sentence is scored via `_score_load_bearing(sentence, position, total, prefer_last)` (`buried.py:198-245`). Inputs and outputs:

```ts
function scoreLoadBearing(
  sentence: string,
  position: number,    // 0-based index within passage
  total: number,       // total sentences in the passage
  preferLast: boolean, // true inside callouts, false in prose
): number;
```

Score is the sum of:

| Signal | Condition | Δ score |
| --- | --- | --- |
| Last sentence (callout) | `preferLast && position == total - 1` | `+1.0` |
| Penultimate sentence (callout, ≥3 sents) | `preferLast && total >= 3 && position == total - 2` | `+0.4` |
| First sentence (prose) | `!preferLast && position == 0` | `+0.6` |
| Second sentence (prose, ≥3 sents) | `!preferLast && total >= 3 && position == 1` | `+0.2` |
| Em-dash claim shape | sentence contains `—` or ` – ` | `+0.6` |
| Negation+assertion | `_NEGATION_ASSERTION` matches | `+0.5` |
| Conclusion opener | `_CONCLUSION_OPENERS` matches | `+0.7` |
| Length 60–150 chars | `60 ≤ len ≤ 150` | `+0.2` |
| Length > 220 chars | `len > 220` | `−0.3` |
| Length < 40 chars | `len < 40` | `−0.5` |

`_CONCLUSION_OPENERS` regex (`buried.py:146-154`, case-insensitive):

```
^\s*(
    the\s+(\w+\s+){0,3}(is|isn't|are|aren't|means|comes\s+down\s+to)
  | ultimately
  | in\s+short
  | in\s+the\s+end
  | bottom\s+line
  | the\s+(takeaway|lesson|point|moat|real|truth|reality|verdict)
  | so\s+(the|what)
  | that\s+is\s+why
  | net[\s-]net
)\b
```

`_NEGATION_ASSERTION` regex (`buried.py:156-161`, case-insensitive):

```
\b(
    isn't|aren't|wasn't|weren't|doesn't|don't|won't|can't|
    shouldn't|wouldn't|hasn't|haven't|
    not\s+(just|merely|only|simply|enough)|
    no\s+longer
)\b
```

Implementation note: TS regex engine differs from Python's `re` on a few corner cases (Unicode word boundaries, possessive `’` apostrophe in classes). The TS port must verify exact match across both fixtures via the parity test before claiming compliance. Substitute Unicode-aware `\b` (`/u` flag) where Python's `re` is ASCII-only.

#### 2.4.6 Passage-level boost

Inside `_extract_claim_quote` (`buried.py:386-388`), every score from a blockquote/callout passage gets:

| Origin | Boost |
| --- | --- |
| Callout body | `+0.3` |
| Plain blockquote | `+0.2` |
| Prose paragraph | `0` |

#### 2.4.7 Pick-the-quote algorithm

`_extract_claim_quote(body)` returns `(quote, provenance)` where provenance is one of:

```
"empty" | "callout body" | "blockquote summary" |
"first prose sentence" | "opening passage"
```

(`buried.py:373-418`). Order:

1. **Score-based pass** (lines 380–397): collect every complete-sentence candidate from every blockquote/callout passage AND every prose paragraph; apply per-passage boost; sort by score descending; return the highest. Ties: Python's `list.sort` is stable, so ordering inserts callouts before prose at the same boosted score; the TS port must replicate this ordering.

2. **Aggregation fallback** (lines 399–407): when no individual sentence cleared the bounds, walk passages again and call `_pick_complete_quote(passage)` (`buried.py:269-295`), which accumulates sentences until `MIN ≤ total ≤ MAX` AND the running tail ends with a complete terminator. Blockquotes/callouts probed first, then prose.

3. **Final fallback** (lines 409–416): flatten body via `_strip_md`. If `len(flat) ≥ MIN`, take `flat[:MAX]`, find the rightmost complete-end position; return that prefix with provenance `"opening passage"`. If the rightmost terminator is below `MIN`, return the truncated string regardless.

4. **Empty body**: return `("", "empty")`.

---

## 3. Brief composition

A **Brief** is a single JSON document with this shape (`reference/src/basalt/cli.py:226-274`):

```ts
interface Brief {
  schema: 1;
  section: "buried-insight" | "connection" | "contradiction" |
           "implicit-thesis" | "drift" | "all";
  track_record: TrackRecordSummary;
  findings: {
    buried_insight?: Finding<"buried-insight">[];
    connection?:     Finding<"connection">[];
    contradiction?:  Finding<"contradiction">[];
    implicit_thesis?: Finding<"implicit-thesis">[];
    drift?:          Finding<"drift">[];
  };
}
```

`section: "all"` populates every key whose verb produced findings; selecting a single section populates only that key.

The render order on `--section all` is fixed (`cli.py:139`):

```
buried-insight → connection → contradiction → implicit-thesis → drift
```

Each finding object is augmented with a `falsification` array (Section 10) before serialisation (`cli.py:236-273`, `serialize.py:222-226`).

---

## 4. Track-record summary

Computed by `track_record(conn, days=90)` (`audit.py:581-595`). Counts pending / confirmed / falsified briefs whose `created_at >= today - days`.

```ts
interface TrackRecordSummary {
  schema: 1;
  window_days: number;          // default 90
  confirmed: number;
  pending: number;
  falsified: number;
  total: number;
  confirmed_pct: number;        // rounded to 1 dp (Python: round(_, 1))
  falsified_pct: number;        // rounded to 1 dp
}
```

`confirmed_pct = 100 * confirmed / total` (zero when `total == 0`). Rounded using Python's `round`, banker's rounding semantics on `.5` ties — TS port uses the same (implement explicit half-to-even when the platform's `Math.round` differs).

---

## 5. Verb: Implicit Thesis (Na)

Source: `reference/src/basalt/implicit_thesis.py`.

Site language: *"The thing you keep saying without realizing you're saying the same thing."*

### 5.1 Constants

| Name | Value | Source |
| --- | --- | --- |
| `DEFAULT_MIN_SIM` | `0.72` | `implicit_thesis.py:40` |
| `MIN_CLUSTER_SIZE` | `3` | `implicit_thesis.py:41` |
| `MIN_WORD_COUNT` | `60` | `implicit_thesis.py:42` |
| `DEFAULT_TOP_N` | `3` | `implicit_thesis.py:43` |
| `MAX_CLUSTERS_PROBED` | `200` | `implicit_thesis.py:44` |
| `MAX_CLUSTER_SIZE` | `15` | `implicit_thesis.py:45` |

### 5.2 Algorithm

1. **Candidate set** (`implicit_thesis.py:176-186`): every note with embedding AND `word_count >= MIN_WORD_COUNT`. Less than `MIN_CLUSTER_SIZE` notes → return `[]`.
2. **Hub filter** (`implicit_thesis.py:191-205`): drop notes with `density > HUB_DENSITY_HARD` (1.5). Less than `MIN_CLUSTER_SIZE` survivors → return `[]`.
3. **Pairwise similarity matrix** (`implicit_thesis.py:208-211`): `sims = M · Mᵀ`; `fill_diagonal(sims, -1.0)`.
4. **Tight-neighborhood clustering** (`_tight_neighborhoods`, `implicit_thesis.py:115-156`): for each candidate centroid `c`:
   - Take neighbours `j != c` with `sims[c, j] >= threshold`, sort by descending similarity to `c`.
   - Greedily build a cluster starting from `[c]`. Add each neighbour `nb` only if `sims[nb, m] >= threshold` for **every** existing member `m`.
   - Stop when the cluster reaches `MAX_CLUSTER_SIZE` or no neighbours remain.
   - If `len(cluster) >= min_size`, register it (deduped by sorted member tuple).
5. **For each cluster** (capped at `MAX_CLUSTERS_PROBED` greedy passes):
   - **Centroid** (`implicit_thesis.py:226-234`): the member with the highest mean similarity to other members. Diagonal positions (`-1.0`) are masked via `valid_mask = sub_sims > -0.5`; the mean is `(masked_sum / max(valid_count, 1))`.
   - **Mean intra-cluster similarity** (`implicit_thesis.py:236-243`): take the upper triangle excluding diagonal (`np.triu_indices(n, k=1)`), filter to entries `> -0.5`, take the mean. Empty selections → `0.0`.
   - **Folder diversity** (`implicit_thesis.py:246-247`): count distinct non-empty top-level folders across members.
   - **Span days** (`implicit_thesis.py:248-260`): max(date) − min(date) where `date` is each member's `created` plus `updated`. If fewer than two parseable dates → `0`.
   - **Diversity gate** (`implicit_thesis.py:262-266`): require `folder_diversity >= 2` OR `span_days >= 30`. Otherwise discard the cluster.
   - **Quotes** (`implicit_thesis.py:268-278`): run `_extract_claim_quote` on every member. If the centroid's quote is empty, discard the cluster.
   - **Score** (`implicit_thesis.py:280-287`):
     ```
     diversity_factor = folder_diversity if folder_diversity >= 2 else 1.0
     span_factor      = log(span_days + 1) if span_days > 0 else 1.0
     hub_pen_mean     = mean(hub_penalty(density(m)) for m in cluster)
     score = mean_similarity × cluster_size × diversity_factor × span_factor × hub_pen_mean
     ```
     `log` is the natural logarithm (`math.log`).
6. **Sort** descending by `score`. Return the top `top_n` (default 3).

### 5.3 Output

```ts
interface ImplicitThesisFinding {
  verb: "implicit-thesis";
  schema: 1;
  version: "v0-cluster";
  score: number;
  cluster_size: number;
  folder_diversity: number;
  span_days: number;
  mean_similarity: number;
  centroid: {
    rel_path: string;
    title: string;
    quote: string;
    quote_provenance: QuoteProvenance;
  };
  members: Array<{
    rel_path: string;
    title: string;
    folder: string;          // top-level folder ("" if note is at vault root)
    quote: string;
    quote_provenance: QuoteProvenance;
  }>;
  falsification: FalsificationRule[];
}
```

`top_folder(rel_path)` is `rel_path.split('/', 1)[0]` if `'/' in rel_path` else `""` (`implicit_thesis.py:69-70`).

### 5.4 Falsification rules

`reference/src/basalt/audit.py:103-135`. Three rules, all `kind`-tagged:

| Kind | Triggers when | Params |
| --- | --- | --- |
| `centroid_deleted` | The centroid's `rel_path` no longer exists. | `{rel_path}` |
| `cluster_dispersed` | After 90+ days, fewer than `min_remaining = max(2, cluster_size - 2)` members survive. | `{member_paths, min_remaining}` |
| `no_new_rephrasing` | After `grace_days = 90`, no new note expressing a similar claim. *v0 marks as pending — needs manual review.* | `{member_paths, grace_days: 90}` |

### 5.5 Edge cases

- Fewer than 3 notes total OR fewer than 3 with embeddings → return `[]`.
- After hub filter, fewer than 3 notes survive → return `[]`.
- Cluster's centroid quote empty → drop that cluster (do not pick a different centroid).
- Cluster spans only one folder AND `< 30` day time span → drop.
- Tied scores: Python's `sort` is stable; original order is the order clusters were registered (which is centroid index order from `_tight_neighborhoods`). TS port must produce the same order.

---

## 6. Verb: Contradiction (Cl)

Source: `reference/src/basalt/contradiction.py`.

Site language: *"The two notes you wrote that can't both be true."*

### 6.1 Constants

| Name | Value | Source |
| --- | --- | --- |
| `DEFAULT_MIN_SIM` | `0.72` | `contradiction.py:39` |
| `MIN_WORD_COUNT` | `60` | `contradiction.py:40` |
| `MAX_PAIRS` | `200` | `contradiction.py:41` |
| `DEFAULT_TOP_N` | `3` | `contradiction.py:42` |

### 6.2 Lexical signals

Three regex/data structures produce *evidence* of contradiction. None individually proves it; their scores accumulate.

**`_NEGATION`** (`contradiction.py:53-58`, case-insensitive). Matches contracted negations and "no longer", "not just/merely/only/simply/enough", "not the/a":

```
\b(
    isn't|aren't|wasn't|weren't|doesn't|don't|won't|can't|
    shouldn't|wouldn't|hasn't|haven't|never|no\s+longer|
    not\s+(just|merely|only|simply|enough|the|a)
)\b
```

**`_REVERSAL`** (`contradiction.py:62-69`, case-insensitive):

```
\b(
    actually|in\s+fact|turns?\s+out|on\s+reflection|
    i\s+was\s+wrong|i\s+changed\s+my\s+mind|
    the\s+opposite|opposite\s+is\s+true|
    contrary|nevertheless|however|but\s+actually|
    updated|revisited|second\s+thoughts|reconsider
)\b
```

**`_POLARITY_PAIRS`** (`contradiction.py:74-96`). Twenty antonym pairs, scored when one quote contains the positive form and the *other* quote contains the negative form (substring match, case-insensitive). The full list is:

| `+` | `−` |
| --- | --- |
| works | doesn't work |
| works | broken |
| worth it | not worth |
| buy | sell |
| ship | kill |
| ship | shelve |
| keep | drop |
| validated | invalidated |
| validated | failed |
| scales | doesn't scale |
| profitable | unprofitable |
| profitable | loses money |
| rising | falling |
| up | down |
| bullish | bearish |
| succeed | fail |
| right | wrong |
| true | false |
| possible | impossible |
| simple | complex |
| safe | risky |

The TS port must use the **same case-insensitive substring match** (`pos in a` semantics, not word-boundary). Reference behaviour: `"works"` matches inside `"frameworks"` — that is the documented Python behavior; preserve it.

### 6.3 Evidence scoring

`_contradiction_evidence(quote_a, quote_b)` (`contradiction.py:128-172`):

```
a = strip_md(quote_a).lower()
b = strip_md(quote_b).lower()
if a == "" or b == "":
    return (0.0, [])

score = 0.0
signals = []

a_neg = NEGATION matches a
b_neg = NEGATION matches b
if a_neg XOR b_neg:
    score += 1.0
    signals.append("asymmetric negation")

a_rev = REVERSAL matches a
b_rev = REVERSAL matches b
if a_rev XOR b_rev:
    score += 1.2
    signals.append("asymmetric reversal marker")

fired = []
for (pos, neg) in POLARITY_PAIRS:
    if (pos in a and neg in b) or (neg in a and pos in b):
        fired.append("'pos' ↔ 'neg'")
if fired:
    score += min(0.8 * len(fired), 1.6)
    signals.append("polarity-pair: " + "; ".join(fired))

return (score, signals)
```

Both negating, or both asserting, is **not** contradictory — only asymmetry counts (`contradiction.py:146`).

### 6.4 Algorithm

1. **Candidate set** (`contradiction.py:190-201`): every note with embedding AND `word_count >= 60`. Less than 2 → return `[]`.
2. **Hub filter** (`contradiction.py:203-215`): drop `density > HUB_DENSITY_HARD`. Less than 2 survivors → return `[]`.
3. **Similarity matrix** (`contradiction.py:217-219`): `sims = M · Mᵀ`; mask diagonal at `-1.0`.
4. **Pair pre-filter** (`contradiction.py:220-231`): take upper-triangle pairs (`np.triu_indices(n, k=1)`); keep pairs with `sim >= min_sim` (default 0.72). Cap at `MAX_PAIRS = 200` qualifying pairs.
5. **Per-pair scoring** (`contradiction.py:233-268`):
   - Extract quotes for both notes (cached). Skip pair if either quote empty.
   - Compute `(cscore, signals)`. Skip pair if `cscore <= 0`.
   - Compute hub penalties `pa`, `pb`.
   - Final rank: `s × cscore × √(pa × pb)`.
6. **Sort** descending by rank. **Diversity pass** (`contradiction.py:272-283`): walk in order, drop a pair if either endpoint already appeared in the result. Return the first `top_n` (default 3).

### 6.5 Output

```ts
interface ContradictionFinding {
  verb: "contradiction";
  schema: 1;
  version: "v0-heuristic";
  topical_similarity: number;     // raw cosine
  contradiction_score: number;    // _contradiction_evidence score, ≤ 3.0
  score: number;                  // final rank
  signals: string[];              // human-readable evidence list
  note_a: PairSide;
  note_b: PairSide;
  falsification: FalsificationRule[];
}

interface PairSide {
  rel_path: string;
  title: string;
  quote: string;
  quote_provenance: QuoteProvenance;
}
```

### 6.6 Falsification rules (`audit.py:173-197`)

| Kind | Triggers when | Params |
| --- | --- | --- |
| `neither_edited` | After `DEFAULT_CONTRA_GRACE_DAYS = 60`, neither A nor B has been edited within the grace window. *Heuristic was a false positive.* | `{a, b, grace_days: 60}` |
| `still_in_conflict` | After 90 days, both notes still exist with the contradiction signal intact. *Marks confirmed.* | `{a, b, grace_days: 90}` |

### 6.7 Edge cases

- Both quotes empty after stripping → no signal; score `0.0`. Not a candidate.
- Polarity-pair score capped at `1.6` (so two pairs = `1.6`, three+ pairs still `1.6`).
- Tie-breaking: stable sort on rank descending, then in the order of `np.triu_indices` traversal (column-major upper triangle). TS port must replicate exact order.

---

## 7. Verb: Drift (Hg)

Source: `reference/src/basalt/drift.py`.

Site language: *"What you say is the priority versus what you actually spent the week on."*

### 7.1 Constants

| Name | Value | Source |
| --- | --- | --- |
| `DEFAULT_WINDOW_DAYS` | `30` | `drift.py:32` |
| `MIN_PROJECTS` | `2` | `drift.py:33` |
| `MIN_DAILY_NOTES` | `3` | `drift.py:34` |
| `DEFAULT_TOP_N` | `1` | `drift.py:35` |
| Headline drift threshold | `5.0` percentage points | `drift.py:208-209` |

### 7.2 Project recognition

A note is "in a project" when its `rel_path` matches:

```
^(?:\d+[-_])?Projects/([^/]+)(?:/|$)
```

(`drift.py:38`). The captured group is the project name. Examples:

| Path | Project |
| --- | --- |
| `02-Projects/Atlas/HYPOTHESIS.md` | `Atlas` |
| `Projects/SignalBot/PHASE2.md` | `SignalBot` |
| `1-Projects/Beacon/Tasks.md` | `Beacon` |
| `02_Projects/Iris.md` | `Iris` |
| `Projects.md` | (none) |

### 7.3 Daily-note recognition

A note is a daily note (`drift.py:73-91`) when **either**:

- Its `tags` (joined CSV) contains the substring `"daily"` (case-insensitive), OR
- Its filename matches `^.*?(\d{4}-\d{2}-\d{2}).*\.md$` and the date parses as ISO.

When the filename pattern provides a date, that date is used for windowing. When only the tag fires and the filename has no parseable date, the note is included regardless of date (treated as recent).

### 7.4 Algorithm

1. **Discover projects** (`drift.py:139-146`): walk every note, count notes per project name. Less than 2 distinct projects → return `[]`.
2. **Collect dailies in window** (`drift.py:148-161`): for each note, run `_is_daily_note`. Skip notes whose date is older than `today - window_days`. Notes with unknown date are included (conservative). Less than 3 dailies → return `[]`.
3. **Mention regex** (`drift.py:94-103`):
   - Sort project names by length descending (so longer names match before shorter substrings).
   - Pattern: `(?<![A-Za-z0-9])(name1|name2|…)(?![A-Za-z0-9])`, case-insensitive.
   - Empty project list → `re.compile("a^")` (never matches).
4. **Count mentions** (`drift.py:106-114, 167-172`): apply pattern to each daily note's `content`. Sum hits per project (case-insensitive). Track canonical case via the project-name list.
5. **Totals**:
   - `total_stated = sum(stated_notes_per_project)` (or `1` if zero).
   - `total_lived = sum(mentions_per_project)`. If zero → return `[]` (no signal).
6. **Shares** (`drift.py:181-200`):
   - `stated_share[p] = stated_notes[p] / total_stated`
   - `lived_share[p]  = lived_mentions[p] / total_lived`
   - `stated_rank[p]`, `lived_rank[p]` are 1-based ranks by stated/lived count descending.
   - `drift_pct[p] = (lived_share[p] - stated_share[p]) * 100` (in percentage points).
7. **Headline picks** (`drift.py:208-211`):
   - `overworked = first share with drift_pct > 5.0` (after sorting by `|drift_pct|` descending).
   - `underworked = first share with drift_pct < -5.0`.
   - If both are `None`, return `[]` (no material drift).
8. **Score** (`drift.py:214`): `max(|drift_pct|)` across all shares.
9. Return `[finding][:max(1, top_n)]` (`drift.py:227`). v0 emits at most one finding.

### 7.5 Output

```ts
interface DriftFinding {
  verb: "drift";
  schema: 1;
  version: "v0";
  window_days: number;
  daily_note_count: number;
  project_count: number;
  total_mentions: number;
  score: number;                      // max |drift_pct|
  headline_overworked: ProjectShare | null;
  headline_underworked: ProjectShare | null;
  shares: ProjectShare[];             // sorted by |drift_pct| desc
  falsification: FalsificationRule[];
}

interface ProjectShare {
  name: string;
  stated_notes: number;
  stated_share: number;
  stated_rank: number;
  lived_mentions: number;
  lived_share: number;
  lived_rank: number;
  drift_pct: number;                  // pp; positive = overworked, negative = underworked
}
```

### 7.6 Falsification rules (`audit.py:138-170`)

| Kind | Triggers when | Params |
| --- | --- | --- |
| `drift_resolved` (overworked) | Project's lived share moves back toward stated within 30 days. *v0: needs re-run.* | `{project, direction: "down", grace_days: 30}` |
| `drift_resolved` (underworked) | Project's lived share rises toward stated within 30 days. *v0: needs re-run.* | `{project, direction: "up", grace_days: 30}` |
| `structural_change` | Project list at audit time differs from log time by Jaccard `< 0.75` within 60 days. | `{projects_at_log: string[]}` |

### 7.7 Edge cases

- No `Projects/` folder → return `[]`.
- One project, many dailies → return `[]` (need ≥ 2 projects for drift to be meaningful).
- Many projects, no daily-note pattern → return `[]`.
- Daily notes that mention nothing matching project names → `total_lived == 0` → return `[]`.
- All drifts within ±5pp → return `[]` (no headline).
- Tie sorting: stable Python sort by `-abs(drift_pct)`. TS must replicate.

---

## 8. Verb: Connection (C)

Source: `reference/src/basalt/connection.py`.

Site language: *"The two ideas in different folders that turn out to be the same idea."*

### 8.1 Constants

| Name | Value | Source |
| --- | --- | --- |
| `DEFAULT_MIN_SIM` | `0.78` | `connection.py:35` |
| `MIN_WORD_COUNT` | `60` | `connection.py:36` |
| `MAX_PAIRS` | `200` | `connection.py:37` |
| `DEFAULT_TOP_N` | `3` | `connection.py:38` |

### 8.2 Algorithm

1. **Candidate set** (`connection.py:97-108`): every note with embedding AND `word_count >= 60`. Less than 2 → return `[]`.
2. **Linked-pair set** (`connection.py:117-123`): build `linked_pairs: set<frozenset<int>>` from every resolved link in `links`. Self-links (`from_id == to_id`) excluded.
3. **Hub filter** (`connection.py:130-136`): drop `density > 1.5`. Less than 2 survivors → return `[]`.
4. **Similarity matrix** (`connection.py:138-148`): `sims = M · Mᵀ`; mask diagonal at `-1.0`; take upper-triangle pairs.
5. **Pair pre-filter** (`connection.py:150-163`): keep pairs where:
   - `sim >= min_sim` (default 0.78), AND
   - The pair is **not** in `linked_pairs` (in either direction), AND
   - **(when `require_different_top_folder`, default `true`)** A and B are in different top-level folders.
   - Cap at `MAX_PAIRS = 200`.
6. **Score & quote** (`connection.py:168-193`):
   - `pa = hub_penalty(density(a))`, `pb = hub_penalty(density(b))`.
   - `score = sim × √(pa × pb)`.
   - Extract quotes for both. If either quote empty, skip the pair.
7. **Sort** descending by `score`. **Diversity pass** (`connection.py:200-209`): walk in order, drop a pair if either endpoint already appears. Return the first `top_n`.

### 8.3 Output

```ts
interface ConnectionFinding {
  verb: "connection";
  schema: 1;
  similarity: number;
  score: number;                  // similarity × hub-penalty geometric mean
  note_a: ConnectionSide;
  note_b: ConnectionSide;
  falsification: FalsificationRule[];
}

interface ConnectionSide {
  rel_path: string;
  title: string;
  quote: string;
  quote_provenance: QuoteProvenance;
  hub_density: number;
}
```

### 8.4 Falsification rules (`audit.py:79-100`)

| Kind | Triggers when | Params |
| --- | --- | --- |
| `still_unlinked` | User links A↔B (in either direction): **confirmed**. After `DEFAULT_CONN_GRACE_DAYS = 60` with no link: **falsified**. | `{a, b, grace_days: 60}` |
| `either_shrinks` | Either note loses ≥ 50% of its content. *v0: needs original word_count at log time; defers to pending.* | `{a, b, drop_pct: 50}` |

### 8.5 Edge cases

- Two notes in the same folder reach 0.78 similarity → excluded by the folder-boundary rule.
- An already-linked pair reaches 0.78 → excluded as not-novel.
- Zero embeddings in the index → return `[]`.
- All pairs cluster around the same hub note → diversity pass returns at most one mention per note.

---

## 9. Verb: Buried Insight (Au)

Source: `reference/src/basalt/buried.py`.

Site language: *"The note you forgot you wrote that recent work still depends on."*

### 9.1 Constants

| Name | Value | Source |
| --- | --- | --- |
| `DEFAULT_MIN_AGE_DAYS` | `180` | `buried.py:24` |
| `DEFAULT_MIN_DORMANT_DAYS` | `90` | `buried.py:25` |
| `DEFAULT_RECENT_WINDOW_DAYS` | `180` | `buried.py:26` |
| `MIN_VALIDATORS` | `3` | `buried.py:27` |
| `MIN_SIM` | `0.62` | `buried.py:28` |
| `TOP_K_VALIDATORS` | `5` | `buried.py:29` |
| `MIN_WORD_COUNT` | `30` | `buried.py:30` |
| `MIN_BODY_FOR_QUOTE` | `80` | `buried.py:31` |

#### 9.1.1 Vault-age-aware floor/ceiling

| Name | Value | Source |
| --- | --- | --- |
| `VAULT_AWARE_MIN_AGE_FLOOR` | `60` | `buried.py:35` |
| `VAULT_AWARE_MIN_AGE_CEIL` | `365` | `buried.py:36` |
| `VAULT_AWARE_DORMANT_FLOOR` | `30` | `buried.py:37` |
| `VAULT_AWARE_DORMANT_CEIL` | `180` | `buried.py:38` |
| `VAULT_AWARE_RECENT_FLOOR` | `60` | `buried.py:39` |
| `VAULT_AWARE_RECENT_CEIL` | `365` | `buried.py:40` |

### 9.2 Vault-aware threshold derivation

`compute_vault_aware_thresholds(conn, today)` (`buried.py:110-138`):

```
vault_age_days = max(today - created for every note) or 0

if vault_age_days <= 0:
    return DEFAULT_{MIN_AGE,MIN_DORMANT,RECENT} (180, 90, 180)

min_age     = clamp(vault_age // 2,             MIN_AGE_FLOOR,   MIN_AGE_CEIL)         # [60, 365]
min_dormant = clamp(min_age   // 3,             DORMANT_FLOOR,   DORMANT_CEIL)         # [30, 180]
recent      = clamp(min(min_age, max(vault_age - 1, 1)),
                                                RECENT_FLOOR,    RECENT_CEIL)          # [60, 365]
```

Worked examples:

| Vault age | min_age | min_dormant | recent |
| --- | --- | --- | --- |
| 0 days (no dated notes) | 180 | 90 | 180 |
| 30 days | 60 | 30 | 60 |
| 120 days | 60 | 30 | 60 |
| 200 days | 100 | 33 | 100 |
| 365 days | 182 | 60 | 182 |
| 1000 days | 365 | 121 | 365 |
| 5000 days | 365 | 121 | 365 |

### 9.3 Algorithm

1. **Threshold selection** (`buried.py:435-447`): if `vault_aware`, use `compute_vault_aware_thresholds`; else `DEFAULT_*`. Explicit overrides (`min_age_days`, etc.) win at the call site.
2. **Cutoffs** (`buried.py:449-451`):
   - `age_cutoff = today - min_age_days`
   - `dormant_cutoff = today - min_dormant_days`
   - `recent_cutoff = today - recent_window_days`
3. **Note pull** (`buried.py:459-489`): every note + embedding (LEFT JOIN — embedding may be null). Compute `out_link_counts` separately.
4. **Recent-note filter** (`buried.py:492-496`):
   - `updated >= recent_cutoff` AND `word_count >= 30`.
5. **Candidate filter** (`buried.py:502-508`):
   - `created <= age_cutoff` AND `updated <= dormant_cutoff` AND `word_count >= 30` AND `density <= HUB_DENSITY_HARD`.
   - **Note: returns `None` rather than `[]`** when no candidates or no recent notes (`buried.py:510-511`). The TS port should normalise to `[]`.
6. **Inbound-recent count** (`buried.py:513-528`): SQL across `links` joined to candidate set and recent set; per-candidate count and source-id set.
7. **Semantic validation** (`buried.py:530-548`): for each candidate with embedding, take dot product with the recent-with-embedding matrix; mask `>= MIN_SIM (0.62)`; sort descending; cap at `TOP_K_VALIDATORS = 5`.
8. **Per-candidate scoring** (`buried.py:551-589`):
   - Combined validators = explicit set ∪ semantic ids. Skip if `< MIN_VALIDATORS = 3`.
   - `raw_score = (explicit_count × 2.0) + sum(semantic_sims) + 0.05 × (today - updated).days / 30`.
   - `density = out_links / max(word_count/100, 1)`.
   - `excess  = max(0, density - 0.5)`.
   - `penalty = 1 / (1 + (2 × excess)²)`.
   - `score = raw_score × penalty`.
9. **Sort** descending. For each top-N candidate (`buried.py:595-636`):
   - Skip if `len(content) < MIN_BODY_FOR_QUOTE = 80`.
   - Extract quote; skip if empty.
   - Compose validator list: explicit (in arbitrary set order — TS must canonicalise to ascending `note_id` for parity), then semantic. Sort by `(-int(explicit_link), -sim, updated_or_min)` ascending; cap at 5.
10. Return list of `BuriedInsight` records.

### 9.4 Output

```ts
interface BuriedInsightFinding {
  verb: "buried-insight";
  schema: 1;
  rel_path: string;
  title: string;
  stem: string;
  created: string;
  updated: string;
  word_count: number;
  score: number;
  hub_density: number;
  hub_penalty: number;
  inbound_recent_count: number;
  quote: string;
  quote_provenance: QuoteProvenance;
  vault_age_days: number;
  thresholds: {
    min_age_days: number;
    min_dormant_days: number;
    recent_window_days: number;
  };
  validators: Array<{
    rel_path: string;
    title: string;
    updated: string | null;
    explicit_link: boolean;
    similarity: number;          // 1.0 for explicit links, cosine for semantic
  }>;
  falsification: FalsificationRule[];
}
```

### 9.5 Falsification rules (`audit.py:52-76`)

| Kind | Triggers when | Params |
| --- | --- | --- |
| `no_new_validators` | After `grace_days = 60` no new note links to or semantically validates the candidate. *v0: pending — manual review.* | `{rel_path, grace_days: 60}` |
| `candidate_shrinks` | Candidate loses `> drop_pct = 30%` of its content. *v0: needs original word_count; defers to pending.* | `{rel_path, drop_pct: 30}` |
| `candidate_deleted` | Candidate's `rel_path` is gone. | `{rel_path}` |

### 9.6 Edge cases

- Empty vault → returns `[]` (TS) / `None` (Python).
- One-note vault → no candidates AND no recent notes → return `[]`.
- Frontmatter-only notes (`word_count < 30`) → not candidates, not recent.
- Vault where every dated note is newer than `min_age_days` → no candidates → `[]`.
- Notes with bodies of `< 80` chars → skipped after qualifying for scoring.
- Validator sort tie-breaking: explicit links first (`-int(True) < -int(False)`), then by similarity descending, then by `updated` ascending (with `None`/missing dates sorted via `date.min`).

---

## 10. Calibration layer

Source: `reference/src/basalt/audit.py`.

Every Brief finding is logged into the `briefs` table on output. The `audit` command walks pending briefs, applies their falsification rules against the current vault state, and moves each to `confirmed`, `falsified`, or leaves `pending`.

### 10.1 Finding key (idempotency)

`_finding_key(verb, finding)` (`audit.py:202-224`). Stable identifier so re-running `brief` doesn't double-log:

| Verb | Key |
| --- | --- |
| `buried-insight` | `buried-insight:{rel_path}` |
| `connection` | `connection:{sorted(a, b).join('|')}` |
| `contradiction` | `contradiction:{sorted(a, b).join('|')}` |
| `implicit-thesis` | `implicit-thesis:{sorted(member_paths).join('|')}` |
| `drift` | `drift:{under or "-"}->{over or "-"}@{window_days}d` |

### 10.2 Falsification rule shape

```ts
interface FalsificationRule {
  kind: string;            // dispatch key for audit re-eval
  params: Record<string, unknown>;
  text: string;            // human-readable, shown inline in the Brief
}
```

The full table of `kind` values per verb is in Sections 5–9. The audit's per-kind logic is `_evaluate_rule` (`audit.py:371-508`). Rules are applied in declaration order; the first non-pending verdict wins.

### 10.3 Defaults

| Constant | Value | Source |
| --- | --- | --- |
| `DEFAULT_BURIED_GRACE_DAYS` | `60` | `audit.py:24` |
| `DEFAULT_CONN_GRACE_DAYS` | `60` | `audit.py:25` |
| `DEFAULT_CONTRA_GRACE_DAYS` | `60` | `audit.py:26` |
| `DEFAULT_WORDCOUNT_DROP_PCT` | `30` | `audit.py:27` |

---

## 11. Citation format

Every Finding includes `rel_path` (or `rel_path` per side). The TS render layer is responsible for rendering them as clickable links. The reference does not encode line ranges in citations — quotes are not addressed by line number, they are quoted directly. (PRD §Glossary defines citations as "exact path + line range," but the v0 reference produces only `rel_path` + the quoted text. The TS port preserves v0 behaviour; line-range citations are post-v1.)

---

## 12. Cross-verb invariants

These properties must hold across all verbs in the TS port. They are exercised by the parity tests against the bundled fixtures.

1. **Determinism.** Given the same vault, same model, and the same `today`, the verb's output is byte-identical across runs (modulo floating-point on similarity scores within `ε = 1e-5`).
2. **Stability under re-index.** `index → brief` produces the same finding set as `index → index → brief` (idempotent).
3. **Read-only on vault.** No verb may write to any path under the vault root other than the index DB itself (which lives at `<vault>/.basalt/`). Promote-to-note is the *only* mutation primitive (PRD §2.1, §2.3) and is invoked by the surface layer, not the verbs.
4. **Hub filter consistency.** Every prose verb (Buried, Connection, Contradiction, Thesis) drops candidates with `density > HUB_DENSITY_HARD` *before* similarity is computed. Drift does not (it operates on path structure).
5. **Quote extraction is deterministic.** `_extract_claim_quote(body)` is a pure function of `body`. Same body → same `(quote, provenance)`.
6. **Top-N capping is post-sort, post-diversity.** Diversity pass runs first (verbs that have one); then take the first `top_n`.

---

## 13. Edge cases catalog (universal)

| Scenario | Expected result |
| --- | --- |
| Empty vault | All verbs return `[]`. Brief contains track-record only, all `findings.*` empty. |
| Single-note vault | All verbs return `[]`. |
| Notes with frontmatter only (no body) | Dropped at parse time (`vault.py:131`). |
| Notes whose only content is wikilinks | `word_count` is the link-text token count; may pass `MIN_WORD_COUNT = 30/60` and reach hub filter. |
| Notes that self-link via wikilinks | Self-link is preserved in `links` but excluded from `linked_pairs` for Connection (`connection.py:122`). |
| Pathological MOC notes | Excluded by `density > 1.5` from all prose verbs. Drift unaffected. |
| Same path indexed twice | Upsert on `rel_path`; `created` preserved by `COALESCE`. |
| Stale embeddings (model changed) | Re-embedded; old vector overwritten via `INSERT ... ON CONFLICT DO UPDATE`. |
| Daily notes with no parseable date | Tag-based detection includes them; filename detection skips them. Drift treats them as "in window" conservatively. |
| Vault with only daily notes | Drift returns `[]` (need ≥2 projects in `Projects/` tree). |

---

## 14. Output examples (sample-vault-14)

The bundled `examples/sample-vault/` in the Python reference has 24 notes — the "14-note" name in the PRD predates the most recent additions; the fixture identifier `sample-vault-14` is preserved for stability of test names. The actual file count is whatever ships at `reference/examples/sample-vault/` at the pinned `v0.0.11` tag.

The canonical baseline outputs (one JSON per verb plus a combined Brief) are produced by **TASK-0.4** running `python -m basalt brief --section <verb> --format json` against the fixture and committing the output to `tests/parity/baseline/`. Until that task lands, the file paths below are placeholders; once committed, this section links to them as the authoritative example.

```
tests/parity/baseline/sample-14-brief.json
tests/parity/baseline/sample-14-buried.json
tests/parity/baseline/sample-14-connection.json
tests/parity/baseline/sample-14-contradiction.json
tests/parity/baseline/sample-14-thesis.json
tests/parity/baseline/sample-14-drift.json
tests/parity/baseline/large-200-brief.json
tests/parity/baseline/large-200-{buried,connection,contradiction,thesis,drift}.json
```

Schema validation: each JSON's top-level `schema` must equal `1`; each finding under `findings.<verb>` must validate against the corresponding TS interface in this document.

---

## 15. TypeScript public surface

The `basalted-core` package exports the following types (PRD §3.2). Each maps to a verb's output shape above.

```ts
export type Verb =
  | "buried-insight"
  | "connection"
  | "contradiction"
  | "implicit-thesis"
  | "drift";

export type Finding =
  | BuriedInsightFinding
  | ConnectionFinding
  | ContradictionFinding
  | ImplicitThesisFinding
  | DriftFinding;

export interface Brief {
  schema: 1;
  section: Verb | "all";
  track_record: TrackRecordSummary;
  findings: Partial<Record<
    "buried_insight" | "connection" | "contradiction" |
    "implicit_thesis" | "drift",
    Finding[]
  >>;
}
```

Note the **snake_case to camelCase boundary**: the wire schema (this document's interfaces) is snake_case for parity with the Python serializer. Inside the TS engine, types are camelCase by convention; the I/O boundary in `basalted-core/brief/render.ts` (per PRD §3.2 layout) handles the transformation. The parity tests compare wire-format JSON, not in-memory structures.

---

## 16. Open questions and divergences

Recorded here whenever TS deviates from Python. Empty at TASK-0.3 land time.

- *(none yet)*

When divergences appear, they move to `docs/parsing-decisions.md` (per CLAUDE.md §8 step 4) and are summarised here with a one-line link.

---

## 17. Document maintenance

- Bump `Schema version` (top of file and in `serialize.py` mirror) when any wire-format field changes.
- Every threshold change requires a CHANGELOG entry, a `docs/decisions/` ADR, and regenerated parity baselines.
- Python source line citations are pinned to `reference/` at tag `v0.0.11`. If the submodule pin moves (it should not during the rewrite per PRD §10 #3), every citation in this document needs verification.
- The five verb sections (5–9) are the load-bearing core. Shared primitives (Section 2) sit underneath and changes there propagate through the parity tests on every verb.
