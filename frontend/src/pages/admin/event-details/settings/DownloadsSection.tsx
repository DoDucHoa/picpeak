import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Shield } from 'lucide-react';
import { Card } from '../../../../components/common';
import { PermissionGate } from '../../../../components/admin/PermissionGate';
import { DownloadQuotaCard } from '../../../../components/admin/DownloadQuotaCard';
import { DownloadResolutionCard } from '../../../../components/admin/DownloadResolutionCard';
import { changesFor } from '../draft/eventDraft';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/**
 * Settings > Downloads (spec 5.1). Allow downloads, the allowance switches,
 * and in the advanced area the amounts, create order and the resolution;
 * the allowance and resolution edit the draft like every other field.
 */
export const DownloadsSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, draft, expert } = useEventSettings();
  const values = (part: 'quota' | 'resolution') => changesFor(draft.state, part);
  const onChange = (part: 'quota' | 'resolution') => (name: string, value: unknown, serverValue: unknown) =>
    draft.set(part, name, value, serverValue);
  // Follows the drafted switch, so turning downloads off greys the cards before saving.
  const downloadsDisabled = !editForm.allow_downloads;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDownloads', 'Downloads')}</h2>
          {/* Download Protection Settings */}
          <div className="mt-4 pt-4 border-t border-line">
            <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              {t('events.downloadProtection', 'Download Protection')}
            </h3>
  
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={editForm.allow_downloads}
                  onChange={(e) => setEditForm(prev => ({ ...prev, allow_downloads: e.target.checked }))}
                  className="w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
                />
                <Download className="w-4 h-4 ml-2 mr-1 text-muted" />
                <span className="text-sm text-body">{t('events.allowDownloads', 'Allow photo downloads')}</span>
              </label>
  
              <p className="text-xs text-muted mt-2">
                {t('events.protectionInfo', 'Protection features help prevent unauthorized downloads but cannot block all methods.')}
              </p>
            </div>
          </div>
      <PermissionGate permissions={['events.view', 'events.edit']}>
        <DownloadQuotaCard
          eventId={event.id}
          part="switches"
          downloadsDisabled={downloadsDisabled}
          draftValues={values('quota')}
          onDraftChange={onChange('quota')}
        />
      </PermissionGate>
      <AdvancedArea expert={expert}>
        <PermissionGate permissions={['events.view', 'events.edit']}>
          <DownloadQuotaCard
            eventId={event.id}
            part="amounts"
            downloadsDisabled={downloadsDisabled}
            draftValues={values('quota')}
            onDraftChange={onChange('quota')}
          />
        </PermissionGate>
        <DownloadResolutionCard
          eventId={event.id}
          downloadsDisabled={downloadsDisabled}
          draftValues={values('resolution')}
          onDraftChange={onChange('resolution')}
        />
      </AdvancedArea>
    </Card>
  );
};
