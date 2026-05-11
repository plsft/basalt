// basalted-ui — brand tokens.
// Source of truth: PRD §2.5. Mirrors the @theme block in packages/web/src/index.css
// and packages/desktop/src/index.css. When these drift, this file is authoritative.

export const colors = {
  bg: "#0E0D0C",
  bgRaised: "#181613",
  ink: "#F5F1E8",
  inkDim: "#A89F8E",
  rule: "#2A2622",
  accentNa: "#F2C75C",
  accentCl: "#7CC4A1",
  accentHg: "#9CA3AF",
  accentC: "#5B6677",
  accentAu: "#D4A857",
  danger: "#C8553D",
} as const;

export const fonts = {
  display: '"Fraunces", Georgia, serif',
  body: '"Source Serif 4", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const fontSizes = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
  "6xl": "3.75rem",
} as const;

export const lineHeights = {
  tight: "1.15",
  snug: "1.3",
  normal: "1.6",
  relaxed: "1.75",
} as const;

export const spacing = {
  px: "1px",
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  6: "1.5rem",
  8: "2rem",
  12: "3rem",
  16: "4rem",
  24: "6rem",
  32: "8rem",
} as const;

export const radii = {
  none: "0",
  sm: "2px",
  md: "4px",
  lg: "8px",
} as const;

export const elements = {
  na: { symbol: "Na", number: 11, name: "Sodium", verb: "Implicit Thesis", color: colors.accentNa },
  cl: { symbol: "Cl", number: 17, name: "Chlorine", verb: "Contradiction", color: colors.accentCl },
  hg: { symbol: "Hg", number: 80, name: "Mercury", verb: "Drift", color: colors.accentHg },
  c: { symbol: "C", number: 6, name: "Carbon", verb: "Connection", color: colors.accentC },
  au: { symbol: "Au", number: 79, name: "Gold", verb: "Buried Insight", color: colors.accentAu },
} as const;

export type ElementKey = keyof typeof elements;

export const tokens = {
  colors,
  fonts,
  fontSizes,
  lineHeights,
  spacing,
  radii,
  elements,
} as const;
