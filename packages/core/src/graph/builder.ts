// packages/core/src/graph/builder.ts
// Link graph builder. Real implementation lands in TASK-1.3.

import type DirectedGraph from "graphology";

export type LinkGraph = InstanceType<typeof DirectedGraph>;

/** Build a link graph from a sequence of parsed notes. Stub for TASK-1.3. */
export function buildLinkGraph(): LinkGraph {
  throw new Error("buildLinkGraph: not yet implemented (lands in TASK-1.3)");
}
