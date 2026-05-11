// basalted-core — runtime-agnostic engine.
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
export {
  ANTHROPIC_AI_DEFAULT_BASE_URL,
  ANTHROPIC_AI_DEFAULT_MODEL,
  AnthropicAI,
  AnthropicAIError,
  type AnthropicOptions,
} from "./adapters/ai-anthropic";
export {
  OLLAMA_AI_DEFAULT_MODEL,
  OLLAMA_AI_DEFAULT_URL,
  OllamaAI,
  OllamaAIError,
  type OllamaAIOptions,
} from "./adapters/ai-ollama";
export {
  OPENAI_AI_DEFAULT_BASE_URL,
  OPENAI_AI_DEFAULT_MODEL,
  OpenAIAI,
  OpenAIAIError,
  type OpenAIOptions,
} from "./adapters/ai-openai";
export {
  WORKERS_AI_DEFAULT_MODEL,
  WorkersAI,
  type WorkersAIBinding,
  type WorkersAIOptions,
} from "./adapters/ai-workers";
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
export {
  auditDrift,
  type ContradictionV1Finding,
  type ContradictionV1Options,
  type ContradictionVerdict,
  compareDrift,
  type DriftV1Finding,
  type DriftVerdict,
  findContradictionsV1,
  findImplicitThesesV1,
  type ImplicitThesisV1Finding,
  type ThesisV1Options,
  verbs,
} from "./verbs";
export type { QuoteProvenance, VerbResult } from "./verbs/types";
