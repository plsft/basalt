// packages/core/src/math/thresholds.ts
// Vault-age-aware threshold derivation for Buried Insight (SPEC.md §9.2).
// Ports reference/src/basalt/buried.py:99-138 byte-for-byte.

// Vault-age-aware floor/ceiling constants (buried.py:35-40).
export const VAULT_AWARE_MIN_AGE_FLOOR = 60;
export const VAULT_AWARE_MIN_AGE_CEIL = 365;
export const VAULT_AWARE_DORMANT_FLOOR = 30;
export const VAULT_AWARE_DORMANT_CEIL = 180;
export const VAULT_AWARE_RECENT_FLOOR = 60;
export const VAULT_AWARE_RECENT_CEIL = 365;

// Buried Insight defaults when no vault-age data (buried.py:24-26).
export const DEFAULT_MIN_AGE_DAYS = 180;
export const DEFAULT_MIN_DORMANT_DAYS = 90;
export const DEFAULT_RECENT_WINDOW_DAYS = 180;

export interface VaultAwareThresholds {
  min_age_days: number;
  min_dormant_days: number;
  recent_window_days: number;
  vault_age_days: number;
}

/** Age in days of the oldest dated note in the vault. Returns 0 when no
 *  notes have a frontmatter `created` date. */
export function computeVaultAgeDays(createdDates: Iterable<string | null>, today: string): number {
  const t = parseIso(today);
  let maxAgeDays = 0;
  for (const dateStr of createdDates) {
    if (!dateStr) continue;
    const d = parseIso(dateStr);
    if (Number.isNaN(d.getTime())) continue;
    const ageDays = Math.floor((t.getTime() - d.getTime()) / 86_400_000);
    if (ageDays > maxAgeDays) maxAgeDays = ageDays;
  }
  return maxAgeDays;
}

/** Derive (min_age, min_dormant, recent_window) from vault age. SPEC.md §9.2 /
 *  buried.py:110-138.
 *
 *  If `vaultAgeDays <= 0`, returns the static defaults. */
export function computeVaultAwareThresholds(vaultAgeDays: number): VaultAwareThresholds {
  if (vaultAgeDays <= 0) {
    return {
      min_age_days: DEFAULT_MIN_AGE_DAYS,
      min_dormant_days: DEFAULT_MIN_DORMANT_DAYS,
      recent_window_days: DEFAULT_RECENT_WINDOW_DAYS,
      vault_age_days: 0,
    };
  }
  const min_age = clamp(
    Math.floor(vaultAgeDays / 2),
    VAULT_AWARE_MIN_AGE_FLOOR,
    VAULT_AWARE_MIN_AGE_CEIL,
  );
  const min_dormant = clamp(
    Math.floor(min_age / 3),
    VAULT_AWARE_DORMANT_FLOOR,
    VAULT_AWARE_DORMANT_CEIL,
  );
  const recent = clamp(
    Math.min(min_age, Math.max(vaultAgeDays - 1, 1)),
    VAULT_AWARE_RECENT_FLOOR,
    VAULT_AWARE_RECENT_CEIL,
  );
  return {
    min_age_days: min_age,
    min_dormant_days: min_dormant,
    recent_window_days: recent,
    vault_age_days: vaultAgeDays,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function parseIso(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}
