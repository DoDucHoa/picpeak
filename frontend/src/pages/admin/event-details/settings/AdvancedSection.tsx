import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { useEventSettings } from './EventSettingsContext';
import { PhotoSourceFields } from './PhotoSourceFields';

/**
 * Settings > Photos & sorting (spec 5.1): where the photos come from, how many
 * the gallery takes and the order guests see them in. Always open: the
 * section holds nothing else, so a "Show advanced options" row here would only
 * hide the whole section behind one more click.
 */
export const AdvancedSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionPhotos', 'Photos & sorting')}</h2>
      <div className="space-y-4">
        <PhotoSourceFields
          values={editForm}
          savedExternalPath={event.external_path || ''}
          onChange={(patch) => setEditForm(prev => ({ ...prev, ...patch }))}
        />
      </div>
    </Card>
  );
};
