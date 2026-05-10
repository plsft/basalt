// AIAdapter interface — post-v1 LLM verbs (Implicit Thesis v1, Contradiction v1).
// Stubbed in Phase 0; first concrete implementations land alongside the LLM
// verbs after v1.0.0 ships.

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: AIMessage[];
  /** Override temperature; default depends on adapter. */
  temperature?: number;
  /** Hard cap on generated tokens. */
  maxTokens?: number;
  /** Optional stop sequences. */
  stop?: string[];
}

export interface CompletionResponse {
  content: string;
  /** Stable model identifier as used at call time. */
  modelId: string;
  /** Optional usage stats — populated when the upstream returns them. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIAdapter {
  complete(opts: CompletionRequest): Promise<CompletionResponse>;
  modelId(): string;
}
