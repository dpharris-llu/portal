export interface ThemeColor {
  token: string;
  name: string;
  hex: string;
  pms?: string;
  cmyk?: [number, number, number, number];
  role?: "primary" | "secondary" | "accent";
}

export interface Theme {
  id: string;
  name: string;
  background: string;
  text: string;
  colors: ThemeColor[];
  fonts: { heading: string; body: string };
  /** Type scale in px at a 1600x900 slide. */
  sizes: { title: number; body: number; small: number };
  /** Outer margin and gap, as fractions of slide width. */
  spacing: { margin: number; gap: number };
}
