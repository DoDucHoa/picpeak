import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGalleryDownloads } from '../state/useGalleryDownloads';
import type { GalleryDownloadsInput } from '../state/useGalleryDownloads';
import type { GalleryData, Photo } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
const toastError = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();
vi.mock('react-toastify', () => ({
  toast: {
    error: (m: string) => toastError(m),
    info: (m: unknown) => toastInfo(m),
    success: (m: string) => toastSuccess(m),
  },
}));

const refreshDownloadQuota = vi.fn();
const refetchDownloadQuota = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useDownloadQuota: () => ({
    quota: null, downloadedIds: new Set(), packages: [], pendingOrder: null, currency: 'EUR',
    refetch: refetchDownloadQuota,
  }),
  useRefreshDownloadQuota: () => refreshDownloadQuota,
}));
const downloadPhoto = vi.fn();
const planDownloadBundle = vi.fn();
const probeBundlePart = vi.fn();
const triggerDirectDownload = vi.fn();
vi.mock('../../../services/gallery.service', () => ({
  galleryService: {
    downloadPhoto: (...a: unknown[]) => downloadPhoto(...a),
    planDownloadBundle: (...a: unknown[]) => planDownloadBundle(...a),
    probeBundlePart: (...a: unknown[]) => probeBundlePart(...a),
    triggerDirectDownload: (...a: unknown[]) => triggerDirectDownload(...a),
    bundlePartUrl: (slug: string, token: string) => `/api/gallery/${slug}/download-bundles/${token}`,
  },
}));
vi.mock('../../../services/analytics.service', () => ({ analyticsService: { trackGalleryEvent: vi.fn() } }));

const photos = [1, 2, 3].map((id) => ({ id, filename: `p${id}.jpg` })) as Photo[];

function input(patch: Partial<GalleryDownloadsInput> = {}): GalleryDownloadsInput {
  return {
    slug: 's',
    data: { event: { allow_downloads: true }, photos } as unknown as GalleryData,
    isClient: false, isExpired: false,
    selectedPhotos: new Set([1, 2]), setSelectedPhotos: vi.fn(), setIsSelectionMode: vi.fn(),
    ...patch,
  };
}

const part = (token: string) => ({ token, photo_count: 1, size_bytes: 1 });

beforeEach(() => {
  // A multi-part bundle leaves a one-off focus listener behind; spend it here.
  window.dispatchEvent(new Event('focus'));
  vi.useFakeTimers();
  [refreshDownloadQuota, refetchDownloadQuota, downloadPhoto, planDownloadBundle, probeBundlePart,
    triggerDirectDownload, toastError, toastInfo, toastSuccess].forEach((fn) => fn.mockReset());
  probeBundlePart.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

// Run a handler to the end, timers included: parts are spaced out in time.
async function settle(run: () => Promise<void>) {
  await act(async () => {
    const done = run();
    await vi.runAllTimersAsync();
    await done;
  });
}

it('downloads a single selected photo as a plain file', async () => {
  downloadPhoto.mockResolvedValue(undefined);
  const setSelectedPhotos = vi.fn();
  const { result } = renderHook(() => useGalleryDownloads(input({ selectedPhotos: new Set([2]), setSelectedPhotos })));
  await settle(() => result.current.handleDownloadSelected());
  expect(downloadPhoto).toHaveBeenCalledWith('s', 2, 'p2.jpg');
  expect(planDownloadBundle).not.toHaveBeenCalled();
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  expect(setSelectedPhotos).toHaveBeenCalledWith(new Set());
});

it('downloads two or more photos as bundle parts, probing each before handing it over', async () => {
  planDownloadBundle.mockResolvedValue([part('a'), part('b'), part('c')]);
  const { result } = renderHook(() => useGalleryDownloads(input({ selectedPhotos: new Set([1, 2, 3]) })));
  await settle(() => result.current.handleDownloadSelected());
  expect(planDownloadBundle).toHaveBeenCalledWith('s', [1, 2, 3], undefined);
  expect(probeBundlePart.mock.calls.map((c) => c[1])).toEqual(['a', 'b', 'c']);
  expect(triggerDirectDownload.mock.calls).toEqual([
    ['/api/gallery/s/download-bundles/a', 's-selected-part1of3.zip'],
    ['/api/gallery/s/download-bundles/b', 's-selected-part2of3.zip'],
    ['/api/gallery/s/download-bundles/c', 's-selected-part3of3.zip'],
  ]);
  // Every part is also offered as a button, for a browser that blocks the rest.
  expect(toastInfo).toHaveBeenCalledTimes(1);
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  expect(result.current.isDownloadingSelected).toBe(false);
});

it('names a one-part bundle without a part suffix and shows no parts toast', async () => {
  planDownloadBundle.mockResolvedValue([part('a')]);
  const { result } = renderHook(() => useGalleryDownloads(input()));
  await settle(() => result.current.handleDownloadSelected());
  expect(triggerDirectDownload).toHaveBeenCalledWith('/api/gallery/s/download-bundles/a', 's-selected.zip');
  expect(toastInfo).not.toHaveBeenCalled();
});

it('opens the offer when a part is refused at its probe, and hands nothing more over', async () => {
  planDownloadBundle.mockResolvedValue([part('a'), part('b')]);
  probeBundlePart.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ response: { status: 402 } });
  const setSelectedPhotos = vi.fn();
  const { result } = renderHook(() => useGalleryDownloads(input({ setSelectedPhotos })));
  await settle(() => result.current.handleDownloadSelected());
  expect(triggerDirectDownload).toHaveBeenCalledTimes(1);
  expect(result.current.quotaOffer).toEqual({ exceeded: null });
  expect(refetchDownloadQuota).toHaveBeenCalled();
  expect(setSelectedPhotos).not.toHaveBeenCalled();
});

