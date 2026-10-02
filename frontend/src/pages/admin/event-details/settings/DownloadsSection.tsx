import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { PermissionGate } from '../../../../components/admin/PermissionGate';
import { DownloadQuotaCard } from '../../../../components/admin/DownloadQuotaCard';
import { DownloadResolutionCard } from '../../../../components/admin/DownloadResolutionCard';
import { DownloadsDisabledNotice } from '../../../../components/admin/DownloadsDisabledNotice';
import { SettingRow } from '../../../../components/admin/SettingRow';
import { Switch } from '../../../../features/settings/components/Switch';
import { changesFor } from '../draft/eventDraft';
import { useEventSettings } from './EventSettingsContext';

const GroupHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mt-6 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h3>
);

/**
 * Settings > Downloads (spec 5.1) as one settings list: the master switch on
 * top, then the allowance and the resolution, each a group of rows. Nothing
 * hides behind an advanced toggle, because every row here sits under the
 * switch that governs it. The allowance and resolution edit the draft like
 * every other field.
 */
export const DownloadsSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, draft } = useEventSettings();
  const values = (part: 'quota' | 'resolution') => changesFor(draft.state, part);
  const onChange = (part: 'quota' | 'resolution') => (name: string, value: unknown, serverValue: unknown) =>
    draft.set(part, name, value, serverValue);
  // Follows the drafted switch, so turning downloads off greys the groups before saving.
  const downloadsDisabled = !editForm.allow_downloads;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading">{t('events.settings.sectionDownloads', 'Downloads')}</h2>

      <GroupHeading>{t('events.downloadProtection', 'Download Protection')}</GroupHeading>
      <SettingRow
        label={t('events.allowDownloads', 'Allow photo downloads')}
        description={t('events.protectionInfo', 'Protection features help prevent unauthorized downloads but cannot block all methods.')}
        control={
          <Switch
            checked={!!editForm.allow_downloads}
            onChange={(next) => setEditForm(prev => ({ ...prev, allow_downloads: next }))}
            ariaLabel={t('events.allowDownloads', 'Allow photo downloads') as string}
          />
        }
      />
      {downloadsDisabled && <DownloadsDisabledNotice />}

      <PermissionGate permissions={['events.view', 'events.edit']}>
        <GroupHeading>{t('downloadQuotaAdmin.card.title', 'Download allowance')}</GroupHeading>
        <DownloadQuotaCard
          eventId={event.id}
          part="settings"
          bare
          downloadsDisabled={downloadsDisabled}
          draftValues={values('quota')}
          onDraftChange={onChange('quota')}
        />
      </PermissionGate>

      <GroupHeading>{t('settings.downloads.eventTitle', 'Download resolution')}</GroupHeading>
      <p className="mt-2 text-xs text-muted">
        {t('settings.downloads.eventIntro',
          'Override the site-wide download settings for this gallery only. "Inherit" follows Settings → Download resolutions.')}
      </p>
      <DownloadResolutionCard
        eventId={event.id}
        bare
        downloadsDisabled={downloadsDisabled}
        draftValues={values('resolution')}
        onDraftChange={onChange('resolution')}
      />
    </Card>
  );
};
