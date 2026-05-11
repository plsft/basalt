import { describe, expect, it } from "vitest";
import { WorkersAI, type WorkersAIBinding } from "./ai-workers";

function mkBinding(response: unknown): WorkersAIBinding & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async run(modelId, input) {
      calls.push({ modelId, input });
      return response as ReturnType<WorkersAIBinding["run"]> extends Promise<infer R> ? R : never;
    },
  };
}

describe("WorkersAI", () => {
  it("requires a binding", () => {
    expect(() => new WorkersAI({ binding: undefined as unknown as WorkersAIBinding })).toThrow();
  });

  it("handles { response } shape", async () => {
    const binding = mkBinding({ response: "hello" });
    const ai = new WorkersAI({ binding });
    const resp = await ai.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(resp.content).toBe("hello");
    expect(resp.modelId).toBe("workers-ai/@cf/meta/llama-3.1-8b-instruct");
  });

  it("handles { result: { response } } shape", async () => {
    const binding = mkBinding({ result: { response: "nested" } });
    const ai = new WorkersAI({ binding });
    const resp = await ai.complete({ messages: [{ role: "user", content: "x" }] });
    expect(resp.content).toBe("nested");
  });

  it("returns empty content for unknown shapes", async () => {
    const binding = mkBinding({ surprising: "field" });
    const ai = new WorkersAI({ binding });
    const resp = await ai.complete({ messages: [{ role: "user", content: "x" }] });
    expect(resp.content).toBe("");
  });

  it("passes max_tokens + temperature + stop to the binding", async () => {
    const binding = mkBinding({ response: "" });
    const ai = new WorkersAI({ binding });
    await ai.complete({
      messages: [{ role: "user", content: "x" }],
      maxTokens: 100,
      temperature: 0.2,
      stop: ["</done>"],
    });
    const call = binding.calls[0] as {
      input: { max_tokens: number; temperature: number; stop: string[] };
    };
    expect(call.input.max_tokens).toBe(100);
    expect(call.input.temperature).toBe(0.2);
    expect(call.input.stop).toEqual(["</done>"]);
  });

  it("uses configured model in modelId", () => {
    const binding = mkBinding({ response: "" });
    const ai = new WorkersAI({ binding, model: "@cf/qwen/qwen1.5-7b-chat-awq" });
    expect(ai.modelId()).toBe("workers-ai/@cf/qwen/qwen1.5-7b-chat-awq");
  });
});
