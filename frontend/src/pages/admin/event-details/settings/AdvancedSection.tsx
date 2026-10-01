import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { PhotoSourceFields } from './PhotoSourceFields';

/** Settings > Advanced (spec 5.1): everything here is an advanced option. */
export const AdvancedSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, expert } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAdvanced', 'Advanced')}</h2>
      <AdvancedArea expert={expert}>
        <PhotoSourceFields
          values={editForm}
          savedExternalPath={event.external_path || ''}
          onChange={(patch) => setEditForm(prev => ({ ...prev, ...patch }))}
        />
      </AdvancedArea>
    </Card>
  );
};
