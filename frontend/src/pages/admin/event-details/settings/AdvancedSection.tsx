import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { usePermission } from '../../../../hooks/usePermission';
import { ExternalFolderPicker } from '../ExternalFolderPicker';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

/** Settings > Advanced (spec 5.1): everything here is an advanced option. */
export const AdvancedSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, expert } = useEventSettings();
  // Enabling the watcher makes the server import on the admin's behalf, which
  // the backend gates on photos.upload like the Import button.
  const canEnableWatch = usePermission('photos.upload');
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAdvanced', 'Advanced')}</h2>
      <AdvancedArea expert={expert}>
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.sourceMode', 'Source Mode')}
          </label>
          <select
            value={editForm.source_mode}
            onChange={(e) => {
              // Named `sourceMode`, not `mode`: the i18n extractor's TS
              // resolver matches locals by name across the whole file, so a
              // local called `mode` here leaked 'managed' | 'reference' into
              // the promo/info banner mode_ templates further down and had it
              // emit four phantom keys that the code can never request.
              const sourceMode = e.target.value as 'managed' | 'reference';
              setEditForm(prev => ({
                ...prev,
                source_mode: sourceMode,
                external_path: sourceMode === 'reference'
                  ? (prev.external_path || event.external_path || '')
                  : ''
              }));
            }}
            className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
          >
            <option value="managed">{t('events.sourceModeManaged', 'Managed (upload to PicPeak)')}</option>
            <option value="reference">{t('events.sourceModeReference', 'Reference external folder')}</option>
          </select>
          <p className="text-xs text-muted mt-1">
            {t('events.sourceModeHelp', 'Use managed mode for direct uploads or reference an external folder that is mounted at /external-media in Docker.')}
          </p>
        </div>

        {editForm.source_mode === 'reference' && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-body mb-2">
              {t('events.externalFolder', 'External Folder')}
            </label>
            <ExternalFolderPicker
              value={editForm.external_path || ''}
              onChange={(folder) => setEditForm(prev => ({ ...prev, external_path: folder }))}
            />
            <p className="text-xs text-muted mt-1">
              {t('events.externalFolderHint', 'These folders come from the /external-media mount inside the container. Ensure it is accessible to the backend process.')}
            </p>
            <label className={`flex items-start gap-2 mt-3 ${canEnableWatch || editForm.external_watch ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                className="mt-0.5 rounded border-line-strong text-accent focus:ring-primary-500"
                checked={editForm.external_watch === true}
                disabled={!canEnableWatch && !editForm.external_watch}
                onChange={(e) => setEditForm(prev => ({ ...prev, external_watch: e.target.checked }))}
              />
              <span className="text-sm">
                <span className="font-medium text-heading">
                  {t('events.externalWatch', 'Watch folder for new files')}
                </span>
                <span className="block text-xs text-muted mt-0.5">
                  {t('events.externalWatchHint', 'New images copied into this folder are imported automatically, the same way the Import button does it. Files removed from the folder are never deleted from the gallery.')}
                </span>
                {!canEnableWatch && !editForm.external_watch && (
                  <span className="block text-xs text-muted mt-0.5">
                    {t('events.externalWatchNoPermission', 'Requires the permission to upload photos.')}
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        {/* Photo Cap */}
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('events.photoCap', 'Photo Limit')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={editForm.photo_cap}
              onChange={(e) => setEditForm(prev => ({ ...prev, photo_cap: parseInt(e.target.value) || 0 }))}
              min={0}
              // events.photo_cap is a signed 32-bit int (migration 074).
              // Without an explicit max, input[type=number] reports
              // aria-valuemax="0", and an out-of-range value only fails at
              // INSERT.
              max={2147483647}
              className="w-24 px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
            />
            <span className="text-xs text-muted">
              {t('events.photoCapHelp', 'Maximum number of photos allowed. 0 = unlimited')}
            </span>
          </div>
        </div>

        {/* Default Photo Sort */}
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            {t('photoSort.defaultSort', 'Default Photo Sort')}
          </label>
          <select
            value={editForm.default_photo_sort}
            onChange={(e) => setEditForm(prev => ({ ...prev, default_photo_sort: e.target.value }))}
            className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
          >
            <option value="upload_date_desc">{t('photoSort.uploadDateNewest', 'Upload Date (Newest First)')}</option>
            <option value="upload_date_asc">{t('photoSort.uploadDateOldest', 'Upload Date (Oldest First)')}</option>
            <option value="capture_date_desc">{t('photoSort.captureDateNewest', 'Date Taken (Newest First)')}</option>
            <option value="capture_date_asc">{t('photoSort.captureDateOldest', 'Date Taken (Oldest First)')}</option>
            <option value="filename_asc">{t('photoSort.filenameAZ', 'Filename (A-Z)')}</option>
            <option value="filename_desc">{t('photoSort.filenameZA', 'Filename (Z-A)')}</option>
          </select>
        </div>
      </AdvancedArea>
    </Card>
  );
};
