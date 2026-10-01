import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '../../../components/common';
import { useInputMode } from '../../../hooks/useInputMode';
import type { Photo } from '../../../types';
import { tilePreviewUrl } from '../layout/tileImage';
import { HeartIcon, PickIcon } from '../icons';

interface GridTileProps {
  photo: Photo; width: number; height: number; x: number; y: number; priority: 'high' | 'normal';
  slug: string;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  selecting: boolean; selected: boolean; onSelect: (id: number) => void;
}

/**
 * One masonry tile. Hover is pure CSS, so moving the mouse over the grid
 * renders nothing; the tile re-renders only when its own props change, which
 * is why every handler handed in has to be stable.
 *
 * The tile itself is a plain box. Opening (or selecting) is a full-size
 * button laid over the image, and the badges are its siblings on top, so no
 * button sits inside another and each one gets Enter and Space natively.
 */
function GridTileImpl({ photo, width, height, x, y, priority, slug, onOpen, onToggle, allowLikes, allowPicks, selecting, selected, onSelect }: GridTileProps) {
  const { t } = useTranslation();
  const coarse = useInputMode() === 'touch';
  // AuthenticatedImage reports a finished load only through onLoad, so the
  // callback has to stay stable. Tiles never draw on a canvas, whatever the
  // event's protection says: hundreds of canvases exhaust iOS Safari's canvas
  // memory and the tiles go blank without an error (canvasLightboxOnly.test).
  const [loaded, setLoaded] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);

  return (
    <div
      data-testid="grid-tile"
      data-photo-id={photo.id}
      className="cg-tile"
      style={{ position: 'absolute', width, height, transform: `translate(${x}px, ${y}px)` }}
    >
      <AuthenticatedImage
        src={tilePreviewUrl(photo, width)}
        alt=""
        slug={slug}
        isGallery
        queuePriority={priority}
        onLoad={onLoad}
        decoding="async"
        draggable={false}
        className={`cg-tile-img${loaded ? ' loaded' : ''}`}
      />
      <button
        type="button"
        data-testid="tile-open"
        className="cg-tile-open"
        aria-label={photo.original_filename || photo.filename}
        aria-pressed={selecting ? selected : undefined}
        onClick={() => (selecting ? onSelect(photo.id) : onOpen(photo.id))}
      />
      <div data-testid="tile-badges" className={`cg-badges${coarse ? ' cg-badges-always' : ''}`}>
        {allowLikes && (
          <button
            type="button"
            aria-label={photo.is_liked ? t('clientGallery.unlike', 'Unlike') : t('clientGallery.like', 'Like')}
            className={`cg-badge cg-badge-like${photo.is_liked ? ' cg-badge-on' : ''}`}
            onClick={() => onToggle(photo, 'like')}
          >
            <HeartIcon filled={Boolean(photo.is_liked)} />
            {(photo.like_count ?? 0) > 0 && <span>{photo.like_count}</span>}
          </button>
        )}
        {allowPicks && !selecting && (
          <button
            type="button"
            aria-label={photo.is_favorited ? t('clientGallery.unpick', 'Unpick') : t('clientGallery.pick', 'Pick')}
            className={`cg-badge cg-badge-pick${photo.is_favorited ? ' cg-badge-on' : ''}`}
            onClick={() => onToggle(photo, 'favorite')}
          >
            <PickIcon filled={Boolean(photo.is_favorited)} />
          </button>
        )}
        {selecting && (
          <span aria-hidden className={`cg-select${selected ? ' cg-select-on' : ''}`} />
        )}
      </div>
    </div>
  );
}

export const GridTile = memo(GridTileImpl);
