// Local Ollama LLM adapter. Maps AIMessage[] to Ollama's /api/chat shape.
// Default model: llama3.2:3b — small enough to run on consumer hardware,
// good enough at synthesis to write a one-sentence thesis from quotes.

import type { AIAdapter, CompletionRequest, CompletionResponse } from "./ai";

export const OLLAMA_AI_DEFAULT_URL = "http://localhost:11434";
export const OLLAMA_AI_DEFAULT_MODEL = "llama3.2:3b";

export interface OllamaAIOptions {
  url?: string;
  model?: string;
  /** Inject a fetch (tests). */
  fetch?: typeof fetch;
}

export class OllamaAIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaAIError";
  }
}

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAI implements AIAdapter {
  private readonly url: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OllamaAIOptions = {}) {
    this.url = (opts.url ?? OLLAMA_AI_DEFAULT_URL).replace(/\/$/, "");
    this.model = opts.model ?? OLLAMA_AI_DEFAULT_MODEL;
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis);
  }

  modelId(): string {
    return `ollama/${this.model}`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
      stream: false,
    };
    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
    if (req.stop !== undefined) options.stop = req.stop;
    if (Object.keys(options).length > 0) body.options = options;

    const res = await this.fetchFn(`${this.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new OllamaAIError(`ollama chat failed: HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as OllamaChatResponse;
    const content = data.message?.content ?? "";
    return {
      content,
      modelId: this.modelId(),
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}
