import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { stopNavigationEventsPropagation } from 'yet-another-react-lightbox';
import { AuthenticatedImage } from '../../../components/common';
import { thumbnailUrlForTile } from '../../../components/gallery/imageTiers';
import type { Photo } from '../../../types';

const THUMB = 56;
const GAP = 6;
const HEIGHT = 72;

interface FilmstripProps {
  photos: Photo[]; openId: number | null; slug: string; canvas: boolean;
  onNavigate: (id: number) => void;
}

/**
 * The strip of thumbnails along the bottom of the viewer. Windowed over its
 * own scroll container, so a 2000 photo album mounts a screenful of thumbnails
 * rather than all of them. The open photo is kept in the middle.
 */
export function Filmstrip({ photos, openId, slug, canvas, onNavigate }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable for the same reason as in MasonryGrid: both are dependencies of the
  // virtualiser's measurement pass, and a like toggle replaces the photo
  // objects without changing their order.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const getItemKey = useCallback((i: number) => photosRef.current[i].id, []);
  const estimateSize = useCallback(() => THUMB + GAP, []);

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: photos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: 8,
    initialRect: { width: window.innerWidth, height: HEIGHT },
  });

  const index = openId === null ? -1 : photos.findIndex((p) => p.id === openId);
  useEffect(() => {
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' });
  }, [index, virtualizer]);

  return (
    <div ref={scrollRef} className="cg-filmstrip" data-testid="filmstrip" {...stopNavigationEventsPropagation()}>
      <div style={{ position: 'relative', width: virtualizer.getTotalSize(), height: '100%' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const photo = photos[item.index];
          const current = item.index === index;
          return (
            <button
              key={item.key}
              type="button"
              data-testid="filmstrip-thumb"
              data-photo-id={photo.id}
              aria-current={current ? 'true' : undefined}
              aria-label={photo.filename}
              className={`cg-filmstrip-thumb${current ? ' cg-filmstrip-current' : ''}`}
              style={{ width: THUMB, height: THUMB, transform: `translateX(${item.start}px)` }}
              onClick={() => onNavigate(photo.id)}
            >
              <AuthenticatedImage
                src={thumbnailUrlForTile(photo.thumbnail_url, photo, THUMB) || photo.url}
                alt=""
                slug={slug}
                isGallery
                useCanvasRendering={canvas}
                queuePriority="normal"
                decoding="async"
                draggable={false}
                className="cg-filmstrip-img"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
