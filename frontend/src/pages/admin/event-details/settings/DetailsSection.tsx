import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, LocalizedDateInput } from '../../../../components/common';
import { WelcomeMessageEditor } from '../../../../components/admin';
import { CustomerAccountPicker } from '../../../../components/admin/CustomerAccountPicker';
import { useActiveEventTypes } from '../../../../hooks/useActiveEventTypes';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { ExpiryField } from './ExpiryField';
import { CustomerFields } from './CustomerFields';

/**
 * Settings > Details (spec 5.1): the event date and type, the customer, the
 * expiry (5.8), and the welcome message in the one editor.
 */
export const DetailsSection: React.FC = () => {
  const { t } = useTranslation();
  const { editForm, setEditForm, phoneFieldEnabled, expert } = useEventSettings();
  const { data: types = [] } = useActiveEventTypes();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDetails', 'Details')}</h2>
      <div className="space-y-4">
        <LocalizedDateInput
          label={t('events.details.eventDate', 'Event date')}
          value={editForm.event_date}
          onChange={(iso) => setEditForm(prev => ({ ...prev, event_date: iso }))}
        />

        <div>
          <label htmlFor="event-type" className="block text-sm font-medium text-body mb-1">{t('events.details.eventType', 'Event type')}</label>
          <select
            id="event-type"
            value={editForm.event_type}
            onChange={(e) => {
              // Read now: the updater runs later, after a controlled select may have reset.
              const event_type = e.target.value;
              setEditForm(prev => ({ ...prev, event_type }));
            }}
            className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg"
          >
            {/* A type deactivated after the event was made stays the current
                value, so opening the tab changes nothing. */}
            {editForm.event_type && !types.some((type) => type.slug_prefix === editForm.event_type) && (
              <option value={editForm.event_type}>
                {t('events.details.inactiveType', { name: editForm.event_type, defaultValue: `${editForm.event_type} (inactive)` })}
              </option>
            )}
            {types.map((type) => (
              <option key={type.slug_prefix} value={type.slug_prefix}>{type.name}</option>
            ))}
          </select>
        </div>

        <CustomerFields
          values={editForm}
          phoneFieldEnabled={phoneFieldEnabled}
          onChange={(field, value) => setEditForm(prev => ({ ...prev, [field]: value }))}
        />

        {/* Customer accounts (#354). Picker self-hides when the
            customerPortal feature flag is off. */}
        <CustomerAccountPicker
          value={editForm.customer_accounts}
          onChange={(next) => setEditForm((prev) => ({ ...prev, customer_accounts: next }))}
        />

        <ExpiryField
          value={editForm.expires_at}
          onChange={(expires_at) => setEditForm(prev => ({ ...prev, expires_at }))}
          allowNever
        />
      </div>
      <AdvancedArea expert={expert}>
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.welcomeMessageLabel')}
          </label>
          <WelcomeMessageEditor
            value={editForm.welcome_message}
            onChange={(welcome_message) => setEditForm(prev => ({ ...prev, welcome_message }))}
            placeholder={t('events.welcomeMessage')}
            rows={4}
          />
        </div>
      </AdvancedArea>
    </Card>
  );
};
