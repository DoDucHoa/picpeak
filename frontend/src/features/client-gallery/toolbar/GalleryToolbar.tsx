import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadQuotaBadge } from '../../../components/gallery/DownloadQuotaBadge';
import type { GalleryController } from '../state/useGalleryController';
import type { GalleryTab } from '../state/urlState';
import {
  BackIcon, CartIcon, CheckIcon, DownloadIcon, GridIcon, HeartIcon, ListIcon, LogoutIcon,
  PeopleIcon, PhotosIcon, PickIcon, ShareIcon, SortChevron,
} from '../icons';
import { DownloadMenu } from './DownloadMenu';
import { SortMenu } from './SortMenu';

interface GalleryToolbarProps {
  c: GalleryController;
  onShare: () => void;
}

/**
 * True once the sentinel just above the toolbar has scrolled out past the top
 * of the viewport, which is when the sticky bar is pinned over the photos.
 * Without IntersectionObserver (jsdom, very old browsers) the bar simply
 * stays in its full two-row form.
 */
function useCompact(sentinel: React.RefObject<HTMLElement>): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      // Below the viewport (the cover still fills it) is not intersecting
      // either, so only a sentinel ABOVE the top counts as scrolled past.
      setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinel]);
  return compact;
}

/**
 * The bottom margin that keeps the folded bar from moving the page. Folding
 * takes the bar from two rows to one, and without this the album below would
 * jump up by the difference. Scroll anchoring pulls the page back by the same
 * amount, which brings the sentinel back into view, unfolds the bar, and the
 * loop repeats: the page shakes and will not scroll past the cover. The
 * margin is transparent, so the photos scroll up through it and under the bar.
 */
function useFoldCompensation(bar: React.RefObject<HTMLElement>, compact: boolean): number {
  const fullHeight = useRef(0);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const node = bar.current;
    if (!node) return undefined;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (!compact) {
        fullHeight.current = height;
        setMargin(0);
      } else {
        setMargin(Math.max(0, Math.round(fullHeight.current - height)));
      }
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [bar, compact]);
  return margin;
}

/**
 * The gallery toolbar: tabs, share and logout on row one; people, folder,
 * quota, downloads, sort and view on row two, or the multi-select bar while
 * selecting. Sticky, and folded to one icon-only row once the cover is gone.
 *
 * Renders its own scroll sentinel, so the page places only this component.
 */
