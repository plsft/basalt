// Anthropic Messages API adapter. The Messages API splits the "system"
// role out of the messages array and into a top-level `system` field, so
// we translate AIMessage[] accordingly.

import type { AIAdapter, AIMessage, CompletionRequest, CompletionResponse } from "./ai";

export const ANTHROPIC_AI_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_AI_DEFAULT_MODEL = "claude-sonnet-4-6";
export const ANTHROPIC_API_VERSION = "2023-06-01";

export interface AnthropicOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  apiVersion?: string;
}

export class AnthropicAIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AnthropicAIError";
  }
}

interface AnthropicMessagesResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export class AnthropicAI implements AIAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiVersion: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: AnthropicOptions) {
    if (!opts.apiKey) throw new Error("AnthropicAI: apiKey required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? ANTHROPIC_AI_DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = opts.model ?? ANTHROPIC_AI_DEFAULT_MODEL;
    this.apiVersion = opts.apiVersion ?? ANTHROPIC_API_VERSION;
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis);
  }

  modelId(): string {
    return `anthropic/${this.model}`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const { system, messages } = splitSystem(req.messages);
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: req.maxTokens ?? 1024,
    };
    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.stop !== undefined) body.stop_sequences = req.stop;

    const res = await this.fetchFn(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new AnthropicAIError(
        `anthropic messages failed: HTTP ${res.status} ${await res.text()}`,
        res.status,
      );
    }
    const data = (await res.json()) as AnthropicMessagesResponse;
    const content = data.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text ?? "")
      .join("");
    return {
      content,
      modelId: this.modelId(),
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.input_tokens,
              outputTokens: data.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}

function splitSystem(messages: AIMessage[]): {
  system: string | undefined;
  messages: AIMessage[];
} {
  const systems: string[] = [];
  const rest: AIMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") systems.push(m.content);
    else rest.push(m);
  }
  return {
    system: systems.length > 0 ? systems.join("\n\n") : undefined,
    messages: rest,
  };
}
