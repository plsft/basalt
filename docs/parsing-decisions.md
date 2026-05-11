# Parsing Decisions

> A running ledger of parser-side semantic choices. Each entry pins a TS-vs-Python behavior — usually a known-by-design alignment, sometimes a deliberate divergence with rationale.
>
> Per PRD §10 #3 the Python reference is **frozen** at `v0.0.11`. When a future TS change creates a divergence, it lives here with a reason; the test in `tests/parity/parser.test.ts` enforces no *undocumented* divergence creeps in.

---

## 2026-05-10 — TASK-1.2 — Initial parser port

The TS parser at `packages/core/src/parser/{markdown,frontmatter,sentences}.ts` matches `reference/src/basalt/vault.py` byte-for-byte across every file in `tests/parity/fixtures/{sample-vault-14,test-vault-large}/`. **Zero divergences** at this commit. The decisions below are alignment choices that needed explicit work to achieve parity; document them so future changes don't drift.

### D-1: Wikilinks inside fenced code blocks count as wikilinks

**TS**: `extractWikilinks()` runs `WIKILINK_RE = /\[\[([^\]]+)\]\]/g` on the entire body.

**Python**: `vault.py:14, :49-56, :116` does the same on `post.content`.

**Decision**: A code block containing `[[Foo]]` produces a wikilink. The Python reference's regex doesn't distinguish code-block content from prose. The TS port preserves the behavior verbatim.

**Why this matters**: a clean architectural rewrite would naturally use `unified` + `remark-parse` to walk the AST and skip code blocks. We deliberately don't, because that would create a parity divergence on every fixture file with code-block-shaped wikilinks. If/when v1 wants to filter code-block links, that's a deliberate spec change with regenerated baselines and a CHANGELOG entry — not a parser implementation detail.

### D-2: Body whitespace is `.strip()`-ed (matches `python-frontmatter`)

**TS**: `parseFrontmatter()` calls `.trim()` on (a) the raw input before delimiter detection, and (b) the extracted body before returning.

**Python**: `frontmatter.parse()` does `text = u(text, encoding).strip()` at entry and `return metadata, content.strip()` at exit. (See `python-frontmatter` source — `parse()` function.)

**Decision**: Both leading and trailing whitespace around the body are dropped. Without this, `content_hash` differs by the count of stripped newline bytes.

### D-3: Universal newline normalization (CRLF / CR → LF)

**TS**: `parseMarkdown()` runs `s.replace(/\r\n?/g, "\n")` on raw input before frontmatter extraction.

**Python**: `Path.read_text(encoding="utf-8", errors="replace")` opens in text mode, which uses Python's universal-newlines reader. CRLF and CR are silently translated to LF before the bytes are decoded into the `str`.

**Decision**: The TS parser normalizes line endings as if it were `read_text` in Python text mode. Without this, `content_hash` (which is `sha256(body)`) diverges on every Windows checkout where `.gitattributes`'s `* text=auto eol=lf` checks files out as CRLF.

This belongs in the *parser*, not in a per-surface filesystem adapter, because:

1. The contract is "feed me Markdown text, I'll give you a `ParsedNote`." Adapters should be free to read raw bytes however the runtime allows.
2. Multiple adapters share the parser; doing it once at the parser is one less place to forget.
3. The Python reference effectively does the same thing, so calling it parser behavior matches the spec.

### D-4: Frontmatter date parsing — js-yaml DEFAULT_SCHEMA matches PyYAML for the formats we care about

**TS**: `parseFrontmatter()` uses `yaml.load(yamlText, { schema: yaml.DEFAULT_SCHEMA })`.

**Python**: `python-frontmatter` uses PyYAML's safe_load which auto-types `2024-01-15` as `datetime.date` and `2024-01-15T14:30:00` as `datetime.datetime`.

**Decision**: js-yaml's DEFAULT_SCHEMA also auto-types `YYYY-MM-DD` strings as JS `Date`. Both libraries default to UTC midnight for date-only values per the YAML 1.2 spec. Output of `coerceDate` is therefore identical for the date formats SPEC.md §1.2 enumerates (`%Y-%m-%d`, `%Y/%m/%d`, `%Y-%m-%dT%H:%M:%S`).

Edge case: a YAML timestamp WITH a non-UTC timezone offset would render to a different *calendar day* than a same-instant UTC interpretation. We have no such fixture today, but if one is added the parity test will catch it and force a decision.

### D-5: Tags coercion — string OR list, exact Python semantics

**TS**: `coerceTags()` accepts a string (split on `,`, trim each, drop empties), a list (string-coerce each, trim, drop empties), or returns `[]`.

**Python**: `vault.py:99-105` does the same with the same conditionals.

**Decision**: `tags` accepts string OR list. Anything else (number, dict, null) → `[]`. No surprises.

### D-6: Word count via Python `str.split()` semantics

**TS**: `wordCount()` is `s.split(/\s+/).filter(w => w.length > 0).length`.

**Python**: `len(body.split())` — `str.split()` with no args splits on runs of whitespace and discards empty leading/trailing tokens.

**Decision**: TS uses the same algorithm. SPEC.md §1.4 reference test vector `"  hello   world\n"` → `2`. Both implementations produce 2.

### D-7: SHA-256 hex of UTF-8 body (Python `hashlib.sha256(body.encode("utf-8", "replace")).hexdigest()`)

**TS**: `sha256Hex()` uses `crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))` and lowercase hex.

**Python**: `hashlib.sha256(body.encode("utf-8", "replace")).hexdigest()` produces lowercase hex.

