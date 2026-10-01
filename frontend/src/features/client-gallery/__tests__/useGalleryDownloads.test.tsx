import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGalleryDownloads } from '../state/useGalleryDownloads';
import type { GalleryDownloadsInput } from '../state/useGalleryDownloads';
import type { GalleryData, Photo } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
const toastError = vi.fn();
vi.mock('react-toastify', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

// The "download all" mutation, with the options it was last called with.
const mutate = vi.fn();
vi.mock('../../../hooks/useGallery', () => ({ useDownloadAllPhotos: () => ({ mutate, isPending: false }) }));
const refreshDownloadQuota = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useDownloadQuota: () => ({ quota: null, downloadedIds: new Set(), packages: [], pendingOrder: null, currency: 'EUR', refetch: vi.fn() }),
  useRefreshDownloadQuota: () => refreshDownloadQuota,
}));
const downloadPhoto = vi.fn();
const downloadSelectedPhotos = vi.fn();
vi.mock('../../../services/gallery.service', () => ({
  galleryService: {
    downloadPhoto: (...a: unknown[]) => downloadPhoto(...a),
    downloadSelectedPhotos: (...a: unknown[]) => downloadSelectedPhotos(...a),
  },
}));
vi.mock('../../../services/analytics.service', () => ({ analyticsService: { trackGalleryEvent: vi.fn() } }));

const photos = [1, 2, 3].map((id) => ({ id, filename: `p${id}.jpg` })) as Photo[];
const folder = { id: 9, name: 'Ceremony', slug: 'c', is_global: false, is_folder: true };

function input(patch: Partial<GalleryDownloadsInput> = {}): GalleryDownloadsInput {
  return {
    slug: 's',
    data: { event: { allow_downloads: true }, photos } as unknown as GalleryData,
    isClient: false, isExpired: false, filteredPhotos: photos, scopedPhotos: photos, openFolder: null,
    selectedPhotos: new Set([1, 2]), setSelectedPhotos: vi.fn(), setIsSelectionMode: vi.fn(),
    selectedPersonIds: [],
    ...patch,
  };
}

beforeEach(() => {
  mutate.mockReset();
  refreshDownloadQuota.mockReset();
  downloadPhoto.mockReset();
  downloadSelectedPhotos.mockReset();
  toastError.mockReset();
});

it('re-reads the allowance once "download all" has gone through', () => {
  const { result } = renderHook(() => useGalleryDownloads(input()));
  act(() => result.current.handleDownloadAll());
  const options = mutate.mock.lastCall![1] as { onSuccess?: () => void };
  expect(refreshDownloadQuota).not.toHaveBeenCalled();
  options.onSuccess?.();
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
});

it('reports a failed selected download instead of rejecting, and keeps the selection', async () => {
  downloadPhoto.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));
  const setSelectedPhotos = vi.fn();
  const { result } = renderHook(() => useGalleryDownloads(input({ setSelectedPhotos })));
  await act(async () => { await expect(result.current.handleDownloadSelected()).resolves.toBeUndefined(); });
  expect(toastError).toHaveBeenCalledWith('Some photos failed to download');
  // The first photo did go out and claimed its slot.
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  expect(setSelectedPhotos).not.toHaveBeenCalled();
});

it('reports a failed folder or people download instead of rejecting', async () => {
  downloadSelectedPhotos.mockRejectedValue(new Error('network'));
  const { result } = renderHook(() => useGalleryDownloads(input({ openFolder: folder, selectedPersonIds: [4] })));
  await act(async () => { await expect(result.current.handleDownloadFolder()).resolves.toBeUndefined(); });
  await act(async () => { await expect(result.current.handleDownloadPeopleFiltered()).resolves.toBeUndefined(); });
  expect(toastError).toHaveBeenCalledTimes(2);
});
