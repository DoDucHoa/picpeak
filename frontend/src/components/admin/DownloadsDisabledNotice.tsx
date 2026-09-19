import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

/**
 * Shown on the per-event download cards when the gallery's master switch,
 * "Allow photo downloads" in Download Protection, is off.
 *
 * Those cards used to stay fully live in that state, so an admin could sit and
 * configure an allowance of 20 photos, package prices and a download
 * resolution for a gallery whose every download route answers 403. The three
 * controls are genuinely different things (may they download at all, how many,
 * at what size), but nothing on screen said the first one governs the other
 * two, which is exactly the confusion this removes.
 */
export const DownloadsDisabledNotice: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {t(
          'events.downloadsDisabledNotice',
          'Downloads are switched off for this gallery, so these settings have no effect. Turn on "Allow photo downloads" under Download Protection to use them.',
        )}
      </p>
    </div>
  );
};
