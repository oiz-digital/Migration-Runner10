// Binance-style palettes. Brand accents (yellow/green/red) stay constant
// across both themes for trading-context recognizability; only surface,
// text, and chrome colors flip.

export type Palette = {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  border: string;
  input: string;
};

// Brand: ZEBVIX — primary blue, accent orange, success green.
// Destructive (red) kept for trading PnL semantics.
const dark: Palette = {
  text: "#eaecef",
  tint: "#ff8a3d",
  background: "#0b0e11",
  foreground: "#eaecef",
  card: "#161a1e",
  cardForeground: "#eaecef",
  primary: "#1772f0",
  primaryForeground: "#ffffff",
  secondary: "#1e2329",
  secondaryForeground: "#eaecef",
  muted: "#1e2329",
  mutedForeground: "#848e9c",
  accent: "#ff8a3d",
  accentForeground: "#0b0e11",
  destructive: "#f6465d",
  destructiveForeground: "#ffffff",
  success: "#0ecb81",
  successForeground: "#ffffff",
  border: "#2b2f36",
  input: "#2b2f36",
};

const light: Palette = {
  text: "#1e2329",
  tint: "#ff7a26",
  background: "#ffffff",
  foreground: "#1e2329",
  card: "#f5f7fb",
  cardForeground: "#1e2329",
  primary: "#1366e0",
  primaryForeground: "#ffffff",
  secondary: "#eef3fb",
  secondaryForeground: "#1e2329",
  muted: "#f5f5f5",
  mutedForeground: "#707a8a",
  accent: "#ff7a26",
  accentForeground: "#ffffff",
  destructive: "#cf304a",
  destructiveForeground: "#ffffff",
  success: "#03a66d",
  successForeground: "#ffffff",
  border: "#e3e7ee",
  input: "#e3e7ee",
};

const colors = { light, dark, radius: 8 };
export default colors;
