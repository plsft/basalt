// packages/core/src/engine.ts
// Engine orchestrator. Wires adapters + parser + graph + verbs + brief
// composer + audit calibration. Verbs are injected via a registry; the
// concrete verb functions land in TASK-1.6 through TASK-1.10 and are
// registered in src/verbs/index.ts. Until then the engine still composes
// briefs — verbs whose registry entry hasn't been filled in are silently
// skipped (their bucket appears with an empty array).

import type { EmbeddingAdapter, FilesystemAdapter, StorageAdapter } from "./adapters";
import type { AuditResult } from "./audit/calibration";
import {
  auditPending,
  recordFinding,
  toTrackRecordSummary,
  trackRecord,
} from "./audit/calibration";
import { bucketForVerb, composeBrief } from "./brief/compose";
import { type BuiltGraph, buildLinkGraph } from "./graph/builder";
import type { Brief, EngineOptions, FindingsBucket, Verb } from "./types";
import type { Finding } from "./verbs/types";

export interface EngineDeps {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  filesystem: FilesystemAdapter;
  options?: EngineOptions;
}

export interface IndexOptions {
  /** Vault root path. */
  vault: string;
  /** Re-embed everything regardless of cache. Default false. */
  force?: boolean;
}

export interface BriefOptions {
  /** Section to compute. Default "all". */
  section?: Verb | "all";
  /** Top-N findings per verb. Default 3. */
  top?: number;
}

/** Per-call context handed to a registered verb function. */
export interface VerbContext {
  storage: StorageAdapter;
  embedding: EmbeddingAdapter;
  graph: BuiltGraph;
  /** Effective top-N to return. */
  top: number;
  /** ISO YYYY-MM-DD; verbs that need a "today" reference (Drift, Buried) read this. */
  today: string;
}

/** Async function that produces findings for a single verb. */
export type VerbFn<F extends Finding = Finding> = (ctx: VerbContext) => Promise<F[]>;

/** Verb registry. The body is mutated by the verb modules at import time
 *  (see src/verbs/index.ts). Tests inject fakes via `Engine.registerVerb`. */
const VERB_REGISTRY = new Map<Verb, VerbFn>();

/** Public registry mutator. Verbs land here in TASK-1.6 onward. Tests use
 *  this to plug in mocks for assertion-driven brief composition. */
export function registerVerb<F extends Finding>(verb: Verb, fn: VerbFn<F>): void {
  VERB_REGISTRY.set(verb, fn as VerbFn);
}

/** Test/dev helper: clear the registry. Production code should never call. */
export function _clearVerbRegistryForTesting(): void {
  VERB_REGISTRY.clear();
}

const ALL_VERBS: Verb[] = [
  "buried-insight",
  "connection",
  "contradiction",
  "implicit-thesis",
  "drift",
];

export class Engine {
  private constructor(private readonly deps: EngineDeps) {}

  static async create(deps: EngineDeps): Promise<Engine> {
    validateDeps(deps);
    await deps.storage.init();
    return new Engine(deps);
  }

  async index(opts: IndexOptions): Promise<void> {
    const { storage, embedding, filesystem, options } = this.deps;
    const onProgress = options?.onProgress;
    const onError = options?.onError;
    onProgress?.({ stage: "index:start", message: opts.vault });

    // Build the in-memory graph; persist notes + links as we go.
    const graph = await buildLinkGraph(filesystem, opts.vault);
    onProgress?.({
      stage: "index:walk-complete",
      current: graph.notes.length,
      total: graph.notes.length,
    });

    let upserted = 0;
    for (const note of graph.notes) {
      try {
        const id = await storage.upsertNote(note);
        await storage.replaceLinks(
          id,
          graph.links.filter((l) => l.fromId === note.id).map((l) => l.target),
        );
        upserted++;
        if (upserted % 50 === 0) {
          onProgress?.({ stage: "index:upsert", current: upserted, total: graph.notes.length });
        }
      } catch (error) {
        onError?.({ stage: "index:upsert", error: error as Error, relPath: note.relPath });
      }
    }
    const resolved = await storage.resolveLinkTargets();
    onProgress?.({ stage: "index:resolve", message: `resolved ${resolved}` });

    if (opts.force === true) {
      // Embed every note from scratch.
      await this.embedAll(graph, embedding);
    } else {
      await this.embedStale(graph, embedding);
    }
    onProgress?.({ stage: "index:done" });
  }

