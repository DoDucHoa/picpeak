import { describe, expect, it } from 'vitest';
import { storedThemeKind } from '../storedThemeKind';
import { GALLERY_THEME_PRESETS } from '../../../../../types/legacyGalleryTheme.types';

describe('storedThemeKind (spec 5.9)', () => {
  it('reads NULL and an unknown name as inherit', () => {
    expect(storedThemeKind(null)).toBe('inherit');
    expect(storedThemeKind('')).toBe('inherit');
    expect(storedThemeKind('noSuchPreset')).toBe('inherit');
  });
  it('reads a preset name and JSON equal to a preset config as preset', () => {
    expect(storedThemeKind('elegantWedding')).toBe('preset');
    expect(storedThemeKind(JSON.stringify(GALLERY_THEME_PRESETS.birthdayFun.config))).toBe('preset');
  });
  it('reads other JSON as custom', () => {
    expect(storedThemeKind(JSON.stringify({ ...GALLERY_THEME_PRESETS.default.config, primaryColor: '#123456' }))).toBe('custom');
  });
});
