import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { useGalleryAuth } from '../../../contexts';
import { useGalleryPhotos, useDownloadAllPhotos } from '../../../hooks/useGallery';
import { useDownloadQuota, useRefreshDownloadQuota } from '../../../hooks/useDownloadQuota';
import { useDevToolsProtection } from '../../../hooks/useDevToolsProtection';
import { useWatermarkSettings } from '../../../hooks/useWatermarkSettings';
import { usePublicSettings } from '../../../hooks/usePublicSettings';
import { useGalleryFiltering, resolveMediaType } from '../../../components/gallery/hooks/useGalleryFiltering';
import { useGallerySelection } from '../../../components/gallery/hooks/useGallerySelection';
import {
  findFolderByKey,
  folderKey,
  folderTiles,
  peopleInScope,
  photosInScope,
  SELECTED_DOWNLOAD_LIMIT,
  readFolderParam,
  writeFolderParam,
} from '../../../components/gallery/folders';
import { shouldOfferFullPackage, classifyDownloadRefusal } from '../../../components/gallery/downloadQuotaOffer';
import type { FeedbackFilterType } from '../../../components/gallery/GalleryFilter';
import type { DownloadGate } from '../../../contexts/DownloadGateContext';
import type {
  DownloadOrder, DownloadPackage, QuotaExceededPayload,
} from '../../../services/downloadQuota.service';
import type { FeedbackSettings } from '../../../services/feedback.service';
import { feedbackService } from '../../../services/feedback.service';
import { galleryService } from '../../../services/gallery.service';
import { analyticsService } from '../../../services/analytics.service';
import type {
  DownloadResolutionChoice, GalleryData, GalleryPeopleResponse, GalleryPerson, Photo,
} from '../../../types';
import { readUrlState, writeUrlState } from './urlState';
import type { GalleryTab, SortField, UrlState, ViewMode } from './urlState';
import { tabCounts, tabPhotos } from './tabs';

/**
 * The event as the gallery page already knows it from /gallery/:slug/info,
 * before /photos has answered. Everything richer comes off `data.event`.
 */
export interface GalleryEventSeed {
  id: number;
  event_name: string;
  event_type: string;
  event_date: string | null;
  welcome_message?: string;
  expires_at: string | null;
  hero_photo_id?: number | null;
  allow_downloads?: boolean;
  // Banner overrides come from /gallery/:slug/info, but the /photos payload
  // carries them too and is the one that wins (see promoMarkdown below).
  promo_mode?: 'inherit' | 'custom' | 'off';
  promo_markdown?: string | null;
  info_mode?: 'inherit' | 'custom' | 'off';
  info_markdown?: string | null;
}

type BannerMode = 'inherit' | 'custom' | 'off';

/** The banner fields the /photos event carries without GalleryData declaring them. */
type EventBanners = {
  promo_mode?: BannerMode;
  promo_markdown?: string | null;
  info_mode?: BannerMode;
  info_markdown?: string | null;
};

export interface GalleryController {
  data: GalleryData | undefined; isLoading: boolean; error: unknown; refetch: () => void;
  /** The exact React Query key of the photos list, for in-place cache writes. */
  photosQueryKey: unknown[];
  event: GalleryEventSeed; slug: string;
  url: UrlState; setSort: (s: SortField) => void; toggleDir: () => void;
  setView: (v: ViewMode) => void; setTab: (t: GalleryTab) => void;
  openPhoto: (id: number | null, mode?: 'push' | 'replace') => void;
  visiblePhotos: Photo[]; scopedPhotos: Photo[]; counts: { all: number; liked: number; picked: number };
  pickLimit: number | null;
  feedbackSettings: Partial<FeedbackSettings> | undefined; identityMode: 'simple' | 'guest';
  heroPhoto: Photo | null; heroLogoUrl: string | null; brandName: string;
  protection: { level: 'basic' | 'standard' | 'enhanced' | 'maximum'; disableRightClick: boolean; devtools: boolean; canvas: boolean };
  showOriginalFilename: boolean;
  allowDownloads: boolean; downloadChoices: DownloadResolutionChoice[]; downloadStandard: string | undefined;
  isDownloadingAll: boolean; handleDownloadAll: () => void;
  selection: { active: boolean; setActive: (v: boolean) => void; ids: Set<number>; setIds: (s: Set<number>) => void };
  handleDownloadSelected: () => Promise<void>;
  quota: ReturnType<typeof useDownloadQuota>['quota']; offerFullPackage: boolean;
  quotaOffer: { exceeded: QuotaExceededPayload | null } | null; setQuotaOffer: (v: { exceeded: QuotaExceededPayload | null } | null) => void;
  downloadGate: DownloadGate; deliveredPhotoIds: Set<number>;
  downloadPackages: DownloadPackage[]; downloadCurrency: string; pendingDownloadOrder: DownloadOrder | null;
  resolutionPicker: { open: boolean; ids: number[] | null; close: () => void };
  people: {
    enabled: boolean; list: GalleryPerson[]; selectedIds: number[]; toggle: (id: number) => void;
    matchAny: boolean; setMatchAny: (v: boolean) => void; clear: () => void;
    downloadableIds: number[]; downloadFiltered: () => Promise<void>;
    sheetOpen: boolean; setSheetOpen: (v: boolean) => void; scan: GalleryPeopleResponse['scan'] | undefined;
  };
  folders: {
    tiles: ReturnType<typeof folderTiles>; open: ReturnType<typeof findFolderByKey>; openBySlug: (key: string | null) => void;
    downloadIds: number[]; downloadTotal: number; downloadCapped: boolean; downloadFolder: () => Promise<void>; rootIsFoldersOnly: boolean;
  };
  client: { isClient: boolean; visibleCount: number; totalCount: number; toggleVisibility: (id: number, current: string) => Promise<void>; bulkVisibility: (v: 'visible' | 'hidden') => Promise<void> };
  expiry: { expiresAt: string | null; daysLeft: number | null };
  showLogout: boolean; logout: () => void;
  promoMarkdown: string | null; infoMarkdown: string | null;
}

