// Verb registry. Each verb's body lands in TASK-1.6 through TASK-1.10.
// Side-effect: importing this module registers every implemented verb in
// the engine's registry. Importing `@basalt/core` (which re-exports from
// here) is therefore enough to wire the engine end-to-end.

import { registerVerb } from "../engine";
import { findBuriedInsights } from "./buried";
import { findConnections } from "./connection";
import { findContradictions } from "./contradiction";
import { findDrift } from "./drift";
import { findImplicitTheses } from "./thesis";

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

// Side-effect registrations. Each verb whose body is implemented today
// registers itself. Stub verbs that throw "not yet implemented" are
// intentionally NOT registered — Engine.brief emits an empty bucket for
// any unregistered verb (see engine.ts), keeping briefs well-formed
// while the remaining verbs port in TASK-1.8 through TASK-1.10.
registerVerb("buried-insight", findBuriedInsights);
registerVerb("connection", findConnections);
registerVerb("drift", findDrift);
registerVerb("contradiction", findContradictions);
// TASK-1.10: registerVerb("implicit-thesis", findImplicitTheses);

void findImplicitTheses;
