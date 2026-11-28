/** WCAG 2.1 contrast math (spec Appendix A). */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Bad hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const BODY_TEXT_MIN = 4.5;
export const LARGE_TEXT_MIN = 3;
export const GRAPHIC_MIN = 3;

export interface SafeUses {
  ratio: number;
  bodyText: boolean;
  largeText: boolean;
  chartMark: boolean;
}

/** Safe uses are computed against the actual background, so dark themes work out (rule 2). */
export function safeUses(color: string, background: string): SafeUses {
  const ratio = contrastRatio(color, background);
  return {
    ratio,
    bodyText: ratio >= BODY_TEXT_MIN,
    largeText: ratio >= LARGE_TEXT_MIN,
    chartMark: ratio >= GRAPHIC_MIN,
  };
}

/** White or black text, whichever contrasts more with the fill (rule 4). */
export function textOn(fill: string): "#ffffff" | "#000000" {
  return contrastRatio("#ffffff", fill) >= contrastRatio("#000000", fill) ? "#ffffff" : "#000000";
}

/** Rough perceptual distance (redmean approximation) for "nearest compliant color". */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
