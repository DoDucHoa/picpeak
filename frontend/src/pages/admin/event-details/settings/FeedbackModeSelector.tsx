import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeedbackMode } from './feedbackMode';

const LABEL: Record<FeedbackMode, [string, string, string, string]> = {
  off: ['events.feedbackMode.off', 'Off', 'events.feedbackMode.offHelp', 'Guests view and download only.'],
  picks: ['events.feedbackMode.picks', 'Client picks photos', 'events.feedbackMode.picksHelp', 'Guests mark favourites, nothing else.'],
  full: ['events.feedbackMode.full', 'Full feedback', 'events.feedbackMode.fullHelp', 'Favourites, likes, ratings, comments and reactions.'],
  custom: ['events.feedbackMode.custom', 'Custom', 'events.feedbackMode.customHelp', 'The individual switches under advanced options decide.'],
};

const FROM_SETTINGS: [string, string, string, string] = [
  'events.feedbackMode.customFromSettings', 'Custom (from Settings)',
  'events.feedbackMode.customFromSettingsHelp', 'The feedback switches set in Settings > Events.',
];

/** The feedback mode (spec 5.7): one choice instead of the individual toggles. */
export const FeedbackModeSelector: React.FC<{
  mode: FeedbackMode;
  offered: FeedbackMode[];
  onSelect: (mode: FeedbackMode) => void;
  /** Create (spec 5.7): the Custom toggles are the Settings defaults. */
  fromSettings?: boolean;
}> = ({ mode, offered, onSelect, fromSettings = false }) => {
  const { t } = useTranslation();
  const name = useId();
  return (
    <div role="radiogroup" aria-label={t('events.feedbackMode.label', 'Guest feedback')} className="space-y-2">
      {offered.map((m) => {
        const [key, fallback, helpKey, helpFallback] = m === 'custom' && fromSettings ? FROM_SETTINGS : LABEL[m];
        return (
          <label key={m} className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={name} className="mt-1" checked={mode === m} onChange={() => onSelect(m)} />
            <span>
              <span className="block text-sm font-medium text-body">{t(key, fallback)}</span>
              <span className="block text-xs text-muted">{t(helpKey, helpFallback)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
};