  async brief(opts?: BriefOptions): Promise<Brief> {
    const { storage, embedding, filesystem, options } = this.deps;
    const today = options?.today ?? todayIso();
    const top = opts?.top ?? options?.topN ?? 3;
    const section = opts?.section ?? "all";

    // Re-build the in-memory graph from storage (verbs need it). For Phase 1
    // we re-walk via the FS adapter; later we may reconstruct from storage
    // directly to avoid a second walk.
    const vaultRoot = await this.findVaultRoot(filesystem);
    const graph = await buildLinkGraph(filesystem, vaultRoot);

    const ctx: VerbContext = { storage, embedding, graph, top, today };
    const verbsToRun: Verb[] = section === "all" ? ALL_VERBS : [section];
    const findings: Partial<Record<FindingsBucket, Finding[]>> = {};

    for (const verb of verbsToRun) {
      const bucket = bucketForVerb(verb);
      const fn = VERB_REGISTRY.get(verb);
      if (!fn) {
        // Verb not yet implemented — emit empty bucket.
        findings[bucket] = [];
        continue;
      }
      try {
        const results = await fn(ctx);
        findings[bucket] = results;
        for (const f of results) {
          await recordFinding(storage, verb, f, today);
        }
      } catch (error) {
        options?.onError?.({ stage: `verb:${verb}`, error: error as Error });
        findings[bucket] = [];
      }
    }

    const tr = await trackRecord(storage, 90, today);
    return composeBrief({
      section,
      findings,
      trackRecord: toTrackRecordSummary(tr),
    });
  }

  async audit(): Promise<AuditResult[]> {
    const { storage, options } = this.deps;
    const today = options?.today ?? todayIso();
    return await auditPending(storage, today);
  }

  async close(): Promise<void> {
    await this.deps.storage.close();
  }

  // ── private ────────────────────────────────────────────────────────────

  private async embedAll(graph: BuiltGraph, embedding: EmbeddingAdapter): Promise<void> {
    const texts = graph.notes.map((n) => `${n.title}\n\n${n.content}`.trim());
    const vecs = await embedding.embed(texts);
    for (let i = 0; i < graph.notes.length; i++) {
      const n = graph.notes[i]!;
      const v = vecs[i];
      if (v) {
        await this.deps.storage.upsertEmbedding(n.id, {
          model: embedding.modelId(),
          contentHash: n.contentHash,
          dim: v.length,
          vec: v,
        });
      }
    }
  }

  private async embedStale(graph: BuiltGraph, embedding: EmbeddingAdapter): Promise<void> {
    const model = embedding.modelId();
    const stale: Array<{ id: number; text: string; hash: string }> = [];
    for (const n of graph.notes) {
      const cached = await this.deps.storage.getEmbedding(n.id);
      const text = `${n.title}\n\n${n.content}`.trim();
      if (!cached || cached.contentHash !== n.contentHash || cached.model !== model) {
        stale.push({ id: n.id, text, hash: n.contentHash });
      }
    }
    if (stale.length === 0) return;
    const vecs = await embedding.embed(stale.map((s) => s.text));
    for (let i = 0; i < stale.length; i++) {
      const s = stale[i]!;
      const v = vecs[i];
      if (v) {
        await this.deps.storage.upsertEmbedding(s.id, {
          model,
          contentHash: s.hash,
          dim: v.length,
          vec: v,
        });
      }
    }
  }

  /** Locate the vault root for `brief()` calls that don't supply one. We
   *  inspect the storage's first note path for a hint; if none, throw. */
  private async findVaultRoot(_fs: FilesystemAdapter): Promise<string> {
    for await (const n of this.deps.storage.listNotes()) {
      // Strip the relPath suffix from the absolute path to recover the root.
      if (!n.relPath || !n.path) continue;
      const idx = n.path.replace(/\\/g, "/").lastIndexOf(n.relPath);
      if (idx > 0) return n.path.replace(/\\/g, "/").slice(0, idx - 1);
    }
    throw new Error(
      "Engine.brief: no notes in storage and no vault root supplied. Call engine.index({ vault }) first.",
    );
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateDeps(deps: EngineDeps): void {
  if (!deps.storage || typeof deps.storage.init !== "function") {
    throw new Error("Engine.create: missing or invalid `storage` adapter");
  }
  if (!deps.embedding || typeof deps.embedding.embed !== "function") {
    throw new Error("Engine.create: missing or invalid `embedding` adapter");
  }
  if (!deps.filesystem || typeof deps.filesystem.walk !== "function") {
    throw new Error("Engine.create: missing or invalid `filesystem` adapter");
  }
  const dim = deps.embedding.dimension?.() ?? 0;
  if (dim < 0) {
    throw new Error(`Engine.create: embedding adapter reported invalid dimension ${dim}`);
  }
}
