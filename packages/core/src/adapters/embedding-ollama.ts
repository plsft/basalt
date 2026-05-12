// packages/core/src/adapters/embedding-ollama.ts
// Ollama HTTP embedding adapter. Mirrors reference/src/basalt/embed.py:
//   - POST /api/embeddings { model, prompt: text }
//   - Truncate inputs to EMBED_MAX_CHARS = 4000 (embed.py:15, :20-21, :37-38)
//   - L2-normalize the response vector (embed.py:29-31)
//   - Concurrency semaphore at EMBED_CONCURRENCY = 6 (embed.py:16, :60-93)

import type { EmbeddingAdapter } from "./embedding";

/** Defaults match Python reference (embed.py:13-16). */
export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_MODEL = "nomic-embed-text";
export const EMBED_MAX_CHARS = 4000;
export const EMBED_CONCURRENCY = 6;

/** Cached dimension once we've made our first request, so `dimension()` is
 *  cheap on subsequent calls. Until then, returns `unknown` (0). */
export interface OllamaEmbedderOptions {
  /** Ollama HTTP endpoint. Default `http://localhost:11434`. */
  url?: string;
  /** Embedding model identifier passed to Ollama. Default `nomic-embed-text`. */
  model?: string;
  /** Override default concurrency width. */
  concurrency?: number;
  /** Override default max input length (chars). */
  maxChars?: number;
  /** Per-request timeout in milliseconds. Default 60s, matching httpx in Python. */
  timeoutMs?: number;
  /** Allows tests + non-browser runtimes to inject a fetch implementation. */
  fetchImpl?: typeof fetch;
}

export class OllamaEmbeddingError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OllamaEmbeddingError";
    this.cause = cause;
  }
}

export class OllamaEmbedder implements EmbeddingAdapter {
  private readonly url: string;
  private readonly model: string;
  private readonly concurrency: number;
  private readonly maxChars: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private cachedDim = 0;

  constructor(opts?: OllamaEmbedderOptions) {
    this.url = (opts?.url ?? OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
    this.model = opts?.model ?? OLLAMA_DEFAULT_MODEL;
    this.concurrency = opts?.concurrency ?? EMBED_CONCURRENCY;
    this.maxChars = opts?.maxChars ?? EMBED_MAX_CHARS;
    this.timeoutMs = opts?.timeoutMs ?? 60_000;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new OllamaEmbeddingError(
        "no `fetch` implementation available; supply `opts.fetchImpl`",
      );
    }
  }

  modelId(): string {
    return this.model;
  }

  dimension(): number {
    return this.cachedDim;
  }

  async health(): Promise<void> {
    const res = await this.fetchImpl(`${this.url}/api/tags`, { method: "GET" });
    if (!res.ok) {
      throw new OllamaEmbeddingError(
        `Ollama health check failed at ${this.url}: ${res.status} ${res.statusText}`,
      );
    }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = new Array(texts.length);
    const tasks: Array<{ idx: number; text: string }> = texts.map((text, idx) => ({
      idx,
      text: text.length > this.maxChars ? text.slice(0, this.maxChars) : text,
    }));

    // Semaphore-bounded concurrent dispatch.
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const current = cursor++;
        const task = tasks[current];
        if (task === undefined) return;
        out[task.idx] = await this.embedOne(task.text);
      }
    };
    const width = Math.min(this.concurrency, tasks.length || 1);
    const workers = Array.from({ length: width }, () => worker());
    await Promise.all(workers);
    return out;
  }

  private async embedOne(text: string): Promise<Float32Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      // Ollama v0.2+ exposes /api/embed (returns `embeddings: [[...]]`).
      // The legacy /api/embeddings endpoint (returns `embedding: [...]`)
      // is still served by older Ollama daemons. Mirror Python's strategy:
      // POST to /api/embed with the new shape; on the JSON side accept
      // either response key for back-compat.
      res = await this.fetchImpl(`${this.url}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new OllamaEmbeddingError(
        `Ollama request failed at ${this.url}: ${(err as Error).message}`,
        err,
      );
    }
    clearTimeout(timer);
    if (!res.ok) {
      const body = await safeReadText(res);
      throw new OllamaEmbeddingError(`Ollama returned ${res.status} ${res.statusText}: ${body}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new OllamaEmbeddingError("Ollama response was not valid JSON", err);
    }
    if (typeof json !== "object" || json === null) {
      throw new OllamaEmbeddingError(
        `Ollama response not an object: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    const payload = json as { embedding?: unknown; embeddings?: unknown };
    let raw: number[] | null = null;
    if (Array.isArray(payload.embeddings) && Array.isArray(payload.embeddings[0])) {
      raw = payload.embeddings[0] as number[];
    } else if (Array.isArray(payload.embedding)) {
      raw = payload.embedding as number[];
    }
    if (raw === null) {
      throw new OllamaEmbeddingError(
        `Ollama response missing 'embeddings'/'embedding' array: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    const vec = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) vec[i] = raw[i] ?? 0;
    if (this.cachedDim === 0) this.cachedDim = vec.length;
    return l2NormalizeInPlace(vec);
  }
}

function l2NormalizeInPlace(v: Float32Array): Float32Array {
  let normSq = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] ?? 0;
    normSq += x * x;
  }
  if (normSq <= 0) return v;
  const inv = 1 / Math.sqrt(normSq);
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) * inv;
  return v;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<unreadable body>";
  }
}
