import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { stopNavigationEventsPropagation } from 'yet-another-react-lightbox';
import { galleryService } from '../../../services/gallery.service';
import { useRefreshDownloadQuota } from '../../../hooks/useDownloadQuota';
import { canDownloadPhotoNow } from '../../../components/gallery/downloadQuotaOffer';
import { analyticsService } from '../../../services/analytics.service';
import type { Photo } from '../../../types';
import type { GalleryController } from '../state/useGalleryController';
import { BackIcon, CommentIcon, DownloadIcon, HeartIcon, InfoIcon, PickIcon, ProgressRing } from '../icons';
import {
  finishPhotoDownload, isPhotoDownloading, startPhotoDownload, updatePhotoDownload, usePhotoDownloadProgress,
} from '../state/photoDownloadProgress';

export type ViewerPanel = 'comments' | 'info';

interface ViewerRailProps {
  photo: Photo;
  c: GalleryController;
  panel: ViewerPanel | null;
  onPanel: (panel: ViewerPanel | null) => void;
  onBack: () => void;
  onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
}

/**
 * The viewer's controls: a column at the left on desktop, a bar along the top
 * on a phone. Each reaction shows only when the event's feedback settings
 * allow it, and Download only when the gallery and the photo's category do.
 */
export function ViewerRail({ photo, c, panel, onPanel, onBack, onToggle }: ViewerRailProps) {
  const { t } = useTranslation();
  const refreshDownloadQuota = useRefreshDownloadQuota();
  const downloadProgress = usePhotoDownloadProgress(photo.id);
  const downloading = downloadProgress !== undefined;
  const fraction = downloadProgress ?? null;

  const fs = c.feedbackSettings;
  const feedbackOn = Boolean(fs?.feedback_enabled);
  const allowLikes = feedbackOn && Boolean(fs?.allow_likes);
  const allowPicks = feedbackOn && Boolean(fs?.allow_favorites);
  const allowComments = feedbackOn && Boolean(fs?.allow_comments);
  const allowDownload = c.allowDownloads && photo.category_allow_downloads !== false;

  const togglePanel = (next: ViewerPanel) => onPanel(panel === next ? null : next);

  const download = () => {
    // A second tap while the photo is on its way would fetch it twice.
    if (isPhotoDownloading(photo.id)) return;
    const gate = c.downloadGate;
    // Predicted from what the server last said, so a click that would only be
    // refused opens the offer straight away instead of making a round trip.
    if (!canDownloadPhotoNow(photo.id, gate.quotaEnabled, gate.isClient, gate.remaining, gate.downloadedIds)) {
      if (gate.isClient) gate.offerForBlockedDownload();
      else gate.notifyGuestBlocked();
      return;
    }
    analyticsService.trackDownload(photo.id, c.slug, false);
    const { id, filename } = photo;
    const slug = c.slug;
    startPhotoDownload(id);
    galleryService.downloadPhoto(slug, id, filename, (fraction) => updatePhotoDownload(id, fraction))
      .then(() => {
        toast.success(t('clientGallery.viewer.downloaded', 'Photo downloaded'));
        refreshDownloadQuota(slug);
      })
      .catch(async (error) => {
        // A refusal for role or allowance is answered by the gate (the quota
        // dialog, or a "clients only" notice); only anything else gets the
        // generic message.
        if (!(await gate.reportDownloadFailure(error))) {
          toast.error(t('clientGallery.viewer.downloadFailed', 'Could not download the photo'));
        }
      })
      .finally(() => finishPhotoDownload(id));
  };

  const downloadLabel = downloading
    ? t('clientGallery.viewer.downloading', 'Downloading')
    : t('clientGallery.viewer.download', 'Download');

  return (
    <nav className="cg-viewer-rail" data-testid="viewer-rail" {...stopNavigationEventsPropagation()}>
      <button type="button" className="cg-viewer-btn cg-viewer-back" aria-label={t('clientGallery.viewer.back', 'Back')} onClick={onBack}>
        <BackIcon />
      </button>
      {allowLikes && (
        <button
          type="button"
          className="cg-viewer-btn"
          aria-label={photo.is_liked ? t('clientGallery.unlike', 'Unlike') : t('clientGallery.like', 'Like')}
          aria-pressed={Boolean(photo.is_liked)}
          onClick={() => onToggle(photo, 'like')}
        >
          <HeartIcon filled={Boolean(photo.is_liked)} />
        </button>
      )}
      {allowPicks && (
        <button
          type="button"
          className="cg-viewer-btn"
          aria-label={photo.is_favorited ? t('clientGallery.unpick', 'Unpick') : t('clientGallery.pick', 'Pick')}
          aria-pressed={Boolean(photo.is_favorited)}
          onClick={() => onToggle(photo, 'favorite')}
        >
          <PickIcon filled={Boolean(photo.is_favorited)} />
        </button>
      )}
      {/* The divider separates the reactions from the tools, so it goes when there are none. */}
      {(allowLikes || allowPicks) && <span className="cg-viewer-divider" data-testid="viewer-divider" aria-hidden="true" />}
      {allowComments && (
        <button
          type="button"
          className={`cg-viewer-btn${panel === 'comments' ? ' cg-viewer-btn-on' : ''}`}
          aria-label={t('clientGallery.viewer.comments', 'Comments')}
          aria-pressed={panel === 'comments'}
          onClick={() => togglePanel('comments')}
        >
          <CommentIcon />
        </button>
      )}
      <button
        type="button"
        className={`cg-viewer-btn${panel === 'info' ? ' cg-viewer-btn-on' : ''}`}
        aria-label={t('clientGallery.viewer.fileInfo', 'File info')}
        aria-pressed={panel === 'info'}
        onClick={() => togglePanel('info')}
      >
        <InfoIcon />
      </button>
      {allowDownload && (
        <button
          type="button"
          className={`cg-viewer-btn${downloading ? ' cg-viewer-btn-busy' : ''}`}
          aria-label={downloadLabel}
          aria-busy={downloading}
          disabled={downloading}
          onClick={download}
        >
          {downloading ? (
            <>
              <ProgressRing fraction={fraction} />
              {fraction !== null && (
                <span className="cg-viewer-progress" data-testid="viewer-download-progress">
                  {Math.round(fraction * 100)}%
                </span>
              )}
            </>
          ) : <DownloadIcon />}
        </button>
      )}
    </nav>
  );
}
