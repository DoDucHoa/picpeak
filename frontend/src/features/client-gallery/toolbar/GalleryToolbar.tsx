import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadQuotaBadge } from '../../../components/gallery/DownloadQuotaBadge';
import type { GalleryController } from '../state/useGalleryController';
import type { GalleryTab } from '../state/urlState';
import {
  BackIcon, CartIcon, CheckIcon, CloseIcon, DownloadIcon, EyeIcon, EyeOffIcon, GridIcon, HeartIcon,
  ListIcon, LogoutIcon, PeopleIcon, PhotosIcon, PickIcon, ProgressRing, SelectAllIcon, ShareIcon, SortChevron,
} from '../icons';
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
 * quota, Select, sort and view on row two, or the multi-select bar while
 * selecting. Downloading many photos starts from Select. Sticky, and folded
 * to one icon-only row once the cover is gone.
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
  // What is on screen: the open folder, the tab and the people filter. A
  // second press clears it, so the button reads as a toggle.
  const visibleIds = c.visiblePhotos.map((photo) => photo.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => c.selection.ids.has(id));
  const toggleSelectAll = () => c.selection.setIds(allSelected ? new Set() : new Set(visibleIds));

  const getAllLabel = t('gallery.downloadQuota.getAll', 'Get all photos');
  const selectAllLabel = allSelected
    ? t('clientGallery.deselectAll', 'Deselect all')
    : t('clientGallery.selectAll', 'Select all');
  const downloadSelectedLabel = c.isDownloadingSelected
    ? t('clientGallery.preparingDownload', 'Preparing download')
    : t('clientGallery.downloadSelected', 'Download selected');
  const hideLabel = t('clientAccess.hideSelected', 'Hide Selected');
  const showLabel = t('clientAccess.showSelected', 'Show Selected');
  const cancelLabel = t('clientGallery.cancel', 'Cancel');
  const visibilityLocked = selectedCount === 0 || c.client.bulkVisibilityPending;

  const selectionBar = (
    <>
      <span className="cg-tb-count">{t('clientGallery.selectedCount', '{{count}} selected', { count: selectedCount })}</span>
      <button
        type="button"
        className="cg-tb-btn"
        aria-label={selectAllLabel}
        aria-pressed={allSelected}
        disabled={visibleIds.length === 0}
        onClick={toggleSelectAll}
      >
        <SelectAllIcon /><span className="cg-tb-label">{selectAllLabel}</span>
      </button>
      {c.allowDownloads && (
        <button
          type="button"
          className="cg-tb-btn"
          aria-label={downloadSelectedLabel}
          aria-busy={c.isDownloadingSelected}
          disabled={selectedCount === 0 || c.isDownloadingSelected}
          onClick={() => { void c.handleDownloadSelected(); }}
        >
          {c.isDownloadingSelected ? <ProgressRing fraction={null} /> : <DownloadIcon />}
          <span className="cg-tb-label">{downloadSelectedLabel}</span>
        </button>
      )}
      {c.client.isClient && (
        <>
          <button type="button" className="cg-tb-btn" aria-label={hideLabel} disabled={visibilityLocked} onClick={() => { void c.client.bulkVisibility('hidden'); }}>
            <EyeOffIcon /><span className="cg-tb-label">{hideLabel}</span>
          </button>
          <button type="button" className="cg-tb-btn" aria-label={showLabel} disabled={visibilityLocked} onClick={() => { void c.client.bulkVisibility('visible'); }}>
            <EyeIcon /><span className="cg-tb-label">{showLabel}</span>
          </button>
        </>
      )}
      {/* The allowance no longer fits the whole gallery: the offer to buy
          more sits with the downloads it would unlock. */}
      {c.allowDownloads && c.offerFullPackage && (
        <button type="button" className="cg-tb-btn" aria-label={getAllLabel} onClick={() => c.setQuotaOffer({ exceeded: null })}>
          <CartIcon /><span className="cg-tb-label">{getAllLabel}</span>
        </button>
      )}
      <button type="button" className="cg-tb-btn" aria-label={cancelLabel} onClick={cancelSelection}>
        <CloseIcon /><span className="cg-tb-label">{cancelLabel}</span>
      </button>
    </>
  );

  const allPhotosLabel = t('gallery.backToGallery', 'All photos');
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
      {/* Selecting is where downloads live, and where a client hides or shows
          photos, so Select is offered to anyone who can do either. */}
      {(c.client.isClient || c.allowDownloads) && (
        <button type="button" className="cg-tb-btn" aria-label={selectLabel} onClick={() => c.selection.setActive(true)}>
          <CheckIcon /><span className="cg-tb-label">{selectLabel}</span>
        </button>
      )}
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
        className={`cg-toolbar${compact ? ' cg-toolbar-compact' : ''}${c.selection.active ? ' cg-toolbar-selecting' : ''}`}
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
