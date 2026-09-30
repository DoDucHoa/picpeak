import React from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format as formatDate, startOfDay } from 'date-fns';
import { LocalizedDateInput } from '../../../../components/common';
import { useLocalizedDate } from '../../../../hooks/useLocalizedDate';

const QUICK_DAYS = [30, 60, 90];

/** A date N days from today, as the draft stores it (O3: counted from today). */
export function expiryFromToday(days: number, today: Date = new Date()): string {
  return formatDate(addDays(startOfDay(today), days), 'yyyy-MM-dd');
}

/**
 * The gallery's expiry (spec 5.8), the same on both screens: the resulting
 * date always shown, quick buttons counted from today, and Never. '' is Never.
 * Changing the event date never touches it.
 */
export const ExpiryField: React.FC<{ value: string; onChange: (iso: string) => void; allowNever: boolean }> = ({ value, onChange, allowNever }) => {
  const { t } = useTranslation();
  const { format } = useLocalizedDate();
  const button = (pressed: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm ${pressed ? 'border-accent bg-accent/10 text-heading' : 'border-line-strong text-body'}`;
  return (
    <div>
      <span className="block text-sm font-medium text-body mb-1">{t('events.expiry.label', 'Gallery expires')}</span>
      <div className="flex flex-wrap gap-2 mb-2">
        {QUICK_DAYS.map((days) => {
          const iso = expiryFromToday(days);
          return (
            <button key={days} type="button" aria-pressed={value === iso} className={button(value === iso)} onClick={() => onChange(iso)}>
              {t('events.expiry.days', { count: days, defaultValue: `${days} days` })}
            </button>
          );
        })}
        {allowNever && (
          <button type="button" aria-pressed={value === ''} className={button(value === '')} onClick={() => onChange('')}>
            {t('events.expiry.never', 'Never')}
          </button>
        )}
      </div>
      <LocalizedDateInput value={value} onChange={onChange} min={expiryFromToday(0)} helperText={t('events.expiry.quickHelp', 'Counted from today.')} />
      <p className="mt-1 text-sm text-heading">
        {value
          ? t('events.expiry.expiresOn', { date: format(value), defaultValue: `Expires on ${format(value)}` })
          : t('events.expiry.neverExpires', 'Never expires')}
      </p>
    </div>
  );
};
