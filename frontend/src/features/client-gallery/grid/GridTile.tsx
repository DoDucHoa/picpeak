import React, { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '../../../components/common';
import { useInputMode } from '../../../hooks/useInputMode';
import type { Photo } from '../../../types';
import { tilePreviewUrl } from '../layout/tileImage';
import { HeartIcon, PickIcon } from '../icons';

interface GridTileProps {
  photo: Photo; width: number; height: number; x: number; y: number; priority: 'high' | 'normal';
  slug: string; canvas: boolean;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  selecting: boolean; selectedIds: Set<number>; onSelect: (id: number) => void;
}

/**
 * One masonry tile. Hover is pure CSS, so moving the mouse over the grid
 * renders nothing; the tile re-renders only when its own props change, which
 * is why every handler handed in has to be stable.
 */
function GridTileImpl({ photo, width, height, x, y, priority, slug, canvas, onOpen, onToggle, allowLikes, allowPicks, selecting, selectedIds, onSelect }: GridTileProps) {
  const { t } = useTranslation();
  const coarse = useInputMode() === 'touch';
  // AuthenticatedImage reports a finished load only through onLoad, and the
  // canvas path keys an effect on it, so the callback has to stay stable.
  const [loaded, setLoaded] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);
  const selected = selectedIds.has(photo.id);
  const activate = () => (selecting ? onSelect(photo.id) : onOpen(photo.id));
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };

  return (
    <div
      data-testid="grid-tile"
      data-photo-id={photo.id}
      role="button"
      tabIndex={0}
      aria-label={photo.original_filename || photo.filename}
      aria-pressed={selecting ? selected : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        // A key on a badge belongs to the badge, not to the tile under it.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      }}
      className="cg-tile"
      style={{ position: 'absolute', width, height, transform: `translate(${x}px, ${y}px)` }}
    >
      <AuthenticatedImage
        src={tilePreviewUrl(photo, width)}
        alt=""
        slug={slug}
        isGallery
        useCanvasRendering={canvas}
        queuePriority={priority}
        onLoad={onLoad}
        decoding="async"
        draggable={false}
        className={`cg-tile-img${loaded ? ' loaded' : ''}`}
      />
      <div data-testid="tile-badges" className={`cg-badges${coarse ? ' cg-badges-always' : ''}`}>
        {allowLikes && (
          <button
            type="button"
            aria-label={photo.is_liked ? t('clientGallery.unlike', 'Unlike') : t('clientGallery.like', 'Like')}
            className={`cg-badge cg-badge-like${photo.is_liked ? ' cg-badge-on' : ''}`}
            onClick={stop(() => onToggle(photo, 'like'))}
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
            onClick={stop(() => onToggle(photo, 'favorite'))}
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
