import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, useColorScheme } from "react-native";

import colors, { type Palette } from "@/constants/colors";

export type ThemeMode = "auto" | "light" | "dark";
export type ThemeScheme = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ThemeScheme;
  isDark: boolean;
  palette: Palette;
  radius: number;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
};

const STORAGE_KEY = "@cryptox/theme-mode";

const defaultPalette = colors.dark;
const ThemeContext = createContext<ThemeContextValue>({
  mode: "auto",
  scheme: "dark",
  isDark: true,
  palette: defaultPalette,
  radius: colors.radius,
  setMode: () => {},
  cycleMode: () => {},
});

function resolveScheme(mode: ThemeMode, system: ThemeScheme): ThemeScheme {
  if (mode === "auto") return system;
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = (useColorScheme() ?? Appearance.getColorScheme() ?? "dark") as ThemeScheme;
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted preference once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (v === "auto" || v === "light" || v === "dark")) {
          setModeState(v);
        }
      } catch {}
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const cycleMode = useCallback(() => {
    setModeState(prev => {
      const next: ThemeMode = prev === "auto" ? "light" : prev === "light" ? "dark" : "auto";
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveScheme(mode, systemScheme);
    const palette = scheme === "light" ? colors.light : colors.dark;
    return {
      mode,
      scheme,
      isDark: scheme === "dark",
      palette,
      radius: colors.radius,
      setMode,
      cycleMode,
    };
  }, [mode, systemScheme, setMode, cycleMode]);

  // Avoid a flash of the wrong theme: render children only after hydration.
  // Returning `null` is safe because RootLayout already guards on fonts.
  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
