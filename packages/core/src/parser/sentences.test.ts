import { describe, expect, it } from "vitest";
import { extractClaimQuote, scoreLoadBearing, splitSentences, stripMarkdown } from "./sentences";

describe("stripMarkdown", () => {
  it("strips images entirely", () => {
    expect(stripMarkdown("Look ![alt text](image.png) at this.")).toBe("Look at this.");
  });

  it("unwraps bold, italic, inline code, highlight, strike", () => {
    expect(stripMarkdown("**bold** *ital* `code` ==hi== ~~old~~")).toBe("bold ital code hi old");
  });

  it("unwraps Markdown links to display text", () => {
    expect(stripMarkdown("see [the docs](https://example.com)")).toBe("see the docs");
  });

  it("wikilink alias wins when present, otherwise target", () => {
    expect(stripMarkdown("ref [[Note A|the alias]]")).toBe("ref the alias");
    expect(stripMarkdown("ref [[Note A]]")).toBe("ref Note A");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(stripMarkdown("  one   two\n\nthree   ")).toBe("one two three");
  });

  it("does not strip italic across newlines (the regex bans \\n inside)", () => {
    expect(stripMarkdown("*do not\nspan*")).toBe("*do not span*");
  });
});

describe("splitSentences", () => {
  it("splits on . ! ? followed by whitespace + capital", () => {
    expect(splitSentences("Foo. Bar! Baz?")).toEqual(["Foo.", "Bar!", "Baz?"]);
  });

  it("does not split when next char isn't a capital/digit/quote/paren/bracket", () => {
    expect(splitSentences("e.g. foo bar baz.")).toEqual(["e.g. foo bar baz."]);
  });

  it("splits when next char is a digit, quote, paren, or bracket", () => {
    expect(splitSentences("End. 2 starts.").length).toBe(2);
    expect(splitSentences('End. "Quote starts.').length).toBe(2);
    expect(splitSentences("End. (Paren starts.").length).toBe(2);
    expect(splitSentences("End. [Bracket starts.").length).toBe(2);
  });

  it("drops empty/whitespace-only fragments", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("scoreLoadBearing", () => {
  it("rewards prose-first position when not preferring last", () => {
    const a = scoreLoadBearing("A medium length sentence indeed for testing.", 0, 5, false);
    const b = scoreLoadBearing("A medium length sentence indeed for testing.", 4, 5, false);
    expect(a).toBeGreaterThan(b);
  });

  it("rewards callout-last position when preferring last", () => {
    const last = scoreLoadBearing("A medium length sentence indeed for testing.", 4, 5, true);
    const first = scoreLoadBearing("A medium length sentence indeed for testing.", 0, 5, true);
    expect(last).toBeGreaterThan(first);
  });

  it("rewards em-dash claim shape (+0.6)", () => {
    const with_em = scoreLoadBearing(
      "The moat — and this is the point — isn't speed alone today.",
      0,
      1,
      false,
    );
    const without_em = scoreLoadBearing(
      "The moat is the user's willingness to keep coming back daily.",
      0,
      1,
      false,
    );
    expect(with_em - without_em).toBeGreaterThan(0.55);
  });

  it("rewards conclusion openers (+0.7)", () => {
    const concl = scoreLoadBearing(
      "Ultimately the system survives a dozen would-be replacements over time.",
      2,
      5,
      false,
    );
    const plain = scoreLoadBearing(
      "Some unrelated sentence about an unimportant detail in the room.",
      2,
      5,
      false,
    );
    expect(concl - plain).toBeGreaterThan(0.65);
  });

  it("rewards negation+assertion (+0.5)", () => {
    const neg = scoreLoadBearing(
      "It isn't speed alone — it's the willingness to keep coming back here.",
      2,
      5,
      false,
    );
    const plain = scoreLoadBearing(
      "It is the speed alone that drives the willingness to keep coming back.",
      2,
      5,
      false,
    );
    expect(neg - plain).toBeGreaterThan(0.45);
  });

  it("penalizes very short and very long sentences", () => {
    const short = scoreLoadBearing("Too short.", 0, 1, false);
    const sweet = scoreLoadBearing(
      "A nicely sized sentence that lands inside the sweet spot of sixty to one fifty for sure.",
      0,
      1,
      false,
    );
    const long = scoreLoadBearing("a".repeat(250) + ".", 0, 1, false);
    expect(sweet).toBeGreaterThan(short);
    expect(sweet).toBeGreaterThan(long);
  });
});

describe("extractClaimQuote", () => {
  it("returns empty / 'empty' on empty body", () => {
    expect(extractClaimQuote("")).toEqual({ quote: "", provenance: "empty" });
    expect(extractClaimQuote("   \n\n  ")).toEqual({ quote: "", provenance: "empty" });
  });

  it("picks a callout body sentence with the highest score", () => {
    const body = [
      "Some prose paragraph here that is quite long enough to count as a sentence definitely.",
      "",
      "> [!note] Worth pinning",
      "> The moat isn't speed alone — it's the user's willingness to keep coming back here.",
      "",
      "More prose down here that is also long enough to be sentence-shaped today friend.",
    ].join("\n");
    const r = extractClaimQuote(body);
    expect(r.provenance).toBe("callout body");
    expect(r.quote).toContain("moat");
  });

  it("falls back to first prose sentence when no callouts", () => {
    const body =
      "The takeaway is that compounding only happens to people who don't optimize for the next quarter.\nSecond sentence here is filler.";
    const r = extractClaimQuote(body);
    expect(r.provenance).toBe("first prose sentence");
    expect(r.quote).toContain("compounding");
  });

  it("multi-sentence aggregation when no single sentence clears MIN length", () => {
    // Each sentence ~ 15 chars; aggregation needed to clear MIN_QUOTE_CHARS = 40.
    const body = "Yes. Indeed. Quite so. Right then. Good show now.";
    const r = extractClaimQuote(body);
    expect(r.provenance).toBe("first prose sentence");
    expect(r.quote.length).toBeGreaterThanOrEqual(40);
  });

  it("falls back to opening passage when no callouts and no prose paragraphs qualify", () => {
    // Every line is a list item — prose aggregator skips them all, no
    // blockquotes either. Stage 1 + 2 produce no candidates → stage 3 fires.
    const body = [
      "- item one with a few words",
      "- item two with several more",
      "- item three carries on with even more text",
      "- item four and five and six and seven for length",
    ].join("\n");
    const r = extractClaimQuote(body);
    expect(r.provenance).toBe("opening passage");
    expect(r.quote.length).toBeLessThanOrEqual(320);
  });
});
