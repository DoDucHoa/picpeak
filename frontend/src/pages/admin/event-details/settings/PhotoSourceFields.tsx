import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../../../../hooks/usePermission';
import { ExternalFolderPicker } from '../ExternalFolderPicker';

export interface PhotoSourceValues {
  source_mode: 'managed' | 'reference';
  external_path: string;
  external_watch: boolean;
  photo_cap: number;
  default_photo_sort: string;
}

/**
 * Where the photos come from, the photo limit and the default sort (spec
 * 5.1, 5.5), the same on the create screen and in Settings > Advanced.
 */
export const PhotoSourceFields: React.FC<{
  values: PhotoSourceValues;
  onChange: (patch: Partial<PhotoSourceValues>) => void;
  /** The folder the saved event points at, restored when reference is picked again. */
  savedExternalPath?: string;
  folderError?: string;
}> = ({ values, onChange, savedExternalPath = '', folderError }) => {
  const { t } = useTranslation();
  const id = useId();
  // Enabling the watcher makes the server import on the admin's behalf, which
  // the backend gates on photos.upload like the Import button.
  const canEnableWatch = usePermission('photos.upload');
  const selectClass = 'w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark';
  return (
    <>
      <div>
        <label htmlFor={`${id}-source`} className="block text-sm font-medium text-body mb-1">
          {t('events.sourceMode', 'Source Mode')}
        </label>
        <select
          id={`${id}-source`}
          value={values.source_mode}
          onChange={(e) => {
            // Named `sourceMode`, not `mode`: the i18n extractor's TS
            // resolver matches locals by name across the whole file.
            const sourceMode = e.target.value as 'managed' | 'reference';
            onChange({
              source_mode: sourceMode,
              external_path: sourceMode === 'reference' ? (values.external_path || savedExternalPath) : '',
            });
          }}
          className={selectClass}
        >
          <option value="managed">{t('events.sourceModeManaged', 'Managed (upload to PicPeak)')}</option>
          <option value="reference">{t('events.sourceModeReference', 'Reference external folder')}</option>
        </select>
        <p className="text-xs text-muted mt-1">
          {t('events.sourceModeHelp', 'Use managed mode for direct uploads or reference an external folder that is mounted at /external-media in Docker.')}
        </p>
      </div>

      {values.source_mode === 'reference' && (
        <div className="mt-3">
          <span className="block text-sm font-medium text-body mb-2">
            {t('events.externalFolder', 'External Folder')}
          </span>
          <ExternalFolderPicker
            value={values.external_path || ''}
            onChange={(folder) => onChange({ external_path: folder })}
          />
          {folderError && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">{folderError}</p>}
          <p className="text-xs text-muted mt-1">
            {t('events.externalFolderHint', 'These folders come from the /external-media mount inside the container. Ensure it is accessible to the backend process.')}
          </p>
          <label className={`flex items-start gap-2 mt-3 ${canEnableWatch || values.external_watch ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-line-strong text-accent focus:ring-primary-500"
              checked={values.external_watch === true}
              disabled={!canEnableWatch && !values.external_watch}
              onChange={(e) => onChange({ external_watch: e.target.checked })}
            />
            <span className="text-sm">
              <span className="font-medium text-heading">
                {t('events.externalWatch', 'Watch folder for new files')}
              </span>
              <span className="block text-xs text-muted mt-0.5">
                {t('events.externalWatchHint', 'New images copied into this folder are imported automatically, the same way the Import button does it. Files removed from the folder are never deleted from the gallery.')}
              </span>
              {!canEnableWatch && !values.external_watch && (
                <span className="block text-xs text-muted mt-0.5">
                  {t('events.externalWatchNoPermission', 'Requires the permission to upload photos.')}
                </span>
              )}
            </span>
          </label>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-cap`} className="block text-sm font-medium text-body mb-1">
          {t('events.photoCap', 'Photo Limit')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-cap`}
            type="number"
            value={values.photo_cap}
            onChange={(e) => onChange({ photo_cap: parseInt(e.target.value) || 0 })}
            min={0}
            // events.photo_cap is a signed 32-bit int (migration 074). Without
            // an explicit max, input[type=number] reports aria-valuemax="0",
            // and an out-of-range value only fails at INSERT.
            max={2147483647}
            className="w-24 px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
          />
          <span className="text-xs text-muted">
            {t('events.photoCapHelp', 'Maximum number of photos allowed. 0 = unlimited')}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-sort`} className="block text-sm font-medium text-body mb-1">
          {t('photoSort.defaultSort', 'Default Photo Sort')}
        </label>
        <select
          id={`${id}-sort`}
          value={values.default_photo_sort}
          onChange={(e) => onChange({ default_photo_sort: e.target.value })}
          className={selectClass}
        >
          <option value="upload_date_desc">{t('photoSort.uploadDateNewest', 'Upload Date (Newest First)')}</option>
          <option value="upload_date_asc">{t('photoSort.uploadDateOldest', 'Upload Date (Oldest First)')}</option>
          <option value="capture_date_desc">{t('photoSort.captureDateNewest', 'Date Taken (Newest First)')}</option>
          <option value="capture_date_asc">{t('photoSort.captureDateOldest', 'Date Taken (Oldest First)')}</option>
          <option value="filename_asc">{t('photoSort.filenameAZ', 'Filename (A-Z)')}</option>
          <option value="filename_desc">{t('photoSort.filenameZA', 'Filename (Z-A)')}</option>
        </select>
      </div>
    </>
  );
};
