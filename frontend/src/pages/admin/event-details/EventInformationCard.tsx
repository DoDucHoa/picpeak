import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Image,
  Shield,
  Layout
} from 'lucide-react';
import type { Event } from '../../../types';
import { Card } from '../../../components/common';
import { FeedbackSettings } from '../../../components/admin';
import { UploaderNameSettings } from '../../../components/admin/UploaderNameSettings';
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
  isEditing,
  editForm,
  setEditForm,
  feedbackSettings,
  setFeedbackSettings,
  categories,
  phoneFieldEnabled,
  daysUntilExpiration,
  onRevealNow
}) => {
  const { t } = useTranslation();
  
  const { format } = useLocalizedDate();

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.eventInformation')}</h2>

      {isEditing ? (
        <div className="space-y-4">
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
