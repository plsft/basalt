import { describe, expect, it } from "vitest";
import { OllamaAI, OllamaAIError } from "./ai-ollama";

describe("OllamaAI", () => {
  it("modelId reflects the configured model", () => {
    const ai = new OllamaAI({ model: "qwen2.5:7b" });
    expect(ai.modelId()).toBe("ollama/qwen2.5:7b");
  });

  it("POSTs to /api/chat with messages + options", async () => {
    const captured: { url: string; body: unknown }[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      captured.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          model: "llama3.2:3b",
          message: { role: "assistant", content: "thesis sentence" },
          done: true,
          prompt_eval_count: 30,
          eval_count: 8,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const ai = new OllamaAI({ url: "http://localhost:11434", fetch: fakeFetch });
    const resp = await ai.complete({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      temperature: 0.3,
      maxTokens: 100,
      stop: ["\n\n"],
    });
    expect(resp.content).toBe("thesis sentence");
    expect(resp.modelId).toBe("ollama/llama3.2:3b");
    expect(resp.usage).toEqual({ inputTokens: 30, outputTokens: 8 });
    expect(captured.length).toBe(1);
    expect(captured[0]?.url).toBe("http://localhost:11434/api/chat");
    const body = captured[0]?.body as { messages: unknown[]; options?: Record<string, unknown> };
    expect(body.messages).toHaveLength(2);
    expect(body.options?.temperature).toBe(0.3);
    expect(body.options?.num_predict).toBe(100);
    expect(body.options?.stop).toEqual(["\n\n"]);
  });

  it("throws OllamaAIError on non-2xx", async () => {
    const fakeFetch: typeof fetch = async () => new Response("server down", { status: 503 });
    const ai = new OllamaAI({ fetch: fakeFetch });
    await expect(
      ai.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(OllamaAIError);
  });

  it("strips trailing slash from URL", () => {
    const ai = new OllamaAI({ url: "http://localhost:11434/" });
    expect(ai.modelId()).toContain("ollama/");
  });
});
