import React from 'react';
import { ThemePresetsCard } from '../../../../components/admin/theme-customizer/ThemePresetsCard';
import { GALLERY_THEME_PRESETS } from '../../../../types/theme.types';
import type { ThemeDraft } from '../types';

/**
 * The theme preset on its own, the everyday Appearance control (spec 5.1).
 * Picking one sets the preset's look, as the full customizer does. The beta
 * thumbnail warning never shows with gallery layouts on, so its numbers are
 * inert here; the advanced customizer keeps the real warning.
 */
export const ThemePresetPicker: React.FC<{ theme: ThemeDraft; setTheme: (fn: (current: ThemeDraft) => ThemeDraft) => void }> = ({ theme, setTheme }) => (
  <ThemePresetsCard
    selectedPreset={theme.preset}
    handlePresetSelect={(presetKey) => {
      const preset = GALLERY_THEME_PRESETS[presetKey];
      if (preset) setTheme(() => ({ config: preset.config, preset: presetKey }));
    }}
    showGalleryLayouts
    isBetaLayout={false}
    isThumbnailTooSmall={false}
    thumbnailWidth={0}
    thumbnailHeight={0}
    minRecommendedThumbnailSize={0}
  />
);
