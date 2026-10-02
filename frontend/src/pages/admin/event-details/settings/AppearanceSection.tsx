import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Image, Layout, Trash2, Upload } from 'lucide-react';
import { Card, Loading } from '../../../../components/common';
import { HeroPhotoSelector, FocalPointPicker } from '../../../../components/admin';
import { api } from '../../../../config/api';
import { buildResourceUrl } from '../../../../utils/url';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { BannerOverride } from './BannerOverride';
import { usePublicSettings } from '../../../../hooks/usePublicSettings';

/**
 * Settings > Appearance (spec 5.1). The hero photo is the everyday control;
 * the hero details, the logo and the banners sit in the advanced area. The
 * gallery's look itself is fixed. The event logo is an action: it uploads or
 * deletes at once and refreshes the page's event query.
 */
export const AppearanceSection: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { event, editForm, setEditForm, heroPhotos, expert } = useEventSettings();
  const { data: publicSettings } = usePublicSettings();
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
  
              <p className="text-xs text-muted mt-2">
                {t('events.heroLogoInfoGlobal', "The logo's size and position come from Branding and apply to every gallery.")}
              </p>
            </div>
          </div>

          {/* Banners follow Branding until the event overrides them (P4). */}
          <div className="mt-4 pt-4 border-t border-line">
            <BannerOverride
              title={t('events.promoBanner.title', 'Promotional Banner')}
              help={t('events.promoBanner.help', 'Choose how this gallery handles the promotional banner. "Inherit" uses your global default; "Custom" overrides it for this event; "Off" hides it entirely.')}
              placeholder={t('events.promoBanner.placeholder', 'Markdown content (e.g. **Special offer:** [book your next session](https://example.com))')}
              globalMarkdown={publicSettings?.branding_promo_markdown ?? ''}
              mode={editForm.promo_mode}
              markdown={editForm.promo_markdown}
              onModeChange={(promo_mode) => setEditForm(prev => ({ ...prev, promo_mode }))}
              onMarkdownChange={(promo_markdown) => setEditForm(prev => ({ ...prev, promo_markdown }))}
            />
          </div>

          {/* The info banner renders at the top of the gallery, above the photos (#932). */}
          <div className="mt-4 pt-4 border-t border-line">
            <BannerOverride
              title={t('events.infoBanner.title', 'Info Banner')}
              help={t('events.infoBanner.help', 'A short note shown above the photos in this gallery. "Inherit" uses your global default; "Custom" overrides it for this event; "Off" hides it entirely.')}
              placeholder={t('events.infoBanner.placeholder', 'Use the menu button in the top-left corner to filter the photos.')}
              globalMarkdown={publicSettings?.branding_info_markdown ?? ''}
              mode={editForm.info_mode}
              markdown={editForm.info_markdown}
              onModeChange={(info_mode) => setEditForm(prev => ({ ...prev, info_mode }))}
              onMarkdownChange={(info_markdown) => setEditForm(prev => ({ ...prev, info_markdown }))}
              modeKeyPrefix="events.infoBanner"
            />
          </div>
        </AdvancedArea>
      </Card>
    </div>
  );
};
