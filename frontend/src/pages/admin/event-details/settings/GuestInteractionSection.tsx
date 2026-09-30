import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { FeedbackSettings } from '../../../../components/admin';
import { CreditVisibilitySetting } from '../../../../components/admin/CreditVisibilitySetting';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { FeedbackModeSelector } from './FeedbackModeSelector';
import { applyFeedbackMode, feedbackMode, offeredModes } from './feedbackMode';

/**
 * Settings > Guest interaction (spec 5.1). The feedback mode is the everyday
 * control; the individual toggles and the photo credit switch sit in the
 * advanced area. Everything is saved by the bar.
 */
export const GuestInteractionSection: React.FC = () => {
  const { t } = useTranslation();
  const { editForm, setEditForm, feedbackSettings, setFeedbackSettings, savedFeedbackSettings, expert } = useEventSettings();
  const saved = savedFeedbackSettings ?? feedbackSettings;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionGuests', 'Guest interaction')}</h2>
      <FeedbackModeSelector
        mode={feedbackMode(feedbackSettings)}
        offered={offeredModes(feedbackSettings, saved)}
        onSelect={(mode) => setFeedbackSettings(applyFeedbackMode(feedbackSettings, saved, mode))}
      />
      <AdvancedArea expert={expert}>
        {/* The component carries its own title; the mode owns its enable switch. */}
        <FeedbackSettings settings={feedbackSettings} onChange={setFeedbackSettings} hideEnableToggle />
        <CreditVisibilitySetting
          idPrefix="event-credits"
          checked={editForm.show_credits_to_guests}
          onChange={(show_credits_to_guests) => setEditForm(prev => ({ ...prev, show_credits_to_guests }))}
        />
      </AdvancedArea>
    </Card>
  );
};
