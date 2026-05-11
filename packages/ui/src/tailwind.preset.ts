// @basalt/ui — Tailwind v4 preset.
// Tailwind v4 reads tokens from CSS via the @theme block; this object is exposed
// for surfaces that prefer to drive Tailwind from JS (Astro integrations,
// tooling that does its own CSS injection).

import { colors, fontSizes, fonts, lineHeights, radii, spacing } from "./tokens.js";

export const tailwindTheme = {
  colors: {
    "basalt-bg": colors.bg,
    "basalt-bg-raised": colors.bgRaised,
    "basalt-ink": colors.ink,
    "basalt-ink-dim": colors.inkDim,
    "basalt-rule": colors.rule,
    "basalt-accent-na": colors.accentNa,
    "basalt-accent-cl": colors.accentCl,
    "basalt-accent-hg": colors.accentHg,
    "basalt-accent-c": colors.accentC,
    "basalt-accent-au": colors.accentAu,
    "basalt-danger": colors.danger,
  },
  fontFamily: {
    display: fonts.display.split(",").map((s) => s.trim().replace(/"/g, "")),
    body: fonts.body.split(",").map((s) => s.trim().replace(/"/g, "")),
    mono: fonts.mono.split(",").map((s) => s.trim().replace(/"/g, "")),
  },
  fontSize: fontSizes,
  lineHeight: lineHeights,
  spacing,
  borderRadius: radii,
};

export const themeCss = `@theme {
  --color-basalt-bg: ${colors.bg};
  --color-basalt-bg-raised: ${colors.bgRaised};
  --color-basalt-ink: ${colors.ink};
  --color-basalt-ink-dim: ${colors.inkDim};
  --color-basalt-rule: ${colors.rule};
  --color-basalt-accent-na: ${colors.accentNa};
  --color-basalt-accent-cl: ${colors.accentCl};
  --color-basalt-accent-hg: ${colors.accentHg};
  --color-basalt-accent-c: ${colors.accentC};
  --color-basalt-accent-au: ${colors.accentAu};
  --color-basalt-danger: ${colors.danger};

  --font-display: ${fonts.display};
  --font-body: ${fonts.body};
  --font-mono: ${fonts.mono};
}`;
