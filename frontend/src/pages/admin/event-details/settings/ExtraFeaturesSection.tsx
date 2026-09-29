import React from 'react';
import { EventReminderOverrideCard } from '../../../../components/admin/EventReminderOverrideCard';
import { SlideshowSettingsCard } from '../../../../components/admin/SlideshowSettingsCard';
import { FaceRecognitionCard } from '../../../../components/admin/FaceRecognitionCard';
import { useFeatureFlags } from '../../../../contexts/FeatureFlagsContext';
import { useEventSettings } from './EventSettingsContext';

/** True when at least one feature this section holds is switched on. */
export function useHasExtraFeatures(): boolean {
  const { flags } = useFeatureFlags();
  return !!(flags.faces || flags.slideshow || flags.reminderEmails);
}

/**
 * Settings > Extra features (spec 5.1): the feature-flagged cards, moved from
 * the Overview unchanged. They keep their own save buttons, the one exception
 * to the save bar (spec 2), and refresh the event when they save.
 */
export const ExtraFeaturesSection: React.FC = () => {
  const { flags } = useFeatureFlags();
  const { event, refetchEvent } = useEventSettings();
  return (
    <div className="space-y-6">
      {/* People in this gallery (#1074). Gated behind the `faces` feature
          flag, which is itself gated on the operator running the optional
          picpeak-ml sidecar, so this card is invisible on the vast majority
          of installs. */}
      {flags.faces && (
        <FaceRecognitionCard eventId={event.id} isArchived={event.is_archived} />
      )}

      {/* Live Slideshow ("Diashow") link + live display settings (migrations 138/139).
          Gated behind the `slideshow` feature flag. */}
      {flags.slideshow && (
        <SlideshowSettingsCard
          eventId={event.id}
          slug={event.slug}
          isArchived={event.is_archived}
          initial={{
            show_share_token: event.show_share_token,
            show_interval_ms: event.show_interval_ms,
            show_transition: event.show_transition,
            show_transition_ms: event.show_transition_ms,
            show_watermark: event.show_watermark,
            show_qr: event.show_qr,
            show_colorfilter: event.show_colorfilter,
          }}
          onChanged={() => refetchEvent()}
        />
      )}

      {/* Pre-event reminder override (migration 143). Hidden when
          the reminderEmails master flag is off, the override here
          would never fire since the cron itself no-ops. */}
      {flags.reminderEmails && (
        <EventReminderOverrideCard
          eventId={event.id}
          initial={{
            event_reminder_disabled: event.event_reminder_disabled,
            event_reminder_offset_days: event.event_reminder_offset_days,
            event_reminder_body_override: event.event_reminder_body_override,
          }}
          onSaved={() => refetchEvent()}
        />
      )}
    </div>
  );
};
