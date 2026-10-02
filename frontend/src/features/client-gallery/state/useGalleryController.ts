import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useGalleryAuth } from '../../../contexts';
import { useGalleryPhotos } from '../../../hooks/useGallery';
import { useDevToolsProtection } from '../../../hooks/useDevToolsProtection';
import { useWatermarkSettings } from '../../../hooks/useWatermarkSettings';
import { usePublicSettings } from '../../../hooks/usePublicSettings';
import { useGalleryFiltering, resolveMediaType } from '../../../components/gallery/hooks/useGalleryFiltering';
import type { FeedbackFilterType } from '../../../components/gallery/hooks/useGalleryFiltering';
import { useGallerySelection } from '../../../components/gallery/hooks/useGallerySelection';
import {
  findFolderByKey,
  folderKey,
  folderTiles,
  peopleInScope,
  photosInScope,
  readFolderParam,
  writeFolderParam,
} from '../../../components/gallery/folders';
import type { DownloadGate } from '../../../contexts/DownloadGateContext';
import type {
  DownloadOrder, DownloadPackage, QuotaExceededPayload,
} from '../../../services/downloadQuota.service';
import type { FeedbackSettings } from '../../../services/feedback.service';
import { feedbackService } from '../../../services/feedback.service';
import { galleryService } from '../../../services/gallery.service';
import { analyticsService } from '../../../services/analytics.service';
import type {
  DownloadResolutionChoice, GalleryData, GalleryPerson, Photo,
} from '../../../types';
import { readUrlState, writeUrlState } from './urlState';
import type { GalleryTab, SortField, UrlState, ViewMode } from './urlState';
import { tabCounts, tabPhotos } from './tabs';
import { useGalleryDownloads } from './useGalleryDownloads';
import type { GalleryDownloads, ResolutionPicker } from './useGalleryDownloads';

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
  /** Closes the viewer: Back when the app pushed its entry, else a replace. */
  closePhoto: () => void;
  visiblePhotos: Photo[]; scopedPhotos: Photo[]; counts: { all: number; liked: number; picked: number };
  pickLimit: number | null;
  /** Picks across the whole gallery: the pick limit is gallery-wide, the tabs are not. */
  pickedTotal: number;
  feedbackSettings: Partial<FeedbackSettings> | undefined; identityMode: 'simple' | 'guest';
  heroPhoto: Photo | null; heroLogoUrl: string | null; brandName: string;
  protection: { level: 'basic' | 'standard' | 'enhanced' | 'maximum'; disableRightClick: boolean; devtools: boolean; canvas: boolean };
  showOriginalFilename: boolean;
  allowDownloads: boolean; downloadChoices: DownloadResolutionChoice[]; downloadStandard: string | undefined;
  selection: { active: boolean; setActive: (v: boolean) => void; ids: Set<number>; setIds: (s: Set<number>) => void };
  handleDownloadSelected: () => Promise<void>; isDownloadingSelected: boolean;
  quota: GalleryDownloads['quota']; offerFullPackage: boolean;
  quotaOffer: { exceeded: QuotaExceededPayload | null } | null; setQuotaOffer: (v: { exceeded: QuotaExceededPayload | null } | null) => void;
  downloadGate: DownloadGate; deliveredPhotoIds: Set<number>;
  downloadPackages: DownloadPackage[]; downloadCurrency: string; pendingDownloadOrder: DownloadOrder | null;
  resolutionPicker: ResolutionPicker;
  people: {
    enabled: boolean; list: GalleryPerson[]; selectedIds: number[]; toggle: (id: number) => void;
    sheetOpen: boolean; setSheetOpen: (v: boolean) => void;
  };
  folders: {
    tiles: ReturnType<typeof folderTiles>; open: ReturnType<typeof findFolderByKey>; openBySlug: (key: string | null) => void;
    rootIsFoldersOnly: boolean;
  };
  client: { isClient: boolean; visibleCount: number; totalCount: number; toggleVisibility: (id: number, current: string) => Promise<void>; bulkVisibility: (v: 'visible' | 'hidden') => Promise<void>; bulkVisibilityPending: boolean };
  expiry: { expiresAt: string | null };
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
const NO_COLOR_FILTERS: never[] = [];
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
 * the image protections. Lifted out of the old themable gallery so the new design
 * renders from one object.
 *
 * Every function on the result is stable across renders unless its inputs
 * changed, and so is the result itself, so memoised tiles can depend on them.
 */
