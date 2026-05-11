// OpenAI Chat Completions adapter. Works with OpenAI itself and any
// OpenAI-compatible endpoint (Groq, Together, etc.) by passing `baseUrl`.

import type { AIAdapter, CompletionRequest, CompletionResponse } from "./ai";

export const OPENAI_AI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_AI_DEFAULT_MODEL = "gpt-4o-mini";

export interface OpenAIOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** OpenAI organization header, optional. */
  organization?: string;
  fetch?: typeof fetch;
}

export class OpenAIAIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenAIAIError";
  }
}

interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAIAI implements AIAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly organization: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OpenAIOptions) {
    if (!opts.apiKey) throw new Error("OpenAIAI: apiKey required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? OPENAI_AI_DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = opts.model ?? OPENAI_AI_DEFAULT_MODEL;
    this.organization = opts.organization;
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis);
  }

  modelId(): string {
    return `openai/${this.model}`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.stop !== undefined) body.stop = req.stop;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.organization) headers["OpenAI-Organization"] = this.organization;

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new OpenAIAIError(
        `openai chat failed: HTTP ${res.status} ${await res.text()}`,
        res.status,
      );
    }
    const data = (await res.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message.content ?? "";
    return {
      content,
      modelId: this.modelId(),
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}
