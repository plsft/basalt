import { describe, expect, it } from "vitest";
import {
  computeVaultAgeDays,
  computeVaultAwareThresholds,
  DEFAULT_MIN_AGE_DAYS,
  DEFAULT_MIN_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
} from "./thresholds";

describe("computeVaultAgeDays", () => {
  it("returns 0 for an empty vault", () => {
    expect(computeVaultAgeDays([], "2026-05-09")).toBe(0);
  });

  it("returns 0 when no notes have created dates", () => {
    expect(computeVaultAgeDays([null, null], "2026-05-09")).toBe(0);
  });

  it("returns the age in days of the oldest note", () => {
    expect(computeVaultAgeDays(["2026-05-09", "2025-05-09", "2024-05-09"], "2026-05-09")).toBe(730); // 2 years (365 + 365)
  });

  it("ignores notes whose created date is unparseable", () => {
    expect(computeVaultAgeDays(["not a date", "2024-05-09", "garbage"], "2026-05-09")).toBe(730);
  });
});

describe("computeVaultAwareThresholds", () => {
  it("returns static defaults when vaultAge <= 0", () => {
    const t = computeVaultAwareThresholds(0);
    expect(t.min_age_days).toBe(DEFAULT_MIN_AGE_DAYS);
    expect(t.min_dormant_days).toBe(DEFAULT_MIN_DORMANT_DAYS);
    expect(t.recent_window_days).toBe(DEFAULT_RECENT_WINDOW_DAYS);
    expect(t.vault_age_days).toBe(0);
  });

  it("clamps to floors for very young vaults", () => {
    const t = computeVaultAwareThresholds(30);
    expect(t.min_age_days).toBe(60);
    expect(t.min_dormant_days).toBe(30);
    expect(t.recent_window_days).toBe(60);
  });

  it("scales mid-range vaults", () => {
    const t = computeVaultAwareThresholds(200);
    expect(t.min_age_days).toBe(100);
    expect(t.min_dormant_days).toBe(33);
    expect(t.recent_window_days).toBe(100);
  });

  it("clamps to ceilings for very old vaults", () => {
    const t = computeVaultAwareThresholds(5000);
    expect(t.min_age_days).toBe(365);
    expect(t.min_dormant_days).toBe(121);
    expect(t.recent_window_days).toBe(365);
  });

  it("matches SPEC.md §9.2 worked examples row-for-row", () => {
    const cases: Array<[number, number, number, number]> = [
      [30, 60, 30, 60],
      [120, 60, 30, 60],
      [200, 100, 33, 100],
      [365, 182, 60, 182],
      [1000, 365, 121, 365],
      [5000, 365, 121, 365],
    ];
    for (const [age, expMinAge, expMinDormant, expRecent] of cases) {
      const t = computeVaultAwareThresholds(age);
      expect(t.min_age_days, `age=${age} min_age`).toBe(expMinAge);
      expect(t.min_dormant_days, `age=${age} min_dormant`).toBe(expMinDormant);
      expect(t.recent_window_days, `age=${age} recent`).toBe(expRecent);
    }
  });
});
