import { memo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '../../../components/common';
import { thumbnailUrlForTile } from '../../../components/gallery/imageTiers';
import { useIsPhotoDelivered } from '../../../contexts/DownloadedPhotosContext';
import type { Photo } from '../../../types';
import { DeliveredIcon, EyeIcon, EyeOffIcon, HeartIcon, PickIcon } from '../icons';

interface ListRowProps {
  photo: Photo; y: number; height: number; slug: string;
  showOriginalFilename: boolean;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  /** Client mode (#172): the row shows and toggles what guests may see. */
  isClient: boolean; onToggleVisibility: (id: number, current: string) => void;
}

/** 24.3 MB style: one decimal, base 1024. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatDimensions(w?: number | null, h?: number | null): string {
  return w && h ? `${w} × ${h}` : '';
}

/**
 * One list row. The row's open action is a full-size button laid under the
 * content, and the like and pick buttons are its siblings on top, so no button
 * sits inside another and each one gets Enter and Space natively. Text cells
 * let clicks fall through to the open button; only the buttons catch them.
 */
function ListRowImpl({ photo, y, height, slug, showOriginalFilename, onOpen, onToggle, allowLikes, allowPicks, isClient, onToggleVisibility }: ListRowProps) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const delivered = useIsPhotoDelivered(photo.id);
  const onLoad = useCallback(() => setLoaded(true), []);
  const name = showOriginalFilename && photo.original_filename ? photo.original_filename : photo.filename;
  const thumbSrc = thumbnailUrlForTile(photo.thumbnail_url, photo, 80);
  const hidden = isClient && photo.visibility === 'hidden';

  return (
    <div
      data-testid="list-row"
      data-photo-id={photo.id}
      className={`cg-row${hidden ? ' cg-row-hidden' : ''}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height, transform: `translateY(${y}px)` }}
    >
      <button
        type="button"
        data-testid="row-open"
        className="cg-row-open"
        aria-label={name}
        onClick={() => onOpen(photo.id)}
      />
      {/* Without a thumbnail the cell stays a placeholder box: an 80px cell
          never pulls the original. */}
      <div className="cg-row-thumb" data-testid="row-thumb">
        {thumbSrc && (
          <AuthenticatedImage
            src={thumbSrc}
            alt=""
            slug={slug}
            isGallery
            queuePriority="normal"
            onLoad={onLoad}
            decoding="async"
            draggable={false}
            className={`cg-tile-img${loaded ? ' loaded' : ''}`}
          />
        )}
        {delivered && (
          <span data-testid="photo-delivered-mark" className="cg-delivered" role="img" aria-label={t('gallery.downloadQuota.delivered', 'Already downloaded')}>
            <DeliveredIcon />
          </span>
        )}
        {hidden && (
          <span data-testid="hidden-mark" className="cg-hidden-mark" role="img" aria-label={t('clientAccess.hiddenFromGuests', 'Hidden from guests')}>
            <EyeOffIcon />
          </span>
        )}
      </div>
      <div className="cg-row-name">{name}</div>
      <div className="cg-row-dim">{formatDimensions(photo.width, photo.height)}</div>
      <div className="cg-row-size">{formatBytes(photo.size)}</div>
      <div className="cg-row-actions">
        {allowLikes && (
          <button
            type="button"
            aria-label={photo.is_liked ? t('clientGallery.unlike', 'Unlike') : t('clientGallery.like', 'Like')}
            className={`cg-row-btn cg-badge-like${photo.is_liked ? ' cg-badge-on' : ''}`}
            onClick={() => onToggle(photo, 'like')}
          >
            <HeartIcon filled={Boolean(photo.is_liked)} />
            {(photo.like_count ?? 0) > 0 && <span>{photo.like_count}</span>}
          </button>
        )}
        {allowPicks && (
          <button
            type="button"
            aria-label={photo.is_favorited ? t('clientGallery.unpick', 'Unpick') : t('clientGallery.pick', 'Pick')}
            className={`cg-row-btn cg-badge-pick${photo.is_favorited ? ' cg-badge-on' : ''}`}
            onClick={() => onToggle(photo, 'favorite')}
          >
            <PickIcon filled={Boolean(photo.is_favorited)} />
          </button>
        )}
        {isClient && (
          <button
            type="button"
            aria-label={hidden ? t('clientAccess.showToGuests', 'Show to guests') : t('clientAccess.hideFromGuests', 'Hide from guests')}
            className={`cg-row-btn${hidden ? ' cg-visibility-hidden' : ''}`}
            onClick={() => onToggleVisibility(photo.id, photo.visibility || 'visible')}
          >
            {hidden ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

export const ListRow = memo(ListRowImpl);
