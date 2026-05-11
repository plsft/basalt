// packages/core/src/parser/sentences.ts
// Sentence-aware load-bearing-quote extraction.
//
// All regex, weights, and constants here are byte-for-byte from
// reference/src/basalt/buried.py:140-418 at tag v0.0.11. SPEC.md §2.4 is
// the authoritative restatement; numbers below are cross-referenced to the
// Python source.

import type { QuoteProvenance } from "../verbs/types";

// ── Bounds (buried.py:141-142) ────────────────────────────────────────────
export const MIN_QUOTE_CHARS = 40;
export const MAX_QUOTE_CHARS = 320;

// ── Markdown noise stripping (buried.py:163-190) ──────────────────────────
// Order matters — image first so `![alt](url)` doesn't leave behind `[alt]`.
const MD_IMG = /!\[[^\]\n]*\]\([^)\n]+\)/g;
const MD_BOLD = /\*\*([^*\n]+)\*\*/g;
const MD_ITAL = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
const MD_INLINE_CODE = /`([^`\n]+)`/g;
const MD_HIGHLIGHT = /==([^=\n]+)==/g;
const MD_STRIKE = /~~([^~\n]+)~~/g;
const MD_LINK = /\[([^\]\n]+)\]\([^)\n]+\)/g;
const MD_WIKILINK = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
const WHITESPACE_RUN = /\s+/g;

/** Strip Markdown decoration. SPEC.md §2.4.2 / buried.py:181-190. */
export function stripMarkdown(s: string): string {
  let out = s;
  out = out.replace(MD_IMG, "");
  out = out.replace(MD_BOLD, "$1");
  out = out.replace(MD_ITAL, "$1");
  out = out.replace(MD_INLINE_CODE, "$1");
  out = out.replace(MD_HIGHLIGHT, "$1");
  out = out.replace(MD_STRIKE, "$1");
  out = out.replace(MD_LINK, "$1");
  // Wikilink: alias (group 2) wins if present, otherwise target (group 1).
  out = out.replace(MD_WIKILINK, (_match, p1: string, p2?: string) => p2 ?? p1);
  out = out.replace(WHITESPACE_RUN, " ").trim();
  return out;
}

// ── Sentence segmentation (buried.py:175) ─────────────────────────────────
// Boundary: `.`, `!`, or `?` followed by whitespace and a capital letter,
// digit, opening quote, paren, or bracket.
const SENT_END = /(?<=[.!?])\s+(?=[A-Z0-9"'([])/g;

/** Split a passage into sentences. SPEC.md §2.4.3 / buried.py:193-195. */
export function splitSentences(passage: string): string[] {
  return passage
    .split(SENT_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A sentence is "complete" if it ends with one of these terminators. */
const COMPLETE_END = [".", "!", "?", "”", "’", '"', "'"];

function endsComplete(s: string): boolean {
  const trimmed = s.replace(/\s+$/, "");
  if (trimmed.length === 0) return false;
  const last = trimmed.charAt(trimmed.length - 1);
  return COMPLETE_END.includes(last);
}

// ── Conclusion-opener regex (buried.py:146-154) ───────────────────────────
const CONCLUSION_OPENERS =
  /^\s*(the\s+(\w+\s+){0,3}(is|isn't|are|aren't|means|comes\s+down\s+to)|ultimately|in\s+short|in\s+the\s+end|bottom\s+line|the\s+(takeaway|lesson|point|moat|real|truth|reality|verdict)|so\s+(the|what)|that\s+is\s+why|net[\s-]net)\b/i;

// ── Negation+assertion regex (buried.py:156-161) ──────────────────────────
const NEGATION_ASSERTION =
  /\b(isn't|aren't|wasn't|weren't|doesn't|don't|won't|can't|shouldn't|wouldn't|hasn't|haven't|not\s+(just|merely|only|simply|enough)|no\s+longer)\b/i;

/** Heuristic score: how likely is this sentence to carry the load-bearing
 *  claim? Sum of weighted signals per SPEC.md §2.4.5 / buried.py:198-245. */
export function scoreLoadBearing(
  sentence: string,
  position: number,
  total: number,
  preferLast: boolean,
): number {
  let score = 0;

  // Positional weight
  if (preferLast) {
    if (position === total - 1) {
      score += 1.0;
    } else if (total >= 3 && position === total - 2) {
      score += 0.4;
    }
  } else {
    if (position === 0) {
      score += 0.6;
    } else if (total >= 3 && position === 1) {
      score += 0.2;
    }
  }

  // Em-dash claim shape
  if (sentence.includes("—") || sentence.includes(" – ")) {
    score += 0.6;
  }

  // Negation+assertion
  if (NEGATION_ASSERTION.test(sentence)) {
    score += 0.5;
  }

  // Conclusion opener
  if (CONCLUSION_OPENERS.test(sentence)) {
    score += 0.7;
  }

  // Length sweet spot
  const L = sentence.length;
  if (L >= 60 && L <= 150) {
    score += 0.2;
  } else if (L > 220) {
    score -= 0.3;
  } else if (L < 40) {
    score -= 0.5;
  }

  return score;
}

interface ScoredSentence {
  score: number;
  sentence: string;
}

/** Return scored complete sentences from a stripped passage.
 *  buried.py:248-266. */
function scorePassageSentences(passage: string, preferLast: boolean): ScoredSentence[] {
  const stripped = stripMarkdown(passage);
  const sents = splitSentences(stripped);
  const out: ScoredSentence[] = [];
  for (let i = 0; i < sents.length; i++) {
    const sent = sents[i]!.trim();
    if (sent.length < MIN_QUOTE_CHARS || sent.length > MAX_QUOTE_CHARS) continue;
    if (!endsComplete(sent)) continue;
    out.push({ score: scoreLoadBearing(sent, i, sents.length, preferLast), sentence: sent });
  }
  return out;
}

/** Walk lines, return (passage, isCallout) tuples for each contiguous
 *  blockquote group. buried.py:298-333. */
function aggregateBlockquotePassages(
  lines: string[],
): Array<{ passage: string; isCallout: boolean }> {
  const out: Array<{ passage: string; isCallout: boolean }> = [];
  let cur: string[] = [];
  let isCallout = false;

  const flush = () => {
    if (cur.length > 0) {
      out.push({ passage: cur.join(" "), isCallout });
      cur = [];
    }
  };

  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith("> [!")) {
      flush();
      isCallout = true;
      // The callout marker line itself isn't quoted prose; intentionally don't
      // append `s` to `cur`. Subsequent `> ...` lines populate the passage.
    } else if (s.startsWith("> ")) {
      const inner = s.slice(2).trim();
      // Inside a callout, bullets/headers/pipes/blockquotes/empties terminate
      // — they aren't claim prose.
      if (
        inner.startsWith("-") ||
        inner.startsWith("*") ||
        inner.startsWith("#") ||
        inner.startsWith("|") ||
        inner.startsWith(">") ||
        inner.length === 0
      ) {
        flush();
        // Stay in the callout but reset buffer; matches Python `continue` after
        // flushing on bullet/header/empty inside a callout (buried.py:316-320).
        continue;
      }
      cur.push(inner);
    } else if (s === ">") {
      flush();
    } else {
      flush();
      isCallout = false;
    }
  }
  flush();
  return out;
}

/** Walk lines, return contiguous prose paragraphs. Skip code blocks,
 *  headings, lists, blockquotes, frontmatter remnants. buried.py:336-358. */
function aggregateProseParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let inCode = false;

  const flush = () => {
    if (cur.length > 0) {
      out.push(cur.join(" "));
      cur = [];
    }
  };

  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith("```")) {
      inCode = !inCode;
      flush();
      continue;
    }
    if (inCode) continue;
    if (
      s.length === 0 ||
      s.startsWith("#") ||
      s.startsWith("-") ||
      s.startsWith("*") ||
      s.startsWith("|") ||
      s.startsWith(">") ||
      s.startsWith("<!--") ||
      s.startsWith("---") ||
      s.startsWith("+++") ||
      s.startsWith("    ")
    ) {
      flush();
      continue;
    }
    cur.push(s);
  }
  flush();
  return out;
}

