import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { FeedbackSettings } from '../../../../components/admin';
import { CreditVisibilitySetting } from '../../../../components/admin/CreditVisibilitySetting';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/**
 * Settings > Guest interaction (spec 5.1). The feedback controls are edited
 * here only and saved by the bar; the photo credit switch sits in the
 * advanced area.
 */
export const GuestInteractionSection: React.FC = () => {
  const { t } = useTranslation();
  const { editForm, setEditForm, feedbackSettings, setFeedbackSettings, expert } = useEventSettings();
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
          {/* Guest uploads, uploader names and reveal mode were removed in
              P3 (spec 5.12). The credit switch stays: it also covers the
              photographer credit read from each photo. */}
          <CreditVisibilitySetting
            idPrefix="event-credits"
            checked={editForm.show_credits_to_guests}
            onChange={(show_credits_to_guests) => setEditForm(prev => ({ ...prev, show_credits_to_guests }))}
          />
      </AdvancedArea>
    </Card>
  );
};
