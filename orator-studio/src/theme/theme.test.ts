import { describe, expect, it } from "vitest";
import { contrastRatio, safeUses, textOn } from "./contrast";
import { lluTheme } from "./llu";
import { chartSeriesColors, checkTextColor, color } from "./rules";

// Contrast on white as published in spec section 3A.
const SPEC: Record<string, number> = {
  "green-dark": 6.3, green: 4.3, "green-light": 1.4, orange: 2.8, amber: 1.7, yellow: 1.3,
  red: 8.0, "red-bright": 5.8, "red-tint": 1.4, plum: 12.0, purple: 8.1, periwinkle: 2.6,
  navy: 15.4, blue: 8.0, "blue-light": 3.0, "teal-dark": 9.2, teal: 4.6, sage: 2.5,
  "warm-gray-dark": 6.5, "warm-gray-mid": 2.1, "warm-gray-light": 1.2, black: 21.0, gray: 5.7, "gray-light": 1.6,
};

describe("LLU palette", () => {
  it("matches the contrast ratios in the spec", () => {
    for (const [token, ratio] of Object.entries(SPEC)) {
      expect(contrastRatio(color(lluTheme, token).hex, "#ffffff"), token).toBeCloseTo(ratio, 0.5);
    }
  });

  it("matches the logo colorway ratios in spec 3B", () => {
    expect(contrastRatio("#ffbb44", "#002255")).toBeCloseTo(9.2, 0);
    expect(contrastRatio("#ffffff", "#a30234")).toBeCloseTo(8.0, 0);
  });

  it("blocks light colors for body text and suggests a compliant one", () => {
    const res = checkTextColor(lluTheme, color(lluTheme, "orange").hex);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(contrastRatio(res.suggestion.hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(checkTextColor(lluTheme, color(lluTheme, "green").hex).ok).toBe(false); // 4.26
    expect(checkTextColor(lluTheme, color(lluTheme, "green").hex, "#ffffff", true).ok).toBe(true);
  });

  it("computes safe uses from the background, so dark backgrounds flip", () => {
    expect(safeUses("#002255", "#ffffff").bodyText).toBe(true);
    expect(safeUses("#002255", "#000000").bodyText).toBe(false);
    expect(safeUses("#ffdd88", "#002255").bodyText).toBe(true);
  });

  it("picks white or black text on fills", () => {
    expect(textOn("#a30234")).toBe("#ffffff");
    expect(textOn("#ffdd88")).toBe("#000000");
    for (const c of lluTheme.colors) expect(contrastRatio(textOn(c.hex), c.hex)).toBeGreaterThanOrEqual(4.5);
  });

  it("orders chart series by contrast, outlining light colors", () => {
    const series = chartSeriesColors(lluTheme, 30);
    const firstWeak = series.findIndex((s) => s.needsOutline);
    expect(firstWeak).toBeGreaterThan(5);
    expect(series.slice(0, firstWeak).every((s) => contrastRatio(s.color.hex, "#ffffff") >= 3)).toBe(true);
    expect(series[0].color.token).toBe("red");
  });
});
