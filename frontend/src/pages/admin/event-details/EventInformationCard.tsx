import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import {
  Download,
  Upload,
  Image,
  Shield,
  Layout,
  Trash2
} from 'lucide-react';
import type { Event } from '../../../types';
import { Card, Loading, MarkdownContent } from '../../../components/common';
import { HeroPhotoSelector, FocalPointPicker, FeedbackSettings } from '../../../components/admin';
import { UploaderNameSettings } from '../../../components/admin/UploaderNameSettings';
import { api } from '../../../config/api';
import { buildResourceUrl } from '../../../utils/url';
import { useLocalizedDate } from '../../../hooks/useLocalizedDate';
import type { AdminPhoto } from '../../../services/photos.service';
import type { FeedbackSettings as FeedbackSettingsType } from '../../../services/feedback.service';
import { safeParseDate } from './utils';
import type { EditFormState } from './types';

interface EventInformationCardProps {
  event: Event;
  id: string | undefined;
  isEditing: boolean;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  feedbackSettings: FeedbackSettingsType;
  setFeedbackSettings: React.Dispatch<React.SetStateAction<FeedbackSettingsType>>;
  categories: Array<{ id: number; name: string; slug: string; is_folder?: boolean }>;
  photos: AdminPhoto[];
  phoneFieldEnabled: boolean;
  daysUntilExpiration: number | null;
  // Reveal mode (#838): stamps revealed_at via POST /events/:id/reveal
  onRevealNow?: () => void;
}