// Convert default_photo_sort DB value to the sort the URL state carries
const parseDefaultPhotoSort = (defaultSort?: string): { sort: SortField; dir: 'asc' | 'desc' } => {
  switch (defaultSort) {
    case 'upload_date_asc':
      return { sort: 'date', dir: 'asc' };
    case 'capture_date_desc':
      return { sort: 'capture_date', dir: 'desc' };
    case 'capture_date_asc':
      return { sort: 'capture_date', dir: 'asc' };
    case 'filename_asc':
      return { sort: 'name', dir: 'asc' };
    case 'filename_desc':
      return { sort: 'name', dir: 'desc' };
    case 'upload_date_desc':
    default:
      return { sort: 'date', dir: 'desc' };
  }
};

// The feedback chips are not part of this design, so the filter never runs
// them. Built once so useGalleryFiltering's memo is not invalidated by a fresh
// object on every render.
const NO_FEEDBACK_FILTERS: FeedbackFilterType[] = [];
const NO_FEEDBACK_IDS: Record<FeedbackFilterType, Set<number>> = {
  liked: new Set<number>(),
  favorited: new Set<number>(),
  rated: new Set<number>(),
  commented: new Set<number>(),
};

/** Per-event promo (#440) and info banner (#932) override over the global copy. */
function resolveBanner(mode: BannerMode | undefined, eventMarkdown: string | null | undefined, globalMarkdown: string | undefined): string | null {
  const resolved = (() => {
    if ((mode || 'inherit') === 'off') return '';
    if (mode === 'custom') {
      const eventMd = (eventMarkdown || '').trim();
      return eventMd || (globalMarkdown || '');
    }
    return globalMarkdown || '';
  })().trim();
  return resolved || null;
}

