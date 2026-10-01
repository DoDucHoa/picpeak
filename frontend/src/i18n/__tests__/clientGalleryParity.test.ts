import { it, expect } from 'vitest';
import en from '../locales/en.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import nl from '../locales/nl.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import sl from '../locales/sl.json';
import vi from '../locales/vi.json';

const leaves = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));

// Branding keys that only the removed gallery theme, layout and CSS template editors used.
const DEAD_BRANDING_KEYS = [
  'animation', 'applyTheme', 'autoplayInterval', 'backgroundOptions', 'backgroundPattern',
  'betaThumbnailWarningLink', 'betaThumbnailWarningText', 'betaThumbnailWarningTitle', 'columns',
  'controlsStyle', 'controlsStyleDescription', 'controlsStyleDescriptions', 'controlsStyleHeroWarning',
  'controlsStyleOptions', 'cssInstructions', 'cssTemplate', 'cssTemplateDescription', 'customCSSHelp',
  'desktop', 'dividerOptions', 'enableAutoplay', 'eventCustomCSS', 'eventSpecificThemes', 'eventThemesInfo',
  'forcedModeGalleryNote', 'galleryLayout', 'galleryTheme', 'groupPhotosBy', 'grouping', 'headerStyle',
  'headerStyleDescription', 'headerStyleDescriptions', 'headerStyleOptions', 'heroDividerDescription',
  'heroDividerStyle', 'heroPlaceholderText', 'lastRowBehavior', 'lastRowOptions', 'layoutDescriptions',
  'layoutSettings', 'livePreview', 'masonryMode', 'masonryModeHint', 'masonryModeOptions', 'mobile',
  'noTemplate', 'noTemplateDescription', 'photoAnimation', 'photoSpacing', 'preview', 'previewLayout',
  'saveTheme', 'spacing', 'storyGridMode', 'storyGridModeHint', 'storyGridModeOptions', 'syncFromBranding',
  'tablet', 'targetRowHeight', 'targetRowHeightHint', 'templateSlot', 'theme', 'themeAndStyle',
  'themePresets', 'thumbnailScale', 'thumbnailScaleHint', 'thumbnailScaleOptions',
];
const DEAD = new RegExp(
  `^cssTemplates\\.|^events\\.(galleryTheme|customizingThemeFor|noThemeSet)$|^branding\\.(${DEAD_BRANDING_KEYS.join('|')})(\\.|$)`,
);

it('has every clientGallery key in en, de and vi', () => {
  const want = leaves((en as Record<string, Record<string, unknown>>).clientGallery).sort();
  expect(leaves((de as Record<string, Record<string, unknown>>).clientGallery).sort()).toEqual(want);
  expect(leaves((vi as Record<string, Record<string, unknown>>).clientGallery).sort()).toEqual(want);
});

it('no longer carries gallery theme keys in any locale', () => {
  for (const locale of [en, de, es, fr, nl, pt, ru, sl, vi]) {
    expect(leaves(locale as Record<string, unknown>).filter((k) => DEAD.test(k))).toEqual([]);
  }
});
