// packages/core/src/math/thresholds.ts
// Vault-age-aware threshold derivation for Buried Insight (SPEC.md §9.2).
// Real implementation lands in TASK-1.6.

export interface VaultAwareThresholds {
  min_age_days: number;
  min_dormant_days: number;
  recent_window_days: number;
  vault_age_days: number;
}

/** Age in days of the oldest dated note in the vault. Stub for TASK-1.6. */
export function computeVaultAgeDays(): number {
  throw new Error("computeVaultAgeDays: not yet implemented (lands in TASK-1.6)");
}

/** Derive (min_age, min_dormant, recent_window) from vault age. SPEC.md §9.2. */
export function computeVaultAwareThresholds(): VaultAwareThresholds {
  throw new Error("computeVaultAwareThresholds: not yet implemented (lands in TASK-1.6)");
}
