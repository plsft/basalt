// Workers AI embedding helper. Used to build server-side vector indexes
// for cross-vault search — the local snapshot's embeddings may come from
// different models, so we re-embed at upload time into a consistent space.
//
// Default model: @cf/baai/bge-base-en-v1.5 — 768-dim, ~33ms per query,
// matches the Vectorize basalt-prod-vectors index dimensionality.

import type { WorkersAIBinding } from "@basalt/core";

export const WORKERS_EMBEDDING_DEFAULT_MODEL = "@cf/baai/bge-base-en-v1.5";
/** Conservative truncation — bge-base supports up to 512 tokens (~2000 chars). */
export const WORKERS_EMBEDDING_MAX_CHARS = 2000;
/** Workers AI batch limit per `run()` call. */
export const WORKERS_EMBEDDING_BATCH_SIZE = 100;

interface AIEmbeddingResponse {
  shape?: number[];
  data?: number[][];
}

export interface WorkersEmbeddingBinding extends WorkersAIBinding {
  // The bge-base model returns a shape-typed response; we keep the
  // WorkersAIBinding type the same to avoid duplicate plumbing.
}

export async function embedTextsWorkers(
  ai: WorkersEmbeddingBinding,
  texts: string[],
  model: string = WORKERS_EMBEDDING_DEFAULT_MODEL,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const truncated = texts.map((t) => t.slice(0, WORKERS_EMBEDDING_MAX_CHARS));

  const out: Float32Array[] = [];
  for (let i = 0; i < truncated.length; i += WORKERS_EMBEDDING_BATCH_SIZE) {
    const batch = truncated.slice(i, i + WORKERS_EMBEDDING_BATCH_SIZE);
    // biome-ignore lint/suspicious/noExplicitAny: Workers AI Ai.run signature isn't strict on input/output shape per-model.
    const raw = (await ai.run(model, { text: batch } as any)) as AIEmbeddingResponse;
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error(
        `workers-ai ${model} returned unexpected shape: ${JSON.stringify(raw).slice(0, 200)}`,
      );
    }
    for (const vec of raw.data) {
      out.push(new Float32Array(vec));
    }
  }
  return out;
}

export async function embedQueryWorkers(
  ai: WorkersEmbeddingBinding,
  query: string,
  model: string = WORKERS_EMBEDDING_DEFAULT_MODEL,
): Promise<Float32Array> {
  const [vec] = await embedTextsWorkers(ai, [query], model);
  if (!vec) throw new Error("workers-ai returned empty embedding for query");
  return vec;
}