export function useGalleryController(slug: string, event: GalleryEventSeed, requiresPassword: boolean): GalleryController {
  const { logout, isClient, viaCustomer } = useGalleryAuth();
  const queryClient = useQueryClient();
  // Open folder (#1160), mirrored to `?folder=<slug>` so it is linkable and the
  // browser back button walks out of it. Seeded from the URL on first render.
  const [openFolderSlug, setOpenFolderSlug] = useState<string | null>(() => readFolderParam());
  const openFolderSlugRef = useRef(openFolderSlug);
  openFolderSlugRef.current = openFolderSlug;

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

  // People filter (#1074). Multi-select, always AND (a photo must show every
  // picked person): the people sheet offers no any/all switch.
  const [selectedPersonIds, setSelectedPersonIds] = useState<number[]>([]);
  const [showPeopleSheet, setShowPeopleSheet] = useState(false);
  const togglePerson = useCallback((personId: number) => {
    setSelectedPersonIds((prev) => (prev.includes(personId)
      ? prev.filter((id) => id !== personId)
      : [...prev, personId]));
  }, []);
  const [guestId] = useState<string>(readGuestId);
  const [staticHeroPhoto, setStaticHeroPhoto] = useState<Photo | null>(null);

  // Fetch photos WITHOUT filter (always get all photos, filter on frontend)
  // This ensures counts are always calculated from the full dataset
  const photosQueryKey = useMemo(() => ['gallery-photos', slug, 'all', guestId], [slug, guestId]);
  const { data, isLoading, error, refetch: refetchPhotos } = useGalleryPhotos(slug, 'all', guestId);
  const refetch = useCallback(() => { void refetchPhotos(); }, [refetchPhotos]);
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
      if (typeof window !== 'undefined') {
        const umami = (window as Window & { umami?: { track: (name: string, data: Record<string, unknown>) => void } }).umami;
        if (umami) {
          umami.track('gallery_devtools_detected', {
            gallery: slug,
            protectionLevel,
            eventId: data?.event?.id
          });
        }
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

  const { data: settingsData } = usePublicSettings();

  // Fetch feedback settings
  const { data: feedbackSettings } = useQuery<Partial<FeedbackSettings>>({
    // Keyed on the slug: the admin preview seeds an event id of 0.
    queryKey: ['gallery-feedback-settings', slug],
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
    enabled: !!slug,
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
  const handleToggleVisibility = useCallback(async (photoId: number, currentVisibility: string) => {
    const newVisibility = currentVisibility === 'hidden' ? 'visible' : 'hidden';
    try {
      await galleryService.togglePhotoVisibility(slug, photoId, newVisibility);
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', slug] });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  }, [slug, queryClient]);

  // Locks Hide and Show while a change is on its way, so a second press
  // never sends the same change twice.
  const [bulkVisibilityPending, setBulkVisibilityPending] = useState(false);
  const bulkVisibilityRef = useRef(false);
  const handleBulkVisibility = useCallback(async (visibility: 'visible' | 'hidden') => {
    if (selectedPhotos.size === 0 || bulkVisibilityRef.current) return;
    bulkVisibilityRef.current = true;
    setBulkVisibilityPending(true);
    try {
      await galleryService.bulkToggleVisibility(slug, Array.from(selectedPhotos), visibility);
      setSelectedPhotos(new Set());
      setIsSelectionMode(false);
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', slug] });
    } catch (error) {
      console.error('Failed to bulk toggle visibility:', error);
    } finally {
      bulkVisibilityRef.current = false;
      setBulkVisibilityPending(false);
    }
  }, [selectedPhotos, slug, setSelectedPhotos, setIsSelectionMode, queryClient]);

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

  // `replace` is for the deep link only: it enters the photo's folder in
  // place, so Back never lands on the folder-less entry and re-resolves it.
  const enterFolder = useCallback((key: string | null, history: 'push' | 'replace') => {
    setOpenFolderSlug(key);
    writeFolderParam(key, history);
    // Without this a selection made outside the folder survives into it, and
    // the toolbar would offer to download (or a client to hide) photos that
    // are no longer on screen.
    setSelectedPhotos(new Set());
    // A person picked in the previous scope may have no photos here, and
    // peopleInScope drops them from the strip, leaving an invisible filter that
    // empties the grid with no control left to clear it.
    setSelectedPersonIds([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSelectedPhotos]);
  const openFolderBySlug = useCallback((key: string | null) => enterFolder(key, 'push'), [enterFolder]);

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

  // True while the viewer sits on a history entry this session pushed. Only
  // then may closing it step Back: a viewer reached by a deep link has the
  // gallery's previous page (or nothing) behind it, and Back would leave.
  // Stepping between photos with a replace keeps the entry, so it keeps the flag.
  const viewerEntryPushed = useRef(false);
  const openPhoto = useCallback((photo: number | null, mode: 'push' | 'replace' = 'push') => {
    if (photo === null) viewerEntryPushed.current = false;
    else if (mode === 'push') viewerEntryPushed.current = true;
    updateUrl({ photo }, mode);
  }, [updateUrl]);
  const closePhoto = useCallback(() => {
    if (viewerEntryPushed.current) {
      viewerEntryPushed.current = false;
      // The popstate listener below reads the closed state back from the URL.
      window.history.back();
      return;
    }
    openPhoto(null, 'replace');
  }, [openPhoto]);

  // Set when a deep link has been checked against the loaded photos, so a
  // photo that later leaves the current tab (an unlike in the liked tab) does
  // not yank the viewer to another tab.
  const deepLinkResolved = useRef(false);

  // The address bar is the source of truth, so Back/Forward walk in and out of
  // folders and the viewer instead of leaving the gallery.
  useEffect(() => {
    const onPop = () => {
      setUrl(readUrlState(window.location.search, sortFallbackRef.current));
      // Whatever entry Back or Forward reached, this session can no longer
      // vouch for what sits behind it.
      viewerEntryPushed.current = false;
      deepLinkResolved.current = false;
      const nextFolder = readFolderParam();
      // Only a folder change resets the scoped state: closing the viewer with
      // Back must not throw away the viewer's selection.
      if (nextFolder !== openFolderSlugRef.current) {
        setOpenFolderSlug(nextFolder);
        setSelectedPhotos(new Set());
        setSelectedPersonIds([]);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setSelectedPhotos]);

  const filteredPhotos = useGalleryFiltering({
    sourcePhotos: data?.photos, categories: data?.categories, folderId: openFolder?.id ?? null,
    selectedCategoryId: null, searchTerm: '', sortBy: url.sort, sortDesc: url.dir === 'desc',
    watermarkEnabled, slug, activeFilters: NO_FEEDBACK_FILTERS, activeColorFilters: NO_COLOR_FILTERS, mediaFilter: 'all',
    isGuestIdentityMode: identityMode === 'guest', myFeedbackPhotoIds: NO_FEEDBACK_IDS,
    selectedPersonIds, peopleMatchAny: false,
  });
  const visiblePhotos = useMemo(() => tabPhotos(filteredPhotos, url.tab), [filteredPhotos, url.tab]);
  const counts = useMemo(() => tabCounts(scopedPhotos), [scopedPhotos]);
  const pickedTotal = useMemo(() => tabCounts(data?.photos ?? []).picked, [data?.photos]);

  // Deep link to a photo (`?photo=<id>`). A link shared from the liked tab, or
  // from inside a folder, must still open the photo for someone whose view
  // would hide it: switch to the all tab and into the photo's folder. An id
  // the gallery does not have is dropped instead of opening an empty viewer.
  //
  // Folder and tab are the only scopes that can hide a photo at first load:
  // people start empty and nothing else filters. A filter that ever gets a
  // non-empty default has to be cleared here as well, or its deep links will
  // resolve to a photo the grid does not show.
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
    if (targetFolderKey !== currentFolderKey) enterFolder(targetFolderKey, 'replace');
    if (url.tab !== 'all') setTab('all');
  }, [data, url.photo, url.tab, visiblePhotos, tiles, openFolder, enterFolder, openPhoto, setTab]);

  const downloads = useGalleryDownloads({
    slug, data, isClient, isExpired,
    selectedPhotos, setSelectedPhotos, setIsSelectionMode,
  });

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
  const brandName = settingsData?.branding_company_name || '';
  const pickLimit = feedbackSettings?.max_favorites_per_guest ?? null;

  const protection = useMemo(() => ({
    level: protectionLevel,
    disableRightClick,
    devtools: enableDevtoolsProtection,
    canvas: useCanvasRendering,
  }), [protectionLevel, disableRightClick, enableDevtoolsProtection, useCanvasRendering]);

  const selection = useMemo(() => ({
    active: isSelectionMode, setActive: setIsSelectionMode, ids: selectedPhotos, setIds: setSelectedPhotos,
  }), [isSelectionMode, setIsSelectionMode, selectedPhotos, setSelectedPhotos]);

  const peopleGroup = useMemo(() => ({
    enabled: peopleEnabled,
    list: people,
    selectedIds: selectedPersonIds,
    toggle: togglePerson,
    sheetOpen: showPeopleSheet,
    setSheetOpen: setShowPeopleSheet,
  }), [
    peopleEnabled, people, selectedPersonIds, togglePerson, showPeopleSheet,
  ]);

  const foldersGroup = useMemo(() => ({
    tiles,
    open: openFolder,
    openBySlug: openFolderBySlug,
    rootIsFoldersOnly,
  }), [tiles, openFolder, openFolderBySlug, rootIsFoldersOnly]);

  const clientGroup = useMemo(() => ({
    isClient,
    visibleCount,
    totalCount,
    toggleVisibility: handleToggleVisibility,
    bulkVisibility: handleBulkVisibility,
    bulkVisibilityPending,
  }), [isClient, visibleCount, totalCount, handleToggleVisibility, handleBulkVisibility, bulkVisibilityPending]);

  const expiresAt = event.expires_at;
  const expiry = useMemo(() => ({ expiresAt }), [expiresAt]);

  const {
    allowDownloads, downloadChoices, downloadStandard,
    handleDownloadSelected, isDownloadingSelected, quota, offerFullPackage, quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds, downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker,
  } = downloads;

  return useMemo<GalleryController>(() => ({
    data, isLoading, error, refetch,
    photosQueryKey,
    event, slug,
    url, setSort, toggleDir, setView, setTab, openPhoto, closePhoto,
    visiblePhotos, scopedPhotos, counts,
    pickLimit, pickedTotal,
    feedbackSettings, identityMode,
    heroPhoto: staticHeroPhoto, heroLogoUrl, brandName,
    protection,
    showOriginalFilename,
    allowDownloads, downloadChoices, downloadStandard,
    selection,
    handleDownloadSelected, isDownloadingSelected,
    quota, offerFullPackage,
    quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds,
    downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker,
    people: peopleGroup,
    folders: foldersGroup,
    client: clientGroup,
    expiry,
    showLogout: showLogoutControl,
    logout,
    promoMarkdown, infoMarkdown,
  }), [
    data, isLoading, error, refetch, photosQueryKey, event, slug,
    url, setSort, toggleDir, setView, setTab, openPhoto, closePhoto,
    visiblePhotos, scopedPhotos, counts, pickLimit, pickedTotal, feedbackSettings, identityMode,
    staticHeroPhoto, heroLogoUrl, brandName, protection, showOriginalFilename,
    allowDownloads, downloadChoices, downloadStandard,
    selection, handleDownloadSelected, isDownloadingSelected, quota, offerFullPackage, quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds, downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker, peopleGroup, foldersGroup, clientGroup, expiry,
    showLogoutControl, logout, promoMarkdown, infoMarkdown,
  ]);
}
