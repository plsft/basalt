// packages/core/src/math/vector.ts
// Hand-rolled vector helpers. PRD §3.4 chose to hand-roll for runtime portability.

/** Dot product. Stub for TASK-1.6+. */
export function dot(_a: Float32Array, _b: Float32Array): number {
  throw new Error("dot: not yet implemented (lands in TASK-1.6)");
}

/** L2 norm. Stub for TASK-1.6+. */
export function l2Norm(_v: Float32Array): number {
  throw new Error("l2Norm: not yet implemented (lands in TASK-1.6)");
}

/** Normalize in place; returns a new Float32Array if `inPlace` is false. */
export function l2Normalize(_v: Float32Array, _inPlace?: boolean): Float32Array {
  throw new Error("l2Normalize: not yet implemented (lands in TASK-1.6)");
}

/** Element-wise mean of an array of vectors. Stub for TASK-1.6+. */
export function mean(_vectors: Float32Array[]): Float32Array {
  throw new Error("mean: not yet implemented (lands in TASK-1.6)");
}
