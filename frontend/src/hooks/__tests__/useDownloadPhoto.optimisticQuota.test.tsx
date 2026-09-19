/**
 * The server only charges the download-quota ledger from inside
 * `res.on('finish', …)`: fire-and-forget, not awaited by the response the
 * client receives (backend/src/routes/gallery/downloads.js). A caller that
 * reacts to a successful download by simply re-fetching `/download-quota`
 * can therefore read the allowance BEFORE the charge lands, which is the
 * "badge and 'already downloaded' mark only update after a manual reload"
 * bug this test guards against.
 *
 * useGallery.ts fixes the read side with an optimistic `setQueryData` and
 * deliberately triggers NO refetch of its own: a first version of this fix
 * called `invalidateQueries` right after, "to reconcile things the patch
 * can't predict", and that follow-up refetch resolved with the SAME stale
 * snapshot the ledger write hadn't caught up to yet, silently overwriting
 * the correct optimistic value with the wrong one, one tick later. This
 * test forces that worst case (the mock never reflects the download, at
 * all) and requires the optimistic value to survive it, with exactly one
 * `getQuota` call total (the initial load) proving nothing here refetches.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services', () => ({
  galleryService: { downloadPhoto: vi.fn() },
}));

vi.mock('../../services/downloadQuota.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/downloadQuota.service')>(
    '../../services/downloadQuota.service',
  );
  return { ...actual, downloadQuotaService: { getQuota: vi.fn(), createOrder: vi.fn() } };
});

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { galleryService } from '../../services';
import { downloadQuotaService } from '../../services/downloadQuota.service';
import { useDownloadQuota } from '../useDownloadQuota';
import { useDownloadPhoto } from '../useGallery';

const SLUG = 'wedding';

const staleResponse = {
  quota: {
    enabled: true, unlimited: false, freeLimit: 2, pricePerPhoto: 2,
    total: 2, used: 0, remaining: 2, enabledAt: '2026-09-19T00:00:00Z',
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

describe('useDownloadPhoto: quota cache stays correct even when the server has not caught up yet', () => {
  it('keeps the optimistic used/remaining and delivered mark after a successful download, despite a stale refetch', async () => {
    // Every /download-quota read, including the invalidateQueries refetch,
    // returns the pre-download snapshot. Stands in for the ledger write
    // never landing in time for the very next read.
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(staleResponse as never);
    vi.mocked(galleryService.downloadPhoto).mockResolvedValue(undefined as never);

    const { result } = renderHook(
      () => ({
        quota: useDownloadQuota(SLUG),
        download: useDownloadPhoto(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));
    expect(result.current.quota.quota?.remaining).toBe(2);

    await act(async () => {
      await result.current.download.mutateAsync({ slug: SLUG, photoId: 42, filename: 'a.jpg' });
    });

    await waitFor(() => expect(result.current.quota.quota?.used).toBe(1));
    expect(result.current.quota.quota?.remaining).toBe(1);
    expect(result.current.quota.downloadedIds.has(42)).toBe(true);

    // Give any refetch this success might have triggered every chance to
    // land and overwrite the cache with the (deliberately stale) mocked
    // response. There must not be one: a single load-time call is all
    // `getQuota` should ever see from this flow.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(downloadQuotaService.getQuota).toHaveBeenCalledTimes(1);
    expect(result.current.quota.quota?.used).toBe(1);
    expect(result.current.quota.quota?.remaining).toBe(1);
    expect(result.current.quota.downloadedIds.has(42)).toBe(true);
  });
});
