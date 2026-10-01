import type { BrandTheme } from '../types/theme.types';

/**
 * Surface defaults for the two color modes: the same values applyTheme()
 * falls back to when a theme has no explicit surface/elevated/border/text
 * tokens. Exposed here so the force-color-mode helper can swap them
 * wholesale when an admin locks the instance to a mode that the active
 * theme doesn't natively support.
 */
const DARK_SURFACE_DEFAULTS = {
  backgroundColor: '#0f0f0f',
  surfaceColor: '#1a1a1a',
  elevatedColor: '#242424',
  surfaceBorderColor: '#2e2e2e',
  textColor: '#e5e5e5',
  mutedTextColor: '#a3a3a3',
};

const LIGHT_SURFACE_DEFAULTS = {
  backgroundColor: '#fafafa',
  surfaceColor: '#ffffff',
  elevatedColor: '#f5f5f5',
  surfaceBorderColor: '#e5e5e5',
  textColor: '#171717',
  mutedTextColor: '#737373',
};

/**
 * Apply an instance-wide force color mode lock to a theme config.
 *
 * If the theme already matches the locked mode (or no lock is set), only
 * the colorMode flag is pinned. If the theme is locked to a mode it
 * doesn't natively support (e.g. an admin set Force Dark on a light
 * brand), the surface/text tokens are replaced with the matching mode's
 * defaults; the user's accent/accentDark colours are preserved so brand
 * identity survives the flip.
 *
 * Centralised here so every caller of ThemeContext.applyTheme stays in
 * sync (#397 follow-up: pages did not visibly flip when Force Dark/Light
 * was toggled because only colorMode was overridden, leaving the original
 * light/dark surface colours in place).
 */
export function applyForceColorMode(
  theme: BrandTheme,
  forced: 'dark' | 'light' | null | undefined
): BrandTheme {
  if (!forced) return theme;

  const themeMode = theme.colorMode === 'auto'
    ? (typeof window !== 'undefined'
        && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light')
    : (theme.colorMode || 'light');

  if (themeMode === forced) {
    return { ...theme, colorMode: forced };
  }

  const surfaces = forced === 'dark' ? DARK_SURFACE_DEFAULTS : LIGHT_SURFACE_DEFAULTS;
  return {
    ...theme,
    ...surfaces,
    colorMode: forced,
  };
}

/**
 * Fills in any missing 8-token CI palette fields on legacy themes that were
 * saved before the palette expanded from 4 to 8 explicit tokens.
 *
 * The visible look of an existing instance must not change just because the
 * type system grew (per project memory: migrations preserve visual state).
 * For each missing token we fall back to the value the renderer was already
 * deriving implicitly:
 *   - accentDarkColor    from primaryColor (legacy primary was the CTA fill)
 *   - elevatedColor      '#f5f5f5' / '#242424' depending on colorMode
 *   - surfaceColor       '#ffffff' / '#1a1a1a'
 *   - surfaceBorderColor '#e5e5e5' / '#2e2e2e'
 *   - mutedTextColor     '#737373' / '#a3a3a3'
 */
export function migrateThemeConfig(theme: BrandTheme): BrandTheme {
  if (!theme) return theme;

  const isDark = theme.colorMode === 'dark';
  const filled: BrandTheme = { ...theme };

  if (!filled.surfaceColor) {
    filled.surfaceColor = isDark ? '#1a1a1a' : '#ffffff';
  }
  if (!filled.elevatedColor) {
    // For dark themes raise slightly above surface; for light, drop slightly below.
    filled.elevatedColor = isDark ? '#242424' : '#f5f5f5';
  }
  if (!filled.surfaceBorderColor) {
    filled.surfaceBorderColor = isDark ? '#2e2e2e' : '#e5e5e5';
  }
  if (!filled.mutedTextColor) {
    filled.mutedTextColor = isDark ? '#a3a3a3' : '#737373';
  }
  if (!filled.accentDarkColor) {
    // Legacy themes used primaryColor as the CTA fill: preserve that.
    filled.accentDarkColor = filled.primaryColor;
  }

  return filled;
}