**Decision**: Identical bytes in → identical hex out. `TextEncoder` encodes as UTF-8 by default (no replacement-char mode required for our fixtures, which are well-formed UTF-8). If a fixture ever contains malformed UTF-8 bytes, Python's `errors="replace"` substitutes U+FFFD; TS would do the same via `TextEncoder`'s WHATWG behavior. Equivalent.

### D-8: Sentence-aware quote extraction — every regex and weight is byte-for-byte from `buried.py:140-418`

The regex tables and scoring weights in `packages/core/src/parser/sentences.ts` are reproduced verbatim from `reference/src/basalt/buried.py:140-418` at tag `v0.0.11`. SPEC.md §2.4 is the human-readable restatement of those same numbers.

Verified by hand against the Python source. No unit-test parity (yet) at the per-file `extractClaimQuote` level — that lands when the verbs port (TASK-1.6 onward) and the per-verb baseline JSONs exercise the quote pipeline through actual finding output.

If a sentence-extraction divergence is ever found, document it here with the input that triggered it and the rationale for resolution.

---

## 2026-05-10 — TASK-1.11 — Brief-parity divergences (verb-side)

The full-Brief parity test (`tests/parity/brief.test.ts`) loads Python's
pre-computed embeddings into TS storage so verbs see identical input vectors.
With paths normalised (one-time `scripts/normalize-baseline-paths.py` ran
against the committed baselines), three divergences remain. They are documented
here as known-open and are the gating work to call Phase 1 exit-ready.

### D-9: Connection — TS finds 3 candidates where Python found 0 (sample-14)

**Symptom:** Python's `sample-14-connection.json` has zero findings; TS finds
three cross-folder pairs with cosine ≥ 0.78.

**Hypothesis (unverified):** the Python reference may be running with stricter
hub-density on the sample vault than the TS port replicates. Specifically the
sample-14 fixture has notes with high outgoing-link density that may sit just
above `HUB_DENSITY_HARD = 1.5` in Python's measurement but just below in TS's
(both compute `out_links / max(word_count/100, 1)` from the same notes).

**Resolution path:**
1. Add a temporary debug print to TS's `findConnections` that emits the chosen
   pairs + per-note density at evaluation time.
2. Run the Python CLI against the same fixture with the same instrumentation.
3. Compare: which note's density measurement differs?
4. If it's a parser-side word_count delta, the parser-parity test (which is
   green at 100%) would have caught it — so it's likely link-resolution
   (the `out_links` numerator).
5. If TS's `replaceLinks` + `resolveLinkTargets` produces a different DISTINCT
   target count than Python's `COUNT(DISTINCT target) GROUP BY from_note_id`,
   that's the bug.

### D-10: Implicit Thesis — TS finds 2 clusters where Python found 1 (sample-14)

**Symptom:** TS surfaces an additional cluster
`{01-Daily/2026-04-28.md, 01-Daily/2026-05-03.md, 02-Projects/Atlas/Strategy/Mon.md, 02-Projects/Atlas/Strategy/Wed.md}`
that Python doesn't.

**Hypothesis:** The diversity gate (≥ 2 folders OR ≥ 30d span) might be evaluated
against slightly different folder strings (forward-vs-back-slash splits at the
top folder). The TS port uses `relPath.indexOf("/")` to extract `topFolder`.

**Resolution path:** Verify both ports compute identical `top_folder` for every
member of the disputed cluster. If TS sees `01-Daily` and `02-Projects` as
two folders (diversity = 2), but Python sees `01-Daily\…` and `02-Projects\…`
collapse to a different value, there's a backslash-handling delta.

### D-11: Contradiction — small score drift + ordering mismatch (large-200)

**Symptom:** Same set of candidate pairs but score differs by ~0.07 in the
top spot, and the second-place pair swaps. Within `ε = 1e-5` tolerance? No —
the delta is 7×10⁴ above ε.

**Hypothesis (most likely):** Python's `_NEGATION` regex includes a backref
clause `not\s+(just|merely|only|simply|enough|the|a)` that might match
slightly differently on TS's `RegExp` engine vs Python's `re`. The signals
list is correct but the score (which sums signal weights) differs because TS
fires one extra signal that Python suppresses — or vice versa.

**Resolution path:** For each diverging pair, dump both the Python-computed
`signals` list and the TS-computed list. The signal-set delta is the bug.

### D-12: Buried Insight — full strict parity passes ✓

For `tests/parity/baseline/sample-14-buried.json` and
`tests/parity/baseline/large-200-buried.json`, after path normalisation
(D-9 above's prerequisite) **the Buried Insight verb is at strict parity** —
identical findings, identical ordering, scores within ε. Recorded here as a
positive-control proof point: the embedding-injection + verb-execution +
finding-comparison pipeline works correctly for at least one verb today.

The remaining three verbs need the per-D-9/D-10/D-11 investigations above.

---

## How divergences are added

When a divergence does eventually land:

1. Add a dated section above with a stable `D-N` identifier.
2. Quote the TS behavior, the Python behavior, and the literal source line(s).
3. State the decision and the *why*.
4. If it changes any committed parity baseline, regenerate via `python scripts/generate-parser-baseline.py` (parser baselines) and `bash scripts/generate-baseline.sh` (verb baselines), then add a CHANGELOG entry under `## Unreleased`.
5. If the change is non-trivial, also drop a `docs/decisions/YYYY-MM-DD-<slug>.md` ADR per CLAUDE.md §9.
