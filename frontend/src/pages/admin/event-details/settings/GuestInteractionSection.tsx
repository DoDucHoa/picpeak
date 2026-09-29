import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { FeedbackSettings } from '../../../../components/admin';
import { UploaderNameSettings } from '../../../../components/admin/UploaderNameSettings';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/**
 * Settings > Guest interaction (spec 5.1). The feedback controls are edited
 * here only and saved by the bar; guest uploads, uploader names and reveal
 * mode sit in the advanced area until P3 removes them.
 */
export const GuestInteractionSection: React.FC = () => {
  const { t } = useTranslation();
  const { editForm, setEditForm, feedbackSettings, setFeedbackSettings, categories, expert } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionGuests', 'Guest interaction')}</h2>
      <div className="space-y-4">
          {/* Feedback Settings */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3">{t('feedback.settings.title', 'Guest Feedback Settings')}</h3>
            <FeedbackSettings
              settings={feedbackSettings}
              onChange={setFeedbackSettings}
            />
          </div>
      </div>
      <AdvancedArea expert={expert}>
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
  
          {/* Reveal mode (#838), only meaningful with guest uploads */}
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
      </AdvancedArea>
    </Card>
  );
};
