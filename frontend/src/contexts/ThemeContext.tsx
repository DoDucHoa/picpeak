import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { BrandTheme } from '../types/theme.types';
import { fontsService, extractFamilyName, type FontDefinition } from '../services/fonts.service';
import { applyForceColorMode } from '../utils/themeMigration';
import { getReadableForeground } from '../utils/contrast';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { getBootBrandSnapshot } from '../utils/brandSnapshot';

// Self-hosted font loader. Resolves the available-fonts list once (cached for
// 5 minutes) and lazily injects @font-face blocks into <head> only for the
// families a page actually uses. Avoids preloading every available font on
// every gallery view.
const FONTS_LIST_TTL_MS = 5 * 60 * 1000;
let fontsListPromise: Promise<FontDefinition[]> | null = null;
let fontsListExpiresAt = 0;
const injectedFamilies = new Set<string>();
const FONT_STYLE_ID = 'self-hosted-fonts';

function getFontsList(): Promise<FontDefinition[]> {
  if (fontsListPromise && Date.now() < fontsListExpiresAt) {
    return fontsListPromise;
  }
  fontsListPromise = fontsService.list().catch((err) => {
    console.error('Failed to load fonts list:', err);
    return [];
  });
  fontsListExpiresAt = Date.now() + FONTS_LIST_TTL_MS;
  return fontsListPromise;
}