export const EventInformationCard: React.FC<EventInformationCardProps> = ({
  event,
  id,
  isEditing,
  editForm,
  setEditForm,
  feedbackSettings,
  setFeedbackSettings,
  categories,
  photos,
  phoneFieldEnabled,
  daysUntilExpiration,
  onRevealNow
}) => {
  const { t } = useTranslation();
  
  const { format } = useLocalizedDate();
  const queryClient = useQueryClient();
  const [logoUploading, setLogoUploading] = useState(false);

  const handleEventLogoUpload = async (file: File) => {
    if (!id) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      await api.post(`/admin/events/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('events.eventLogoUploaded', 'Event logo uploaded successfully'));
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('events.eventLogoUploadFailed', 'Failed to upload event logo'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleEventLogoRemove = async () => {
    if (!id) return;
    setLogoUploading(true);
    try {
      await api.delete(`/admin/events/${id}/logo`);
      toast.success(t('events.eventLogoRemoved', 'Event logo removed successfully'));
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('events.eventLogoRemoveFailed', 'Failed to remove event logo'));
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.eventInformation')}</h2>

      {isEditing ? (
        <div className="space-y-4">
          {/* Hero Photo Selection */}
          <HeroPhotoSelector
            photos={photos || []}
            currentHeroPhotoId={editForm.hero_photo_id}
            onSelect={(photoId) => setEditForm(prev => ({ ...prev, hero_photo_id: photoId }))}
            isEditing={isEditing}
          />

          {/* Per-event social-share opt-in (#474). Toggle is
              disabled when no hero photo is picked — there's
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

          {/* Hero Image Focal Point Picker (#162) */}
          {editForm.hero_photo_id && (() => {
            const heroPhoto = (photos || []).find((p) => p.id === editForm.hero_photo_id);
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

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={editForm.allow_user_uploads}
                onChange={(e) => setEditForm(prev => ({ ...prev, allow_user_uploads: e.target.checked }))}
                className="w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-body">{t('events.allowUserUploads')}</span>
            </label>
            <p className="text-xs text-muted mt-1 ml-6">
              {t('events.allowUserUploadsHelp')}
            </p>
          </div>

          {editForm.allow_user_uploads && (
            <div>
              <label className="block text-sm font-medium text-body mb-1">
                {t('events.uploadCategory')}
              </label>
              <select
                value={editForm.upload_category_id || ''}
                onChange={(e) => setEditForm(prev => ({
                  ...prev,
                  upload_category_id: e.target.value ? parseInt(e.target.value) : null
                }))}
                className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
              >
                <option value="">{t('events.selectCategory')}</option>
                {categories?.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">
                {t('events.uploadCategoryHelp')}
              </p>
            </div>
          )}

          {/* Uploader names (#1561), beside the other guest upload options.
              Not gated on uploads: the visibility switch also covers credits
              read from EXIF. */}
          <UploaderNameSettings
            idPrefix="event-uploader-names"
            mode={editForm.guest_name_mode}
            onModeChange={(guest_name_mode) => setEditForm(prev => ({ ...prev, guest_name_mode }))}
            showToGuests={editForm.show_credits_to_guests}
            onShowToGuestsChange={(show_credits_to_guests) => setEditForm(prev => ({ ...prev, show_credits_to_guests }))}
          />

          {/* Reveal mode (#838) — only meaningful with guest uploads */}
          {editForm.allow_user_uploads && (
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={editForm.reveal_mode}
                  onChange={(e) => setEditForm(prev => ({ ...prev, reveal_mode: e.target.checked }))}
                  className="w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-body">
                  {t('events.revealMode', 'Reveal mode (hide gallery until reveal)')}
                </span>
              </label>
              <p className="text-xs text-muted mt-1 ml-6">
                {t('events.revealModeHelp', 'Guests can upload but see no photos until you reveal the gallery — manually or at the scheduled time. Slideshow and client access keep working.')}
              </p>
              {editForm.reveal_mode && (
                <div className="mt-2 ml-6">
                  <label className="block text-sm font-medium text-body mb-1">
                    {t('events.revealAt', 'Scheduled reveal (optional)')}
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.reveal_at}
                    onChange={(e) => setEditForm(prev => ({ ...prev, reveal_at: e.target.value }))}
                    className="px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-muted mt-1">
                    {t('events.revealAtHelp', 'Leave empty to reveal manually with the "Reveal now" button.')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Feedback Settings */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3">{t('feedback.settings.title', 'Guest Feedback Settings')}</h3>
            <FeedbackSettings
              settings={feedbackSettings}
              onChange={setFeedbackSettings}
            />
          </div>

          {/* Promotional Banner Override (#440) — three-way: inherit / custom / off */}
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

          {/* Info Banner Override (#932) — three-way: inherit / custom / off.
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

          {/* Download Protection Settings */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              {t('events.downloadProtection', 'Download Protection')}
            </h3>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={editForm.allow_downloads}
                  onChange={(e) => setEditForm(prev => ({ ...prev, allow_downloads: e.target.checked }))}
                  className="w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
                />
                <Download className="w-4 h-4 ml-2 mr-1 text-muted" />
                <span className="text-sm text-body">{t('events.allowDownloads', 'Allow photo downloads')}</span>
              </label>

              <p className="text-xs text-muted mt-2">
                {t('events.protectionInfo', 'Protection features help prevent unauthorized downloads but cannot block all methods.')}
              </p>
            </div>
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
                  // #894: two-state — null keeps the default (show), false
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
        </div>
      ) : (
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted">{t('events.sourceMode', 'Source Mode')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.source_mode === 'reference' ? t('events.sourceModeReference', 'Reference external folder') : t('events.sourceModeManaged', 'Managed (upload to PicPeak)')}
              {event.source_mode === 'reference' && event.external_path ? (
                <span className="text-muted ml-2">/external-media/{event.external_path}</span>
              ) : null}
              {event.source_mode === 'reference' && event.external_watch ? (
                <span className="block text-xs text-muted mt-1">
                  {t('events.externalWatchActive', 'Folder is watched — new files are imported automatically.')}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted">{t('events.welcomeMessage')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.welcome_message || <span className="text-neutral-400">{t('events.noWelcomeMessageSet')}</span>}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted">{t('events.hostName')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.customer_name || <span className="text-neutral-400">{t('common.notSet')}</span>}
            </dd>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.hostEmail')}</dt>
            <dd className="mt-1 text-sm text-heading">{event.customer_email}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted">{t('events.adminEmail')}</dt>
              <dd className="mt-1 text-sm text-heading">{event.admin_email}</dd>
            </div>
          </div>

          {phoneFieldEnabled && (
            <div>
              <dt className="text-sm font-medium text-muted">
                {t('events.customerPhone', 'Customer Phone')}
              </dt>
              <dd className="mt-1 text-sm text-heading">
                {event.customer_phone || (
                  <span className="text-neutral-400">{t('common.notSet')}</span>
                )}
              </dd>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.created')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {event.created_at && format(safeParseDate(event.created_at)!, 'PP')}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted">{t('events.expires')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {event.expires_at ? (
                  <>
                    {format(safeParseDate(event.expires_at)!, 'PP')}
                    {!event.is_archived && daysUntilExpiration !== null && daysUntilExpiration > 0 && (
                      <span className="text-muted ml-1">
                        {t('events.daysLeft', { count: daysUntilExpiration })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">{t('events.neverExpires', 'Never')}</span>
                )}
              </dd>
            </div>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted">{t('events.heroPhoto')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.hero_photo_id ? (
                <span className="text-accent">{t('events.heroPhotoSelected')}</span>
              ) : (
                <span className="text-neutral-400">{t('events.noHeroPhotoSelected')}</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted">{t('events.userUploads')}</dt>
            <dd className="mt-1 text-sm text-heading">
              {event.allow_user_uploads ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded">
                    {t('common.yes')}
                  </span>
                  {event.upload_category_id && (
                    <p className="text-xs text-soft">
                      {t('events.uploadCategory')}: {categories.find(c => c.id === event.upload_category_id)?.name || 'N/A'}
                    </p>
                  )}
                </div>
              ) : (
                <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-body bg-inset rounded">
                  {t('common.no')}
                </span>
              )}
            </dd>
          </div>

          {(event.guest_name_mode && event.guest_name_mode !== 'off') || Boolean(event.show_credits_to_guests) ? (
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.uploaderNames.label')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {t(`events.uploaderNames.modes.${event.guest_name_mode || 'off'}`)}
                <p className="text-xs text-soft">
                  {event.show_credits_to_guests
                    ? t('events.uploaderNames.shownToGuests')
                    : t('events.uploaderNames.hiddenFromGuests')}
                </p>
              </dd>
            </div>
          ) : null}

          {Boolean(event.reveal_mode) && (
            <div>
              <dt className="text-sm font-medium text-muted">{t('events.revealModeStatus', 'Reveal mode')}</dt>
              <dd className="mt-1 text-sm text-heading">
                {event.revealed_at ? (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded">
                    {t('events.revealed', 'Revealed')}
                  </span>
                ) : (
                  <div className="space-y-2">
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 rounded">
                      {t('events.hiddenUntilReveal', 'Hidden from guests')}
                    </span>
                    {event.reveal_at && (
                      <p className="text-xs text-soft">
                        {t('events.revealScheduled', 'Scheduled: {{date}}', { date: new Date(event.reveal_at).toLocaleString() })}
                      </p>
                    )}
                    {onRevealNow && (
                      <button
                        type="button"
                        onClick={onRevealNow}
                        className="block px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-dark rounded transition-colors"
                      >
                        {t('events.revealNow', 'Reveal now')}
                      </button>
                    )}
                  </div>
                )}
              </dd>
            </div>
          )}

          {/* Download Protection Display */}
          <div className="pt-3 mt-3 border-t border-line">
            <dt className="text-sm font-medium text-muted flex items-center gap-2">
              <Shield className="w-4 h-4" />
              {t('events.downloadProtection', 'Download Protection')}
            </dt>
            <dd className="mt-2 text-sm text-heading">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                  event.protection_level === 'maximum' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                  event.protection_level === 'enhanced' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                  event.protection_level === 'standard' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                  'bg-inset text-body'
                }`}>
                  {event.protection_level || 'standard'}
                </span>
                {!event.allow_downloads && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded">
                    <Download className="w-3 h-3 mr-1" />
                    {t('events.downloadsDisabled', 'Downloads disabled')}
                  </span>
                )}
              </div>
            </dd>
          </div>

          {/* Hero Logo Settings Display */}
          <div className="pt-3 mt-3 border-t border-line">
            <dt className="text-sm font-medium text-muted flex items-center gap-2">
              <Layout className="w-4 h-4" />
              {t('events.heroLogoSettings', 'Hero Logo Settings')}
            </dt>
            <dd className="mt-2 text-sm text-heading">
              <div className="flex flex-wrap gap-2">
                {event.hero_logo_visible !== false ? (
                  <>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">
                      <Image className="w-3 h-3 mr-1" />
                      {t('events.heroLogoVisibleLabel', 'Logo visible')}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                      {t('events.heroLogoSizeLabel', 'Size')}: {event.hero_logo_size || 'medium'}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                      {t('events.heroLogoPositionLabel', 'Position')}: {event.hero_logo_position || 'top'}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-inset text-body rounded">
                    <Image className="w-3 h-3 mr-1" />
                    {t('events.heroLogoHidden', 'Logo hidden')}
                  </span>
                )}
              </div>
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
};
