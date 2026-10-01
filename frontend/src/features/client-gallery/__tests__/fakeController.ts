import { vi } from 'vitest';
import type { GalleryController } from '../state/useGalleryController';

/**
 * A complete, inert GalleryController for component tests: every function is
 * a vi.fn(), every collection is empty, and the numbers match the reference
 * gallery (205 photos, 9 picked, a pick limit of 205).
 *
 * Overrides are merged at the top level only: passing `feedbackSettings` or
 * `selection` replaces that whole group, so spell out every field it needs.
 */
export function fakeController(overrides: Partial<GalleryController> = {}): GalleryController {
  const base: GalleryController = {
    data: undefined, isLoading: false, error: null, refetch: vi.fn(),
    photosQueryKey: ['gallery-photos', 's', 'all', 'guest'],
    event: {
      id: 1, event_name: 'Summer Wedding', event_type: 'wedding', event_date: null, expires_at: null,
    },
    slug: 's',
    url: { sort: 'capture_date', dir: 'desc', view: 'grid', tab: 'all', photo: null },
    setSort: vi.fn(), toggleDir: vi.fn(), setView: vi.fn(), setTab: vi.fn(),
    openPhoto: vi.fn(), closePhoto: vi.fn(),
    visiblePhotos: [], scopedPhotos: [], counts: { all: 205, liked: 0, picked: 9 },
    pickLimit: 205,
    feedbackSettings: { feedback_enabled: true, allow_likes: true, allow_favorites: true },
    identityMode: 'simple',
    heroPhoto: null, heroLogoUrl: null, brandName: '',
    protection: { level: 'standard', disableRightClick: false, devtools: false, canvas: false },
    showOriginalFilename: false,
    allowDownloads: true, downloadChoices: [], downloadStandard: undefined,
    isDownloadingAll: false, handleDownloadAll: vi.fn(),
    selection: { active: false, setActive: vi.fn(), ids: new Set<number>(), setIds: vi.fn() },
    handleDownloadSelected: vi.fn(async () => {}),
    quota: null, offerFullPackage: false,
    quotaOffer: null, setQuotaOffer: vi.fn(),
    downloadGate: {
      quotaEnabled: false, isClient: false, remaining: null, downloadedIds: new Set<number>(),
      openQuotaOffer: vi.fn(), offerForBlockedDownload: vi.fn(), notifyGuestBlocked: vi.fn(),
      reportDownloadFailure: vi.fn(async () => false),
    },
    deliveredPhotoIds: new Set<number>(),
    downloadPackages: [], downloadCurrency: 'EUR', pendingDownloadOrder: null,
    resolutionPicker: { open: false, ids: null, close: vi.fn() },
    people: {
      enabled: false, list: [], selectedIds: [], toggle: vi.fn(),
      matchAny: false, setMatchAny: vi.fn(), clear: vi.fn(),
      downloadableIds: [], downloadFiltered: vi.fn(async () => {}),
      sheetOpen: false, setSheetOpen: vi.fn(), scan: undefined,
    },
    folders: {
      tiles: [], open: null, openBySlug: vi.fn(),
      downloadIds: [], downloadTotal: 0, downloadCapped: false, downloadFolder: vi.fn(async () => {}),
      rootIsFoldersOnly: false,
    },
    client: {
      isClient: false, visibleCount: 0, totalCount: 0,
      toggleVisibility: vi.fn(async () => {}), bulkVisibility: vi.fn(async () => {}),
    },
    expiry: { expiresAt: null, daysLeft: null },
    showLogout: false, logout: vi.fn(),
    promoMarkdown: null, infoMarkdown: null,
  };
  return { ...base, ...overrides };
}