function ensureFontFaceLoaded(family: string, weights: number[]): void {
  if (injectedFamilies.has(family)) return;
  injectedFamilies.add(family);

  let styleEl = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = FONT_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  // Folder name on disk = family name with hyphens. URL-encode in case of
  // unusual characters (the scanner already restricts to subdirectory names,
  // so this is belt-and-braces).
  const folderName = family.replace(/ /g, '-');
  const blocks = weights.map(
    (w) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url('/fonts/${encodeURIComponent(folderName)}/${w}.woff2') format('woff2');}`
  );
  styleEl.textContent += '\n' + blocks.join('\n');
}

async function loadFontForFamily(cssFontFamily: string | undefined | null): Promise<void> {
  const family = extractFamilyName(cssFontFamily);
  if (!family) return;
  if (injectedFamilies.has(family)) return;
  const fonts = await getFontsList();
  const match = fonts.find((f) => f.family.toLowerCase() === family.toLowerCase());
  if (!match) return; // unknown family: browser falls back to the CSS generic
  ensureFontFaceLoaded(match.family, match.weights);
}

function resolveColorMode(mode: 'light' | 'dark' | 'auto' | undefined): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// The brand the app paints with before the instance theme has loaded. Same
// values as the defaults in styles/tokens.css, so the first paint and the
// first applyTheme agree.
const DEFAULT_BRAND_THEME: BrandTheme = {
  primaryColor: '#5C8762',
  accentColor: '#22c55e',
  accentDarkColor: '#5C8762',
  backgroundColor: '#fafafa',
  surfaceColor: '#ffffff',
  elevatedColor: '#f5f5f5',
  surfaceBorderColor: '#e5e5e5',
  textColor: '#171717',
  mutedTextColor: '#737373',
  borderRadius: 'md',
};

interface ThemeContextType {
  theme: BrandTheme;
  setTheme: (theme: BrandTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: BrandTheme;
}

// The theme this browser saw on its last visit, so a reload paints the
// instance brand instead of flashing the PicPeak defaults first.
function bootTheme(): BrandTheme {
  const saved = getBootBrandSnapshot()?.theme_config;
  return saved && typeof saved === 'object' ? (saved as BrandTheme) : DEFAULT_BRAND_THEME;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialTheme,
}) => {
  const [theme, setTheme] = useState<BrandTheme>(() => initialTheme ?? bootTheme());

  // Subscribe to the instance-wide force color mode setting. When an admin
  // toggles "Force dark / light" in Branding, all open tabs re-apply the
  // active theme through applyForceColorMode within the refetch interval so
  // the lock takes effect without a full reload.
  // Refetch is best-effort: a stale cached value just means a delayed flip,
  // not a broken state.
  const { data: livePublicSettings } = usePublicSettings({ refetchInterval: 30_000 });
  const publicSettings = livePublicSettings ?? getBootBrandSnapshot();
  const forcedMode = publicSettings?.branding_force_color_mode === 'dark'
    ? 'dark'
    : publicSettings?.branding_force_color_mode === 'light'
      ? 'light'
      : null;

  const applyTheme = useCallback((rawThemeConfig: BrandTheme) => {
    const root = document.documentElement;

    // Honour the instance-wide force color mode at the chokepoint so every
    // call site (admin, portal, branding live preview) is forced to follow
    // without each one having to remember to do it.
    // applyForceColorMode is a no-op when forcedMode is null, and only
    // swaps surface/text tokens when the active theme doesn't natively
    // support the locked mode; accent CI colours are preserved either way.
    const themeConfig = applyForceColorMode(rawThemeConfig, forcedMode);

    // Apply CSS variables: 8-token CI palette.
    // Legacy --color-primary / --color-primary-light / --color-primary-dark
    // are kept for any consumer still reading them; they mirror accent-dark.
    if (themeConfig.primaryColor) {
      root.style.setProperty('--color-primary', themeConfig.primaryColor);
      root.style.setProperty('--color-primary-light', lightenColor(themeConfig.primaryColor, 20));
      root.style.setProperty('--color-primary-dark', darkenColor(themeConfig.primaryColor, 20));
    }

    if (themeConfig.accentColor) {
      root.style.setProperty('--color-accent', themeConfig.accentColor);
      // Pick a readable foreground (white or black) for text/icons sitting
      // on top of `--color-accent`, so a pale accent doesn't leave button
      // text unreadable (PR #401 review follow-up).
      root.style.setProperty('--color-accent-fg', getReadableForeground(themeConfig.accentColor));
    }

    // Accent-dark: filled CTA background. Falls back to primaryColor for
    // legacy themes that pre-date the explicit token (matches the previous
    // implicit behavior where .btn-primary used --color-primary).
    const accentDark = themeConfig.accentDarkColor || themeConfig.primaryColor;
    if (accentDark) {
      root.style.setProperty('--color-accent-dark', accentDark);
      // Same readable-foreground treatment for filled CTAs (.btn-primary
      // and .tile-selected) that paint on top of accent-dark.
      root.style.setProperty('--color-accent-dark-fg', getReadableForeground(accentDark));
    }
    
    if (themeConfig.backgroundColor) {
      root.style.setProperty('--color-background', themeConfig.backgroundColor);
    }

    if (themeConfig.textColor) {
      root.style.setProperty('--color-text', themeConfig.textColor);
    }
    
    if (themeConfig.fontFamily) {
      root.style.setProperty('--font-family', themeConfig.fontFamily);
      // Lazily inject the @font-face for this family if we haven't already.
      // Fire-and-forget: the CSS variable is set immediately, the font file
      // streams in afterward and `font-display: swap` reflows on arrival.
      void loadFontForFamily(themeConfig.fontFamily);
    }

    // "Same as body" is stored as headingFontFamily=''; in that case
    // mirror the body family so a stale --heading-font-family (e.g.
    // from a previously applied theme with a serif heading)
    // doesn't bleed into pages that picked the matched-fonts option.
    // Without this fall-through the CSS variable retained the last
    // explicit value across theme switches, which is why the customer
    // profile and admin login rendered serif headings even though the
    // active theme had "Same as body" selected.
    const effectiveHeadingFont = themeConfig.headingFontFamily || themeConfig.fontFamily;
    if (effectiveHeadingFont) {
      root.style.setProperty('--heading-font-family', effectiveHeadingFont);
      void loadFontForFamily(effectiveHeadingFont);
    }
    
    if (themeConfig.borderRadius) {
      const radiusMap = {
        none: '0',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '1rem',
      };
      root.style.setProperty('--border-radius', radiusMap[themeConfig.borderRadius]);
    }
    
    // Apply font size
    if (themeConfig.fontSize) {
      const sizeMap = {
        small: '14px',
        normal: '16px',
        large: '18px',
      };
      root.style.setProperty('--font-size-base', sizeMap[themeConfig.fontSize]);
    }
    
    // Apply shadow style
    if (themeConfig.shadowStyle) {
      const shadowMap = {
        none: 'none',
        subtle: '0 1px 3px rgba(0,0,0,0.12)',
        normal: '0 4px 6px rgba(0,0,0,0.1)',
        dramatic: '0 10px 25px rgba(0,0,0,0.15)',
      };
      root.style.setProperty('--shadow-default', shadowMap[themeConfig.shadowStyle]);
    }
    
    // Apply surface colors
    const effectiveMode = resolveColorMode(themeConfig.colorMode);

    if (themeConfig.surfaceColor) {
      root.style.setProperty('--color-surface', themeConfig.surfaceColor);
    } else if (effectiveMode === 'dark') {
      // Auto-derive dark surface if not explicitly set
      root.style.setProperty('--color-surface', '#1a1a1a');
    } else {
      root.style.setProperty('--color-surface', '#ffffff');
    }

    // Elevated: raised panels, image placeholders. Falls back to a slight
    // shift from surface so the layering still reads on legacy themes.
    if (themeConfig.elevatedColor) {
      root.style.setProperty('--color-elevated', themeConfig.elevatedColor);
    } else if (effectiveMode === 'dark') {
      root.style.setProperty('--color-elevated', '#242424');
    } else {
      root.style.setProperty('--color-elevated', '#f5f5f5');
    }

    if (themeConfig.surfaceBorderColor) {
      root.style.setProperty('--color-surface-border', themeConfig.surfaceBorderColor);
    } else if (effectiveMode === 'dark') {
      root.style.setProperty('--color-surface-border', '#2e2e2e');
    } else {
      root.style.setProperty('--color-surface-border', '#e5e5e5');
    }

    if (themeConfig.mutedTextColor) {
      root.style.setProperty('--color-muted-text', themeConfig.mutedTextColor);
    } else if (effectiveMode === 'dark') {
      root.style.setProperty('--color-muted-text', '#a3a3a3');
    } else {
      root.style.setProperty('--color-muted-text', '#737373');
    }

    // Adjust shadow intensity for dark mode
    if (themeConfig.shadowStyle) {
      const lightShadowMap = {
        none: 'none',
        subtle: '0 1px 3px rgba(0,0,0,0.12)',
        normal: '0 4px 6px rgba(0,0,0,0.1)',
        dramatic: '0 10px 25px rgba(0,0,0,0.15)',
      };
      const darkShadowMap = {
        none: 'none',
        subtle: '0 1px 3px rgba(0,0,0,0.4)',
        normal: '0 4px 6px rgba(0,0,0,0.35)',
        dramatic: '0 10px 25px rgba(0,0,0,0.5)',
      };
      const map = effectiveMode === 'dark' ? darkShadowMap : lightShadowMap;
      root.style.setProperty('--shadow-default', map[themeConfig.shadowStyle]);
    }
  }, [forcedMode]);

  const setThemeConfig = useCallback((newTheme: BrandTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  // Apply theme when it changes, OR when force-mode changes (so an admin
  // toggling Force dark / light in Branding flips every open tab on the
  // next public-settings refetch tick, no reload needed). A layout effect, so
  // the brand is on :root before the browser paints the first frame.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Earlier versions saved the last theme as `gallery-theme` and cached each
  // gallery's background as `gallery-theme-bg-<slug>`. Nothing reads them any
  // more, so clear them out once per visit. Best-effort: storage may throw.
  useEffect(() => {
    try {
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key === 'gallery-theme' || key.startsWith('gallery-theme-bg-'))) stale.push(key);
      }
      stale.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* ignore: a blocked storage just keeps the dead keys */
    }
  }, []);

  // Listen for system color scheme changes when colorMode is 'auto'
  useEffect(() => {
    if (theme.colorMode !== 'auto') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const contextValue = useMemo(() => ({
    theme,
    setTheme: setThemeConfig,
  }), [theme, setThemeConfig]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Utility functions for color manipulation
function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function darkenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = (num >> 8 & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 +
    (G > 0 ? G : 0) * 0x100 +
    (B > 0 ? B : 0)).toString(16).slice(1);
}

export type { BrandTheme };