import { describe, expect, it } from "vitest";
import { AnthropicAI, AnthropicAIError } from "./ai-anthropic";

describe("AnthropicAI", () => {
  it("requires apiKey", () => {
    expect(() => new AnthropicAI({ apiKey: "" })).toThrow();
  });

  it("splits system messages out of messages[] into a top-level system field", async () => {
    type AnthropicBody = { system?: string; messages: Array<{ role: string; content: string }> };
    const bodies: AnthropicBody[] = [];
    const fakeFetch: typeof fetch = async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)) as AnthropicBody);
      return new Response(
        JSON.stringify({
          id: "msg_1",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "verdict" }],
          usage: { input_tokens: 7, output_tokens: 2 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const ai = new AnthropicAI({ apiKey: "sk-ant", fetch: fakeFetch });
    await ai.complete({
      messages: [
        { role: "system", content: "you are basalt's verdict engine" },
        { role: "user", content: "two quotes" },
      ],
      maxTokens: 80,
      temperature: 0.2,
    });
    const body = bodies[0];
    expect(body?.system).toBe("you are basalt's verdict engine");
    expect(body?.messages).toHaveLength(1);
    expect(body?.messages[0]?.role).toBe("user");
  });

  it("concatenates multiple system messages with a blank line", async () => {
    const captured: { system?: string }[] = [];
    const fakeFetch: typeof fetch = async (_u, init) => {
      captured.push(JSON.parse(String(init?.body)) as { system?: string });
      return new Response(
        JSON.stringify({
          id: "1",
          model: "m",
          content: [{ type: "text", text: "" }],
          stop_reason: "end_turn",
        }),
        { status: 200 },
      );
    };
    const ai = new AnthropicAI({ apiKey: "x", fetch: fakeFetch });
    await ai.complete({
      messages: [
        { role: "system", content: "part 1" },
        { role: "system", content: "part 2" },
        { role: "user", content: "x" },
      ],
    });
    expect(captured[0]?.system).toBe("part 1\n\npart 2");
  });

  it("concatenates all text blocks in the response.content array", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: "1",
          model: "m",
          content: [
            { type: "text", text: "first" },
            { type: "text", text: " second" },
          ],
          stop_reason: "end_turn",
        }),
        { status: 200 },
      );
    const ai = new AnthropicAI({ apiKey: "x", fetch: fakeFetch });
    const resp = await ai.complete({ messages: [{ role: "user", content: "x" }] });
    expect(resp.content).toBe("first second");
  });

  it("throws AnthropicAIError on non-2xx", async () => {
    const fakeFetch: typeof fetch = async () => new Response("over quota", { status: 429 });
    const ai = new AnthropicAI({ apiKey: "x", fetch: fakeFetch });
    await expect(
      ai.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(AnthropicAIError);
  });

  it("sends anthropic-version header", async () => {
    let version: string | null = null;
    const fakeFetch: typeof fetch = async (_u, init) => {
      version = new Headers((init?.headers ?? {}) as Record<string, string>).get(
        "anthropic-version",
      );
      return new Response(
        JSON.stringify({
          id: "1",
          model: "m",
          content: [{ type: "text", text: "" }],
          stop_reason: "end_turn",
        }),
        { status: 200 },
      );
    };
    const ai = new AnthropicAI({ apiKey: "x", fetch: fakeFetch });
    await ai.complete({ messages: [{ role: "user", content: "x" }] });
    expect(version).toBe("2023-06-01");
  });
});
