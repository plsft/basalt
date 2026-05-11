// Resolve a CliConfig + CLI flags into an AIAdapter instance (or null when
// the user opted out / hasn't configured one). Keeps every command's
// "do I have an LLM?" branch identical.

import type { AIAdapter } from "basalted-core";
import { AnthropicAI, OllamaAI, OpenAIAI } from "basalted-core";
import type { CliConfig } from "./config";

export interface LlmOverrides {
  /** "ollama" | "openai" | "anthropic" | "none". CLI --llm flag. */
  provider?: string;
  /** Model name override. */
  model?: string;
}

const ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
} as const;

export function resolveLlm(cfg: CliConfig, overrides: LlmOverrides = {}): AIAdapter | null {
  const provider = overrides.provider ?? cfg.llmProvider;
  if (!provider || provider === "none") return null;
  const model = overrides.model ?? cfg.llmModel;

  switch (provider) {
    case "ollama":
      return new OllamaAI({
        url: cfg.ollamaUrl,
        ...(model !== "" ? { model } : {}),
      });
    case "openai": {
      const apiKey = process.env[ENV_KEYS.openai];
      if (!apiKey) {
        throw new Error(
          `OpenAI provider selected but ${ENV_KEYS.openai} is not set. Export it or pass --llm none.`,
        );
      }
      return new OpenAIAI({
        apiKey,
        ...(model !== "" ? { model } : {}),
      });
    }
    case "anthropic": {
      const apiKey = process.env[ENV_KEYS.anthropic];
      if (!apiKey) {
        throw new Error(
          `Anthropic provider selected but ${ENV_KEYS.anthropic} is not set. Export it or pass --llm none.`,
        );
      }
      return new AnthropicAI({
        apiKey,
        ...(model !== "" ? { model } : {}),
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