it('reports a failed selected download instead of rejecting, and keeps the selection', async () => {
  planDownloadBundle.mockRejectedValue(new Error('network'));
  const setSelectedPhotos = vi.fn();
  const { result } = renderHook(() => useGalleryDownloads(input({ setSelectedPhotos })));
  await settle(async () => { await expect(result.current.handleDownloadSelected()).resolves.toBeUndefined(); });
  expect(toastError).toHaveBeenCalledWith('Some photos failed to download');
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  expect(setSelectedPhotos).not.toHaveBeenCalled();
});

it('ignores a second press while the first is still being prepared', async () => {
  let release: (parts: unknown[]) => void = () => {};
  planDownloadBundle.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const { result } = renderHook(() => useGalleryDownloads(input()));
  let first: Promise<void> = Promise.resolve();
  act(() => { first = result.current.handleDownloadSelected(); });
  expect(result.current.isDownloadingSelected).toBe(true);
  await act(async () => { await result.current.handleDownloadSelected(); });
  expect(planDownloadBundle).toHaveBeenCalledTimes(1);
  await settle(async () => { release([part('a')]); await first; });
});

it('hands a selection to the size picker, which downloads it at the chosen size', async () => {
  planDownloadBundle.mockResolvedValue([part('a')]);
  const data = {
    event: { allow_downloads: true, download_resolution: { picker_enabled: true, choices: [{ id: 'original' }, { id: '2048' }] } },
    photos,
  } as unknown as GalleryData;
  const { result } = renderHook(() => useGalleryDownloads(input({ data })));
  await settle(() => result.current.handleDownloadSelected());
  expect(planDownloadBundle).not.toHaveBeenCalled();
  expect(result.current.resolutionPicker).toMatchObject({ open: true, ids: [1, 2] });
  await settle(() => result.current.resolutionPicker.downloadSelection('2048'));
  expect(planDownloadBundle).toHaveBeenCalledWith('s', [1, 2], '2048');
});

it('re-reads the allowance and keeps the handed-over links when a later part fails', async () => {
  planDownloadBundle.mockResolvedValue([part('a'), part('b'), part('c')]);
  probeBundlePart.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ response: { status: 503 } });
  const { result } = renderHook(() => useGalleryDownloads(input({ selectedPhotos: new Set([1, 2, 3]) })));
  await settle(() => result.current.handleDownloadSelected());
  expect(triggerDirectDownload).toHaveBeenCalledTimes(1);
  // Part a went out and claimed its slots, so the badge must move.
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  expect(toastInfo).toHaveBeenCalledTimes(1);
  expect(toastError).toHaveBeenCalledWith('Some photos failed to download');
});

it('re-reads the allowance when the guest comes back to the tab after a multi-part bundle', async () => {
  planDownloadBundle.mockResolvedValue([part('a'), part('b')]);
  const { result } = renderHook(() => useGalleryDownloads(input()));
  await settle(() => result.current.handleDownloadSelected());
  refreshDownloadQuota.mockClear();
  window.dispatchEvent(new Event('focus'));
  expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  window.dispatchEvent(new Event('focus'));
  expect(refreshDownloadQuota).toHaveBeenCalledTimes(1);
});

it('plans only one bundle for two presses in the same tick', async () => {
  planDownloadBundle.mockResolvedValue([part('a')]);
  const { result } = renderHook(() => useGalleryDownloads(input()));
  await settle(async () => {
    await Promise.all([result.current.handleDownloadSelected(), result.current.handleDownloadSelected()]);
  });
  expect(planDownloadBundle).toHaveBeenCalledTimes(1);
});

it('stops handing parts over once the size picker is closed, and keeps the selection', async () => {
  planDownloadBundle.mockResolvedValue([part('a'), part('b'), part('c')]);
  const setSelectedPhotos = vi.fn();
  const data = {
    event: { allow_downloads: true, download_resolution: { picker_enabled: true, choices: [{ id: 'original' }, { id: '2048' }] } },
    photos,
  } as unknown as GalleryData;
  const { result } = renderHook(() => useGalleryDownloads(input({ data, setSelectedPhotos })));
  await settle(() => result.current.handleDownloadSelected());
  let running: Promise<void> = Promise.resolve();
  await act(async () => {
    running = result.current.resolutionPicker.downloadSelection('2048');
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(triggerDirectDownload).toHaveBeenCalledTimes(1);
  act(() => result.current.resolutionPicker.close());
  await settle(() => running);
  expect(triggerDirectDownload).toHaveBeenCalledTimes(1);
  expect(setSelectedPhotos).not.toHaveBeenCalled();
});
