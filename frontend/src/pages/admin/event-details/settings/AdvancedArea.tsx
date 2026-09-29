import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const EXPERT_KEY = 'picpeak.eventSettings.expertMode';

/** Expert mode opens every section's advanced controls; stored per browser (spec 5.3). */
export function useExpertMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPERT_KEY) === '1'; } catch { return false; }
  });
  const set = (next: boolean) => {
    setOn(next);
    try { localStorage.setItem(EXPERT_KEY, next ? '1' : '0'); } catch { /* storage refused: keep it for this visit */ }
  };
  return [on, set];
}

/** A section's "Show advanced options" row (spec 5.3). */
export const AdvancedArea: React.FC<{ expert: boolean; children: React.ReactNode }> = ({ expert, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = expert || open;
  return (
    <div className="mt-6 border-t border-line pt-4">
      {!expert && (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="text-sm font-medium text-accent">
          {open ? t('events.settings.hideAdvanced', 'Hide advanced options') : t('events.settings.showAdvanced', 'Show advanced options')}
        </button>
      )}
      {shown && <div id={id} className="mt-4 space-y-4">{children}</div>}
    </div>
  );
};
