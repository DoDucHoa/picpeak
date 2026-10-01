import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { Photo } from '../../../types';
import { gridGeometry, columnWidth, tileHeight } from '../layout/gridGeometry';
import { GridTile } from './GridTile';

interface MasonryGridProps {
  photos: Photo[]; slug: string; canvas: boolean;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  selecting: boolean; selectedIds: Set<number>; onSelect: (id: number) => void;
}

/**
 * The page width, read from the document rather than measured from the grid:
 * jsdom has no layout, and on first paint nothing has been measured yet, so a
 * measured width would be 0 in both places.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => document.documentElement.clientWidth || window.innerWidth);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(document.documentElement.clientWidth || window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); };
  }, []);
  return width;
}

/** The first tile (in album order) whose bottom edge is below the top of the viewport. */
function firstVisibleIndex(items: VirtualItem[], scrollTop: number): number | null {
  const visible = items.find((item) => item.end > scrollTop);
  return visible ? visible.index : null;
}

/**
 * Shortest-column masonry, windowed. Only tiles inside the viewport plus about
 * one screen of overscan exist in the DOM. Heights come from the photo's own
 * dimensions, so nothing reflows when images arrive.
 */
export function MasonryGrid({ photos, ...tileProps }: MasonryGridProps) {
  const viewport = useViewportWidth();
  const { columns, gap, padding } = gridGeometry(viewport);
  const inner = Math.max(1, viewport - padding * 2);
  const colWidth = columnWidth(inner, columns, gap);
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => { setOffset(listRef.current?.offsetTop ?? 0); }, [viewport]);

  const heights = useMemo(() => photos.map((p) => tileHeight(p, colWidth)), [photos, colWidth]);

  // Both are read by the virtualiser's memoised measurement pass, and
  // getItemKey is one of its dependencies: a fresh function every render
  // would recompute the position of every photo in the album on every scroll.
  const estimateSize = useCallback((i: number) => heights[i] + gap, [heights, gap]);
  const getItemKey = useCallback((i: number) => photos[i].id, [photos]);

  const virtualizer = useWindowVirtualizer({
    count: photos.length,
    estimateSize,
    lanes: columns,
    overscan: Math.max(6, columns * 4),
    scrollMargin: offset,
    initialRect: { width: viewport, height: window.innerHeight },
    getItemKey,
  });

  const items = virtualizer.getVirtualItems();

  // Lane count and sizes change together on a breakpoint, and the same scroll
  // offset then points at a different part of the album. Remember the first
  // visible photo of the settled layout and scroll back to it once the new
  // one is in place. A layout effect, so the jump happens before paint.
  const layout = `${columns}:${colWidth}`;
  const settled = useRef<{ layout: string; anchor: number | null }>({ layout, anchor: null });
  useLayoutEffect(() => {
    const state = settled.current;
    if (state.layout !== layout) {
      state.layout = layout;
      // Sizes are cached per key, so new widths need an explicit re-measure.
      virtualizer.measure();
      virtualizer.getTotalSize();
      if (state.anchor !== null && window.scrollY > offset) {
        virtualizer.scrollToIndex(state.anchor, { align: 'start' });
      }
      // Keep the old anchor: this render still shows the old scroll offset,
      // and the scroll it just triggered renders again with the right one.
      return;
    }
    state.anchor = firstVisibleIndex(items, window.scrollY);
  });

  return (
    <div ref={listRef} style={{ paddingLeft: padding, paddingRight: padding }}>
      <div data-testid="grid-body" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const photo = photos[item.index];
          const x = item.lane * (colWidth + gap);
          const y = item.start - virtualizer.options.scrollMargin;
          return (
            <GridTile
              key={item.key}
              photo={photo}
              width={colWidth}
              height={heights[item.index]}
              x={x}
              y={y}
              priority={item.index < columns ? 'high' : 'normal'}
              {...tileProps}
            />
          );
        })}
      </div>
    </div>
  );
}
