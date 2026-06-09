import colors from "@/constants/colors";

export function useColors() {
  const palette = "dark" in colors
    ? (colors as Record<string, typeof colors.light>).dark
    : colors.light;
  return { ...palette, radius: colors.radius };
}
