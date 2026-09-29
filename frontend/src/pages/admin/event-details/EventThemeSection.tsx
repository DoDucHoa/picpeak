import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Card } from '../../../components/common';
import { ThemeCustomizerEnhanced } from '../../../components/admin';
import { usePublicSettings } from '../../../hooks/usePublicSettings';
import type { EnabledTemplate } from '../../../services/cssTemplates.service';
import { ThemeConfig, GALLERY_THEME_PRESETS } from '../../../types/theme.types';
import type { EditFormState, ThemeDraft } from './types';

interface EventThemeSectionProps {
  theme: ThemeDraft;
  setTheme: (fn: (current: ThemeDraft) => ThemeDraft) => void;
  editForm: EditFormState;
  setEditForm: (action: React.SetStateAction<EditFormState>) => void;
  cssTemplates: EnabledTemplate[];
}

/**
 * The theme customizer, driven by the Settings draft. The look and the
 * preset it came from are one draft field; the save turns them into
 * color_theme, header_style and hero_divider_style (saveDraft.themePayload),
 * so nothing here writes editForm.color_theme.
 */
export const EventThemeSection: React.FC<EventThemeSectionProps> = ({
  theme,
  setTheme,
  editForm,
  setEditForm,
  cssTemplates
}) => {
  const { t } = useTranslation();
  const { data: publicSettings } = usePublicSettings();

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('branding.themeAndStyle')}</h2>
      <ThemeCustomizerEnhanced
        value={theme.config}
        forceColorMode={publicSettings?.branding_force_color_mode ?? null}
        onChange={(config) => setTheme((current) => ({ ...current, config }))}
        presetName={theme.preset}
        onPresetChange={(presetName) => setTheme((current) => {
          const preset = presetName !== 'custom' ? GALLERY_THEME_PRESETS[presetName] : undefined;
          return preset ? { config: preset.config, preset: presetName } : { ...current, preset: presetName };
        })}
        onSyncFromBranding={() => {
          // Reset only the colour tokens to the site Branding; layout, header
          // and typography stay so the admin keeps this event's tweaks.
          const branding = publicSettings?.theme_config as ThemeConfig | undefined;
          if (!branding) {
            toast.error(t('toast.brandingThemeMissing', 'No branding theme has been saved yet.'));
            return;
          }
          setTheme((current) => ({
            preset: 'custom',
            config: {
              ...current.config,
              primaryColor: branding.primaryColor,
              accentColor: branding.accentColor,
              accentDarkColor: branding.accentDarkColor,
              backgroundColor: branding.backgroundColor,
              surfaceColor: branding.surfaceColor,
              elevatedColor: branding.elevatedColor,
              surfaceBorderColor: branding.surfaceBorderColor,
              textColor: branding.textColor,
              mutedTextColor: branding.mutedTextColor,
              colorMode: branding.colorMode ?? current.config.colorMode,
            },
          }));
          toast.success(t('toast.brandingPaletteSynced', 'Palette synced from Branding.'));
        }}
        showGalleryLayouts={true}
        hideActions={true}
        cssTemplates={cssTemplates}
        cssTemplateId={editForm.css_template_id}
        onCssTemplateChange={(templateId) => setEditForm(prev => ({ ...prev, css_template_id: templateId }))}
      />
    </Card>
  );
};
