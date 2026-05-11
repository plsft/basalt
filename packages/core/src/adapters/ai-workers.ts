// Cloudflare Workers AI adapter. Uses the platform-bound `Ai` runtime API
// rather than HTTP — no auth, no apiKey, the binding is the credential.
//
// The Ai binding is shaped as `env.AI.run(modelId, { messages })` returning
// `{ response: string }`. We type it loosely (the official @cloudflare/workers-types
// `Ai` type covers it but we keep this adapter standalone so @basalt/core
// has zero Workers-types dep — the API package supplies the binding).

import type { AIAdapter, CompletionRequest, CompletionResponse } from "./ai";

export const WORKERS_AI_DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface WorkersAIBinding {
  run: (
    modelId: string,
    input: { messages: Array<{ role: string; content: string }> } & Record<string, unknown>,
  ) => Promise<{ response?: string } | { result?: { response?: string } }>;
}

export interface WorkersAIOptions {
  binding: WorkersAIBinding;
  model?: string;
}

export class WorkersAI implements AIAdapter {
  private readonly binding: WorkersAIBinding;
  private readonly model: string;

  constructor(opts: WorkersAIOptions) {
    if (!opts.binding) throw new Error("WorkersAI: binding required (env.AI)");
    this.binding = opts.binding;
    this.model = opts.model ?? WORKERS_AI_DEFAULT_MODEL;
  }

  modelId(): string {
    return `workers-ai/${this.model}`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const input: { messages: Array<{ role: string; content: string }> } & Record<string, unknown> =
      {
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      };
    if (req.temperature !== undefined) input.temperature = req.temperature;
    if (req.maxTokens !== undefined) input.max_tokens = req.maxTokens;
    if (req.stop !== undefined) input.stop = req.stop;

    const raw = await this.binding.run(this.model, input);
    // Workers AI sometimes returns { response } and sometimes { result: { response } }
    // depending on the model wrapper. Handle both.
    let content = "";
    if (raw && typeof raw === "object") {
      if ("response" in raw && typeof raw.response === "string") content = raw.response;
      else if (
        "result" in raw &&
        raw.result &&
        typeof raw.result === "object" &&
        "response" in raw.result &&
        typeof raw.result.response === "string"
      ) {
        content = raw.result.response;
      }
    }
    return {
      content,
      modelId: this.modelId(),
    };
  }
}
