import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadQuotaBadge } from '../../../components/gallery/DownloadQuotaBadge';
import type { GalleryController } from '../state/useGalleryController';
import type { GalleryTab } from '../state/urlState';
import {
  BackIcon, CartIcon, DownloadIcon, GridIcon, HeartIcon, ListIcon, LogoutIcon,
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
      count: pickLimit ? `${c.counts.picked} / ${pickLimit}` : String(c.counts.picked),
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
      {c.allowDownloads && (c.offerFullPackage ? (
        <button type="button" className="cg-tb-btn" aria-label={getAllLabel} onClick={() => c.setQuotaOffer({ exceeded: null })}>
          <CartIcon /><span className="cg-tb-label">{getAllLabel}</span>
        </button>
      ) : (
        <DownloadMenu c={c} />
      ))}
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
      <div data-testid="gallery-toolbar" className={`cg-toolbar${compact ? ' cg-toolbar-compact' : ''}`}>
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
