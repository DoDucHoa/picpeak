import React from 'react';
import { useTranslation } from 'react-i18next';

interface CreditVisibilitySettingProps {
  checked: boolean;
  onChange: (show: boolean) => void;
  // Prefix for the input id, so two instances on one page stay unique.
  idPrefix?: string;
  className?: string;
}

/**
 * Whether guests see the photo credits (#1561): the photographer name read
 * from each photo's metadata, and names on photos guests uploaded before
 * guest uploads were removed (P3). Used on the event page, the create page and
 * Settings > Event Defaults.
 */
export const CreditVisibilitySetting: React.FC<CreditVisibilitySettingProps> = ({
  checked,
  onChange,
  idPrefix = 'credit-visibility',
  className = '',
}) => {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <label className="flex items-center" htmlFor={`${idPrefix}-show`}>
        <input
          id={`${idPrefix}-show`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
        />
        <span className="ml-2 text-sm text-body">{t('events.credits.showToGuests', 'Show photo credits to guests')}</span>
      </label>
      <p className="text-xs text-muted mt-1 ml-6">
        {t('events.credits.showToGuestsHelp', "Guests see the photographer's name stored in each photo. You always see it.")}
      </p>
    </div>
  );
};
