import { useTheme } from "@/context/ThemeContext";

/**
 * Returns the design tokens for the active theme (auto / light / dark).
 *
 * Backed by `ThemeContext` — the user's preference is persisted via
 * AsyncStorage and resolved against the system color scheme when set
 * to "auto". All screens that consume `useColors()` will react
 * automatically when the user changes the theme from Account → Theme.
 */
export function useColors() {
  const { palette, radius } = useTheme();
  return { ...palette, radius };
}
