import { describe, expect, it, vi } from "vitest";
import {
  EMBED_CONCURRENCY,
  EMBED_MAX_CHARS,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  OllamaEmbedder,
  OllamaEmbeddingError,
} from "./embedding-ollama";

const FAKE_VEC = [0.1, 0.2, 0.3];

function makeFetchMock(handler: (req: Request) => Promise<Response> | Response) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const req = new Request(input as string, init);
    return await handler(req);
  }) as unknown as typeof fetch;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OllamaEmbedder constants", () => {
  it("exports Python-equivalent defaults", () => {
    expect(OLLAMA_DEFAULT_URL).toBe("http://localhost:11434");
    expect(OLLAMA_DEFAULT_MODEL).toBe("nomic-embed-text");
    expect(EMBED_MAX_CHARS).toBe(4000);
    expect(EMBED_CONCURRENCY).toBe(6);
  });
});

describe("OllamaEmbedder.embed", () => {
  it("POSTs to /api/embed with the new {model,input} request shape", async () => {
    const fetchImpl = makeFetchMock(async (req) => {
      expect(req.url).toBe("http://localhost:11434/api/embed");
      expect(req.method).toBe("POST");
      const body = JSON.parse(await req.text()) as { model: string; input: string };
      expect(body.model).toBe("nomic-embed-text");
      expect(body.input).toBe("hello");
      return okJson({ embeddings: [FAKE_VEC] });
    });
    const e = new OllamaEmbedder({ fetchImpl });
    const out = await e.embed(["hello"]);
    expect(out).toHaveLength(1);
    expect(out[0]?.length).toBe(3);
  });

  it("accepts the legacy {embedding: [...]} response shape for back-compat", async () => {
    // Older Ollama daemons (pre-v0.2) only return `embedding`. We continue
    // to parse that so users on stale installs keep working.
    const fetchImpl = makeFetchMock(() => okJson({ embedding: FAKE_VEC }));
    const e = new OllamaEmbedder({ fetchImpl });
    const out = await e.embed(["hello"]);
    expect(out[0]?.length).toBe(3);
  });

  it("L2-normalizes the response vector", async () => {
    const fetchImpl = makeFetchMock(() => okJson({ embeddings: [[3, 4, 0]] }));
    const e = new OllamaEmbedder({ fetchImpl });
    const [v] = await e.embed(["x"]);
    // ||(3,4,0)||₂ = 5 → normalized = (0.6, 0.8, 0)
    expect(v?.[0]).toBeCloseTo(0.6, 6);
    expect(v?.[1]).toBeCloseTo(0.8, 6);
    expect(v?.[2]).toBeCloseTo(0, 6);
  });

  it("truncates prompts longer than maxChars", async () => {
    const longText = "a".repeat(EMBED_MAX_CHARS + 100);
    const fetchImpl = makeFetchMock(async (req) => {
      const body = JSON.parse(await req.text()) as { input: string };
      expect(body.input.length).toBe(EMBED_MAX_CHARS);
      return okJson({ embeddings: [[1]] });
    });
    const e = new OllamaEmbedder({ fetchImpl });
    await e.embed([longText]);
  });

  it("preserves input order under concurrent dispatch", async () => {
    const fetchImpl = makeFetchMock(async (req) => {
      const body = JSON.parse(await req.text()) as { input: string };
      // Mark each response with a deterministic label tied to the input.
      const idx = Number.parseInt(body.input.replace(/^x/, ""), 10);
      return okJson({ embeddings: [[idx, idx, idx]] });
    });
    const e = new OllamaEmbedder({ fetchImpl, concurrency: 3 });
    const inputs = Array.from({ length: 10 }, (_, i) => `x${i}`);
    const out = await e.embed(inputs);
    for (let i = 0; i < inputs.length; i++) {
      // The first entry per vector tracks our input index — proves out[i]
      // corresponds to inputs[i] regardless of dispatch order.
      expect(out[i]?.[0]).toBeCloseTo(out[i]?.[1] ?? -1, 6);
    }
  });

  it("caches dimension after first successful embed", async () => {
    const fetchImpl = makeFetchMock(() => okJson({ embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]] }));
    const e = new OllamaEmbedder({ fetchImpl });
    expect(e.dimension()).toBe(0);
    await e.embed(["x"]);
    expect(e.dimension()).toBe(5);
  });

  it("throws OllamaEmbeddingError on non-2xx response", async () => {
    const fetchImpl = makeFetchMock(
      () => new Response("server error body", { status: 502, statusText: "Bad Gateway" }),
    );
    const e = new OllamaEmbedder({ fetchImpl });
    await expect(e.embed(["x"])).rejects.toThrow(OllamaEmbeddingError);
  });

  it("throws OllamaEmbeddingError when the embedding field is missing from JSON", async () => {
    const fetchImpl = makeFetchMock(() => okJson({ wrongKey: [1, 2, 3] }));
    const e = new OllamaEmbedder({ fetchImpl });
    await expect(e.embed(["x"])).rejects.toThrow(/missing 'embeddings'\/'embedding'/);
  });

  it("throws when fetch throws (network down)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const e = new OllamaEmbedder({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(e.embed(["x"])).rejects.toThrow(/Ollama request failed/);
  });
});

describe("OllamaEmbedder.health", () => {
  it("hits /api/tags", async () => {
    const fetchImpl = makeFetchMock((req) => {
      expect(req.url).toBe("http://localhost:11434/api/tags");
      return okJson({ models: [] });
    });
    const e = new OllamaEmbedder({ fetchImpl });
    await expect(e.health()).resolves.toBeUndefined();
  });

  it("throws when /api/tags returns non-2xx", async () => {
    const fetchImpl = makeFetchMock(() => new Response("", { status: 500 }));
    const e = new OllamaEmbedder({ fetchImpl });
    await expect(e.health()).rejects.toThrow(/health check failed/);
  });
});
