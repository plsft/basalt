import { AnthropicAI, OllamaAI, OpenAIAI } from "basalted-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliConfig } from "./config";
import { resolveLlm } from "./llm";

function cfg(overrides: Partial<CliConfig> = {}): CliConfig {
  return {
    vault: "/v",
    embeddingModel: "nomic-embed-text",
    ollamaUrl: "http://localhost:11434",
    promoteFolder: "Basalt",
    dbPath: "/db",
    llmProvider: "none",
    llmModel: "",
    apiUrl: "https://api.basalt.dev",
    apiToken: "",
    apiVaultId: "",
    ...overrides,
  };
}

describe("resolveLlm", () => {
  let oai: string | undefined;
  let aai: string | undefined;
  beforeEach(() => {
    oai = process.env.OPENAI_API_KEY;
    aai = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (oai !== undefined) process.env.OPENAI_API_KEY = oai;
    if (aai !== undefined) process.env.ANTHROPIC_API_KEY = aai;
  });

  it("returns null when provider is 'none'", () => {
    expect(resolveLlm(cfg({ llmProvider: "none" }))).toBeNull();
  });

  it("returns OllamaAI when provider is ollama", () => {
    const ai = resolveLlm(cfg({ llmProvider: "ollama" }));
    expect(ai).toBeInstanceOf(OllamaAI);
    expect(ai?.modelId()).toMatch(/^ollama\//);
  });

  it("uses model override on Ollama", () => {
    const ai = resolveLlm(cfg({ llmProvider: "ollama", llmModel: "qwen2.5:7b" }));
    expect(ai?.modelId()).toBe("ollama/qwen2.5:7b");
  });

  it("throws on openai without OPENAI_API_KEY", () => {
    expect(() => resolveLlm(cfg({ llmProvider: "openai" }))).toThrow(/OPENAI_API_KEY/);
  });

  it("returns OpenAIAI when key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const ai = resolveLlm(cfg({ llmProvider: "openai" }));
    expect(ai).toBeInstanceOf(OpenAIAI);
  });

  it("throws on anthropic without ANTHROPIC_API_KEY", () => {
    expect(() => resolveLlm(cfg({ llmProvider: "anthropic" }))).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("returns AnthropicAI when key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const ai = resolveLlm(cfg({ llmProvider: "anthropic" }));
    expect(ai).toBeInstanceOf(AnthropicAI);
  });

  it("overrides provider via flag", () => {
    expect(resolveLlm(cfg({ llmProvider: "ollama" }), { provider: "none" })).toBeNull();
  });

  it("rejects unknown providers", () => {
    expect(() => resolveLlm(cfg({ llmProvider: "ollama" }), { provider: "groq" })).toThrow(
      /Unknown LLM provider/,
    );
  });
});
