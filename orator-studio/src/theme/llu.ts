/**
 * LLU palette (spec 3A). Values transcribed from the spec, which took them from a
 * screenshot of the LLU style guide; confirm against the live guide.
 * Safe uses are not stored: they are computed from contrast (see contrast.ts).
 */
import type { Theme } from "./types";

export const lluTheme: Theme = {
  id: "llu",
  name: "LLU",
  background: "#ffffff",
  text: "#000000",
  // Placeholder fonts until LLU brand fonts are captured (spec 3A).
  fonts: { heading: "'Space Grotesk', system-ui, sans-serif", body: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  sizes: { title: 60, body: 34, small: 22 },
  spacing: { margin: 0.06, gap: 0.03 },
  colors: [
    { token: "red", name: "Regent Red", hex: "#a30234", pms: "1955 C", cmyk: [0, 100, 60, 37], role: "primary" },
    { token: "gray", name: "Platinum Gray", hex: "#666666", pms: "425 C", cmyk: [0, 0, 0, 77], role: "secondary" },
    { token: "blue", name: "Blue", hex: "#005195", pms: "301 C", cmyk: [100, 23.5, 0, 18.5], role: "accent" },
    { token: "green-dark", name: "Green", hex: "#556622", pms: "371 C" },
    { token: "green", name: "Green", hex: "#558822", pms: "370 C" },
    { token: "green-light", name: "Yellow-green", hex: "#dddd77", pms: "585 C" },
    { token: "orange", name: "Orange", hex: "#dd8800", pms: "145 C" },
    { token: "amber", name: "Amber", hex: "#ffbb44", pms: "142 C" },
    { token: "yellow", name: "Yellow", hex: "#ffdd88", pms: "121 C" },
    { token: "red-bright", name: "Red", hex: "#cc0044", pms: "1935 C" },
    { token: "red-tint", name: "Pink", hex: "#f0d6db", pms: "698 C" },
    { token: "plum", name: "Plum", hex: "#552255", pms: "261 C" },
    { token: "purple", name: "Purple", hex: "#7722aa", pms: "527 C" },
    { token: "periwinkle", name: "Blue-gray", hex: "#91a1be", pms: "535 C" },
    { token: "navy", name: "Navy", hex: "#002255", pms: "654 C" },
    { token: "blue-light", name: "Sky blue", hex: "#6699cc", pms: "542 C" },
    { token: "teal-dark", name: "Dark teal", hex: "#004f5c", pms: "3165 C" },
    { token: "teal", name: "Teal", hex: "#008472", pms: "327 C" },
    { token: "sage", name: "Sage", hex: "#88aa99", pms: "5565 C" },
    { token: "warm-gray-dark", name: "Warm gray", hex: "#685c53", pms: "Warm Gray 11 C" },
    { token: "warm-gray-mid", name: "Warm gray", hex: "#beb2a6", pms: "7529 C" },
    { token: "warm-gray-light", name: "Warm gray", hex: "#eae9df", pms: "Warm Gray 2 C" },
    { token: "black", name: "Black", hex: "#000000", pms: "Black" },
    { token: "gray-light", name: "Cool gray", hex: "#cccccc", pms: "Cool Gray 3 C" },
  ],
};

export const themes: Record<string, Theme> = { llu: lluTheme };

export function getTheme(id: string): Theme {
  return themes[id] ?? lluTheme;
}
