// @basalt/core — runtime-agnostic engine.
// Public surface per PRD §3.2.

export type {
  AIAdapter,
  AIMessage,
  CompletionRequest,
  CompletionResponse,
  EmbeddingAdapter,
  FilesystemAdapter,
  ListFindingsOptions,
  NoteRecord,
  PersistedFinding,
  StorageAdapter,
  VaultEntry,
} from "./adapters";
export { MockEmbedder, type MockEmbeddingOptions } from "./adapters/embedding-mock";
export {
  EMBED_CONCURRENCY,
  EMBED_MAX_CHARS,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  OllamaEmbedder,
  type OllamaEmbedderOptions,
  OllamaEmbeddingError,
} from "./adapters/embedding-ollama";
export { MemoryFilesystem } from "./adapters/filesystem-memory";
export { MemoryStorage } from "./adapters/storage-memory";
export { type RenderFormat, renderBrief } from "./brief";
export type { BriefOptions, EngineDeps, IndexOptions, VerbContext, VerbFn } from "./engine";
export { Engine, registerVerb } from "./engine";
export { HUB_DENSITY_HARD, HUB_DENSITY_SOFT, hubDensity, hubPenalty } from "./graph";
export { MIGRATIONS } from "./migrations/index";
export type { NoteContent, PromoteOptions } from "./promote";
export { promoteFindingToNote } from "./promote";
export type {
  Brief,
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Embedding,
  EngineOptions,
  FalsificationRule,
  Finding,
  FindingsBucket,
  ImplicitThesisFinding,
  Link,
  Note,
  PairSide,
  ProjectShare,
  TrackRecordSummary,
  Verb,
} from "./types";
export { verbs } from "./verbs";
export type { QuoteProvenance, VerbResult } from "./verbs/types";
