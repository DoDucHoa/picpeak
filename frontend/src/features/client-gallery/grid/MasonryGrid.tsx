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

/**
 * Where the grid starts in the document, which the window virtualiser needs as
 * its scroll margin. Content above the grid (a cover, a banner, a folder bar)
 * can change height without the window resizing, and every such change moves
 * the grid. Observing document.body catches all of them in one place: any
 * height change above the grid changes the body's height too. It also fires
 * when the grid itself grows, which re-measures to the same value and renders
 * nothing.
 */
function useDocumentTop(ref: React.RefObject<HTMLElement>): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (el) setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener('resize', measure);
    // Absent in jsdom and in old webviews; resize alone still covers those.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => { window.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [ref]);
  return top;
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
export function MasonryGrid({ photos, selectedIds, ...tileProps }: MasonryGridProps) {
  const viewport = useViewportWidth();
  const { columns, gap, padding } = gridGeometry(viewport);
  const inner = Math.max(1, viewport - padding * 2);
  const colWidth = columnWidth(inner, columns, gap);
  const listRef = useRef<HTMLDivElement>(null);
  const offset = useDocumentTop(listRef);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const heights = useMemo(() => photos.map((p) => tileHeight(p, colWidth)), [photos, colWidth]);

  // getItemKey is a dependency of the virtualiser's memoised measurement
  // pass, so it must not change with the array's identity: a like toggle
  // replaces the photo objects and would otherwise recompute the position of
  // every photo in the album. Order changes are handled by the measure below.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const getItemKey = useCallback((i: number) => photosRef.current[i].id, []);
  const estimateSize = useCallback((i: number) => heights[i] + gap, [heights, gap]);

  const virtualizer = useWindowVirtualizer({
    count: photos.length,
    estimateSize,
    lanes: columns,
    overscan: Math.max(6, columns * 4),
    scrollMargin: offset,
    initialRect: { width: viewport, height: window.innerHeight },
    getItemKey,
  });

  // The virtualiser caches each index's lane and only forgets it on measure()
  // or a lane-count change. A sort or a filter with the same lane count would
  // otherwise keep the old photos' lanes and stack tiles on top of each other.
  // Keyed on the id order, so replacing photo objects in place (a like) does
  // not re-measure.
  const idOrder = useMemo(() => photos.map((p) => p.id).join(','), [photos]);
  const measuredOrder = useRef(idOrder);
  useLayoutEffect(() => {
    if (measuredOrder.current === idOrder) return;
    measuredOrder.current = idOrder;
    virtualizer.measure();
  }, [idOrder, virtualizer]);

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
      if (state.anchor !== null && window.scrollY > offsetRef.current) {
        virtualizer.scrollToIndex(state.anchor, { align: 'start' });
      }
      // Keep the old anchor: this render still shows the old scroll offset,
      // and the scroll it just triggered renders again with the right one.
      return;
    }
    state.anchor = firstVisibleIndex(items, window.scrollY);
  });

  return (
    <div ref={listRef} data-testid="masonry-grid" style={{ paddingLeft: padding, paddingRight: padding }}>
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
              selected={selectedIds.has(photo.id)}
              {...tileProps}
            />
          );
        })}
      </div>
    </div>
  );
}
