/**
 * The bulk counterpart to `useDownloadPhoto.optimisticQuota.test.tsx`.
 *
 * Every "Download Selected" button calls `galleryService.downloadSelectedPhotos`
 * straight out, with no React Query mutation behind it, so the fix that made
 * the single-photo download update the badge never reached them: a client who
 * took five photos in one click kept seeing the old allowance and no "Already
 * downloaded" marks until they reloaded the page by hand. That is the reported
 * bug this covers.
 *
 * The server charges the ledger from `res.on('finish', …)`: after the
 * response the caller is awaiting, so the mock here answers every
 * `/download-quota` read with the PRE-download snapshot, standing in for a
 * charge that has not landed yet. The patched numbers have to survive that,
 * and nothing in this flow may refetch, or the stale read would overwrite
 * them one tick later.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services', () => ({
  galleryService: { downloadPhoto: vi.fn(), downloadSelectedPhotos: vi.fn() },
}));

vi.mock('../../services/downloadQuota.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/downloadQuota.service')>(
    '../../services/downloadQuota.service',
  );
  return { ...actual, downloadQuotaService: { getQuota: vi.fn(), createOrder: vi.fn() } };
});

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { downloadQuotaService } from '../../services/downloadQuota.service';
import { useDownloadQuota, useMarkPhotosDelivered } from '../useDownloadQuota';

const SLUG = 'wedding';

const staleResponse = {
  quota: {
    enabled: true, unlimited: false, freeLimit: 5, pricePerPhoto: 2,
    total: 5, used: 0, remaining: 5, enabledAt: '2026-09-19T00:00:00Z',
  },
  downloaded_photo_ids: [] as number[],
  packages: [],
  pending_order: null,
  currency: 'CHF',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useMarkPhotosDelivered: a bulk download updates the badge without a refetch', () => {
  it('charges every photo of the selection at once and keeps the value against a stale server', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(staleResponse as never);

    const { result } = renderHook(
      () => ({ quota: useDownloadQuota(SLUG), markDelivered: useMarkPhotosDelivered() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));
    expect(result.current.quota.quota?.remaining).toBe(5);

    act(() => result.current.markDelivered(SLUG, [75, 76, 77]));

    await waitFor(() => expect(result.current.quota.quota?.used).toBe(3));
    expect(result.current.quota.quota?.remaining).toBe(2);
    [75, 76, 77].forEach((id) => expect(result.current.quota.downloadedIds.has(id)).toBe(true));

    // Any refetch this triggered would resolve with the deliberately stale
    // snapshot and undo the patch. Give it every chance to land.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(downloadQuotaService.getQuota).toHaveBeenCalledTimes(1);
    expect(result.current.quota.quota?.used).toBe(3);
    expect(result.current.quota.quota?.remaining).toBe(2);
  });

  it('never double-charges a photo the client already has', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue({
      ...staleResponse,
      quota: { ...staleResponse.quota, used: 1, remaining: 4 },
      downloaded_photo_ids: [75],
    } as never);

    const { result } = renderHook(
      () => ({ quota: useDownloadQuota(SLUG), markDelivered: useMarkPhotosDelivered() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));

    // 75 is a re-download and is free; only 76 and 77 cost a slot.
    act(() => result.current.markDelivered(SLUG, [75, 76, 77]));

    await waitFor(() => expect(result.current.quota.quota?.used).toBe(3));
    expect(result.current.quota.quota?.remaining).toBe(2);
    expect(result.current.quota.downloadedIds.size).toBe(3);
  });

  it('leaves the cache alone on a gallery with the allowance switched off', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue({
      ...staleResponse,
      quota: { ...staleResponse.quota, enabled: false },
    } as never);

    const { result } = renderHook(
      () => ({ quota: useDownloadQuota(SLUG), markDelivered: useMarkPhotosDelivered() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));

    act(() => result.current.markDelivered(SLUG, [75, 76]));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.quota.quota?.used).toBe(0);
    expect(result.current.quota.downloadedIds.size).toBe(0);
  });
});