/** Multi-sentence aggregation fallback. Aggregate complete sentences until
 *  MIN ≤ total ≤ MAX AND running tail ends with a complete terminator.
 *  buried.py:269-295. */
function pickCompleteQuote(passage: string): string | null {
  const stripped = stripMarkdown(passage);
  if (stripped.length < MIN_QUOTE_CHARS) return null;
  const sents = splitSentences(stripped);
  if (sents.length === 0) return null;

  const out: string[] = [];
  for (const sent of sents) {
    // Don't blow past max — stop here even if no clean ending.
    const projected = out.length === 0 ? sent.length : out.join(" ").length + 1 + sent.length;
    if (out.length > 0 && projected > MAX_QUOTE_CHARS) break;
    out.push(sent);
    const total = out.join(" ").length;
    if (total >= MIN_QUOTE_CHARS && endsComplete(out[out.length - 1]!)) {
      return out.join(" ");
    }
  }
  const joined = out.join(" ").trim();
  return joined.length >= MIN_QUOTE_CHARS ? joined : null;
}

/** Extract the load-bearing claim from a Markdown body. Three-stage pick.
 *  SPEC.md §2.4.7 / buried.py:361-418. */
export function extractClaimQuote(body: string): { quote: string; provenance: QuoteProvenance } {
  const trimmedBody = body.trim();
  if (trimmedBody.length === 0) {
    return { quote: "", provenance: "empty" };
  }

  const lines = trimmedBody.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));

  // ── 1. Score-based pass across all candidate passages ──
  // (score, sentence, provenance) tuples.
  type Cand = { score: number; sentence: string; provenance: QuoteProvenance; insertOrder: number };
  const candidates: Cand[] = [];
  let order = 0;

  const bqPassages = aggregateBlockquotePassages(lines);
  for (const { passage, isCallout } of bqPassages) {
    const provenance: QuoteProvenance = isCallout ? "callout body" : "blockquote summary";
    const boost = isCallout ? 0.3 : 0.2;
    for (const { score, sentence } of scorePassageSentences(passage, isCallout)) {
      candidates.push({ score: score + boost, sentence, provenance, insertOrder: order++ });
    }
  }

  const proseParas = aggregateProseParagraphs(lines);
  for (const para of proseParas) {
    for (const { score, sentence } of scorePassageSentences(para, false)) {
      candidates.push({
        score,
        sentence,
        provenance: "first prose sentence",
        insertOrder: order++,
      });
    }
  }

  if (candidates.length > 0) {
    // Stable sort by descending score; preserves insertion order on ties — same
    // behavior as Python's list.sort with the same key.
    candidates.sort((a, b) => b.score - a.score || a.insertOrder - b.insertOrder);
    const winner = candidates[0]!;
    return { quote: winner.sentence, provenance: winner.provenance };
  }

  // ── 2. Multi-sentence aggregation fallback ──
  for (const { passage, isCallout } of bqPassages) {
    const q = pickCompleteQuote(passage);
    if (q) {
      return { quote: q, provenance: isCallout ? "callout body" : "blockquote summary" };
    }
  }
  for (const para of proseParas) {
    const q = pickCompleteQuote(para);
    if (q) {
      return { quote: q, provenance: "first prose sentence" };
    }
  }

  // ── 3. Final fallback: opening passage trimmed to a sentence boundary ──
  const flat = stripMarkdown(trimmedBody);
  if (flat.length >= MIN_QUOTE_CHARS) {
    const capped = flat.slice(0, MAX_QUOTE_CHARS);
    const lastEnd = Math.max(...COMPLETE_END.map((c) => capped.lastIndexOf(c)));
    if (lastEnd >= MIN_QUOTE_CHARS) {
      return { quote: capped.slice(0, lastEnd + 1).trim(), provenance: "opening passage" };
    }
    return { quote: capped.trim(), provenance: "opening passage" };
  }

  return { quote: "", provenance: "empty" };
}
