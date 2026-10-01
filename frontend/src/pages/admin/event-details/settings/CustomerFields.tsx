import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../components/common';

export type CustomerField = 'customer_name' | 'customer_email' | 'customer_phone';

/**
 * The customer's name, email and phone (spec 5.1, 5.5), the same on the
 * create screen and in Settings > Details. On create a field the Settings
 * make optional says so; the event page passes no requirements.
 */
export const CustomerFields: React.FC<{
  values: Record<CustomerField, string>;
  onChange: (field: CustomerField, value: string) => void;
  phoneFieldEnabled: boolean;
  required?: { name: boolean; email: boolean };
  errors?: Partial<Record<CustomerField, string>>;
}> = ({ values, onChange, phoneFieldEnabled, required, errors = {} }) => {
  const { t } = useTranslation();
  const label = (text: string, isRequired: boolean | undefined) =>
    required && !isRequired ? `${text} (${t('common.optional')})` : text;
  return (
    <>
      <Input
        type="text"
        label={label(t('events.hostName'), required?.name)}
        value={values.customer_name}
        onChange={(e) => onChange('customer_name', e.target.value)}
        placeholder={t('events.hostNamePlaceholder')}
        error={errors.customer_name}
      />
      <Input
        type="email"
        label={label(t('events.hostEmail'), required?.email)}
        value={values.customer_email}
        onChange={(e) => onChange('customer_email', e.target.value)}
        placeholder={t('events.hostEmailPlaceholder')}
        error={errors.customer_email}
      />
      {phoneFieldEnabled && (
        <Input
          type="tel"
          label={`${t('events.customerPhone', 'Customer Phone')} (${t('common.optional')})`}
          value={values.customer_phone}
          onChange={(e) => onChange('customer_phone', e.target.value)}
          placeholder={t('events.customerPhonePlaceholder', '+1 555 555 1234')}
        />
      )}
    </>
  );
};
