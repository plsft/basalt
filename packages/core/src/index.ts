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
export { type RenderFormat, renderBrief } from "./brief";
export type { BriefOptions, EngineDeps, IndexOptions } from "./engine";
export { Engine } from "./engine";
export { HUB_DENSITY_HARD, HUB_DENSITY_SOFT } from "./graph";
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