export function GalleryToolbar({ c, onShare }: GalleryToolbarProps) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(sentinelRef);
  const barRef = useRef<HTMLDivElement>(null);
  const foldMargin = useFoldCompensation(barRef, compact);

  const fs = c.feedbackSettings;
  const showLikes = !!fs?.feedback_enabled && !!fs?.allow_likes;
  const showPicks = !!fs?.feedback_enabled && !!fs?.allow_favorites;
  // 0 means no cap, the same as null (see FeedbackSettings).
  const pickLimit = c.pickLimit && c.pickLimit > 0 ? c.pickLimit : null;

  const tabs: { tab: GalleryTab; label: string; count: string; icon: React.ReactNode; mobileOnlyIcon?: boolean }[] = [
    { tab: 'all', label: t('clientGallery.tabs.total', 'Total'), count: String(c.counts.all), icon: <PhotosIcon />, mobileOnlyIcon: true },
  ];
  if (showLikes) {
    tabs.push({ tab: 'liked', label: t('clientGallery.tabs.like', 'Like'), count: String(c.counts.liked), icon: <HeartIcon filled /> });
  }
  if (showPicks) {
    tabs.push({
      tab: 'picked',
      label: t('clientGallery.tabs.pick', 'Pick'),
      // The limit is gallery-wide, so its count is too, even inside a folder.
      count: pickLimit ? `${c.pickedTotal} / ${pickLimit}` : String(c.counts.picked),
      icon: <PickIcon filled />,
    });
  }

  const selectedCount = c.selection.ids.size;
  const cancelSelection = () => {
    c.selection.setIds(new Set());
    c.selection.setActive(false);
  };

  const selectionBar = (
    <>
      <span className="cg-tb-count">{t('clientGallery.selectedCount', '{{count}} selected', { count: selectedCount })}</span>
      {c.allowDownloads && (
        <button
          type="button"
          className="cg-tb-btn"
          aria-label={t('clientGallery.downloadSelected', 'Download selected')}
          disabled={selectedCount === 0}
          onClick={() => { void c.handleDownloadSelected(); }}
        >
          <DownloadIcon /><span className="cg-tb-label">{t('clientGallery.downloadSelected', 'Download selected')}</span>
        </button>
      )}
      {c.client.isClient && (
        <>
          <button type="button" className="cg-tb-btn cg-tb-text" disabled={selectedCount === 0} onClick={() => { void c.client.bulkVisibility('hidden'); }}>
            {t('clientAccess.hideSelected', 'Hide Selected')}
          </button>
          <button type="button" className="cg-tb-btn cg-tb-text" disabled={selectedCount === 0} onClick={() => { void c.client.bulkVisibility('visible'); }}>
            {t('clientAccess.showSelected', 'Show Selected')}
          </button>
        </>
      )}
      <button type="button" className="cg-tb-btn cg-tb-text" onClick={cancelSelection}>
        {t('clientGallery.cancel', 'Cancel')}
      </button>
    </>
  );

  const allPhotosLabel = t('gallery.backToGallery', 'All photos');
  const getAllLabel = t('gallery.downloadQuota.getAll', 'Get all photos');
  const peopleLabel = t('clientGallery.people', 'People');
  const selectLabel = t('clientGallery.select', 'Select');

  const tools = (
    <>
      {c.people.enabled && (
        <button type="button" className="cg-tb-btn" aria-label={peopleLabel} onClick={() => c.people.setSheetOpen(true)}>
          <PeopleIcon />
          {c.people.selectedIds.length > 0 && <span className="cg-tb-dot">{c.people.selectedIds.length}</span>}
        </button>
      )}
      {c.folders.open && (
        <span className="cg-tb-crumb">
          <button type="button" className="cg-tb-btn" aria-label={allPhotosLabel} onClick={() => c.folders.openBySlug(null)}>
            <BackIcon /><span className="cg-tb-label">{allPhotosLabel}</span>
          </button>
          <span className="cg-tb-label" aria-hidden="true">/</span>
          <span className="cg-tb-crumb-name">{c.folders.open.name}</span>
        </span>
      )}
      {c.quota?.enabled && c.client.isClient && <span className="cg-tb-quota"><DownloadQuotaBadge quota={c.quota} /></span>}
      {c.allowDownloads && c.offerFullPackage && (
        <button type="button" className="cg-tb-btn" aria-label={getAllLabel} onClick={() => c.setQuotaOffer({ exceeded: null })}>
          <CartIcon /><span className="cg-tb-label">{getAllLabel}</span>
        </button>
      )}
      {/* A client selects to hide or show photos, which has nothing to do
          with downloads, so Select stands on its own for them. */}
      {c.client.isClient && (
        <button type="button" className="cg-tb-btn" aria-label={selectLabel} onClick={() => c.selection.setActive(true)}>
          <CheckIcon /><span className="cg-tb-label">{selectLabel}</span>
        </button>
      )}
      {c.allowDownloads && <DownloadMenu c={c} />}
      <button
        type="button"
        className="cg-tb-dir"
        aria-label={t('clientGallery.changeSortDirection', 'Change Sort Direction')}
        onClick={c.toggleDir}
      >
        <SortChevron up={c.url.dir === 'asc'} />
      </button>
      <SortMenu c={c} />
      <button
        type="button"
        className="cg-tb-btn"
        aria-label={t('clientGallery.changeViewMode', 'Change View Mode')}
        onClick={() => c.setView(c.url.view === 'grid' ? 'list' : 'grid')}
      >
        {c.url.view === 'grid' ? <ListIcon /> : <GridIcon />}
      </button>
    </>
  );

  return (
    <>
      <div ref={sentinelRef} className="cg-toolbar-sentinel" aria-hidden="true" />
      <div
        ref={barRef}
        data-testid="gallery-toolbar"
        className={`cg-toolbar${compact ? ' cg-toolbar-compact' : ''}`}
        style={foldMargin ? { marginBottom: foldMargin } : undefined}
      >
        <div role="tablist" className="cg-tabs">
          {tabs.map(({ tab, label, count, icon, mobileOnlyIcon }) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={c.url.tab === tab}
              aria-label={`${label} ${count}`}
              className={`cg-tab${c.url.tab === tab ? ' cg-tab-active' : ''}`}
              onClick={() => c.setTab(tab)}
            >
              <span className={mobileOnlyIcon ? 'cg-tab-icon cg-tab-icon-mobile' : 'cg-tab-icon'}>{icon}</span>
              <span className="cg-tab-label">{label}</span>
              <span className="cg-tab-count">{count}</span>
            </button>
          ))}
        </div>
        <div className="cg-tb-row2">{c.selection.active ? selectionBar : tools}</div>
        <div className="cg-tb-end">
          <button type="button" className="cg-tb-btn" aria-label={t('clientGallery.share', 'Share')} onClick={onShare}>
            <ShareIcon />
          </button>
          {c.showLogout && (
            <button type="button" className="cg-tb-btn" aria-label={t('clientGallery.logout', 'Log out')} onClick={c.logout}>
              <LogoutIcon />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
