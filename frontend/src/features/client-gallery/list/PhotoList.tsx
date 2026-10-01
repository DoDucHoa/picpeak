import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Photo } from '../../../types';
import { gridGeometry } from '../layout/gridGeometry';
import { useDocumentTop } from '../layout/useDocumentTop';
import { useViewportWidth } from '../layout/useViewportWidth';
import { ListRow } from './ListRow';

interface PhotoListProps {
  photos: Photo[]; slug: string;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  showOriginalFilename: boolean;
  isClient: boolean; onToggleVisibility: (id: number, current: string) => void;
}

const ROW_HEIGHT = 150;

/**
 * The album as a table: thumbnail, name, dimensions, size and the like and
 * pick actions. Windowed like the grid, so only rows near the viewport exist.
 * Rows have a fixed height, which keeps the whole list's height known up front.
 */
export function PhotoList({ photos, ...rowProps }: PhotoListProps) {
  const { t } = useTranslation();
  const viewport = useViewportWidth();
  const { padding } = gridGeometry(viewport);
  const listRef = useRef<HTMLDivElement>(null);
  const offset = useDocumentTop(listRef);

  // Same reasoning as the grid: keys must not change with the array's
  // identity, and a changed order needs an explicit re-measure.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const getItemKey = useCallback((i: number) => photosRef.current[i].id, []);
  const estimateSize = useCallback(() => ROW_HEIGHT, []);

  const virtualizer = useWindowVirtualizer({
    count: photos.length,
    estimateSize,
    overscan: 6,
    scrollMargin: offset,
    initialRect: { width: viewport, height: window.innerHeight },
    getItemKey,
  });

  const idOrder = useMemo(() => photos.map((p) => p.id).join(','), [photos]);
  const measuredOrder = useRef(idOrder);
  useLayoutEffect(() => {
    if (measuredOrder.current === idOrder) return;
    measuredOrder.current = idOrder;
    virtualizer.measure();
  }, [idOrder, virtualizer]);

  return (
    <div ref={listRef} data-testid="photo-list" style={{ paddingLeft: padding, paddingRight: padding }}>
      <div className="cg-row-head" role="presentation">
        <span className="cg-row-head-thumb" />
        <span>{t('clientGallery.viewer.fileName', 'File name')}</span>
        <span className="cg-row-dim">{t('clientGallery.viewer.dimensions', 'Dimensions')}</span>
        <span className="cg-row-size">{t('clientGallery.viewer.size', 'Size')}</span>
        <span className="cg-row-actions">{t('clientGallery.list.action', 'Action')}</span>
      </div>
      <div data-testid="list-body" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => (
          <ListRow
            key={item.key}
            photo={photos[item.index]}
            y={item.start - virtualizer.options.scrollMargin}
            height={ROW_HEIGHT}
            {...rowProps}
          />
        ))}
      </div>
    </div>
  );
}
