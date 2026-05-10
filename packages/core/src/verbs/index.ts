// Verb registry. Each verb's body lands in TASK-1.6 through TASK-1.10.
// Wiring into the Engine happens in TASK-1.11.

export { findBuriedInsights } from "./buried";
export { findConnections } from "./connection";
export { findContradictions } from "./contradiction";
export { findDrift } from "./drift";
export { findImplicitTheses } from "./thesis";
export type {
  BuriedInsightFinding,
  ConnectionFinding,
  ContradictionFinding,
  DriftFinding,
  Finding,
  ImplicitThesisFinding,
  PairSide,
  ProjectShare,
  QuoteProvenance,
  VerbResult,
} from "./types";

/** Fixed registry of verbs, in render order per SPEC.md §3. */
export const verbs = [
  "buried-insight",
  "connection",
  "contradiction",
  "implicit-thesis",
  "drift",
] as const;
