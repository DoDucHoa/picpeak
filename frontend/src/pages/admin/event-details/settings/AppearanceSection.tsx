import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Image, Layout, Trash2, Upload } from 'lucide-react';
import { Card, Loading, MarkdownContent } from '../../../../components/common';
import { HeroPhotoSelector, FocalPointPicker } from '../../../../components/admin';
import { api } from '../../../../config/api';
import { buildResourceUrl } from '../../../../utils/url';
import { EventThemeSection } from '../EventThemeSection';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/**
 * Settings > Appearance (spec 5.1). The controls moved from the old edit form
 * unchanged; P4 rebuilds this section. The event logo is an action: it
 * uploads or deletes at once and refreshes the page's event query.
 */
export const AppearanceSection: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { event, editForm, setEditForm, theme, setTheme, heroPhotos, cssTemplates, expert } = useEventSettings();
  const [logoUploading, setLogoUploading] = useState(false);
  const id = String(event.id);

  const handleEventLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      await api.post(`/admin/events/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('events.eventLogoUploaded', 'Event logo uploaded successfully'));
      // The page's own key; ['event', id] belongs to the feedback page (finding 14).
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('events.eventLogoUploadFailed', 'Failed to upload event logo'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleEventLogoRemove = async () => {
    setLogoUploading(true);
    try {
      await api.delete(`/admin/events/${id}/logo`);
      toast.success(t('events.eventLogoRemoved', 'Event logo removed successfully'));
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('events.eventLogoRemoveFailed', 'Failed to remove event logo'));
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="md">
        <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAppearance', 'Appearance')}</h2>
        <div className="space-y-4">
          {/* Hero Photo Selection */}
          <HeroPhotoSelector
            photos={heroPhotos}
            currentHeroPhotoId={editForm.hero_photo_id}
            onSelect={(photoId) => setEditForm(prev => ({ ...prev, hero_photo_id: photoId }))}
            isEditing
          />
        </div>
        <AdvancedArea expert={expert}>
          {/* Hero Image Focal Point Picker (#162) */}
          {editForm.hero_photo_id && (() => {
            const heroPhoto = heroPhotos.find((p) => p.id === editForm.hero_photo_id);
            const heroImageUrl = heroPhoto?.thumbnail_url || heroPhoto?.url;
            if (!heroImageUrl) return null;
            return (
              <div className="ml-6 mt-2">
                <label className="block text-sm font-medium text-body mb-1">
                  {t('events.heroImageAnchor', 'Hero Image Crop Position')}
                </label>
                <p className="text-xs text-muted mb-2">
                  {t('events.heroImageAnchorDescription', 'Click on the image to set the focal point for cropping.')}
                </p>
                <FocalPointPicker
                  imageUrl={heroImageUrl}
                  currentValue={editForm.hero_image_anchor}
                  onChange={(value) => setEditForm(prev => ({ ...prev, hero_image_anchor: value }))}
                  slug={event.slug}
                />
              </div>
            );
          })()}

          {/* Per-event social-share opt-in (#474). Toggle is
              disabled when no hero photo is picked, there's
              nothing to surface as the cover. The help text
              deliberately spells out the public-by-design
              consequence so an admin doesn't flip this on for
              a sensitive gallery without realising what they're
              sharing with link-preview crawlers. */}
          <div className="ml-6 mt-3">
            <label className={`flex items-start gap-2 cursor-pointer ${editForm.hero_photo_id ? '' : 'opacity-60 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                className="mt-0.5 rounded border-line-strong text-accent focus:ring-primary-500"
                checked={editForm.og_image_share_enabled === true}
                disabled={!editForm.hero_photo_id}
                onChange={(e) => setEditForm(prev => ({ ...prev, og_image_share_enabled: e.target.checked }))}
              />
              <span className="text-sm">
                <span className="font-medium text-heading">
                  {t('events.ogShare.title', 'Use hero photo as social-share preview')}
                </span>
                <span className="block text-xs text-soft mt-0.5">
                  {editForm.hero_photo_id
                    ? t('events.ogShare.help', 'When this gallery URL is shared on WhatsApp, Facebook, Slack, etc., the link preview will show the hero photo above. The thumbnail is fetched unauthenticated by link-preview crawlers — anyone with the URL effectively makes this image public. Off by default; pick a hero you are comfortable surfacing publicly before enabling.')
                    : t('events.ogShare.heroRequired', 'Pick a hero photo above first — this option uses it as the WhatsApp / Facebook / Slack preview image.')}
                </span>
              </span>
            </label>
          </div>

          {/* Hero Logo Settings */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
              <Layout className="w-4 h-4 text-accent" />
              {t('events.heroLogoSettings', 'Hero Logo Settings')}
            </h3>
  
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-body mb-1 flex items-center gap-1">
                  <Image className="w-4 h-4 text-muted" />
                  {t('events.heroLogoVisible', 'Display logo in hero section')}
                </label>
                <select
                  // Tri-state (#756): "inherit" = null = follow the global
                  // Branding → "Show logo in hero" toggle; show/hide override it
                  // for just this gallery.
                  value={editForm.hero_logo_visible === null || editForm.hero_logo_visible === undefined
                    ? 'inherit'
                    : editForm.hero_logo_visible ? 'show' : 'hide'}
                  onChange={(e) => setEditForm(prev => ({
                    ...prev,
                    hero_logo_visible: e.target.value === 'inherit' ? null : e.target.value === 'show'
                  }))}
                  className="w-full sm:w-64 px-3 py-2 border border-line-strong bg-panel text-heading rounded-md shadow-sm focus:ring-primary-500 focus:border-accent-dark text-sm"
                >
                  <option value="inherit">{t('events.heroLogoInherit', 'Use branding default')}</option>
                  <option value="show">{t('events.heroLogoShow', 'Always show')}</option>
                  <option value="hide">{t('events.heroLogoHide', 'Always hide')}</option>
                </select>
              </div>
  
              {editForm.hero_logo_visible !== false && (
                <>
                  <div className="ml-6">
                    <label className="block text-sm font-medium text-body mb-1">
                      {t('events.heroLogoSize', 'Logo Size')}
                    </label>
                    <select
                      // '' = inherit the global branding logo size (#756).
                      value={editForm.hero_logo_size ?? ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, hero_logo_size: e.target.value === '' ? null : e.target.value as 'small' | 'medium' | 'large' | 'xlarge' }))}
                      className="w-full sm:w-48 px-3 py-2 border border-line-strong bg-panel text-heading rounded-md shadow-sm focus:ring-primary-500 focus:border-accent-dark text-sm"
                    >
                      <option value="">{t('events.heroLogoInherit', 'Use branding default')}</option>
                      <option value="small">{t('events.heroLogoSizeSmall', 'Small')}</option>
                      <option value="medium">{t('events.heroLogoSizeMedium', 'Medium')}</option>
                      <option value="large">{t('events.heroLogoSizeLarge', 'Large')}</option>
                      <option value="xlarge">{t('events.heroLogoSizeXLarge', 'Extra Large')}</option>
                    </select>
                  </div>
  
                  <div className="ml-6">
                    <label className="block text-sm font-medium text-body mb-1">
                      {t('events.heroLogoPosition', 'Logo Position')}
                    </label>
                    <select
                      value={editForm.hero_logo_position}
                      onChange={(e) => setEditForm(prev => ({ ...prev, hero_logo_position: e.target.value as 'top' | 'center' | 'bottom' }))}
                      className="w-full sm:w-48 px-3 py-2 border border-line-strong bg-panel text-heading rounded-md shadow-sm focus:ring-primary-500 focus:border-accent-dark text-sm"
                    >
                      <option value="top">{t('events.heroLogoPositionTop', 'Top (above title)')}</option>
                      <option value="center">{t('events.heroLogoPositionCenter', 'Center (between title and dates)')}</option>
                      <option value="bottom">{t('events.heroLogoPositionBottom', 'Bottom (below dates)')}</option>
                    </select>
                  </div>
  
                  {/* Custom Event Logo Upload */}
                  <div className="ml-6 mt-3 pt-3 border-t border-line">
                    <label className="block text-sm font-medium text-body mb-2">
                      {t('events.eventCustomLogo', 'Custom Event Logo')}
                    </label>
                    <p className="text-xs text-muted mb-2">
                      {t('events.eventCustomLogoDescription', 'Upload a custom logo for this event. This overrides the global branding logo for this gallery only.')}
                    </p>
  
                    {event.hero_logo_url ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 border border-line rounded-md flex items-center justify-center bg-inset overflow-hidden">
                          <img
                            src={buildResourceUrl(event.hero_logo_url)}
                            alt={t('events.eventCustomLogo', 'Custom Event Logo')}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-accent hover:opacity-80">
                            <Upload className="w-3 h-3" />
                            {t('events.replaceLogo', 'Replace')}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/png,image/jpeg,image/gif,image/svg+xml"
                              disabled={logoUploading}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleEventLogoUpload(file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleEventLogoRemove}
                            disabled={logoUploading}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('events.removeLogo', 'Remove')}
                          </button>
                        </div>
                        {logoUploading && <Loading size="sm" />}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-line-strong text-body rounded-md hover:bg-hover ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                          <Upload className="w-3.5 h-3.5" />
                          {t('events.uploadEventLogo', 'Upload Logo')}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/png,image/jpeg,image/gif,image/svg+xml"
                            disabled={logoUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleEventLogoUpload(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {logoUploading && <Loading size="sm" />}
                      </div>
                    )}
                  </div>
                </>
              )}
  
              <div>
                <label className="block text-sm font-medium text-body mb-1 flex items-center gap-1">
                  <Image className="w-4 h-4 text-muted" />
                  {t('events.loginLogoVisible', 'Display logo on password page')}
                </label>
                <select
                  // #894: two-state, null keeps the default (show), false
                  // hides the branding logo on this gallery's password page.
                  value={editForm.login_logo_visible === false ? 'hide' : 'show'}
                  onChange={(e) => setEditForm(prev => ({
                    ...prev,
                    login_logo_visible: e.target.value === 'hide' ? false : null
                  }))}
                  className="w-full sm:w-64 px-3 py-2 border border-line-strong bg-panel text-heading rounded-md shadow-sm focus:ring-primary-500 focus:border-accent-dark text-sm"
                >
                  <option value="show">{t('events.loginLogoShow', 'Show (default)')}</option>
                  <option value="hide">{t('events.loginLogoHide', 'Hide')}</option>
                </select>
              </div>
  
              <p className="text-xs text-muted mt-2">
                {t('events.heroLogoInfo', 'These settings apply when the gallery uses the Hero layout. You can hide the logo or customize its size and position.')}
              </p>
            </div>
          </div>

          {/* Promotional Banner Override (#440), three-way: inherit / custom / off */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3">
              {t('events.promoBanner.title', 'Promotional Banner')}
            </h3>
            <p className="text-xs text-muted mb-3">
              {t('events.promoBanner.help', 'Choose how this gallery handles the promotional banner. "Inherit" uses your global default; "Custom" overrides it for this event; "Off" hides it entirely.')}
            </p>
            <div className="space-y-2">
              {(['inherit', 'custom', 'off'] as const).map((mode) => (
                <label key={mode} className="flex items-center">
                  <input
                    type="radio"
                    name="promo_mode"
                    value={mode}
                    checked={editForm.promo_mode === mode}
                    onChange={() => setEditForm(prev => ({ ...prev, promo_mode: mode }))}
                    className="w-4 h-4 text-accent border-line-strong focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-body">
                    {t(`events.promoBanner.mode_${mode}`, mode === 'inherit' ? 'Inherit global default' : mode === 'custom' ? 'Custom override for this event' : 'Off (hide for this event)')}
                  </span>
                </label>
              ))}
            </div>
            {editForm.promo_mode === 'custom' && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={editForm.promo_markdown}
                  onChange={(e) => setEditForm(prev => ({ ...prev, promo_markdown: e.target.value }))}
                  rows={5}
                  placeholder={t('events.promoBanner.placeholder', 'Markdown content (e.g. **Special offer:** [book your next session](https://example.com))')}
                  className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark font-mono text-sm"
                />
                {editForm.promo_markdown.trim() && (
                  <div className="border border-line rounded-lg p-3 bg-shell">
                    <p className="text-xs uppercase tracking-wide text-muted mb-2">
                      {t('events.promoBanner.preview', 'Preview')}
                    </p>
                    <MarkdownContent source={editForm.promo_markdown} className="prose prose-sm dark:prose-invert max-w-none text-sm text-body prose-a:text-primary-600 dark:prose-a:text-primary-400" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info Banner Override (#932), three-way: inherit / custom / off.
              Mirrors the promotional override above, but this banner renders
              at the TOP of the gallery, above the photos. */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3">
              {t('events.infoBanner.title', 'Info Banner')}
            </h3>
            <p className="text-xs text-muted mb-3">
              {t('events.infoBanner.help', 'A short note shown above the photos in this gallery. "Inherit" uses your global default; "Custom" overrides it for this event; "Off" hides it entirely.')}
            </p>
            <div className="space-y-2">
              {(['inherit', 'custom', 'off'] as const).map((mode) => (
                <label key={mode} className="flex items-center">
                  <input
                    type="radio"
                    name="info_mode"
                    value={mode}
                    checked={editForm.info_mode === mode}
                    onChange={() => setEditForm(prev => ({ ...prev, info_mode: mode }))}
                    className="w-4 h-4 text-accent border-line-strong focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-body">
                    {t(`events.infoBanner.mode_${mode}`, mode === 'inherit' ? 'Inherit global default' : mode === 'custom' ? 'Custom override for this event' : 'Off (hide for this event)')}
                  </span>
                </label>
              ))}
            </div>
            {editForm.info_mode === 'custom' && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={editForm.info_markdown}
                  onChange={(e) => setEditForm(prev => ({ ...prev, info_markdown: e.target.value }))}
                  rows={3}
                  placeholder={t('events.infoBanner.placeholder', 'Use the menu button in the top-left corner to filter the photos.')}
                  className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark font-mono text-sm"
                />
                {editForm.info_markdown.trim() && (
                  <div className="border border-line rounded-lg p-3 bg-shell">
                    <p className="text-xs uppercase tracking-wide text-muted mb-2">
                      {t('events.infoBanner.preview', 'Preview')}
                    </p>
                    <MarkdownContent source={editForm.info_markdown} className="prose prose-sm dark:prose-invert max-w-none text-sm text-body prose-a:text-primary-600 dark:prose-a:text-primary-400" />
                  </div>
                )}
              </div>
            )}
          </div>
        </AdvancedArea>
      </Card>
      <EventThemeSection theme={theme} setTheme={setTheme} editForm={editForm} setEditForm={setEditForm} cssTemplates={cssTemplates} />
    </div>
  );
};
