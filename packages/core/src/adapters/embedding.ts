// EmbeddingAdapter interface — runtime-agnostic. Implementations:
//   - embedding-mock.ts (in core, deterministic; TASK-1.4)
//   - embedding-ollama.ts (in core, Ollama HTTP; used by plugin/CLI/desktop; TASK-1.4)
//   - embedding-workers-ai.ts (in @basalt/api, Cloudflare Workers AI; Phase 3)

export interface EmbeddingAdapter {
  /** Embed a batch of texts, returning one L2-normalized Float32Array per input. */
  embed(texts: string[]): Promise<Float32Array[]>;
  /** Output vector dimension. */
  dimension(): number;
  /** Stable model identifier — persisted in the `embeddings.model` column. */
  modelId(): string;
  /** Optional readiness probe; throws if unreachable. */
  health?(): Promise<void>;
}
