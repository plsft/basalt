import { describe, expect, it } from "vitest";
import { OpenAIAI, OpenAIAIError } from "./ai-openai";

describe("OpenAIAI", () => {
  it("requires apiKey", () => {
    expect(() => new OpenAIAI({ apiKey: "" })).toThrow();
  });

  it("POSTs to /chat/completions with Bearer auth", async () => {
    const captured: { headers: Headers; body: unknown }[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      captured.push({
        headers: new Headers((init?.headers ?? {}) as Record<string, string>),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({
          id: "ch_1",
          model: "gpt-4o-mini",
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const ai = new OpenAIAI({ apiKey: "sk-test", fetch: fakeFetch });
    const resp = await ai.complete({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 50,
    });
    expect(resp.content).toBe("ok");
    expect(resp.modelId).toBe("openai/gpt-4o-mini");
    expect(resp.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(captured[0]?.headers.get("Authorization")).toBe("Bearer sk-test");
    const body = captured[0]?.body as { max_tokens?: number };
    expect(body.max_tokens).toBe(50);
  });

  it("includes OpenAI-Organization when supplied", async () => {
    let header: string | null = null;
    const fakeFetch: typeof fetch = async (_u, init) => {
      header = new Headers((init?.headers ?? {}) as Record<string, string>).get(
        "OpenAI-Organization",
      );
      return new Response(
        JSON.stringify({
          id: "1",
          model: "m",
          choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }],
        }),
        { status: 200 },
      );
    };
    const ai = new OpenAIAI({ apiKey: "x", organization: "org_123", fetch: fakeFetch });
    await ai.complete({ messages: [{ role: "user", content: "x" }] });
    expect(header).toBe("org_123");
  });

  it("throws OpenAIAIError on non-2xx", async () => {
    const fakeFetch: typeof fetch = async () => new Response("rate limit", { status: 429 });
    const ai = new OpenAIAI({ apiKey: "x", fetch: fakeFetch });
    await expect(
      ai.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(OpenAIAIError);
  });

  it("baseUrl override targets compatible endpoints", () => {
    const ai = new OpenAIAI({
      apiKey: "x",
      baseUrl: "https://api.groq.com/openai/v1/",
      model: "llama3-70b",
    });
    expect(ai.modelId()).toBe("openai/llama3-70b");
  });
});
