import { GALLERY_THEME_PRESETS } from '../../../../types/legacyGalleryTheme.types';

export type StoredThemeKind = 'inherit' | 'preset' | 'custom';

/**
 * What an event's stored color_theme is (spec 5.9). The create page stores
 * every theme as JSON, so JSON equal to a preset's config is a preset, not a
 * hand-made look. An unknown name falls back to the global theme in the
 * gallery, so it counts as inherit.
 */
export function storedThemeKind(colorTheme: string | null | undefined): StoredThemeKind {
  if (!colorTheme) return 'inherit';
  if (!colorTheme.startsWith('{')) return GALLERY_THEME_PRESETS[colorTheme] ? 'preset' : 'inherit';
  try {
    const config = JSON.stringify(JSON.parse(colorTheme));
    return Object.values(GALLERY_THEME_PRESETS).some((p) => JSON.stringify(p.config) === config) ? 'preset' : 'custom';
  } catch {
    return 'inherit';
  }
}
