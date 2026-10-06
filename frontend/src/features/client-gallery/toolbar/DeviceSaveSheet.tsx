import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { DeviceSave } from '../state/useDeviceSave';
import { DownloadIcon } from '../icons';

interface DeviceSaveSheetProps {
  deviceSave: DeviceSave;
}

/**
 * Progress of a save to the phone, and the tap iOS asks for between batches.
 *
 * Portalled to <body> and mounted only while a run is going: the photo
 * viewer marks every sibling of its own portal inert when it opens, and a
 * node added after that stays reachable, so the Save button also works on
 * top of the viewer.
 */
export function DeviceSaveSheet({ deviceSave }: DeviceSaveSheetProps) {
  const { t } = useTranslation();
  const { sheet } = deviceSave;
  if (!sheet || typeof document === 'undefined') return null;

  const ready = sheet.phase === 'ready';
  const fraction = sheet.total > 0 ? sheet.done / sheet.total : 0;
  const title = ready
    ? t('clientGallery.deviceSave.readyTitle', 'Ready to save')
    : sheet.mode === 'photos'
      ? t('clientGallery.deviceSave.preparingTitle', 'Preparing your photos')
      : t('clientGallery.deviceSave.downloadingTitle', 'Downloading your photos');

  return createPortal(
    <div className="cg-tokens cg-save-sheet" role="dialog" aria-live="polite" aria-label={title} data-testid="device-save-sheet">
      <div className="cg-save-sheet-head">
        <strong>{title}</strong>
        {sheet.batchCount > 1 && (
          <span className="cg-save-sheet-batch">
            {t('clientGallery.deviceSave.batch', 'Batch {{index}} of {{batches}}', {
              index: sheet.batchIndex + 1, batches: sheet.batchCount,
            })}
          </span>
        )}
      </div>

      {ready ? (
        <>
          <p className="cg-save-sheet-line">
            {sheet.from === sheet.to
              ? t('clientGallery.deviceSave.single', 'Photo {{index}} of {{total}}', { index: sheet.from, total: sheet.total })
              : t('clientGallery.deviceSave.range', 'Photos {{from}} to {{to}} of {{total}}', {
                from: sheet.from, to: sheet.to, total: sheet.total,
              })}
          </p>
          <p className="cg-save-sheet-hint">
            {sheet.dismissed && (
              <>{t('clientGallery.deviceSave.dismissed', 'Nothing was saved yet.')}{' '}</>
            )}
            {t('clientGallery.deviceSave.hint', 'In the menu that opens, tap Save Image.')}
          </p>
          <div className="cg-save-sheet-actions">
            <button type="button" className="cg-save-sheet-stop" onClick={deviceSave.stop}>
              {t('clientGallery.deviceSave.stop', 'Stop')}
            </button>
            <button type="button" className="cg-save-sheet-save" onClick={deviceSave.confirm} autoFocus>
              <DownloadIcon />
              {t('clientGallery.deviceSave.save', 'Save to Photos')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="cg-save-sheet-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={sheet.total}
            aria-valuenow={sheet.done}
          >
            <span style={{ width: `${Math.round(fraction * 100)}%` }} />
          </div>
          <div className="cg-save-sheet-actions">
            <span className="cg-save-sheet-line">
              {t('clientGallery.deviceSave.progress', '{{done}} of {{total}}', { done: sheet.done, total: sheet.total })}
            </span>
            <button type="button" className="cg-save-sheet-stop" onClick={deviceSave.stop}>
              {t('clientGallery.deviceSave.stop', 'Stop')}
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
