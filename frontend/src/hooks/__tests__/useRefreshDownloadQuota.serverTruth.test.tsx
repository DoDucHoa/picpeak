/**
 * The gallery does no allowance arithmetic of its own any more.
 *
 * It used to. The server charged the ledger from `res.on('finish', …)`, after
 * the response the caller was awaiting had already been sent, so a refetch
 * fired on success routinely read the allowance BEFORE it was charged and the
 * badge went stale. The workaround was to patch the cache client-side with the
 * numbers the browser predicted.
 *
 * The slot is now claimed before the first byte is sent, so by the time any
 * download resolves the ledger already reflects it and a plain refetch reads
 * the truth. That removes the prediction, and with it every way for a tampered
 * client to talk the counter into a number the server never agreed to.
 *
 * These tests fail if anyone reintroduces the patch: they answer the second
 * read with numbers no client-side prediction would produce.
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
import { useDownloadQuota, useRefreshDownloadQuota } from '../useDownloadQuota';

const SLUG = 'wedding';

const baseResponse = {
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

describe('useRefreshDownloadQuota', () => {
  it('shows the allowance the server reports after a delivery, not one it worked out', async () => {
    vi.mocked(downloadQuotaService.getQuota)
      .mockResolvedValueOnce(baseResponse as never)
      // The server charged three photos AND the photographer granted two more
      // slots in between. No client-side prediction from "three delivered"
      // could arrive at these numbers, which is the point.
      .mockResolvedValueOnce({
        ...baseResponse,
        quota: { ...baseResponse.quota, total: 7, used: 3, remaining: 4 },
        downloaded_photo_ids: [75, 76, 77],
      } as never);

    const { result } = renderHook(
      () => ({ quota: useDownloadQuota(SLUG), refresh: useRefreshDownloadQuota() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));
    expect(result.current.quota.quota?.remaining).toBe(5);

    act(() => result.current.refresh(SLUG));

    await waitFor(() => expect(result.current.quota.quota?.used).toBe(3));
    expect(result.current.quota.quota?.total).toBe(7);
    expect(result.current.quota.quota?.remaining).toBe(4);
    [75, 76, 77].forEach((id) => expect(result.current.quota.downloadedIds.has(id)).toBe(true));
  });

  it('leaves the counters untouched when the server says nothing was charged', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(baseResponse as never);

    const { result } = renderHook(
      () => ({ quota: useDownloadQuota(SLUG), refresh: useRefreshDownloadQuota() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.quota.isLoading).toBe(false));

    act(() => result.current.refresh(SLUG));
    await waitFor(() => expect(downloadQuotaService.getQuota).toHaveBeenCalledTimes(2));

    expect(result.current.quota.quota?.used).toBe(0);
    expect(result.current.quota.downloadedIds.size).toBe(0);
  });
});
