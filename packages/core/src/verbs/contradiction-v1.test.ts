// Unit tests for the LLM-augmented Contradiction v1 verdict parser + the
// graceful-degradation paths.

import { describe, expect, it } from "vitest";
import type { AIAdapter, CompletionRequest, CompletionResponse } from "../adapters/ai";
import type { VerbContext } from "../engine";
import { findContradictionsV1 } from "./contradiction-v1";

class StubAI implements AIAdapter {
  calls: CompletionRequest[] = [];
  constructor(
    private readonly response: string,
    private readonly throwOn?: number,
  ) {}
  modelId(): string {
    return "stub/test";
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(req);
    if (this.throwOn === this.calls.length) throw new Error("stub fail");
    return { content: this.response, modelId: this.modelId() };
  }
}

import { vi } from "vitest";
// Mock VerbContext that bypasses the real verb. We use module mocking to
// inject a synthetic base finding into findContradictions.
import * as base from "./contradiction";

function fakeCtx(): VerbContext {
  return {
    storage: {} as VerbContext["storage"],
    embedding: {} as VerbContext["embedding"],
    graph: {} as VerbContext["graph"],
    top: 3,
    today: "2026-05-09",
  };
}

const FAKE_BASE = [
  {
    verb: "contradiction" as const,
    schema: 1 as const,
    version: "v0-heuristic" as const,
    topical_similarity: 0.85,
    contradiction_score: 2.2,
    score: 1.87,
    signals: ["asymmetric negation"],
    note_a: {
      rel_path: "a.md",
      title: "A",
      quote: "tools must always be idempotent",
      quote_provenance: "first prose sentence" as const,
    },
    note_b: {
      rel_path: "b.md",
      title: "B",
      quote: "we now require side-effecting tools",
      quote_provenance: "first prose sentence" as const,
    },
  },
];

describe("findContradictionsV1 verdict parsing", () => {
  it("extracts a proven verdict from a clean JSON response", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI(`{"verdict":"proven","reason":"author changes their stance"}`);
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.verdict).toBe("proven");
    expect(out[0]?.verdict_reason).toBe("author changes their stance");
    expect(out[0]?.verdict_model).toBe("stub/test");
    vi.restoreAllMocks();
  });

  it("extracts an apparent verdict", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI(`Here's my analysis: {"verdict":"apparent","reason":"different scope"}`);
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.verdict).toBe("apparent");
    vi.restoreAllMocks();
  });

  it("falls back to undetermined when JSON is unparseable", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI("I don't really know what to think.");
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.verdict).toBe("undetermined");
    expect(out[0]?.verdict_reason).toBe("no_json_found");
    vi.restoreAllMocks();
  });

  it("falls back to undetermined when the LLM throws", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI("", 1);
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.verdict).toBe("undetermined");
    expect(out[0]?.verdict_reason).toBe("llm-failed");
    expect(out[0]?.verdict_model).toBeNull();
    vi.restoreAllMocks();
  });

  it("rejects verdict values outside the enum", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI(`{"verdict":"maybe","reason":"unsure"}`);
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.verdict).toBe("undetermined");
    vi.restoreAllMocks();
  });

  it("preserves the base v0 fields verbatim", async () => {
    vi.spyOn(base, "findContradictions").mockResolvedValue(FAKE_BASE);
    const ai = new StubAI(`{"verdict":"proven","reason":"yes"}`);
    const out = await findContradictionsV1(fakeCtx(), { ai });
    expect(out[0]?.topical_similarity).toBe(0.85);
    expect(out[0]?.contradiction_score).toBe(2.2);
    expect(out[0]?.signals).toEqual(["asymmetric negation"]);
    vi.restoreAllMocks();
  });
});
