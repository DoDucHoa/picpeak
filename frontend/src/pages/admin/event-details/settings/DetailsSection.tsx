import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, LocalizedDateInput } from '../../../../components/common';
import { CustomerAccountPicker } from '../../../../components/admin/CustomerAccountPicker';
import { useLocalizedDate } from '../../../../hooks/useLocalizedDate';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/** Settings > Details (spec 5.1). The controls moved from the old edit form unchanged. */
export const DetailsSection: React.FC = () => {
  const { t } = useTranslation();
  const { format } = useLocalizedDate();
  const { editForm, setEditForm, phoneFieldEnabled, expert } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDetails', 'Details')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.hostName')}
          </label>
          <Input
            type="text"
            value={editForm.customer_name}
            onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
            placeholder={t('events.hostNamePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.hostEmail')}
          </label>
          <Input
            type="email"
            value={editForm.customer_email}
            onChange={(e) => setEditForm(prev => ({ ...prev, customer_email: e.target.value }))}
            placeholder={t('events.hostEmailPlaceholder')}
          />
        </div>

        {phoneFieldEnabled && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">
              {t('events.customerPhone', 'Customer Phone')} ({t('common.optional')})
            </label>
            <Input
              type="tel"
              value={editForm.customer_phone}
              onChange={(e) => setEditForm(prev => ({ ...prev, customer_phone: e.target.value }))}
              placeholder={t('events.customerPhonePlaceholder', '+1 555 555 1234')}
            />
          </div>
        )}

        {/* Customer accounts (#354). Picker self-hides when the
            customerPortal feature flag is off. */}
        <CustomerAccountPicker
          value={editForm.customer_accounts}
          onChange={(next) => setEditForm((prev) => ({ ...prev, customer_accounts: next }))}
        />

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.expirationDate')}
          </label>
          <LocalizedDateInput
            value={editForm.expires_at}
            onChange={(iso) => setEditForm(prev => ({ ...prev, expires_at: iso }))}
            min={format(new Date(), 'yyyy-MM-dd')}
          />
        </div>
      </div>
      <AdvancedArea expert={expert}>
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.welcomeMessageLabel')}
          </label>
          <textarea
            value={editForm.welcome_message}
            onChange={(e) => setEditForm(prev => ({ ...prev, welcome_message: e.target.value }))}
            className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
            rows={3}
            placeholder={t('events.welcomeMessage')}
          />
        </div>
      </AdvancedArea>
    </Card>
  );
};
