/** Theme rules 1-4 from spec Appendix A, enforced in code rather than checked by hand. */
import type { Theme, ThemeColor } from "./types";
import { BODY_TEXT_MIN, GRAPHIC_MIN, colorDistance, contrastRatio } from "./contrast";

export function color(theme: Theme, token: string): ThemeColor {
  const c = theme.colors.find((x) => x.token === token);
  if (!c) throw new Error(`Theme ${theme.id} has no color ${token}`);
  return c;
}

export function primary(theme: Theme): ThemeColor {
  return theme.colors.find((c) => c.role === "primary") ?? theme.colors[0];
}

export type TextCheck =
  | { ok: true; ratio: number }
  | { ok: false; ratio: number; suggestion: ThemeColor };

/**
 * Rule 1: a color under 4.5:1 can never be body text; offer the nearest compliant
 * theme color. Large text (min 3:1) passes `large: true`.
 */
export function checkTextColor(theme: Theme, hex: string, background = theme.background, large = false): TextCheck {
  const min = large ? GRAPHIC_MIN : BODY_TEXT_MIN;
  const ratio = contrastRatio(hex, background);
  if (ratio >= min) return { ok: true, ratio };
  const candidates = theme.colors.filter((c) => contrastRatio(c.hex, background) >= min);
  const suggestion = candidates.reduce((best, c) =>
    colorDistance(c.hex, hex) < colorDistance(best.hex, hex) ? c : best,
  );
  return { ok: false, ratio, suggestion };
}

export interface SeriesColor {
  color: ThemeColor;
  /** Lighter colors are allowed only with an outline (rule 3). */
  needsOutline: boolean;
}

/**
 * Rule 3: chart series draw from colors with at least 3:1 contrast first,
 * starting with the brand roles, then the rest in theme order.
 */
export function chartSeriesColors(theme: Theme, count: number, background = theme.background): SeriesColor[] {
  const neutral = new Set(["black", "gray", "gray-light"]);
  const ordered = [
    ...theme.colors.filter((c) => c.role === "primary" || c.role === "accent"),
    ...theme.colors.filter((c) => !c.role && !neutral.has(c.token)),
  ];
  const strong = ordered.filter((c) => contrastRatio(c.hex, background) >= GRAPHIC_MIN);
  const weak = ordered.filter((c) => contrastRatio(c.hex, background) < GRAPHIC_MIN);
  const pool: SeriesColor[] = [
    ...strong.map((c) => ({ color: c, needsOutline: false })),
    ...weak.map((c) => ({ color: c, needsOutline: true })),
  ];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}
