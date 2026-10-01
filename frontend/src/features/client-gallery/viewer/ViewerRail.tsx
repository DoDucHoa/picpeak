import { useTranslation } from 'react-i18next';
import { stopNavigationEventsPropagation } from 'yet-another-react-lightbox';
import { useDownloadPhoto } from '../../../hooks/useGallery';
import { useRefreshDownloadQuota } from '../../../hooks/useDownloadQuota';
import { canDownloadPhotoNow } from '../../../components/gallery/downloadQuotaOffer';
import { analyticsService } from '../../../services/analytics.service';
import type { Photo } from '../../../types';
import type { GalleryController } from '../state/useGalleryController';
import { BackIcon, CommentIcon, DownloadIcon, HeartIcon, InfoIcon, PickIcon } from '../icons';

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
  const downloadPhoto = useDownloadPhoto();
  const refreshDownloadQuota = useRefreshDownloadQuota();

  const fs = c.feedbackSettings;
  const feedbackOn = Boolean(fs?.feedback_enabled);
  const allowLikes = feedbackOn && Boolean(fs?.allow_likes);
  const allowPicks = feedbackOn && Boolean(fs?.allow_favorites);
  const allowComments = feedbackOn && Boolean(fs?.allow_comments);
  const allowDownload = c.allowDownloads && photo.category_allow_downloads !== false;

  const togglePanel = (next: ViewerPanel) => onPanel(panel === next ? null : next);

  const download = () => {
    const gate = c.downloadGate;
    // Predicted from what the server last said, so a click that would only be
    // refused opens the offer straight away instead of making a round trip.
    if (!canDownloadPhotoNow(photo.id, gate.quotaEnabled, gate.isClient, gate.remaining, gate.downloadedIds)) {
      if (gate.isClient) gate.offerForBlockedDownload();
      else gate.notifyGuestBlocked();
      return;
    }
    analyticsService.trackDownload(photo.id, c.slug, false);
    downloadPhoto.mutate(
      { slug: c.slug, photoId: photo.id, filename: photo.filename },
      {
        onSuccess: () => refreshDownloadQuota(c.slug),
        onError: (error) => { void gate.reportDownloadFailure(error); },
      },
    );
  };

  return (
    <nav className="cg-viewer-rail" {...stopNavigationEventsPropagation()}>
      <button type="button" className="cg-viewer-btn cg-viewer-back" aria-label={t('clientGallery.viewer.back', 'Back')} onClick={onBack}>
        <BackIcon />
      </button>
      {allowLikes && (
        <button
          type="button"
          className={`cg-viewer-btn${photo.is_liked ? ' cg-viewer-liked' : ''}`}
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
      <span className="cg-viewer-divider" aria-hidden="true" />
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
        <button type="button" className="cg-viewer-btn" aria-label={t('clientGallery.viewer.download', 'Download')} onClick={download}>
          <DownloadIcon />
        </button>
      )}
    </nav>
  );
}