function readGuestId(): string {
  // Use existing guest ID from localStorage or generate new one. Read during
  // the first render rather than in an effect: the id is part of the photos
  // query key, and an empty first key would fetch every page twice.
  try {
    let storedGuestId = localStorage.getItem('gallery_guest_id');
    if (!storedGuestId) {
      storedGuestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('gallery_guest_id', storedGuestId);
    }
    return storedGuestId;
  } catch {
    // Private-mode Safari throws on storage access; a per-load id still works.
    return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Everything the client gallery does, with none of how it looks: data,
 * URL state, downloads and the quota, people, folders, client visibility and
 * the image protections. Lifted out of the old GalleryView so the new design
 * renders from one object.
 */
export function useGalleryController(slug: string, event: GalleryEventSeed, requiresPassword: boolean): GalleryController {
  const { t } = useTranslation();
  const { logout, isClient, viaCustomer } = useGalleryAuth();
  const queryClient = useQueryClient();
  // Open folder (#1160), mirrored to `?folder=<slug>` so it is linkable and the
  // browser back button walks out of it. Seeded from the URL on first render.
  const [openFolderSlug, setOpenFolderSlug] = useState<string | null>(() => readFolderParam());
  const openFolderSlugRef = useRef(openFolderSlug);
  openFolderSlugRef.current = openFolderSlug;
  // Download size picker (#858). `showResolutionPicker` covers "download all";
  // `resolutionPickerIds` covers a selection.
  const [showResolutionPicker, setShowResolutionPicker] = useState(false);
  const [resolutionPickerIds, setResolutionPickerIds] = useState<number[] | null>(null);

  // Sort, direction, view, tab and the open photo live in the address bar. The
  // fallback is the event's default sort once /photos has said what it is.
  const sortFallbackRef = useRef(parseDefaultPhotoSort(undefined));
  const [url, setUrl] = useState<UrlState>(() => readUrlState(window.location.search, sortFallbackRef.current));
  const urlCarriedSort = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('sort') || params.has('dir');
  })());
  const [defaultSortApplied, setDefaultSortApplied] = useState(false);
  const { watermarkEnabled } = useWatermarkSettings();

  const [protectionLevel, setProtectionLevel] = useState<'basic' | 'standard' | 'enhanced' | 'maximum'>('standard');

  // People filter (#1074). Multi-select, AND by default: see useGalleryFiltering.
  // `peopleMatchAny` only becomes reachable once a second person is picked,
  // since the toggle is meaningless for one.
  const [selectedPersonIds, setSelectedPersonIds] = useState<number[]>([]);
  const [peopleMatchAny, setPeopleMatchAny] = useState(false);
  const [showPeopleSheet, setShowPeopleSheet] = useState(false);
  const togglePerson = useCallback((personId: number) => {
    setSelectedPersonIds((prev) => {
      const next = prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId];
      // Dropping back below two people makes the any/all toggle meaningless;
      // reset it so it doesn't silently persist into the next selection.
      if (next.length < 2) setPeopleMatchAny(false);
      return next;
    });
  }, []);
  const clearPeople = useCallback(() => {
    setSelectedPersonIds([]);
    setPeopleMatchAny(false);
  }, []);
  const [guestId] = useState<string>(readGuestId);
  const [staticHeroPhoto, setStaticHeroPhoto] = useState<Photo | null>(null);

  // Fetch photos WITHOUT filter (always get all photos, filter on frontend)
  // This ensures counts are always calculated from the full dataset
  const photosQueryKey = useMemo(() => ['gallery-photos', slug, 'all', guestId], [slug, guestId]);
  const { data, isLoading, error, refetch } = useGalleryPhotos(slug, 'all', guestId);
  const { isSelectionMode, setIsSelectionMode, selectedPhotos, setSelectedPhotos } = useGallerySelection(data?.photos);

  // Set protection level when data is available
  useEffect(() => {
    if (data?.event?.protection_level) {
      setProtectionLevel(data.event.protection_level);
    }
  }, [data?.event?.protection_level]);

  // Apply default photo sort from event settings, unless the URL already says
  // how this viewer wants it sorted.
  useEffect(() => {
    if (!defaultSortApplied && data?.event?.default_photo_sort) {
      const eventDefault = parseDefaultPhotoSort(data.event.default_photo_sort);
      sortFallbackRef.current = eventDefault;
      if (!urlCarriedSort.current) {
        setUrl((prev) => ({ ...prev, sort: eventDefault.sort, dir: eventDefault.dir }));
      }
      setDefaultSortApplied(true);
    }
  }, [data?.event?.default_photo_sort, defaultSortApplied]);

  // Get individual protection settings from event
  const disableRightClick = data?.event?.disable_right_click === true;
  const enableDevtoolsProtection = data?.event?.enable_devtools_protection === true;
  const useCanvasRendering = data?.event?.use_canvas_rendering === true;
  // #508: surface original camera filenames in the lightbox when the
  // admin has flipped the same toggle that drives original-name downloads.
  const showOriginalFilename = data?.event?.use_original_filenames === true;

  // DevTools detection follows the Image security switch only.
  const devToolsEnabled = enableDevtoolsProtection;

  useDevToolsProtection({
    enabled: devToolsEnabled,
    detectionSensitivity: protectionLevel === 'maximum' ? 'high' : 'medium',
    onDevToolsDetected: () => {
      console.warn('DevTools detected in gallery view');

      // Track analytics
      const umami = (window as Window & { umami?: { track: (name: string, data: Record<string, unknown>) => void } }).umami;
      if (typeof window !== 'undefined' && umami) {
        umami.track('gallery_devtools_detected', {
          gallery: slug,
          protectionLevel,
          eventId: data?.event?.id
        });
      }

      // For maximum protection, redirect away from gallery
      if (protectionLevel === 'maximum') {
        setTimeout(() => {
          window.location.href = '/';
        }, 100);
      }
    },
    redirectOnDetection: protectionLevel === 'maximum',
    redirectUrl: '/'
  });

  // Right-click blocking - separate from DevTools protection
  useEffect(() => {
    if (!disableRightClick) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [disableRightClick]);

  // Data updates are handled by React Query
  const downloadAllMutation = useDownloadAllPhotos();
  const refreshDownloadQuota = useRefreshDownloadQuota();

  // Download allowance (#download-quota). One query feeds the header badge,
  // the delivered marks on the grid and the package offer below.
  const {
    quota: downloadQuota,
    downloadedIds: deliveredPhotoIds,
    packages: downloadPackages,
    pendingOrder: pendingDownloadOrder,
    currency: downloadCurrency,
    refetch: refetchDownloadQuota,
  } = useDownloadQuota(slug);

  // Open with the 402 body when a download was refused, and with null when the
  // guest opened the offer themselves from the header.
  const [quotaOffer, setQuotaOffer] = useState<{ exceeded: QuotaExceededPayload | null } | null>(
    null,
  );

  const notifyGuestBlocked = useCallback(() => {
    toast.error(
      t(
        'gallery.downloadQuota.guestBlocked',
        'Only registered clients can download photos from this gallery.',
      ),
    );
  }, [t]);

  /**
   * Turns a refused download into the package offer, or a "clients only"
   * notice for a guest the server caught. Returns false for any other
   * failure so the caller can keep its existing error path: a network error
   * must never be dressed up as a sales pitch.
   */
  const handleDownloadFailure = useCallback(async (error: unknown): Promise<boolean> => {
    const refusal = await classifyDownloadRefusal(error);
    if (!refusal) return false;
    if (refusal.kind === 'guest') {
      notifyGuestBlocked();
      return true;
    }
    // The allowance could not be read, so nothing was refused on its merits and
    // no purchase would help. Say so plainly instead of opening a sales dialog
    // for a problem the client cannot buy their way out of.
    if (refusal.kind === 'unavailable') {
      toast.error(
        t(
          'gallery.downloadQuota.unavailable',
          'Downloads are briefly unavailable. Please try again in a moment.',
        ),
      );
      return true;
    }
    setQuotaOffer({ exceeded: refusal.payload });
    // The refusal carries the server's current counters, so the badge behind
    // the dialog agrees with the dialog in front of it.
    refetchDownloadQuota();
    return true;
  }, [refetchDownloadQuota, notifyGuestBlocked, t]);

  const offerForBlockedDownload = useCallback(() => {
    // A single not-yet-delivered photo against an exhausted allowance always
    // costs exactly one slot: the same arithmetic the server's quota gate
    // would have done, just without the round trip.
    setQuotaOffer({
      exceeded: {
        code: 'DOWNLOAD_QUOTA_EXCEEDED',
        quota: {
          total: downloadQuota?.total ?? null,
          used: downloadQuota?.used ?? 0,
          remaining: downloadQuota?.remaining ?? 0,
        },
        requested_new: 1,
        missing_slots: 1,
      },
    });
  }, [downloadQuota?.total, downloadQuota?.used, downloadQuota?.remaining]);

  // Fed to every per-photo download button (grid, list, viewer) through
  // context so none of them need quota state threaded in as props.
  const downloadGate = useMemo<DownloadGate>(() => ({
    quotaEnabled: Boolean(downloadQuota?.enabled),
    isClient,
    remaining: downloadQuota?.remaining ?? null,
    downloadedIds: deliveredPhotoIds,
    openQuotaOffer: (exceeded: QuotaExceededPayload | null) => setQuotaOffer({ exceeded }),
    offerForBlockedDownload,
    notifyGuestBlocked,
    reportDownloadFailure: handleDownloadFailure,
  }), [
    downloadQuota?.enabled, downloadQuota?.remaining, isClient, deliveredPhotoIds,
    offerForBlockedDownload, notifyGuestBlocked, handleDownloadFailure,
  ]);

  const { data: settingsData } = usePublicSettings();

  // Fetch feedback settings
  const { data: feedbackSettings } = useQuery<Partial<FeedbackSettings>>({
    queryKey: ['gallery-feedback-settings', event.id],
    queryFn: async () => {
      try {
        // Use public endpoint to get feedback settings
        return await feedbackService.getGalleryFeedbackSettings(slug);
      } catch (error) {
        console.error('Error fetching feedback settings:', error);
        // If endpoint doesn't exist or returns error, default to disabled
        return { feedback_enabled: false };
      }
    },
    enabled: !!event.id,
  });

  // People in this gallery (#1074).
  //
  // Gated on people_enabled so an install without the feature never fires the
  // request at all. Polls only while a backfill is running: a finished
  // gallery has a stable people list, and polling it forever would be a
  // request per guest per interval for no new information.
  // From the /photos payload, not the seed: the seed's event shape comes
  // from /info, which does not carry this flag.
  const peopleEnabled = data?.event?.people_enabled === true;
  const { data: peopleData } = useQuery({
    queryKey: ['gallery-people', slug],
    queryFn: () => galleryService.getPeople(slug),
    enabled: peopleEnabled,
    refetchInterval: (query) => (query.state.data?.scan?.in_progress ? 5000 : false),
    staleTime: 30_000,
  });
  // Memoised so the `people` recount below isn't invalidated by a fresh []
  // identity on every render.
  const allPeople = useMemo(() => peopleData?.people || [], [peopleData?.people]);

  // Folders (#1160). `openFolder` resolves the `?folder=` slug against the
  // categories the gallery actually returned, so a stale or hand-typed slug
  // simply falls back to root instead of rendering an empty gallery.
  const openFolder = useMemo(
    () => findFolderByKey(data?.categories, openFolderSlug),
    [data?.categories, openFolderSlug]
  );

  const tiles = useMemo(
    () => folderTiles(data?.categories, data?.photos),
    [data?.categories, data?.photos]
  );

  // Photos the current view is allowed to show, before any user-applied filter.
  // This, not `filteredPhotos`, is the right basis for the people strip and
  // the tab counts: scoping those by the person filter would zero out every
  // other face the moment one is picked.
  const scopedPhotos = useMemo(
    () => photosInScope(data?.photos, data?.categories, openFolder?.id ?? null),
    [data?.photos, data?.categories, openFolder]
  );

  const people = useMemo(() => peopleInScope(allPeople, scopedPhotos), [allPeople, scopedPhotos]);

  // The strip comes from /people, but FILTERING uses photo.person_ids, which
  // rides on the one-shot /photos response. During a backfill those drift
  // apart: new faces appear in the strip while the photo memberships behind
  // them are still the set fetched on page load, so tapping a person yields
  // zero or a partial result until a manual reload, including after the scan
  // has finished.
  //
  // Refetch the photos whenever the scan's progress changes, and once more on
  // the transition to finished.
  const scanProgress = peopleData?.scan
    ? `${peopleData.scan.in_progress}:${peopleData.scan.scanned}`
    : null;
  useEffect(() => {
    if (!peopleEnabled || !scanProgress) return;
    queryClient.invalidateQueries({ queryKey: ['gallery-photos', slug] });
  }, [scanProgress, peopleEnabled, slug, queryClient]);

  const identityMode: 'simple' | 'guest' =
    feedbackSettings?.identity_mode === 'guest' ? 'guest' : 'simple';

  // Determine the default hero photo from the initial load. Latched once, so a
  // refetch (a like, a pick) never swaps the cover under the viewer.
  useEffect(() => {
    if (!staticHeroPhoto && data?.photos) {
      let hero: Photo | null = null;
      const heroId = data?.event?.hero_photo_id || null;
      if (heroId) {
        hero = data.photos.find(p => p.id === heroId) || null;
      }
      if (!hero && data.photos.length > 0) {
        const firstPhoto = data.photos.find(p => resolveMediaType(p) === 'photo');
        hero = firstPhoto || data.photos[0];
      }
      if (hero) {
        setStaticHeroPhoto(hero);
      }
    }
  }, [data?.photos, data?.event?.hero_photo_id, staticHeroPhoto]);

  // Client visibility toggle handler (#172)
  const handleToggleVisibility = async (photoId: number, currentVisibility: string) => {
    const newVisibility = currentVisibility === 'hidden' ? 'visible' : 'hidden';
    try {
      await galleryService.togglePhotoVisibility(slug, photoId, newVisibility);
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', slug] });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  const handleBulkVisibility = async (visibility: 'visible' | 'hidden') => {
    if (selectedPhotos.size === 0) return;
    try {
      await galleryService.bulkToggleVisibility(slug, Array.from(selectedPhotos), visibility);
      setSelectedPhotos(new Set());
      setIsSelectionMode(false);
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', slug] });
    } catch (error) {
      console.error('Failed to bulk toggle visibility:', error);
    }
  };

  // Client visibility stats
  const visibleCount = useMemo(() => {
    if (!isClient || !data?.photos) return 0;
    return data.photos.filter(p => p.visibility !== 'hidden').length;
  }, [isClient, data?.photos]);

  const totalCount = data?.photos?.length || 0;

  // Calculate days until expiration (null means never expires)
  const daysUntilExpiration = event.expires_at
    ? differenceInDays(parseISO(event.expires_at), new Date())
    : null;
  const showUrgentWarning = daysUntilExpiration !== null && daysUntilExpiration <= 7;
  const isExpired = daysUntilExpiration !== null && daysUntilExpiration < 0;

  const openFolderBySlug = useCallback((key: string | null) => {
    setOpenFolderSlug(key);
    writeFolderParam(key);
    // Without this a selection made outside the folder survives into it, and
    // the toolbar would offer to download (or a client to hide) photos that
    // are no longer on screen.
    setSelectedPhotos(new Set());
    // A person picked in the previous scope may have no photos here, and
    // peopleInScope drops them from the strip, leaving an invisible filter that
    // empties the grid with no control left to clear it.
    setSelectedPersonIds([]);
    setPeopleMatchAny(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSelectedPhotos]);

  // URL state writers. `openPhoto` pushes, so Back closes the viewer; the rest
  // replace, so changing the sort five times does not cost five Back presses.
  const updateUrl = useCallback((patch: Partial<UrlState>, mode: 'push' | 'replace') => {
    setUrl((prev) => ({ ...prev, ...patch }));
    writeUrlState(patch, mode);
  }, []);
  // Sort and direction are always written together, so a URL never carries
  // one of them and leaves the other to a fallback that may have changed.
  const setSort = useCallback(
    (sort: SortField) => updateUrl({ sort, dir: url.dir }, 'replace'),
    [updateUrl, url.dir]
  );
  const toggleDir = useCallback(
    () => updateUrl({ sort: url.sort, dir: url.dir === 'asc' ? 'desc' : 'asc' }, 'replace'),
    [updateUrl, url.sort, url.dir]
  );
  const setView = useCallback((view: ViewMode) => updateUrl({ view }, 'replace'), [updateUrl]);
  const setTab = useCallback((tab: GalleryTab) => updateUrl({ tab }, 'replace'), [updateUrl]);
  const openPhoto = useCallback(
    (photo: number | null, mode: 'push' | 'replace' = 'push') => updateUrl({ photo }, mode),
    [updateUrl]
  );

  // Set when a deep link has been checked against the loaded photos, so a
  // photo that later leaves the current tab (an unlike in the liked tab) does
  // not yank the viewer to another tab.
  const deepLinkResolved = useRef(false);

  // The address bar is the source of truth, so Back/Forward walk in and out of
  // folders and the viewer instead of leaving the gallery.
  useEffect(() => {
    const onPop = () => {
      setUrl(readUrlState(window.location.search, sortFallbackRef.current));
      deepLinkResolved.current = false;
      const nextFolder = readFolderParam();
      // Only a folder change resets the scoped state: closing the viewer with
      // Back must not throw away the viewer's selection.
      if (nextFolder !== openFolderSlugRef.current) {
        setOpenFolderSlug(nextFolder);
        setSelectedPhotos(new Set());
        setSelectedPersonIds([]);
        setPeopleMatchAny(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setSelectedPhotos]);

  const filteredPhotos = useGalleryFiltering({
    sourcePhotos: data?.photos, categories: data?.categories, folderId: openFolder?.id ?? null,
    selectedCategoryId: null, searchTerm: '', sortBy: url.sort, sortDesc: url.dir === 'desc',
    watermarkEnabled, slug, activeFilters: NO_FEEDBACK_FILTERS, activeColorFilters: [], mediaFilter: 'all',
    isGuestIdentityMode: identityMode === 'guest', myFeedbackPhotoIds: NO_FEEDBACK_IDS,
    selectedPersonIds, peopleMatchAny,
  });
  const visiblePhotos = useMemo(() => tabPhotos(filteredPhotos, url.tab), [filteredPhotos, url.tab]);
  const counts = useMemo(() => tabCounts(scopedPhotos), [scopedPhotos]);

  // Deep link to a photo (`?photo=<id>`). A link shared from the liked tab, or
  // from inside a folder, must still open the photo for someone whose view
  // would hide it: switch to the all tab and into the photo's folder. An id
  // the gallery does not have is dropped instead of opening an empty viewer.
  useEffect(() => {
    if (deepLinkResolved.current || !data) return;
    deepLinkResolved.current = true;
    if (url.photo === null) return;
    if (visiblePhotos.some((photo) => photo.id === url.photo)) return;
    const target = data.photos.find((photo) => photo.id === url.photo);
    if (!target) {
      openPhoto(null, 'replace');
      return;
    }
    const tile = tiles.find((candidate) => candidate.category.id === target.category_id);
    const targetFolderKey = tile ? folderKey(tile.category) : null;
    const currentFolderKey = openFolder ? folderKey(openFolder) : null;
    if (targetFolderKey !== currentFolderKey) openFolderBySlug(targetFolderKey);
    if (url.tab !== 'all') setTab('all');
  }, [data, url.photo, url.tab, visiblePhotos, tiles, openFolder, openFolderBySlug, openPhoto, setTab]);

  // Check if downloads are allowed (both event setting and not expired)
  const allowDownloads = !isExpired && (data?.event?.allow_downloads === true);

  // Resolution picker choices (#858). More than one option means there is an
  // actual choice to make; a single option is just the standard size, so skip
  // the modal and download straight away.
  const downloadChoices = data?.event?.download_resolution?.picker_enabled
    ? (data.event.download_resolution.choices || [])
    : [];

  // Photos the gallery has not delivered yet. This, not the gallery size, is
  // what a "download all" would actually spend: a photo already handed over
  // costs nothing to take again.
  const notDeliveredCount = useMemo(() => {
    if (!data?.photos) return 0;
    return data.photos.filter((photo) => !deliveredPhotoIds.has(photo.id)).length;
  }, [data?.photos, deliveredPhotoIds]);

  // Swap the download button for the package offer only when the whole
  // gallery genuinely no longer fits. Comparing the gallery against the FREE
  // limit instead would keep selling to a client who already bought more.
  const offerFullPackage =
    Boolean(downloadQuota?.enabled) &&
    shouldOfferFullPackage(notDeliveredCount, downloadQuota?.remaining ?? null);

  const handleDownloadAll = () => {
    // Prevent downloads if gallery is expired or downloads disabled
    if (!allowDownloads) {
      return;
    }

    // Hand off to the picker; it builds the archive as a job and downloads it.
    if (downloadChoices.length > 1) {
      setShowResolutionPicker(true);
      return;
    }

    downloadAllMutation.mutate(
      { slug, zipReady: data?.event?.download_zip_ready },
      { onError: (error) => { void handleDownloadFailure(error); } },
    );

    // Track download all action
    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: data?.photos.length || 0,
      is_download_all: true
    });
  };

  const handleDownloadSelected = async () => {
    if (selectedPhotos.size === 0) return;

    // Prevent downloads if gallery is expired or downloads disabled
    if (!allowDownloads) {
      return;
    }

    // Resolution picker (#858): a selection gets the same choice as the
    // single-photo control, rather than silently downloading at the gallery
    // standard.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(Array.from(selectedPhotos));
      return;
    }

    const selectedPhotosList = filteredPhotos.filter(p => selectedPhotos.has(p.id));

    // Track bulk download
    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: selectedPhotos.size
    });

    // Download each selected photo
    try {
      for (const photo of selectedPhotosList) {
        await galleryService.downloadPhoto(slug, photo.id, photo.filename);
      }
      // Each photo claimed its slot before streaming, so re-read the allowance.
      refreshDownloadQuota(slug);
    } catch (error) {
      // The selection is deliberately left standing on a quota refusal: the
      // dialog asks the guest to drop photos themselves, which it cannot do
      // if the selection has already been cleared out from under them.
      if (await handleDownloadFailure(error)) return;
      throw error;
    }

    // Clear selection after download
    setSelectedPhotos(new Set());
    setIsSelectionMode(false);
  };

  // "Download these N" (#1074): the payoff of the people filter.
  //
  // Deliberately NO new endpoint or person_id selector: the filtered photo
  // ids go through the same path as a manual selection, and the server
  // re-applies the access level and per-category permissions on the way
  // through. One less thing to authorize.
  //
  // Photos in a category with downloads disabled (#640) are excluded HERE as
  // well as server-side, so the number on the button is the number the guest
  // actually receives rather than an optimistic one.
  const peopleDownloadableIds = useMemo(() => {
    if (selectedPersonIds.length === 0) return [];
    return filteredPhotos
      .filter((photo) => photo.category_allow_downloads !== false)
      .map((photo) => photo.id);
  }, [filteredPhotos, selectedPersonIds]);

  const handleDownloadPeopleFiltered = async () => {
    if (!allowDownloads || peopleDownloadableIds.length === 0) return;

    // Same resolution-picker behaviour as every other multi-photo download.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(peopleDownloadableIds);
      return;
    }

    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: peopleDownloadableIds.length,
    });

    try {
      await galleryService.downloadSelectedPhotos(slug, peopleDownloadableIds);
      refreshDownloadQuota(slug);
    } catch (error) {
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
  };

  // Download just the open folder (#1160). The event-wide "download all" still
  // zips the whole gallery including foldered photos; this is the "only this
  // folder, once" case. Honours the per-category opt-out (#640), so a folder
  // with allow_downloads = false offers no button at all.
  const folderDownloadableIds = useMemo(() => {
    if (!openFolder) return [];
    if (openFolder.allow_downloads === false) return [];
    // scopedPhotos, not filteredPhotos: a button that says "Download folder"
    // must not quietly hand over a filtered subset of it.
    return scopedPhotos
      .filter((photo) => photo.category_allow_downloads !== false)
      .map((photo) => photo.id);
  }, [openFolder, scopedPhotos]);

  // /download-selected caps the id list server-side, so a folder bigger than the
  // cap would deliver a truncated archive under a button promising the whole
  // thing. Send only what the server will honour, and say so on the label.
  const folderDownloadIds = useMemo(
    () => folderDownloadableIds.slice(0, SELECTED_DOWNLOAD_LIMIT),
    [folderDownloadableIds]
  );
  const folderDownloadCapped = folderDownloadableIds.length > SELECTED_DOWNLOAD_LIMIT;

  const handleDownloadFolder = async () => {
    if (!allowDownloads || folderDownloadableIds.length === 0) return;

    // Same resolution-picker behaviour as every other multi-photo download.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(folderDownloadIds);
      return;
    }

    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: folderDownloadIds.length,
    });

    try {
      await galleryService.downloadSelectedPhotos(slug, folderDownloadIds);
      refreshDownloadQuota(slug);
    } catch (error) {
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
  };

  // Track expiration warning views
  useEffect(() => {
    if (showUrgentWarning && daysUntilExpiration > 0) {
      analyticsService.trackExpirationWarning(slug, daysUntilExpiration);
    }
  }, [showUrgentWarning, daysUntilExpiration, slug]);

  // Does this session hold something worth dropping? A password gallery and a
  // PIN client obviously do. So does a customer-portal session: its token
  // bypasses reveal mode, so it opens galleries a plain visitor cannot, and it
  // lives for 24h in a cookie the customer logout does not clear. Hiding the
  // control would remove the only way to drop it (#1149).
  //
  // Read from the auth context, which resolves this from /auth/session on
  // mount, NOT from the photos payload. That response is cached by React
  // Query for five minutes on a key that knows nothing about the session, so
  // opening a gallery as a guest and then from the portal would have reused
  // the guest answer, and vice versa.
  const showLogoutControl = requiresPassword || isClient || viaCustomer;

  // Root of a gallery where every photo lives in a folder: the tiles ARE the
  // content, and the grid below them would otherwise render its empty state.
  // Deliberately `scopedPhotos`, not `filteredPhotos`: with loose root photos
  // present, a filter matching none of them would otherwise look "folder-only"
  // and swallow the no-results message the guest needs.
  const rootIsFoldersOnly = !openFolder && tiles.length > 0 && scopedPhotos.length === 0;

  // Banner overrides are read from the /photos response rather than the seed:
  // the seed comes from the gallery LOGIN response, which carries only a small
  // identity subset, so anything not in that subset is undefined right after a
  // guest signs in. /photos is the payload that refreshes on every gallery
  // load, which is why the fields were added there too.
  const banners = data?.event as EventBanners | undefined;
  const promoMarkdown = resolveBanner(banners?.promo_mode, banners?.promo_markdown, settingsData?.branding_promo_markdown);
  const infoMarkdown = resolveBanner(banners?.info_mode, banners?.info_markdown, settingsData?.branding_info_markdown);

  const heroLogoUrl = data?.event?.hero_logo_visible !== false
    ? (data?.event?.hero_logo_url || settingsData?.branding_logo_url || null)
    : null;

  return {
    data, isLoading, error, refetch: () => { void refetch(); },
    photosQueryKey,
    event, slug,
    url, setSort, toggleDir, setView, setTab, openPhoto,
    visiblePhotos, scopedPhotos, counts,
    pickLimit: feedbackSettings?.max_favorites_per_guest ?? null,
    feedbackSettings, identityMode,
    heroPhoto: staticHeroPhoto, heroLogoUrl,
    brandName: settingsData?.branding_company_name || '',
    protection: {
      level: protectionLevel,
      disableRightClick,
      devtools: enableDevtoolsProtection,
      canvas: useCanvasRendering,
    },
    showOriginalFilename,
    allowDownloads, downloadChoices, downloadStandard: data?.event?.download_resolution?.standard,
    isDownloadingAll: downloadAllMutation.isPending, handleDownloadAll,
    selection: { active: isSelectionMode, setActive: setIsSelectionMode, ids: selectedPhotos, setIds: setSelectedPhotos },
    handleDownloadSelected,
    quota: downloadQuota, offerFullPackage,
    quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds,
    downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker: {
      open: showResolutionPicker || resolutionPickerIds !== null,
      ids: resolutionPickerIds,
      close: () => {
        setShowResolutionPicker(false);
        setResolutionPickerIds(null);
      },
    },
    people: {
      enabled: peopleEnabled,
      list: people,
      selectedIds: selectedPersonIds,
      toggle: togglePerson,
      matchAny: peopleMatchAny,
      setMatchAny: setPeopleMatchAny,
      clear: clearPeople,
      downloadableIds: peopleDownloadableIds,
      downloadFiltered: handleDownloadPeopleFiltered,
      sheetOpen: showPeopleSheet,
      setSheetOpen: setShowPeopleSheet,
      scan: peopleData?.scan,
    },
    folders: {
      tiles,
      open: openFolder,
      openBySlug: openFolderBySlug,
      downloadIds: folderDownloadIds,
      // The full count for the "Download first N of M" label when capped.
      downloadTotal: folderDownloadableIds.length,
      downloadCapped: folderDownloadCapped,
      downloadFolder: handleDownloadFolder,
      rootIsFoldersOnly,
    },
    client: {
      isClient,
      visibleCount,
      totalCount,
      toggleVisibility: handleToggleVisibility,
      bulkVisibility: handleBulkVisibility,
    },
    expiry: { expiresAt: event.expires_at, daysLeft: daysUntilExpiration },
    showLogout: showLogoutControl,
    logout,
    promoMarkdown, infoMarkdown,
  };
}
